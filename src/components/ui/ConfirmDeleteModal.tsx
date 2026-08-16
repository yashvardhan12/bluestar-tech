import { useEffect } from 'react'
import { X, Trash2 } from 'lucide-react'

export interface DeleteCheckbox {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}

interface ConfirmDeleteModalProps {
  open: boolean
  title: string
  description: string
  deleting?: boolean
  checkboxes?: DeleteCheckbox[]
  onClose: () => void
  onConfirm: () => void
}

export default function ConfirmDeleteModal({
  open,
  title,
  description,
  deleting = false,
  checkboxes,
  onClose,
  onConfirm,
}: ConfirmDeleteModalProps) {
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
        className="absolute inset-0 bg-gray-950/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal card */}
      <div className={`relative bg-white rounded-xl shadow-xl w-full overflow-hidden ${checkboxes ? 'max-w-[560px]' : 'max-w-[400px]'}`}>

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
          {/* Red icon circle */}
          <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-red-100">
            <Trash2 className="size-5 text-red-600" strokeWidth={1.75} />
          </div>

          {/* Text */}
          <p className="text-lg font-semibold text-gray-900 leading-7">{title}</p>
          <p className="mt-1 text-sm text-gray-500 leading-5">{description}</p>

          {/* Close X */}
          <button
            onClick={onClose}
            className="absolute right-4 top-4 flex size-[44px] items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <X className="size-5" strokeWidth={1.75} />
          </button>
        </div>

        {/* Checkboxes */}
        {checkboxes && checkboxes.length > 0 && (
          <div className="px-6 pt-5 flex flex-col gap-3">
            {checkboxes.map((cb, i) => (
              <label key={i} className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={cb.checked}
                  onChange={e => cb.onChange(e.target.checked)}
                  className="mt-0.5 size-4 shrink-0 rounded border-gray-300 accent-violet-600 cursor-pointer"
                />
                <span className="text-sm text-gray-600 leading-5">{cb.label}</span>
              </label>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 px-6 pt-6 pb-6">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg bg-white text-sm font-semibold text-gray-700 shadow-xs hover:bg-gray-50 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="flex-1 px-4 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-lg shadow-xs hover:bg-red-700 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}
