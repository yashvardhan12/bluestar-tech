import { createContext, useContext, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export interface Profile {
  id: string
  firstName: string
  lastName: string
  email: string
  jobTitle: string
  role: 'Owner' | 'Admin'
  activeCompanyId: number | null
}

interface AuthValue {
  session: Session | null
  profile: Profile | null
  loading: boolean
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

// Loads the row matching the signed-in user — NOT `.order('id').limit(1)`,
// which returned the same profile to everyone and would now mean every user
// sharing one active_company_id.
async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, email, job_title, role, active_company_id')
    .eq('id', userId)
    .maybeSingle()

  if (error) { console.error('[auth] profile load failed:', error.message); return null }
  if (!data) return null

  return {
    id:              data.id,
    firstName:       data.first_name,
    lastName:        data.last_name,
    email:           data.email,
    jobTitle:        data.job_title,
    role:            data.role,
    activeCompanyId: data.active_company_id,
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true

    // ponytail: the loading gate is bounded by a timer, not by racing
    // getSession(). Two separate facts force this:
    //
    //  - getSession() awaits initializePromise before it ever reaches the auth
    //    lock (GoTrueClient.js:1265). The 5s lockAcquireTimeout bounds
    //    *acquiring* the lock, not the token-refresh fetch that runs inside it,
    //    and supabase-js issues that fetch with no timeout. A stalled refresh
    //    pins the app on <Loading/> until the browser's own network timeout
    //    (~5 min) fires. So something here must bound it.
    //
    //  - The previous Promise.race bounded it but discarded the result: when
    //    the timer won, .then never ran, so a session resolving a moment later
    //    was thrown away and a signed-in user rendered as logged out.
    //
    // A bare timer does both — releases the screen at 5s, and still applies the
    // session whenever getSession() actually lands.
    const unblock = setTimeout(() => { if (alive) setLoading(false) }, 5000)

    supabase.auth.getSession()
      .then(async ({ data }) => {
        if (!alive) return
        setSession(data.session)
        if (data.session) setProfile(await loadProfile(data.session.user.id))
      })
      .catch(err => console.error('[auth] session bootstrap failed:', err))
      .finally(() => { if (alive) { clearTimeout(unblock); setLoading(false) } })

    // ponytail: callback runs INSIDE the auth lock. Awaiting any supabase call
    // here deadlocks the sign-in that emitted the event. Keep it sync; kick the
    // profile query out to a task so it runs after the lock is released.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!alive) return
      setSession(next)
      setTimeout(async () => {
        const p = next ? await loadProfile(next.user.id) : null
        if (alive) setProfile(p)
      }, 0)
    })

    return () => { alive = false; clearTimeout(unblock); sub.subscription.unsubscribe() }
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    setProfile(null)
  }

  async function refreshProfile() {
    if (session) setProfile(await loadProfile(session.user.id))
  }

  return (
    <AuthContext.Provider value={{ session, profile, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
