import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Search, ChevronDown, ChevronLeft, ChevronRight, IndianRupee, Clipboard, Clock, Check, Trash2, Plus, X, CheckCircle } from 'lucide-react'
import { clsx } from 'clsx'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../components/ui/Toast'
import Drawer from '../../components/ui/Drawer'

// ── types ─────────────────────────────────────────────────────────────────────

type PayrollStatus = 'Paid' | 'Not Paid' | 'Partially Paid'

interface Driver {
  id: number
  name: string
  phone: string | null
  initials: string
  salaryPerMonth: number | null
}

interface PayrollRecord {
  id?: number
  driverId: number
  month: string
  baseSalary: number
  allowances: number | null
  fuel: number | null
  carWash: number | null
  fastTags: number | null
  parking: number | null
  challans: number | null
  advanceBalance: number | null
  carriedOver: number
  amountPaid: number
  status: PayrollStatus
}

interface PayrollRow extends Driver {
  payroll: PayrollRecord | null
}

const PAGE_SIZE = 8

const EXPENSE_TYPES = ['Fuel', 'Car Wash', 'Fast Tags', 'Parking', 'Challans', 'Other']

// ── sticky column widths ──────────────────────────────────────────────────────

const NAME_W    = 220
const STATUS_W  = 144  // wide enough for "Partially Paid"
const TOTAL_W   = 120
const ACTIONS_W = 52
const COL_W     = 116  // middle columns

// Base Salary + Allowances + Fuel + Car Wash + Fast Tags + Parking + Challans + Advance + Balance
const MIDDLE_COLS = 9
const TABLE_MIN_W = NAME_W + MIDDLE_COLS * COL_W + TOTAL_W + STATUS_W + ACTIONS_W

// ── helpers ───────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function formatINR(amount: number | null | undefined): string {
  if (amount == null) return '—'
  return '₹' + amount.toLocaleString('en-IN')
}

function computeTotal(baseSalary: number | null, p: PayrollRecord): number {
  return (baseSalary ?? 0)
    + (p.allowances ?? 0)
    + (p.fuel ?? 0)
    + (p.carWash ?? 0)
    + (p.fastTags ?? 0)
    + (p.parking ?? 0)
    - (p.challans ?? 0)
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const STATUSES: PayrollStatus[] = ['Paid', 'Not Paid', 'Partially Paid']

function fallbackStatus(driverId: number): PayrollStatus {
  return STATUSES[driverId % STATUSES.length]
}

function getPaginationPages(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  if (current <= 3) return [1, 2, 3, '...', total - 2, total - 1, total]
  if (current >= total - 2) return [1, 2, 3, '...', total - 2, total - 1, total]
  return [1, '...', current - 1, current, current + 1, '...', total]
}

// ── avatar ────────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  'bg-violet-100 text-violet-700',
  'bg-blue-100 text-blue-700',
  'bg-green-100 text-green-700',
  'bg-orange-100 text-orange-700',
  'bg-pink-100 text-pink-700',
  'bg-teal-100 text-teal-700',
]

function Avatar({ initials, index }: { initials: string; index: number }) {
  return (
    <span className={clsx(
      'size-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0',
      AVATAR_COLORS[index % AVATAR_COLORS.length],
    )}>
      {initials}
    </span>
  )
}

// ── status badge ──────────────────────────────────────────────────────────────

function PayrollBadge({ status }: { status: PayrollStatus }) {
  return (
    <span className={clsx(
      'inline-flex items-center gap-1 pl-1.5 pr-2 py-0.5 rounded-full border text-xs font-medium whitespace-nowrap',
      status === 'Paid'          && 'bg-green-50 border-green-200 text-green-700',
      status === 'Not Paid'      && 'bg-red-50 border-red-200 text-red-700',
      status === 'Partially Paid'&& 'bg-amber-50 border-amber-200 text-amber-700',
    )}>
      <span className={clsx(
        'size-1.5 rounded-full shrink-0',
        status === 'Paid'          && 'bg-green-500',
        status === 'Not Paid'      && 'bg-red-400',
        status === 'Partially Paid'&& 'bg-amber-400',
      )} />
      {status}
    </span>
  )
}

// ── month picker ──────────────────────────────────────────────────────────────

function MonthPicker({ year, month, onChange }: {
  year: number
  month: number
  onChange: (year: number, month: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(year)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [coords, setCoords] = useState({ top: 0, right: 0 })

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current  && !btnRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function handleOpen() {
    if (!btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    setCoords({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    setViewYear(year)
    setOpen(v => !v)
  }

  return (
    <div className="relative">
      <button ref={btnRef} type="button" onClick={handleOpen}
        className={clsx(
          'flex items-center gap-2 h-10 px-3.5 rounded-lg border text-sm font-medium',
          'border-gray-300 bg-white text-gray-700 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] hover:bg-gray-50',
          open && 'ring-2 ring-violet-600 border-violet-600',
        )}>
        <span>{MONTH_NAMES[month]} {year}</span>
        <ChevronDown className="size-4 text-gray-500" />
      </button>

      {open && createPortal(
        <div ref={menuRef}
          style={{ position: 'fixed', top: coords.top, right: coords.right, zIndex: 9999 }}
          className="w-64 bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <button type="button" onClick={() => setViewYear(y => y - 1)}
              className="p-1 rounded hover:bg-gray-100 text-gray-500">
              <ChevronLeft className="size-4" />
            </button>
            <span className="text-sm font-semibold text-gray-900">{viewYear}</span>
            <button type="button" onClick={() => setViewYear(y => y + 1)}
              disabled={viewYear >= new Date().getFullYear()}
              className="p-1 rounded hover:bg-gray-100 text-gray-500 disabled:opacity-30">
              <ChevronRight className="size-4" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1 p-3">
            {MONTH_NAMES.map((name, i) => {
              const isFuture = viewYear > new Date().getFullYear() ||
                (viewYear === new Date().getFullYear() && i > new Date().getMonth())
              const isSelected = viewYear === year && i === month
              return (
                <button key={name} type="button" disabled={isFuture}
                  onClick={() => { onChange(viewYear, i); setOpen(false) }}
                  className={clsx(
                    'py-2 rounded-lg text-sm font-medium transition-colors',
                    isFuture       && 'text-gray-300 cursor-not-allowed',
                    !isFuture &&  isSelected && 'bg-violet-600 text-white',
                    !isFuture && !isSelected && 'text-gray-700 hover:bg-gray-100',
                  )}>
                  {name.slice(0, 3)}
                </button>
              )
            })}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

// ── row menu ──────────────────────────────────────────────────────────────────

function RowMenu({ onEdit, onViewLogs, onAdvance, onConfirm }: {
  onEdit: () => void
  onViewLogs: () => void
  onAdvance: () => void
  onConfirm: () => void
}) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState({ top: 0, right: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current  && !btnRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function handleOpen(e: React.MouseEvent) {
    e.stopPropagation()
    if (!btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    setCoords({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    setOpen(v => !v)
  }

  const items = [
    { icon: IndianRupee, label: 'Add Driver Expense',     action: onEdit },
    { icon: Clipboard,   label: 'View expense logs',      action: onViewLogs },
    { icon: Clock,       label: 'Record advance payment', action: onAdvance },
    { icon: Check,       label: 'Confirm payment',        action: onConfirm },
  ]

  return (
    <>
      <button ref={btnRef} type="button" onClick={handleOpen}
        className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer">
        <svg className="size-5" fill="currentColor" viewBox="0 0 20 20">
          <circle cx="4" cy="10" r="1.5" /><circle cx="10" cy="10" r="1.5" /><circle cx="16" cy="10" r="1.5" />
        </svg>
      </button>

      {open && createPortal(
        <div ref={menuRef}
          style={{ position: 'fixed', top: coords.top, right: coords.right, zIndex: 9999 }}
          className="w-60 bg-white border border-gray-200 rounded-lg shadow-[0px_8px_16px_-4px_rgba(16,24,40,0.08)] py-1 overflow-hidden">
          {items.map(({ icon: Icon, label, action }) => (
            <div key={label} className="px-1.5 py-px">
              <button type="button"
                onClick={() => { action(); setOpen(false) }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer">
                <Icon className="size-4 text-gray-500 shrink-0" strokeWidth={1.75} />
                {label}
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}

// ── empty state ───────────────────────────────────────────────────────────────

function EmptyState({ isFiltered }: { isFiltered: boolean }) {
  return (
    <div className="relative flex flex-col items-center justify-center py-20 overflow-hidden">
      <div className="absolute inset-0 opacity-50" style={{
        backgroundImage: 'linear-gradient(to right, #e5e7eb 1px, transparent 1px), linear-gradient(to bottom, #e5e7eb 1px, transparent 1px)',
        backgroundSize: '32px 32px',
        WebkitMaskImage: 'radial-gradient(ellipse 60% 60% at 50% 50%, black 40%, transparent 100%)',
        maskImage: 'radial-gradient(ellipse 60% 60% at 50% 50%, black 40%, transparent 100%)',
      }} />
      <div className="relative flex flex-col items-center gap-4">
        <div className="size-20 rounded-full bg-gray-100 flex items-center justify-center">
          <div className="size-12 rounded-full bg-gray-700/60 backdrop-blur-sm flex items-center justify-center">
            <IndianRupee className="size-6 text-white" strokeWidth={1.75} />
          </div>
        </div>
        <div className="text-center">
          <p className="text-base font-semibold text-gray-900">No payroll records found</p>
          <p className="mt-1 text-sm text-gray-500">
            {isFiltered ? 'No drivers match your search.' : 'There are no drivers added yet.'}
          </p>
        </div>
      </div>
    </div>
  )
}

// ── drawer helpers ────────────────────────────────────────────────────────────

const inputCls = 'w-full px-3.5 py-2.5 border border-gray-300 rounded-lg shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100 transition-shadow bg-white disabled:bg-gray-50 disabled:text-gray-500'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  )
}

function RupeeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-gray-500">₹</span>
      <input type="number" min={0} placeholder="0" value={value}
        onChange={e => onChange(e.target.value)}
        className={clsx(inputCls, 'pl-7')} />
    </div>
  )
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function PayrollPage() {
  const { showToast } = useToast()
  const today = new Date()
  const [year, setYear]   = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())

  const [drivers, setDrivers]       = useState<Driver[]>([])
  const [payrollMap, setPayrollMap] = useState<Record<number, PayrollRecord>>({})
  const [search, setSearch]         = useState('')
  const [page, setPage]             = useState(1)

  // ── add expense drawer ───────────────────────────────────────────────────────
  const [drawerOpen, setDrawerOpen]     = useState(false)
  const [activeDriver, setActiveDriver] = useState<Driver | null>(null)
  const [form, setForm] = useState({
    allowances: '',
    status: 'Not Paid' as PayrollStatus,
  })
  const [expenses, setExpenses] = useState<{ type: string; amount: string }[]>([])
  const [saving, setSaving]   = useState(false)

  // ── logs drawer ──────────────────────────────────────────────────────────────
  const [logsOpen, setLogsOpen]       = useState(false)
  const [logsDriver, setLogsDriver]   = useState<Driver | null>(null)
  const [logsByDate, setLogsByDate]   = useState<Record<string, { type: string; amount: number }[]>>({})

  // ── advance payment modal ─────────────────────────────────────────────────────
  const [advanceOpen, setAdvanceOpen]     = useState(false)
  const [advanceDriver, setAdvanceDriver] = useState<Driver | null>(null)
  const [advanceAmount, setAdvanceAmount] = useState('')
  const [advanceSaving, setAdvanceSaving] = useState(false)

  // ── confirm payment modal ─────────────────────────────────────────────────────
  const [confirmOpen, setConfirmOpen]     = useState(false)
  const [confirmDriver, setConfirmDriver] = useState<Driver | null>(null)
  const [confirmAmount, setConfirmAmount] = useState('')
  const [confirmSaving, setConfirmSaving] = useState(false)

  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`

  useEffect(() => { fetchDrivers() }, [])
  useEffect(() => { fetchPayroll() }, [monthStr])

  async function fetchDrivers() {
    const { data } = await supabase
      .from('drivers')
      .select('id, name, phone, salary_per_month')
      .order('created_at', { ascending: false })
    if (data) {
      setDrivers(data.map((d: any) => ({
        id: Number(d.id),
        name: d.name,
        phone: d.phone,
        initials: getInitials(d.name),
        salaryPerMonth: d.salary_per_month != null ? Number(d.salary_per_month) : null,
      })))
    }
  }

  async function fetchPayroll() {
    const { data } = await supabase.from('driver_payroll').select('*').eq('month', monthStr)
    if (data) {
      const map: Record<number, PayrollRecord> = {}
      for (const r of data) {
        map[Number(r.driver_id)] = {
          id: r.id,
          driverId: Number(r.driver_id),
          month: r.month,
          baseSalary:     Number(r.base_salary),
          allowances:     r.allowances    != null ? Number(r.allowances)    : null,
          fuel:           r.fuel          != null ? Number(r.fuel)          : null,
          carWash:        r.car_wash      != null ? Number(r.car_wash)      : null,
          fastTags:       r.fast_tags     != null ? Number(r.fast_tags)     : null,
          parking:        r.parking       != null ? Number(r.parking)       : null,
          challans:       r.challans      != null ? Number(r.challans)      : null,
          advanceBalance: r.advance_balance != null ? Number(r.advance_balance) : null,
          carriedOver:    r.carried_over    != null ? Number(r.carried_over)    : 0,
          amountPaid:     r.amount_paid     != null ? Number(r.amount_paid)     : 0,
          status: r.status as PayrollStatus,
        }
      }
      setPayrollMap(map)
    }
  }

  async function fetchLogs(driverId: number) {
    const start = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const lastDay = new Date(year, month + 1, 0).getDate()
    const end   = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    const { data } = await supabase
      .from('driver_expense_logs')
      .select('date, type, amount')
      .eq('driver_id', driverId)
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: true })
      .order('created_at', { ascending: true })
    if (data) {
      const grouped: Record<string, { type: string; amount: number }[]> = {}
      for (const r of data) {
        const d = r.date as string
        if (!grouped[d]) grouped[d] = []
        grouped[d].push({ type: r.type, amount: Number(r.amount) })
      }
      setLogsByDate(grouped)
    }
  }

  function openLogs(driver: Driver) {
    setLogsDriver(driver)
    setLogsByDate({})
    fetchLogs(driver.id)
    setLogsOpen(true)
  }

  function openAdvance(driver: Driver) {
    setAdvanceDriver(driver)
    setAdvanceAmount('')
    setAdvanceOpen(true)
  }

  async function handleAdvanceSave() {
    if (!advanceDriver || !advanceAmount) return
    setAdvanceSaving(true)
    try {
      const existing = payrollMap[advanceDriver.id]
      const prev = existing?.advanceBalance ?? 0
      const newBalance = prev + Number(advanceAmount)
      const { error } = await supabase.from('driver_payroll').upsert({
        driver_id:       advanceDriver.id,
        month:           monthStr,
        base_salary:     advanceDriver.salaryPerMonth ?? 0,
        advance_balance: newBalance,
      }, { onConflict: 'driver_id,month' })
      if (error) throw error
      // Log the advance as a deduction entry
      const todayStr = new Date().toISOString().slice(0, 10)
      await supabase.from('driver_expense_logs').insert({
        driver_id: advanceDriver.id,
        date:      todayStr,
        type:      'Advance Payment',
        amount:    Number(advanceAmount),
      })
      await fetchPayroll()
      setAdvanceOpen(false)
      showToast('Advance payment recorded', 'success')
    } catch (err: any) {
      showToast(err.message ?? 'Failed to record advance', 'error')
    } finally {
      setAdvanceSaving(false)
    }
  }

  function openConfirm(driver: Driver) {
    setConfirmDriver(driver)
    setConfirmAmount('')
    setConfirmOpen(true)
  }

  async function handleConfirmSave() {
    if (!confirmDriver || !confirmAmount) return
    setConfirmSaving(true)
    try {
      const p = payrollMap[confirmDriver.id]
      const gross     = p ? computeTotal(confirmDriver.salaryPerMonth, p) : (confirmDriver.salaryPerMonth ?? 0)
      const advance   = p?.advanceBalance ?? 0
      const carryIn   = p?.carriedOver ?? 0
      const effective = gross - advance + carryIn
      const paid        = Number(confirmAmount)
      const overpayment = Math.max(0, paid - effective)
      const remaining   = Math.max(0, effective - paid)
      const newStatus: PayrollStatus = paid >= effective ? 'Paid' : paid > 0 ? 'Partially Paid' : 'Not Paid'

      // Update current month status + accumulate paid amount
      const prevPaid = p?.amountPaid ?? 0
      const { error } = await supabase.from('driver_payroll').upsert({
        driver_id:   confirmDriver.id,
        month:       monthStr,
        base_salary: confirmDriver.salaryPerMonth ?? 0,
        status:      newStatus,
        amount_paid: prevPaid + paid,
      }, { onConflict: 'driver_id,month' })
      if (error) throw error

      // Log payment to expense logs
      const todayStr = new Date().toISOString().slice(0, 10)
      await supabase.from('driver_expense_logs').insert({
        driver_id: confirmDriver.id,
        date:      todayStr,
        type:      'Payment Recorded',
        amount:    paid,
      })

      // Carry remainder or overpayment into next month
      if (remaining > 0 || overpayment > 0) {
        const d = new Date(year, month + 1, 1)
        const nextMonthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        const nextExisting = await supabase
          .from('driver_payroll')
          .select('advance_balance, carried_over')
          .eq('driver_id', confirmDriver.id)
          .eq('month', nextMonthStr)
          .maybeSingle()
        const prevAdvance   = nextExisting.data?.advance_balance ?? 0
        const prevCarryOver = nextExisting.data?.carried_over    ?? 0
        await supabase.from('driver_payroll').upsert({
          driver_id:       confirmDriver.id,
          month:           nextMonthStr,
          base_salary:     confirmDriver.salaryPerMonth ?? 0,
          advance_balance: prevAdvance   + overpayment,
          carried_over:    prevCarryOver + remaining,
        }, { onConflict: 'driver_id,month' })
      }

      await fetchPayroll()
      setConfirmOpen(false)
      const msg = overpayment > 0
        ? `Payment confirmed — ₹${overpayment.toLocaleString('en-IN')} credited as advance next month`
        : remaining > 0
          ? `Payment recorded — ₹${remaining.toLocaleString('en-IN')} carried to next month`
          : 'Payment confirmed'
      showToast(msg, 'success')
    } catch (err: any) {
      showToast(err.message ?? 'Failed to confirm payment', 'error')
    } finally {
      setConfirmSaving(false)
    }
  }

  // ── filtering & pagination ──────────────────────────────────────────────────

  const filtered   = drivers.filter(d => {
    const q = search.toLowerCase()
    return !q || d.name.toLowerCase().includes(q) || (d.phone ?? '').includes(q)
  })
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageDrivers = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const rows: PayrollRow[] = pageDrivers.map(d => ({
    ...d,
    payroll: payrollMap[d.id] ?? null,
  }))

  // ── drawer ──────────────────────────────────────────────────────────────────

  function openEdit(driver: Driver) {
    const p = payrollMap[driver.id]
    setActiveDriver(driver)
    setForm({
      allowances: p?.allowances != null ? String(p.allowances) : '',
      status:     p?.status ?? 'Not Paid',
    })
    // Rebuild expenses from existing payroll columns
    const rows: { type: string; amount: string }[] = []
    if (p?.fuel        != null) rows.push({ type: 'Fuel',      amount: String(p.fuel) })
    if (p?.carWash     != null) rows.push({ type: 'Car Wash',  amount: String(p.carWash) })
    if (p?.fastTags    != null) rows.push({ type: 'Fast Tags', amount: String(p.fastTags) })
    if (p?.parking     != null) rows.push({ type: 'Parking',   amount: String(p.parking) })
    if (p?.challans    != null) rows.push({ type: 'Challans',  amount: String(p.challans) })
    setExpenses(rows)
    setDrawerOpen(true)
  }

  async function handleSave() {
    if (!activeDriver) return
    setSaving(true)
    try {
      // Sum amounts per type (handles multiple rows of the same type)
      const byType: Record<string, number> = {}
      for (const e of expenses) {
        if (e.type && e.amount) byType[e.type] = (byType[e.type] ?? 0) + Number(e.amount)
      }
      const { error } = await supabase.from('driver_payroll').upsert({
        driver_id:   activeDriver.id,
        month:       monthStr,
        base_salary: activeDriver.salaryPerMonth ?? 0,
        allowances:  form.allowances ? Number(form.allowances) : null,
        fuel:        byType['Fuel']      ? Number(byType['Fuel'])      : null,
        car_wash:    byType['Car Wash']  ? Number(byType['Car Wash'])  : null,
        fast_tags:   byType['Fast Tags'] ? Number(byType['Fast Tags']) : null,
        parking:     byType['Parking']   ? Number(byType['Parking'])   : null,
        challans:    byType['Challans']  ? Number(byType['Challans'])  : null,
        status:      form.status,
      }, { onConflict: 'driver_id,month' })
      if (error) throw error

      // Insert daily log entries for today
      const todayStr = new Date().toISOString().slice(0, 10)
      const logRows: { driver_id: number; date: string; type: string; amount: number }[] = []
      if (form.allowances) logRows.push({ driver_id: activeDriver.id, date: todayStr, type: 'Allowances', amount: Number(form.allowances) })
      for (const exp of expenses) {
        if (exp.type && exp.amount) logRows.push({ driver_id: activeDriver.id, date: todayStr, type: exp.type, amount: Number(exp.amount) })
      }
      if (logRows.length > 0) await supabase.from('driver_expense_logs').insert(logRows)

      await fetchPayroll()
      setDrawerOpen(false)
      showToast('Expense saved successfully', 'success')
    } catch (err: any) {
      showToast(err.message ?? 'Failed to save expense', 'error')
    } finally {
      setSaving(false)
    }
  }


  const paginationPages = getPaginationPages(page, totalPages)

  // ── drawer total ─────────────────────────────────────────────────────────────

  const drawerTotal = (activeDriver?.salaryPerMonth ?? 0)
    + (Number(form.allowances) || 0)
    + expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)

  // ── header / cell shared style ───────────────────────────────────────────────

  const thBase = 'h-[44px] px-4 text-xs font-medium text-gray-600 whitespace-nowrap'
  const tdBase = 'h-[72px] px-4 py-4 text-sm text-gray-500 whitespace-nowrap'

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Controls */}
      <div className="px-10 py-5 flex items-center gap-3 shrink-0">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-gray-400 pointer-events-none" />
          <input type="text" placeholder="Search by name or phone"
            value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="pl-[38px] pr-3.5 py-2.5 w-72 border border-gray-300 rounded-lg shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100 transition-shadow" />
        </div>
        <div className="ml-auto">
          <MonthPicker year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); setPage(1) }} />
        </div>
      </div>

      {/* Table area */}
      <div className="flex-1 overflow-hidden px-10 pb-8">
        <div className="h-full flex flex-col rounded-xl border border-gray-200 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] bg-white overflow-hidden">

          {rows.length === 0 ? (
            <EmptyState isFiltered={search.length > 0} />
          ) : (
            <div className="flex-1 overflow-auto">
              <table className="w-full border-collapse" style={{ minWidth: TABLE_MIN_W }}>
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">

                    {/* Sticky left — Name */}
                    <th className={clsx(thBase, 'sticky left-0 z-20 bg-gray-50 text-left border-r border-gray-200 pl-6')}
                      style={{ width: NAME_W, minWidth: NAME_W }}>
                      Name
                    </th>

                    {/* Scrollable middle headers */}
                    <th className={clsx(thBase, 'text-right')} style={{ minWidth: COL_W }}>Base Salary</th>
                    <th className={clsx(thBase, 'text-right')} style={{ minWidth: COL_W }}>Allowances</th>
                    <th className={clsx(thBase, 'text-right')} style={{ minWidth: COL_W }}>Fuel</th>
                    <th className={clsx(thBase, 'text-right')} style={{ minWidth: COL_W }}>Car Wash</th>
                    <th className={clsx(thBase, 'text-right')} style={{ minWidth: COL_W }}>Fast Tags</th>
                    <th className={clsx(thBase, 'text-right')} style={{ minWidth: COL_W }}>Parking</th>
                    <th className={clsx(thBase, 'text-right')} style={{ minWidth: COL_W }}>Challans</th>
                    <th className={clsx(thBase, 'text-right')} style={{ minWidth: COL_W }}>Advance</th>
                    <th className={clsx(thBase, 'text-right')} style={{ minWidth: COL_W }}>Balance</th>

                    {/* Sticky right — Total */}
                    <th className={clsx(thBase, 'sticky z-20 bg-gray-50 text-right border-l border-gray-200')}
                      style={{ width: TOTAL_W, minWidth: TOTAL_W, right: ACTIONS_W + STATUS_W }}>
                      Total
                    </th>

                    {/* Sticky right — Status */}
                    <th className={clsx(thBase, 'sticky z-20 bg-gray-50 text-left border-l border-gray-200')}
                      style={{ width: STATUS_W, minWidth: STATUS_W, right: ACTIONS_W }}>
                      Status
                    </th>

                    {/* Sticky right — Actions */}
                    <th className="sticky right-0 z-20 bg-gray-50 border-l border-gray-200"
                      style={{ width: ACTIONS_W, minWidth: ACTIONS_W }} />
                  </tr>
                </thead>

                <tbody>
                  {rows.map((row, idx) => {
                    const p       = row.payroll
                    const gross   = p ? computeTotal(row.salaryPerMonth, p) : null
                    const effective = gross != null ? gross - (p?.advanceBalance ?? 0) + (p?.carriedOver ?? 0) : null
                    const total   = effective != null ? Math.max(0, effective - (p?.amountPaid ?? 0)) : null
                    const balance = p?.carriedOver ?? null
                    return (
                      <tr key={row.id} className="border-b border-gray-200 last:border-b-0 hover:bg-gray-50 transition-colors group">

                        {/* Sticky left — Name */}
                        <td className="sticky left-0 z-10 bg-white group-hover:bg-gray-50 px-6 h-[72px] border-r border-gray-200"
                          style={{ width: NAME_W, minWidth: NAME_W }}>
                          <div className="flex items-center gap-3">
                            <Avatar initials={row.initials} index={idx} />
                            <div>
                              <p className="text-sm font-medium text-gray-900 whitespace-nowrap">{row.name}</p>
                              {row.phone && <p className="text-xs text-gray-500">{row.phone}</p>}
                            </div>
                          </div>
                        </td>

                        {/* Base Salary — from driver's salary_per_month */}
                        <td className={clsx(tdBase, 'text-right font-medium text-gray-900')} style={{ minWidth: COL_W }}>
                          {formatINR(row.salaryPerMonth)}
                        </td>

                        {/* Allowances */}
                        <td className={clsx(tdBase, 'text-right')} style={{ minWidth: COL_W }}>
                          {p ? formatINR(p.allowances) : '—'}
                        </td>

                        {/* Fuel */}
                        <td className={clsx(tdBase, 'text-right')} style={{ minWidth: COL_W }}>
                          {p ? formatINR(p.fuel) : '—'}
                        </td>

                        {/* Car Wash */}
                        <td className={clsx(tdBase, 'text-right')} style={{ minWidth: COL_W }}>
                          {p ? formatINR(p.carWash) : '—'}
                        </td>

                        {/* Fast Tags */}
                        <td className={clsx(tdBase, 'text-right')} style={{ minWidth: COL_W }}>
                          {p ? formatINR(p.fastTags) : '—'}
                        </td>

                        {/* Parking */}
                        <td className={clsx(tdBase, 'text-right')} style={{ minWidth: COL_W }}>
                          {p ? formatINR(p.parking) : '—'}
                        </td>

                        {/* Challans */}
                        <td className={clsx(tdBase, 'text-right')} style={{ minWidth: COL_W }}>
                          {p ? formatINR(p.challans) : '—'}
                        </td>

                        {/* Advance */}
                        <td className={clsx(tdBase, 'text-right')} style={{ minWidth: COL_W }}>
                          {p ? formatINR(p.advanceBalance) : '—'}
                        </td>

                        {/* Balance — carried over from previous month */}
                        <td className={clsx(tdBase, 'text-right font-medium text-gray-900')} style={{ minWidth: COL_W }}>
                          {balance ? formatINR(balance) : '—'}
                        </td>

                        {/* Sticky right — Total */}
                        <td className="sticky z-10 bg-white group-hover:bg-gray-50 h-[72px] px-4 py-4 text-right text-sm font-semibold text-gray-900 whitespace-nowrap border-l border-gray-200"
                          style={{ width: TOTAL_W, minWidth: TOTAL_W, right: ACTIONS_W + STATUS_W }}>
                          {total != null ? formatINR(total) : '—'}
                        </td>

                        {/* Sticky right — Status */}
                        <td className="sticky z-10 bg-white group-hover:bg-gray-50 h-[72px] px-4 py-4 border-l border-gray-200"
                          style={{ width: STATUS_W, minWidth: STATUS_W, right: ACTIONS_W }}>
                          <PayrollBadge status={p?.status ?? fallbackStatus(row.id)} />
                        </td>

                        {/* Sticky right — Actions */}
                        <td className="sticky right-0 z-10 bg-white group-hover:bg-gray-50 h-[72px] px-2 py-4 border-l border-gray-200"
                          style={{ width: ACTIONS_W, minWidth: ACTIONS_W }}>
                          <RowMenu
                            onEdit={() => openEdit(row)}
                            onViewLogs={() => openLogs(row)}
                            onAdvance={() => openAdvance(row)}
                            onConfirm={() => openConfirm(row)}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
          <div className="border-t border-gray-200 flex items-center justify-between px-6 pt-3 pb-4 shrink-0">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 bg-white shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors">
              <ChevronLeft className="size-5" strokeWidth={1.75} /> Previous
            </button>
            <div className="flex items-center gap-0.5">
              {paginationPages.map((p_, i) => (
                <button key={i} onClick={() => typeof p_ === 'number' && setPage(p_)} disabled={p_ === '...'}
                  className={clsx(
                    'size-10 rounded-lg text-sm font-medium flex items-center justify-center transition-colors',
                    p_ === page   && 'bg-gray-50 text-gray-900 font-semibold',
                    p_ !== page   && p_ !== '...' && 'text-gray-600 hover:bg-gray-50',
                    p_ === '...'  && 'cursor-default pointer-events-none text-gray-600',
                  )}>
                  {p_}
                </button>
              ))}
            </div>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 bg-white shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors">
              Next <ChevronRight className="size-5" strokeWidth={1.75} />
            </button>
          </div>
          )}
        </div>
      </div>

      {/* Add Driver Expense Drawer */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Add Driver Expense"
        description={activeDriver ? `For ${activeDriver.name} — ${MONTH_NAMES[month]} ${year}` : undefined}
        footer={
          <div className="flex gap-3">
            <button type="button" onClick={() => setDrawerOpen(false)}
              className="flex-1 h-10 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="button" onClick={handleSave} disabled={saving}
              className="flex-1 h-10 rounded-lg bg-violet-600 text-sm font-semibold text-white hover:bg-violet-700 transition-colors disabled:opacity-60">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-5">

          {/* Payment summary card */}
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="grid grid-cols-2 bg-gray-50 border-b border-gray-200 px-4 py-2.5">
              <span className="text-xs font-medium text-gray-500">Payment Type</span>
              <span className="text-xs font-medium text-gray-500 text-right">Amount</span>
            </div>
            <div className="grid grid-cols-2 px-4 py-3 border-b border-gray-100">
              <span className="text-sm text-gray-700">Base Payment</span>
              <span className="text-sm font-medium text-gray-900 text-right">
                {formatINR(activeDriver?.salaryPerMonth ?? null)}
              </span>
            </div>
            <div className="grid grid-cols-2 px-4 py-3 border-b border-gray-100">
              <span className="text-sm text-gray-700">Allowance</span>
              <span className="text-sm font-medium text-gray-900 text-right">
                {form.allowances ? formatINR(Number(form.allowances)) : '—'}
              </span>
            </div>
            {expenses.filter(e => e.type && e.amount).map((e, i) => (
              <div key={i} className="grid grid-cols-2 px-4 py-3 border-b border-gray-100">
                <span className="text-sm text-gray-700">{e.type}</span>
                <span className="text-sm font-medium text-gray-900 text-right">{formatINR(Number(e.amount))}</span>
              </div>
            ))}
            <div className="grid grid-cols-2 px-4 py-3 bg-gray-50">
              <span className="text-sm font-semibold text-gray-900">Total</span>
              <span className="text-sm font-semibold text-gray-900 text-right">{formatINR(drawerTotal)}</span>
            </div>
          </div>

          {/* Expenses section */}
          <div className="rounded-xl bg-gray-50 border border-gray-200 p-6 flex flex-col gap-4">
            <p className="text-base font-medium text-gray-900 shrink-0">Expenses</p>

            {expenses.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="size-12 rounded-lg border border-gray-200 bg-white flex items-center justify-center shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)]">
                  <IndianRupee className="size-5 text-gray-400" strokeWidth={1.75} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-gray-900">No expenses added</p>
                  <p className="text-xs text-gray-500 mt-0.5">Add your expenses here</p>
                </div>
                <button type="button"
                  onClick={() => setExpenses([{ type: '', amount: '' }])}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-violet-300 bg-violet-50 text-sm font-semibold text-violet-700 hover:bg-violet-100 transition-colors">
                  + Add expense
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {expenses.map((exp, i) => (
                  <div key={i} className="flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <div className="relative flex-1">
                        <select
                          value={exp.type}
                          onChange={e => setExpenses(prev => prev.map((x, j) => j === i ? { ...x, type: e.target.value } : x))}
                          className={clsx(inputCls, 'appearance-none pr-9 text-gray-700', !exp.type && 'text-gray-400')}>
                          <option value="" disabled>Select expense type</option>
                          {EXPENSE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-gray-500 pointer-events-none" />
                      </div>
                      <button type="button"
                        onClick={() => setExpenses(prev => prev.filter((_, j) => j !== i))}
                        className="size-10 flex items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-500 hover:text-red-600 hover:border-red-300 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] transition-colors shrink-0">
                        <Trash2 className="size-4" strokeWidth={1.75} />
                      </button>
                    </div>
                    <Field label="Amount">
                      <RupeeInput
                        value={exp.amount}
                        onChange={v => setExpenses(prev => prev.map((x, j) => j === i ? { ...x, amount: v } : x))}
                      />
                    </Field>
                    {i < expenses.length - 1 && <hr className="border-gray-200" />}
                  </div>
                ))}
                <hr className="border-gray-200" />
                <button type="button"
                  onClick={() => setExpenses(prev => [...prev, { type: '', amount: '' }])}
                  className="flex items-center gap-1.5 text-sm font-semibold text-violet-700 hover:text-violet-800 transition-colors self-start">
                  <Plus className="size-4" strokeWidth={2.5} />
                  Add Expense
                </button>
              </div>
            )}
          </div>

        </div>
      </Drawer>

      {/* Daily Logs Drawer */}
      <Drawer
        open={logsOpen}
        onClose={() => setLogsOpen(false)}
        title="Daily Logs"
        description={logsDriver ? `For ${logsDriver.name} — ${MONTH_NAMES[month]} ${year}` : undefined}
        footer={
          <div className="flex justify-end">
            <button type="button" onClick={() => setLogsOpen(false)}
              className="px-4 py-2.5 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-700 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] hover:bg-gray-50 transition-colors">
              Close
            </button>
          </div>
        }
      >
        {(() => {
          const logsPayroll = logsDriver ? payrollMap[logsDriver.id] : null
          const balance = logsPayroll?.carriedOver ?? 0
          const hasLogs = Object.keys(logsByDate).length > 0
          return (
            <>
              {!hasLogs ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <div className="size-12 rounded-lg border border-gray-200 bg-white flex items-center justify-center shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)]">
                    <Clipboard className="size-5 text-gray-400" strokeWidth={1.75} />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-gray-900">No logs found</p>
                    <p className="text-xs text-gray-500 mt-0.5">No expenses recorded for {MONTH_NAMES[month]} {year}</p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-6">
                  {Object.entries(logsByDate).map(([dateStr, entries]) => {
                    const d = new Date(dateStr + 'T00:00:00')
                    const label = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                    return (
                      <div key={dateStr} className="flex flex-col gap-4">
                        <p className="text-base font-semibold text-gray-700">{label}</p>
                        <div className="rounded-xl border border-gray-200 overflow-hidden shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)]">
                          {entries.map((entry, i) => {
                            const isPayment = entry.type === 'Payment Recorded'
                            const isAdvance = entry.type === 'Advance Payment'
                            return (
                              <div key={i}
                                className={clsx(
                                  'flex items-center justify-between h-10 px-6 border-b border-gray-200 last:border-b-0',
                                  i % 2 === 0 ? 'bg-gray-50' : 'bg-white',
                                )}>
                                <span className={clsx('text-sm font-medium', isPayment ? 'text-green-700' : isAdvance ? 'text-orange-600' : 'text-gray-900')}>{entry.type}</span>
                                <span className={clsx('text-sm', isPayment ? 'text-green-700' : isAdvance ? 'text-orange-600' : 'text-gray-500')}>
                                  {isPayment ? '+' : isAdvance ? '−' : ''}{entry.amount.toLocaleString('en-IN')}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {balance > 0 && (
                <div className="mt-6 rounded-xl border border-gray-200 overflow-hidden shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)]">
                  <div className="flex items-center justify-between h-11 px-6 bg-amber-50 border-b border-amber-100">
                    <span className="text-sm font-semibold text-amber-800">Balance carried over</span>
                    <span className="text-sm font-semibold text-amber-800">₹{balance.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="px-6 py-2.5">
                    <p className="text-xs text-gray-500">Unpaid balance from {MONTH_NAMES[month]} {year} — will be added to next month's total.</p>
                  </div>
                </div>
              )}
            </>
          )
        })()}
      </Drawer>

      {/* Confirm Payment Modal */}
      {confirmOpen && confirmDriver && createPortal((() => {
        const p          = payrollMap[confirmDriver.id]
        const gross           = p ? computeTotal(confirmDriver.salaryPerMonth, p) : (confirmDriver.salaryPerMonth ?? 0)
        const advance         = p?.advanceBalance ?? 0
        const carryIn         = p?.carriedOver ?? 0
        const effectivePayroll = gross - advance + carryIn
        return (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-8">
            <div className="absolute inset-0 bg-gray-950/70 backdrop-blur-sm" onClick={() => setConfirmOpen(false)} />
            <div className="relative w-full max-w-[400px] bg-white rounded-xl shadow-[0px_20px_24px_-4px_rgba(16,24,40,0.08),0px_8px_8px_-4px_rgba(16,24,40,0.03)] overflow-hidden">
              <div className="absolute -top-[88px] -left-[88px] size-[256px] rounded-full border-[48px] border-gray-100 opacity-60 pointer-events-none" />
              <div className="absolute -top-[56px] -left-[56px] size-[192px] rounded-full border-[36px] border-gray-50 opacity-80 pointer-events-none" />
              <button type="button" onClick={() => setConfirmOpen(false)}
                className="absolute right-4 top-4 p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                <X className="size-5" strokeWidth={1.75} />
              </button>

              {/* Header */}
              <div className="px-6 pt-6 pb-0">
                <div className="size-12 rounded-full bg-green-100 flex items-center justify-center mb-4">
                  <CheckCircle className="size-6 text-green-600" strokeWidth={1.75} />
                </div>
                <p className="text-lg font-semibold text-gray-900">Confirm payment</p>
                <p className="mt-1 text-sm text-gray-500">For {confirmDriver.name} — {MONTH_NAMES[month]} {year}</p>
              </div>

              {/* Summary table */}
              <div className="px-6 pt-5">
                <div className="rounded-lg border border-gray-300 overflow-hidden text-sm">
                  {/* Calculated Payroll */}
                  <div className="flex border-b border-gray-200">
                    <div className="w-[220px] shrink-0 px-4 py-2.5 border-r border-gray-200">
                      <span className="text-gray-500">Calculated Payroll</span>
                    </div>
                    <div className="flex-1 px-4 py-2.5">
                      <span className="text-gray-500">{formatINR(gross)}</span>
                    </div>
                  </div>
                  {/* Advance Payment */}
                  {advance > 0 && (
                    <div className="flex border-b border-gray-200">
                      <div className="w-[220px] shrink-0 px-4 py-2.5 border-r border-gray-200">
                        <span className="text-gray-500">Advance Payment (if any)</span>
                      </div>
                      <div className="flex-1 px-4 py-2.5">
                        <span className="text-gray-500">−{formatINR(advance)}</span>
                      </div>
                    </div>
                  )}
                  {/* Past balance rollover */}
                  {carryIn > 0 && (
                    <div className="flex border-b border-gray-200">
                      <div className="w-[220px] shrink-0 px-4 py-2.5 border-r border-gray-200">
                        <span className="text-gray-500">Past balance rollover</span>
                      </div>
                      <div className="flex-1 px-4 py-2.5">
                        <span className="text-gray-500">+{formatINR(carryIn)}</span>
                      </div>
                    </div>
                  )}
                  {/* Effective Payroll */}
                  <div className="flex bg-gray-50">
                    <div className="w-[220px] shrink-0 px-4 py-2.5 border-r border-gray-200">
                      <span className="font-semibold text-gray-900">Effective Payroll</span>
                    </div>
                    <div className="flex-1 px-4 py-2.5">
                      <span className="font-semibold text-gray-900">{formatINR(effectivePayroll)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Input */}
              <div className="px-6 pt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Pay driver</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-gray-500">₹</span>
                  <input type="number" min={0} placeholder="Enter amount to pay"
                    value={confirmAmount} onChange={e => setConfirmAmount(e.target.value)}
                    className="w-full pl-8 pr-3.5 py-2.5 border border-gray-300 rounded-lg shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100 transition-shadow bg-white" />
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  If the driver is not paid fully, the remaining balance will be carried over to the next month.
                </p>
              </div>

              {/* Footer */}
              <div className="px-6 pt-6 pb-6 flex gap-3">
                <button type="button" onClick={() => setConfirmOpen(false)}
                  className="flex-1 h-11 rounded-lg border border-gray-300 bg-white text-base font-semibold text-gray-700 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button type="button" onClick={handleConfirmSave}
                  disabled={!confirmAmount || confirmSaving}
                  className="flex-1 h-11 rounded-lg bg-violet-600 text-base font-semibold text-white hover:bg-violet-700 transition-colors disabled:bg-gray-100 disabled:text-gray-400 disabled:border disabled:border-gray-200 disabled:cursor-not-allowed">
                  {confirmSaving ? 'Saving…' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        )
      })(), document.body)}

      {/* Advance Payment Modal */}
      {advanceOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-8">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-gray-950/70 backdrop-blur-sm" onClick={() => setAdvanceOpen(false)} />

          {/* Modal card */}
          <div className="relative w-full max-w-[400px] bg-white rounded-xl shadow-[0px_20px_24px_-4px_rgba(16,24,40,0.08),0px_8px_8px_-4px_rgba(16,24,40,0.03)] overflow-hidden">

            {/* Decorative circles */}
            <div className="absolute -top-[88px] -left-[88px] size-[256px] rounded-full border-[48px] border-gray-100 opacity-60 pointer-events-none" />
            <div className="absolute -top-[56px] -left-[56px] size-[192px] rounded-full border-[36px] border-gray-50 opacity-80 pointer-events-none" />

            {/* Close */}
            <button type="button" onClick={() => setAdvanceOpen(false)}
              className="absolute right-4 top-4 p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
              <X className="size-5" strokeWidth={1.75} />
            </button>

            {/* Header */}
            <div className="px-6 pt-6 pb-0">
              <div className="size-12 rounded-full bg-green-100 flex items-center justify-center mb-4">
                <CheckCircle className="size-6 text-green-600" strokeWidth={1.75} />
              </div>
              <p className="text-lg font-semibold text-gray-900">Advance Payment</p>
              <p className="mt-1 text-sm text-gray-500">
                For {advanceDriver?.name} — {MONTH_NAMES[month]} {year}
              </p>
            </div>

            {/* Input */}
            <div className="px-6 pt-5 pb-0">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Record advance payment made to the driver
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-gray-500">₹</span>
                <input
                  type="number" min={0} placeholder="Enter advance amount"
                  value={advanceAmount}
                  onChange={e => setAdvanceAmount(e.target.value)}
                  className="w-full pl-8 pr-3.5 py-2.5 border border-gray-300 rounded-lg shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100 transition-shadow bg-white"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 pt-8 pb-6 flex gap-3">
              <button type="button" onClick={() => setAdvanceOpen(false)}
                className="flex-1 h-11 rounded-lg border border-gray-300 bg-white text-base font-semibold text-gray-700 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button type="button"
                onClick={handleAdvanceSave}
                disabled={!advanceAmount || advanceSaving}
                className="flex-1 h-11 rounded-lg bg-violet-600 text-base font-semibold text-white hover:bg-violet-700 transition-colors disabled:bg-gray-100 disabled:text-gray-400 disabled:border disabled:border-gray-200 disabled:cursor-not-allowed">
                {advanceSaving ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
