import { supabase } from '../../lib/supabase'
import { appendBatchId, buildUpdatePatch } from './importHelpers'

// Writer for the Clients import. Rows arrive normalized (client_type and
// billing_terms already valid enum values or null), pre-filtered by the review
// step, and carrying an upsert disposition (_disposition 'new' | 'update',
// _existingId/_existing when updating). Collect-and-continue: a failed row
// never aborts the run, and there is NO per-row list refetch — the wizard
// refreshes once at the end.
//
// Update semantics: only mapped non-empty source values overwrite (row._raw
// holds the raw mapped input); blanks never clear existing data. Updated rows
// get the batch id appended to import_source. Addresses are only written for
// NEW rows — updating never duplicates an address.
export async function writeClientRows({ rows, ctx, batchId, onProgress, companyId, existingEmails }) {
  const imported = []
  const updated = []
  const skipped = []
  const failed = []
  const seenEmails = new Set(existingEmails)

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const raw = row._raw ?? row
    const name = (row.display_name || '').trim()

    if (!name) {
      skipped.push({ name: name || `Row ${i + 2}`, reason: 'missing_name' })
      onProgress?.(i + 1, rows.length)
      continue
    }

    const email = (row.primary_email || '').trim().toLowerCase()

    try {
      if (row._disposition === 'update' && row._existingId) {
        const patch = buildUpdatePatch({
          display_name: (raw.display_name || '').trim(),
          client_type: (raw.client_type || '').trim() ? row.client_type : null,
          business_name: (raw.business_name || '').trim(),
          primary_email: email,
          primary_phone: (raw.primary_phone || '').trim(),
          property_type: (raw.property_type || '').trim(),
          billing_terms: row.billing_terms,
          company_website: (raw.company_website || '').trim(),
          tax_id: (raw.tax_id || '').trim(),
          notes: (raw.notes || '').trim(),
        })
        patch.import_source = appendBatchId(row._existing?.import_source, batchId)
        patch.updated_at = new Date().toISOString()

        const { error: updErr } = await supabase.from('clients').update(patch).eq('id', row._existingId)
        if (updErr) throw updErr
        updated.push({ name })
        onProgress?.(i + 1, rows.length)
        continue
      }

      if (email && seenEmails.has(email)) {
        skipped.push({ name, reason: 'duplicate_email' })
        onProgress?.(i + 1, rows.length)
        continue
      }

      const payload = {
        company_id: companyId,
        import_source: batchId,
        client_type: row.client_type,
        display_name: name,
      }

      if (row.business_name?.trim()) payload.business_name = row.business_name.trim()
      if (email) payload.primary_email = email
      if (row.primary_phone?.trim()) payload.primary_phone = row.primary_phone.trim()
      if (row.property_type?.trim()) payload.property_type = row.property_type.trim()
      if (row.billing_terms) payload.billing_terms = row.billing_terms
      if (row.company_website?.trim()) payload.company_website = row.company_website.trim()
      if (row.tax_id?.trim()) payload.tax_id = row.tax_id.trim()
      if (row.notes?.trim()) payload.notes = row.notes.trim()

      const { data: client, error: insErr } = await supabase
        .from('clients')
        .insert(payload)
        .select()
        .single()
      if (insErr) throw insErr
      row._createdId = client.id

      const street = (row.addr_street || '').trim()
      const city = (row.addr_city || '').trim()
      const state = (row.addr_state || '').trim()
      const zip = (row.addr_zip || '').trim()
      const unit = (row.addr_unit || '').trim()

      if (street || city || state || zip) {
        const { error: addrErr } = await supabase.from('client_addresses').insert({
          client_id: client.id,
          company_id: companyId,
          address_type: ctx.addressesAreJobsites ? 'jobsite' : 'property',
          street: street || null,
          unit: unit || null,
          city: city || null,
          state: state || null,
          zip: zip || null,
          is_primary: true,
        })
        if (addrErr) throw addrErr
      }

      if (email) seenEmails.add(email)
      imported.push({ name })
    } catch (err) {
      failed.push({ name, error: err.message || String(err) })
    }

    onProgress?.(i + 1, rows.length)
  }

  return { imported, updated, skipped, failed, created: [] }
}
