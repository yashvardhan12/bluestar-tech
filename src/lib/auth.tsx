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

    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return
      setSession(data.session)
      if (data.session) setProfile(await loadProfile(data.session.user.id))
      if (alive) setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, next) => {
      if (!alive) return
      setSession(next)
      setProfile(next ? await loadProfile(next.user.id) : null)
    })

    return () => { alive = false; sub.subscription.unsubscribe() }
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
