import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useEffectiveCompany } from './useEffectiveCompany'

export function usePricingCategories() {
  const { companyId } = useEffectiveCompany()
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchCategories = useCallback(async () => {
    if (!companyId) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('pricing_categories')
        .select('*')
        .eq('company_id', companyId)
        .order('sort_order', { ascending: true })
      if (err) throw err
      setCategories(data ?? [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => { fetchCategories() }, [fetchCategories])

  async function createCategory(payload) {
    if (!companyId) throw new Error('No company')
    const { data, error: err } = await supabase
      .from('pricing_categories')
      .insert({ ...payload, company_id: companyId })
      .select().single()
    if (err) throw err
    await fetchCategories()
    return data
  }

  async function updateCategory(id, patch) {
    const { error: err } = await supabase
      .from('pricing_categories')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (err) throw err
    await fetchCategories()
  }

  async function deleteCategory(id) {
    const { error: err } = await supabase.from('pricing_categories').delete().eq('id', id)
    if (err) throw err
    await fetchCategories()
  }

  return { categories, loading, error, createCategory, updateCategory, deleteCategory, refetch: fetchCategories }
}
