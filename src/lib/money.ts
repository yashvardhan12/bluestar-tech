// Money formatting, one copy.
//
// Replaces four incompatible `formatINR`s that were copy-pasted into
// FuelPage, LoansPage, GeneralExpensesPage and PayrollPage. Three of them
// took `number` and one took `number | null`; none controlled decimals, so
// `toLocaleString('en-IN')` dropped paise and gave ragged column widths.

/** `1234567.5` → `₹12,34,567.50`. Null/undefined render as an em dash. */
export function formatINR(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return '—'
  return '₹' + amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** Rounds to paise. Float arithmetic on money drifts; every total goes through this. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
  'Eighteen', 'Nineteen',
]
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function twoDigits(n: number): string {
  if (n < 20) return ONES[n]
  const t = TENS[Math.floor(n / 10)]
  const o = ONES[n % 10]
  return o ? `${t} ${o}` : t
}

/** Indian grouping: crore, lakh, thousand, hundred. Max 99,99,99,999. */
function integerInWords(n: number): string {
  if (n === 0) return 'Zero'
  const parts: string[] = []
  const crore = Math.floor(n / 10000000)
  const lakh = Math.floor((n % 10000000) / 100000)
  const thousand = Math.floor((n % 100000) / 1000)
  const hundred = Math.floor((n % 1000) / 100)
  const rest = n % 100

  if (crore) parts.push(`${twoDigits(crore)} Crore`)
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`)
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`)
  if (hundred) parts.push(`${ONES[hundred]} Hundred`)
  if (rest) parts.push(twoDigits(rest))
  return parts.join(' ')
}

/**
 * `1234.50` → `Rupees One Thousand Two Hundred Thirty Four and Fifty Paise Only`.
 * Printed on the invoice document, which is why it exists at all.
 */
export function amountInWords(amount: number): string {
  const value = round2(Math.abs(amount))
  const rupees = Math.floor(value)
  const paise = Math.round((value - rupees) * 100)

  let out = `Rupees ${integerInWords(rupees)}`
  if (paise > 0) out += ` and ${twoDigits(paise)} Paise`
  return `${amount < 0 ? 'Minus ' : ''}${out} Only`
}
