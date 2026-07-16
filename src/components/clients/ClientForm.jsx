import { useState } from 'react'
import { X, Plus } from 'lucide-react'
import { RESIDENTIAL_PROPERTY_TYPES, COMMERCIAL_PROPERTY_TYPES, BILLING_TERMS, CONTACT_METHODS } from '../../data/clientPropertyTypes'
import styles from './ClientForm.module.css'

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC']

function AddressFields({ value, onChange }) {
  return (
    <div className={styles.addressGrid}>
      <input className={styles.input} placeholder="Street address" value={value.street || ''} onChange={e => onChange({ ...value, street: e.target.value })} style={{ gridColumn: '1 / -1' }} />
      <input className={styles.input} placeholder="Unit / Suite" value={value.unit || ''} onChange={e => onChange({ ...value, unit: e.target.value })} />
      <input className={styles.input} placeholder="City" value={value.city || ''} onChange={e => onChange({ ...value, city: e.target.value })} />
      <select className={styles.select} value={value.state || ''} onChange={e => onChange({ ...value, state: e.target.value })}>
        <option value="">State</option>
        {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <input className={styles.input} placeholder="ZIP" value={value.zip || ''} onChange={e => onChange({ ...value, zip: e.target.value })} maxLength={10} />
    </div>
  )
}

export default function ClientForm({ initialClient = null, initialContacts = [], onSubmit, onCancel }) {
  const isEdit = !!initialClient

  // Form state
  const [clientType, setClientType] = useState(initialClient?.client_type || 'residential')
  const [displayName, setDisplayName] = useState(initialClient?.display_name || '')
  const [businessName, setBusinessName] = useState(initialClient?.business_name || '')
  const [primaryEmail, setPrimaryEmail] = useState(initialClient?.primary_email || '')
  const [primaryPhone, setPrimaryPhone] = useState(initialClient?.primary_phone || '')
  const [preferredContactMethod, setPreferredContactMethod] = useState(initialClient?.preferred_contact_method || '')
  const [propertyType, setPropertyType] = useState(initialClient?.property_type || '')
  const [propertyAddress, setPropertyAddress] = useState(initialClient?.property_address || { street: '', unit: '', city: '', state: '', zip: '' })
  const [billingAddressSame, setBillingAddressSame] = useState(!initialClient?.billing_address)
  const [billingAddress, setBillingAddress] = useState(initialClient?.billing_address || { street: '', unit: '', city: '', state: '', zip: '' })
  const [billingTerms, setBillingTerms] = useState(initialClient?.billing_terms || '')
  const [companyWebsite, setCompanyWebsite] = useState(initialClient?.company_website || '')
  const [taxId, setTaxId] = useState(initialClient?.tax_id || '')
  const [tags, setTags] = useState(initialClient?.tags || [])
  const [tagInput, setTagInput] = useState('')
  const [notes, setNotes] = useState(initialClient?.notes || '')
  const emptyContact = { name: '', title: '', email: '', phone: '', is_primary: true, is_portal_recipient: false, notes: '' }
  const [contacts, setContacts] = useState(initialContacts.length > 0 ? initialContacts : (initialClient?.client_type || 'residential') === 'commercial' ? [{ ...emptyContact }] : [])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const propertyTypes = clientType === 'commercial' ? COMMERCIAL_PROPERTY_TYPES : RESIDENTIAL_PROPERTY_TYPES
  // General contractors are a business-shaped client too — they carry a business name.
  const showBusiness = clientType === 'commercial' || clientType === 'general_contractor'
  const canSubmit = !!displayName.trim()

  function addTag() {
    const t = tagInput.trim()
    if (t && !tags.includes(t)) setTags(prev => [...prev, t])
    setTagInput('')
  }

  function removeTag(tag) { setTags(prev => prev.filter(t => t !== tag)) }

  function addContact() {
    setContacts(prev => [...prev, { name: '', title: '', email: '', phone: '', is_primary: false, is_portal_recipient: false, notes: '' }])
  }

  function updateContact(idx, field, value) {
    setContacts(prev => prev.map((c, i) => {
      if (i !== idx) return field === 'is_primary' && value ? { ...c, is_primary: false } : c
      return { ...c, [field]: value }
    }))
  }

  function removeContact(idx) {
    setContacts(prev => {
      const next = prev.filter((_, i) => i !== idx)
      if (next.length > 0 && !next.some(c => c.is_primary)) next[0].is_primary = true
      return next
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError('')
    try {
      const effectiveDisplayName = showBusiness && !displayName.trim() ? businessName.trim() : displayName.trim()
      const payload = {
        client_type: clientType,
        display_name: effectiveDisplayName,
        business_name: showBusiness ? businessName.trim() || null : null,
        primary_email: primaryEmail.trim() || null,
        primary_phone: primaryPhone.trim() || null,
        preferred_contact_method: preferredContactMethod || null,
        property_type: propertyType || null,
        property_address: propertyAddress.street ? propertyAddress : null,
        billing_address: billingAddressSame ? null : (billingAddress.street ? billingAddress : null),
        billing_terms: billingTerms || null,
        company_website: clientType === 'commercial' ? companyWebsite.trim() || null : null,
        tax_id: clientType === 'commercial' ? taxId.trim() || null : null,
        tags,
        notes: notes.trim() || null,
      }
      const validContacts = contacts.filter(c => c.name.trim()).map(c => ({
        name: c.name.trim(),
        title: c.title?.trim() || null,
        email: c.email?.trim() || null,
        phone: c.phone?.trim() || null,
        is_primary: c.is_primary,
        is_portal_recipient: c.is_portal_recipient,
        notes: c.notes?.trim() || null,
      }))
      await onSubmit(payload, validContacts)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {error && <div className={styles.error}>{error}</div>}

      {/* Type toggle */}
      <div className={styles.section}>
        <div className={styles.typeToggle}>
          <button type="button" className={`${styles.typeBtn} ${clientType === 'residential' ? styles.typeBtnActive : ''}`} onClick={() => {
            setClientType('residential')
            setContacts(prev => prev.length === 1 && !prev[0].name.trim() ? [] : prev)
          }}>Residential</button>
          <button type="button" className={`${styles.typeBtn} ${clientType === 'commercial' ? styles.typeBtnActive : ''}`} onClick={() => {
            setClientType('commercial')
            setContacts(prev => prev.length === 0 ? [{ ...emptyContact }] : prev)
          }}>Commercial</button>
          <button type="button" className={`${styles.typeBtn} ${clientType === 'general_contractor' ? styles.typeBtnActive : ''}`} onClick={() => {
            setClientType('general_contractor')
          }}>General Contractor</button>
        </div>
      </div>

      {/* Identity */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>{showBusiness ? 'Business Info' : 'Client Info'}</h3>
        {showBusiness && (
          <label className={styles.field}><span>Business Name</span><input className={styles.input} value={businessName} onChange={e => { setBusinessName(e.target.value); if (!displayName || displayName === businessName) setDisplayName(e.target.value) }} placeholder="Acme Corp" /></label>
        )}
        <label className={styles.field}><span>{showBusiness ? 'Display Name' : 'Client Name(s)'}</span><input className={styles.input} value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder={showBusiness ? 'How this client appears in lists' : 'John & Mary Smith'} required /></label>
      </div>

      {/* Contact */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Contact</h3>
        <div className={styles.row}>
          <label className={styles.field}><span>Email</span><input className={styles.input} type="email" value={primaryEmail} onChange={e => setPrimaryEmail(e.target.value)} placeholder="client@email.com" /></label>
          <label className={styles.field}><span>Phone</span><input className={styles.input} value={primaryPhone} onChange={e => setPrimaryPhone(e.target.value)} placeholder="(555) 123-4567" /></label>
        </div>
        <label className={styles.field}><span>Preferred Contact Method</span>
          <select className={styles.select} value={preferredContactMethod} onChange={e => setPreferredContactMethod(e.target.value)}>
            <option value="">No preference</option>
            {CONTACT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </label>
      </div>

      {/* Property */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Property</h3>
        <label className={styles.field}><span>Property Type</span>
          <select className={styles.select} value={propertyType} onChange={e => setPropertyType(e.target.value)}>
            <option value="">Select type</option>
            {propertyTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <div className={styles.fieldLabel}>Property Address</div>
        <AddressFields value={propertyAddress} onChange={setPropertyAddress} />
      </div>

      {/* Billing */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Billing</h3>
        <label className={styles.checkRow}><input type="checkbox" checked={billingAddressSame} onChange={e => setBillingAddressSame(e.target.checked)} /><span>Billing address same as property</span></label>
        {!billingAddressSame && (<><div className={styles.fieldLabel}>Billing Address</div><AddressFields value={billingAddress} onChange={setBillingAddress} /></>)}
        <label className={styles.field}><span>Billing Terms</span>
          <select className={styles.select} value={billingTerms} onChange={e => setBillingTerms(e.target.value)}>
            <option value="">Select terms</option>
            {BILLING_TERMS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
      </div>

      {/* Commercial-only */}
      {clientType === 'commercial' && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Commercial Details</h3>
          <div className={styles.row}>
            <label className={styles.field}><span>Website</span><input className={styles.input} value={companyWebsite} onChange={e => setCompanyWebsite(e.target.value)} placeholder="https://..." /></label>
            <label className={styles.field}><span>Tax ID / EIN</span><input className={styles.input} value={taxId} onChange={e => setTaxId(e.target.value)} placeholder="XX-XXXXXXX" /></label>
          </div>
        </div>
      )}

      {/* Tags */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Tags</h3>
        <div className={styles.tagRow}>
          {tags.map(t => <span key={t} className={styles.tag}>{t}<button type="button" onClick={() => removeTag(t)} className={styles.tagRemove}><X size={12} /></button></span>)}
          <input className={styles.tagInput} value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag() } }} placeholder="Add tag..." />
        </div>
      </div>

      {/* Notes */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Notes</h3>
        <textarea className={styles.textarea} value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Internal notes about this client..." />
      </div>

      {/* Contacts */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>{clientType === 'commercial' ? 'Contacts' : 'Additional Contacts (optional)'}</h3>
          <button type="button" className={styles.addBtn} onClick={addContact}><Plus size={14} /> Add Contact</button>
        </div>
        <p className={styles.contactHint}>
          {clientType === 'commercial'
            ? 'Add the people you work with at this business — optional but recommended'
            : `Add spouse, partner, or other decision-makers — leave empty if you'll work directly with ${displayName.trim() || 'the client'}`
          }
        </p>
        {contacts.map((c, i) => (
          <div key={i} className={styles.contactCard}>
            <div className={styles.row}>
              <label className={styles.field}><span>Name</span><input className={styles.input} value={c.name} onChange={e => updateContact(i, 'name', e.target.value)} placeholder="Contact name" /></label>
              <label className={styles.field}><span>Title</span><input className={styles.input} value={c.title || ''} onChange={e => updateContact(i, 'title', e.target.value)} placeholder="e.g. Property Manager" /></label>
            </div>
            <div className={styles.row}>
              <label className={styles.field}><span>Email</span><input className={styles.input} type="email" value={c.email || ''} onChange={e => updateContact(i, 'email', e.target.value)} /></label>
              <label className={styles.field}><span>Phone</span><input className={styles.input} value={c.phone || ''} onChange={e => updateContact(i, 'phone', e.target.value)} /></label>
            </div>
            <div className={styles.contactOptions}>
              <label className={styles.checkRow}><input type="checkbox" checked={c.is_primary} onChange={() => updateContact(i, 'is_primary', true)} /><span>Primary</span></label>
              <label className={styles.checkRow}><input type="checkbox" checked={c.is_portal_recipient} onChange={e => updateContact(i, 'is_portal_recipient', e.target.checked)} /><span>Portal recipient</span></label>
              <button type="button" className={styles.removeBtn} onClick={() => removeContact(i)}>Remove</button>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className={styles.footer}>
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
        <button type="submit" className={styles.submitBtn} disabled={!canSubmit || submitting}>{submitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Client'}</button>
      </div>
    </form>
  )
}
