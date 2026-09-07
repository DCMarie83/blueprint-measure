import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useEffectiveCompany } from './useEffectiveCompany'

export const DEFAULT_INSTRUCTIONS = {
  check: { enabled: false, payable_to: '', mailing_address: '' },
  zelle: { enabled: false, handle: '', qr_path: '', link: '' },
  venmo: { enabled: false, handle: '', qr_path: '', link: '' },
  cashapp: { enabled: false, handle: '', qr_path: '', link: '' },
  ach: { enabled: false, bank_name: '', routing_number: '', account_number: '', account_type: '', instructions: '' },
  wire: { enabled: false, bank_name: '', routing_number: '', account_number: '', swift: '', instructions: '' },
  card_external: { enabled: false, label: 'Pay by card', url: '' },
  other: { enabled: false, instructions: '' },
}

// Rows written before the shape change carry the old keys (ach was one
// free-text `instructions`). Merge defaults key-by-key so every method has
// the full field set, while legacy values (like that ach text) survive.
export function mergeInstructionDefaults(raw) {
  const merged = {}
  for (const key of Object.keys(DEFAULT_INSTRUCTIONS)) {
    merged[key] = { ...DEFAULT_INSTRUCTIONS[key], ...(raw?.[key] && typeof raw[key] === 'object' ? raw[key] : {}) }
  }
  return merged
}

export function usePaymentInstructions() {
  const { company, refreshCompany } = useAuth()
  const { companyId } = useEffectiveCompany()
  const [paymentInstructions, setPaymentInstructions] = useState(DEFAULT_INSTRUCTIONS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetch = useCallback(async () => {
    if (!companyId) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('companies')
        .select('payment_instructions')
        .eq('id', companyId)
        .single()
      if (err) throw err
      setPaymentInstructions(mergeInstructionDefaults(data?.payment_instructions))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => { fetch() }, [fetch])

  // Refresh from company context when it changes
  useEffect(() => {
    if (company?.payment_instructions) {
      setPaymentInstructions(mergeInstructionDefaults(company.payment_instructions))
    }
  }, [company?.payment_instructions])

  async function savePaymentInstructions(updates) {
    if (!companyId) throw new Error('No company context')
    setError(null)
    try {
      const { error: err } = await supabase
        .from('companies')
        .update({ payment_instructions: updates })
        .eq('id', companyId)
      if (err) throw err
      setPaymentInstructions(updates)
      await refreshCompany()
      return { success: true }
    } catch (err) {
      setError(err.message)
      return { success: false, error: err.message }
    }
  }

  return { paymentInstructions, loading, error, savePaymentInstructions }
}
