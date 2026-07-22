-- Applied live in SQL Editor 2026-07-22. Matches prod. Migration ledger is dead. Never run via CLI.

-- Format guard only: companies.state is null or a two-letter uppercase code.
-- Rerun-safe: add the constraint only when it isn't already present.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.companies'::regclass
      and conname = 'companies_state_check'
  ) then
    alter table public.companies
      add constraint companies_state_check
      check (state is null or state ~ '^[A-Z]{2}$');
  end if;
end $$;

-- NO data updates were applied to any company row here. Company region
-- (companies.state) is set ONLY by the owner through the Settings UI. Never
-- write company-row data updates in migrations or code — especially pilot,
-- grandfathered, or legacy accounts.
