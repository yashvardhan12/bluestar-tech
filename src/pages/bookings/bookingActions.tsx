import { Eye, Pencil, Car, FileText, Trash2, XCircle, RotateCcw, CheckCircle, Printer } from 'lucide-react'
import type { BookingStatus } from '../../components/ui/StatusBadge'

/**
 * The actions offered on a booking, in one place because two screens offer
 * them: the list row menu and the booking's own header menu.
 *
 * `opts.onDetailPage` drops the two items that would navigate to the page you
 * are already standing on. A menu entry that does nothing visible is the same
 * dead affordance ActionsMenu refuses to render an empty box for.
 */

export interface MenuItem {
  label: string
  icon: React.ReactNode
  onClick: () => void
  variant?: 'default' | 'danger' | 'confirm'
}

export function getBookingActions(
  booking: { status: BookingStatus },
  handlers: {
    onView: () => void
    onEdit: () => void
    onConfirm: () => void
    onAllotAll: () => void
    onCancel: () => void
    onRestore: () => void
    onDelete: () => void
    onViewDuties: () => void
    onGenerateInvoice: () => void
    /** Every closed duty on the booking, one sheet per page. */
    onPrintSlips: () => void
  },
  opts: { onDetailPage?: boolean; closedDuties?: number } = {},
): (MenuItem | 'divider')[] {
  const s = booking.status
  const t = (items: (MenuItem | 'divider')[]) => trim(items, opts, handlers.onPrintSlips)

  if (s === 'Booked') return t([
    { label: 'Confirm booking', icon: <CheckCircle className="size-4" strokeWidth={1.75} />, onClick: handlers.onConfirm, variant: 'confirm' },
    'divider',
    { label: 'View booking',   icon: <Eye    className="size-4" strokeWidth={1.75} />, onClick: handlers.onView },
    { label: 'Edit booking',   icon: <Pencil className="size-4" strokeWidth={1.75} />, onClick: handlers.onEdit },
    'divider',
    { label: 'View duty(s)',   icon: <Car    className="size-4" strokeWidth={1.75} />, onClick: handlers.onViewDuties },
    'divider',
    { label: 'Delete Booking', icon: <Trash2 className="size-4" strokeWidth={1.75} />, onClick: handlers.onDelete, variant: 'danger' },
  ])

  if (s === 'Confirmed') return t([
    { label: 'View booking',     icon: <Eye      className="size-4" strokeWidth={1.75} />, onClick: handlers.onView },
    { label: 'Edit booking',     icon: <Pencil   className="size-4" strokeWidth={1.75} />, onClick: handlers.onEdit },
    'divider',
    { label: 'View duty(s)',     icon: <Car      className="size-4" strokeWidth={1.75} />, onClick: handlers.onViewDuties },
    { label: 'Allot all duties', icon: <CheckCircle className="size-4" strokeWidth={1.75} />, onClick: handlers.onAllotAll },
    { label: 'Generate invoice', icon: <FileText className="size-4" strokeWidth={1.75} />, onClick: handlers.onGenerateInvoice },
    'divider',
    { label: 'Delete Booking',   icon: <Trash2   className="size-4" strokeWidth={1.75} />, onClick: handlers.onDelete, variant: 'danger' },
  ])

  if (s === 'Allotted' || s === 'Partially Allotted') return t([
    { label: 'View booking',      icon: <Eye        className="size-4" strokeWidth={1.75} />, onClick: handlers.onView },
    { label: 'Edit booking',      icon: <Pencil     className="size-4" strokeWidth={1.75} />, onClick: handlers.onEdit },
    'divider',
    { label: 'View duty(s)',      icon: <Car        className="size-4" strokeWidth={1.75} />, onClick: handlers.onViewDuties },
    { label: 'Re-allot all duties', icon: <CheckCircle className="size-4" strokeWidth={1.75} />, onClick: handlers.onAllotAll },
    'divider',
    { label: 'Cancel booking',    icon: <XCircle    className="size-4" strokeWidth={1.75} />, onClick: handlers.onCancel, variant: 'danger' },
    { label: 'Delete booking',    icon: <Trash2     className="size-4" strokeWidth={1.75} />, onClick: handlers.onDelete, variant: 'danger' },
  ])

  if (s === 'On-Going') return t([
    { label: 'View booking',   icon: <Eye    className="size-4" strokeWidth={1.75} />, onClick: handlers.onView },
    'divider',
    { label: 'View duty(s)',   icon: <Car    className="size-4" strokeWidth={1.75} />, onClick: handlers.onViewDuties },
  ])

  // Every duty has run but at least one was never closed. No Generate Invoice:
  // there is nothing to price it from until somebody closes it.
  if (s === 'Needs closing') return t([
    { label: 'Close duties',  icon: <CheckCircle className="size-4" strokeWidth={1.75} />, onClick: handlers.onViewDuties, variant: 'confirm' },
    'divider',
    { label: 'View booking',  icon: <Eye         className="size-4" strokeWidth={1.75} />, onClick: handlers.onView },
    { label: 'View duty(s)',  icon: <Car         className="size-4" strokeWidth={1.75} />, onClick: handlers.onViewDuties },
  ])

  if (s === 'Completed') return t([
    { label: 'View booking',     icon: <Eye      className="size-4" strokeWidth={1.75} />, onClick: handlers.onView },
    { label: 'View duty(s)',     icon: <Car      className="size-4" strokeWidth={1.75} />, onClick: handlers.onViewDuties },
    'divider',
    { label: 'Generate Invoice', icon: <FileText className="size-4" strokeWidth={1.75} />, onClick: handlers.onGenerateInvoice, variant: 'confirm' },
  ])

  if (s === 'Billed') return t([
    { label: 'View booking', icon: <Eye      className="size-4" strokeWidth={1.75} />, onClick: handlers.onView },
    { label: 'View duty(s)', icon: <Car      className="size-4" strokeWidth={1.75} />, onClick: handlers.onViewDuties },
    { label: 'View Invoice', icon: <FileText className="size-4" strokeWidth={1.75} />, onClick: handlers.onGenerateInvoice },
  ])

  if (s === 'Cancelled') return t([
    { label: 'View booking',    icon: <Eye       className="size-4" strokeWidth={1.75} />, onClick: handlers.onView },
    { label: 'Restore booking', icon: <RotateCcw className="size-4" strokeWidth={1.75} />, onClick: handlers.onRestore },
    'divider',
    { label: 'Delete Booking',  icon: <Trash2    className="size-4" strokeWidth={1.75} />, onClick: handlers.onDelete, variant: 'danger' },
  ])

  return t([{ label: 'View booking', icon: <Eye className="size-4" strokeWidth={1.75} />, onClick: handlers.onView }])
}

/** Applied to every branch below, so no branch has to remember. */
function trim(
  items: (MenuItem | 'divider')[],
  opts: { onDetailPage?: boolean; closedDuties?: number },
  onPrintSlips: () => void,
): (MenuItem | 'divider')[] {
  let out = items

  if (opts.onDetailPage) {
    out = out.filter(i => i === 'divider' || (i.label !== 'View booking' && i.label !== 'View duty(s)'))
  }

  // Offered only when there is something to print. `closedDuties` is undefined
  // on the list, where the count is not loaded — the item stays off there.
  if ((opts.closedDuties ?? 0) > 0) {
    const n = opts.closedDuties as number
    out = [
      ...out,
      'divider',
      {
        label: `Print ${n} duty slip${n === 1 ? '' : 's'}`,
        icon: <Printer className="size-4" strokeWidth={1.75} />,
        onClick: onPrintSlips,
      },
    ]
  }

  // A leading or doubled divider is left over from whatever was filtered out.
  return out.filter((item, i, a) =>
    !(item === 'divider' && (i === 0 || a[i - 1] === 'divider' || i === a.length - 1)))
}
