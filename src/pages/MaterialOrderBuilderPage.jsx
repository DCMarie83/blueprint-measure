import { useParams } from 'react-router-dom'
import { useState } from 'react'
import AppHeader from '../components/AppHeader'
import BackLink from '../components/BackLink'
import { useAuth } from '../context/AuthContext'
import { useMaterialOrderBuilder } from '../hooks/useMaterialOrderBuilder'
import MaterialLineItemsTable from '../components/materials/MaterialLineItemsTable'

const secondaryBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--color-surface)', color: 'var(--color-text, #1b2426)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const primaryBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 20px', background: 'var(--color-primary)', color: 'var(--color-on-primary, #fff)', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 14, fontWeight: 600 }

export default function MaterialOrderBuilderPage() {
  const { orderId } = useParams()
  const { user, userProfile } = useAuth()
  const isAdmin = userProfile?.role === 'contractor_admin' || user?.email === 'main@ngautomationhub.com'

  const {
    order, items, loading, saving, error,
    addItem, updateItem, removeItem, updateOrderField,
    suggestFromMeasurements, saveAll,
  } = useMaterialOrderBuilder(orderId)

  const [notice, setNotice] = useState(null)

  if (loading) {
    return (
      <div>
        <AppHeader />
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px' }}>
          <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
        </div>
      </div>
    )
  }

  if (!order) {
    return (
      <div>
        <AppHeader />
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px' }}>
          <BackLink to="/dashboard" label="dashboard" />
          <p style={{ color: 'var(--color-text-muted)', marginTop: 16 }}>Materials order not found.</p>
        </div>
      </div>
    )
  }

  const handleSuggest = () => {
    const n = suggestFromMeasurements()
    setNotice(n > 0 ? `Added ${n} suggested line${n === 1 ? '' : 's'} from measurements.` : 'No paintable measurements found on this job yet.')
  }

  const handleSave = async () => {
    setNotice(null)
    const ok = await saveAll()
    setNotice(ok ? 'Saved.' : 'Save failed — see the error above.')
  }

  return (
    <div>
      <AppHeader />
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px' }}>
        <BackLink to={`/project/${order.project_id}`} label="project" />

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between', margin: '12px 0 20px' }}>
          <input
            value={order.title || ''}
            disabled={!isAdmin}
            placeholder="Untitled materials order"
            onChange={e => updateOrderField({ title: e.target.value })}
            style={{ flex: 1, minWidth: 240, fontSize: 22, fontWeight: 700, padding: '6px 10px', border: '1px solid transparent', borderRadius: 'var(--radius-sm)', background: 'transparent', color: 'var(--color-text, #1b2426)' }}
          />
          <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 9999, background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{order.status}</span>
        </div>

        {error && (
          <div style={{ background: 'var(--color-danger-bg, #fef2f2)', color: 'var(--color-danger, #dc2626)', border: '1px solid var(--color-danger, #dc2626)', borderRadius: 'var(--radius-md)', padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>{error}</div>
        )}

        {isAdmin && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
            <button onClick={handleSuggest} style={secondaryBtn}>Suggest from measurements</button>
            <button onClick={() => addItem()} style={secondaryBtn}>+ Add line</button>
          </div>
        )}

        {notice && (
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 12 }}>{notice}</div>
        )}

        <MaterialLineItemsTable items={items} onUpdate={updateItem} onRemove={removeItem} readOnly={!isAdmin} />

        {isAdmin && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
            <button onClick={handleSave} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.6 : 1, cursor: saving ? 'default' : 'pointer' }}>
              {saving ? 'Saving…' : 'Save order'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
