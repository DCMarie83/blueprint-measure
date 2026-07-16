import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useEffectiveCompany } from './useEffectiveCompany'

// Per-GC piece/hourly catalog. A work_items row is scoped to one GC
// (client_id NOT NULL) inside the sub's own tenant (company_id). Rates are the
// sub's own rate for that GC — never platform pricing.
export function useWorkItems(clientId) {
  const { companyId } = useEffectiveCompany()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchItems = useCallback(async () => {
    if (!companyId || !clientId) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('work_items')
        .select('*')
        .eq('company_id', companyId)
        .eq('client_id', clientId)
        .order('category', { ascending: true })
        .order('name', { ascending: true })
      if (err) throw err
      setItems(data ?? [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [companyId, clientId])

  useEffect(() => { fetchItems() }, [fetchItems])

  async function createItem(payload) {
    if (!companyId || !clientId) throw new Error('No company/GC context')
    const { data, error: err } = await supabase
      .from('work_items')
      .insert({ ...payload, company_id: companyId, client_id: clientId })
      .select()
      .single()
    if (err) throw new Error(err.message)
    await fetchItems()
    return data
  }

  // Log-first path: turn a work_item_library row into a GC catalog item in one
  // insert, carrying category/unit/segment from the library row and the sub's
  // entered rate. Returns the new row so the composer can log against it.
  async function createFromLibrary(libraryRow, rate) {
    return createItem({
      library_item_id: libraryRow.id,
      category: libraryRow.category || null,
      name: libraryRow.name,
      unit: libraryRow.unit,
      segment: libraryRow.segment || null,
      rate,
      is_active: true,
    })
  }

  async function createManyItems(rows) {
    if (!companyId || !clientId) throw new Error('No company/GC context')
    if (rows.length === 0) return
    const withScope = rows.map(r => ({ ...r, company_id: companyId, client_id: clientId }))
    const { error: err } = await supabase.from('work_items').insert(withScope)
    if (err) throw new Error(err.message)
    await fetchItems()
  }

  async function updateItem(id, fields) {
    const { error: err } = await supabase.from('work_items').update(fields).eq('id', id)
    if (err) throw new Error(err.message)
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...fields } : i))
  }

  async function deleteItem(id) {
    const { error: err } = await supabase.from('work_items').delete().eq('id', id)
    if (err) throw new Error(err.message)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  return { items, loading, error, refetch: fetchItems, createItem, createFromLibrary, createManyItems, updateItem, deleteItem }
}
