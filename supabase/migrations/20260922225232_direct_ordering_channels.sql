create table if not exists public.direct_order_channels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,62}$'),
  token_hash text not null unique check (length(token_hash)=64),
  active boolean not null default true,
  modes text[] not null default array['dine_in','takeaway']::text[],
  public_config jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.direct_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  channel_id uuid not null references public.direct_order_channels(id) on delete restrict,
  public_reference text not null unique,
  idempotency_key uuid not null,
  service_type text not null check (service_type in ('dine_in','takeaway')),
  status text not null default 'pending' check (status in ('pending','accepted','imported','rejected','cancelled','preparing','ready','completed')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','pending','paid','failed','refunded')),
  payment_method text not null default 'counter' check (payment_method in ('counter','card','twint','online')),
  customer_name text,
  customer_phone text,
  customer_email text,
  marketing_consent boolean not null default false,
  table_label text,
  requested_for timestamptz,
  note text,
  subtotal numeric(12,2) not null default 0 check (subtotal>=0),
  tax_total numeric(12,2) not null default 0 check (tax_total>=0),
  total numeric(12,2) not null default 0 check (total>=0),
  currency text not null default 'CHF',
  client_hash text,
  accepted_by uuid references auth.users(id) on delete set null,
  pos_order_id uuid references public.pos_orders(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(channel_id,idempotency_key)
);

create table if not exists public.direct_order_items (
  id uuid primary key default gen_random_uuid(),
  direct_order_id uuid not null references public.direct_orders(id) on delete cascade,
  catalog_item_id uuid references public.pos_catalog_items(id) on delete restrict,
  name_snapshot text not null,
  quantity numeric(10,3) not null check (quantity>0 and quantity<=50),
  unit_price numeric(12,2) not null check (unit_price>=0),
  tax_rate numeric(6,3) not null default 8.1 check (tax_rate>=0 and tax_rate<=100),
  tax_amount numeric(12,2) not null default 0 check (tax_amount>=0),
  line_total numeric(12,2) not null check (line_total>=0),
  station_snapshot text not null default 'kitchen',
  note text,
  modifiers jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.direct_order_events (
  id bigint generated always as identity primary key,
  direct_order_id uuid not null references public.direct_orders(id) on delete cascade,
  event_type text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists direct_orders_restaurant_status_idx on public.direct_orders(restaurant_id,status,created_at desc);
create index if not exists direct_orders_channel_created_idx on public.direct_orders(channel_id,created_at desc);
create index if not exists direct_orders_client_rate_idx on public.direct_orders(channel_id,client_hash,created_at desc);
create index if not exists direct_order_items_order_idx on public.direct_order_items(direct_order_id);
create index if not exists direct_order_events_order_idx on public.direct_order_events(direct_order_id,created_at desc);

alter table public.direct_order_channels enable row level security;
alter table public.direct_orders enable row level security;
alter table public.direct_order_items enable row level security;
alter table public.direct_order_events enable row level security;

revoke all on public.direct_order_channels,public.direct_orders,public.direct_order_items,public.direct_order_events from anon, authenticated;
grant all on public.direct_order_channels,public.direct_orders,public.direct_order_items,public.direct_order_events to service_role;
grant usage,select on sequence public.direct_order_events_id_seq to service_role;
