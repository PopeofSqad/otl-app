-- ============================================
-- OTL Consulting — Supabase Schema
-- Run this in Supabase SQL Editor (one time)
-- ============================================

-- CLIENTS
create table public.clients (
  id text primary key,
  name text not null,
  biz text default '',
  phone text default '',
  email text default '',
  type text default 'food_truck',
  status text default 'prospect',
  notes text default '',
  created_at bigint not null,
  updated_at bigint not null
);

-- QUOTES
create table public.quotes (
  id text primary key,
  client_id text references public.clients(id) on delete cascade,
  services jsonb default '{}',
  total numeric default 0,
  notes text default '',
  status text default 'draft',
  created_at bigint not null,
  updated_at bigint not null
);

-- INSPECTIONS
create table public.inspections (
  id text primary key,
  client_id text references public.clients(id) on delete cascade,
  unit text default '',
  notes text default '',
  rating text default 'pass',
  results jsonb default '{}',
  created_at bigint not null,
  updated_at bigint not null
);

-- ACTION PLANS
create table public.action_plans (
  id text primary key,
  client_id text references public.clients(id) on delete cascade,
  inspection_id text references public.inspections(id) on delete cascade,
  inspection_type text default 'food_truck',
  items jsonb default '[]',
  status text default 'active',
  created_at bigint not null,
  updated_at bigint not null
);

-- INVOICES
create table public.invoices (
  id text primary key,
  client_id text references public.clients(id) on delete cascade,
  quote_id text references public.quotes(id) on delete set null,
  invoice_number text not null,
  amount numeric not null default 0,
  deposit numeric not null default 0,
  amount_paid numeric not null default 0,
  status text default 'draft',
  issued_date bigint,
  due_date bigint,
  paid_date bigint,
  notes text default '',
  created_at bigint not null,
  updated_at bigint not null
);

-- RLS POLICIES (allow authenticated users full access)
alter table public.clients enable row level security;
alter table public.quotes enable row level security;
alter table public.inspections enable row level security;

create policy "Authenticated users can do anything with clients"
  on public.clients for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "Authenticated users can do anything with quotes"
  on public.quotes for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "Authenticated users can do anything with inspections"
  on public.inspections for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

alter table public.action_plans enable row level security;

create policy "Authenticated users can do anything with action_plans"
  on public.action_plans for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

alter table public.invoices enable row level security;

create policy "Authenticated users can do anything with invoices"
  on public.invoices for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
