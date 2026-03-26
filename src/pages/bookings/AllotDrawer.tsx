import { useState, useEffect } from 'react'
import { X, Car } from 'lucide-react'
import { clsx } from 'clsx'
import { supabase } from '../../lib/supabase'

// ── types ─────────────────────────────────────────────────────────────────────

export interface MockVehicle {
  id: number
  modelName: string
  vehicleNumber: string
  vehicleGroup: string
  assignedDriver: { initials: string; name: string } | null
}

export interface MockDriver {
  id: number
  initials: string
  name: string
  phone: string
}


// ── shared avatar ─────────────────────────────────────────────────────────────

function Avatar({ initials, size = 'sm' }: { initials: string; size?: 'sm' | 'md' }) {
  return (
    <div className={clsx(
      'rounded-full bg-violet-100 flex items-center justify-center shrink-0',
      size === 'sm' ? 'size-8' : 'size-10',
    )}>
      <span className={clsx(
        'font-semibold text-violet-600',
        size === 'sm' ? 'text-xs' : 'text-sm',
      )}>
        {initials}
      </span>
    </div>
  )
}

// ── duty info row ─────────────────────────────────────────────────────────────

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
}

// ── component ─────────────────────────────────────────────────────────────────

export default function AllotDrawer({ open, duty, onClose, onAllot, bulkMode = false, bulkDutyCount, driverOnlyMode = false, currentVehicle }: AllotDrawerProps) {
  const [step, setStep] = useState<1 | 2>(driverOnlyMode ? 2 : 1)
  const [selectedVehicle, setSelectedVehicle] = useState<MockVehicle | null>(null)
  const [selectedDriver, setSelectedDriver] = useState<MockDriver | null>(null)
  const [vehicles, setVehicles] = useState<MockVehicle[]>([])
  const [drivers, setDrivers] = useState<MockDriver[]>([])

  // Fetch vehicles + drivers from Supabase when drawer opens
  useEffect(() => {
    if (!open) return

    let vehicleQuery = supabase
      .from('vehicles')
      .select('id, model_name, vehicle_number, vehicle_groups!inner(name)')
      .order('model_name')
    if (duty?.vehicleGroup) {
      vehicleQuery = vehicleQuery.eq('vehicle_groups.name', duty.vehicleGroup)
    }
    vehicleQuery.then(({ data }) => {
      if (data) {
        setVehicles(data.map((v: { id: number; model_name: string; vehicle_number: string }) => ({
          id: v.id,
          modelName: v.model_name,
          vehicleNumber: v.vehicle_number,
          vehicleGroup: duty?.vehicleGroup ?? '',
          assignedDriver: null,
        })))
      }
    })

    supabase
      .from('drivers')
      .select('id, name, initials, phone')
      .in('status', ['Active', 'Available'])
      .order('name')
      .then(({ data }) => {
        if (data) {
          setDrivers(data.map((d: { id: number; name: string; initials: string; phone: string | null }) => ({
            id: d.id,
            name: d.name,
            initials: d.initials,
            phone: d.phone ?? '',
          })))
        }
      })
  }, [open, duty?.vehicleGroup])

  // Reset when opened
  useEffect(() => {
    if (open) {
      setStep(driverOnlyMode ? 2 : 1)
      setSelectedVehicle(driverOnlyMode ? (currentVehicle ?? null) : null)
      setSelectedDriver(null)
    }
  }, [open, driverOnlyMode, currentVehicle])

  // Escape key
  useEffect(() => {
    function handler(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  function handleNext() {
    if (!selectedVehicle) return
    if (selectedVehicle.assignedDriver) {
      // Vehicle already has a driver — allot directly
      onAllot(selectedVehicle, null)
      onClose()
    } else {
      // No driver — go to step 2
      setStep(2)
    }
  }

  function handleSave() {
    const vehicle = driverOnlyMode ? (currentVehicle ?? selectedVehicle) : selectedVehicle
    if (!vehicle) return
    onAllot(vehicle, selectedDriver)
    onClose()
  }

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

  return (
    <div className={clsx(
      'fixed inset-0 z-50 flex items-stretch justify-end transition-all duration-300',
      open ? 'pointer-events-auto' : 'pointer-events-none',
    )}>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={clsx(
          'absolute inset-0 bg-gray-950/60 transition-opacity duration-300',
          open ? 'opacity-100' : 'opacity-0',
        )}
      />

      {/* Panel */}
      <div className={clsx(
        'relative flex flex-col w-[660px] h-full bg-white border-l border-gray-200',
        'shadow-[0px_20px_24px_-4px_rgba(16,24,40,0.08),0px_8px_8px_-4px_rgba(16,24,40,0.03)]',
        'transition-transform duration-300',
        open ? 'translate-x-0' : 'translate-x-full',
      )}>

        {/* ── Step 1: Assign Vehicle ── */}
        {step === 1 && (
          <>
            {/* Header */}
            <div className="relative flex items-start gap-2 px-6 pt-6 pb-0 shrink-0">
              <div className="flex-1 min-w-0 pt-0">
                <h2 className="text-xl font-semibold leading-[30px] text-gray-900">Assign Vehicle</h2>
                <p className="mt-1 text-sm font-normal text-gray-500 leading-5">
                  {bulkMode
                    ? 'Select a vehicle to assign to all duties in this booking'
                    : 'Select a vehicle from the list below to assign to this duty'}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="absolute right-4 top-3 p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <X className="size-5" strokeWidth={1.75} />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-6">

              {/* Duty info: single duty or bulk notice */}
              {bulkMode ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm text-amber-800">
                  The selected vehicle and driver will be assigned to{' '}
                  <span className="font-semibold">
                    {bulkDutyCount != null ? `all ${bulkDutyCount} duties` : 'all duties'}
                  </span>{' '}
                  in this booking.
                </div>
              ) : (
                <div className="border border-gray-200 rounded-xl overflow-hidden shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)]">
                  {infoRows.map((row, i) => (
                    <InfoRow key={row.label} label={row.label} value={row.value} alt={i % 2 === 0} tall={row.tall} />
                  ))}
                </div>
              )}

              {/* My Vehicles section */}
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="size-10 flex items-center justify-center rounded-md bg-white border border-gray-200">
                    <Car className="size-5 text-gray-500" strokeWidth={1.75} />
                  </div>
                  <div>
                    <p className="text-base font-medium text-gray-900">My Vehicles</p>
                    <p className="text-sm text-gray-500">Select from the list of available vehicles to assign to this duty</p>
                  </div>
                </div>

                <div className="border border-gray-200 rounded-xl overflow-hidden shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)]">
                  {/* Table header */}
                  <div className="grid grid-cols-[1fr_200px_160px] bg-gray-50 border-b border-gray-200">
                    <div className="px-6 py-3 text-xs font-medium text-gray-500">Model name</div>
                    <div className="px-6 py-3 text-xs font-medium text-gray-500">Assigned driver</div>
                    <div className="px-6 py-3 text-xs font-medium text-gray-500">Vehicle number</div>
                  </div>

                  {/* Rows */}
                  {vehicles.map(vehicle => {
                    const isSelected = selectedVehicle?.id === vehicle.id
                    return (
                      <button
                        key={vehicle.id}
                        type="button"
                        onClick={() => setSelectedVehicle(vehicle)}
                        className={clsx(
                          'grid grid-cols-[1fr_200px_160px] w-full h-[72px] border-b border-gray-200 text-left transition-colors cursor-pointer',
                          isSelected ? 'bg-violet-50 border-l-2 border-l-violet-600' : 'hover:bg-gray-50',
                        )}
                      >
                        <div className="px-6 flex items-center">
                          <span className="text-sm font-medium text-gray-900">{vehicle.modelName}</span>
                        </div>
                        <div className="px-6 flex items-center gap-3">
                          {vehicle.assignedDriver ? (
                            <>
                              <Avatar initials={vehicle.assignedDriver.initials} size="sm" />
                              <span className="text-sm text-gray-500">{vehicle.assignedDriver.name}</span>
                            </>
                          ) : (
                            <span className="text-sm text-gray-400">—</span>
                          )}
                        </div>
                        <div className="px-6 flex items-center">
                          <span className="text-sm text-gray-500">{vehicle.vehicleNumber}</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="shrink-0 border-t border-gray-200 px-6 py-4 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="h-10 px-4 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleNext}
                disabled={!selectedVehicle}
                className="h-10 px-4 rounded-lg bg-violet-600 text-sm font-semibold text-white hover:bg-violet-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </>
        )}

        {/* ── Step 2: Assign Driver ── */}
        {step === 2 && (
          <>
            {/* Header */}
            <div className="relative flex items-start gap-2 px-6 pt-6 pb-0 shrink-0">
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-semibold leading-[30px] text-gray-900">Assign Drivers</h2>
                <p className="mt-1 text-sm font-normal text-gray-500 leading-5">
                  Select from the list of available drivers to assign to this duty
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="absolute right-4 top-3 p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <X className="size-5" strokeWidth={1.75} />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
              <div className="border border-gray-200 rounded-xl overflow-hidden shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)]">
                {/* Table header */}
                <div className="grid grid-cols-[1fr_1fr] bg-gray-50 border-b border-gray-200">
                  <div className="px-6 py-3 text-xs font-medium text-gray-500">Name</div>
                  <div className="px-6 py-3 text-xs font-medium text-gray-500">Phone Numbers</div>
                </div>

                {/* Rows */}
                {drivers.map(driver => {
                  const isSelected = selectedDriver?.id === driver.id
                  return (
                    <button
                      key={driver.id}
                      type="button"
                      onClick={() => setSelectedDriver(driver)}
                      className={clsx(
                        'grid grid-cols-[1fr_1fr] w-full h-[72px] border-b border-gray-200 text-left transition-colors cursor-pointer',
                        isSelected ? 'bg-violet-50 border-l-2 border-l-violet-600' : 'hover:bg-gray-50',
                      )}
                    >
                      <div className="px-6 flex items-center gap-3">
                        <Avatar initials={driver.initials} size="md" />
                        <span className="text-sm font-medium text-gray-900">{driver.name}</span>
                      </div>
                      <div className="px-6 flex items-center">
                        <span className="text-sm text-gray-500">{driver.phone}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="shrink-0 border-t border-gray-200 px-6 py-4 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="h-10 px-4 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!selectedDriver}
                className="h-10 px-4 rounded-lg bg-violet-600 text-sm font-semibold text-white hover:bg-violet-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
