-- Build 1: capture the tier a client accepts + their typed acceptance name.
-- Re-captures get_portal_estimate at its CURRENT prod definition (already
-- returns selected_variant/deposit_amount/terms) so the repo matches prod,
-- and adds accepted_variant/accepted_by_name to its return.

alter table public.estimates
  add column if not exists accepted_variant text
    check (accepted_variant is null or accepted_variant in ('good','better','best')),
  add column if not exists accepted_by_name text;

drop function if exists public.accept_estimate(uuid, text, text);

create or replace function public.accept_estimate(
  p_estimate_id uuid,
  p_portal_token text,
  p_typed_name text default ''::text,
  p_accepted_variant text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_project_id uuid;
  v_company_id uuid;
  v_client_id uuid;
  v_status text;
  v_estimate_number text;
  v_accepted_col uuid;
begin
  select p.id, p.company_id, p.client_id, e.status, e.estimate_number
  into v_project_id, v_company_id, v_client_id, v_status, v_estimate_number
  from estimates e
  join projects p on p.id = e.project_id
  where e.id = p_estimate_id
    and p.portal_token = p_portal_token
    and p.portal_enabled = true;

  if not found then
    raise exception 'Invalid estimate or portal token';
  end if;

  if v_status not in ('sent', 'declined') then
    raise exception 'Estimate cannot be accepted from current status: %', v_status;
  end if;

  if p_accepted_variant is not null
     and p_accepted_variant not in ('good','better','best') then
    raise exception 'Invalid accepted variant: %', p_accepted_variant;
  end if;

  select id into v_accepted_col
  from kanban_columns
  where company_id = v_company_id and position = 5
  limit 1;

  update estimates
  set status = 'accepted',
      accepted_at = now(),
      accepted_variant = coalesce(p_accepted_variant, selected_variant, accepted_variant),
      accepted_by_name = nullif(btrim(p_typed_name), ''),
      decline_reason = null,
      declined_at = null,
      response_notified_at = null,
      updated_at = now()
  where id = p_estimate_id;

  if v_accepted_col is not null then
    update projects
    set kanban_column_id = v_accepted_col,
        updated_at = now()
    where id = v_project_id;
  end if;

  if v_client_id is not null then
    begin
      insert into client_activity (client_id, company_id, activity_type, title, is_automated, metadata)
      values (v_client_id, v_company_id, 'estimate_accepted', 'Estimate accepted by client',
              true, jsonb_build_object(
                'estimate_id', p_estimate_id,
                'estimate_number', v_estimate_number,
                'accepted_variant', p_accepted_variant
              ));
    exception when others then
      raise warning 'Failed to log estimate_accepted activity: %', sqlerrm;
    end;
  end if;

  return jsonb_build_object(
    'success', true,
    'estimate_id', p_estimate_id,
    'project_id', v_project_id
  );
end;
$fn$;

grant execute on function public.accept_estimate(uuid, text, text, text) to anon, authenticated;

create or replace function public.get_portal_estimate(p_portal_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_result jsonb;
  v_estimate_id uuid;
  v_estimate_number text;
  v_client_id uuid;
  v_company_id uuid;
begin
  select e.id, e.estimate_number, p.client_id, e.company_id
  into v_estimate_id, v_estimate_number, v_client_id, v_company_id
  from estimates e
  join projects p on p.id = e.project_id
  where p.portal_token = p_portal_token
    and p.portal_enabled = true
    and e.status in ('sent', 'accepted', 'declined');

  if v_estimate_id is not null and v_client_id is not null then
    begin
      if not exists (
        select 1 from client_activity
        where activity_type = 'estimate_viewed'
          and metadata->>'estimate_id' = v_estimate_id::text
      ) then
        insert into client_activity (client_id, company_id, activity_type, title, is_automated, metadata)
        values (v_client_id, v_company_id, 'estimate_viewed', 'Estimate viewed by client',
                true, jsonb_build_object('estimate_id', v_estimate_id, 'estimate_number', v_estimate_number));
      end if;
    exception when others then
      raise warning 'Failed to log estimate_viewed activity: %', sqlerrm;
    end;
  end if;

  select jsonb_build_object(
    'estimate', jsonb_build_object(
      'id', e.id,
      'estimate_number', e.estimate_number,
      'title', e.title,
      'status', e.status,
      'good_total', e.good_total,
      'better_total', e.better_total,
      'best_total', e.best_total,
      'notes', e.notes,
      'sent_at', e.sent_at,
      'accepted_at', e.accepted_at,
      'declined_at', e.declined_at,
      'decline_reason', e.decline_reason,
      'expires_at', e.expires_at,
      'created_at', e.created_at,
      'selected_variant', e.selected_variant,
      'accepted_variant', e.accepted_variant,
      'accepted_by_name', e.accepted_by_name,
      'deposit_amount', e.deposit_amount,
      'terms', e.terms
    ),
    'line_items', coalesce(
      (select jsonb_agg(
        jsonb_build_object(
          'id', li.id,
          'description', li.description,
          'category_name', li.category_name,
          'unit', li.unit,
          'quantity', li.quantity,
          'rate_good', li.rate_good,
          'rate_better', li.rate_better,
          'rate_best', li.rate_best,
          'total_good', li.total_good,
          'total_better', li.total_better,
          'total_best', li.total_best,
          'source_zone_name', li.source_zone_name,
          'sort_order', li.sort_order
        ) order by li.sort_order
      ) from estimate_line_items li where li.estimate_id = e.id),
      '[]'::jsonb
    ),
    'project_name', p.name,
    'project_address', p.address,
    'client_name', c.display_name,
    'client_business', c.business_name,
    'company_name', co.name,
    'company_payment_instructions', co.payment_instructions,
    'company_portal_theme', co.portal_theme
  )
  into v_result
  from estimates e
  join projects p on p.id = e.project_id
  left join clients c on c.id = p.client_id
  join companies co on co.id = e.company_id
  where p.portal_token = p_portal_token
    and p.portal_enabled = true
    and e.status in ('sent', 'accepted', 'declined');

  return v_result;
end;
$fn$;

grant execute on function public.get_portal_estimate(text) to anon, authenticated;
