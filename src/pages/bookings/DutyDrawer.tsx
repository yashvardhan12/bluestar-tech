import { useState, useEffect } from 'react'
import { X, RefreshCw } from 'lucide-react'
import { clsx } from 'clsx'
import { supabase } from '../../lib/supabase'

// ── shared field helpers ───────────────────────────────────────────────────────

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <div className="flex items-center gap-0.5">
      <span className="text-sm font-medium text-gray-700">{children}</span>
      {required && <span className="text-sm font-medium text-violet-600">*</span>}
    </div>
  )
}

function InputField({
  label, required, placeholder, value, onChange, readOnly, type = 'text',
}: {
  label: string; required?: boolean; placeholder?: string
  value: string; onChange?: (v: string) => void
  readOnly?: boolean; type?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label required={required}>{label}</Label>
      <input
        type={type}
        readOnly={readOnly}
        value={value}
        onChange={e => onChange?.(e.target.value)}
        placeholder={placeholder}
        className={clsx(
          'w-full px-3.5 py-2.5 border rounded-lg text-sm text-gray-900 placeholder:text-gray-400 outline-none transition-shadow',
          'border-gray-300 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)]',
          !readOnly && 'focus:border-violet-400 focus:ring-4 focus:ring-violet-100',
          readOnly && 'bg-gray-50 text-gray-500 cursor-default',
        )}
      />
    </div>
  )
}

function SelectField({
  label, required, placeholder, value, onChange, options, readOnly,
}: {
  label: string; required?: boolean; placeholder?: string
  value: string; onChange?: (v: string) => void
  options?: string[]; readOnly?: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label required={required}>{label}</Label>
      <select
        disabled={readOnly}
        value={value}
        onChange={e => onChange?.(e.target.value)}
        className={clsx(
          'w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 outline-none transition-shadow appearance-none',
          'shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] bg-white',
          !readOnly && 'focus:border-violet-400 focus:ring-4 focus:ring-violet-100',
          readOnly && 'bg-gray-50 text-gray-500 cursor-default',
          !value && 'text-gray-400',
        )}
        style={{
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='1.75'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 12px center',
        }}
      >
        <option value="" disabled>{placeholder ?? 'Select one'}</option>
        {options?.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

function TextareaField({
  label, required, placeholder, value, onChange, readOnly, rows = 4,
}: {
  label: string; required?: boolean; placeholder?: string
  value: string; onChange?: (v: string) => void
  readOnly?: boolean; rows?: number
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label required={required}>{label}</Label>
      <textarea
        readOnly={readOnly}
        value={value}
        onChange={e => onChange?.(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className={clsx(
          'w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 outline-none transition-shadow resize-y',
          'shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)]',
          !readOnly && 'focus:border-violet-400 focus:ring-4 focus:ring-violet-100',
          readOnly && 'bg-gray-50 text-gray-500 cursor-default',
        )}
      />
    </div>
  )
}

function SectionCard({
  title, action, children,
}: {
  title: string; action?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-base font-medium text-gray-900">{title}</p>
        {action}
      </div>
      {children}
    </div>
  )
}

// ── form state ────────────────────────────────────────────────────────────────

interface DutyForm {
  dutyType: string
  vehicleGroup: string
  fromLocation: string
  toLocation: string
  reportingAddress: string
  dropAddress: string
  startDate: string
  endDate: string
  reportingTime: string
  estDropTime: string
  garageStartMins: string
  baseRate: string
  extraKmRate: string
  extraHourRate: string
  billTo: string
  operatorNotes: string
  driverNotes: string
}

const EMPTY_FORM: DutyForm = {
  dutyType: '', vehicleGroup: '', fromLocation: '', toLocation: '',
  reportingAddress: '', dropAddress: '',
  startDate: '', endDate: '', reportingTime: '', estDropTime: '', garageStartMins: '',
  baseRate: '', extraKmRate: '', extraHourRate: '', billTo: '',
  operatorNotes: '', driverNotes: '',
}

// ── props ─────────────────────────────────────────────────────────────────────

export type DutyDrawerMode = 'add' | 'edit' | 'view'

interface DutyDrawerProps {
  open: boolean
  mode: DutyDrawerMode
  initial?: Partial<DutyForm>
  onClose: () => void
  onSave?: (form: DutyForm) => void
}

// ── component ─────────────────────────────────────────────────────────────────

export default function DutyDrawer({ open, mode, initial, onClose, onSave }: DutyDrawerProps) {
  const [form, setForm] = useState<DutyForm>({ ...EMPTY_FORM, ...initial })
  const [vehicleGroups, setVehicleGroups] = useState<string[]>([])

  useEffect(() => {
    supabase.from('vehicle_groups').select('name').order('name').then(({ data }) => {
      if (data) setVehicleGroups(data.map((r: { name: string }) => r.name))
    })
  }, [])

  // Reset when opened
  useEffect(() => {
    if (open) setForm({ ...EMPTY_FORM, ...initial })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Escape key
  useEffect(() => {
    function handler(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  const readOnly = mode === 'view'

  const title = mode === 'add' ? 'Add Duty' : mode === 'edit' ? 'Edit Duty' : 'View Duty'

  function field<K extends keyof DutyForm>(key: K) {
    return {
      value: form[key],
      onChange: readOnly ? undefined : (v: string) => setForm(prev => ({ ...prev, [key]: v })),
    }
  }

  return (
    <div
      className={clsx(
        'fixed inset-0 z-50 flex items-stretch justify-end transition-all duration-300',
        open ? 'pointer-events-auto' : 'pointer-events-none',
      )}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={clsx(
          'absolute inset-0 bg-gray-950/60 transition-opacity duration-300',
          open ? 'opacity-100' : 'opacity-0',
        )}
      />

      {/* Panel */}
      <div
        className={clsx(
          'relative flex flex-col w-[660px] h-full bg-white border-l border-gray-200',
          'shadow-[0px_20px_24px_-4px_rgba(16,24,40,0.08),0px_8px_8px_-4px_rgba(16,24,40,0.03)]',
          'transition-transform duration-300',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {/* Header */}
        <div className="relative flex items-start gap-2 px-6 pt-6 pb-0 shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-semibold leading-[30px] text-gray-900">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-3 p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <X className="size-5" strokeWidth={1.75} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-4">

          {/* Duty Type */}
          <SelectField label="Duty Type" required={!readOnly} placeholder="Select one" readOnly={readOnly}
            options={['250KM per day', '300KM per day', '4H 40KMs', '6H 60KMs', '8H 80KMs']}
            {...field('dutyType')}
          />

          {/* Vehicle Group */}
          <SelectField label="Vehicle Group" required={!readOnly} placeholder="Select one" readOnly={readOnly}
            options={vehicleGroups}
            {...field('vehicleGroup')}
          />

          {/* From / To */}
          <div className="grid grid-cols-2 gap-4">
            <SelectField label="From (Service Location)" required={!readOnly} placeholder="Location" readOnly={readOnly}
              options={['Mumbai', 'Pune', 'Delhi', 'Bangalore', 'Chennai']}
              {...field('fromLocation')}
            />
            <SelectField label="To" placeholder="Location" readOnly={readOnly}
              options={['Mumbai', 'Pune', 'Delhi', 'Bangalore', 'Chennai']}
              {...field('toLocation')}
            />
          </div>

          {/* Reporting Address */}
          <TextareaField label="Reporting Address" required={!readOnly} placeholder="Location (Google map link)" readOnly={readOnly}
            rows={3} {...field('reportingAddress')}
          />

          {/* Drop Address */}
          <TextareaField label="Drop Address" required={!readOnly} placeholder="Location (Google map link)" readOnly={readOnly}
            rows={3} {...field('dropAddress')}
          />

          {/* Duration Details */}
          <SectionCard title="Duration Details">
            <div className="grid grid-cols-2 gap-4">
              <InputField label="Start Date" required={!readOnly} placeholder="Date" type="date" readOnly={readOnly}
                {...field('startDate')}
              />
              <InputField label="End Date" required={!readOnly} placeholder="Date" type="date" readOnly={readOnly}
                {...field('endDate')}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <InputField label="Reporting Time" required={!readOnly} placeholder="Time" type="time" readOnly={readOnly}
                {...field('reportingTime')}
              />
              <InputField label="Est Drop Time" placeholder="Time" type="time" readOnly={readOnly}
                {...field('estDropTime')}
              />
            </div>
            <SelectField label="Start from garage before (in mins)" required={!readOnly} placeholder="Select one" readOnly={readOnly}
              options={['15', '20', '30', '45', '60', '90']}
              {...field('garageStartMins')}
            />
          </SectionCard>

          {/* Pricing Details */}
          <SectionCard
            title="Pricing Details"
            action={
              !readOnly && (
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-sm font-semibold text-violet-700 hover:text-violet-800 transition-colors cursor-pointer"
                >
                  <RefreshCw className="size-4" strokeWidth={1.75} />
                  Fetch from Contract
                </button>
              )
            }
          >
            <InputField label="Base Rate" required={!readOnly} placeholder="Prefilled based on Duty Type" readOnly={readOnly}
              {...field('baseRate')}
            />
            <div className="grid grid-cols-2 gap-4">
              <InputField label="Per Extra KM Rate" required={!readOnly} placeholder="Rate" readOnly={readOnly}
                {...field('extraKmRate')}
              />
              <InputField label="Per Extra Hour Rate" required={!readOnly} placeholder="Rate" readOnly={readOnly}
                {...field('extraHourRate')}
              />
            </div>
            <SelectField label="Bill to" placeholder="Company/Customer (Default)" readOnly={readOnly}
              options={['Company', 'Customer']}
              {...field('billTo')}
            />
          </SectionCard>

          {/* Operator Notes */}
          <TextareaField label="Operator Notes" placeholder="Add a note...." readOnly={readOnly}
            rows={4} {...field('operatorNotes')}
          />

          {/* Driver Notes */}
          <TextareaField label="Driver Notes" placeholder="Add a note...." readOnly={readOnly}
            rows={4} {...field('driverNotes')}
          />

        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-gray-200 px-6 py-4 flex gap-3">
          {mode === 'view' ? (
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-10 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Close
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 h-10 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => onSave?.(form)}
                className="flex-1 h-10 rounded-lg bg-violet-600 text-sm font-semibold text-white hover:bg-violet-700 transition-colors cursor-pointer"
              >
                {mode === 'edit' ? 'Save Changes' : 'Add Duty'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
