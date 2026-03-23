import { useState, useRef, useEffect } from 'react'
import { Search, Plus, Trash2, MoreHorizontal, ChevronDown, ChevronLeft, ChevronRight, UploadCloud } from 'lucide-react'
import { clsx } from 'clsx'
import Drawer from '../../components/ui/Drawer'
import { supabase } from '../../lib/supabase'

type Status = 'Active' | 'Inactive' | 'Assigned'

interface Vehicle {
  id: number
  modelName: string
  group: string
  assignedDriver: { initials: string; name: string; color: string } | null
  vehicleNumber: string
  status: Status
}

const AVATAR_COLORS: Record<string, string> = {
  JD: 'bg-blue-100 text-blue-700',
  AP: 'bg-pink-100 text-pink-700',
  DE: 'bg-orange-100 text-orange-700',
  MF: 'bg-teal-100 text-teal-700',
  RS: 'bg-red-100 text-red-700',
  CG: 'bg-violet-100 text-violet-700',
  BL: 'bg-green-100 text-green-700',
}

function avatarColor(initials: string) {
  return AVATAR_COLORS[initials] ?? 'bg-gray-100 text-gray-600'
}

const INITIAL_VEHICLES: Vehicle[] = [
  { id: 1,  modelName: 'Honda Jazz',      group: 'Jazz/City/Amaze', assignedDriver: { initials: 'JD', name: 'John Dukes',      color: avatarColor('JD') }, vehicleNumber: 'TN56EH1937', status: 'Active'   },
  { id: 2,  modelName: 'Honda City',      group: 'Jazz/City/Amaze', assignedDriver: null,                                                                    vehicleNumber: 'UK23KE8273', status: 'Inactive' },
  { id: 3,  modelName: 'Honda Amaze',     group: 'Jazz/City/Amaze', assignedDriver: { initials: 'AP', name: 'Autumn Phillips', color: avatarColor('AP') }, vehicleNumber: 'MP90AB8264', status: 'Active'   },
  { id: 4,  modelName: 'Hyundai Creta',   group: 'SUVs',            assignedDriver: { initials: 'DE', name: 'David Elson',     color: avatarColor('DE') }, vehicleNumber: 'HR26AJ6584', status: 'Assigned' },
  { id: 5,  modelName: 'Toyota Fortuner', group: 'SUVs',            assignedDriver: { initials: 'MF', name: 'Mary Freund',     color: avatarColor('MF') }, vehicleNumber: 'UP26AJ6584', status: 'Active'   },
  { id: 6,  modelName: 'Tata Nexon',      group: 'Hatchbacks',      assignedDriver: { initials: 'RS', name: 'Ricky Smith',     color: avatarColor('RS') }, vehicleNumber: 'MH56EH1937', status: 'Assigned' },
  { id: 7,  modelName: 'Hyundai i10',     group: 'Hatchbacks',      assignedDriver: { initials: 'CG', name: 'Chris Glasser',   color: avatarColor('CG') }, vehicleNumber: 'RJ90AB8264', status: 'Active'   },
  { id: 8,  modelName: 'Maruti Swift',    group: 'Hatchbacks',      assignedDriver: { initials: 'BL', name: 'Bradley Lawlor',  color: avatarColor('BL') }, vehicleNumber: 'PB23KE8273', status: 'Inactive' },
  { id: 9,  modelName: 'Maruti Baleno',   group: 'Hatchbacks',      assignedDriver: null,                                                                    vehicleNumber: 'DL01AB1234', status: 'Inactive' },
  { id: 10, modelName: 'Toyota Innova',   group: 'Toyota Innova',   assignedDriver: null,                                                                    vehicleNumber: 'MH02CD5678', status: 'Active'   },
]

const PAGE_SIZE = 8

function getPaginationPages(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  if (current <= 3) return [1, 2, 3, '...', total - 2, total - 1, total]
  if (current >= total - 2) return [1, 2, 3, '...', total - 2, total - 1, total]
  return [1, '...', current - 1, current, current + 1, '...', total]
}

function IndeterminateCheckbox({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean
  indeterminate: boolean
  onChange: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className="size-4 rounded border-gray-300 accent-violet-600 cursor-pointer"
    />
  )
}

function StatusBadge({ status }: { status: Status }) {
  if (status === 'Active') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
        <span className="size-1.5 rounded-full bg-green-500 shrink-0" />
        Active
      </span>
    )
  }
  if (status === 'Assigned') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
        <span className="size-1.5 rounded-full bg-blue-500 shrink-0" />
        Assigned
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium text-gray-500">
      <span className="size-1.5 rounded-full bg-gray-400 shrink-0" />
      Inactive
    </span>
  )
}

// ── Shared field sub-components ───────────────────────────────────────────────

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] text-base text-gray-900 placeholder:text-gray-400 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100 transition-shadow bg-white'

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-center gap-0.5 text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-violet-600">*</span>}
      </label>
      {children}
    </div>
  )
}

function SelectField({
  label,
  required,
  value,
  onChange,
  placeholder,
  options,
}: {
  label: string
  required?: boolean
  value: string
  onChange: (v: string) => void
  placeholder: string
  options: string[]
}) {
  return (
    <Field label={label} required={required}>
      <div className="relative">
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className={clsx(inputCls, 'appearance-none pr-9 cursor-pointer')}
        >
          <option value="">{placeholder}</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 size-5 text-gray-400 pointer-events-none" strokeWidth={1.75} />
      </div>
    </Field>
  )
}

function FileUpload({ label }: { label: string }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <div
        onClick={() => fileRef.current?.click()}
        className="bg-white border border-gray-200 rounded-xl py-4 px-6 flex flex-col items-center gap-3 cursor-pointer hover:bg-gray-50 transition-colors"
      >
        <div className="size-10 border border-gray-200 rounded-lg flex items-center justify-center shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)]">
          <UploadCloud className="size-5 text-gray-400" strokeWidth={1.75} />
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-1 text-sm">
            <span className="font-semibold text-violet-700">
              {fileName ?? 'Click to upload'}
            </span>
            {!fileName && <span className="text-gray-500 font-normal">or drag and drop</span>}
          </div>
          <p className="text-xs text-gray-500">JPG, PNG, DOC or PDF (max. 10MB)</p>
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".jpg,.jpeg,.png,.doc,.docx,.pdf"
        className="hidden"
        onChange={e => setFileName(e.target.files?.[0]?.name ?? null)}
      />
    </div>
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 flex flex-col gap-4">
      <p className="text-base font-medium text-gray-900">{title}</p>
      {children}
    </div>
  )
}

// ── Form state ────────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  modelName: '',
  vehicleNumber: '',
  fuelType: '',
  vehicleGroup: '',
  assignedDriver: '',
  fastagNumber: '',
  regOwnerName: '',
  regDate: '',
  insCompany: '',
  insPolicyNumber: '',
  insIssueDate: '',
  insDueDate: '',
  insPremium: '',
  insCover: '',
  rtoOwnerName: '',
  rtoRegDate: '',
  chassisNumber: '',
  engineNumber: '',
  carExpiryDate: '',
  hasLoan: false,
  notes: '',
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function VehiclesPage() {
  const [rows, setRows] = useState(INITIAL_VEHICLES)
  const [vehicleGroups, setVehicleGroups] = useState<{ id: number; name: string }[]>([])
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [page, setPage] = useState(1)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    const [vehiclesRes, groupsRes] = await Promise.all([
      supabase
        .from('vehicles')
        .select('id, model_name, vehicle_number, status, vehicle_group_id')
        .order('created_at', { ascending: false }),
      supabase
        .from('vehicle_groups')
        .select('id, name')
        .order('name'),
    ])

    if (groupsRes.data) setVehicleGroups(groupsRes.data)

    if (vehiclesRes.data && vehiclesRes.data.length > 0) {
      const groups: { id: number; name: string }[] = groupsRes.data ?? []
      const mapped: Vehicle[] = vehiclesRes.data.map((v: any) => ({
        id: v.id,
        modelName: v.model_name,
        group: groups.find(g => g.id === v.vehicle_group_id)?.name ?? '',
        assignedDriver: null,
        vehicleNumber: v.vehicle_number,
        status: v.status as Status,
      }))
      setRows(mapped)
    }
  }

  const filtered = rows.filter(v =>
    v.modelName.toLowerCase().includes(search.toLowerCase()) ||
    v.vehicleNumber.toLowerCase().includes(search.toLowerCase()),
  )
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const allSelected = pageRows.length > 0 && pageRows.every(r => selected.has(r.id))
  const someSelected = pageRows.some(r => selected.has(r.id)) && !allSelected

  function toggleAll() {
    setSelected(prev => {
      const next = new Set(prev)
      if (allSelected) pageRows.forEach(r => next.delete(r.id))
      else pageRows.forEach(r => next.add(r.id))
      return next
    })
  }

  function toggleRow(id: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleSearch(value: string) {
    setSearch(value)
    setPage(1)
  }

  function openDrawer() {
    setForm(EMPTY_FORM)
    setDrawerOpen(true)
  }

  function closeDrawer() {
    setDrawerOpen(false)
  }

  function set<K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleSave() {
    if (!form.modelName.trim() || !form.vehicleNumber.trim()) return
    setSaving(true)

    const groupId = vehicleGroups.find(g => g.name === form.vehicleGroup)?.id ?? null

    const { data, error } = await supabase
      .from('vehicles')
      .insert({
        model_name: form.modelName.trim(),
        vehicle_number: form.vehicleNumber.trim(),
        fuel_type: form.fuelType || null,
        vehicle_group_id: groupId,
        fastag_number: form.fastagNumber || null,
        status: 'Active',
        reg_owner_name: form.regOwnerName || null,
        reg_date: form.regDate || null,
        ins_company: form.insCompany || null,
        ins_policy_number: form.insPolicyNumber || null,
        ins_issue_date: form.insIssueDate || null,
        ins_due_date: form.insDueDate || null,
        ins_premium: form.insPremium ? Number(form.insPremium) : null,
        ins_cover: form.insCover ? Number(form.insCover) : null,
        rto_owner_name: form.rtoOwnerName || null,
        rto_reg_date: form.rtoRegDate || null,
        chassis_number: form.chassisNumber || null,
        engine_number: form.engineNumber || null,
        car_expiry_date: form.carExpiryDate || null,
        has_loan: form.hasLoan,
        notes: form.notes || null,
      })
      .select('id')
      .single()

    if (!error && data) {
      const newVehicle: Vehicle = {
        id: data.id,
        modelName: form.modelName.trim(),
        group: form.vehicleGroup,
        assignedDriver: null,
        vehicleNumber: form.vehicleNumber.trim(),
        status: 'Active',
      }
      setRows(prev => [newVehicle, ...prev])
    }
    setSaving(false)
    closeDrawer()
  }

  return (
    <div className="px-10 py-7 flex flex-col gap-6">

      {/* Section header */}
      <div className="border-b border-gray-200 pb-5 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-medium leading-[38px] text-gray-900">Vehicles</h2>
          <p className="text-base font-normal text-gray-500 leading-6">
            Create and manage your vehicle data here
          </p>
        </div>

        <div className="relative w-[400px] shrink-0">
          <Search
            className="absolute left-3.5 top-1/2 -translate-y-1/2 size-5 text-gray-400 pointer-events-none"
            strokeWidth={1.75}
          />
          <input
            type="text"
            placeholder="Search by model name, number"
            value={search}
            onChange={e => handleSearch(e.target.value)}
            className="w-full pl-[42px] pr-3.5 py-2.5 border border-gray-300 rounded-lg shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] text-base text-gray-900 placeholder:text-gray-400 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100 transition-shadow"
          />
        </div>

        <button
          onClick={openDrawer}
          className="flex items-center gap-1.5 px-3.5 py-2.5 bg-[#7f56d9] text-white text-sm font-semibold rounded-lg shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] cursor-pointer hover:bg-[#6941c6] transition-colors shrink-0"
        >
          <Plus className="size-5" strokeWidth={2} />
          Add vehicle
        </button>

        <button className="p-2.5 rounded-lg border border-gray-300 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] transition-colors cursor-pointer shrink-0">
          <MoreHorizontal className="size-5" strokeWidth={1.75} />
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="h-[44px] px-6 text-left border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <IndeterminateCheckbox
                    checked={allSelected}
                    indeterminate={someSelected}
                    onChange={toggleAll}
                  />
                  <button className="flex items-center gap-1 text-xs font-medium text-gray-600 cursor-pointer hover:text-gray-900 transition-colors">
                    Model name
                    <ChevronDown className="size-4 shrink-0" strokeWidth={1.75} />
                  </button>
                </div>
              </th>
              <th className="h-[44px] px-6 text-left w-[180px] border-b border-gray-200">
                <span className="text-xs font-medium text-gray-600">Group</span>
              </th>
              <th className="h-[44px] px-6 text-left w-[220px] border-b border-gray-200">
                <span className="text-xs font-medium text-gray-600">Assigned driver</span>
              </th>
              <th className="h-[44px] px-6 text-left w-[160px] border-b border-gray-200">
                <span className="text-xs font-medium text-gray-600">Vehicle number</span>
              </th>
              <th className="h-[44px] px-6 text-left w-[130px] border-b border-gray-200">
                <span className="text-xs font-medium text-gray-600">Status</span>
              </th>
              <th className="h-[44px] w-[68px] border-b border-gray-200" />
            </tr>
          </thead>
          <tbody>
            {pageRows.map(row => (
              <tr
                key={row.id}
                className="border-b border-gray-200 hover:bg-gray-50 transition-colors"
              >
                <td className="h-[72px] px-6 py-4">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={() => toggleRow(row.id)}
                      className="size-4 rounded border-gray-300 accent-violet-600 cursor-pointer"
                    />
                    <span className="text-sm font-medium text-gray-900">{row.modelName}</span>
                  </div>
                </td>
                <td className="h-[72px] px-6 py-4 text-sm font-normal text-gray-500">
                  {row.group || '–'}
                </td>
                <td className="h-[72px] px-6 py-4">
                  {row.assignedDriver ? (
                    <div className="flex items-center gap-2">
                      <span className={clsx('size-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0', row.assignedDriver.color)}>
                        {row.assignedDriver.initials}
                      </span>
                      <span className="text-sm font-normal text-gray-500">{row.assignedDriver.name}</span>
                    </div>
                  ) : (
                    <span className="text-sm text-gray-400">–</span>
                  )}
                </td>
                <td className="h-[72px] px-6 py-4 text-sm font-normal text-gray-500">
                  {row.vehicleNumber || '–'}
                </td>
                <td className="h-[72px] px-6 py-4">
                  <StatusBadge status={row.status} />
                </td>
                <td className="h-[72px] p-4">
                  <div className="flex items-center gap-1">
                    <button className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-gray-100 transition-colors cursor-pointer">
                      <Trash2 className="size-5" strokeWidth={1.75} />
                    </button>
                    <button className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer">
                      <MoreHorizontal className="size-5" strokeWidth={1.75} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {pageRows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-16 text-center text-sm text-gray-400">
                  No vehicles match your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="border-t border-gray-200 flex items-center justify-between px-6 pt-3 pb-4">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 bg-white shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            <ChevronLeft className="size-5" strokeWidth={1.75} />
            Previous
          </button>

          <div className="flex items-center gap-0.5">
            {getPaginationPages(page, totalPages).map((p, i) => (
              <button
                key={i}
                onClick={() => typeof p === 'number' && setPage(p)}
                disabled={p === '...'}
                className={clsx(
                  'size-10 rounded-lg text-sm font-medium flex items-center justify-center transition-colors',
                  p === page
                    ? 'bg-gray-50 text-gray-900 font-semibold'
                    : 'text-gray-600 hover:bg-gray-50',
                  p === '...' && 'cursor-default pointer-events-none',
                )}
              >
                {p}
              </button>
            ))}
          </div>

          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 bg-white shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            Next
            <ChevronRight className="size-5" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {/* Add Vehicle Drawer */}
      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        title="Vehicle"
        description="Add details of your vehicle"
        footer={
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={closeDrawer}
              className="px-3.5 py-2.5 border border-gray-300 rounded-lg bg-white text-sm font-semibold text-gray-700 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3.5 py-2.5 bg-[#7f56d9] text-white text-sm font-semibold rounded-lg shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] hover:bg-[#6941c6] transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">

          {/* Model Name */}
          <Field label="Model Name" required>
            <input
              type="text"
              placeholder="Honda Jazz"
              value={form.modelName}
              onChange={e => set('modelName', e.target.value)}
              className={inputCls}
            />
          </Field>

          {/* Vehicle Number */}
          <Field label="Vehicle Number" required>
            <input
              type="text"
              placeholder="TN56EH1937"
              value={form.vehicleNumber}
              onChange={e => set('vehicleNumber', e.target.value)}
              className={inputCls}
            />
          </Field>

          {/* Fuel Type */}
          <SelectField
            label="Fuel Type"
            required
            value={form.fuelType}
            onChange={v => set('fuelType', v)}
            placeholder="Select fuel type"
            options={['Petrol', 'Diesel', 'CNG', 'Electric', 'Hybrid']}
          />

          {/* Vehicle Group */}
          <SelectField
            label="Category - Vehicle Group"
            required
            value={form.vehicleGroup}
            onChange={v => set('vehicleGroup', v)}
            placeholder="Select vehicle group"
            options={vehicleGroups.map(g => g.name)}
          />

          {/* Assigned Driver */}
          <div className="flex flex-col gap-1.5">
            <Field label="Assigned Driver">
              <div className="relative">
                <select
                  value={form.assignedDriver}
                  onChange={e => set('assignedDriver', e.target.value)}
                  className={clsx(inputCls, 'appearance-none pr-9 cursor-pointer')}
                >
                  <option value="">None</option>
                  <option value="John Dukes">John Dukes</option>
                  <option value="Autumn Phillips">Autumn Phillips</option>
                  <option value="David Elson">David Elson</option>
                  <option value="Mary Freund">Mary Freund</option>
                  <option value="Ricky Smith">Ricky Smith</option>
                  <option value="Chris Glasser">Chris Glasser</option>
                  <option value="Bradley Lawlor">Bradley Lawlor</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 size-5 text-gray-400 pointer-events-none" strokeWidth={1.75} />
              </div>
            </Field>
            <p className="text-sm text-gray-500">
              If you don't assign a driver then you'll get an option to assign a driver for this vehicle during each booking
            </p>
          </div>

          {/* FASTag Number */}
          <Field label="FASTag Number" required>
            <input
              type="text"
              placeholder="987654321"
              value={form.fastagNumber}
              onChange={e => set('fastagNumber', e.target.value)}
              className={inputCls}
            />
          </Field>

          {/* Registration */}
          <SectionCard title="Registration">
            <Field label="Owner Name">
              <input type="text" placeholder="John Doe" value={form.regOwnerName} onChange={e => set('regOwnerName', e.target.value)} className={inputCls} />
            </Field>
            <Field label="Registration Date">
              <input type="date" value={form.regDate} onChange={e => set('regDate', e.target.value)} className={inputCls} />
            </Field>
            <FileUpload label="Registration Document" />
          </SectionCard>

          {/* Insurance */}
          <SectionCard title="Insurance">
            <Field label="Company Name">
              <input type="text" placeholder="Acko Insurance" value={form.insCompany} onChange={e => set('insCompany', e.target.value)} className={inputCls} />
            </Field>
            <Field label="Policy Number">
              <input type="text" placeholder="POL-123456" value={form.insPolicyNumber} onChange={e => set('insPolicyNumber', e.target.value)} className={inputCls} />
            </Field>
            <Field label="Issue Date">
              <input type="date" value={form.insIssueDate} onChange={e => set('insIssueDate', e.target.value)} className={inputCls} />
            </Field>
            <Field label="Due Date">
              <input type="date" value={form.insDueDate} onChange={e => set('insDueDate', e.target.value)} className={inputCls} />
            </Field>
            <Field label="Premium Amount">
              <input type="number" placeholder="0" value={form.insPremium} onChange={e => set('insPremium', e.target.value)} className={inputCls} />
            </Field>
            <Field label="Cover Amount">
              <input type="number" placeholder="0" value={form.insCover} onChange={e => set('insCover', e.target.value)} className={inputCls} />
            </Field>
            <FileUpload label="Insurance Document" />
          </SectionCard>

          {/* RTO */}
          <SectionCard title="RTO">
            <Field label="Owner Name">
              <input type="text" placeholder="John Doe" value={form.rtoOwnerName} onChange={e => set('rtoOwnerName', e.target.value)} className={inputCls} />
            </Field>
            <Field label="Registration Date">
              <input type="date" value={form.rtoRegDate} onChange={e => set('rtoRegDate', e.target.value)} className={inputCls} />
            </Field>
            <FileUpload label="Registration Documents" />
          </SectionCard>

          {/* Parts */}
          <SectionCard title="Parts">
            <Field label="Chassis Number">
              <input type="text" placeholder="829347234" value={form.chassisNumber} onChange={e => set('chassisNumber', e.target.value)} className={inputCls} />
            </Field>
            <Field label="Engine Number">
              <input type="text" placeholder="239847" value={form.engineNumber} onChange={e => set('engineNumber', e.target.value)} className={inputCls} />
            </Field>
          </SectionCard>

          {/* Car Expiry Date */}
          <Field label="Car Expiry Date">
            <input type="date" value={form.carExpiryDate} onChange={e => set('carExpiryDate', e.target.value)} className={inputCls} />
          </Field>

          {/* Loan */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-6">
            <div className="flex items-center justify-between">
              <p className="text-base font-medium text-gray-900">Loan</p>
              <button
                type="button"
                onClick={() => set('hasLoan', !form.hasLoan)}
                className={clsx(
                  'relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer shrink-0',
                  form.hasLoan ? 'bg-violet-600' : 'bg-gray-200',
                )}
              >
                <span
                  className={clsx(
                    'inline-block size-4 rounded-full bg-white shadow-[0px_1px_3px_0px_rgba(16,24,40,0.1),0px_1px_2px_0px_rgba(16,24,40,0.06)] transition-transform',
                    form.hasLoan ? 'translate-x-4' : 'translate-x-0.5',
                  )}
                />
              </button>
            </div>
          </div>

          {/* Attach Files */}
          <FileUpload label="Attach Files" />

          {/* Notes */}
          <Field label="Notes">
            <textarea
              placeholder="Add a note..."
              rows={5}
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              className={clsx(inputCls, 'resize-y')}
            />
          </Field>

        </div>
      </Drawer>
    </div>
  )
}
