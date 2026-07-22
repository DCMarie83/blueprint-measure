import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useEffectiveCompany } from './useEffectiveCompany'

export function usePricingItems() {
  const { companyId } = useEffectiveCompany()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchItems = useCallback(async () => {
    if (!companyId) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('pricing_items')
        .select('*, pricing_categories(name, sort_order)')
        .eq('company_id', companyId)
        .order('sort_order', { ascending: true })
      if (err) throw err
      setItems(data ?? [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => { fetchItems() }, [fetchItems])

  async function createItem(payload) {
    if (!companyId) throw new Error('No company')
    const { data, error: err } = await supabase
      .from('pricing_items')
      .insert({ ...payload, company_id: companyId })
      .select().single()
    if (err) throw err
    await fetchItems()
    return data
  }

  async function updateItem(id, patch) {
    // Editing any field of a library row makes the rate the contractor's own:
    // stamp source='user' so a touched seeded starter no longer reads as seeded
    // (and can price Smart Bid). Callers may override by passing source explicitly.
    const finalPatch = ('source' in patch) ? patch : { ...patch, source: 'user' }
    const { error: err } = await supabase
      .from('pricing_items')
      .update({ ...finalPatch, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (err) throw err
    await fetchItems()
  }

  async function deleteItem(id) {
    const { error: err } = await supabase.from('pricing_items').delete().eq('id', id)
    if (err) throw err
    await fetchItems()
  }

  return { items, loading, error, createItem, updateItem, deleteItem, refetch: fetchItems }
}
