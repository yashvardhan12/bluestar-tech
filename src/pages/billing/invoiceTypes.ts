// Shared between CreateInvoicePage and AddBookingsDrawer.

export interface DutyRow {
  id: number
  date: string          // display, DD/MM/YYYY
  vehicle: string
  plate: string
  dutyType: string
  baseRate: number | null
}

export interface BookingBlock {
  bookingId: number
  bookingRef: string
  dateRange: string     // display
  customDescription: string
  duties: DutyRow[]
}
