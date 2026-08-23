import { useState, useEffect, useMemo } from 'react'
import { X, Car, User, ChevronRight, ChevronLeft, ChevronDown, Search, AlertTriangle } from 'lucide-react'
import { clsx } from 'clsx'
import { supabase } from '../../lib/supabase'
import Toggle from '../../components/ui/Toggle'
import {
  dutyInterval, busyMap, conflictOf, untilLabel,
  sortVehicles, sortDrivers, matches, inScope, isFlagged,
  PICKABLE_STATUSES, DRIVER_SCOPES,
  type DutyWindow, type Conflict, type DriverStatus, type DriverScope,
} from '../../lib/allotOptions'

// ── types ─────────────────────────────────────────────────────────────────────

export interface MockVehicle {
  id: number
  modelName: string
  vehicleNumber: string
  vehicleGroup: string
  assignedDriver: { id: number; initials: string; name: string; phone: string } | null
}

export interface MockDriver {
  id: number
  initials: string
  name: string
  phone: string
}

/** A vehicle row with its clash, if any. The list is never filtered by availability —
 *  every view renders the same annotated rows through different predicates. */
interface VehicleOption extends MockVehicle { busy: Conflict | null }
interface DriverOption extends MockDriver {
  status: DriverStatus
  /** "Dzire KA01 AB 1234" when this driver is attached to a vehicle. */
  assignedVehicle: string | null
  busy: Conflict | null
}

type Step = 1 | 2 | 'all-vehicles' | 'all-drivers'

/** Sentinel for the “All groups” option — a real vehicle_groups.name never looks like this. */
const ALL_GROUPS = '__all_groups__'

interface DriverRow { id: number; name: string; initials: string; phone: string | null; status: DriverStatus }
interface VehicleRow {
  id: number
  model_name: string
  vehicle_number: string
  vehicle_groups: { name: string } | { name: string }[] | null
  assigned_driver: Omit<DriverRow, 'status'> | Omit<DriverRow, 'status'>[] | null
}

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v
}

// ── shared bits ───────────────────────────────────────────────────────────────

function Avatar({ initials, size = 'sm', muted }: { initials: string; size?: 'sm' | 'md'; muted?: boolean }) {
  return (
    <div className={clsx(
      'rounded-full flex items-center justify-center shrink-0',
      muted ? 'bg-gray-100' : 'bg-violet-100',
      size === 'sm' ? 'size-8' : 'size-10',
    )}>
      <span className={clsx(
        'font-semibold',
        muted ? 'text-gray-400' : 'text-violet-600',
        size === 'sm' ? 'text-xs' : 'text-sm',
      )}>
        {initials}
      </span>
    </div>
  )
}

function InfoRow({ label, value, alt, tall }: { label: string; value: string; alt: boolean; tall?: boolean }) {
  return (
    <div className={clsx('flex items-start border-b border-gray-200', alt && 'bg-gray-50', tall ? 'min-h-[72px]' : 'h-10')}>
      <div className={clsx('flex items-center px-6 shrink-0 w-1/2', tall ? 'py-4' : 'h-10')}>
        <span className="text-sm font-medium text-gray-900">{label}</span>
      </div>
      <div className={clsx('flex items-center px-6 flex-1', tall ? 'py-4' : 'h-10')}>
        <span className="text-sm font-normal text-gray-500 text-right w-full">{value || '—'}</span>
      </div>
    </div>
  )
}

/** Tertiary action that opens a browse view — the only addition to the default views. */
function BrowseLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 h-9 px-2.5 -mr-2.5 inline-flex items-center gap-1.5 rounded-lg text-sm font-semibold text-violet-600 hover:bg-violet-50 transition-colors cursor-pointer"
    >
      {label}
      <ChevronRight className="size-4" strokeWidth={1.75} />
    </button>
  )
}

function SectionHead({ icon, title, description, action }: {
  icon: React.ReactNode; title: string; description: string; action?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <div className="size-10 shrink-0 flex items-center justify-center rounded-md bg-white border border-gray-200">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-base font-medium text-gray-900">{title}</p>
        <p className="text-sm text-gray-500">{description}</p>
      </div>
      {action}
    </div>
  )
}

function BrowseHeader({ crumb, title, description, onBack, onClose }: {
  crumb: string; title: string; description: string; onBack: () => void; onClose: () => void
}) {
  return (
    <div className="relative flex items-start gap-1 px-6 pt-6 pb-0 shrink-0">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className="-ml-2 mt-1 size-9 shrink-0 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
      >
        <ChevronLeft className="size-5" strokeWidth={1.75} />
      </button>
      <div className="flex-1 min-w-0 pr-8">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
        >
          <ChevronLeft className="size-3" strokeWidth={2} />
          {crumb}
        </button>
        <h2 className="mt-0.5 text-xl font-semibold leading-[30px] text-gray-900">{title}</h2>
        <p className="mt-1 text-sm font-normal text-gray-500 leading-5">{description}</p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-3 p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
      >
        <X className="size-5" strokeWidth={1.75} />
      </button>
    </div>
  )
}

function FilterSelect({ label, value, onChange, options }: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string; count: number }[]
}) {
  return (
    <div className="relative shrink-0 max-w-[220px] h-10 flex items-center gap-2 pl-3.5 pr-9 rounded-lg border border-gray-300 bg-white shadow-xs focus-within:border-violet-400 focus-within:ring-4 focus-within:ring-violet-100">
      <span className="text-sm text-gray-500 shrink-0">{label}</span>
      <span className="text-sm font-medium text-gray-900 truncate">
        {options.find(o => o.value === value)?.label ?? ''}
      </span>
      <ChevronDown className="absolute right-3 size-4 text-gray-500 pointer-events-none" strokeWidth={1.75} />
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        aria-label={label}
        className="absolute inset-0 w-full opacity-0 cursor-pointer"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{`${o.label} — ${o.count}`}</option>
        ))}
      </select>
    </div>
  )
}

function SearchInput({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder: string
}) {
  return (
    <div className="flex-1 min-w-0 relative">
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-gray-400 pointer-events-none" strokeWidth={1.75} />
      <input
        type="search"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-10 pl-9 pr-3 rounded-lg border border-gray-300 bg-white shadow-xs text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100 transition-shadow"
      />
    </div>
  )
}

function IncludeBusySwitch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <label className="shrink-0 flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
      <Toggle checked={checked} onChange={onChange} label="Include on-duty" />
      Include on-duty
    </label>
  )
}

function ControlBar({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-3 mb-3">{children}</div>
}

function EmptyState({ title, children, action }: {
  title: string; children: React.ReactNode; action?: React.ReactNode
}) {
  return (
    <div className="px-6 py-10 text-center">
      <p className="text-sm font-medium text-gray-700">{title}</p>
      <p className="mt-1 text-sm text-gray-500">{children}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** Amber subline used for anything the operator is being warned about. */
function WarnLine({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 text-xs font-medium text-warning-700">
      <span className="size-1.5 rounded-full bg-warning-500 shrink-0" />
      {children}
    </span>
  )
}

function WarnBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="shrink-0 flex items-start gap-2.5 border-t border-warning-200 bg-warning-50 px-6 py-3 text-sm leading-[18px] text-warning-700">
      <AlertTriangle className="size-[18px] shrink-0 mt-px" strokeWidth={1.75} />
      <span>{children}</span>
    </div>
  )
}

function Footer({ cancelLabel, onCancel, confirmLabel, onConfirm, disabled, danger }: {
  cancelLabel: string; onCancel: () => void
  confirmLabel: string; onConfirm: () => void
  disabled?: boolean; danger?: boolean
}) {
  return (
    <div className="shrink-0 border-t border-gray-200 px-6 py-4 flex items-center justify-end gap-3">
      <button
        type="button"
        onClick={onCancel}
        className="h-10 px-4 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
      >
        {cancelLabel}
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={disabled}
        className={clsx(
          'h-10 px-4 rounded-lg text-sm font-semibold text-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
          danger ? 'bg-warning-500 hover:bg-warning-600' : 'bg-violet-600 hover:bg-violet-700',
        )}
      >
        {confirmLabel}
      </button>
    </div>
  )
}

// ── vehicle + driver tables ───────────────────────────────────────────────────

function VehicleTable({ rows, selected, onSelect, showGroup, refDate, loading, empty }: {
  rows: VehicleOption[]
  selected: VehicleOption | null
  onSelect: (v: VehicleOption) => void
  showGroup: boolean
  refDate: string
  loading: boolean
  empty: React.ReactNode
}) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden shadow-xs">
      <div className="grid grid-cols-[1fr_200px_160px] bg-gray-50 border-b border-gray-200">
        <div className="px-6 py-3 text-xs font-medium text-gray-500">Model name</div>
        <div className="px-6 py-3 text-xs font-medium text-gray-500">Assigned driver</div>
        <div className="px-6 py-3 text-xs font-medium text-gray-500">Vehicle number</div>
      </div>

      {loading ? (
        <div className="px-6 py-10 text-center text-sm text-gray-400">Checking availability…</div>
      ) : rows.length === 0 ? empty : rows.map(v => {
        const isSelected = selected?.id === v.id
        return (
          <button
            key={v.id}
            type="button"
            onClick={() => onSelect(v)}
            className={clsx(
              'grid grid-cols-[1fr_200px_160px] w-full min-h-[72px] border-b border-gray-200 text-left transition-colors cursor-pointer last:border-b-0',
              isSelected && v.busy && 'bg-warning-25 border-l-2 border-l-warning-500',
              isSelected && !v.busy && 'bg-violet-50 border-l-2 border-l-violet-600',
              !isSelected && 'hover:bg-gray-50',
            )}
          >
            <div className="px-6 py-3 flex flex-col justify-center gap-0.5">
              <span className={clsx('text-sm font-medium', v.busy ? 'text-gray-400' : 'text-gray-900')}>{v.modelName}</span>
              {showGroup && <span className="text-xs text-gray-500">{v.vehicleGroup || '—'}</span>}
            </div>
            <div className="px-6 py-3 flex items-center gap-3">
              {v.assignedDriver ? (
                <>
                  <Avatar initials={v.assignedDriver.initials} size="sm" muted={!!v.busy} />
                  <span className={clsx('text-sm', v.busy ? 'text-gray-400' : 'text-gray-500')}>{v.assignedDriver.name}</span>
                </>
              ) : (
                <span className="text-sm text-gray-400">—</span>
              )}
            </div>
            <div className="px-6 py-3 flex flex-col justify-center gap-0.5">
              <span className={clsx('text-sm', v.busy ? 'text-gray-400' : 'text-gray-500')}>{v.vehicleNumber}</span>
              {v.busy && <WarnLine>Busy till {untilLabel(v.busy.endMs, refDate)}</WarnLine>}
            </div>
          </button>
        )
      })}
    </div>
  )
}

function DriverTable({ rows, selected, onSelect, showStatus, refDate, loading, empty }: {
  rows: DriverOption[]
  selected: DriverOption | null
  onSelect: (d: DriverOption) => void
  showStatus: boolean
  refDate: string
  loading: boolean
  empty: React.ReactNode
}) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden shadow-xs">
      <div className="grid grid-cols-[1fr_1fr] bg-gray-50 border-b border-gray-200">
        <div className="px-6 py-3 text-xs font-medium text-gray-500">Name</div>
        <div className="px-6 py-3 text-xs font-medium text-gray-500">Phone number</div>
      </div>

      {loading ? (
        <div className="px-6 py-10 text-center text-sm text-gray-400">Checking availability…</div>
      ) : rows.length === 0 ? empty : rows.map(d => {
        const flagged = isFlagged(d.status)
        const marked = flagged || !!d.busy
        const isSelected = selected?.id === d.id
        return (
          <button
            key={d.id}
            type="button"
            onClick={() => onSelect(d)}
            className={clsx(
              'grid grid-cols-[1fr_1fr] w-full min-h-[72px] border-b border-gray-200 text-left transition-colors cursor-pointer last:border-b-0',
              isSelected && marked && 'bg-warning-25 border-l-2 border-l-warning-500',
              isSelected && !marked && 'bg-violet-50 border-l-2 border-l-violet-600',
              !isSelected && 'hover:bg-gray-50',
            )}
          >
            <div className="px-6 py-3 flex items-center gap-3">
              <Avatar initials={d.initials} size="md" muted={marked} />
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className={clsx('text-sm font-medium', marked ? 'text-gray-400' : 'text-gray-900')}>{d.name}</span>
                {showStatus && flagged && <WarnLine>{d.status}</WarnLine>}
                {showStatus && !flagged && d.assignedVehicle && (
                  <span className="text-xs text-gray-500 truncate">Assigned · {d.assignedVehicle}</span>
                )}
              </div>
            </div>
            <div className="px-6 py-3 flex flex-col justify-center gap-0.5">
              <span className={clsx('text-sm', marked ? 'text-gray-400' : 'text-gray-500')}>{d.phone || '—'}</span>
              {d.busy && <WarnLine>On duty till {untilLabel(d.busy.endMs, refDate)}</WarnLine>}
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ── props ─────────────────────────────────────────────────────────────────────

export interface AllotDutyInfo {
  id: number | string
  date: string
  endDate?: string
  garageStartTime?: string
  repTime: string
  city?: string
  dutyType: string
  vehicleGroup?: string
  reportingAddress?: string
  dropAddress?: string
}

interface AllotDrawerProps {
  open: boolean
  duty: AllotDutyInfo | null
  onClose: () => void
  onAllot: (vehicle: MockVehicle, driver: MockDriver | null) => void
  /** When true, skips the single-duty info table and applies to all duties in the booking */
  bulkMode?: boolean
  bulkDutyCount?: number
  /** When true, skips vehicle selection and goes straight to driver selection (re-using existing vehicle) */
  driverOnlyMode?: boolean
  /** The vehicle already assigned (used in driverOnlyMode to pass through to onAllot) */
  currentVehicle?: MockVehicle
  /** Booking being allotted — used to load duty windows for availability and to exclude the booking's own duties */
  bookingId?: number
}

// ── component ─────────────────────────────────────────────────────────────────

export default function AllotDrawer({ open, duty, onClose, onAllot, bulkMode = false, bulkDutyCount, driverOnlyMode = false, currentVehicle, bookingId }: AllotDrawerProps) {
  const [step, setStep] = useState<Step>(driverOnlyMode ? 2 : 1)
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleOption | null>(null)
  const [selectedDriver, setSelectedDriver] = useState<DriverOption | null>(null)

  // The full fleet and roster, annotated with clashes. Never filtered at the source —
  // one fetch feeds all four views, so switching views never waits on the network.
  const [vehicles, setVehicles] = useState<VehicleOption[]>([])
  const [drivers, setDrivers] = useState<DriverOption[]>([])
  const [loading, setLoading] = useState(false)
  const [refDate, setRefDate] = useState('')

  // Browse-view controls
  const [vGroup, setVGroup] = useState<string>(ALL_GROUPS)
  const [vQuery, setVQuery] = useState('')
  const [vIncludeBusy, setVIncludeBusy] = useState(false)
  const [dScope, setDScope] = useState<DriverScope>('all')
  const [dQuery, setDQuery] = useState('')
  const [dIncludeBusy, setDIncludeBusy] = useState(false)

  const ownGroup = duty?.vehicleGroup ?? ''
  /** The vehicle this duty is being driven by: picked here, or handed in by driverOnlyMode. */
  const activeVehicle: MockVehicle | null = driverOnlyMode ? (currentVehicle ?? null) : selectedVehicle

  useEffect(() => {
    if (!open) return
    let cancelled = false
    async function load() {
      setLoading(true)

      // Window(s) to keep free: all the booking's duties (bulk) or just this one
      let targetRows: DutyWindow[] = []
      if (bulkMode && bookingId) {
        const { data } = await supabase.from('duties')
          .select('start_date, end_date, reporting_time, est_drop_time').eq('booking_id', bookingId)
        targetRows = (data ?? []) as DutyWindow[]
      } else if (duty?.id != null) {
        const { data } = await supabase.from('duties')
          .select('start_date, end_date, reporting_time, est_drop_time').eq('id', duty.id)
        targetRows = (data ?? []) as DutyWindow[]
      }
      const targets = targetRows.map(dutyInterval)
      const ref = targetRows[0]?.start_date ?? new Date().toISOString().slice(0, 10)

      // One pass over the duty table serves both the vehicle and the driver clash maps
      let bq = supabase.from('duties')
        .select('id, vehicle_id, driver_id, start_date, end_date, reporting_time, est_drop_time')
        .neq('status', 'Cancelled')
      if (bookingId) bq = bq.neq('booking_id', bookingId)
      const { data: busyRows } = await bq
      const busyByVehicle = busyMap(busyRows, 'vehicle_id')
      const busyByDriver = busyMap(busyRows, 'driver_id')

      const [{ data: vData }, { data: dData }] = await Promise.all([
        supabase.from('vehicles')
          .select('id, model_name, vehicle_number, vehicle_groups(name), assigned_driver:drivers(id, name, initials, phone)')
          .order('model_name'),
        supabase.from('drivers')
          .select('id, name, initials, phone, status')
          .order('name'),
      ])

      const vs: VehicleOption[] = ((vData ?? []) as VehicleRow[]).map(v => {
        const drv = one(v.assigned_driver)
        return {
          id: v.id,
          modelName: v.model_name,
          vehicleNumber: v.vehicle_number,
          vehicleGroup: one(v.vehicle_groups)?.name ?? '',
          assignedDriver: drv
            ? { id: drv.id, initials: drv.initials, name: drv.name, phone: drv.phone ?? '' }
            : null,
          busy: conflictOf(busyByVehicle.get(v.id), targets),
        }
      })

      // The "Assigned · Dzire KA01 AB 1234" subline comes off the vehicles we just
      // loaded — no second query, and no ambiguous reverse embed to get wrong.
      const vehicleOfDriver = new Map<number, string>()
      for (const v of vs) {
        if (v.assignedDriver) vehicleOfDriver.set(v.assignedDriver.id, `${v.modelName} ${v.vehicleNumber}`)
      }

      const ds: DriverOption[] = ((dData ?? []) as DriverRow[]).map(d => ({
        id: d.id,
        name: d.name,
        initials: d.initials,
        phone: d.phone ?? '',
        status: d.status,
        assignedVehicle: vehicleOfDriver.get(d.id) ?? null,
        busy: conflictOf(busyByDriver.get(d.id), targets),
      }))

      if (!cancelled) {
        setVehicles(vs)
        setDrivers(ds)
        setRefDate(ref)
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [open, duty?.id, bulkMode, bookingId])

  // Reset when the drawer opens — the browse views deliberately remember nothing.
  // Done during render (React's "adjusting state when a prop changes") rather than in
  // an effect, so a reopened drawer never paints the previous duty's selection first.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setStep(driverOnlyMode ? 2 : 1)
      setSelectedVehicle(null)
      setSelectedDriver(null)
      setVGroup(ALL_GROUPS)
      setVQuery('')
      setVIncludeBusy(false)
      setDScope('all')
      setDQuery('')
      setDIncludeBusy(false)
    }
  }

  useEffect(() => {
    function handler(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  // ── derived lists ───────────────────────────────────────────────────────────

  const defaultVehicles = useMemo(
    () => sortVehicles(vehicles.filter(v => !v.busy && (!ownGroup || v.vehicleGroup === ownGroup)), ownGroup),
    [vehicles, ownGroup],
  )
  const browseVehicles = useMemo(
    () => sortVehicles(vehicles.filter(v =>
      (vGroup === ALL_GROUPS || v.vehicleGroup === vGroup)
      && (vIncludeBusy || !v.busy)
      && matches(vQuery, v.modelName, v.vehicleNumber)), ownGroup),
    [vehicles, vGroup, vIncludeBusy, vQuery, ownGroup],
  )
  const groupOptions = useMemo(() => {
    const pool = vehicles.filter(v => vIncludeBusy || !v.busy)
    const names = [...new Set(vehicles.map(v => v.vehicleGroup).filter(Boolean))].sort()
    return [
      { value: ALL_GROUPS, label: 'All groups', count: pool.length },
      ...names.map(n => ({ value: n, label: n, count: pool.filter(v => v.vehicleGroup === n).length })),
    ]
  }, [vehicles, vIncludeBusy])

  const defaultDrivers = useMemo(
    () => sortDrivers(drivers.filter(d => !d.busy && PICKABLE_STATUSES.includes(d.status))),
    [drivers],
  )
  const browseDrivers = useMemo(
    () => sortDrivers(drivers.filter(d =>
      inScope(d.status, dScope)
      && (dIncludeBusy || !d.busy)
      && matches(dQuery, d.name, d.phone))),
    [drivers, dScope, dIncludeBusy, dQuery],
  )
  const scopeOptions = useMemo(() => {
    const pool = drivers.filter(d => dIncludeBusy || !d.busy)
    return DRIVER_SCOPES.map(s => ({
      value: s.value as string,
      label: s.label,
      count: pool.filter(d => inScope(d.status, s.value)).length,
    }))
  }, [drivers, dIncludeBusy])

  // Counts that make the dead ends name their own exits
  const otherGroupsFree = vehicles.filter(v => !v.busy && v.vehicleGroup !== ownGroup).length
  const ownGroupBusy = vehicles.filter(v => v.busy && v.vehicleGroup === ownGroup).length
  const pickableBusy = drivers.filter(d => d.busy && PICKABLE_STATUSES.includes(d.status)).length
  const otherStatus = drivers.filter(d => !PICKABLE_STATUSES.includes(d.status)).length

  // ── actions ─────────────────────────────────────────────────────────────────

  // ponytail: assigning a vehicle or driver that is already on an overlapping duty
  // writes nothing to mark that a human overrode the check — the result is just two
  // duties sharing one resource. Fine while allotment is a judgement call; revisit
  // before duty slips, payroll or availability reporting assume one vehicle, one duty.
  function chooseVehicle(v: VehicleOption) {
    if (!v) return
    if (v.assignedDriver) {
      // Vehicle already has a driver — allot the pair directly
      const d = v.assignedDriver
      onAllot(v, { id: d.id, initials: d.initials, name: d.name, phone: d.phone })
      onClose()
    } else {
      setStep(2)
    }
  }

  function handleSave() {
    if (!activeVehicle) return
    onAllot(activeVehicle, selectedDriver)
    onClose()
  }

  /** Leaving a browse view abandons anything picked there — it may not exist in the view behind. */
  function back(to: Step) {
    if (to === 1) setSelectedVehicle(null)
    else setSelectedDriver(null)
    setStep(to)
  }

  const vehicleWarning = selectedVehicle?.busy
    ? `${selectedVehicle.modelName} (${selectedVehicle.vehicleNumber}) is on duty ${selectedVehicle.busy.dutyId} until ${untilLabel(selectedVehicle.busy.endMs, refDate)}. Assigning it double-books the vehicle.`
    : null

  const driverWarning = (() => {
    if (!selectedDriver) return null
    const reasons: string[] = []
    if (selectedDriver.busy) reasons.push(`is on duty ${selectedDriver.busy.dutyId} until ${untilLabel(selectedDriver.busy.endMs, refDate)}`)
    if (isFlagged(selectedDriver.status)) reasons.push(`is marked ${selectedDriver.status}`)
    if (!reasons.length) return null
    const tail = selectedDriver.busy ? ' Assigning them double-books the driver.' : ''
    return `${selectedDriver.name} ${reasons.join(', and ')}.${tail}`
  })()

  const infoRows: { label: string; value: string; tall?: boolean }[] = duty ? [
    { label: 'Duty ID',           value: String(duty.id) },
    { label: 'Start Date',        value: duty.date },
    { label: 'End Date',          value: duty.endDate ?? '' },
    { label: 'Garage Start Time', value: duty.garageStartTime ?? '' },
    { label: 'Reporting Time',    value: duty.repTime },
    { label: 'City',              value: duty.city ?? '' },
    { label: 'Duty Type',         value: duty.dutyType },
    { label: 'Vehicle Group',     value: duty.vehicleGroup ?? '' },
    { label: 'Reporting Address', value: duty.reportingAddress ?? '', tall: true },
    { label: 'Drop Address',      value: duty.dropAddress ?? '', tall: true },
  ] : []

  const scopeToGo = ownGroup || 'this group'

  return (
    <div className={clsx(
      'fixed inset-0 z-50 flex items-stretch justify-end transition-all duration-300',
      open ? 'pointer-events-auto' : 'pointer-events-none',
    )}>
      <div
        onClick={onClose}
        className={clsx(
          'absolute inset-0 bg-gray-950/60 transition-opacity duration-300',
          open ? 'opacity-100' : 'opacity-0',
        )}
      />

      <div className={clsx(
        'relative flex flex-col w-[660px] h-full bg-white border-l border-gray-200 shadow-xl',
        'transition-transform duration-300',
        open ? 'translate-x-0' : 'translate-x-full',
      )}>

        {/* ── View 1: Assign Vehicle ── */}
        {step === 1 && (
          <>
            <div className="relative flex items-start gap-2 px-6 pt-6 pb-0 shrink-0">
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-semibold leading-[30px] text-gray-900">Assign Vehicle</h2>
                <p className="mt-1 text-sm font-normal text-gray-500 leading-5">
                  {ownGroup
                    ? `Showing ${ownGroup} vehicles that are free ${bulkMode ? 'for every duty in this booking' : 'during this duty'}.`
                    : `Showing vehicles that are free ${bulkMode ? 'for every duty in this booking' : 'during this duty'}.`}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="absolute right-4 top-3 p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <X className="size-5" strokeWidth={1.75} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-6">
              {bulkMode ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm text-amber-800">
                  The vehicle and driver you pick will be assigned to{' '}
                  <span className="font-semibold">
                    {bulkDutyCount === 1 ? 'the 1 duty' : bulkDutyCount != null ? `all ${bulkDutyCount} duties` : 'all duties'}
                  </span>{' '}
                  in this booking.
                </div>
              ) : (
                <div className="border border-gray-200 rounded-xl overflow-hidden shadow-xs">
                  {infoRows.map((row, i) => (
                    <InfoRow key={row.label} label={row.label} value={row.value} alt={i % 2 === 0} tall={row.tall} />
                  ))}
                </div>
              )}

              <div>
                <SectionHead
                  icon={<Car className="size-5 text-gray-500" strokeWidth={1.75} />}
                  title="Available vehicles"
                  description="Tap a vehicle to select it. A vehicle's own driver is shown beside it."
                  action={<BrowseLink label="All vehicles" onClick={() => setStep('all-vehicles')} />}
                />
                <VehicleTable
                  rows={defaultVehicles}
                  selected={selectedVehicle}
                  onSelect={setSelectedVehicle}
                  showGroup={false}
                  refDate={refDate}
                  loading={loading}
                  empty={
                    <EmptyState
                      title={ownGroup ? `No ${ownGroup} is free during this time` : 'No vehicle is free during this time'}
                      action={
                        <button
                          type="button"
                          onClick={() => setStep('all-vehicles')}
                          className="h-10 px-4 inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
                        >
                          All vehicles
                          <ChevronRight className="size-4" strokeWidth={1.75} />
                        </button>
                      }
                    >
                      {otherGroupsFree > 0 && `${otherGroupsFree} ${otherGroupsFree === 1 ? 'vehicle' : 'vehicles'} in other groups ${otherGroupsFree === 1 ? 'is' : 'are'} free`}
                      {otherGroupsFree > 0 && ownGroupBusy > 0 && ', and '}
                      {ownGroupBusy > 0 && `${ownGroupBusy} ${ownGroupBusy === 1 ? 'is' : 'are'} out on duty`}
                      {otherGroupsFree === 0 && ownGroupBusy === 0 && 'Add a vehicle under Database → Vehicles.'}
                      {(otherGroupsFree > 0 || ownGroupBusy > 0) && '.'}
                    </EmptyState>
                  }
                />
              </div>
            </div>

            <Footer
              cancelLabel="Cancel"
              onCancel={onClose}
              confirmLabel="Next"
              onConfirm={() => selectedVehicle && chooseVehicle(selectedVehicle)}
              disabled={!selectedVehicle}
            />
          </>
        )}

        {/* ── View 2: All vehicles ── */}
        {step === 'all-vehicles' && (
          <>
            <BrowseHeader
              crumb={`Back to ${scopeToGo}${duty ? ` · duty ${duty.id}` : ''}`}
              title="All vehicles"
              description="Every vehicle in the fleet. Pick one to assign to this duty."
              onBack={() => back(1)}
              onClose={onClose}
            />

            <div className="flex-1 overflow-y-auto px-6 py-6">
              <ControlBar>
                <FilterSelect label="Group" value={vGroup} onChange={setVGroup} options={groupOptions} />
                <SearchInput value={vQuery} onChange={setVQuery} placeholder="Search model or number" />
                <IncludeBusySwitch checked={vIncludeBusy} onChange={() => setVIncludeBusy(v => !v)} />
              </ControlBar>

              <VehicleTable
                rows={browseVehicles}
                selected={selectedVehicle}
                onSelect={setSelectedVehicle}
                showGroup={vGroup === ALL_GROUPS}
                refDate={refDate}
                loading={loading}
                empty={
                  <EmptyState title="No vehicle matches">
                    {vQuery
                      ? <>Nothing matches “{vQuery}”.</>
                      : <>Try a different group, or turn on <span className="font-medium text-gray-700">Include on-duty</span>.</>}
                  </EmptyState>
                }
              />
            </div>

            {vehicleWarning && <WarnBar>{vehicleWarning}</WarnBar>}
            <Footer
              cancelLabel="Back"
              onCancel={() => back(1)}
              confirmLabel={vehicleWarning ? 'Assign anyway' : 'Next'}
              onConfirm={() => selectedVehicle && chooseVehicle(selectedVehicle)}
              disabled={!selectedVehicle}
              danger={!!vehicleWarning}
            />
          </>
        )}

        {/* ── View 3: Assign Driver ── */}
        {step === 2 && (
          <>
            <div className="relative flex items-start gap-2 px-6 pt-6 pb-0 shrink-0">
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-semibold leading-[30px] text-gray-900">Assign Driver</h2>
                <p className="mt-1 text-sm font-normal text-gray-500 leading-5">
                  {activeVehicle
                    ? `${activeVehicle.modelName} has no driver assigned — choose one for this duty.`
                    : 'Choose a driver for this duty.'}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="absolute right-4 top-3 p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <X className="size-5" strokeWidth={1.75} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6">
              <SectionHead
                icon={<User className="size-5 text-gray-500" strokeWidth={1.75} />}
                title="Available drivers"
                description="Active drivers with no duty during this window."
                action={<BrowseLink label="All drivers" onClick={() => setStep('all-drivers')} />}
              />
              <DriverTable
                rows={defaultDrivers}
                selected={selectedDriver}
                onSelect={setSelectedDriver}
                showStatus={false}
                refDate={refDate}
                loading={loading}
                empty={
                  <EmptyState
                    title="No driver is free during this time"
                    action={
                      <button
                        type="button"
                        onClick={() => setStep('all-drivers')}
                        className="h-10 px-4 inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
                      >
                        All drivers
                        <ChevronRight className="size-4" strokeWidth={1.75} />
                      </button>
                    }
                  >
                    {pickableBusy > 0 && `${pickableBusy} active ${pickableBusy === 1 ? 'driver is' : 'drivers are'} out on duty`}
                    {pickableBusy > 0 && otherStatus > 0 && ', and '}
                    {otherStatus > 0 && `${otherStatus} ${otherStatus === 1 ? 'is' : 'are'} assigned to a vehicle or marked unavailable`}
                    {pickableBusy === 0 && otherStatus === 0 && 'Add a driver under Database → Drivers.'}
                    {(pickableBusy > 0 || otherStatus > 0) && '.'}
                  </EmptyState>
                }
              />
            </div>

            <Footer
              cancelLabel="Cancel"
              onCancel={onClose}
              confirmLabel="Save"
              onConfirm={handleSave}
              disabled={!selectedDriver}
            />
          </>
        )}

        {/* ── View 4: All drivers ── */}
        {step === 'all-drivers' && (
          <>
            <BrowseHeader
              crumb={activeVehicle ? `Back to available · ${activeVehicle.modelName}` : 'Back to available drivers'}
              title="All drivers"
              description="Every driver on the roster. Pick one to assign to this duty."
              onBack={() => back(2)}
              onClose={onClose}
            />

            <div className="flex-1 overflow-y-auto px-6 py-6">
              <ControlBar>
                <FilterSelect label="Status" value={dScope} onChange={v => setDScope(v as DriverScope)} options={scopeOptions} />
                <SearchInput value={dQuery} onChange={setDQuery} placeholder="Search name or phone" />
                <IncludeBusySwitch checked={dIncludeBusy} onChange={() => setDIncludeBusy(v => !v)} />
              </ControlBar>

              <DriverTable
                rows={browseDrivers}
                selected={selectedDriver}
                onSelect={setSelectedDriver}
                showStatus
                refDate={refDate}
                loading={loading}
                empty={
                  <EmptyState title="No driver matches">
                    {dQuery
                      ? <>Nothing matches “{dQuery}”.</>
                      : <>Try a different status, or turn on <span className="font-medium text-gray-700">Include on-duty</span>.</>}
                  </EmptyState>
                }
              />
            </div>

            {driverWarning && <WarnBar>{driverWarning}</WarnBar>}
            <Footer
              cancelLabel="Back"
              onCancel={() => back(2)}
              confirmLabel={driverWarning ? 'Assign anyway' : 'Save'}
              onConfirm={handleSave}
              disabled={!selectedDriver}
              danger={!!driverWarning}
            />
          </>
        )}
      </div>
    </div>
  )
}
