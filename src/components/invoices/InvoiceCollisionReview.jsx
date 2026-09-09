import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import styles from '../import/ImportWizardModal.module.css'

// G69: collision review cards for the invoice import. Every incoming row whose
// invoice number already exists on the company is held here; each card shows
// the existing invoice next to the incoming row and offers four actions. The
// chosen action rides back to the writer as the row's _resolution — nothing
// writes from this component, and an unchosen row is left out of the run.
//
// Refusals mirror the writer's checks: revise/add-on are blocked on paid and
// void invoices and whenever the resulting total would land below the
// payments already on file, each explained in plain words.

const fmtUSD = (v) => `$${(Number(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// Same money reading the writer's normalizeInvoiceLines applies: qty × rate
// when both are present, else the printed line total.
function lineMoney(li) {
  const qty = Number(li.quantity) || 0
  const rate = Number(li.unit_rate) || 0
  if (qty > 0 && rate > 0) return Math.round(qty * rate * 100) / 100
  return Number(li.total) || 0
}

function incomingLineSum(row) {
  return Math.round((row._lines ?? []).reduce((s, li) => s + lineMoney(li), 0) * 100) / 100
}

const norm = (v) => String(v ?? '').trim().toLowerCase()

const ACTIONS = ['skip', 'revise', 'addon', 'renumber']

export default function InvoiceCollisionReview({ rows, resolutions, setResolution, t }) {
  const [existing, setExisting] = useState(null) // id → invoice with relations
  const [loadError, setLoadError] = useState(null)

  const ids = [...new Set(rows.map(r => r._existingId).filter(Boolean))]
  const idsKey = ids.sort().join(',')

  useEffect(() => {
    if (!idsKey) { setExisting(new Map()); return }
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('id, invoice_number, status, total, created_at, client_id, clients(display_name), projects(name), invoice_line_items(id, description, quantity, unit_rate, total, sort_order), invoice_payments(id, amount, payment_date, payment_method)')
        .in('id', idsKey.split(','))
      if (cancelled) return
      if (error) { setLoadError(error.message); return }
      setExisting(new Map((data ?? []).map(inv => [inv.id, inv])))
    })()
    return () => { cancelled = true }
  }, [idsKey])

  if (loadError) return <div className={styles.error}>{loadError}</div>
  if (!existing) return <p className={styles.info}>{t('invoices:import.review.loading')}</p>

  return (
    <div style={{ margin: '12px 0' }}>
      <p className={styles.info} style={{ fontWeight: 600 }}>
        {t('invoices:import.review.heldTitle', { count: rows.length })}
      </p>
      {rows.map(row => {
        const ex = existing.get(row._existingId)
        if (!ex) return null
        const chosen = resolutions[row._index]?.action ?? null

        const payments = (ex.invoice_payments ?? [])
          .slice()
          .sort((a, b) => String(a.payment_date ?? '').localeCompare(String(b.payment_date ?? '')))
        const ledger = Math.round(payments.reduce((s, p) => s + (Number(p.amount) || 0), 0) * 100) / 100
        const exLines = (ex.invoice_line_items ?? []).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        const inLines = row._lines ?? []
        const inLineSum = incomingLineSum(row)
        const hasIncomingMoney = row._total != null || inLines.length > 0
        const reviseTotal = row._total ?? inLineSum
        const addonTotal = Math.round(((Number(ex.total) || 0) + (row._total ?? inLineSum)) * 100) / 100

        // One blocking reason per action, in plain words; null means allowed.
        function blockReason(action) {
          if (action !== 'revise' && action !== 'addon') return null
          if (ex.status === 'paid') return t('invoices:import.review.refusePaid')
          if (ex.status === 'void') return t('invoices:import.review.refuseVoid')
          if (!hasIncomingMoney) return t('invoices:import.review.refuseNoMoney')
          const newTotal = action === 'revise' ? reviseTotal : addonTotal
          if (newTotal < ledger) {
            return t('invoices:import.review.refuseBelowPayments', { newTotal: fmtUSD(newTotal), paid: fmtUSD(ledger) })
          }
          return null
        }

        const exDate = (ex.created_at ?? '').slice(0, 10)
        const diffs = {
          client: !!norm(row.client) && norm(row.client) !== norm(ex.clients?.display_name),
          job: !!norm(row.job_name) && norm(row.job_name) !== norm(ex.projects?.name),
          date: !!row._invoiceDate && row._invoiceDate !== exDate,
          total: row._total != null && Math.round(row._total * 100) !== Math.round((Number(ex.total) || 0) * 100),
        }
        const hl = (on) => (on ? { background: 'var(--color-warning-bg)', borderRadius: 4, padding: '0 4px' } : undefined)

        const field = (labelKey, value, diff) => (
          <div style={{ fontSize: 12, padding: '2px 0' }}>
            <span style={{ color: 'var(--color-text-muted)' }}>{t(labelKey)}: </span>
            <span style={hl(diff)}>{value || t('import:empty')}</span>
          </div>
        )

        return (
          <div
            key={row._index}
            style={{ border: '1px solid var(--color-warning-border)', borderRadius: 'var(--radius)', padding: 12, margin: '10px 0' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <strong style={{ fontSize: 13 }}>{row.invoice_number}</strong>
              <span className={styles.warnBadge}>{t('invoices:import.review.badge')}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              {/* Existing invoice */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 4 }}>
                  {t('invoices:import.review.existing')}
                </div>
                {field('invoices:import.review.client', ex.clients?.display_name, diffs.client)}
                {field('invoices:import.review.job', ex.projects?.name, diffs.job)}
                {field('invoices:import.review.date', exDate, diffs.date)}
                {field('invoices:import.review.total', fmtUSD(ex.total), diffs.total)}
                {field('invoices:import.review.status', ex.status, false)}
                <div style={{ fontSize: 12, padding: '2px 0' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>{t('invoices:import.review.payments')}: </span>
                  {payments.length === 0 ? t('invoices:import.review.noPayments') : null}
                </div>
                {payments.map(p => (
                  <div key={p.id} style={{ fontSize: 12, paddingLeft: 12 }}>
                    {fmtUSD(p.amount)} · {(p.payment_date ?? '').slice(0, 10)}{p.payment_method ? ` · ${p.payment_method}` : ''}
                  </div>
                ))}
                <div style={{ fontSize: 12, padding: '2px 0' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>{t('invoices:import.review.lineItems')}: </span>
                  {exLines.length === 0 ? t('invoices:import.review.noLineItems') : null}
                </div>
                {exLines.map(li => (
                  <div key={li.id} style={{ fontSize: 12, paddingLeft: 12 }}>
                    {li.description} · {fmtUSD(li.total)}
                  </div>
                ))}
              </div>

              {/* Incoming row */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 4 }}>
                  {t('invoices:import.review.incoming')}
                </div>
                {field('invoices:import.review.client', row.client, diffs.client)}
                {field('invoices:import.review.job', row.job_name, diffs.job)}
                {field('invoices:import.review.date', row._invoiceDate, diffs.date)}
                {field('invoices:import.review.total', row._total != null ? fmtUSD(row._total) : '', diffs.total)}
                <div style={{ fontSize: 12, padding: '2px 0' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>{t('invoices:import.review.lineItems')}: </span>
                  {inLines.length === 0 ? t('invoices:import.review.noLineItems') : null}
                </div>
                {inLines.map((li, idx) => (
                  <div key={idx} style={{ fontSize: 12, paddingLeft: 12 }}>
                    {(li.description || '').trim() || t('import:empty')} · {fmtUSD(lineMoney(li))}
                  </div>
                ))}
              </div>
            </div>

            {/* Actions: one click on this row chooses; clicking again clears. */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {ACTIONS.map(action => {
                const reason = blockReason(action)
                return (
                  <button
                    key={action}
                    type="button"
                    className={`${styles.btn} ${chosen === action ? styles.btnPrimary : styles.btnSecondary}`}
                    style={{ padding: '5px 10px', fontSize: 12 }}
                    disabled={!!reason}
                    title={reason ?? undefined}
                    onClick={() => setResolution(row._index, chosen === action ? null : { action })}
                  >
                    {t(`invoices:import.review.action.${action}`)}
                  </button>
                )
              })}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 6 }}>
              {chosen
                ? t(`invoices:import.review.hint.${chosen}`)
                : t('invoices:import.review.chooseHint')}
            </div>
            {ACTIONS.map(action => {
              const reason = blockReason(action)
              if (!reason) return null
              return (
                <div key={action} style={{ fontSize: 12, color: 'var(--color-warning)', marginTop: 4 }}>
                  {t(`invoices:import.review.action.${action}`)}: {reason}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
