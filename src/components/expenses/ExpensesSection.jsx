import { useState, useEffect, useCallback } from 'react'
import { listExpensesByProject, createExpense, updateExpense, deleteExpense } from '../../data/expenses'

const CATEGORIES = [
  { value: 'material', label: 'Material' },
  { value: 'labor', label: 'Labor' },
  { value: 'subcontractor', label: 'Subcontractor' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'permit', label: 'Permit' },
  { value: 'other', label: 'Other' },
]

const CAT_LABEL = Object.fromEntries(CATEGORIES.map(c => [c.value, c.label]))

function fmtMoney(val) {
  return `$${Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const EMPTY_FORM = {
  category: 'material',
  description: '',
  amount: '',
  expense_date: new Date().toISOString().slice(0, 10),
  vendor: '',
  notes: '',
}

export default function ExpensesSection({ projectId, companyId, isAdmin }) {
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)

  const load = useCallback(async () => {
    try {
      const data = await listExpensesByProject(projectId)
      setExpenses(data)
    } catch (err) {
      console.error('Expenses load:', err)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { load() }, [load])

  const total = expenses.reduce((s, e) => s + Number(e.amount || 0), 0)

  function openAdd() {
    setEditingId(null)
    setForm({ ...EMPTY_FORM, expense_date: new Date().toISOString().slice(0, 10) })
    setShowForm(true)
  }

  function openEdit(exp) {
    setEditingId(exp.id)
    setForm({
      category: exp.category || 'other',
      description: exp.description || '',
      amount: exp.amount ?? '',
      expense_date: exp.expense_date || new Date().toISOString().slice(0, 10),
      vendor: exp.vendor || '',
      notes: exp.notes || '',
    })
    setShowForm(true)
  }

  function cancelForm() {
    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  async function handleSave() {
    if (!form.description.trim() || !form.amount) return
    setSaving(true)
    try {
      if (editingId) {
        await updateExpense(editingId, {
          category: form.category,
          description: form.description.trim(),
          amount: Number(form.amount),
          expense_date: form.expense_date,
          vendor: form.vendor.trim() || null,
          notes: form.notes.trim() || null,
        })
      } else {
        await createExpense({
          project_id: projectId,
          company_id: companyId,
          category: form.category,
          description: form.description.trim(),
          amount: Number(form.amount),
          expense_date: form.expense_date,
          vendor: form.vendor.trim() || null,
          notes: form.notes.trim() || null,
        })
      }
      cancelForm()
      await load()
    } catch (err) {
      alert('Failed to save expense: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    try {
      await deleteExpense(id)
      setDeleteConfirmId(null)
      await load()
    } catch (err) {
      alert('Failed to delete: ' + err.message)
    }
  }

  if (loading) return null

  return (
    <section style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
          Expenses ({expenses.length}){' '}
          <span style={{ fontWeight: 400, fontSize: 13, color: 'var(--color-text-muted)' }}>{fmtMoney(total)}</span>
        </h3>
        {isAdmin && !showForm && (
          <button
            onClick={openAdd}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--color-primary)', color: 'var(--color-on-primary, #fff)', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            + Add Expense
          </button>
        )}
      </div>

      {/* Add/edit form */}
      {showForm && (
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 16, marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 130 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-muted)' }}>Category</label>
              <select
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                style={{ padding: '7px 10px', fontSize: 13, border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none' }}
              >
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 2, minWidth: 180 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-muted)' }}>Description *</label>
              <input
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="What was purchased"
                style={{ padding: '7px 10px', fontSize: 13, border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 100 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-muted)' }}>Amount *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
                style={{ padding: '7px 10px', fontSize: 13, border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 130 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-muted)' }}>Date</label>
              <input
                type="date"
                value={form.expense_date}
                onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))}
                style={{ padding: '7px 10px', fontSize: 13, border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none' }}
              />
            </div>
          </div>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '0 0 12px' }}>
            Materials orders and time entries already count toward job cost. Use expenses for costs outside those.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 140 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-muted)' }}>Vendor</label>
              <input
                value={form.vendor}
                onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))}
                placeholder="Store or supplier"
                style={{ padding: '7px 10px', fontSize: 13, border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 2, minWidth: 180 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-muted)' }}>Notes</label>
              <input
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes"
                style={{ padding: '7px 10px', fontSize: 13, border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none' }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={cancelForm}
              style={{ padding: '8px 16px', background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 13 }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !form.description.trim() || !form.amount}
              style={{ padding: '8px 16px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius)', fontWeight: 600, cursor: 'pointer', fontSize: 13, opacity: (saving || !form.description.trim() || !form.amount) ? 0.5 : 1 }}
            >
              {saving ? 'Saving...' : editingId ? 'Update' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Expense list */}
      {expenses.length === 0 && !showForm ? (
        <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>No expenses logged yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {expenses.map(exp => (
            <div
              key={exp.id}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 16px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                  {exp.expense_date}
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 9999, background: 'var(--color-surface-2, rgba(46,139,255,0.08))', color: 'var(--color-primary)', whiteSpace: 'nowrap', textTransform: 'capitalize' }}>
                  {CAT_LABEL[exp.category] || exp.category}
                </span>
                <span style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {exp.description}
                </span>
                {exp.vendor && (
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                    {exp.vendor}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtMoney(exp.amount)}</span>
                {isAdmin && (
                  <>
                    {deleteConfirmId === exp.id ? (
                      <>
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          style={{ fontSize: 12, background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: '4px 6px' }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleDelete(exp.id)}
                          style={{ fontSize: 12, background: 'none', border: 'none', color: 'var(--color-danger, #dc2626)', cursor: 'pointer', padding: '4px 6px', fontWeight: 600 }}
                        >
                          Confirm
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => openEdit(exp)}
                          style={{ fontSize: 12, background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: '4px 6px' }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(exp.id)}
                          style={{ fontSize: 12, background: 'none', border: 'none', color: 'var(--color-danger, #dc2626)', cursor: 'pointer', padding: '4px 6px' }}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
