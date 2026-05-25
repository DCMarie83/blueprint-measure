import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const DEFAULT_INSTRUCTIONS = {
  check: { enabled: false, payable_to: '', mailing_address: '' },
  zelle: { enabled: false, handle: '' },
  venmo: { enabled: false, handle: '' },
  cashapp: { enabled: false, handle: '' },
  ach: { enabled: false, instructions: '' },
  card_external: { enabled: false, label: 'Pay with Card', url: '' },
  other: { enabled: false, instructions: '' },
}

export function usePaymentInstructions() {
  const { company, refreshCompany } = useAuth()
  const companyId = company?.id
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
      setPaymentInstructions(data?.payment_instructions ?? DEFAULT_INSTRUCTIONS)
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
      setPaymentInstructions(company.payment_instructions)
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
