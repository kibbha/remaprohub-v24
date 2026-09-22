-- ReMaPro POS v0.4: dining tables and open restaurant checks.
create table if not exists public.pos_tables (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  label text not null,
  area text not null default 'Salle',
  seats integer not null default 2 check (seats >= 0),
  sort_order integer not null default 0,
  x numeric(8,3),
  y numeric(8,3),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id,label)
);
alter table public.pos_orders add column if not exists table_id uuid references public.pos_tables(id) on delete set null;
create index if not exists pos_tables_restaurant_idx on public.pos_tables(restaurant_id,active,sort_order);
create index if not exists pos_tables_organization_idx on public.pos_tables(organization_id);
create index if not exists pos_orders_table_idx on public.pos_orders(table_id);
drop trigger if exists pos_tables_updated_at on public.pos_tables;
create trigger pos_tables_updated_at before update on public.pos_tables for each row execute function public.set_updated_at();
alter table public.pos_tables enable row level security;
revoke all on public.pos_tables from anon;
grant select,insert,update on public.pos_tables to authenticated;
create policy pos_tables_select on public.pos_tables for select to authenticated using (public.is_restaurant_member(restaurant_id));
create policy pos_tables_insert on public.pos_tables for insert to authenticated
with check (public.is_restaurant_admin(restaurant_id) and organization_id=(select organization_id from public.restaurants where id=restaurant_id));
create policy pos_tables_update on public.pos_tables for update to authenticated
using (public.is_restaurant_admin(restaurant_id))
with check (public.is_restaurant_admin(restaurant_id) and organization_id=(select organization_id from public.restaurants where id=restaurant_id));

-- Full function bodies are deployed in production under migration pos_open_orders_and_tables.
-- Keep signatures in source control for deployment/review.
-- public.pos_save_open_order(uuid,uuid,uuid,uuid,uuid,uuid,date,text,uuid,text,integer,text,jsonb,uuid,timestamptz)
-- public.pos_settle_open_order(uuid,uuid,uuid,uuid,text,text,text,numeric,uuid,timestamptz)
