-- ReMaPro POS — use the client-stable availability key carried as invisible order-line metadata.
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

revoke all on function private.pos_consume_order_item_availability(uuid) from public,anon,authenticated;
