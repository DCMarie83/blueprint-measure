alter table public.companies drop constraint if exists companies_founding_member_number_key;

update public.companies set founding_member_number = null where founding_member_number is not null;

create unique index if not exists companies_state_founding_member_number_key
  on public.companies (state, founding_member_number)
  where founding_member_number is not null;
