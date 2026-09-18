import { useEffect, useRef, useState } from 'react'

/**
 * How many table rows fit the container, so a paginated table fills the frame
 * instead of leaving a half-empty card on a large screen.
 *
 * Replaces the hardcoded `PAGE_SIZE = 8` that was copy-pasted into 14 pages —
 * a number picked against one laptop, which left ~570px of void on a 27".
 *
 * Measures the *card* (fixed `h-full`), never the inner scroll body: the
 * pagination bar appears only when `totalPages > 1`, so measuring inside it
 * would let the row count feed back into its own input.
 */
export function fitRows(cardH: number, rowH: number, headerH: number, footerH: number, min: number) {
  return Math.max(min, Math.floor((cardH - headerH - footerH) / rowH))
}

export function useFitRows(rowH = 72, headerH = 44, footerH = 69, min = 5) {
  const ref = useRef<HTMLDivElement>(null)
  const [rows, setRows] = useState(min)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setRows(fitRows(el.clientHeight, rowH, headerH, footerH, min)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [rowH, headerH, footerH, min])
  return [ref, rows] as const
}
