import { useState, useEffect } from 'react'
import { X, Plus, RefreshCw } from 'lucide-react'
import { clsx } from 'clsx'
import { supabase } from '../../lib/supabase'

// ── helpers ───────────────────────────────────────────────────────────────────

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <div className="flex items-center gap-0.5">
      <span className="text-sm font-medium text-gray-700">{children}</span>
      {required && <span className="text-sm font-medium text-violet-600">*</span>}
    </div>
  )
}

function InputField({
  label, required, placeholder, value, onChange, type = 'text', readOnly,
}: {
  label: string; required?: boolean; placeholder?: string
  value: string; onChange: (v: string) => void
  type?: string; readOnly?: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label required={required}>{label}</Label>
      <input
        type={type}
        readOnly={readOnly}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={clsx(
          'w-full px-3.5 py-2.5 border rounded-lg text-sm text-gray-900 placeholder:text-gray-400 outline-none transition-shadow',
          'border-gray-300 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)]',
          'focus:border-violet-400 focus:ring-4 focus:ring-violet-100',
          readOnly && 'bg-gray-50 text-gray-500 cursor-default',
        )}
      />
    </div>
  )
}

function SelectField({
  label, required, placeholder, value, onChange, options,
}: {
  label: string; required?: boolean; placeholder?: string
  value: string; onChange: (v: string) => void; options?: string[]
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label required={required}>{label}</Label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={clsx(
          'w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 outline-none transition-shadow appearance-none',
          'shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] bg-white',
          'focus:border-violet-400 focus:ring-4 focus:ring-violet-100',
          !value && 'text-gray-400',
        )}
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='1.75'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
      >
        <option value="" disabled>{placeholder ?? 'Select one'}</option>
        {options?.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

function TextareaField({
  label, required, placeholder, value, onChange,
}: {
  label: string; required?: boolean; placeholder?: string
  value: string; onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label required={required}>{label}</Label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 outline-none transition-shadow shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] focus:border-violet-400 focus:ring-4 focus:ring-violet-100 resize-y"
      />
    </div>
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex flex-col gap-4">
      <p className="text-sm font-medium text-gray-700">{title}</p>
      {children}
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={clsx(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
        checked ? 'bg-violet-600' : 'bg-gray-200',
      )}
    >
      <span
        className={clsx(
          'inline-block size-4 rounded-full bg-white shadow-sm transition-transform duration-200',
          checked ? 'translate-x-4' : 'translate-x-0',
        )}
      />
    </button>
  )
}

// ── props ─────────────────────────────────────────────────────────────────────

interface AddBookingDrawerProps {
  open: boolean
  onClose: () => void
  onCreated?: () => void
}

// ── component ─────────────────────────────────────────────────────────────────

export default function AddBookingDrawer({ open, onClose, onCreated }: AddBookingDrawerProps) {
  // Escape key
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // ── form state ──────────────────────────────────────────────────────────────
  const [customer, setCustomer]               = useState('')
  const [bookedByName, setBookedByName]       = useState('')
  const [bookedByPhone, setBookedByPhone]     = useState('')
  const [bookedByEmail, setBookedByEmail]     = useState('')
  const [sameAsPassenger, setSameAsPassenger] = useState(false)

  const [passengers, setPassengers] = useState([{ name: '', phone: '' }])

  const [dutyType, setDutyType]         = useState('')
  const [vehicleGroup, setVehicleGroup] = useState('')
  const [altVehicles, setAltVehicles]   = useState(false)

  // ── vehicle groups from DB ───────────────────────────────────────────────────
  const [vehicleGroups, setVehicleGroups] = useState<string[]>([])
  useEffect(() => {
    supabase.from('vehicle_groups').select('name').order('name').then(({ data }) => {
      if (data) setVehicleGroups(data.map((r: { name: string }) => r.name))
    })
  }, [])

  const [fromLocation, setFromLocation]         = useState('')
  const [toLocation, setToLocation]             = useState('')
  const [reportingAddress, setReportingAddress] = useState('')
  const [dropAddress, setDropAddress]           = useState('')

  const [bookingType, setBookingType] = useState<'local' | 'outstation'>('local')
  const [isAirport, setIsAirport]     = useState(false)

  const [startDate, setStartDate]         = useState('')
  const [endDate, setEndDate]             = useState('')
  const [reportingTime, setReportingTime] = useState('')
  const [estDropTime, setEstDropTime]     = useState('')
  const [garageStart, setGarageStart]     = useState('')

  const [baseRate, setBaseRate]           = useState('')
  const [extraKmRate, setExtraKmRate]     = useState('')
  const [extraHourRate, setExtraHourRate] = useState('')
  const [billTo, setBillTo]               = useState('')

  const [operatorNotes, setOperatorNotes]       = useState('')
  const [driverNotes, setDriverNotes]           = useState('')
  const [sendConfirmation, setSendConfirmation] = useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  function resetForm() {
    setCustomer(''); setBookedByName(''); setBookedByPhone(''); setBookedByEmail('')
    setSameAsPassenger(false); setPassengers([{ name: '', phone: '' }])
    setDutyType(''); setVehicleGroup(''); setAltVehicles(false)
    setFromLocation(''); setToLocation(''); setReportingAddress(''); setDropAddress('')
    setBookingType('local'); setIsAirport(false)
    setStartDate(''); setEndDate(''); setReportingTime(''); setEstDropTime(''); setGarageStart('')
    setBaseRate(''); setExtraKmRate(''); setExtraHourRate(''); setBillTo('')
    setOperatorNotes(''); setDriverNotes(''); setSendConfirmation(false)
    setError(null)
  }

  function addPassenger() {
    setPassengers(prev => [...prev, { name: '', phone: '' }])
  }

  function updatePassenger(i: number, field: 'name' | 'phone', val: string) {
    setPassengers(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: val } : p))
  }

  async function handleSubmit() {
    if (!customer || !startDate || !endDate) {
      setError('Customer, Start Date, and End Date are required.')
      return
    }
    setSaving(true)
    setError(null)

    // Insert booking row
    const { data: booking, error: bookingErr } = await supabase
      .from('bookings')
      .insert({
        customer_name:             customer,
        booked_by_name:            bookedByName || null,
        booked_by_phone:           bookedByPhone || null,
        booked_by_email:           bookedByEmail || null,
        duty_type:                 dutyType || null,
        assign_alternate_vehicles: altVehicles,
        booking_type:              bookingType,
        is_airport_booking:        isAirport,
        from_location:             fromLocation || null,
        to_location:               toLocation || null,
        reporting_address:         reportingAddress || null,
        drop_address:              dropAddress || null,
        start_date:                startDate,
        end_date:                  endDate,
        reporting_time:            reportingTime || null,
        est_drop_time:             estDropTime || null,
        garage_start_mins:         garageStart ? parseInt(garageStart) : null,
        base_rate:                 baseRate ? parseFloat(baseRate) : null,
        extra_km_rate:             extraKmRate ? parseFloat(extraKmRate) : null,
        extra_hour_rate:           extraHourRate ? parseFloat(extraHourRate) : null,
        bill_to:                   billTo || null,
        operator_notes:            operatorNotes || null,
        driver_notes:              driverNotes || null,
        send_confirmation:         sendConfirmation,
      })
      .select('id')
      .single()

    if (bookingErr || !booking) {
      console.error('[AddBookingDrawer] insert failed:', bookingErr)
      setError('Failed to create booking. Please try again.')
      setSaving(false)
      return
    }

    // Insert passengers
    const validPassengers = passengers.filter(p => p.name || p.phone)
    if (validPassengers.length > 0) {
      const { error: passErr } = await supabase
        .from('booking_passengers')
        .insert(validPassengers.map((p, i) => ({
          booking_id: booking.id,
          name:       p.name || null,
          phone:      p.phone || null,
          sort_order: i,
        })))
      if (passErr) console.error('[AddBookingDrawer] passengers insert failed:', passErr)
    }

    setSaving(false)
    resetForm()
    onCreated?.()
    onClose()
  }

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <div className={clsx('fixed inset-0 z-50 flex items-stretch justify-end', open ? 'pointer-events-auto' : 'pointer-events-none')}>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={clsx('absolute inset-0 bg-gray-950/60 transition-opacity duration-300', open ? 'opacity-100' : 'opacity-0')}
      />

      {/* Panel */}
      <div className={clsx(
        'relative flex flex-col w-[620px] h-full bg-white border-l border-gray-200 shadow-[0px_20px_24px_-4px_rgba(16,24,40,0.08),0px_8px_8px_-4px_rgba(16,24,40,0.03)] transition-transform duration-300',
        open ? 'translate-x-0' : 'translate-x-full',
      )}>

        {/* Header */}
        <div className="shrink-0 flex items-start justify-between px-6 pt-6 pb-5 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Add Booking</h2>
            <p className="mt-1 text-sm text-gray-500">Fill in the details to create a new booking</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <X className="size-5" strokeWidth={1.75} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="flex flex-col gap-5">

            {/* Booking ID + Customer */}
            <InputField label="Booking ID" value="Auto-generated" onChange={() => {}} readOnly />
            <SelectField
              label="Customer" required
              placeholder="Select Customer"
              value={customer} onChange={setCustomer}
              options={['Apple', 'Mahindra', 'Expedia Services', 'Holceim', 'Larsen and Turbo']}
            />

            {/* Booked by */}
            <SectionCard title="Booked by">
              <InputField label="Booked by Name" placeholder="John Doe" value={bookedByName} onChange={setBookedByName} />
              <InputField label="Booked by Phone Number" placeholder="9876543210" value={bookedByPhone} onChange={setBookedByPhone} type="tel" />
              <InputField label="Booked by Email" placeholder="name@company.com" value={bookedByEmail} onChange={setBookedByEmail} type="email" />
              <div className="flex items-center gap-3">
                <Toggle checked={sameAsPassenger} onChange={() => setSameAsPassenger(v => !v)} />
                <span className="text-sm font-medium text-gray-700">Use the same details for passenger</span>
              </div>
            </SectionCard>

            {/* Passenger Details */}
            <SectionCard title="Passenger Details">
              {passengers.map((p, i) => (
                <div key={i} className="flex flex-col gap-4">
                  {i > 0 && <div className="border-t border-gray-200 -mx-1" />}
                  <InputField
                    label="Passenger Name" placeholder="John Doe"
                    value={sameAsPassenger && i === 0 ? bookedByName : p.name}
                    onChange={v => updatePassenger(i, 'name', v)}
                  />
                  <InputField
                    label="Passenger Phone Number" placeholder="9876543210" type="tel"
                    value={sameAsPassenger && i === 0 ? bookedByPhone : p.phone}
                    onChange={v => updatePassenger(i, 'phone', v)}
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={addPassenger}
                className="flex items-center gap-1.5 px-3.5 py-2 border border-gray-300 rounded-lg bg-white text-sm font-semibold text-gray-700 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] hover:bg-gray-50 transition-colors cursor-pointer w-fit"
              >
                <Plus className="size-4" strokeWidth={2} />
                Add more
              </button>
            </SectionCard>

            {/* Duty type + Vehicle group */}
            <SelectField
              label="Duty Type" required placeholder="Select one"
              value={dutyType} onChange={setDutyType}
              options={['250KM per day', '300KM per day', '4H 40KMs', '6H 60KMs', '8H 80KMs']}
            />
            <SelectField
              label="Vehicle Group" required placeholder="Select one"
              value={vehicleGroup} onChange={setVehicleGroup}
              options={vehicleGroups}
            />

            {/* Alt vehicle checkbox */}
            <label className="flex items-start gap-3 border border-gray-200 rounded-xl p-4 cursor-pointer hover:bg-gray-50 transition-colors">
              <input
                type="checkbox"
                checked={altVehicles}
                onChange={() => setAltVehicles(v => !v)}
                className="mt-0.5 size-4 rounded border-gray-300 accent-violet-600 cursor-pointer shrink-0"
              />
              <div>
                <p className="text-sm font-medium text-gray-700">Assign Alternate Vehicle Numbers for multiple duties per day</p>
                <p className="text-xs text-gray-500 mt-0.5">Alternate vehicle numbers will only show on generated duty slips</p>
              </div>
            </label>

            {/* From / To */}
            <div className="grid grid-cols-2 gap-4">
              <SelectField
                label="From (Service Location)" required placeholder="Location"
                value={fromLocation} onChange={setFromLocation}
                options={['Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Hyderabad']}
              />
              <SelectField
                label="To" placeholder="Location"
                value={toLocation} onChange={setToLocation}
                options={['Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Hyderabad']}
              />
            </div>

            {/* Reporting / Drop address */}
            <TextareaField
              label="Reporting Address" required
              placeholder="Location (Google map link)"
              value={reportingAddress} onChange={setReportingAddress}
            />
            <TextareaField
              label="Drop Address" required
              placeholder="Location (Google map link)"
              value={dropAddress} onChange={setDropAddress}
            />

            {/* Booking type */}
            <div className="grid grid-cols-2 gap-3">
              {(['local', 'outstation'] as const).map(type => (
                <label
                  key={type}
                  onClick={() => setBookingType(type)}
                  className={clsx(
                    'flex items-start gap-3 border-2 rounded-xl p-4 cursor-pointer transition-colors',
                    bookingType === type ? 'border-violet-400 bg-violet-50' : 'border-gray-200 bg-white hover:bg-gray-50',
                  )}
                >
                  <div className={clsx(
                    'mt-0.5 size-4 rounded-full border-2 shrink-0 flex items-center justify-center',
                    bookingType === type ? 'border-violet-600 bg-violet-600' : 'border-gray-300',
                  )}>
                    {bookingType === type && <span className="size-1.5 rounded-full bg-white block" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700 capitalize">{type} booking</p>
                    <p className="text-xs text-gray-500 mt-0.5">{type === 'local' ? 'Local rates would apply' : 'Outstation rates would apply'}</p>
                  </div>
                </label>
              ))}
            </div>

            {/* Airport checkbox */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isAirport}
                onChange={() => setIsAirport(v => !v)}
                className="size-4 rounded border-gray-300 accent-violet-600 cursor-pointer shrink-0"
              />
              <span className="text-sm font-medium text-gray-700">This is an airport booking</span>
            </label>

            {/* Duration Details */}
            <SectionCard title="Duration Details">
              <div className="grid grid-cols-2 gap-4">
                <InputField label="Start Date" required placeholder="DD/MM/YYYY" type="date" value={startDate} onChange={setStartDate} />
                <InputField label="End Date" required placeholder="DD/MM/YYYY" type="date" value={endDate} onChange={setEndDate} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <InputField label="Reporting Time" required placeholder="HH:MM" type="time" value={reportingTime} onChange={setReportingTime} />
                <InputField label="Est Drop Time" placeholder="HH:MM" type="time" value={estDropTime} onChange={setEstDropTime} />
              </div>
              <SelectField
                label="Start from garage before (in mins)" required placeholder="Select one"
                value={garageStart} onChange={setGarageStart}
                options={['15', '30', '45', '60', '90', '120']}
              />
            </SectionCard>

            {/* Pricing Details */}
            <SectionCard title="">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">Pricing Details</p>
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-sm font-semibold text-violet-700 hover:text-violet-800 transition-colors cursor-pointer"
                >
                  <RefreshCw className="size-4" strokeWidth={1.75} />
                  Fetch from Contract
                </button>
              </div>
              <InputField
                label="Base Rate" required
                placeholder="Prefilled based on Duty Type"
                value={baseRate} onChange={setBaseRate}
              />
              <div className="grid grid-cols-2 gap-4">
                <InputField label="Per Extra KM Rate" required placeholder="0.00" value={extraKmRate} onChange={setExtraKmRate} />
                <InputField label="Per Extra Hour Rate" required placeholder="0.00" value={extraHourRate} onChange={setExtraHourRate} />
              </div>
              <SelectField
                label="Bill to" placeholder="Company/Customer (Default)"
                value={billTo} onChange={setBillTo}
                options={['Company (Default)', 'Customer', 'Split']}
              />
            </SectionCard>

            {/* Notes */}
            <TextareaField label="Operator Notes" placeholder="Add a note...." value={operatorNotes} onChange={setOperatorNotes} />
            <TextareaField label="Driver Notes" placeholder="Add a note...." value={driverNotes} onChange={setDriverNotes} />

            {/* Send confirmation */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={sendConfirmation}
                onChange={() => setSendConfirmation(v => !v)}
                className="size-4 rounded border-gray-300 accent-violet-600 cursor-pointer shrink-0"
              />
              <span className="text-sm font-medium text-gray-700">Send confirmation to customer</span>
            </label>

          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-gray-200 px-6 py-4">
          {error && (
            <p className="text-sm text-red-600 mb-3">{error}</p>
          )}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg bg-white text-sm font-semibold text-gray-700 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="flex-1 px-4 py-2.5 bg-[#7f56d9] text-white text-sm font-semibold rounded-lg shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] hover:bg-[#6941c6] transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? 'Creating…' : 'Create Booking'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
