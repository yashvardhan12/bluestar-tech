import { clsx } from 'clsx'

export type BookingStatus =
  | 'Booked'
  | 'Confirmed'
  | 'Allotted'
  | 'Partially Allotted'
  | 'On-Going'
  | 'Completed'
  | 'Billed'
  | 'Cancelled'

const CONFIG: Record<BookingStatus, {
  badge: string
  dot: string
  label: string
}> = {
  'Booked': {
    badge: 'bg-gray-50 border-gray-200 text-gray-700',
    dot:   'bg-gray-400',
    label: 'Booked',
  },
  'Confirmed': {
    badge: 'bg-orange-50 border-orange-200 text-orange-700',
    dot:   'bg-orange-400',
    label: 'Confirmed',
  },
  'Allotted': {
    badge: 'bg-amber-50 border-amber-200 text-amber-700',
    dot:   'bg-amber-400',
    label: 'Allotted',
  },
  'Partially Allotted': {
    badge: 'bg-amber-50 border-amber-200 text-amber-600',
    dot:   'bg-amber-300',
    label: 'Partially Allotted',
  },
  'On-Going': {
    badge: 'bg-blue-50 border-blue-200 text-blue-700',
    dot:   'bg-blue-400',
    label: 'On-going',
  },
  'Completed': {
    badge: 'bg-green-50 border-green-200 text-green-700',
    dot:   'bg-green-500',
    label: 'Completed',
  },
  'Billed': {
    badge: 'bg-green-50 border-green-200 text-green-700',
    dot:   'bg-green-500',
    label: 'Billed',
  },
  'Cancelled': {
    badge: 'bg-red-50 border-red-200 text-red-700',
    dot:   'bg-red-400',
    label: 'Cancelled',
  },
}

interface StatusBadgeProps {
  status: BookingStatus
  className?: string
}

export default function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = CONFIG[status] ?? CONFIG['Booked']
  return (
    <span className={clsx(
      'inline-flex items-center gap-1 pl-1.5 pr-2 py-0.5 rounded-full border text-xs font-medium whitespace-nowrap',
      config.badge,
      className,
    )}>
      <span className={clsx('size-1.5 rounded-full shrink-0', config.dot)} />
      {config.label}
    </span>
  )
}
