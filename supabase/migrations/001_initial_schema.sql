
-- ReMaPro Hub — Phase 1 / Supabase foundation
-- Bundle: com.remaprohub.app
-- Purpose: multi-tenant foundation for network -> restaurants -> users/roles
-- Modules: advice, HACCP temperatures, recipes/cost, sales, HR/payroll, documents
--
-- IMPORTANT:
-- 1) Run this in Supabase SQL Editor.
-- 2) Never put a service_role/secret key in the mobile app.
-- 3) This migration intentionally uses database membership tables as the
--    authorization source instead of trusting user-editable metadata.

create extension if not exists pgcrypto;

-- ---------- ENUMS ----------
do $$ begin
  create type public.membership_role as enum (
    'network_admin',
    'network_manager',
    'restaurant_admin',
    'director',
    'manager',
    'floor',
    'kitchen',
    'hr',
    'finance',
    'employee',
    'readonly'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.subscription_status as enum (
    'trialing','active','past_due','paused','canceled','incomplete','expired'
  );
exception when duplicate_object then null; end $$;

-- ---------- CORE TENANCY ----------
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  country_code text not null default 'CH',
  default_currency text not null default 'CHF',
  timezone text not null default 'Europe/Zurich',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.restaurants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  legal_name text,
  address text,
  postal_code text,
  city text,
  canton text,
  country_code text not null default 'CH',
  currency text not null default 'CHF',
  timezone text not null default 'Europe/Zurich',
  restaurant_type text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  phone text,
  locale text not null default 'fr-CH',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  role public.membership_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, organization_id, restaurant_id, role)
);

-- ---------- SUBSCRIPTIONS ----------
create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  monthly_price_cents integer not null default 999,
  currency text not null default 'CHF',
  trial_days integer not null default 7,
  active boolean not null default true,
  features jsonb not null default '{}'::jsonb
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plan_id uuid references public.subscription_plans(id),
  stripe_customer_id text,
  stripe_subscription_id text unique,
  status public.subscription_status not null default 'trialing',
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  stripe_event_id text unique,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------- MODULE: ADVICE / PROCEDURES ----------
create table if not exists public.advice_sheets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  title text not null,
  category text,
  content text not null default '',
  version integer not null default 1,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- MODULE: HACCP TEMPERATURES ----------
create table if not exists public.temperature_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  recorded_at timestamptz not null default now(),
  area text,
  equipment text,
  product text,
  temperature_c numeric(5,2) not null,
  target_min_c numeric(5,2),
  target_max_c numeric(5,2),
  compliant boolean,
  corrective_action text,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- MODULE: RECIPES / COST ----------
create table if not exists public.ingredients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  unit text not null default 'unit',
  purchase_price numeric(12,4) not null default 0,
  supplier_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  name text not null,
  selling_price numeric(12,2),
  target_food_cost_pct numeric(5,2) default 35,
  notes text,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  quantity numeric(12,4) not null,
  unit_cost numeric(12,4) not null default 0,
  created_at timestamptz not null default now(),
  unique(recipe_id, ingredient_id)
);

-- ---------- MODULE: SALES ----------
create table if not exists public.sales_daily (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  business_date date not null,
  gross_sales numeric(14,2) not null default 0,
  net_sales numeric(14,2) not null default 0,
  covers integer,
  service_count integer,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(restaurant_id, business_date)
);

-- ---------- MODULE: HR / PAYROLL ----------
create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  restaurant_id uuid references public.restaurants(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  employee_number text,
  first_name text not null,
  last_name text not null,
  function_title text,
  employment_type text,
  start_date date,
  end_date date,
  base_salary numeric(14,2),
  salary_unit text default 'month',
  work_rate_pct numeric(6,2),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payroll_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  restaurant_id uuid references public.restaurants(id) on delete set null,
  employee_id uuid not null references public.employees(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  gross_salary numeric(14,2) not null default 0,
  avs_ai_apg numeric(14,2) not null default 0,
  ac numeric(14,2) not null default 0,
  aanp numeric(14,2) not null default 0,
  lpp numeric(14,2) not null default 0,
  source_tax numeric(14,2) not null default 0,
  other_deductions numeric(14,2) not null default 0,
  net_salary numeric(14,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(employee_id, period_start, period_end)
);

-- ---------- MODULE: DOCUMENTS ----------
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  title text not null,
  document_type text not null,
  storage_path text,
  version integer not null default 1,
  status text not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- LOCAL DATA MIGRATION ----------
create table if not exists public.migration_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  source text not null default 'localStorage',
  source_version text,
  device_id text,
  imported_by uuid references auth.users(id) on delete set null,
  payload_hash text,
  imported_rows integer not null default 0,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- ---------- INDEXES ----------
create index if not exists idx_restaurants_org on public.restaurants(organization_id);
create index if not exists idx_memberships_user on public.memberships(user_id);
create index if not exists idx_memberships_org on public.memberships(organization_id);
create index if not exists idx_memberships_restaurant on public.memberships(restaurant_id);
create index if not exists idx_temp_restaurant_date on public.temperature_logs(restaurant_id, recorded_at desc);
create index if not exists idx_recipe_org on public.recipes(organization_id);
create index if not exists idx_ingredient_org on public.ingredients(organization_id);
create index if not exists idx_sales_restaurant_date on public.sales_daily(restaurant_id, business_date desc);
create index if not exists idx_employee_restaurant on public.employees(restaurant_id);
create index if not exists idx_payroll_employee_period on public.payroll_records(employee_id, period_start desc);
create index if not exists idx_documents_restaurant on public.documents(restaurant_id, updated_at desc);

-- ---------- AUTH PROFILE TRIGGER ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, first_name, last_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- ---------- AUTHORIZATION HELPERS ----------
create or replace function public.is_org_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = p_org
      and m.user_id = auth.uid()
      and m.active = true
  );
$$;

create or replace function public.is_restaurant_member(p_restaurant uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    where m.restaurant_id = p_restaurant
      and m.user_id = auth.uid()
      and m.active = true
  );
$$;

create or replace function public.is_org_admin(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    where m.organization_id = p_org
      and m.user_id = auth.uid()
      and m.active = true
      and m.role in ('network_admin','network_manager')
  );
$$;

create or replace function public.is_restaurant_admin(p_restaurant uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    where m.restaurant_id = p_restaurant
      and m.user_id = auth.uid()
      and m.active = true
      and m.role in ('restaurant_admin','director','manager')
  );
$$;

-- ---------- RLS ----------
alter table public.organizations enable row level security;
alter table public.restaurants enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_events enable row level security;
alter table public.advice_sheets enable row level security;
alter table public.temperature_logs enable row level security;
alter table public.ingredients enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.sales_daily enable row level security;
alter table public.employees enable row level security;
alter table public.payroll_records enable row level security;
alter table public.documents enable row level security;
alter table public.migration_batches enable row level security;

-- Drop/recreate policies so the migration is repeatable.
do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'organizations','restaurants','profiles','memberships',
        'subscription_plans','subscriptions','subscription_events',
        'advice_sheets','temperature_logs','ingredients','recipes',
        'recipe_ingredients','sales_daily','employees','payroll_records',
        'documents','migration_batches'
      )
  loop
    execute format('drop policy if exists %I on %I.%I',
                   r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- Organizations
create policy org_select on public.organizations
for select to authenticated using (public.is_org_member(id));

create policy org_update on public.organizations
for update to authenticated using (public.is_org_admin(id))
with check (public.is_org_admin(id));

-- Restaurants
create policy restaurant_select on public.restaurants
for select to authenticated using (public.is_org_member(organization_id));

create policy restaurant_insert on public.restaurants
for insert to authenticated with check (public.is_org_admin(organization_id));

create policy restaurant_update on public.restaurants
for update to authenticated using (public.is_org_admin(organization_id))
with check (public.is_org_admin(organization_id));

-- Profiles
create policy profile_select on public.profiles
for select to authenticated using (id = auth.uid());

create policy profile_update on public.profiles
for update to authenticated using (id = auth.uid())
with check (id = auth.uid());

-- Memberships
create policy membership_select on public.memberships
for select to authenticated
using (user_id = auth.uid() or public.is_org_admin(organization_id));

create policy membership_insert on public.memberships
for insert to authenticated
with check (public.is_org_admin(organization_id));

create policy membership_update on public.memberships
for update to authenticated
using (public.is_org_admin(organization_id))
with check (public.is_org_admin(organization_id));

create policy membership_delete on public.memberships
for delete to authenticated
using (public.is_org_admin(organization_id));

-- Plans are public to authenticated users; changes are backend/admin only.
create policy plan_select on public.subscription_plans
for select to authenticated using (active = true);

-- Subscriptions: users can read their organization's subscription.
create policy subscription_select on public.subscriptions
for select to authenticated using (public.is_org_member(organization_id));

-- Module policies
create policy advice_select on public.advice_sheets
for select to authenticated using (public.is_org_member(organization_id));
create policy advice_insert on public.advice_sheets
for insert to authenticated with check (public.is_org_member(organization_id));
create policy advice_update on public.advice_sheets
for update to authenticated using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

create policy temp_select on public.temperature_logs
for select to authenticated using (public.is_restaurant_member(restaurant_id));
create policy temp_insert on public.temperature_logs
for insert to authenticated with check (public.is_restaurant_member(restaurant_id));
create policy temp_update on public.temperature_logs
for update to authenticated using (public.is_restaurant_member(restaurant_id))
with check (public.is_restaurant_member(restaurant_id));

create policy ingredient_select on public.ingredients
for select to authenticated using (public.is_org_member(organization_id));
create policy ingredient_insert on public.ingredients
for insert to authenticated with check (public.is_org_member(organization_id));
create policy ingredient_update on public.ingredients
for update to authenticated using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

create policy recipe_select on public.recipes
for select to authenticated using (public.is_org_member(organization_id));
create policy recipe_insert on public.recipes
for insert to authenticated with check (public.is_org_member(organization_id));
create policy recipe_update on public.recipes
for update to authenticated using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

create policy recipe_ing_select on public.recipe_ingredients
for select to authenticated using (
  exists (
    select 1 from public.recipes r
    where r.id = recipe_id and public.is_org_member(r.organization_id)
  )
);
create policy recipe_ing_insert on public.recipe_ingredients
for insert to authenticated with check (
  exists (
    select 1 from public.recipes r
    where r.id = recipe_id and public.is_org_member(r.organization_id)
  )
);
create policy recipe_ing_update on public.recipe_ingredients
for update to authenticated using (
  exists (
    select 1 from public.recipes r
    where r.id = recipe_id and public.is_org_member(r.organization_id)
  )
) with check (
  exists (
    select 1 from public.recipes r
    where r.id = recipe_id and public.is_org_member(r.organization_id)
  )
);

create policy sales_select on public.sales_daily
for select to authenticated using (public.is_restaurant_member(restaurant_id));
create policy sales_insert on public.sales_daily
for insert to authenticated with check (public.is_restaurant_member(restaurant_id));
create policy sales_update on public.sales_daily
for update to authenticated using (public.is_restaurant_member(restaurant_id))
with check (public.is_restaurant_member(restaurant_id));

create policy employee_select on public.employees
for select to authenticated using (public.is_org_member(organization_id));
create policy employee_insert on public.employees
for insert to authenticated with check (public.is_org_member(organization_id));
create policy employee_update on public.employees
for update to authenticated using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

create policy payroll_select on public.payroll_records
for select to authenticated using (public.is_org_member(organization_id));
create policy payroll_insert on public.payroll_records
for insert to authenticated with check (public.is_org_member(organization_id));
create policy payroll_update on public.payroll_records
for update to authenticated using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

create policy documents_select on public.documents
for select to authenticated using (public.is_org_member(organization_id));
create policy documents_insert on public.documents
for insert to authenticated with check (public.is_org_member(organization_id));
create policy documents_update on public.documents
for update to authenticated using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

create policy migration_select on public.migration_batches
for select to authenticated using (public.is_org_member(organization_id));
create policy migration_insert on public.migration_batches
for insert to authenticated with check (public.is_org_member(organization_id));

-- ---------- DEFAULT PLAN ----------
insert into public.subscription_plans
  (code, name, monthly_price_cents, currency, trial_days, features)
values
  ('standard', 'ReMaPro Hub Standard', 999, 'CHF', 7,
   '{"modules":["advice","haccp","cost","sales","hr","documents"],"restaurants":"multi"}'::jsonb)
on conflict (code) do update
set name = excluded.name,
    monthly_price_cents = excluded.monthly_price_cents,
    currency = excluded.currency,
    trial_days = excluded.trial_days,
    features = excluded.features;

-- ---------- UPDATED_AT ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'organizations','restaurants','profiles','memberships',
    'subscriptions','advice_sheets','ingredients','recipes',
    'sales_daily','employees','payroll_records','documents'
  ]
  loop
    execute format('drop trigger if exists trg_%I_updated_at on public.%I', t, t);
    execute format(
      'create trigger trg_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      t, t
    );
  end loop;
end $$;

-- End Phase 1.
