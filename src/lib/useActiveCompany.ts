import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'

// The active company as a row, not just an id.
//
// `useAuth().profile` carries only activeCompanyId, but billing needs the
// company itself: EXPERIENCE.md requires empty and error states to name the
// active company, and the invoice document prints its name, GSTIN and address.
//
// The printed duty slip needs two more: its terms block and its authorised
// signature. `signature_url` stores an object PATH in the private bucket, the
// same as everything FileUpload writes — it needs signing before it renders.

export interface ActiveCompany {
  id: number
  name: string
  shortCode: string | null
  gstinNumber: string | null
  address: string | null
  phoneNumber: string | null
  email: string | null
  dutySlipTerms: string | null
  /** An object path in `vehicle-documents`, not a URL. */
  signatureUrl: string | null
}

export function useActiveCompany(): ActiveCompany | null {
  const { profile } = useAuth()
  const [company, setCompany] = useState<ActiveCompany | null>(null)

  useEffect(() => {
    const id = profile?.activeCompanyId
    if (!id) { setCompany(null); return }

    let cancelled = false
    supabase
      .from('companies')
      .select('id, name, short_code, gstin_number, address, phone_number, email, duty_slip_terms, signature_url')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) { console.error('[useActiveCompany]', error.message); return }
        setCompany(data && {
          id: data.id,
          name: data.name,
          shortCode: data.short_code,
          gstinNumber: data.gstin_number,
          address: data.address,
          phoneNumber: data.phone_number,
          email: data.email,
          dutySlipTerms: data.duty_slip_terms,
          signatureUrl: data.signature_url,
        })
      })
    return () => { cancelled = true }
  }, [profile?.activeCompanyId])

  return company
}
