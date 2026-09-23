-- ReMaPro POS — dynamic multi-table grouping for one open order.
create table if not exists public.pos_order_table_links (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null references public.pos_orders(id) on delete cascade,
  table_id uuid not null references public.pos_tables(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(order_id,table_id),
  unique(restaurant_id,table_id)
);
create index if not exists pos_order_table_links_restaurant_order_idx on public.pos_order_table_links(restaurant_id,order_id);

alter table public.pos_order_table_links enable row level security;
revoke all on public.pos_order_table_links from anon,authenticated;
grant all on public.pos_order_table_links to service_role;

create or replace function public.pos_cleanup_order_table_links() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if tg_op='DELETE' then
    delete from public.pos_order_table_links where order_id=old.id;
    return old;
  end if;
  if old.status is distinct from new.status and new.status not in ('open','sent','preparing','served','payment_pending') then
    delete from public.pos_order_table_links where order_id=new.id;
  end if;
  return new;
end;$$;
revoke all on function public.pos_cleanup_order_table_links() from public,anon,authenticated;
grant execute on function public.pos_cleanup_order_table_links() to service_role;

drop trigger if exists pos_orders_cleanup_table_links on public.pos_orders;
create trigger pos_orders_cleanup_table_links
after update of status or delete on public.pos_orders
for each row execute function public.pos_cleanup_order_table_links();
