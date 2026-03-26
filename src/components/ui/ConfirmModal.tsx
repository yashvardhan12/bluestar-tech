import { useEffect } from 'react'
import { X } from 'lucide-react'
import { clsx } from 'clsx'

interface ConfirmModalProps {
  open: boolean
  /** Icon element rendered inside the colored circle */
  icon: React.ReactNode
  /** Circle + icon color scheme */
  iconVariant?: 'amber' | 'red' | 'blue' | 'gray'
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  /** Color of the confirm button */
  confirmVariant?: 'amber' | 'red' | 'violet'
  loading?: boolean
  onClose: () => void
  onConfirm: () => void
}

const ICON_STYLES: Record<string, string> = {
  amber: 'bg-amber-100 text-amber-600',
  red:   'bg-red-100   text-red-600',
  blue:  'bg-blue-100  text-blue-600',
  gray:  'bg-gray-100  text-gray-600',
}

const BTN_STYLES: Record<string, string> = {
  amber:  'bg-amber-500  hover:bg-amber-600  text-white',
  red:    'bg-red-600    hover:bg-red-700    text-white',
  violet: 'bg-violet-600 hover:bg-violet-700 text-white',
}

export default function ConfirmModal({
  open,
  icon,
  iconVariant = 'amber',
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmVariant = 'amber',
  loading = false,
  onClose,
  onConfirm,
}: ConfirmModalProps) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
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

      {/* Card */}
      <div className="relative bg-white rounded-xl shadow-[0px_20px_24px_-4px_rgba(16,24,40,0.08),0px_8px_8px_-4px_rgba(16,24,40,0.03)] w-full max-w-[400px] overflow-hidden">

        {/* Decorative grid */}
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
          <div className={clsx('mb-4 flex size-12 items-center justify-center rounded-full', ICON_STYLES[iconVariant])}>
            {icon}
          </div>
          <p className="text-lg font-semibold text-gray-900 leading-7">{title}</p>
          <p className="mt-1 text-sm text-gray-500 leading-5">{description}</p>
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
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={clsx(
              'flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed',
              BTN_STYLES[confirmVariant],
            )}
          >
            {loading ? 'Please wait…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
