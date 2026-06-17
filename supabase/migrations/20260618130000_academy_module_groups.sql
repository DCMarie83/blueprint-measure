alter table public.academy_modules add column if not exists audience text not null default 'all' check (audience in ('all','admin'));
alter table public.academy_modules add column if not exists module_group text not null default 'core';
