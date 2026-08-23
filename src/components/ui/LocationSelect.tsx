import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Plus } from 'lucide-react'
import { clsx } from 'clsx'

// Type-to-filter location picker that can create what you typed.
//
// A native <select> could not do this: operators need to add a locality while
// a half-filled booking drawer is open, and closing the drawer to visit the
// Database section throws the draft away. The last row of the list is
// "Add <query>", so the new location is created and selected in one keystroke
// without leaving the form.

interface LocationSelectProps {
  label: string
  value: string
  onChange: (v: string) => void
  options: string[]
  /** Persists a new location and resolves to its canonical stored name. */
  onAdd: (name: string) => Promise<string | null>
  required?: boolean
  readOnly?: boolean
  placeholder?: string
}

export default function LocationSelect({
  label, value, onChange, options, onAdd, required, readOnly, placeholder = 'Location',
}: LocationSelectProps) {
  const [open, setOpen]     = useState(false)
  const [query, setQuery]   = useState('')
  const [active, setActive] = useState(0)
  const [adding, setAdding] = useState(false)
  const wrapRef             = useRef<HTMLDivElement>(null)
  const listId              = useId()

  const q = query.trim()
  const filtered = useMemo(() => {
    const needle = q.toLowerCase()
    return needle ? options.filter(o => o.toLowerCase().includes(needle)) : options
  }, [options, q])

  // Only offer to create when the typed text is not already a location.
  const canAdd   = q.length > 0 && !options.some(o => o.toLowerCase() === q.toLowerCase())
  const rowCount = filtered.length + (canAdd ? 1 : 0)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) { setOpen(false); setQuery('') }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function commit(name: string) {
    onChange(name)
    setQuery('')
    setOpen(false)
    setActive(0)
  }

  async function handleAdd() {
    if (adding) return
    setAdding(true)
    const saved = await onAdd(q)
    setAdding(false)
    if (saved) commit(saved)
  }

  function choose(i: number) {
    if (canAdd && i === filtered.length) { void handleAdd(); return }
    const name = filtered[i]
    if (name) commit(name)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) { setOpen(true); return }
      setActive(a => Math.min(a + 1, rowCount - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(a => Math.max(a - 1, 0))
    } else if (e.key === 'Enter' && open) {
      e.preventDefault()
      choose(active)
    } else if (e.key === 'Escape' && open) {
      // Stop the drawer's document-level Escape handler from closing the whole
      // form when the user only meant to dismiss this dropdown.
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
      setQuery('')
    }
  }

  if (readOnly) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <div className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm bg-gray-50 text-gray-500 shadow-xs">
          {value || '—'}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5" ref={wrapRef}>
      <label className="flex items-center gap-0.5 text-sm font-medium text-gray-700">
        {label}{required && <span className="text-violet-600">*</span>}
      </label>

      <div className="relative">
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          value={open ? query : value}
          placeholder={value || placeholder}
          onChange={e => { setQuery(e.target.value); setOpen(true); setActive(0) }}
          onFocus={() => setOpen(true)}
          onBlur={e => {
            if (!wrapRef.current?.contains(e.relatedTarget as Node)) { setOpen(false); setQuery('') }
          }}
          onKeyDown={onKeyDown}
          className={clsx(
            'w-full pl-3.5 pr-10 py-2.5 border rounded-lg text-sm text-gray-900 bg-white shadow-xs outline-none transition-shadow',
            'placeholder:text-gray-400 border-gray-300',
            'focus:border-violet-400 focus:ring-4 focus:ring-violet-100',
          )}
        />
        <ChevronDown
          className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 size-5 text-gray-500"
          strokeWidth={1.75}
        />

        {open && (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-10 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg py-1"
          >
            {filtered.map((name, i) => (
              <li
                key={name}
                role="option"
                aria-selected={name === value}
                onMouseEnter={() => setActive(i)}
                onMouseDown={e => { e.preventDefault(); choose(i) }}
                className={clsx(
                  'flex items-center justify-between gap-2 px-3.5 py-2 text-sm cursor-pointer',
                  i === active ? 'bg-violet-50 text-violet-700' : 'text-gray-900',
                )}
              >
                <span className="truncate">{name}</span>
                {name === value && <Check className="size-4 shrink-0 text-violet-600" strokeWidth={1.75} />}
              </li>
            ))}

            {canAdd && (
              <li
                role="option"
                aria-selected={false}
                onMouseEnter={() => setActive(filtered.length)}
                onMouseDown={e => { e.preventDefault(); choose(filtered.length) }}
                className={clsx(
                  'flex items-center gap-2 px-3.5 py-2 text-sm font-medium cursor-pointer',
                  filtered.length > 0 && 'border-t border-gray-200 mt-1 pt-2.5',
                  active === filtered.length ? 'bg-violet-50 text-violet-700' : 'text-violet-700',
                )}
              >
                <Plus className="size-4 shrink-0" strokeWidth={1.75} />
                <span className="truncate">{adding ? `Adding “${q}”…` : `Add “${q}”`}</span>
              </li>
            )}

            {rowCount === 0 && (
              <li className="px-3.5 py-2 text-sm text-gray-500">No locations found</li>
            )}
          </ul>
        )}
      </div>
    </div>
  )
}
