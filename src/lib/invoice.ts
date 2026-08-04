// Invoice arithmetic. Pure functions, no React, no Supabase — so the totals
// can be checked without a browser (see invoice.check.ts).
//
// A booking's amount is the sum of its duties' base_rate. The database has
// extra_km_rate and extra_hour_rate but no actual km or hours run, so extras
// cannot be computed; they get entered as custom rows instead.

// Explicit .ts extension (tsconfig has allowImportingTsExtensions) so that
// invoice.check.ts can run this module straight through node.
import { round2 } from './money.ts'

export type DiscountMode = 'amount' | 'percentage' | 'percentage_car_hire'

export interface CalcDuty {
  baseRate: number | null
}

export interface CalcBooking {
  duties: CalcDuty[]
}

/** Custom rows are taxable or not; non-taxable ones bypass the tax base. */
export interface CalcCustomRow {
  taxable: boolean
  amount: number
}

export interface CalcDiscountRow {
  mode: DiscountMode
  value: number
}

export interface CalcTaxRow {
  rate: number
}

export interface InvoiceTotals {
  carHire: number
  customTaxable: number
  customNonTaxable: number
  subtotal: number
  discountTotal: number
  taxableBase: number
  taxTotal: number
  /** Per-tax-row amounts, index-aligned with the taxes passed in. */
  taxAmounts: number[]
  total: number
}

export function bookingAmount(duties: CalcDuty[]): number {
  return round2(duties.reduce((sum, d) => sum + (d.baseRate ?? 0), 0))
}

export function calculateInvoice(input: {
  bookings: CalcBooking[]
  customRows: CalcCustomRow[]
  discounts: CalcDiscountRow[]
  taxes: CalcTaxRow[]
}): InvoiceTotals {
  const carHire = round2(
    input.bookings.reduce((sum, b) => sum + bookingAmount(b.duties), 0),
  )

  let customTaxable = 0
  let customNonTaxable = 0
  for (const row of input.customRows) {
    if (row.taxable) customTaxable += row.amount
    else customNonTaxable += row.amount
  }
  customTaxable = round2(customTaxable)
  customNonTaxable = round2(customNonTaxable)

  const subtotal = round2(carHire + customTaxable + customNonTaxable)

  const rawDiscount = input.discounts.reduce((sum, d) => {
    switch (d.mode) {
      case 'amount': return sum + d.value
      case 'percentage': return sum + (subtotal * d.value) / 100
      case 'percentage_car_hire': return sum + (carHire * d.value) / 100
    }
  }, 0)
  // A discount larger than the invoice would produce a negative total and,
  // worse, a negative tax. Clamp rather than trust the input.
  const discountTotal = round2(Math.min(Math.max(rawDiscount, 0), subtotal))

  // Tax applies to car hire plus taxable custom rows, after discount.
  // Non-taxable custom rows never enter this base.
  const taxableBase = round2(Math.max(carHire + customTaxable - discountTotal, 0))

  const taxAmounts = input.taxes.map(t => round2((taxableBase * t.rate) / 100))
  const taxTotal = round2(taxAmounts.reduce((sum, a) => sum + a, 0))

  return {
    carHire,
    customTaxable,
    customNonTaxable,
    subtotal,
    discountTotal,
    taxableBase,
    taxTotal,
    taxAmounts,
    total: round2(subtotal - discountTotal + taxTotal),
  }
}
