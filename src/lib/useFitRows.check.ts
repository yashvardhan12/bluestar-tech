import assert from 'node:assert/strict'
import { fitRows } from './useFitRows.ts'

// Payroll geometry: 44px sticky header, 72px rows, 69px pagination bar.
const fit = (h: number) => fitRows(h, 72, 44, 69, 5)

// The screenshot: 990px card left 8 rows and a void. It now takes 12.
assert.equal(fit(990), 12)
// A laptop still lands near the old hardcoded 8.
assert.equal(fit(700), 8)
// Never collapses below the floor, even at absurd heights.
assert.equal(fit(200), 5)
assert.equal(fit(0), 5)
// Exact boundary: one row's worth of extra space adds exactly one row.
assert.equal(fit(44 + 69 + 72 * 10), 10)
assert.equal(fit(44 + 69 + 72 * 10 + 71), 10)
assert.equal(fit(44 + 69 + 72 * 11), 11)

console.log('useFitRows: ok')
