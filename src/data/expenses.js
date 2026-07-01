import { supabase } from '../lib/supabase'

export async function listExpensesByProject(projectId) {
  if (!projectId) return []
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('project_id', projectId)
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createExpense({ project_id, company_id, category, description, amount, expense_date, vendor, notes }) {
  const { data, error } = await supabase
    .from('expenses')
    .insert({
      project_id,
      company_id,
      category: category || 'other',
      description,
      amount: Number(amount) || 0,
      expense_date: expense_date || new Date().toISOString().slice(0, 10),
      vendor: vendor || null,
      notes: notes || null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateExpense(id, fields) {
  const { data, error } = await supabase
    .from('expenses')
    .update(fields)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteExpense(id) {
  const { error } = await supabase
    .from('expenses')
    .delete()
    .eq('id', id)
  if (error) throw error
}
