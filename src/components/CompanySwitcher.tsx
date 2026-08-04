import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Check } from 'lucide-react'
import { clsx } from 'clsx'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

export interface CompanyOption {
  id: number
  name: string
  short_code: string
  duty_count: number
  is_active: boolean
}

export default function CompanySwitcher() {
  const { profile, refreshProfile } = useAuth()
  const [companies, setCompanies] = useState<CompanyOption[]>([])
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('my_companies')
    if (error) { console.error('[switcher] my_companies failed:', error.message); return }
    setCompanies(data ?? [])
  }, [])

  // ponytail: depend on the ids, not the `profile` object. loadProfile() builds
  // a fresh object every call, and auth.tsx re-runs it on every onAuthStateChange
  // (token refresh, tab focus) — so keying on `profile` re-fired my_companies on
  // every one of those. That is the 196 calls against a 2-row table in the logs.
  useEffect(() => { if (profile) void load() }, [profile?.id, profile?.activeCompanyId, load])

  // Close on outside click / Escape, returning focus to the badge.
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (popRef.current?.contains(e.target as Node)) return
      if (btnRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus() }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function toggle() {
    const r = btnRef.current?.getBoundingClientRect()
    if (r) setPos({ top: r.top, left: r.right + 8 })
    setOpen(o => !o)
    void load()
  }

  async function choose(id: number) {
    setOpen(false)
    if (id === active?.id) return
    const { error } = await supabase.rpc('set_active_company', { target: id })
    if (error) { console.error('[switcher] set_active_company failed:', error.message); return }
    await refreshProfile()
    await load()
  }

  const active = companies.find(c => c.is_active) ?? companies[0]

  // Badge renders even with a single company — it is a scope label first and a
  // switcher second, so nothing materialises out of nowhere when a second
  // company is added (EXPERIENCE.md, Component Patterns).
  if (!profile) return null

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={active ? `Active company: ${active.name}. Switch company.` : 'Switch company'}
        title={active?.name ?? 'Company'}
        className="size-12 rounded-lg bg-violet-50 border border-violet-100 text-violet-700 text-sm font-bold tracking-wide flex items-center justify-center hover:bg-violet-100 transition-colors cursor-pointer"
      >
        {active?.short_code ?? '—'}
      </button>

      {open && createPortal(
        <div
          ref={popRef}
          role="menu"
          style={{ top: pos.top, left: pos.left }}
          className="fixed z-[9999] w-[290px] bg-white rounded-xl border border-gray-200 shadow-lg p-1.5"
        >
          <p className="px-2.5 pt-2 pb-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Switch company
          </p>
          {companies.map(c => (
            <button
              key={c.id}
              type="button"
              role="menuitem"
              onClick={() => void choose(c.id)}
              className={clsx(
                'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors cursor-pointer',
                c.is_active ? 'bg-violet-50' : 'hover:bg-gray-50',
              )}
            >
              <span className={clsx(
                'size-7 rounded-md flex items-center justify-center text-[11px] font-bold shrink-0',
                c.is_active ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-700',
              )}>
                {c.short_code}
              </span>
              <span className="flex-1 text-sm font-medium text-gray-900 truncate">{c.name}</span>
              <span className={clsx(
                'text-xs tabular-nums',
                c.is_active ? 'text-violet-700 font-semibold' : 'text-gray-500',
              )}>
                {c.duty_count}
              </span>
              {c.is_active && <Check className="size-3.5 text-violet-600" strokeWidth={2.5} />}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}
