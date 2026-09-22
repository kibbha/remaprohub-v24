-- ReMaPro Hub -> future ReMaPro POS foundation
-- Applied to production Supabase as migration "pos_foundation".

create table if not exists public.pos_devices (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  install_id text not null,
  label text,
  platform text not null default 'android',
  app_version text,
  active boolean not null default true,
  last_seen_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, install_id)
);

create table if not exists public.pos_catalog_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  recipe_id uuid references public.recipes(id) on delete set null,
  sku text,
  name text not null,
  category text not null default '',
  item_type text not null default 'product' check (item_type in ('product','recipe','modifier','service')),
  price numeric(14,2) not null default 0 check (price >= 0),
  tax_rate numeric(6,3) not null default 8.1 check (tax_rate >= 0 and tax_rate <= 100),
  active boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists pos_catalog_items_restaurant_sku_uq on public.pos_catalog_items(restaurant_id, sku) where sku is not null and sku <> '';

create table if not exists public.pos_cash_sessions (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  device_id uuid references public.pos_devices(id) on delete set null,
  business_date date not null,
  status text not null default 'open' check (status in ('open','closed')),
  opening_cash numeric(14,2) not null default 0 check (opening_cash >= 0),
  expected_cash numeric(14,2),
  counted_cash numeric(14,2),
  difference_cash numeric(14,2),
  opened_by uuid references auth.users(id) on delete set null,
  closed_by uuid references auth.users(id) on delete set null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'open' and closed_at is null) or (status = 'closed' and closed_at is not null))
);
create unique index if not exists pos_one_open_session_per_device on public.pos_cash_sessions(device_id) where status = 'open' and device_id is not null;

create table if not exists public.pos_orders (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  device_id uuid references public.pos_devices(id) on delete set null,
  cash_session_id uuid references public.pos_cash_sessions(id) on delete set null,
  business_date date not null,
  table_label text,
  service_type text not null default 'dine_in' check (service_type in ('dine_in','takeaway','delivery','counter')),
  status text not null default 'open' check (status in ('open','sent','preparing','served','payment_pending','paid','cancelled','refunded')),
  currency text not null default 'CHF',
  covers integer not null default 1 check (covers >= 0),
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  discount_total numeric(14,2) not null default 0 check (discount_total >= 0),
  tax_total numeric(14,2) not null default 0 check (tax_total >= 0),
  total numeric(14,2) not null default 0 check (total >= 0),
  tip_total numeric(14,2) not null default 0 check (tip_total >= 0),
  receipt_number text,
  note text,
  opened_by uuid references auth.users(id) on delete set null,
  closed_by uuid references auth.users(id) on delete set null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  client_updated_at timestamptz,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists pos_orders_receipt_number_uq on public.pos_orders(restaurant_id, receipt_number) where receipt_number is not null and receipt_number <> '';

create table if not exists public.pos_order_items (
  id uuid primary key,
  order_id uuid not null references public.pos_orders(id) on delete cascade,
  catalog_item_id uuid references public.pos_catalog_items(id) on delete set null,
  recipe_id uuid references public.recipes(id) on delete set null,
  name_snapshot text not null,
  sku_snapshot text,
  quantity numeric(12,3) not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  discount_total numeric(14,2) not null default 0 check (discount_total >= 0),
  tax_rate numeric(6,3) not null default 8.1 check (tax_rate >= 0 and tax_rate <= 100),
  tax_amount numeric(14,2) not null default 0 check (tax_amount >= 0),
  line_total numeric(14,2) not null check (line_total >= 0),
  course text,
  kitchen_status text not null default 'new' check (kitchen_status in ('new','sent','preparing','ready','served','cancelled')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pos_payments (
  id uuid primary key,
  order_id uuid not null references public.pos_orders(id) on delete restrict,
  device_id uuid references public.pos_devices(id) on delete set null,
  method text not null check (method in ('cash','card','twint','voucher','invoice','other')),
  provider text,
  provider_reference text,
  amount numeric(14,2) not null check (amount >= 0),
  tip_amount numeric(14,2) not null default 0 check (tip_amount >= 0),
  status text not null default 'pending' check (status in ('pending','authorized','captured','failed','voided','refunded')),
  paid_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.pos_payments.metadata is 'Non-sensitive provider metadata only. Never store PAN, CVV, magnetic stripe or cardholder secrets.';

create table if not exists public.pos_event_log (
  id uuid primary key default gen_random_uuid(),
  sequence bigint generated always as identity unique,
  client_event_id uuid not null unique,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  device_id uuid references public.pos_devices(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now()
);

create index if not exists pos_devices_restaurant_idx on public.pos_devices(restaurant_id);
create index if not exists pos_catalog_items_restaurant_active_idx on public.pos_catalog_items(restaurant_id, active, sort_order);
create index if not exists pos_catalog_items_recipe_idx on public.pos_catalog_items(recipe_id);
create index if not exists pos_cash_sessions_restaurant_date_idx on public.pos_cash_sessions(restaurant_id, business_date desc);
create index if not exists pos_cash_sessions_device_idx on public.pos_cash_sessions(device_id);
create index if not exists pos_orders_restaurant_date_idx on public.pos_orders(restaurant_id, business_date desc, updated_at desc);
create index if not exists pos_orders_device_idx on public.pos_orders(device_id);
create index if not exists pos_orders_cash_session_idx on public.pos_orders(cash_session_id);
create index if not exists pos_orders_opened_by_idx on public.pos_orders(opened_by);
create index if not exists pos_order_items_order_idx on public.pos_order_items(order_id);
create index if not exists pos_order_items_catalog_idx on public.pos_order_items(catalog_item_id);
create index if not exists pos_order_items_recipe_idx on public.pos_order_items(recipe_id);
create index if not exists pos_payments_order_idx on public.pos_payments(order_id);
create index if not exists pos_payments_device_idx on public.pos_payments(device_id);
create index if not exists pos_payments_created_by_idx on public.pos_payments(created_by);
create index if not exists pos_event_log_restaurant_sequence_idx on public.pos_event_log(restaurant_id, sequence);
create index if not exists pos_event_log_device_idx on public.pos_event_log(device_id);
create index if not exists pos_event_log_actor_idx on public.pos_event_log(actor_user_id);

drop trigger if exists pos_devices_updated_at on public.pos_devices;
create trigger pos_devices_updated_at before update on public.pos_devices for each row execute function public.set_updated_at();
drop trigger if exists pos_catalog_items_updated_at on public.pos_catalog_items;
create trigger pos_catalog_items_updated_at before update on public.pos_catalog_items for each row execute function public.set_updated_at();
drop trigger if exists pos_cash_sessions_updated_at on public.pos_cash_sessions;
create trigger pos_cash_sessions_updated_at before update on public.pos_cash_sessions for each row execute function public.set_updated_at();
drop trigger if exists pos_orders_updated_at on public.pos_orders;
create trigger pos_orders_updated_at before update on public.pos_orders for each row execute function public.set_updated_at();
drop trigger if exists pos_order_items_updated_at on public.pos_order_items;
create trigger pos_order_items_updated_at before update on public.pos_order_items for each row execute function public.set_updated_at();
drop trigger if exists pos_payments_updated_at on public.pos_payments;
create trigger pos_payments_updated_at before update on public.pos_payments for each row execute function public.set_updated_at();

alter table public.pos_devices enable row level security;
alter table public.pos_catalog_items enable row level security;
alter table public.pos_cash_sessions enable row level security;
alter table public.pos_orders enable row level security;
alter table public.pos_order_items enable row level security;
alter table public.pos_payments enable row level security;
alter table public.pos_event_log enable row level security;

revoke all on public.pos_devices, public.pos_catalog_items, public.pos_cash_sessions, public.pos_orders, public.pos_order_items, public.pos_payments, public.pos_event_log from anon;
grant select, insert, update on public.pos_devices to authenticated;
grant select, insert, update on public.pos_catalog_items to authenticated;
grant select, insert, update on public.pos_cash_sessions to authenticated;
grant select, insert, update on public.pos_orders to authenticated;
grant select, insert, update on public.pos_order_items to authenticated;
grant select, insert, update on public.pos_payments to authenticated;
grant select, insert on public.pos_event_log to authenticated;

create policy pos_devices_select on public.pos_devices for select to authenticated using (public.is_restaurant_member(restaurant_id));
create policy pos_devices_insert on public.pos_devices for insert to authenticated with check (public.is_restaurant_member(restaurant_id) and organization_id = (select organization_id from public.restaurants where id = restaurant_id));
create policy pos_devices_update on public.pos_devices for update to authenticated using (public.is_restaurant_member(restaurant_id)) with check (public.is_restaurant_member(restaurant_id) and organization_id = (select organization_id from public.restaurants where id = restaurant_id));

create policy pos_catalog_select on public.pos_catalog_items for select to authenticated using (public.is_restaurant_member(restaurant_id));
create policy pos_catalog_insert on public.pos_catalog_items for insert to authenticated with check (public.is_restaurant_admin(restaurant_id) and organization_id = (select organization_id from public.restaurants where id = restaurant_id));
create policy pos_catalog_update on public.pos_catalog_items for update to authenticated using (public.is_restaurant_admin(restaurant_id)) with check (public.is_restaurant_admin(restaurant_id) and organization_id = (select organization_id from public.restaurants where id = restaurant_id));

create policy pos_cash_sessions_select on public.pos_cash_sessions for select to authenticated using (public.is_restaurant_member(restaurant_id));
create policy pos_cash_sessions_insert on public.pos_cash_sessions for insert to authenticated with check (public.is_restaurant_member(restaurant_id) and organization_id = (select organization_id from public.restaurants where id = restaurant_id));
create policy pos_cash_sessions_update on public.pos_cash_sessions for update to authenticated using (public.is_restaurant_member(restaurant_id)) with check (public.is_restaurant_member(restaurant_id) and organization_id = (select organization_id from public.restaurants where id = restaurant_id));

create policy pos_orders_select on public.pos_orders for select to authenticated using (public.is_restaurant_member(restaurant_id));
create policy pos_orders_insert on public.pos_orders for insert to authenticated with check (public.is_restaurant_member(restaurant_id) and organization_id = (select organization_id from public.restaurants where id = restaurant_id));
create policy pos_orders_update on public.pos_orders for update to authenticated using (public.is_restaurant_member(restaurant_id)) with check (public.is_restaurant_member(restaurant_id) and organization_id = (select organization_id from public.restaurants where id = restaurant_id));

create policy pos_order_items_select on public.pos_order_items for select to authenticated using (exists (select 1 from public.pos_orders o where o.id = order_id and public.is_restaurant_member(o.restaurant_id)));
create policy pos_order_items_insert on public.pos_order_items for insert to authenticated with check (exists (select 1 from public.pos_orders o where o.id = order_id and public.is_restaurant_member(o.restaurant_id)));
create policy pos_order_items_update on public.pos_order_items for update to authenticated using (exists (select 1 from public.pos_orders o where o.id = order_id and public.is_restaurant_member(o.restaurant_id))) with check (exists (select 1 from public.pos_orders o where o.id = order_id and public.is_restaurant_member(o.restaurant_id)));

create policy pos_payments_select on public.pos_payments for select to authenticated using (exists (select 1 from public.pos_orders o where o.id = order_id and public.is_restaurant_member(o.restaurant_id)));
create policy pos_payments_insert on public.pos_payments for insert to authenticated with check (exists (select 1 from public.pos_orders o where o.id = order_id and public.is_restaurant_member(o.restaurant_id)));
create policy pos_payments_update on public.pos_payments for update to authenticated using (exists (select 1 from public.pos_orders o where o.id = order_id and public.is_restaurant_member(o.restaurant_id))) with check (exists (select 1 from public.pos_orders o where o.id = order_id and public.is_restaurant_member(o.restaurant_id)));

create policy pos_event_log_select on public.pos_event_log for select to authenticated using (public.is_restaurant_member(restaurant_id));
create policy pos_event_log_insert on public.pos_event_log for insert to authenticated with check (public.is_restaurant_member(restaurant_id) and organization_id = (select organization_id from public.restaurants where id = restaurant_id));

create or replace view public.pos_daily_sales_summary with (security_invoker = true) as
select organization_id, restaurant_id, business_date,
  count(*) filter (where status = 'paid')::integer as paid_orders,
  coalesce(sum(covers) filter (where status = 'paid'), 0)::integer as covers,
  coalesce(sum(subtotal) filter (where status = 'paid'), 0)::numeric(14,2) as subtotal,
  coalesce(sum(discount_total) filter (where status = 'paid'), 0)::numeric(14,2) as discounts,
  coalesce(sum(tax_total) filter (where status = 'paid'), 0)::numeric(14,2) as tax_total,
  coalesce(sum(total) filter (where status = 'paid'), 0)::numeric(14,2) as gross_sales,
  coalesce(sum(tip_total) filter (where status = 'paid'), 0)::numeric(14,2) as tips
from public.pos_orders
group by organization_id, restaurant_id, business_date;
grant select on public.pos_daily_sales_summary to authenticated;
