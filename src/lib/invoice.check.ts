// Self-check for the money path. No test framework is installed and none is
// being added — run it directly:
//
//   node --experimental-strip-types src/lib/invoice.check.ts
//
// It exits non-zero on the first failed assertion.

import assert from 'node:assert/strict'
import { calculateInvoice, bookingAmount } from './invoice.ts'
import { amountInWords, formatINR, round2 } from './money.ts'

const duties = (...rates: (number | null)[]) => rates.map(baseRate => ({ baseRate }))

// ── booking amount ──────────────────────────────────────────────────────────
assert.equal(bookingAmount(duties(1000, 2000, 500)), 3500)
assert.equal(bookingAmount(duties(1000, null, 500)), 1500, 'null base_rate counts as zero')
assert.equal(bookingAmount([]), 0)

// ── plain invoice, single tax ───────────────────────────────────────────────
{
  const t = calculateInvoice({
    bookings: [{ duties: duties(10000) }],
    customRows: [],
    discounts: [],
    taxes: [{ rate: 12 }],
  })
  assert.equal(t.carHire, 10000)
  assert.equal(t.taxableBase, 10000)
  assert.equal(t.taxTotal, 1200)
  assert.equal(t.total, 11200)
}

// ── non-taxable custom rows stay out of the tax base ────────────────────────
{
  const t = calculateInvoice({
    bookings: [{ duties: duties(10000) }],
    customRows: [
      { taxable: true, amount: 2000 },   // e.g. extra km
      { taxable: false, amount: 500 },   // e.g. toll reimbursement
    ],
    discounts: [],
    taxes: [{ rate: 10 }],
  })
  assert.equal(t.subtotal, 12500)
  assert.equal(t.taxableBase, 12000, 'the 500 non-taxable row must not be taxed')
  assert.equal(t.taxTotal, 1200)
  assert.equal(t.total, 13700)
}

// ── tax applies AFTER discount, not before ──────────────────────────────────
{
  const t = calculateInvoice({
    bookings: [{ duties: duties(10000) }],
    customRows: [],
    discounts: [{ mode: 'amount', value: 2000 }],
    taxes: [{ rate: 10 }],
  })
  assert.equal(t.discountTotal, 2000)
  assert.equal(t.taxableBase, 8000)
  assert.equal(t.taxTotal, 800, 'taxing 10000 instead of 8000 would overcharge by 200')
  assert.equal(t.total, 8800)
}

// ── the three discount modes differ ─────────────────────────────────────────
{
  const base = {
    bookings: [{ duties: duties(10000) }],
    customRows: [{ taxable: false, amount: 5000 }],
    discounts: [],
    taxes: [],
  }
  const pct = calculateInvoice({ ...base, discounts: [{ mode: 'percentage', value: 10 }] })
  const car = calculateInvoice({ ...base, discounts: [{ mode: 'percentage_car_hire', value: 10 }] })
  assert.equal(pct.discountTotal, 1500, '10% of the 15000 subtotal')
  assert.equal(car.discountTotal, 1000, '10% of the 10000 car hire only')
}

// ── discount cannot drive the invoice negative ──────────────────────────────
{
  const t = calculateInvoice({
    bookings: [{ duties: duties(1000) }],
    customRows: [],
    discounts: [{ mode: 'amount', value: 99999 }],
    taxes: [{ rate: 18 }],
  })
  assert.equal(t.discountTotal, 1000, 'clamped to the subtotal')
  assert.equal(t.taxableBase, 0)
  assert.equal(t.taxTotal, 0, 'a negative tax would be a refund nobody asked for')
  assert.equal(t.total, 0)
}

// ── multiple taxes stack on the same base, not on each other ────────────────
{
  const t = calculateInvoice({
    bookings: [{ duties: duties(1000) }],
    customRows: [],
    discounts: [],
    taxes: [{ rate: 9 }, { rate: 9 }],   // CGST + SGST
  })
  assert.deepEqual(t.taxAmounts, [90, 90])
  assert.equal(t.taxTotal, 180, 'compounding would give 188.10')
  assert.equal(t.total, 1180)
}

// ── rounding ────────────────────────────────────────────────────────────────
assert.equal(round2(0.1 + 0.2), 0.3)
{
  const t = calculateInvoice({
    bookings: [{ duties: duties(999.99) }],
    customRows: [],
    discounts: [],
    taxes: [{ rate: 12.5 }],
  })
  assert.equal(t.taxTotal, 125)
  assert.equal(t.total, 1124.99)
}

// ── formatting ──────────────────────────────────────────────────────────────
assert.equal(formatINR(1234567.5), '₹12,34,567.50', 'Indian grouping, not thousands')
assert.equal(formatINR(null), '—')
assert.equal(amountInWords(0), 'Rupees Zero Only')
assert.equal(amountInWords(1234.5), 'Rupees One Thousand Two Hundred Thirty Four and Fifty Paise Only')
assert.equal(amountInWords(10000000), 'Rupees One Crore Only')
assert.equal(amountInWords(115), 'Rupees One Hundred Fifteen Only')

console.log('invoice.check.ts — all assertions passed')
