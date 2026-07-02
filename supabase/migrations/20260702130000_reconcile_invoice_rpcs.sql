-- B2/B3: capture invoice RPCs into the repo (they lived in prod only).
-- Also completes B1: get_portal_invoice now includes 'partial' so a
-- partially-paid invoice remains visible on the client portal.

create or replace function public.generate_invoice_number(p_company_id uuid)
returns text
language plpgsql
security definer
as $fn$
declare
  v_next integer;
  v_year text;
begin
  v_year := to_char(now(), 'YYYY');

  update public.companies
  set next_invoice_number = next_invoice_number + 1
  where id = p_company_id
  returning next_invoice_number - 1 into v_next;

  if v_next is null then
    raise exception 'Company not found: %', p_company_id;
  end if;

  return 'INV-' || v_year || '-' || lpad(v_next::text, 4, '0');
end;
$fn$;

create or replace function public.get_portal_invoice(p_portal_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_result jsonb;
  v_invoice_id uuid;
  v_invoice_number text;
  v_status text;
  v_viewed_at timestamptz;
  v_client_id uuid;
  v_company_id uuid;
begin
  select i.id, i.invoice_number, i.status, i.viewed_at, p.client_id, i.company_id
  into v_invoice_id, v_invoice_number, v_status, v_viewed_at, v_client_id, v_company_id
  from invoices i
  join projects p on p.id = i.project_id
  where i.portal_token = p_portal_token
    and i.status in ('sent', 'viewed', 'partial', 'paid', 'void');

  if not found then
    return null;
  end if;

  if v_status = 'sent' and v_viewed_at is null then
    update invoices set status = 'viewed', viewed_at = now(), updated_at = now()
    where id = v_invoice_id;

    if v_client_id is not null then
      begin
        insert into client_activity (client_id, company_id, activity_type, title, is_automated, metadata)
        values (v_client_id, v_company_id, 'invoice_viewed', 'Invoice viewed by client',
                true, jsonb_build_object('invoice_id', v_invoice_id, 'invoice_number', v_invoice_number));
      exception when others then
        raise warning 'Failed to log invoice_viewed activity: %', sqlerrm;
      end;
    end if;
  end if;

  select jsonb_build_object(
    'invoice', jsonb_build_object(
      'id', i.id,
      'invoice_number', i.invoice_number,
      'title', i.title,
      'status', case when i.status = 'sent' and i.viewed_at is null then 'viewed' else i.status end,
      'subtotal', i.subtotal,
      'adjustment_amount', i.adjustment_amount,
      'adjustment_label', i.adjustment_label,
      'total', i.total,
      'due_date', i.due_date,
      'notes', i.notes,
      'terms', i.terms,
      'sent_at', i.sent_at,
      'viewed_at', coalesce(i.viewed_at, now()),
      'paid_at', i.paid_at,
      'paid_amount', i.paid_amount,
      'payment_method', i.payment_method,
      'created_at', i.created_at
    ),
    'line_items', coalesce(
      (select jsonb_agg(
        jsonb_build_object(
          'id', li.id,
          'description', li.description,
          'category_name', li.category_name,
          'item_type', li.item_type,
          'unit', li.unit,
          'quantity', li.quantity,
          'unit_rate', li.unit_rate,
          'total', li.total,
          'sort_order', li.sort_order
        ) order by li.sort_order
      ) from invoice_line_items li where li.invoice_id = i.id),
      '[]'::jsonb
    ),
    'project_name', p.name,
    'project_address', p.address,
    'client_name', c.display_name,
    'client_business', c.business_name,
    'client_type', c.client_type,
    'company_name', co.name,
    'company_logo_url', co.logo_url,
    'company_primary_color', co.primary_color,
    'company_payment_instructions', co.payment_instructions,
    'company_portal_theme', co.portal_theme
  )
  into v_result
  from invoices i
  join projects p on p.id = i.project_id
  left join clients c on c.id = p.client_id
  join companies co on co.id = i.company_id
  where i.id = v_invoice_id;

  return v_result;
end;
$fn$;
