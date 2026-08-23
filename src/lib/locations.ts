import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

// Service locations for a booking's From / To.
//
// This was a hardcoded const until operators needed to add a locality mid-booking
// without closing (and losing) a half-filled drawer. The list now lives in the
// `locations` table — shared across tenants, like the customer book. See 031.
//
// `name` is citext with a unique index, so re-adding an existing location in any
// casing is a no-op rather than a duplicate row every tenant then has to scroll.

export function useLocations() {
  const [locations, setLocations] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    supabase.from('locations').select('name').order('name').then(({ data, error }) => {
      if (cancelled) return
      if (error) { console.error('[useLocations]', error.message); return }
      setLocations((data ?? []).map((r: { name: string }) => r.name))
    })
    return () => { cancelled = true }
  }, [])

  // Returns the stored name so the caller selects the canonical casing — adding
  // "nerul" when "Nerul" exists must select "Nerul", not create a second entry.
  const addLocation = useCallback(async (name: string): Promise<string | null> => {
    const trimmed = name.trim()
    if (!trimmed) return null

    const { data, error } = await supabase
      .from('locations')
      .upsert({ name: trimmed }, { onConflict: 'name' })
      .select('name')
      .single()

    if (error || !data) {
      console.error('[useLocations] add failed:', error?.message)
      return null
    }
    setLocations(prev =>
      prev.some(l => l.toLowerCase() === data.name.toLowerCase())
        ? prev
        : [...prev, data.name].sort((a, b) => a.localeCompare(b)),
    )
    return data.name
  }, [])

  return { locations, addLocation }
}
