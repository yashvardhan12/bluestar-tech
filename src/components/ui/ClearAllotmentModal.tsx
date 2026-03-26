import { useEffect } from 'react'
import { X, AlertCircle, Car, User } from 'lucide-react'

interface ClearAllotmentModalProps {
  open: boolean
  vehicleName?: string
  vehicleNumber?: string
  driverName?: string
  removing?: boolean
  onClose: () => void
  onConfirm: () => void
}

export default function ClearAllotmentModal({
  open,
  vehicleName,
  vehicleNumber,
  driverName,
  removing = false,
  onClose,
  onConfirm,
}: ClearAllotmentModalProps) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-8">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-[#0c111d]/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal card */}
      <div className="relative bg-white rounded-xl shadow-[0px_20px_24px_-4px_rgba(16,24,40,0.08),0px_8px_8px_-4px_rgba(16,24,40,0.03)] w-full max-w-[400px] overflow-hidden">

        {/* Decorative grid pattern top-left */}
        <div
          className="pointer-events-none absolute -left-[120px] -top-[120px] size-[336px]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(16,24,40,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(16,24,40,0.06) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            maskImage: 'radial-gradient(ellipse 60% 60% at 50% 50%, black 40%, transparent 100%)',
          }}
        />

        {/* Header */}
        <div className="relative px-6 pt-6 pb-0">
          {/* Amber icon circle */}
          <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-amber-100">
            <AlertCircle className="size-5 text-amber-600" strokeWidth={1.75} />
          </div>

          {/* Text */}
          <p className="text-lg font-semibold text-gray-900 leading-7">Clear allotment</p>
          <p className="mt-1 text-sm text-gray-500 leading-5">Assigned vehicle and driver to this duty will be removed.</p>

          {/* Vehicle + driver info */}
          {(vehicleName || driverName) && (
            <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 divide-y divide-gray-200">
              {vehicleName && (
                <div className="flex items-center gap-3 px-4 py-3">
                  <Car className="size-4 text-gray-400 shrink-0" strokeWidth={1.75} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{vehicleName}</p>
                    {vehicleNumber && <p className="text-xs text-gray-500">{vehicleNumber}</p>}
                  </div>
                </div>
              )}
              {driverName && (
                <div className="flex items-center gap-3 px-4 py-3">
                  <User className="size-4 text-gray-400 shrink-0" strokeWidth={1.75} />
                  <p className="text-sm font-medium text-gray-900 truncate">{driverName}</p>
                </div>
              )}
            </div>
          )}

          {/* Close X */}
          <button
            onClick={onClose}
            className="absolute right-4 top-4 flex size-[44px] items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <X className="size-5" strokeWidth={1.75} />
          </button>
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-6 pt-6 pb-6">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg bg-white text-sm font-semibold text-gray-700 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] hover:bg-gray-50 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={removing}
            className="flex-1 px-4 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-lg shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] hover:bg-red-700 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {removing ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </div>
    </div>
  )
}
