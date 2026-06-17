import { supabase } from '../lib/supabase'

// ── Public queries ───────────────────────────────────────────────────────

export async function getResourceCategories() {
  const { data, error } = await supabase
    .from('resource_categories')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function getResources() {
  const { data, error } = await supabase
    .from('resources')
    .select('*')
    .eq('is_active', true)
    .order('is_featured', { ascending: false })
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data ?? []
}

// ── Admin queries (super-admin only — RLS enforces) ──────────────────────

export async function getAllCategories() {
  const { data, error } = await supabase
    .from('resource_categories')
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function getAllResources() {
  const { data, error } = await supabase
    .from('resources')
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function createCategory(payload) {
  const { data, error } = await supabase.from('resource_categories').insert(payload).select().single()
  if (error) throw error
  return data
}

export async function updateCategory(id, patch) {
  const { error } = await supabase.from('resource_categories').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteCategory(id) {
  const { error } = await supabase.from('resource_categories').delete().eq('id', id)
  if (error) {
    if (error.code === '23503' || error.message?.includes('restrict')) {
      throw new Error('This category still has resources. Move or delete them first.')
    }
    throw error
  }
}

export async function createResource(payload) {
  const { data, error } = await supabase.from('resources').insert(payload).select().single()
  if (error) throw error
  return data
}

export async function updateResource(id, patch) {
  const { error } = await supabase.from('resources').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function deleteResource(id) {
  const { error } = await supabase.from('resources').delete().eq('id', id)
  if (error) throw error
}
