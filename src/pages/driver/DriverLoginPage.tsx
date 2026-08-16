import { useState, useRef } from 'react'
import { AlertCircle } from 'lucide-react'
import { driverSignIn } from '../../lib/driver'

/**
 * F1. Two fields, no password, no signup.
 *
 * FR-2 is a copy requirement and it is load-bearing: nothing is sent when this
 * screen loads, so it must never read like an OTP screen. A driver who waits
 * for an SMS that is never coming calls the office.
 */

const CELL =
  'size-14 text-center text-2xl font-semibold tabular-nums rounded-xl border ' +
  'border-gray-300 text-gray-900 bg-white focus:outline-none focus:ring-2 ' +
  'focus:ring-violet-600 focus:border-violet-600'

/**
 * Four boxes rather than one field: a 4-digit code is easier to check at a
 * glance than to read back out of a single input, one-handed, in sunlight.
 *
 * `onComplete` is handed the finished code rather than reading it back off
 * state — the setState from the fourth digit has not committed yet when it
 * fires, so a closure over `digits` would submit three of the four.
 */
function CodeInput({ digits, onChange, onComplete }: {
  digits: string[]
  onChange: (d: string[]) => void
  onComplete: (code: string) => void
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([])

  function setDigit(i: number, d: string) {
    const next = digits.slice()
    next[i] = d
    onChange(next)
    if (d && i < 3) refs.current[i + 1]?.focus()
    if (d && next.every(Boolean)) onComplete(next.join(''))
  }

  return (
    <div className="flex gap-3 justify-center" role="group" aria-label="4-digit code">
      {[0, 1, 2, 3].map(i => (
        <input
          key={i}
          ref={el => { refs.current[i] = el }}
          value={digits[i]}
          onChange={e => setDigit(i, e.target.value.replace(/\D/g, '').slice(-1))}
          onKeyDown={e => {
            if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus()
          }}
          onPaste={e => {
            const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4)
            if (pasted.length === 4) {
              e.preventDefault()
              onChange(pasted.split(''))
              onComplete(pasted)
            }
          }}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          aria-label={`Digit ${i + 1}`}
          className={CELL}
        />
      ))}
    </div>
  )
}

export default function DriverLoginPage() {
  const [driverId, setDriverId] = useState('')
  const [digits, setDigits] = useState(['', '', '', ''])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(code = digits.join('')) {
    if (busy || !driverId.trim() || code.length !== 4) return
    setBusy(true)
    setError('')

    const result = await driverSignIn(driverId.trim(), code)
    setBusy(false)

    if (!result.ok) {
      // FR-4 — the message differs by cause. Wrong ID and wrong code send the
      // driver to different places, so telling them apart is worth more than
      // the enumeration it costs against a code the operator gave them anyway.
      setError(result.message ?? 'Could not sign in.')
      setDigits(['', '', '', ''])
      return
    }
    // The session lands in AuthProvider via onAuthStateChange; the router
    // swaps the shell from underneath us. Nothing to navigate to.
  }

  return (
    <div className="min-h-dvh bg-gray-50 flex flex-col justify-center px-6 py-10">
      <div className="w-full max-w-sm mx-auto">

        <div className="flex items-center gap-2.5 mb-8">
          <img src="/logo.svg" alt="" className="size-9" />
          <span className="text-xl font-semibold tracking-tight text-gray-900">Bluestar</span>
        </div>

        <h1 className="text-2xl font-semibold text-gray-900">Driver sign in</h1>
        <p className="mt-2 text-base text-gray-600">
          Enter your Driver ID or phone number, and the 4-digit code your
          operator gave you.
        </p>

        {error && (
          <div
            role="alert"
            className="flex gap-2 p-3.5 mt-5 rounded-xl bg-error-50 border border-error-200 text-base text-error-700"
          >
            <AlertCircle className="size-5 shrink-0 mt-0.5" strokeWidth={1.75} />
            <span>{error}</span>
          </div>
        )}

        <form
          className="mt-6 flex flex-col gap-6"
          onSubmit={e => { e.preventDefault(); void submit() }}
        >
          <div>
            <label htmlFor="driver-id" className="block text-base font-medium text-gray-700 mb-2">
              Driver ID or phone number
            </label>
            <input
              id="driver-id"
              value={driverId}
              // Not upper-cased and not `inputMode="numeric"` — either would
              // fight one of the two things that go in this box.
              onChange={e => setDriverId(e.target.value)}
              autoFocus
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              placeholder="DR243652 or 98765 43210"
              className="w-full h-14 px-4 rounded-xl border border-gray-300 text-lg tracking-wide text-gray-900 placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-violet-600 focus:border-violet-600"
            />
          </div>

          <div>
            <label className="block text-base font-medium text-gray-700 mb-2">4-digit code</label>
            <CodeInput digits={digits} onChange={setDigits} onComplete={code => void submit(code)} />
            {/* FR-2. Nothing was sent, and the screen has to say so. */}
            <p className="mt-3 text-sm text-gray-500 text-center">
              Your operator gives you this code. Nothing is sent to your phone.
            </p>
          </div>

          <button
            type="submit"
            disabled={busy || !driverId.trim() || digits.some(d => !d)}
            className="h-14 rounded-xl bg-violet-600 text-base font-semibold text-white hover:bg-violet-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
