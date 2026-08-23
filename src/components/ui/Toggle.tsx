import { clsx } from 'clsx'

/** Switch control. Lifted out of AddBookingDrawer when AllowancesPage needed
 *  the same thing — the Field duplication in cc97427 is the cautionary tale. */
export default function Toggle({ checked, onChange, disabled, label }: {
  checked: boolean; onChange: () => void; disabled?: boolean; label?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={clsx(
        'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200',
        'outline-none focus-visible:ring-4 focus-visible:ring-violet-100 focus-visible:border-violet-400',
        checked ? 'bg-violet-600' : 'bg-gray-200',
        disabled ? 'opacity-50 cursor-default' : 'cursor-pointer',
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
