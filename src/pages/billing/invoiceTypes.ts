// Shared between CreateInvoicePage and AddBookingsDrawer.

/** One allowance this duty charged the customer, for the printed breakdown. */
export interface DutyAllowanceLine {
  name: string
  qty: number
  unit: string
  rate: number
  amount: number
}

export interface DutyRow {
  id: number
  date: string          // display, DD/MM/YYYY
  vehicle: string
  plate: string
  dutyType: string
  baseRate: number | null
  /** Total customer-billed allowances. Named to match CalcDuty so a DutyRow can
   *  be handed straight to calculateInvoice. */
  allowances: number
  /** The same total, broken out — the printed invoice itemises it. */
  allowanceLines: DutyAllowanceLine[]
}

/** Sum of what this duty's allowances charged the customer. */
export function allowanceTotal(raw: any[]): number {
  return Math.round((raw ?? []).reduce((t, r) => t + Number(r.customer_amount ?? 0), 0) * 100) / 100
}

/** Rows are snapshotted with customer_amount already computed; unpriced
 *  allowances store 0 and must not print as a free line on the invoice. */
export function toAllowanceLines(raw: any[]): DutyAllowanceLine[] {
  return (raw ?? [])
    .filter(r => Number(r.customer_amount) > 0)
    .map(r => ({
      name:   r.allowances?.name ?? 'Allowance',
      unit:   r.allowances?.unit ?? 'duty',
      qty:    Number(r.qty),
      rate:   Number(r.customer_rate ?? 0),
      amount: Number(r.customer_amount),
    }))
}

export interface BookingBlock {
  bookingId: number
  bookingRef: string
  dateRange: string     // display
  customDescription: string
  duties: DutyRow[]
}
