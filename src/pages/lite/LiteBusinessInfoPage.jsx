import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import AppHeader from '../../components/AppHeader'
import { useEffectiveCompany } from '../../hooks/useEffectiveCompany'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import styles from './lite.module.css'

// Lite "Business info" — the sub's letterhead + how they want to be paid. These
// three fields show up on every invoice PDF/email, so the copy stays plain and
// money-serious (no puns). We write existing companies columns only: name,
// business_phone, and the free-text payment note tucked into the structured
// payment_instructions "other" slot so the shared invoice renderer picks it up.
export default function LiteBusinessInfoPage() {
  const navigate = useNavigate()
  const { company, companyId } = useEffectiveCompany()
  const { refreshCompany } = useAuth()

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [payText, setPayText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [savedOk, setSavedOk] = useState(false)

  useEffect(() => {
    if (!company) return
    setName(company.name || '')
    setPhone(company.business_phone || '')
    setPayText(company.payment_instructions?.other?.instructions || '')
  }, [company])

  async function handleSave() {
    if (!companyId) return
    setSaving(true); setError(null); setSavedOk(false)
    try {
      // Preserve any other structured payment keys; only touch the free-text slot.
      const existing = (company?.payment_instructions && typeof company.payment_instructions === 'object')
        ? { ...company.payment_instructions } : {}
      if (payText.trim()) existing.other = { enabled: true, instructions: payText.trim() }
      else delete existing.other
      const payment_instructions = Object.keys(existing).length ? existing : null

      const { error: updErr } = await supabase
        .from('companies')
        .update({
          name: name.trim() || null,
          business_phone: phone.trim() || null,
          payment_instructions,
          updated_at: new Date().toISOString(),
        })
        .eq('id', companyId)
      if (updErr) throw new Error(updErr.message)

      await refreshCompany()
      setSavedOk(true)
      setTimeout(() => setSavedOk(false), 3000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.page}>
      <AppHeader />
      <main className={styles.main}>
        <button className={styles.backLink} onClick={() => navigate(-1)}><ChevronLeft size={15} /> Back</button>

        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Business info</h1>
            <p className={styles.subtitle}>Appears on every invoice you send</p>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.field} style={{ marginBottom: 12 }}>
            <span className={styles.fieldLabel}>Business name</span>
            <input className={styles.input} value={name} onChange={e => setName(e.target.value)} placeholder="Your business name" />
          </div>

          <div className={styles.field} style={{ marginBottom: 12 }}>
            <span className={styles.fieldLabel}>Phone</span>
            <input className={styles.input} value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 555-5555" />
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Payment instructions</span>
            <textarea
              className={styles.input}
              style={{ minHeight: 100, resize: 'vertical', fontFamily: 'inherit' }}
              value={payText}
              onChange={e => setPayText(e.target.value)}
              placeholder="Zelle: you@email.com&#10;Check payable to: Your Name"
            />
            <p className={styles.helper}>Shown on every invoice. Zelle, check, ACH details — text only.</p>
          </div>

          {error && <div className={styles.error} style={{ marginTop: 12, marginBottom: 0 }}>{error}</div>}

          <div className={styles.sheetActions} style={{ marginTop: 16 }}>
            {savedOk && <span className={styles.helper} style={{ color: 'var(--color-success)', alignSelf: 'center' }}>Saved.</span>}
            <button className={styles.primaryBtn} onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </main>
    </div>
  )
}
