import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { clsx } from 'clsx'

interface DrawerProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
  /** Tailwind width class for the panel. Defaults to the standard 480px. */
  width?: string
}

export default function Drawer({ open, onClose, title, description, children, footer, width = 'w-[480px]' }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    if (open) document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

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
        ref={panelRef}
        className={clsx(
          'relative flex flex-col h-full max-w-[95vw] bg-white border-l border-gray-200 shadow-xl transition-transform duration-300',
          width,
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {/* Header */}
        <div className="relative flex items-start gap-2 px-6 pt-6 pb-0 shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-semibold leading-[30px] text-gray-900">{title}</h2>
            {description && (
              <p className="mt-1 text-sm font-normal text-gray-500 leading-5">{description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="absolute right-4 top-3 p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <X className="size-5" strokeWidth={1.75} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="shrink-0 border-t border-gray-200 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
