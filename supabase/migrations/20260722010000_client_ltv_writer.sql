-- Applied live in SQL Editor 2026-07-22. Matches prod. Migration ledger is dead. Never run via CLI.

-- The legacy accepted-estimate writer recalculate_client_lifetime_value() and any
-- triggers bound to it were dropped via a lookup-by-function-name DO block (drop
-- every trigger whose function is recalculate_client_lifetime_value, then drop the
-- function). It is replaced below by a cash-collected recompute.
do $$
declare
  r record;
begin
  for r in
    select tg.tgname, c.relname
    from pg_trigger tg
    join pg_proc p on p.oid = tg.tgfoid
    join pg_class c on c.oid = tg.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and p.proname = 'recalculate_client_lifetime_value'
      and not tg.tgisinternal
  loop
    execute format('drop trigger if exists %I on public.%I', r.tgname, r.relname);
  end loop;
  drop function if exists public.recalculate_client_lifetime_value(uuid);
  drop function if exists public.recalculate_client_lifetime_value();
end $$;

-- Pinned update_client_last_contact (identical body plus search_path pin).
create or replace function public.update_client_last_contact()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
as $$
begin
  update public.clients
  set last_contact_at = new.created_at,
      updated_at = now()
  where id = new.client_id
    and (last_contact_at is null or last_contact_at < new.created_at);
  return new;
end;
$$;

-- Cash-collected lifetime value: sum of cash actually collected across the
-- client's non-void invoices. Per invoice, use the invoice_payments ledger sum
-- when payment rows exist, else coalesce(paid_amount, 0) for status partial or
-- paid. Client resolved as coalesce(invoices.client_id, projects.client_id).
create or replace function public.recompute_client_lifetime_value(p_client_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path to 'public'
as $$
begin
  update public.clients c
  set lifetime_value = coalesce((
        select sum(
          case
            when exists (select 1 from public.invoice_payments ip where ip.invoice_id = i.id)
              then (select coalesce(sum(ip.amount), 0) from public.invoice_payments ip where ip.invoice_id = i.id)
            when i.status in ('partial', 'paid')
              then coalesce(i.paid_amount, 0)
            else 0
          end)
        from public.invoices i
        left join public.projects pr on pr.id = i.project_id
        where coalesce(i.client_id, pr.client_id) = p_client_id
          and i.status <> 'void'
      ), 0),
      updated_at = now()
  where c.id = p_client_id;
end;
$$;

-- Trigger wrapper: fired from the invoice_payments ledger.
create or replace function public.ltv_trigger_from_invoice_payments()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare
  v_invoice_id uuid := coalesce(new.invoice_id, old.invoice_id);
  v_client_id uuid;
begin
  select coalesce(i.client_id, pr.client_id)
    into v_client_id
  from public.invoices i
  left join public.projects pr on pr.id = i.project_id
  where i.id = v_invoice_id;

  if v_client_id is not null then
    perform public.recompute_client_lifetime_value(v_client_id);
  end if;
  return coalesce(new, old);
end;
$$;

-- Trigger wrapper: fired from the invoices aggregate path. Recomputes both the
-- old and new client when the linkage changes.
create or replace function public.ltv_trigger_from_invoices()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare
  v_new_client uuid;
  v_old_client uuid;
begin
  if (tg_op <> 'DELETE') then
    select coalesce(new.client_id, pr.client_id) into v_new_client
    from public.projects pr where pr.id = new.project_id;
    if v_new_client is null then v_new_client := new.client_id; end if;
  end if;

  if (tg_op <> 'INSERT') then
    select coalesce(old.client_id, pr.client_id) into v_old_client
    from public.projects pr where pr.id = old.project_id;
    if v_old_client is null then v_old_client := old.client_id; end if;
  end if;

  if v_new_client is not null then
    perform public.recompute_client_lifetime_value(v_new_client);
  end if;
  if v_old_client is not null and v_old_client is distinct from v_new_client then
    perform public.recompute_client_lifetime_value(v_old_client);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_ltv_invoice_payments on public.invoice_payments;
create trigger trg_ltv_invoice_payments
  after insert or update or delete on public.invoice_payments
  for each row execute function public.ltv_trigger_from_invoice_payments();

drop trigger if exists trg_ltv_invoices on public.invoices;
create trigger trg_ltv_invoices
  after update of status, paid_amount, voided_at, client_id, project_id or delete on public.invoices
  for each row execute function public.ltv_trigger_from_invoices();

revoke execute on function public.update_client_last_contact() from public, anon, authenticated;
revoke execute on function public.recompute_client_lifetime_value(uuid) from public, anon, authenticated;
revoke execute on function public.ltv_trigger_from_invoice_payments() from public, anon, authenticated;
revoke execute on function public.ltv_trigger_from_invoices() from public, anon, authenticated;

-- The all-clients lifetime_value backfill (recompute over every client) ran the same date.
