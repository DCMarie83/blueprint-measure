-- Resources directory: categories, resources, storage bucket, RLS, seed

create table public.resource_categories (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  icon_key text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.resource_categories(id) on delete restrict,
  name text not null,
  slug text not null unique,
  logo_url text,
  description text,
  website_url text,
  phone text,
  email text,
  service_area_text text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  service_radius_miles integer,
  is_featured boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_resources_category on public.resources(category_id) where is_active = true;
create index idx_resources_geo on public.resources(latitude, longitude) where is_active = true and latitude is not null;

alter table public.resource_categories enable row level security;
alter table public.resources enable row level security;

create policy "Authenticated users read active categories"
  on public.resource_categories for select
  to authenticated
  using (is_active = true);

create policy "Authenticated users read active resources"
  on public.resources for select
  to authenticated
  using (is_active = true);

create policy "Super admin manages categories"
  on public.resource_categories for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "Super admin manages resources"
  on public.resources for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

insert into storage.buckets (id, name, public)
values ('resource-logos', 'resource-logos', true)
on conflict (id) do nothing;

create policy "Public read resource logos"
  on storage.objects for select
  using (bucket_id = 'resource-logos');

create policy "Super admin upload resource logos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'resource-logos' and public.is_super_admin());

create policy "Super admin update resource logos"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'resource-logos' and public.is_super_admin());

create policy "Super admin delete resource logos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'resource-logos' and public.is_super_admin());

insert into public.resource_categories (key, label, icon_key, sort_order) values
  ('bookkeeping', 'Bookkeepers & Accountants', 'book-open', 1),
  ('insurance', 'Insurance & Bonding', 'shield-check', 2),
  ('suppliers', 'Suppliers', 'package', 3),
  ('marketing', 'Marketing & Websites', 'megaphone', 4),
  ('legal', 'Legal & Licensing', 'scale', 5);

insert into public.resources (category_id, name, slug, description, website_url, phone, email, service_area_text, is_featured, sort_order) values
  ((select id from public.resource_categories where key = 'bookkeeping'), 'Ledger Hound', 'ledger-hound', 'Tail-wagging trustworthy bookkeeping built for trade contractors.', 'https://ledgerhound.example.com', '(614) 555-0142', null, 'Columbus, OH metro', true, 1),
  ((select id from public.resource_categories where key = 'bookkeeping'), 'Foreman''s Books', 'foremans-books', 'Job-costing-first accounting for crews under 25.', 'https://foremansbooks.example.com', '(614) 555-0188', null, 'Columbus + 70mi', false, 2),
  ((select id from public.resource_categories where key = 'insurance'), 'Hardhat Insurance Co.', 'hardhat-insurance', 'General liability, workers'' comp, and bonding for trade pros.', 'https://hardhatins.example.com', '(614) 555-0205', null, 'Ohio statewide', true, 1),
  ((select id from public.resource_categories where key = 'insurance'), 'Bonded & Bolted', 'bonded-and-bolted', 'Fast surety bonds for licensing renewals and big jobs.', 'https://bondedandbolted.example.com', '(614) 555-0271', null, 'Columbus metro', false, 2),
  ((select id from public.resource_categories where key = 'suppliers'), 'Bristle & Brush Co.', 'bristle-and-brush', 'Local pro-grade paint and applicator supplier — contractor pricing.', 'https://bristleandbrush.example.com', '(614) 555-0319', null, 'Columbus metro', true, 1),
  ((select id from public.resource_categories where key = 'suppliers'), 'Forge Supply Co.', 'forge-supply', 'Hardware, fasteners, and jobsite consumables. Will-call ready.', 'https://forgesupply.example.com', '(614) 555-0354', null, 'Columbus + 70mi', false, 2),
  ((select id from public.resource_categories where key = 'marketing'), 'NG Automation Hub', 'ng-automation-hub', 'Websites, automation, and lead gen built for trade contractors.', 'https://ngautomationhub.com', null, 'main@ngautomationhub.com', 'Nationwide', true, 1),
  ((select id from public.resource_categories where key = 'marketing'), 'Pixelhammer Marketing', 'pixelhammer-marketing', 'Local SEO and Google Business Profile management for trades.', 'https://pixelhammer.example.com', '(614) 555-0411', null, 'Columbus metro', false, 2),
  ((select id from public.resource_categories where key = 'legal'), 'Permit Pup', 'permit-pup', 'Permitting, licensing, and code-compliance help across Ohio.', 'https://permitpup.example.com', '(614) 555-0468', null, 'Ohio statewide', true, 1),
  ((select id from public.resource_categories where key = 'legal'), 'Code & Counsel', 'code-and-counsel', 'Contract review, lien filings, and trade business law.', 'https://codeandcounsel.example.com', '(614) 555-0492', null, 'Columbus metro', false, 2);
