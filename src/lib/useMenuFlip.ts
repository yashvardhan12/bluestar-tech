import { useLayoutEffect } from 'react'
import type { RefObject } from 'react'

/**
 * Flips a fixed-position portal menu above its trigger when it would otherwise
 * run past the bottom of the window. Measures the rendered menu before paint,
 * so it works regardless of how many items the menu has.
 */
export function useMenuFlip(
  open: boolean,
  btnRef: RefObject<HTMLElement | null>,
  menuRef: RefObject<HTMLElement | null>,
  setTop: (top: number) => void,
) {
  useLayoutEffect(() => {
    if (!open || !btnRef.current || !menuRef.current) return
    const h = menuRef.current.offsetHeight
    const rect = btnRef.current.getBoundingClientRect()
    if (rect.bottom + 4 + h > window.innerHeight - 8) {
      setTop(Math.max(8, rect.top - 4 - h))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
}
