-- Reconcile: invoices, invoice_line_items, invoice_payments, material_orders,
-- material_order_items, stores. Created live in SQL Editor; this matches prod.
-- Idempotent: no-op on current prod, full build on a fresh database.

-- stores (platform catalog, no company_id) --
create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  logo_url text,
  website_url text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  integration_type text not null default 'manual_export'
    check (integration_type in ('affiliate_deeplink','manual_export','placeholder','api')),
  affiliate_enabled boolean not null default false,
  affiliate_url text,
  affiliate_disclosure text
);
alter table public.stores enable row level security;
drop policy if exists stores_select on public.stores;
create policy stores_select on public.stores for select
  using ((is_active = true) or is_super_admin());
drop policy if exists stores_super_admin_all on public.stores;
create policy stores_super_admin_all on public.stores for all
  using (is_super_admin()) with check (is_super_admin());

-- invoices --
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  estimate_id uuid references public.estimates(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  invoice_number text not null,
  status text not null default 'draft'
    check (status in ('draft','sent','viewed','paid','void')),
  title text,
  notes text,
  terms text,
  subtotal numeric not null default 0,
  adjustment_amount numeric not null default 0,
  adjustment_label text,
  total numeric not null default 0,
  due_date date,
  sent_at timestamptz,
  viewed_at timestamptz,
  paid_at timestamptz,
  paid_amount numeric,
  payment_method text
    check ((payment_method is null) or (payment_method in ('cash','check','card','bank_transfer','other'))),
  payment_notes text,
  voided_at timestamptz,
  void_reason text,
  portal_token text unique,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  stripe_invoice_id text
);
alter table public.invoices enable row level security;
drop policy if exists "Company members can view their invoices" on public.invoices;
create policy "Company members can view their invoices" on public.invoices for select
  using ((company_id in (select company_id from public.user_profiles where user_id = auth.uid())) or is_super_admin());
drop policy if exists "Company members can insert their invoices" on public.invoices;
create policy "Company members can insert their invoices" on public.invoices for insert
  with check ((company_id in (select company_id from public.user_profiles where user_id = auth.uid())) or is_super_admin());
drop policy if exists "Company members can update their invoices" on public.invoices;
create policy "Company members can update their invoices" on public.invoices for update
  using ((company_id in (select company_id from public.user_profiles where user_id = auth.uid())) or is_super_admin());
drop policy if exists "Company members can delete their invoices" on public.invoices;
create policy "Company members can delete their invoices" on public.invoices for delete
  using ((company_id in (select company_id from public.user_profiles where user_id = auth.uid())) or is_super_admin());

-- invoice_line_items --
create table if not exists public.invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null,
  category_name text,
  item_type text
    check ((item_type is null) or (item_type in ('labor','material','supply','equipment','subcontractor','other'))),
  unit text default 'each',
  quantity numeric not null default 1,
  unit_rate numeric not null default 0,
  total numeric not null default 0,
  source_estimate_line_item_id uuid references public.estimate_line_items(id) on delete set null,
  sort_order integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.invoice_line_items enable row level security;
drop policy if exists "Company members can view their invoice line items" on public.invoice_line_items;
create policy "Company members can view their invoice line items" on public.invoice_line_items for select
  using ((invoice_id in (select id from public.invoices where company_id in (select company_id from public.user_profiles where user_id = auth.uid()))) or is_super_admin());
drop policy if exists "Company members can insert their invoice line items" on public.invoice_line_items;
create policy "Company members can insert their invoice line items" on public.invoice_line_items for insert
  with check ((invoice_id in (select id from public.invoices where company_id in (select company_id from public.user_profiles where user_id = auth.uid()))) or is_super_admin());
drop policy if exists "Company members can update their invoice line items" on public.invoice_line_items;
create policy "Company members can update their invoice line items" on public.invoice_line_items for update
  using ((invoice_id in (select id from public.invoices where company_id in (select company_id from public.user_profiles where user_id = auth.uid()))) or is_super_admin());
drop policy if exists "Company members can delete their invoice line items" on public.invoice_line_items;
create policy "Company members can delete their invoice line items" on public.invoice_line_items for delete
  using ((invoice_id in (select id from public.invoices where company_id in (select company_id from public.user_profiles where user_id = auth.uid()))) or is_super_admin());

-- invoice_payments --
create table if not exists public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  amount numeric not null,
  payment_method text,
  payment_date date not null default current_date,
  reference_number text,
  notes text,
  stripe_payment_intent_id text,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.invoice_payments enable row level security;
drop policy if exists invoice_payments_select on public.invoice_payments;
create policy invoice_payments_select on public.invoice_payments for select
  using ((company_id in (select company_id from public.user_profiles where user_id = auth.uid())) or ((auth.jwt() ->> 'email') = 'main@ngautomationhub.com'));
drop policy if exists invoice_payments_insert on public.invoice_payments;
create policy invoice_payments_insert on public.invoice_payments for insert
  with check ((company_id in (select company_id from public.user_profiles where user_id = auth.uid() and role = 'contractor_admin')) or ((auth.jwt() ->> 'email') = 'main@ngautomationhub.com'));
drop policy if exists invoice_payments_update on public.invoice_payments;
create policy invoice_payments_update on public.invoice_payments for update
  using ((company_id in (select company_id from public.user_profiles where user_id = auth.uid() and role = 'contractor_admin')) or ((auth.jwt() ->> 'email') = 'main@ngautomationhub.com'));
drop policy if exists invoice_payments_delete on public.invoice_payments;
create policy invoice_payments_delete on public.invoice_payments for delete
  using ((company_id in (select company_id from public.user_profiles where user_id = auth.uid() and role = 'contractor_admin')) or ((auth.jwt() ->> 'email') = 'main@ngautomationhub.com'));

-- material_orders --
create table if not exists public.material_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  store_id uuid references public.stores(id) on delete set null,
  title text,
  status text not null default 'draft'
    check (status in ('draft','ordered','received')),
  notes text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  selected_variant text
    check ((selected_variant is null) or (selected_variant in ('good','better','best'))),
  estimate_id uuid references public.estimates(id) on delete set null
);
alter table public.material_orders enable row level security;
drop policy if exists material_orders_select on public.material_orders;
create policy material_orders_select on public.material_orders for select
  using ((company_id in (select company_id from public.user_profiles where user_id = auth.uid())) or is_super_admin());
drop policy if exists material_orders_insert on public.material_orders;
create policy material_orders_insert on public.material_orders for insert
  with check ((company_id in (select company_id from public.user_profiles where user_id = auth.uid())) or is_super_admin());
drop policy if exists material_orders_update on public.material_orders;
create policy material_orders_update on public.material_orders for update
  using ((company_id in (select company_id from public.user_profiles where user_id = auth.uid())) or is_super_admin());
drop policy if exists material_orders_delete on public.material_orders;
create policy material_orders_delete on public.material_orders for delete
  using ((company_id in (select company_id from public.user_profiles where user_id = auth.uid())) or is_super_admin());

-- material_order_items --
create table if not exists public.material_order_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  material_order_id uuid not null references public.material_orders(id) on delete cascade,
  description text not null,
  unit text,
  quantity numeric not null default 1,
  overage_pct numeric not null default 0,
  source_zone_name text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  product_good text,
  product_better text,
  product_best text,
  cost_good numeric,
  cost_better numeric,
  cost_best numeric,
  ai_suggested boolean not null default false
);
alter table public.material_order_items enable row level security;
drop policy if exists material_order_items_select on public.material_order_items;
create policy material_order_items_select on public.material_order_items for select
  using ((company_id in (select company_id from public.user_profiles where user_id = auth.uid())) or is_super_admin());
drop policy if exists material_order_items_insert on public.material_order_items;
create policy material_order_items_insert on public.material_order_items for insert
  with check ((company_id in (select company_id from public.user_profiles where user_id = auth.uid())) or is_super_admin());
drop policy if exists material_order_items_update on public.material_order_items;
create policy material_order_items_update on public.material_order_items for update
  using ((company_id in (select company_id from public.user_profiles where user_id = auth.uid())) or is_super_admin());
drop policy if exists material_order_items_delete on public.material_order_items;
create policy material_order_items_delete on public.material_order_items for delete
  using ((company_id in (select company_id from public.user_profiles where user_id = auth.uid())) or is_super_admin());
