alter table public.resources add column if not exists states text[] not null default '{}';
alter table public.companies add column if not exists state text;
