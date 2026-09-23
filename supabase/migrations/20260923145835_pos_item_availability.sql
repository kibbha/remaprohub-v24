-- ReMaPro POS — per-item availability counters and atomic manual-quantity consumption.
create table if not exists public.pos_item_availability (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  availability_key text not null,
  mode text not null default 'manual' check (mode in ('manual')),
  configured_quantity numeric(12,3) not null default 0 check (configured_quantity >= 0),
  remaining_quantity numeric(12,3) not null default 0 check (remaining_quantity >= 0),
  low_threshold numeric(12,3) not null default 3 check (low_threshold >= 0),
  version bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (restaurant_id,availability_key)
);
create index if not exists pos_item_availability_restaurant_updated_idx
  on public.pos_item_availability(restaurant_id,updated_at desc);

alter table public.pos_item_availability enable row level security;
revoke all on public.pos_item_availability from anon;
revoke insert,update,delete on public.pos_item_availability from authenticated;
grant select on public.pos_item_availability to authenticated;
drop policy if exists pos_item_availability_select on public.pos_item_availability;
create policy pos_item_availability_select on public.pos_item_availability
for select to authenticated using (public.is_restaurant_member(restaurant_id));

alter table public.pos_order_items
  add column if not exists availability_consumed_at timestamptz;

create or replace function private.pos_consume_order_item_availability(p_order_item_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_item public.pos_order_items%rowtype;
  v_order public.pos_orders%rowtype;
  v_catalog public.pos_catalog_items%rowtype;
  v_document jsonb;
  v_button jsonb;
  v_cfg jsonb;
  v_mode text;
  v_key text;
  v_initial numeric(12,3);
  v_low numeric(12,3);
  v_remaining numeric(12,3);
begin
  select * into v_item from public.pos_order_items where id=p_order_item_id for update;
  if not found or v_item.availability_consumed_at is not null then return false; end if;

  select * into v_order from public.pos_orders where id=v_item.order_id;
  if not found or v_order.status<>'paid' or v_item.kitchen_status='cancelled' then return false; end if;

  select document into v_document
  from public.pos_layout_versions
  where restaurant_id=v_order.restaurant_id
  order by version desc limit 1;

  if v_item.catalog_item_id is not null then
    select * into v_catalog from public.pos_catalog_items where id=v_item.catalog_item_id;
    if v_document is not null then
      select b into v_button
      from jsonb_array_elements(coalesce(v_document->'buttons','[]'::jsonb)) b
      where nullif(trim(coalesce(b->>'productId','')),'')=v_item.catalog_item_id::text
      limit 1;
      if v_button is null then
        select b into v_button
        from jsonb_array_elements(coalesce(v_document->'buttons','[]'::jsonb)) b
        where nullif(trim(coalesce(b->>'productId','')),'') is null
          and lower(trim(coalesce(b->'item'->>'name',b->>'label','')))=lower(trim(v_item.name_snapshot))
        limit 1;
      end if;
    end if;
  elsif v_document is not null then
    select b into v_button
    from jsonb_array_elements(coalesce(v_document->'buttons','[]'::jsonb)) b
    where nullif(trim(coalesce(b->>'productId','')),'') is null
      and lower(trim(coalesce(b->'item'->>'name',b->>'label','')))=lower(trim(v_item.name_snapshot))
    limit 1;
  end if;

  v_cfg:=case
    when v_button is not null and coalesce(v_button->'availability'->>'mode','')='manual' then v_button->'availability'
    when v_catalog.id is not null and coalesce(v_catalog.metadata->'availability'->>'mode','')='manual' then v_catalog.metadata->'availability'
    else null
  end;
  v_mode:=coalesce(v_cfg->>'mode','unlimited');

  if v_mode<>'manual' then
    update public.pos_order_items set availability_consumed_at=now() where id=v_item.id;
    return false;
  end if;

  v_key:=case
    when v_button is not null and nullif(trim(coalesce(v_button->>'productId','')),'') is null
      then 'layout:'||coalesce(v_button->>'id',v_item.id::text)
    when v_item.catalog_item_id is not null then 'catalog:'||v_item.catalog_item_id::text
    else 'layout:'||coalesce(v_button->>'id',v_item.id::text)
  end;
  v_initial:=greatest(0,coalesce(nullif(v_cfg->>'manualQuantity','')::numeric,0));
  v_low:=greatest(0,coalesce(nullif(v_cfg->>'lowThreshold','')::numeric,3));

  insert into public.pos_item_availability(
    restaurant_id,organization_id,availability_key,mode,configured_quantity,remaining_quantity,low_threshold
  ) values(
    v_order.restaurant_id,v_order.organization_id,v_key,'manual',v_initial,v_initial,v_low
  )
  on conflict(restaurant_id,availability_key) do nothing;

  select remaining_quantity into v_remaining
  from public.pos_item_availability
  where restaurant_id=v_order.restaurant_id and availability_key=v_key
  for update;

  if coalesce(v_remaining,0)+0.0005 < v_item.quantity then
    raise exception 'POS_ITEM_AVAILABILITY_EXCEEDED:%',v_key;
  end if;

  update public.pos_item_availability
  set remaining_quantity=greatest(0,remaining_quantity-v_item.quantity),
      version=version+1,updated_at=now()
  where restaurant_id=v_order.restaurant_id and availability_key=v_key;

  update public.pos_order_items set availability_consumed_at=now() where id=v_item.id;
  return true;
end;
$$;

create or replace function private.pos_order_item_availability_insert_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare v_status text;
begin
  select status into v_status from public.pos_orders where id=new.order_id;
  if v_status='paid' then
    perform private.pos_consume_order_item_availability(new.id);
    perform public.pos_record_order_consumption(new.order_id);
  end if;
  return new;
end;
$$;

create or replace function private.pos_order_paid_availability_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare v_item record;
begin
  if new.status='paid' and (tg_op='INSERT' or old.status is distinct from 'paid') then
    for v_item in select id from public.pos_order_items where order_id=new.id and kitchen_status<>'cancelled'
    loop
      perform private.pos_consume_order_item_availability(v_item.id);
    end loop;
  end if;
  return new;
end;
$$;

revoke all on function private.pos_consume_order_item_availability(uuid) from public,anon,authenticated;
revoke all on function private.pos_order_item_availability_insert_trigger() from public,anon,authenticated;
revoke all on function private.pos_order_paid_availability_trigger() from public,anon,authenticated;

drop trigger if exists a_pos_order_paid_availability on public.pos_orders;
create trigger a_pos_order_paid_availability
after insert or update of status on public.pos_orders
for each row execute function private.pos_order_paid_availability_trigger();

drop trigger if exists pos_order_item_paid_availability on public.pos_order_items;
create trigger pos_order_item_paid_availability
after insert on public.pos_order_items
for each row execute function private.pos_order_item_availability_insert_trigger();

comment on table public.pos_item_availability is
'Atomic remaining quantities for POS items configured in manual availability mode.';
comment on column public.pos_order_items.availability_consumed_at is
'Idempotency marker for manual availability consumption.';
