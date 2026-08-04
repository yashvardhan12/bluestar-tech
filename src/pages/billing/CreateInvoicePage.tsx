import { useState, useRef, useEffect, useCallback, useMemo, useId } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { clsx } from 'clsx'
import {
  ArrowLeft, ChevronDown, Check, Plus, Trash2, Maximize2, IndianRupee,
  FileText, AlertCircle, Eye,
} from 'lucide-react'
import FileUpload from '../../components/ui/FileUpload'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../components/ui/Toast'
import { useActiveCompany } from '../../lib/useActiveCompany'
import { formatINR, amountInWords } from '../../lib/money'
import { calculateInvoice, bookingAmount, type DiscountMode } from '../../lib/invoice'
import AddBookingsDrawer from './AddBookingsDrawer'
import type { BookingBlock, DutyRow } from './invoiceTypes'

// ── helpers ───────────────────────────────────────────────────────────────────

let _seq = 0
const uid = () => String(++_seq)

const num = (s: string) => {
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10)
}

/** ISO `2024-10-28` → `28/10/2024` for the printed document. */
function displayDate(iso: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

// ── local types ───────────────────────────────────────────────────────────────

type Mode = 'create' | 'view' | 'edit'

interface TaxRow { key: string; taxId: number | null; label: string; rate: number }
interface DiscountRow { key: string; mode: DiscountMode; value: string }
interface CustomRow { key: string; taxable: boolean; amount: string }
interface Attachment { name: string; path: string }

interface CustomerOption {
  id: number
  name: string
  gstinNumber: string | null
  billingName: string | null
  billingAddress: string | null
  taxes: string | null
  defaultDiscount: number | null
}

interface TaxOption { id: number; name: string; percentage: number }

const DISCOUNT_LABELS: Record<DiscountMode, string> = {
  amount: 'By amount',
  percentage: 'By percentage',
  percentage_car_hire: 'By percentage on car hire',
}

const TAX_CLASSIFICATIONS = [
  '', 'Sales taxable - 5%', 'Sales taxable - 12%', 'Sales taxable - 18%', 'Exempt',
]

// ── primitive ui components ───────────────────────────────────────────────────

function FieldLabel({ children, required, htmlFor }: {
  children: React.ReactNode; required?: boolean; htmlFor?: string
}) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-700 leading-5">
      {children}
      {required && <span className="text-violet-600 ml-0.5">*</span>}
    </label>
  )
}

function InputField({
  label, required, value, onChange, placeholder, leading, disabled, className, type = 'text', error,
}: {
  label?: string
  required?: boolean
  value: string
  onChange: (v: string) => void
  placeholder?: string
  leading?: React.ReactNode
  disabled?: boolean
  className?: string
  type?: string
  error?: string
}) {
  const id = useId()
  return (
    <div className={clsx('flex flex-col gap-1.5', className)}>
      {label && <FieldLabel htmlFor={id} required={required}>{label}</FieldLabel>}
      <div className={clsx(
        'flex items-center border rounded-lg shadow-xs',
        disabled ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-300',
        error && 'border-red-300',
      )}>
        {leading && (
          <span className="pl-3.5 text-gray-500 flex items-center shrink-0">{leading}</span>
        )}
        <input
          id={id}
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={clsx(
            'flex-1 py-2.5 text-md bg-transparent outline-none placeholder-gray-400 min-w-0',
            leading ? 'pl-2 pr-3.5' : 'px-3.5',
            disabled ? 'text-gray-500' : 'text-gray-900',
          )}
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}

function TextareaField({ label, required, value, onChange, disabled }: {
  label?: string
  required?: boolean
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      {label && <FieldLabel htmlFor={id} required={required}>{label}</FieldLabel>}
      <textarea
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        rows={3}
        className={clsx(
          'w-full px-3.5 py-2.5 text-md border rounded-lg shadow-xs outline-none placeholder-gray-400 resize-y focus:ring-2 focus:ring-violet-100 focus:border-violet-400',
          disabled ? 'bg-gray-50 border-gray-200 text-gray-500' : 'bg-white border-gray-300 text-gray-900',
        )}
      />
    </div>
  )
}

interface SelectOption { value: string; label: string }

function SelectField({
  label, required, value, onChange, options, className, disabled, placeholder, error, inputRef,
}: {
  label?: string
  required?: boolean
  value: string
  onChange: (v: string) => void
  options: SelectOption[]
  className?: string
  disabled?: boolean
  placeholder?: string
  error?: string
  inputRef?: React.Ref<HTMLSelectElement>
}) {
  const id = useId()
  return (
    <div className={clsx('flex flex-col gap-1.5', className)}>
      {label && <FieldLabel htmlFor={id} required={required}>{label}</FieldLabel>}
      <div className={clsx(
        'relative flex items-center border rounded-lg shadow-xs',
        disabled ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-300',
        error && 'border-red-300',
      )}>
        <select
          id={id}
          ref={inputRef}
          value={value}
          disabled={disabled}
          onChange={e => onChange(e.target.value)}
          className={clsx(
            'flex-1 py-2.5 pl-3.5 pr-8 text-md bg-transparent outline-none appearance-none min-w-0',
            disabled ? 'text-gray-500 cursor-default' : 'text-gray-900 cursor-pointer',
          )}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronDown className="absolute right-3 size-4 text-gray-500 pointer-events-none" strokeWidth={1.75} />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}

function SectionCard({ title, children, className, action }: {
  title: string; children: React.ReactNode; className?: string; action?: React.ReactNode
}) {
  return (
    <div className={clsx('bg-gray-50 border border-gray-200 rounded-xl p-6 flex flex-col gap-4', className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-md font-medium text-gray-900">{title}</p>
        {action}
      </div>
      {children}
    </div>
  )
}

function TrashButton({ onClick, size = 'md' }: { onClick: () => void; size?: 'sm' | 'md' | 'lg' }) {
  const sizeMap = {
    sm: 'size-9 [&>svg]:size-4',
    md: 'size-10 [&>svg]:size-5',
    lg: 'size-11 [&>svg]:size-5',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Remove"
      className={clsx(
        'flex items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 hover:text-error-600 transition-colors cursor-pointer shrink-0',
        sizeMap[size],
      )}
    >
      <Trash2 strokeWidth={1.75} />
    </button>
  )
}

/** Native date input — the platform already ships a calendar. */
function DateField({ label, value, onChange, disabled, className }: {
  label: string; value: string; onChange: (v: string) => void; disabled?: boolean; className?: string
}) {
  return (
    <InputField
      className={className}
      label={label}
      type="date"
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  )
}

// ── booking duties table ──────────────────────────────────────────────────────

function DutiesTable({ duties }: { duties: DutyRow[] }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-xs overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left px-6 py-3 text-xs font-medium text-gray-600">Duties date</th>
            <th className="text-left px-6 py-3 text-xs font-medium text-gray-600">Vehicle</th>
            <th className="text-left px-6 py-3 text-xs font-medium text-gray-600">Duty type</th>
            <th className="text-right px-6 py-3 text-xs font-medium text-gray-600">Amount</th>
          </tr>
        </thead>
        <tbody>
          {duties.map((duty, i) => (
            <tr key={duty.id} className={clsx(i < duties.length - 1 && 'border-b border-gray-100')}>
              <td className="px-6 py-4 text-sm font-medium text-gray-900">{duty.date}</td>
              <td className="px-6 py-4">
                <p className="text-sm text-gray-900">{duty.vehicle}</p>
                <p className="text-sm text-gray-500">{duty.plate}</p>
              </td>
              <td className="px-6 py-4 text-sm text-gray-600">{duty.dutyType}</td>
              <td className="px-6 py-4 text-sm text-gray-700 text-right whitespace-nowrap">
                {formatINR(duty.baseRate)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── attachments ───────────────────────────────────────────────────────────────

function AttachmentRow({ file, onRemove, readOnly }: {
  file: Attachment; onRemove: () => void; readOnly: boolean
}) {
  async function open() {
    const { data, error } = await supabase.storage
      .from('vehicle-documents').createSignedUrl(file.path, 60)
    if (error || !data) { console.error('[invoice] sign failed:', error?.message); return }
    window.open(data.signedUrl, '_blank', 'noopener')
  }
  return (
    <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-4">
      <FileText className="size-5 text-gray-400 shrink-0" strokeWidth={1.75} />
      <p className="flex-1 min-w-0 text-sm font-medium text-gray-700 truncate">{file.name}</p>
      <button type="button" onClick={open}
        className="flex items-center gap-1.5 text-sm font-medium text-violet-700 hover:text-violet-900 transition-colors cursor-pointer shrink-0">
        <Eye className="size-4" strokeWidth={1.75} />View
      </button>
      {!readOnly && (
        <button type="button" onClick={onRemove} aria-label={`Remove ${file.name}`}
          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-gray-100 transition-colors cursor-pointer shrink-0">
          <Trash2 className="size-4" strokeWidth={1.75} />
        </button>
      )}
    </div>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function CreateInvoicePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { invoiceId } = useParams<{ invoiceId?: string }>()
  const { showToast, showError } = useToast()
  const company = useActiveCompany()

  const mode: Mode = !invoiceId ? 'create' : location.pathname.endsWith('/edit') ? 'edit' : 'view'
  const readOnly = mode === 'view'

  // reference data
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [taxOptions, setTaxOptions] = useState<TaxOption[]>([])

  // customer details
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [gstin, setGstin] = useState('')
  const [billingName, setBillingName] = useState('')
  const [billingAddress, setBillingAddress] = useState('')
  const customerSelectRef = useRef<HTMLSelectElement>(null)

  // invoice dates
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(isoToday())
  const [dueDate, setDueDate] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')

  // lines
  const [bookings, setBookings] = useState<BookingBlock[]>([])
  const [taxRows, setTaxRows] = useState<TaxRow[]>([])
  const [discountRows, setDiscountRows] = useState<DiscountRow[]>([])
  const [customRows, setCustomRows] = useState<CustomRow[]>([])
  const [taxClassification, setTaxClassification] = useState('')

  // attachments — FileUpload holds one file, so it is remounted per slot and
  // the accumulated list is kept here.
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploadSlot, setUploadSlot] = useState(0)

  // page state
  const [loading, setLoading] = useState(mode !== 'create')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [addRowMenuOpen, setAddRowMenuOpen] = useState(false)
  const [bookingsDrawerOpen, setBookingsDrawerOpen] = useState(false)
  /** Totals as stored on a saved invoice — shown in view mode so history
   *  cannot be rewritten by a later change to a duty's rate. */
  const [storedTotals, setStoredTotals] = useState<{
    subtotal: number; discountTotal: number; taxTotal: number; total: number
  } | null>(null)

  const companyId = company?.id ?? null

  // ── reference data ──────────────────────────────────────────────────────────

  // Not gated on a resolved company — `customers` is a shared table and
  // `taxes` is RLS-scoped, so both are safe to ask for unconditionally.
  useEffect(() => {
    supabase.from('customers')
      .select('id, name, gstin_number, billing_name, billing_address, taxes, default_discount')
      .order('name')
      .then(({ data, error }) => {
        if (error) { console.error('[invoice] customers:', error.message); return }
        setCustomers((data ?? []).map((c: any) => ({
          id: c.id,
          name: c.name,
          gstinNumber: c.gstin_number,
          billingName: c.billing_name,
          billingAddress: c.billing_address,
          taxes: c.taxes,
          defaultDiscount: c.default_discount == null ? null : Number(c.default_discount),
        })))
      })

    supabase.from('taxes')
      .select('id, tax_name, percentage')
      .eq('status', 'Active')
      .order('tax_name')
      .then(({ data, error }) => {
        if (error) { console.error('[invoice] taxes:', error.message); return }
        setTaxOptions((data ?? []).map((t: any) => ({
          id: t.id, name: t.tax_name, percentage: Number(t.percentage ?? 0),
        })))
      })
  }, [companyId])

  // ── invoice number (create) ─────────────────────────────────────────────────

  useEffect(() => {
    if (mode !== 'create') return
    supabase.rpc('peek_next_invoice_number', { d: invoiceDate }).then(({ data, error }) => {
      if (error) { console.error('[invoice] peek number:', error.message); return }
      setInvoiceNumber(data ?? '')
    })
  }, [mode, companyId, invoiceDate])

  // ── load an existing invoice ────────────────────────────────────────────────

  const loadInvoice = useCallback(async () => {
    if (!invoiceId) return
    setLoading(true)
    setLoadError(null)

    const { data, error } = await supabase
      .from('invoices')
      .select(`id, invoice_number, invoice_date, due_date, period_start, period_end,
               customer_id, customer_name, gstin_number, billing_name, billing_address,
               tax_classification, attachments, subtotal, discount_total, tax_total, total,
               invoice_lines(kind, label, rate, amount, taxable, sort_order),
               invoice_bookings(booking_id, custom_description, sort_order,
                 bookings(booking_ref, start_date, end_date,
                   duties(id, start_date, duty_type, base_rate,
                     vehicles(model_name, vehicle_number))))`)
      .eq('id', invoiceId)
      .maybeSingle()

    if (error || !data) {
      setLoadError(error?.message ?? 'Invoice not found.')
      setLoading(false)
      return
    }

    setInvoiceNumber(data.invoice_number)
    setInvoiceDate(data.invoice_date ?? '')
    setDueDate(data.due_date ?? '')
    setPeriodStart(data.period_start ?? '')
    setPeriodEnd(data.period_end ?? '')
    setCustomerId(data.customer_id)
    setCustomerName(data.customer_name ?? '')
    setGstin(data.gstin_number ?? '')
    setBillingName(data.billing_name ?? '')
    setBillingAddress(data.billing_address ?? '')
    setTaxClassification(data.tax_classification ?? '')
    setAttachments(Array.isArray(data.attachments) ? (data.attachments as Attachment[]) : [])
    setStoredTotals({
      subtotal: Number(data.subtotal ?? 0),
      discountTotal: Number(data.discount_total ?? 0),
      taxTotal: Number(data.tax_total ?? 0),
      total: Number(data.total ?? 0),
    })

    setBookings(((data.invoice_bookings ?? []) as any[])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(ib => ({
        bookingId: ib.booking_id,
        bookingRef: ib.bookings?.booking_ref || `#${ib.booking_id}`,
        dateRange: `${displayDate(ib.bookings?.start_date ?? '')} to ${displayDate(ib.bookings?.end_date ?? '')}`,
        customDescription: ib.custom_description ?? '',
        duties: (ib.bookings?.duties ?? []).map((d: any) => ({
          id: d.id,
          date: displayDate(d.start_date ?? ''),
          vehicle: d.vehicles?.model_name ?? '—',
          plate: d.vehicles?.vehicle_number ?? '',
          dutyType: d.duty_type ?? '—',
          baseRate: d.base_rate == null ? null : Number(d.base_rate),
        })),
      })))

    const lines = ((data.invoice_lines ?? []) as any[]).sort((a, b) => a.sort_order - b.sort_order)
    setTaxRows(lines.filter(l => l.kind === 'tax').map(l => ({
      key: uid(), taxId: null, label: l.label ?? '', rate: Number(l.rate ?? 0),
    })))
    setDiscountRows(lines.filter(l => l.kind === 'discount').map(l => ({
      key: uid(),
      mode: (l.label as DiscountMode) ?? 'amount',
      value: String(l.label === 'amount' ? l.amount : (l.rate ?? l.amount)),
    })))
    setCustomRows(lines.filter(l => l.kind === 'custom').map(l => ({
      key: uid(), taxable: l.taxable, amount: String(l.amount ?? 0),
    })))

    setLoading(false)
  }, [invoiceId])

  useEffect(() => { if (invoiceId) loadInvoice() }, [invoiceId, loadInvoice])

  // ── derived ─────────────────────────────────────────────────────────────────

  const totals = useMemo(() => calculateInvoice({
    bookings: bookings.map(b => ({ duties: b.duties })),
    customRows: customRows.map(r => ({ taxable: r.taxable, amount: num(r.amount) })),
    discounts: discountRows.map(r => ({ mode: r.mode, value: num(r.value) })),
    taxes: taxRows.map(r => ({ rate: r.rate })),
  }), [bookings, customRows, discountRows, taxRows])

  const shown = readOnly && storedTotals ? storedTotals : totals

  // ── handlers ────────────────────────────────────────────────────────────────

  function pickCustomer(idStr: string) {
    const c = customers.find(x => String(x.id) === idStr)
    setErrors(e => ({ ...e, customer: '' }))
    if (!c) {
      setCustomerId(null); setCustomerName('')
      return
    }
    setCustomerId(c.id)
    setCustomerName(c.name)
    setGstin(c.gstinNumber ?? '')
    setBillingName(c.billingName ?? '')
    setBillingAddress(c.billingAddress ?? '')
    // Seed the customer's default discount, but never overwrite rows the user
    // has already entered.
    if (c.defaultDiscount && discountRows.length === 0) {
      setDiscountRows([{ key: uid(), mode: 'percentage', value: String(c.defaultDiscount) }])
    }
  }

  function addTaxRow(taxIdStr?: string) {
    const t = taxOptions.find(x => String(x.id) === taxIdStr) ?? taxOptions[0]
    if (!t) return
    setTaxRows(prev => [...prev, {
      key: uid(), taxId: t.id, label: `${t.name} ${t.percentage}%`, rate: t.percentage,
    }])
  }

  function setTaxRowFrom(key: string, taxIdStr: string) {
    const t = taxOptions.find(x => String(x.id) === taxIdStr)
    if (!t) return
    setTaxRows(prev => prev.map(r => r.key === key
      ? { ...r, taxId: t.id, label: `${t.name} ${t.percentage}%`, rate: t.percentage }
      : r))
  }

  function addBookings(blocks: BookingBlock[]) {
    setBookings(prev => [...prev, ...blocks])
  }

  function saveDisabled() {
    return saving || readOnly
  }

  async function handleSave() {
    const newErrors: Record<string, string> = {}
    if (!customerName) newErrors.customer = 'Pick a customer.'
    if (bookings.length === 0 && customRows.length === 0) {
      newErrors.lines = 'Add at least one booking or custom row.'
    }
    setErrors(newErrors)
    if (Object.keys(newErrors).length > 0) {
      showError('Fix the highlighted fields before saving.')
      return
    }

    setSaving(true)

    const header = {
      customer_id: customerId,
      customer_name: customerName,
      gstin_number: gstin || null,
      billing_name: billingName || null,
      billing_address: billingAddress || null,
      invoice_date: invoiceDate || isoToday(),
      due_date: dueDate || null,
      period_start: periodStart || null,
      period_end: periodEnd || null,
      tax_classification: taxClassification || null,
      subtotal: totals.subtotal,
      discount_total: totals.discountTotal,
      tax_total: totals.taxTotal,
      total: totals.total,
      attachments,
    }

    // The line rows are rewritten wholesale rather than diffed — an invoice
    // has a handful of them and a delete+insert cannot drift.
    const buildChildren = (id: number) => ({
      bookingRows: bookings.map((b, i) => ({
        invoice_id: id,
        booking_id: b.bookingId,
        custom_description: b.customDescription || null,
        amount: bookingAmount(b.duties),
        sort_order: i,
      })),
      lineRows: [
        ...taxRows.map((r, i) => ({
          invoice_id: id, kind: 'tax', label: r.label, rate: r.rate,
          amount: totals.taxAmounts[i] ?? 0, taxable: true, sort_order: i,
        })),
        ...discountRows.map((r, i) => ({
          invoice_id: id, kind: 'discount', label: r.mode,
          rate: r.mode === 'amount' ? null : num(r.value),
          amount: r.mode === 'amount' ? num(r.value) : 0,
          taxable: true, sort_order: i,
        })),
        ...customRows.map((r, i) => ({
          invoice_id: id, kind: 'custom', label: r.taxable ? 'Taxable' : 'Non-taxable',
          rate: null, amount: num(r.amount), taxable: r.taxable, sort_order: i,
        })),
      ],
    })

    try {
      let id: number
      if (mode === 'create') {
        // company_id and invoice_number are both assigned server-side.
        const { data, error } = await supabase
          .from('invoices').insert(header).select('id, invoice_number').single()
        if (error) throw error
        id = data.id
        setInvoiceNumber(data.invoice_number)
      } else {
        id = Number(invoiceId)
        const { error } = await supabase.from('invoices').update(header).eq('id', id)
        if (error) throw error
        // ponytail: delete-then-insert across two round trips, so a failure
        // between them leaves the invoice with no line rows (the header totals
        // survive). Move to a single `save_invoice(jsonb)` RPC if that window
        // ever bites. Order is forced — invoice_bookings is unique on
        // (invoice_id, booking_id), so the new rows cannot go in first.
        await supabase.from('invoice_bookings').delete().eq('invoice_id', id)
        await supabase.from('invoice_lines').delete().eq('invoice_id', id)
      }

      const { bookingRows, lineRows } = buildChildren(id)
      if (bookingRows.length > 0) {
        const { error } = await supabase.from('invoice_bookings').insert(bookingRows)
        if (error) throw error
      }
      if (lineRows.length > 0) {
        const { error } = await supabase.from('invoice_lines').insert(lineRows)
        if (error) throw error
      }

      // Bookings that have been invoiced are Billed. `bookings.status` already
      // carries this value and nothing else sets it.
      if (bookingRows.length > 0) {
        const { error } = await supabase
          .from('bookings')
          .update({ status: 'Billed' })
          .in('id', bookingRows.map(r => r.booking_id))
        if (error) console.error('[invoice] marking bookings Billed failed:', error.message)
      }

      showToast(mode === 'create' ? 'Invoice created' : 'Invoice updated')
      navigate('/billing/invoices')
    } catch (err: any) {
      // Form state is deliberately left intact — the user's work survives.
      console.error('[invoice] save failed:', err)
      showError(`Couldn't save the invoice. ${err?.message ?? 'Please try again.'}`)
    } finally {
      setSaving(false)
    }
  }

  // ── render ──────────────────────────────────────────────────────────────────

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-32 px-10" aria-live="polite">
        <AlertCircle className="size-8 text-red-500" strokeWidth={1.75} />
        <p className="text-base font-semibold text-gray-900">Couldn't load this invoice.</p>
        <p className="text-sm text-gray-500">Something went wrong on our end. Your data is safe.</p>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate('/billing/invoices')}
            className="px-4 py-2.5 border border-gray-300 bg-white rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer">
            Back to Invoices
          </button>
          <button type="button" onClick={loadInvoice}
            className="px-4 py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-lg hover:bg-violet-700 transition-colors cursor-pointer">
            Retry
          </button>
        </div>
        <details className="w-full max-w-lg">
          <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-700 text-center">Technical details</summary>
          <pre className="mt-2 p-3 rounded-lg bg-gray-50 border border-gray-200 text-xs font-mono text-gray-600 whitespace-pre-wrap">{loadError}</pre>
        </details>
      </div>
    )
  }

  const title = mode === 'create' ? 'Create invoice'
    : mode === 'edit' ? 'Edit invoice'
    : invoiceNumber || 'Invoice'

  return (
    <div className="flex flex-col min-h-full bg-white">

      {/* ── Page header ── */}
      <div className="flex flex-col gap-2.5 px-10 pt-8 pb-7 border-b border-gray-200">
        <button
          type="button"
          onClick={() => navigate('/billing/invoices')}
          className="flex items-center gap-2 w-fit text-sm font-semibold text-violet-700 hover:text-violet-800 transition-colors cursor-pointer"
        >
          <ArrowLeft className="size-5" strokeWidth={1.75} />
          Back to Invoices
        </button>

        <div className="flex items-center justify-between gap-4">
          <h1 className="text-display-sm font-semibold text-gray-900">{title}</h1>

          <div className="flex items-center gap-3">
            {/* Billing as — the issuing company. Changing it means switching
                company globally; RLS assigns company_id server-side. */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">Billing as:</span>
              <span
                title="Switch company from the sidebar to bill as a different company"
                className="px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700"
              >
                {company?.name ?? '—'}
              </span>
            </div>

            <div className="w-px h-8 bg-gray-200" />

            {readOnly ? (
              <button
                type="button"
                onClick={() => navigate(`/billing/invoices/${invoiceId}/edit`)}
                className="px-4 py-2.5 bg-violet-600 border border-violet-600 rounded-lg text-sm font-semibold text-white hover:bg-violet-700 transition-colors cursor-pointer"
              >
                Edit
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => navigate('/billing/invoices')}
                  className="px-4 py-2.5 bg-white border border-violet-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-violet-50 transition-colors cursor-pointer shadow-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saveDisabled()}
                  className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 border border-violet-600 rounded-lg text-sm font-semibold text-white hover:bg-violet-700 transition-colors cursor-pointer shadow-xs disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Check className="size-4" strokeWidth={1.75} />
                  {saving ? 'Saving…' : 'Save Invoice'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Two-column content ── */}
      <div className="flex gap-6 px-10 py-7 items-start">

        {/* ── Left panel: Invoice details ── */}
        <div className="flex-1 min-w-0 bg-white border border-gray-200 rounded-xl shadow-xs flex flex-col gap-6 p-6">

          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Invoice details</h2>
              <p className="text-sm text-gray-500 mt-0.5">Fill customer and booking details here</p>
            </div>

            {!readOnly && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setAddRowMenuOpen(o => !o)}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-violet-700 hover:bg-violet-50 rounded-lg transition-colors cursor-pointer"
                >
                  <Plus className="size-4" strokeWidth={1.75} />
                  Add custom row
                </button>
                {addRowMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 z-20 w-40 bg-white border border-gray-200 rounded-lg shadow-lg p-1">
                    {[true, false].map(taxable => (
                      <button
                        key={String(taxable)}
                        type="button"
                        onClick={() => {
                          setCustomRows(prev => [...prev, { key: uid(), taxable, amount: '0' }])
                          setAddRowMenuOpen(false)
                          setErrors(e => ({ ...e, lines: '' }))
                        }}
                        className="w-full text-left px-2.5 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
                      >
                        {taxable ? 'Taxable' : 'Non-taxable'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {loading ? (
            <div className="flex flex-col gap-4" aria-hidden>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-40 rounded-xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : (
          <>
          {/* Section: Customer details */}
          <SectionCard title="Customer details">
            <SelectField
              label="Customer"
              required
              inputRef={customerSelectRef}
              value={customerId ? String(customerId) : ''}
              onChange={pickCustomer}
              disabled={readOnly}
              placeholder="Select customer"
              error={errors.customer}
              options={customers.map(c => ({ value: String(c.id), label: c.name }))}
            />
            <div className="grid grid-cols-2 gap-4">
              <InputField label="GSTIN Number" value={gstin} onChange={setGstin}
                placeholder="GSTIN Number here" disabled={readOnly} />
              <InputField label="Billing Name" value={billingName} onChange={setBillingName}
                placeholder="Business Name" disabled={readOnly} />
            </div>
            <TextareaField label="Billing Address" value={billingAddress}
              onChange={setBillingAddress} disabled={readOnly} />
            <SelectField
              label="Taxes"
              value=""
              onChange={v => { addTaxRow(v); }}
              disabled={readOnly || taxOptions.length === 0}
              placeholder={taxRows.length > 0 ? 'Add another tax' : 'Tax item'}
              options={taxOptions.map(t => ({ value: String(t.id), label: `${t.name} - ${t.percentage}%` }))}
            />
          </SectionCard>

          {/* Section: Invoice dates */}
          <SectionCard title="Invoice dates">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-0.5">
                <p className="text-sm font-medium text-gray-700">Invoice Number</p>
                <p className="text-md font-semibold text-gray-700">
                  {invoiceNumber || 'Assigned on save'}
                </p>
              </div>
              <DateField label="Invoice Date" value={invoiceDate}
                onChange={setInvoiceDate} disabled={readOnly} />
            </div>

            <DateField label="Due Date" value={dueDate} onChange={setDueDate} disabled={readOnly} />

            <div className="grid grid-cols-2 gap-4">
              <DateField label="Invoice period start" value={periodStart}
                onChange={setPeriodStart} disabled={readOnly} />
              <DateField label="Invoice period end" value={periodEnd}
                onChange={setPeriodEnd} disabled={readOnly} />
            </div>
          </SectionCard>

          {/* Section: Bookings */}
          <SectionCard title="Bookings" className="gap-6">
            {bookings.map(booking => (
              <div key={booking.bookingId} className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-md font-semibold text-gray-700">Booking ID {booking.bookingRef}</p>
                    <p className="text-sm text-gray-500 mt-0.5">{booking.dateRange}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-md font-semibold text-gray-900">
                      {formatINR(bookingAmount(booking.duties))}
                    </span>
                    {!readOnly && (
                      <TrashButton onClick={() =>
                        setBookings(prev => prev.filter(b => b.bookingId !== booking.bookingId))} />
                    )}
                  </div>
                </div>

                <DutiesTable duties={booking.duties} />

                <TextareaField
                  label="Custom description"
                  value={booking.customDescription}
                  disabled={readOnly}
                  onChange={v => setBookings(prev => prev.map(b =>
                    b.bookingId === booking.bookingId ? { ...b, customDescription: v } : b))}
                />
              </div>
            ))}

            {bookings.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <p className="text-sm font-semibold text-gray-900">No bookings added</p>
                <p className="text-sm text-gray-500">
                  Add bookings and their corresponding duties here for consideration
                </p>
              </div>
            )}

            {!readOnly && (
              <button
                type="button"
                disabled={!customerName}
                onClick={() => setBookingsDrawerOpen(true)}
                title={customerName ? undefined : 'Pick a customer first'}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-lg hover:bg-violet-700 transition-colors cursor-pointer w-fit disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Plus className="size-4" strokeWidth={1.75} />
                Add bookings
              </button>
            )}
          </SectionCard>

          {/* Section: Tax */}
          <SectionCard title="Tax">
            {taxRows.map((row, i) => (
              <div key={row.key} className="flex items-end gap-3">
                <SelectField
                  className="flex-1"
                  label="Taxes"
                  value={row.taxId ? String(row.taxId) : ''}
                  disabled={readOnly}
                  onChange={v => setTaxRowFrom(row.key, v)}
                  placeholder={row.label || 'Tax item'}
                  options={taxOptions.map(t => ({ value: String(t.id), label: `${t.name} - ${t.percentage}%` }))}
                />
                <InputField
                  className="w-40"
                  label="Amount"
                  value={formatINR(totals.taxAmounts[i] ?? 0)}
                  onChange={() => {}}
                  disabled
                />
                {!readOnly && (
                  <TrashButton size="lg"
                    onClick={() => setTaxRows(prev => prev.filter(r => r.key !== row.key))} />
                )}
              </div>
            ))}
            {taxRows.length === 0 && (
              <p className="text-sm text-gray-500">No tax added. Add your custom tax items here if required.</p>
            )}
            {!readOnly && taxOptions.length > 0 && (
              <button
                type="button"
                onClick={() => addTaxRow()}
                className="flex items-center gap-1.5 text-sm font-semibold text-violet-700 hover:text-violet-800 transition-colors cursor-pointer w-fit"
              >
                <Plus className="size-4" strokeWidth={1.75} />
                Add tax
              </button>
            )}
          </SectionCard>

          {/* Section: Discount */}
          <SectionCard title="Discount">
            {discountRows.map(row => (
              <div key={row.key} className="flex items-end gap-3">
                <SelectField
                  className="flex-1"
                  label="Discount type"
                  value={row.mode}
                  disabled={readOnly}
                  onChange={v => setDiscountRows(prev => prev.map(r =>
                    r.key === row.key ? { ...r, mode: v as DiscountMode } : r))}
                  options={(Object.keys(DISCOUNT_LABELS) as DiscountMode[])
                    .map(m => ({ value: m, label: DISCOUNT_LABELS[m] }))}
                />
                <InputField
                  className="w-44"
                  label={row.mode === 'amount' ? 'Amount' : 'Percentage'}
                  value={row.value}
                  disabled={readOnly}
                  onChange={v => setDiscountRows(prev => prev.map(r =>
                    r.key === row.key ? { ...r, value: v } : r))}
                  leading={row.mode === 'amount'
                    ? <IndianRupee className="size-4" strokeWidth={1.75} />
                    : <span className="text-sm">%</span>}
                />
                {!readOnly && (
                  <TrashButton size="lg"
                    onClick={() => setDiscountRows(prev => prev.filter(r => r.key !== row.key))} />
                )}
              </div>
            ))}
            {discountRows.length === 0 && (
              <p className="text-sm text-gray-500">
                No discount added. Add discount by amount, percentage or percentage on car hire charges.
              </p>
            )}
            {!readOnly && (
              <button
                type="button"
                onClick={() => setDiscountRows(prev => [...prev, { key: uid(), mode: 'amount', value: '0' }])}
                className="flex items-center gap-1.5 text-sm font-semibold text-violet-700 hover:text-violet-800 transition-colors cursor-pointer w-fit"
              >
                <Plus className="size-4" strokeWidth={1.75} />
                Add discount
              </button>
            )}
          </SectionCard>

          {/* Section: Custom rows */}
          {customRows.length > 0 && (
            <SectionCard title="Custom row">
              {customRows.map(row => (
                <div key={row.key} className="flex items-end gap-3">
                  <SelectField
                    className="flex-1"
                    label="Type"
                    value={row.taxable ? 'taxable' : 'non-taxable'}
                    disabled={readOnly}
                    onChange={v => setCustomRows(prev => prev.map(r =>
                      r.key === row.key ? { ...r, taxable: v === 'taxable' } : r))}
                    options={[
                      { value: 'taxable', label: 'Taxable' },
                      { value: 'non-taxable', label: 'Non-taxable' },
                    ]}
                  />
                  <InputField
                    className="w-44"
                    label="Amount"
                    value={row.amount}
                    disabled={readOnly}
                    onChange={v => setCustomRows(prev => prev.map(r =>
                      r.key === row.key ? { ...r, amount: v } : r))}
                    leading={<IndianRupee className="size-4" strokeWidth={1.75} />}
                  />
                  {!readOnly && (
                    <TrashButton size="lg"
                      onClick={() => setCustomRows(prev => prev.filter(r => r.key !== row.key))} />
                  )}
                </div>
              ))}
            </SectionCard>
          )}

          {errors.lines && <p className="text-sm text-red-600">{errors.lines}</p>}

          {/* Tax classification */}
          <SelectField
            label="Tax classification (Nature of transaction)"
            value={taxClassification}
            onChange={setTaxClassification}
            disabled={readOnly}
            placeholder="Select one"
            options={TAX_CLASSIFICATIONS.filter(Boolean).map(t => ({ value: t, label: t }))}
          />

          {/* Invoice attachments */}
          <div className="flex flex-col gap-3">
            {!readOnly && (
              <FileUpload
                key={uploadSlot}
                label="Invoice attachments"
                storagePath="invoices"
                onChange={path => {
                  if (!path) return
                  const name = decodeURIComponent(path.split('/').pop() ?? path)
                    .replace(/^\d{10,}-/, '')
                  setAttachments(prev => [...prev, { name, path }])
                  setUploadSlot(s => s + 1)      // reset the control for the next file
                }}
              />
            )}
            {attachments.length > 0 && (
              <div className="flex flex-col gap-3">
                {readOnly && <FieldLabel>Invoice attachments</FieldLabel>}
                {attachments.map(file => (
                  <AttachmentRow
                    key={file.path}
                    file={file}
                    readOnly={readOnly}
                    onRemove={() => setAttachments(prev => prev.filter(f => f.path !== file.path))}
                  />
                ))}
              </div>
            )}
          </div>
          </>
          )}
        </div>

        {/* ── Right panel: Preview ── */}
        <div className="w-[560px] shrink-0 bg-white border border-gray-200 rounded-xl shadow-xs flex flex-col sticky top-6">
          <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-gray-200">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Preview</h2>
              <p className="text-sm text-gray-500 mt-0.5">See your invoice here</p>
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              aria-label="Print invoice"
              className="flex items-center justify-center size-10 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer shrink-0"
            >
              <Maximize2 className="size-5" strokeWidth={1.75} />
            </button>
          </div>

          <div className="flex-1 p-6">
            {!customerName ? (
              /* Empty state — matches the Figma "No customer added" panel */
              <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
                <div className="size-20 rounded-full bg-violet-50 flex items-center justify-center">
                  <div className="size-12 rounded-full bg-violet-600 flex items-center justify-center">
                    <Plus className="size-6 text-white" strokeWidth={2} />
                  </div>
                </div>
                <div>
                  <p className="text-base font-semibold text-gray-900">No customer added</p>
                  <p className="mt-1 text-sm text-gray-500 max-w-[280px]">
                    You have no customer/booking entered for this invoice
                  </p>
                </div>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => customerSelectRef.current?.focus()}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-lg hover:bg-violet-700 transition-colors cursor-pointer"
                  >
                    <Plus className="size-4" strokeWidth={2.5} />
                    Add customer
                  </button>
                )}
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                {/* Invoice header */}
                <div className="bg-violet-600 px-8 py-6 flex items-start justify-between">
                  <div>
                    <div className="text-white text-xl font-bold tracking-wide">INVOICE</div>
                    <div className="text-violet-200 text-sm mt-1">{invoiceNumber || 'Assigned on save'}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-white font-semibold text-sm">{company?.name ?? ''}</div>
                    {company?.gstinNumber && (
                      <div className="text-violet-200 text-xs mt-0.5">GSTIN: {company.gstinNumber}</div>
                    )}
                  </div>
                </div>

                {/* Bill to */}
                <div className="px-8 py-5 border-b border-gray-100">
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Bill To</p>
                      <p className="text-sm font-semibold text-gray-900">{billingName || customerName}</p>
                      <p className="text-xs text-gray-500 mt-0.5 whitespace-pre-line">{billingAddress}</p>
                      {gstin && <p className="text-xs text-gray-500 mt-1">GSTIN: {gstin}</p>}
                    </div>
                    <div className="text-right">
                      <div className="mb-2">
                        <p className="text-xs text-gray-400 uppercase tracking-wider">Invoice Date</p>
                        <p className="text-sm font-medium text-gray-700">{displayDate(invoiceDate)}</p>
                      </div>
                      {dueDate && (
                        <div className="mb-2">
                          <p className="text-xs text-gray-400 uppercase tracking-wider">Due Date</p>
                          <p className="text-sm font-medium text-gray-700">{displayDate(dueDate)}</p>
                        </div>
                      )}
                      {(periodStart || periodEnd) && (
                        <div>
                          <p className="text-xs text-gray-400 uppercase tracking-wider">Period</p>
                          <p className="text-sm font-medium text-gray-700">
                            {displayDate(periodStart)} – {displayDate(periodEnd)}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Line items */}
                <div className="px-8 py-4 border-b border-gray-100">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-400 uppercase tracking-wider border-b border-gray-100">
                        <th className="text-left py-2">Description</th>
                        <th className="text-right py-2">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bookings.map(b => (
                        <tr key={b.bookingId} className="border-b border-gray-50 last:border-0">
                          <td className="py-2">
                            <p className="font-medium text-gray-700">Booking ID {b.bookingRef}</p>
                            <p className="text-gray-400">
                              {b.duties.length} {b.duties.length === 1 ? 'duty' : 'duties'} · {b.dateRange}
                            </p>
                            {b.customDescription && (
                              <p className="text-gray-400 mt-0.5">{b.customDescription}</p>
                            )}
                          </td>
                          <td className="py-2 text-right text-gray-700 font-medium whitespace-nowrap">
                            {formatINR(bookingAmount(b.duties))}
                          </td>
                        </tr>
                      ))}
                      {customRows.map(r => (
                        <tr key={r.key} className="border-b border-gray-50 last:border-0">
                          <td className="py-2 font-medium text-gray-700">
                            {r.taxable ? 'Taxable charge' : 'Non-taxable charge'}
                          </td>
                          <td className="py-2 text-right text-gray-700 font-medium whitespace-nowrap">
                            {formatINR(num(r.amount))}
                          </td>
                        </tr>
                      ))}
                      {bookings.length === 0 && customRows.length === 0 && (
                        <tr><td colSpan={2} className="py-4 text-center text-gray-400">
                          No line items yet
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Totals */}
                <div className="px-8 py-4">
                  <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                    <span>Subtotal</span>
                    <span>{formatINR(shown.subtotal)}</span>
                  </div>
                  {shown.discountTotal > 0 && (
                    <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                      <span>Discount</span>
                      <span>– {formatINR(shown.discountTotal)}</span>
                    </div>
                  )}
                  {taxRows.map((row, i) => (
                    <div key={row.key} className="flex justify-between text-xs text-gray-500 mb-1.5">
                      <span>{row.label}</span>
                      <span>{formatINR(totals.taxAmounts[i] ?? 0)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm font-bold text-gray-900 pt-3 border-t border-gray-200 mt-2">
                    <span>Total Due</span>
                    <span>{formatINR(shown.total)}</span>
                  </div>
                  <p className="mt-2 text-xs text-gray-500">{amountInWords(shown.total)}</p>
                </div>

                {/* Footer */}
                <div className="bg-gray-50 px-8 py-3 text-center">
                  <p className="text-xs text-gray-400">
                    Thank you for your business{company?.name ? ` · ${company.name}` : ''}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <AddBookingsDrawer
        open={bookingsDrawerOpen}
        onClose={() => setBookingsDrawerOpen(false)}
        customerName={customerName}
        excludeBookingIds={bookings.map(b => b.bookingId)}
        onAdd={addBookings}
      />

      {/* close the add-row dropdown on outside click */}
      {addRowMenuOpen && (
        <div className="fixed inset-0 z-10" onClick={() => setAddRowMenuOpen(false)} />
      )}
    </div>
  )
}
