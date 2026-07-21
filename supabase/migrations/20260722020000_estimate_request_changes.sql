-- Applied live in SQL Editor 2026-07-22. Matches prod. Migration ledger is dead. Never run via CLI.

-- Status vocabulary gains changes_requested.
alter table estimates drop constraint if exists estimates_status_check;
alter table estimates add constraint estimates_status_check
  check (status in ('draft', 'sent', 'accepted', 'declined', 'expired', 'changes_requested'));

-- Comment fields for the change request.
alter table estimates add column if not exists change_request_comment text;
alter table estimates add column if not exists changes_requested_at timestamptz;

-- Anon RPC: a client requests changes from the portal. Comment required; allowed
-- from sent or declined; sets changes_requested, stores the comment, clears the
-- accept/decline fields, resets response_notified_at, logs client_activity.
create or replace function public.request_estimate_changes(
  p_estimate_id uuid,
  p_portal_token text,
  p_comment text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_project_id uuid;
  v_company_id uuid;
  v_client_id uuid;
  v_status text;
begin
  if p_comment is null or btrim(p_comment) = '' then
    raise exception 'A comment describing the requested changes is required';
  end if;

  -- Validate token -> project -> estimate chain.
  select p.id, e.company_id, p.client_id, e.status
  into v_project_id, v_company_id, v_client_id, v_status
  from estimates e
  join projects p on p.id = e.project_id
  where e.id = p_estimate_id
    and p.portal_token = p_portal_token
    and p.portal_enabled = true;

  if not found then
    raise exception 'Invalid estimate or portal token';
  end if;

  if v_status not in ('sent', 'declined') then
    raise exception 'Changes cannot be requested from current status: %', v_status;
  end if;

  update estimates
  set status = 'changes_requested',
      change_request_comment = p_comment,
      changes_requested_at = now(),
      accepted_at = null,
      accepted_variant = null,
      declined_at = null,
      decline_reason = null,
      response_notified_at = null,
      updated_at = now()
  where id = p_estimate_id;

  insert into client_activity (company_id, client_id, user_id, activity_type, title, body, metadata, is_automated)
  select v_company_id, v_client_id, null, 'estimate_changes_requested',
         'Estimate changes requested', p_comment,
         jsonb_build_object('estimate_id', p_estimate_id, 'project_id', v_project_id),
         true
  where v_client_id is not null;

  return jsonb_build_object('success', true, 'estimate_id', p_estimate_id, 'project_id', v_project_id);
end;
$$;

revoke execute on function public.request_estimate_changes(uuid, text, text) from public, anon, authenticated;
grant execute on function public.request_estimate_changes(uuid, text, text) to anon;
