-- ReMaPro pre-launch audit: a financially completed POS sale must never be
-- rolled back because theoretical/manual stock changed concurrently.
-- Availability remains a preventive UI guard. On the server, completed sales
-- are recorded first and any shortage is preserved as inventory data.

alter table public.pos_item_availability
  add column if not exists oversold_quantity numeric(12,3) not null default 0
  check (oversold_quantity >= 0);

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
  v_shortage numeric(12,3):=0;
begin
  select * into v_item from public.pos_order_items where id=p_order_item_id for update;
  if not found or v_item.availability_consumed_at is not null then return false; end if;

  select * into v_order from public.pos_orders where id=v_item.order_id;
  if not found or v_order.status<>'paid' or v_item.kitchen_status='cancelled' then return false; end if;

  select nullif(left(trim(value->>'availabilityKey'),200),'')
    into v_key
  from jsonb_array_elements(coalesce(v_item.modifiers,'[]'::jsonb)) value
  where value->>'kind'='remapro_availability'
    and (value->>'availabilityKey' like 'layout:%' or value->>'availabilityKey' like 'catalog:%')
  limit 1;

  select document into v_document
  from public.pos_layout_versions
  where restaurant_id=v_order.restaurant_id
  order by version desc limit 1;

  if v_item.catalog_item_id is not null then
    select * into v_catalog from public.pos_catalog_items where id=v_item.catalog_item_id;
  end if;

  if v_document is not null and v_key like 'layout:%' then
    select b into v_button
    from jsonb_array_elements(coalesce(v_document->'buttons','[]'::jsonb)) b
    where b->>'id'=substring(v_key from 8)
    limit 1;
  elsif v_document is not null and v_item.catalog_item_id is not null then
    select b into v_button
    from jsonb_array_elements(coalesce(v_document->'buttons','[]'::jsonb)) b
    where nullif(trim(coalesce(b->>'productId','')),'')=v_item.catalog_item_id::text
    limit 1;
  end if;

  if v_button is null and v_document is not null then
    select b into v_button
    from jsonb_array_elements(coalesce(v_document->'buttons','[]'::jsonb)) b
    where lower(trim(coalesce(b->'item'->>'name',b->>'label','')))=lower(trim(v_item.name_snapshot))
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

  if v_key is null then
    v_key:=case
      when v_button is not null and nullif(trim(coalesce(v_button->>'productId','')),'') is null
        then 'layout:'||coalesce(v_button->>'id',v_item.id::text)
      when v_item.catalog_item_id is not null then 'catalog:'||v_item.catalog_item_id::text
      else 'layout:'||coalesce(v_button->>'id',v_item.id::text)
    end;
  end if;

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

  v_shortage:=greatest(0,v_item.quantity-coalesce(v_remaining,0));
  update public.pos_item_availability
  set remaining_quantity=greatest(0,remaining_quantity-v_item.quantity),
      oversold_quantity=oversold_quantity+v_shortage,
      version=version+1,updated_at=now()
  where restaurant_id=v_order.restaurant_id and availability_key=v_key;

  update public.pos_order_items set availability_consumed_at=now() where id=v_item.id;
  return true;
end;
$$;

revoke all on function private.pos_consume_order_item_availability(uuid) from public,anon,authenticated;

create or replace function private.pos_apply_inventory_movement_to_workspace()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_workspace public.restaurant_workspaces%rowtype;
  v_stock_id text:=nullif(trim(coalesce(new.hub_stock_id,'')),'');
  v_moves jsonb;
  v_move jsonb;
  v_next_revision bigint;
  v_stock_exists boolean:=false;
  v_base numeric:=0;
  v_received numeric:=0;
  v_waste numeric:=0;
  v_moved numeric:=0;
  v_available numeric:=0;
  v_shortage numeric:=0;
begin
  if v_stock_id is null or new.quantity_delta=0 then return new; end if;

  select * into v_workspace
  from public.restaurant_workspaces
  where restaurant_id=new.restaurant_id
  for update;

  if not found then return new; end if;

  select exists(
    select 1
    from jsonb_array_elements(coalesce(v_workspace.data->'stock','[]'::jsonb)) as item
    where item->>'id'=v_stock_id
  ) into v_stock_exists;
  if not v_stock_exists then return new; end if;

  v_moves:=coalesce(v_workspace.data->'stockMoves','[]'::jsonb);
  if exists(
    select 1 from jsonb_array_elements(v_moves) as item
    where item->>'posMovementId'=new.id::text
  ) then
    update public.pos_inventory_movements
      set acknowledged_at=coalesce(acknowledged_at,now())
      where id=new.id;
    return new;
  end if;

  select coalesce((item->>'qty')::numeric,0)
    into v_base
  from jsonb_array_elements(coalesce(v_workspace.data->'stock','[]'::jsonb)) item
  where item->>'id'=v_stock_id
  limit 1;

  select coalesce(sum(coalesce((row->>'qty')::numeric,0)),0)
    into v_received
  from jsonb_array_elements(coalesce(v_workspace.data->'deliveries','[]'::jsonb)) row
  where row->>'stockId'=v_stock_id and row->>'status'='accepted';

  select coalesce(sum(coalesce((row->>'qty')::numeric,0)),0)
    into v_waste
  from jsonb_array_elements(coalesce(v_workspace.data->'waste','[]'::jsonb)) row
  where row->>'stockId'=v_stock_id;

  select coalesce(sum(coalesce((row->>'delta')::numeric,0)),0)
    into v_moved
  from jsonb_array_elements(v_moves) row
  where row->>'stockId'=v_stock_id and coalesce((row->>'affectsStock')::boolean,false)=true;

  v_available:=coalesce(v_base,0)+coalesce(v_received,0)-coalesce(v_waste,0)+coalesce(v_moved,0);
  if new.quantity_delta<0 then
    v_shortage:=greatest(0,-(v_available+new.quantity_delta));
  end if;

  v_move:=jsonb_build_object(
    'stockId',v_stock_id,
    'product',new.stock_name,
    'type',case when new.quantity_delta<0 then 'exit' else 'entry' end,
    'quantity',abs(new.quantity_delta),
    'delta',new.quantity_delta,
    'reason',case when new.kind='manual_reversal' then 'Annulation POS ' else 'Vente POS ' end||coalesce(new.receipt_number,''),
    'affectsStock',true,
    'at',new.created_at,
    'posMovementId',new.id,
    'posOrderId',new.order_id,
    'posReceiptNumber',coalesce(new.receipt_number,''),
    'source','remapro-pos',
    'shortage',v_shortage
  );
  v_moves:=jsonb_build_array(v_move)||v_moves;
  if jsonb_array_length(v_moves)>5000 then
    select coalesce(jsonb_agg(value order by ordinality),'[]'::jsonb)
      into v_moves
    from jsonb_array_elements(v_moves) with ordinality
    where ordinality<=5000;
  end if;

  v_next_revision:=coalesce(v_workspace.revision,0)+1;
  update public.restaurant_workspaces
  set data=jsonb_set(coalesce(data,'{}'::jsonb),'{stockMoves}',v_moves,true),
      revision=v_next_revision,
      key_revisions=jsonb_set(coalesce(key_revisions,'{}'::jsonb),'{stockMoves}',to_jsonb(v_next_revision),true),
      updated_at=now()
  where restaurant_id=new.restaurant_id and revision=v_workspace.revision;

  if not found then raise exception 'POS_STOCK_WORKSPACE_CONFLICT'; end if;

  update public.pos_inventory_movements
    set acknowledged_at=coalesce(acknowledged_at,now())
    where id=new.id;
  return new;
end;
$$;

revoke all on function private.pos_apply_inventory_movement_to_workspace() from public,anon,authenticated;

comment on function private.pos_apply_inventory_movement_to_workspace() is
'Records every financially completed POS sale in the Hub stock ledger. Stock shortage is metadata and never rolls back the sale.';
