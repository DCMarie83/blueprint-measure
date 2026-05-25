import { useState } from 'react'
import { Home, Receipt, HardHat, Mail, MapPin, Star, Edit, Trash2, Plus } from 'lucide-react'
import { useClientAddresses } from '../../hooks/useClientAddresses'
import ClientAddressModal from './ClientAddressModal'
import styles from './ClientAddressEditor.module.css'

const TYPE_ICONS = {
  property: Home,
  billing: Receipt,
  jobsite: HardHat,
  mailing: Mail,
  other: MapPin,
}

export default function ClientAddressEditor({ clientId }) {
  const { addresses, loading, addAddress, updateAddress, deleteAddress, setPrimary } = useClientAddresses(clientId)
  const [modalAddress, setModalAddress] = useState(undefined) // undefined = closed, null = new, object = edit
  const [deleting, setDeleting] = useState(null)

  async function handleSubmit(payload) {
    if (modalAddress?.id) {
      await updateAddress(modalAddress.id, payload)
      if (payload.is_primary && !modalAddress.is_primary) {
        await setPrimary(modalAddress.id)
      }
    } else {
      const created = await addAddress(payload)
      if (payload.is_primary) {
        await setPrimary(created.id)
      }
    }
  }

  async function handleDelete(addr) {
    if (!window.confirm('Delete this address?')) return
    setDeleting(addr.id)
    try {
      await deleteAddress(addr.id)
    } catch (err) {
      alert('Failed to delete: ' + err.message)
    } finally {
      setDeleting(null)
    }
  }

  async function handleSetPrimary(addr) {
    try {
      await setPrimary(addr.id)
    } catch (err) {
      alert('Failed: ' + err.message)
    }
  }

  if (loading) return <div className={styles.muted}>Loading addresses…</div>

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h2 className={styles.title}>Addresses ({addresses.length})</h2>
        <button className={styles.addBtn} onClick={() => setModalAddress(null)}>
          <Plus size={14} /> Add Address
        </button>
      </div>

      {addresses.length === 0 ? (
        <div className={styles.empty}>
          <MapPin size={20} />
          <span>No addresses yet — add one to track jobsite or billing locations.</span>
        </div>
      ) : (
        <div className={styles.list}>
          {addresses.map(addr => {
            const Icon = TYPE_ICONS[addr.address_type] ?? MapPin
            const line1 = [addr.street, addr.unit].filter(Boolean).join(', ')
            const line2 = [addr.city, addr.state, addr.zip].filter(Boolean).join(', ')
            return (
              <div key={addr.id} className={styles.card}>
                <div className={styles.cardIcon}><Icon size={18} /></div>
                <div className={styles.cardBody}>
                  {addr.label && <div className={styles.cardLabel}>{addr.label}</div>}
                  <div className={styles.cardType}>{addr.address_type}</div>
                  <div className={styles.cardLine}>{line1}</div>
                  {line2 && <div className={styles.cardLine2}>{line2}</div>}
                  {addr.notes && <div className={styles.cardNotes}>{addr.notes}</div>}
                </div>
                <div className={styles.cardActions}>
                  {addr.is_primary ? (
                    <span className={styles.primaryBadge}><Star size={12} /> Primary</span>
                  ) : (
                    <button className={styles.linkBtn} onClick={() => handleSetPrimary(addr)}>Set primary</button>
                  )}
                  <button className={styles.iconBtn} onClick={() => setModalAddress(addr)} title="Edit"><Edit size={14} /></button>
                  <button className={styles.iconBtn} onClick={() => handleDelete(addr)} disabled={deleting === addr.id} title="Delete"><Trash2 size={14} /></button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modalAddress !== undefined && (
        <ClientAddressModal
          onClose={() => setModalAddress(undefined)}
          onSubmit={handleSubmit}
          initialAddress={modalAddress}
        />
      )}
    </section>
  )
}
