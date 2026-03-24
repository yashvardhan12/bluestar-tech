import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { X, CheckCircle2 } from 'lucide-react'
import { clsx } from 'clsx'

// ── types ─────────────────────────────────────────────────────────────────────

interface ToastItem {
  id: string
  message: string
  onUndo?: () => void
}

interface ToastContextValue {
  showToast: (message: string, onUndo?: () => void) => void
}

// ── context ───────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

// ── single toast ──────────────────────────────────────────────────────────────

const AUTO_DISMISS_MS = 4000

function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  const [visible, setVisible] = useState(false)

  // Slide in on mount
  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  // Auto-dismiss
  useEffect(() => {
    const t = setTimeout(() => dismiss(), AUTO_DISMISS_MS)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast.id])

  function dismiss() {
    setVisible(false)
    setTimeout(() => onDismiss(toast.id), 300)
  }

  function handleUndo() {
    toast.onUndo?.()
    dismiss()
  }

  return (
    <div
      className={clsx(
        'w-[360px] bg-white border border-gray-300 rounded-xl p-4 relative',
        'shadow-[0px_12px_16px_-4px_rgba(16,24,40,0.08),0px_4px_6px_-2px_rgba(16,24,40,0.03)]',
        'transition-all duration-300',
        visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4',
      )}
    >
      <div className="flex gap-4 items-start pr-8">
        {/* Green check icon with halos */}
        <div className="relative size-5 shrink-0 mt-0.5">
          {/* Outer halo */}
          <div className="absolute inset-[-45%] rounded-full border-2 border-green-600 opacity-10" />
          {/* Inner halo */}
          <div className="absolute inset-[-20%] rounded-full border-2 border-green-600 opacity-30" />
          {/* Icon */}
          <CheckCircle2 className="absolute inset-0 size-5 text-green-600" strokeWidth={1.75} />
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col gap-3">
          <p className="text-sm font-semibold text-gray-900 leading-5">{toast.message}</p>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={dismiss}
              className="text-sm font-semibold text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
            >
              Dismiss
            </button>
            {toast.onUndo && (
              <button
                type="button"
                onClick={handleUndo}
                className="text-sm font-semibold text-violet-700 hover:text-violet-800 transition-colors cursor-pointer"
              >
                Undo
              </button>
            )}
          </div>
        </div>
      </div>

      {/* X close */}
      <button
        type="button"
        onClick={dismiss}
        className="absolute top-2 right-2 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
      >
        <X className="size-4" strokeWidth={1.75} />
      </button>
    </div>
  )
}

// ── provider ──────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const showToast = useCallback((message: string, onUndo?: () => void) => {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev, { id, message, onUndo }])
  }, [])

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Fixed top-right container */}
      <div className="fixed top-6 right-6 z-[99999] flex flex-col gap-3 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className="pointer-events-auto">
            <Toast toast={t} onDismiss={dismiss} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
