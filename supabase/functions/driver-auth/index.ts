// ═══════════════════════════════════════════════════════════════════════════
// driver-auth — Driver ID + 4-digit code → a real Supabase session (F1)
//
// Supabase Auth has no "identifier + PIN" provider, so FR-1 cannot be met by a
// built-in flow. This is the whole of the custom part: it verifies the code,
// then hands the driver a normal session so that RLS applies to them like
// anyone else.
//
// The session is minted with admin.generateLink + verifyOtp rather than a
// password. That means there is no second secret to store, derive or rotate —
// the code is the only credential, and it lives here as a hash and nowhere else.
//
// Two actions:
//   signin     — public. Driver ID + code → session.
//   regenerate — operator JWT required. Mints a new code, ends open sessions.
//                Also provisions the auth.users row on first use, so "give a
//                driver a login" and "reset their code" are one button.
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

// FR-5. Chosen to blunt the 10,000-value keyspace without stranding a driver
// who fat-fingers a code at 5am.
const MAX_ATTEMPTS = 5
const LOCK_MINUTES = 15

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

// ── PIN hashing ────────────────────────────────────────────────────────────
// PBKDF2 via Web Crypto rather than a bcrypt dependency: it is in the runtime,
// and against a 4-digit keyspace the work factor is what matters, not the KDF.

const ITERATIONS = 100_000
const b64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)))
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0))

async function derive(pin: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: ITERATIONS },
    key,
    256,
  )
  return b64(bits)
}

async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return `pbkdf2$${ITERATIONS}$${b64(salt.buffer)}$${await derive(pin, salt)}`
}

async function verifyPin(pin: string, stored: string | null): Promise<boolean> {
  if (!stored) return false
  const [scheme, , salt, hash] = stored.split('$')
  if (scheme !== 'pbkdf2') return false
  const got = await derive(pin, unb64(salt))
  // Constant time — the comparison leaks nothing about how close a guess was.
  if (got.length !== hash.length) return false
  let diff = 0
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ hash.charCodeAt(i)
  return diff === 0
}

// ── Session minting ────────────────────────────────────────────────────────

const driverEmail = (driverId: string) => `${driverId.toLowerCase()}@driver.bluestar.app`

/** Create the auth.users row for a driver if they don't have one yet. */
async function ensureAuthUser(driver: { id: number; driver_id: string; auth_user_id: string | null }) {
  if (driver.auth_user_id) return driver.auth_user_id

  const email = driverEmail(driver.driver_id)
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    // No company_members row is created anywhere — that is deliberate, and is
    // what makes every existing company-scoped policy return zero rows to a
    // driver. See migration 025.
    app_metadata: { role: 'driver', driver_id: driver.driver_id },
  })
  if (error || !data.user) throw new Error(`createUser: ${error?.message ?? 'no user'}`)

  const { error: linkErr } = await admin
    .from('drivers')
    .update({ auth_user_id: data.user.id })
    .eq('id', driver.id)
  if (linkErr) throw new Error(`link: ${linkErr.message}`)

  return data.user.id
}

async function mintSession(email: string) {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (error || !data.properties) throw new Error(`generateLink: ${error?.message ?? 'no link'}`)

  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
  const { data: verified, error: vErr } = await anon.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: 'email',
  })
  if (vErr || !verified.session) throw new Error(`verifyOtp: ${vErr?.message ?? 'no session'}`)
  return verified.session
}

// ── signin ─────────────────────────────────────────────────────────────────

async function signin(body: { login?: string; driver_id?: string; code?: string }) {
  const login = (body.login ?? body.driver_id ?? '').trim()
  const code = (body.code ?? '').trim()
  if (!login || !/^\d{4}$/.test(code)) {
    return json({ error: 'wrong_code', message: 'Enter your Driver ID or phone number, and your 4-digit code.' }, 400)
  }

  // Driver ID or phone. Normalisation and the last-10-digit match live in
  // driver_by_login — `phone` is free text and holds every shape of number.
  type Match = {
    id: number; driver_id: string; status: string; pin_hash: string | null
    auth_user_id: string | null; pin_attempts: number
    pin_locked_until: string | null; by_id: boolean
  }
  const { data } = await admin.rpc('driver_by_login', { p_login: login })

  // Only drivers who have actually been given a code can be signed in, so
  // narrow to those BEFORE judging ambiguity. Two drivers sharing a phone
  // where only one has a login is not ambiguous — it has one answer.
  const candidates = ((data ?? []) as Match[]).filter(m => m.pin_hash)
  const byId = candidates.find(m => m.by_id)
  const driver = byId ?? candidates[0]

  // FR-4 — each failure says something different and useful.
  if (!driver) {
    return json({ error: 'unknown_id', message: "We don't recognise that Driver ID or number. Check it with your operator." }, 404)
  }
  // `phone` carries no unique constraint, so two drivers can share a number.
  // When two of them both have logins, refuse rather than pick one — signing
  // the wrong driver in would put one driver's duties, and their odometer
  // readings, on another driver's phone. A Driver ID match is unique and wins.
  if (!byId && candidates.length > 1) {
    return json({
      error: 'ambiguous',
      message: 'That number belongs to more than one driver. Sign in with your Driver ID instead.',
    }, 409)
  }
  if (driver.status !== 'Active') {
    return json({ error: 'inactive', message: 'This driver account is not active. Call your operator.' }, 403)
  }
  if (driver.pin_locked_until && new Date(driver.pin_locked_until) > new Date()) {
    const mins = Math.ceil((new Date(driver.pin_locked_until).getTime() - Date.now()) / 60000)
    return json({ error: 'locked', retry_in_minutes: mins, message: `Too many wrong codes. Try again in ${mins} min.` }, 429)
  }

  if (!(await verifyPin(code, driver.pin_hash))) {
    const attempts = (driver.pin_attempts ?? 0) + 1
    const locked = attempts >= MAX_ATTEMPTS
    await admin
      .from('drivers')
      .update({
        pin_attempts: locked ? 0 : attempts,
        pin_locked_until: locked ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null,
      })
      .eq('id', driver.id)

    return locked
      ? json({ error: 'locked', retry_in_minutes: LOCK_MINUTES, message: `Too many wrong codes. Try again in ${LOCK_MINUTES} min.` }, 429)
      : json({ error: 'wrong_code', attempts_left: MAX_ATTEMPTS - attempts, message: 'That code is wrong. Check it with your operator.' }, 401)
  }

  await ensureAuthUser(driver)
  await admin.from('drivers').update({ pin_attempts: 0, pin_locked_until: null }).eq('id', driver.id)

  const session = await mintSession(driverEmail(driver.driver_id))
  return json({ session })
}

// ── regenerate ─────────────────────────────────────────────────────────────
// FR-6. The plaintext code is returned exactly once; it is never recoverable
// afterwards, which is why the operator shares it out of band immediately.

async function regenerate(req: Request, body: { driver_row_id?: number }) {
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'unauthorised' }, 401)

  // The caller's own JWT, so the existing `company scoped` policy on drivers
  // decides whether they may touch this row. No company check is written here.
  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })
  const { data: visible } = await caller
    .from('drivers')
    .select('id, driver_id, auth_user_id')
    .eq('id', body.driver_row_id ?? -1)
    .maybeSingle()
  if (!visible) return json({ error: 'not_found' }, 404)

  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 10000).padStart(4, '0')

  const userId = await ensureAuthUser({ ...visible, auth_user_id: visible.auth_user_id })
  const { error } = await admin
    .from('drivers')
    .update({ pin_hash: await hashPin(code), pin_set_at: new Date().toISOString(), pin_attempts: 0, pin_locked_until: null })
    .eq('id', visible.id)
  if (error) return json({ error: 'update_failed', message: error.message }, 500)

  // The old code stops working above; this ends sessions already open on it.
  // auth.admin.signOut() takes a JWT, and we don't have the driver's — so this
  // goes at GoTrue's by-user-id endpoint directly.
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}/sessions`, {
    method: 'DELETE',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  })

  return json({ code })
}

// ── entry ──────────────────────────────────────────────────────────────────

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  try {
    const body = await req.json()
    switch (body.action) {
      case 'signin':
        return await signin(body)
      case 'regenerate':
        return await regenerate(req, body)
      default:
        return json({ error: 'unknown_action' }, 400)
    }
  } catch (e) {
    console.error('[driver-auth]', e instanceof Error ? e.message : e)
    return json({ error: 'server_error' }, 500)
  }
})
