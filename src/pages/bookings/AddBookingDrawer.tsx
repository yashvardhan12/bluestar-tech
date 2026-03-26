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
  label, required, placeholder, value, onChange, type = 'text', readOnly, hint, error,
}: {
  label: string; required?: boolean; placeholder?: string
  value: string; onChange: (v: string) => void
  type?: string; readOnly?: boolean; hint?: string; error?: string
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
          'shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)]',
          error  ? 'border-red-400 focus:border-red-400 focus:ring-4 focus:ring-red-100' :
          'border-gray-300 focus:border-violet-400 focus:ring-4 focus:ring-violet-100',
          readOnly && 'bg-gray-50 text-gray-500 cursor-default',
        )}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      {!error && hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  )
}

function SelectField({
  label, required, placeholder, value, onChange, options, readOnly,
}: {
  label: string; required?: boolean; placeholder?: string
  value: string; onChange: (v: string) => void; options?: string[]
  readOnly?: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label required={required}>{label}</Label>
      <select
        disabled={readOnly}
        value={value}
        onChange={e => onChange(e.target.value)}
        className={clsx(
          'w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 outline-none transition-shadow appearance-none',
          'shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)]',
          !readOnly && 'focus:border-violet-400 focus:ring-4 focus:ring-violet-100 bg-white',
          readOnly && 'bg-gray-50 text-gray-500 cursor-default',
          !value && 'text-gray-400',
        )}
        style={{ backgroundImage: readOnly ? 'none' : "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='1.75'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
      >
        <option value="" disabled>{placeholder ?? 'Select one'}</option>
        {options?.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

function TextareaField({
  label, required, placeholder, value, onChange, readOnly,
}: {
  label: string; required?: boolean; placeholder?: string
  value: string; onChange: (v: string) => void
  readOnly?: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label required={required}>{label}</Label>
      <textarea
        readOnly={readOnly}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className={clsx(
          'w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 outline-none transition-shadow shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)]',
          readOnly ? 'bg-gray-50 text-gray-500 cursor-default resize-none' : 'focus:border-violet-400 focus:ring-4 focus:ring-violet-100 resize-y',
        )}
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

export type BookingDrawerMode = 'add' | 'edit' | 'view'

interface AddBookingDrawerProps {
  open: boolean
  onClose: () => void
  onCreated?: () => void
  mode?: BookingDrawerMode
  bookingId?: number
}

// ── component ─────────────────────────────────────────────────────────────────

export default function AddBookingDrawer({ open, onClose, onCreated, mode = 'add', bookingId }: AddBookingDrawerProps) {
  const [activeMode, setActiveMode] = useState<BookingDrawerMode>(mode)

  // Sync activeMode when the drawer opens or mode prop changes
  useEffect(() => { if (open) setActiveMode(mode) }, [open, mode])

  const readOnly = activeMode === 'view'

  // Escape key
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // ── booking ref ──────────────────────────────────────────────────────────────
  const [bookingRef, setBookingRef] = useState('')

  useEffect(() => {
    if (!open) return
    if (activeMode === 'add') {
      supabase
        .from('bookings')
        .select('booking_ref')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data }) => {
          const last = data?.booking_ref ?? 'BK-00000'
          const num  = parseInt(last.replace('BK-', ''), 10) || 0
          setBookingRef(`BK-${String(num + 1).padStart(5, '0')}`)
        })
    }
  }, [open, mode])

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

  // ── reference data from DB ───────────────────────────────────────────────────
  const [vehicleGroups, setVehicleGroups] = useState<string[]>([])
  const [customers, setCustomers]         = useState<string[]>([])
  const [dutyTypes, setDutyTypes]         = useState<string[]>([])
  useEffect(() => {
    supabase.from('vehicle_groups').select('name').order('name').then(({ data }) => {
      if (data) setVehicleGroups(data.map((r: { name: string }) => r.name))
    })
    supabase.from('customers').select('name').order('name').then(({ data }) => {
      if (data) setCustomers(data.map((r: { name: string }) => r.name))
    })
    supabase.from('duty_types').select('type_name').order('type_name').then(({ data }) => {
      if (data) setDutyTypes(data.map((r: { type_name: string }) => r.type_name))
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

  // ── duty category (derived from selected duty type) ───────────────────────────
  const [dutyCategory, setDutyCategory] = useState('')

  useEffect(() => {
    if (!dutyType) { setDutyCategory(''); return }
    supabase.from('duty_types').select('category').eq('type_name', dutyType).maybeSingle()
      .then(({ data }) => setDutyCategory(data?.category ?? ''))
  }, [dutyType])

  function handleStartDateChange(v: string) {
    setStartDate(v)
    if (dutyCategory === 'Airport') {
      // Auto-set end date to start date; cap if already set beyond +1
      if (!endDate || endDate < v) { setEndDate(v); return }
      const max = new Date(v); max.setDate(max.getDate() + 1)
      const maxStr = max.toISOString().split('T')[0]
      if (endDate > maxStr) setEndDate(maxStr)
    }
  }

  function handleEndDateChange(v: string) {
    if (dutyCategory === 'Airport' && startDate) {
      const max = new Date(startDate); max.setDate(max.getDate() + 1)
      const maxStr = max.toISOString().split('T')[0]
      setEndDate(v > maxStr ? maxStr : v)
    } else {
      setEndDate(v)
    }
  }

  async function createDuties(bookingId: number) {
    const base = {
      booking_id:        bookingId,
      duty_type:         dutyType || null,
      vehicle_group:     vehicleGroup || null,
      from_location:     fromLocation || null,
      to_location:       toLocation || null,
      reporting_address: reportingAddress || null,
      drop_address:      dropAddress || null,
      reporting_time:    reportingTime || null,
      est_drop_time:     estDropTime || null,
      garage_start_mins: garageStart ? parseInt(garageStart) : null,
      base_rate:         baseRate ? parseFloat(baseRate) : null,
      extra_km_rate:     extraKmRate ? parseFloat(extraKmRate) : null,
      extra_hour_rate:   extraHourRate ? parseFloat(extraHourRate) : null,
      bill_to:           billTo || null,
      operator_notes:    operatorNotes || null,
      driver_notes:      driverNotes || null,
      status:            'Booked',
    }

    if (dutyCategory === 'Airport' || dutyCategory === 'Outstation') {
      return supabase.from('duties').insert({ ...base, start_date: startDate, end_date: endDate })
    } else {
      // Hourly / Monthly: one duty per day
      const rows = []
      const cur = new Date(startDate)
      const end = new Date(endDate)
      while (cur <= end) {
        const d = cur.toISOString().split('T')[0]
        rows.push({ ...base, start_date: d, end_date: d })
        cur.setDate(cur.getDate() + 1)
      }
      return rows.length > 0
        ? supabase.from('duties').insert(rows)
        : Promise.resolve({ error: null })
    }
  }

  // ── fetch existing booking for edit/view ─────────────────────────────────────
  useEffect(() => {
    if (!open || mode === 'add' || !bookingId) return
    supabase
      .from('bookings')
      .select(`*, booking_passengers(name, phone, sort_order)`)
      .eq('id', bookingId)
      .single()
      .then(({ data: b }) => {
        if (!b) return
        setBookingRef(b.booking_ref ?? '')
        setCustomer(b.customer_name ?? '')
        setBookedByName(b.booked_by_name ?? '')
        setBookedByPhone(b.booked_by_phone ?? '')
        setBookedByEmail(b.booked_by_email ?? '')
        setDutyType(b.duty_type ?? '')
        setVehicleGroup(b.vehicle_group ?? '')
        setAltVehicles(b.assign_alternate_vehicles ?? false)
        setFromLocation(b.from_location ?? '')
        setToLocation(b.to_location ?? '')
        setReportingAddress(b.reporting_address ?? '')
        setDropAddress(b.drop_address ?? '')
        setBookingType(b.booking_type === 'outstation' ? 'outstation' : 'local')
        setIsAirport(b.is_airport_booking ?? false)
        setStartDate(b.start_date ?? '')
        setEndDate(b.end_date ?? '')
        setReportingTime(b.reporting_time ?? '')
        setEstDropTime(b.est_drop_time ?? '')
        setGarageStart(b.garage_start_mins != null ? String(b.garage_start_mins) : '')
        setBaseRate(b.base_rate != null ? String(b.base_rate) : '')
        setExtraKmRate(b.extra_km_rate != null ? String(b.extra_km_rate) : '')
        setExtraHourRate(b.extra_hour_rate != null ? String(b.extra_hour_rate) : '')
        setBillTo(b.bill_to ?? '')
        setOperatorNotes(b.operator_notes ?? '')
        setDriverNotes(b.driver_notes ?? '')
        setSendConfirmation(b.send_confirmation ?? false)
        const sorted = [...(b.booking_passengers ?? [])].sort((a: any, b: any) => a.sort_order - b.sort_order)
        setPassengers(sorted.length > 0 ? sorted.map((p: any) => ({ name: p.name ?? '', phone: p.phone ?? '' })) : [{ name: '', phone: '' }])
      })
  }, [open, mode, bookingId])

  function resetForm() {
    setBookingRef('')
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

  const bookingPayload = {
    customer_name:             customer,
    booked_by_name:            bookedByName || null,
    booked_by_phone:           bookedByPhone || null,
    booked_by_email:           bookedByEmail || null,
    duty_type:                 dutyType || null,
    vehicle_group:             vehicleGroup || null,
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
  }

  async function handleSubmit() {
    if (!customer || !startDate || !endDate || !reportingTime || !estDropTime) {
      setError('Customer, Start Date, End Date, Reporting Time, and Drop Time are required.')
      return
    }
    if (dutyCategory === 'Airport' && startDate && endDate) {
      const max = new Date(startDate); max.setDate(max.getDate() + 1)
      if (endDate > max.toISOString().split('T')[0]) {
        setError('Airport bookings can only extend 1 day beyond the start date.')
        return
      }
    }
    setSaving(true)
    setError(null)

    if (activeMode === 'edit' && bookingId) {
      // Update existing booking
      const { error: updateErr } = await supabase
        .from('bookings')
        .update({ booking_ref: bookingRef || undefined, ...bookingPayload })
        .eq('id', bookingId)
      if (updateErr) {
        setError('Failed to update booking. Please try again.')
        setSaving(false)
        return
      }
      // Replace passengers: delete old, insert new
      await supabase.from('booking_passengers').delete().eq('booking_id', bookingId)
      const validPassengers = passengers.filter(p => p.name || p.phone)
      if (validPassengers.length > 0) {
        await supabase.from('booking_passengers').insert(
          validPassengers.map((p, i) => ({ booking_id: bookingId, name: p.name || null, phone: p.phone || null, sort_order: i }))
        )
      }
      setSaving(false)
      onCreated?.()
      onClose()
      return
    }

    // Insert booking row
    const { data: booking, error: bookingErr } = await supabase
      .from('bookings')
      .insert({ booking_ref: bookingRef || '', ...bookingPayload })
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

    // Auto-create duties based on category
    if (dutyCategory && startDate && endDate) {
      const { error: dutiesErr } = await createDuties(booking.id)
      if (dutiesErr) console.error('[AddBookingDrawer] duties insert failed:', dutiesErr)
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
            <h2 className="text-xl font-semibold text-gray-900">
              {activeMode === 'edit' ? 'Edit Booking' : activeMode === 'view' ? 'View Booking' : 'Add Booking'}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {activeMode === 'edit' ? 'Update the booking details below' : activeMode === 'view' ? 'Booking details' : 'Fill in the details to create a new booking'}
            </p>
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
            <InputField label="Booking ID" value={bookingRef} onChange={setBookingRef} placeholder="e.g. BK-00001" readOnly={readOnly} />
            <SelectField
              label="Customer" required={!readOnly}
              placeholder="Select Customer"
              value={customer} onChange={setCustomer}
              options={customers}
            />

            {/* Booked by */}
            <SectionCard title="Booked by">
              <InputField label="Booked by Name" placeholder="John Doe" value={bookedByName} onChange={setBookedByName} readOnly={readOnly} />
              <InputField label="Booked by Phone Number" placeholder="9876543210" value={bookedByPhone} onChange={setBookedByPhone} type="tel" readOnly={readOnly} />
              <InputField label="Booked by Email" placeholder="name@company.com" value={bookedByEmail} onChange={setBookedByEmail} type="email" readOnly={readOnly} />
              {!readOnly && (
                <div className="flex items-center gap-3">
                  <Toggle checked={sameAsPassenger} onChange={() => setSameAsPassenger(v => !v)} />
                  <span className="text-sm font-medium text-gray-700">Use the same details for passenger</span>
                </div>
              )}
            </SectionCard>

            {/* Passenger Details */}
            <SectionCard title="Passenger Details">
              {passengers.map((p, i) => (
                <div key={i} className="flex flex-col gap-4">
                  {i > 0 && <div className="border-t border-gray-200 -mx-1" />}
                  <InputField
                    label="Passenger Name" placeholder="John Doe" readOnly={readOnly}
                    value={sameAsPassenger && i === 0 ? bookedByName : p.name}
                    onChange={v => updatePassenger(i, 'name', v)}
                  />
                  <InputField
                    label="Passenger Phone Number" placeholder="9876543210" type="tel" readOnly={readOnly}
                    value={sameAsPassenger && i === 0 ? bookedByPhone : p.phone}
                    onChange={v => updatePassenger(i, 'phone', v)}
                  />
                </div>
              ))}
              {!readOnly && (
                <button
                  type="button"
                  onClick={addPassenger}
                  className="flex items-center gap-1.5 px-3.5 py-2 border border-gray-300 rounded-lg bg-white text-sm font-semibold text-gray-700 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] hover:bg-gray-50 transition-colors cursor-pointer w-fit"
                >
                  <Plus className="size-4" strokeWidth={2} />
                  Add more
                </button>
              )}
            </SectionCard>

            {/* Duty type + Vehicle group */}
            <SelectField
              label="Duty Type" required={!readOnly} placeholder="Select one"
              value={dutyType} onChange={setDutyType}
              options={dutyTypes} readOnly={readOnly}
            />
            <SelectField
              label="Vehicle Group" required={!readOnly} placeholder="Select one"
              value={vehicleGroup} onChange={setVehicleGroup}
              options={vehicleGroups} readOnly={readOnly}
            />

            {/* Alt vehicle checkbox */}
            <label className={clsx('flex items-start gap-3 border border-gray-200 rounded-xl p-4 transition-colors', !readOnly && 'cursor-pointer hover:bg-gray-50')}>
              <input
                type="checkbox"
                checked={altVehicles}
                onChange={() => !readOnly && setAltVehicles(v => !v)}
                disabled={readOnly}
                className="mt-0.5 size-4 rounded border-gray-300 accent-violet-600 shrink-0 disabled:cursor-default"
              />
              <div>
                <p className="text-sm font-medium text-gray-700">Assign Alternate Vehicle Numbers for multiple duties per day</p>
                <p className="text-xs text-gray-500 mt-0.5">Alternate vehicle numbers will only show on generated duty slips</p>
              </div>
            </label>

            {/* From / To */}
            <div className="grid grid-cols-2 gap-4">
              <SelectField
                label="From (Service Location)" required={!readOnly} placeholder="Location"
                value={fromLocation} onChange={setFromLocation}
                options={['Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Hyderabad']}
                readOnly={readOnly}
              />
              <SelectField
                label="To" placeholder="Location"
                value={toLocation} onChange={setToLocation}
                options={['Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Hyderabad']}
                readOnly={readOnly}
              />
            </div>

            {/* Reporting / Drop address */}
            <TextareaField
              label="Reporting Address" required={!readOnly}
              placeholder="Location (Google map link)"
              value={reportingAddress} onChange={setReportingAddress}
              readOnly={readOnly}
            />
            <TextareaField
              label="Drop Address" required={!readOnly}
              placeholder="Location (Google map link)"
              value={dropAddress} onChange={setDropAddress}
              readOnly={readOnly}
            />

            {/* Booking type */}
            <div className="grid grid-cols-2 gap-3">
              {(['local', 'outstation'] as const).map(type => (
                <div
                  key={type}
                  onClick={() => !readOnly && setBookingType(type)}
                  className={clsx(
                    'flex items-start gap-3 border-2 rounded-xl p-4 transition-colors',
                    bookingType === type ? 'border-violet-400 bg-violet-50' : 'border-gray-200 bg-white',
                    !readOnly && 'cursor-pointer hover:bg-gray-50',
                    readOnly && 'cursor-default',
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
                </div>
              ))}
            </div>

            {/* Airport checkbox */}
            <label className={clsx('flex items-center gap-3', !readOnly && 'cursor-pointer')}>
              <input
                type="checkbox"
                checked={isAirport}
                onChange={() => !readOnly && setIsAirport(v => !v)}
                disabled={readOnly}
                className="size-4 rounded border-gray-300 accent-violet-600 shrink-0 disabled:cursor-default"
              />
              <span className="text-sm font-medium text-gray-700">This is an airport booking</span>
            </label>

            {/* Duration Details */}
            <SectionCard title="Duration Details">
              <div className="grid grid-cols-2 gap-4">
                <InputField label="Start Date" required={!readOnly} placeholder="DD/MM/YYYY" type="date" value={startDate} onChange={handleStartDateChange} readOnly={readOnly} />
                <InputField label="End Date" required={!readOnly} placeholder="DD/MM/YYYY" type="date" value={endDate} onChange={handleEndDateChange} readOnly={readOnly}
                  error={(() => {
                    if (!readOnly && dutyCategory === 'Airport' && startDate && endDate) {
                      const max = new Date(startDate); max.setDate(max.getDate() + 1)
                      if (endDate > max.toISOString().split('T')[0])
                        return 'Airport bookings can only extend 1 day beyond the start date'
                    }
                  })()}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <InputField label="Reporting Time" required={!readOnly} placeholder="HH:MM" type="time" value={reportingTime} onChange={setReportingTime} readOnly={readOnly} />
                <InputField label="Drop Time" required={!readOnly} placeholder="HH:MM" type="time" value={estDropTime} onChange={setEstDropTime} readOnly={readOnly} />
              </div>
              <SelectField
                label="Start from garage before (in mins)" required={!readOnly} placeholder="Select one"
                value={garageStart} onChange={setGarageStart}
                options={['15', '30', '45', '60', '90', '120']}
                readOnly={readOnly}
              />
            </SectionCard>

            {/* Pricing Details */}
            <SectionCard title="">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">Pricing Details</p>
                {!readOnly && (
                  <button
                    type="button"
                    className="flex items-center gap-1.5 text-sm font-semibold text-violet-700 hover:text-violet-800 transition-colors cursor-pointer"
                  >
                    <RefreshCw className="size-4" strokeWidth={1.75} />
                    Fetch from Contract
                  </button>
                )}
              </div>
              <InputField
                label="Base Rate" required={!readOnly}
                placeholder="Prefilled based on Duty Type"
                value={baseRate} onChange={setBaseRate}
                readOnly={readOnly}
              />
              <div className="grid grid-cols-2 gap-4">
                <InputField label="Per Extra KM Rate" required={!readOnly} placeholder="0.00" value={extraKmRate} onChange={setExtraKmRate} readOnly={readOnly} />
                <InputField label="Per Extra Hour Rate" required={!readOnly} placeholder="0.00" value={extraHourRate} onChange={setExtraHourRate} readOnly={readOnly} />
              </div>
              <SelectField
                label="Bill to" placeholder="Company/Customer (Default)"
                value={billTo} onChange={setBillTo}
                options={['Company (Default)', 'Customer', 'Split']}
                readOnly={readOnly}
              />
            </SectionCard>

            {/* Notes */}
            <TextareaField label="Operator Notes" placeholder="Add a note...." value={operatorNotes} onChange={setOperatorNotes} readOnly={readOnly} />
            <TextareaField label="Driver Notes" placeholder="Add a note...." value={driverNotes} onChange={setDriverNotes} readOnly={readOnly} />

            {/* Send confirmation */}
            {!readOnly && (
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendConfirmation}
                  onChange={() => setSendConfirmation(v => !v)}
                  className="size-4 rounded border-gray-300 accent-violet-600 cursor-pointer shrink-0"
                />
                <span className="text-sm font-medium text-gray-700">Send confirmation to customer</span>
              </label>
            )}

          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-gray-200 px-6 py-4">
          {error && (
            <p className="text-sm text-red-600 mb-3">{error}</p>
          )}
          <div className="flex items-center gap-3">
            {activeMode === 'view' ? (
              <div className="flex justify-end w-full">
                <button
                  type="button"
                  onClick={() => setActiveMode('edit')}
                  className="px-4 py-2.5 border border-gray-300 rounded-lg bg-white text-sm font-semibold text-gray-700 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  Edit
                </button>
              </div>
            ) : (
              <>
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
                  {saving ? 'Saving…' : activeMode === 'edit' ? 'Save Changes' : 'Create Booking'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
