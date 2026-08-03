import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { AlertCircle, Mail, Lock } from 'lucide-react'
import { supabase } from '../../lib/supabase'

const INPUT = 'w-full h-10 pl-10 pr-3.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-violet-600 focus:border-violet-600'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const from = (location.state as { from?: string } | null)?.from ?? '/bookings/duties'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)

    if (authError) {
      // Never reveal whether the email exists — same message either way.
      setError("That email and password don't match.")
      setPassword('')
      return
    }
    navigate(from, { replace: true })
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 px-4">
      {/* ponytail: explicit width, not max-w-sm — this project's @theme
          --spacing-* tokens shadow Tailwind's container scale, so max-w-sm
          resolves to 6px. Same trap applies to every named max-w-* utility. */}
      <div className="w-full max-w-[24rem] bg-white border border-gray-200 rounded-xl p-7 shadow-xs">

        <div className="flex items-center gap-2.5 mb-6">
          <img src="/logo.svg" alt="" className="size-8" />
          <span className="text-lg font-semibold tracking-tight text-gray-900">Bluestar</span>
        </div>

        {error && (
          <div className="flex gap-2 p-3 mb-4 rounded-lg bg-error-50 border border-error-200 text-sm text-error-700">
            <AlertCircle className="size-4 shrink-0 mt-0.5" strokeWidth={1.75} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" strokeWidth={1.75} />
              <input
                id="email" type="email" required autoFocus autoComplete="email"
                className={INPUT} placeholder="you@bluestar.co.in"
                value={email} onChange={e => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" strokeWidth={1.75} />
              <input
                id="password" type="password" required autoComplete="current-password"
                className={INPUT} placeholder="••••••••"
                value={password} onChange={e => setPassword(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit" disabled={busy}
            className="h-10 rounded-lg bg-violet-600 text-sm font-semibold text-white hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
