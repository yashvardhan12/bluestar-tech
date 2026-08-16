import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { CalendarClock, CheckCircle2, ChevronRight, CircleUser, Navigation, Phone, LogOut } from 'lucide-react'
import { clsx } from 'clsx'
import { useAuth } from '../../lib/auth'
import {
  loadDuties, loadMe, dutyStart, dutyStage, STAGE_LABEL,
  countdown, formatDate, formatTime,
  type DriverDuty, type DriverMe,
} from '../../lib/driver'
import DriverDutyPage from './DriverDutyPage'

/**
 * F2 + F5. The whole driver shell: four flat tabs, no nesting.
 *
 * Nesting a segmented control inside a tab bar would put two levels of
 * navigation on a screen used one-handed while glancing. Current / Upcoming /
 * Completed / Profile are all a thumb reaches for, so they are all peers.
 */

// ── shared duty state ────────────────────────────────────────────────────────
// One load for all four tabs. There is no react-query here and none is being
// added; this is the same useEffect + useState the operator pages use.

interface DutiesValue {
  duties: DriverDuty[]
  me: DriverMe | null
  loading: boolean
  reload: () => Promise<void>
}

const DutiesContext = createContext<DutiesValue | null>(null)

export function useDriverDuties() {
  const ctx = useContext(DutiesContext)
  if (!ctx) throw new Error('useDriverDuties must be used inside <DriverApp>')
  return ctx
}

function DutiesProvider({ children }: { children: React.ReactNode }) {
  const [duties, setDuties] = useState<DriverDuty[]>([])
  const [me, setMe] = useState<DriverMe | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setDuties(await loadDuties())
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.all([loadDuties(), loadMe()]).then(([d, m]) => {
      if (cancelled) return
      setDuties(d)
      setMe(m)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  // FR-18 — a newly allotted duty has to appear without a reinstall or a hard
  // refresh. ponytail: poll on focus rather than subscribe. Realtime
  // authorises against RLS on `duties`, and a driver has no policy there by
  // design, so a subscription would silently deliver nothing. Revisit if
  // drivers ever get a table-level policy.
  useEffect(() => {
    const onFocus = () => { void reload() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    const timer = setInterval(onFocus, 60_000)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
      clearInterval(timer)
    }
  }, [reload])

  return (
    <DutiesContext.Provider value={{ duties, me, loading, reload }}>
      {children}
    </DutiesContext.Provider>
  )
}

// ── categorisation ───────────────────────────────────────────────────────────

const isDone = (d: DriverDuty) => d.closedAt != null || d.status === 'Completed' || d.status === 'Billed'
const isToday = (d: DriverDuty) => d.startDate <= new Date().toISOString().slice(0, 10)

/** FR-9 — the duty in progress, or today's next one if none has started. */
export function pickCurrent(duties: DriverDuty[]): DriverDuty | null {
  const live = duties.find(d => d.startedAt && !isDone(d))
  if (live) return live
  return duties.find(d => !isDone(d) && isToday(d)) ?? null
}

// ── pieces ───────────────────────────────────────────────────────────────────

function StagePill({ duty }: { duty: DriverDuty }) {
  const stage = dutyStage(duty)
  return (
    <span className={clsx(
      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium',
      stage === 'started' && 'bg-violet-50 text-violet-700',
      stage === 'on-board' && 'bg-violet-600 text-white',
      stage === 'completed' && 'bg-success-50 text-success-700',
      stage === 'no-show' && 'bg-error-50 text-error-700',
      stage === 'not-started' && 'bg-gray-100 text-gray-700',
    )}>
      {STAGE_LABEL[stage]}
    </span>
  )
}

function DutyCard({ duty, showCountdown }: { duty: DriverDuty; showCountdown?: boolean }) {
  const navigate = useNavigate()
  return (
    <button
      onClick={() => navigate(`/driver/duty/${duty.id}`)}
      className="w-full text-left bg-white border border-gray-200 rounded-2xl p-4 active:bg-gray-50 transition-colors cursor-pointer"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold text-gray-900 truncate">{duty.customerName}</p>
          <p className="mt-0.5 text-sm text-gray-500">
            {formatDate(duty.startDate)} · {formatTime(duty.reportingTime)}
          </p>
        </div>
        {/* Countdown reads as text, never as colour alone — these screens are
            used in sunlight on cheap panels. */}
        {showCountdown
          ? <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-sm font-medium text-gray-700 tabular-nums">
              {countdown(dutyStart(duty))}
            </span>
          : <StagePill duty={duty} />}
      </div>

      <div className="mt-3 flex items-center gap-2 text-sm text-gray-600">
        <span className="truncate">{duty.fromLocation ?? '—'}</span>
        <ChevronRight className="size-4 shrink-0 text-gray-400" strokeWidth={1.75} />
        <span className="truncate">{duty.toLocation ?? '—'}</span>
      </div>
    </button>
  )
}

/** FR-17 — an empty list says why it is empty and what to do next. */
function Empty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="px-6 py-14 text-center">
      <p className="text-base font-medium text-gray-900">{title}</p>
      <p className="mt-1.5 text-sm text-gray-500">{hint}</p>
    </div>
  )
}

function Screen({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur px-4 pt-4 pb-3">
        <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
      </header>
      <div className="px-4 pb-6 flex flex-col gap-3">{children}</div>
    </>
  )
}

// ── the three lists ──────────────────────────────────────────────────────────

function CurrentPage() {
  const { duties, loading } = useDriverDuties()
  if (loading) return <Screen title="Current"><p className="text-sm text-gray-400">Loading…</p></Screen>

  const current = pickCurrent(duties)
  // FR-17 — the empty Current state shows the next upcoming duty if there is one.
  const next = duties.find(d => !isDone(d) && d.id !== current?.id)

  return (
    <Screen title="Current">
      {current
        ? <DutyCard duty={current} />
        : (
          <>
            <Empty
              title="No duty right now"
              hint={next ? 'Your next duty is below.' : 'Nothing is allotted to you yet. Your operator will assign one.'}
            />
            {next && <DutyCard duty={next} showCountdown />}
          </>
        )}
    </Screen>
  )
}

function UpcomingPage() {
  const { duties } = useDriverDuties()
  const current = pickCurrent(duties)
  const upcoming = duties.filter(d => !isDone(d) && d.id !== current?.id)

  return (
    <Screen title="Upcoming">
      {upcoming.length === 0
        ? <Empty title="Nothing upcoming" hint="New duties appear here as soon as your operator allots them." />
        : upcoming.map(d => <DutyCard key={d.id} duty={d} showCountdown />)}
    </Screen>
  )
}

function CompletedPage() {
  const { duties } = useDriverDuties()
  // FR-11 — most recent first, which is the reverse of the list's own order.
  const done = duties.filter(isDone).slice().reverse()

  return (
    <Screen title="Completed">
      {done.length === 0
        ? <Empty title="No completed duties yet" hint="Duties move here once you close them." />
        : done.map(d => <DutyCard key={d.id} duty={d} />)}
    </Screen>
  )
}

// ── profile ──────────────────────────────────────────────────────────────────

function ProfilePage() {
  const { me } = useDriverDuties()
  const { signOut } = useAuth()

  return (
    <Screen title="Profile">
      <div className="bg-white border border-gray-200 rounded-2xl p-4">
        <p className="text-lg font-semibold text-gray-900">{me?.name ?? '—'}</p>
        <p className="mt-0.5 text-sm text-gray-500 tabular-nums">{me?.driverRef ?? ''}</p>
        <p className="mt-3 text-sm text-gray-600">{me?.companyName ?? ''}</p>
      </div>

      {/* FR-42 — a phone call, not a support ticket. At 6am nothing else works. */}
      {me?.companyPhone && (
        <a
          href={`tel:${me.companyPhone}`}
          className="flex items-center gap-3 h-14 px-4 bg-white border border-gray-200 rounded-2xl text-base font-medium text-gray-900 active:bg-gray-50"
        >
          <Phone className="size-5 text-violet-600" strokeWidth={1.75} />
          Contact operator
        </a>
      )}

      <button
        onClick={() => void signOut()}
        className="flex items-center gap-3 h-14 px-4 bg-white border border-gray-200 rounded-2xl text-base font-medium text-error-700 active:bg-gray-50 cursor-pointer"
      >
        <LogOut className="size-5" strokeWidth={1.75} />
        Log out
      </button>
    </Screen>
  )
}

// ── tab bar ──────────────────────────────────────────────────────────────────

const TABS = [
  { to: '/driver/current', label: 'Current', Icon: Navigation },
  { to: '/driver/upcoming', label: 'Upcoming', Icon: CalendarClock },
  { to: '/driver/completed', label: 'Done', Icon: CheckCircle2 },
  { to: '/driver/profile', label: 'Profile', Icon: CircleUser },
]

function TabBar() {
  return (
    <nav className="shrink-0 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)]">
      <div className="flex">
        {TABS.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => clsx(
              // 64px tall: a gloved thumb, not a mouse pointer.
              'flex-1 flex flex-col items-center justify-center gap-1 h-16 text-xs font-medium',
              isActive ? 'text-violet-700' : 'text-gray-500',
            )}
          >
            {({ isActive }) => (
              <>
                <Icon className="size-6" strokeWidth={isActive ? 2 : 1.75} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

// ── shell ────────────────────────────────────────────────────────────────────

export default function DriverApp() {
  return (
    <DutiesProvider>
      <div className="flex flex-col h-dvh bg-gray-50">
        <main className="flex-1 overflow-y-auto overscroll-contain">
          <Routes>
            <Route index element={<Navigate to="current" replace />} />
            <Route path="current" element={<CurrentPage />} />
            <Route path="upcoming" element={<UpcomingPage />} />
            <Route path="completed" element={<CompletedPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="duty/:dutyId" element={<DriverDutyPage />} />
            <Route path="*" element={<Navigate to="current" replace />} />
          </Routes>
        </main>
        <TabBar />
      </div>
    </DutiesProvider>
  )
}
