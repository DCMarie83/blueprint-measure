import { supabase } from '../lib/supabase'

const VALID_CLIENT_TYPES = new Set(['residential', 'commercial'])

function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

export async function importClients({ rows, defaultClientType, addressesAreJobsites, existingEmails, createClient, companyId, onProgress }) {
  const imported = []
  const skipped = []
  const failed = []
  const seenEmails = new Set(existingEmails)

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const name = (row.display_name || '').trim()

    if (!name) {
      skipped.push({ name: name || `Row ${i + 2}`, reason: 'missing_name' })
      onProgress?.(i + 1, rows.length)
      continue
    }

    const email = (row.primary_email || '').trim().toLowerCase()
    if (email && seenEmails.has(email)) {
      skipped.push({ name, reason: 'duplicate_email' })
      onProgress?.(i + 1, rows.length)
      continue
    }

    const rawType = (row.client_type || '').trim().toLowerCase()
    const clientType = VALID_CLIENT_TYPES.has(rawType) ? rawType : defaultClientType

    const payload = {
      client_type: clientType,
      display_name: name,
    }

    if (row.business_name?.trim()) payload.business_name = row.business_name.trim()
    if (email) payload.primary_email = email
    if (row.primary_phone?.trim()) payload.primary_phone = row.primary_phone.trim()
    if (row.property_type?.trim()) payload.property_type = row.property_type.trim()
    if (row.billing_terms?.trim()) payload.billing_terms = row.billing_terms.trim()
    if (row.company_website?.trim()) payload.company_website = row.company_website.trim()
    if (row.tax_id?.trim()) payload.tax_id = row.tax_id.trim()
    if (row.notes?.trim()) payload.notes = row.notes.trim()

    try {
      const client = await createClient(payload)

      const street = (row.addr_street || '').trim()
      const city = (row.addr_city || '').trim()
      const state = (row.addr_state || '').trim()
      const zip = (row.addr_zip || '').trim()
      const unit = (row.addr_unit || '').trim()

      if (street || city || state || zip) {
        await supabase.from('client_addresses').insert({
          client_id: client.id,
          company_id: companyId,
          address_type: addressesAreJobsites ? 'jobsite' : 'property',
          street: street || null,
          unit: unit || null,
          city: city || null,
          state: state || null,
          zip: zip || null,
          is_primary: true,
        })
      }

      if (email) seenEmails.add(email)
      imported.push({ name })
    } catch (err) {
      failed.push({ name, error: err.message || String(err) })
    }

    onProgress?.(i + 1, rows.length)
  }

  return { imported, skipped, failed }
}
