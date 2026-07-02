-- B1: allow 'partial' invoice status (code already sets it on partial payments;
-- old CHECK rejected it, silently failing deposits/split payments).
alter table public.invoices drop constraint if exists invoices_status_check;

alter table public.invoices
  add constraint invoices_status_check
  check (status in ('draft','sent','viewed','partial','paid','void'));
