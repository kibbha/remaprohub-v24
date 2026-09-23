-- Prevent online POS sales from consuming more Hub stock than is currently available.
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
  if new.quantity_delta<0 and v_available+new.quantity_delta < -0.0005 then
    raise exception 'POS_STOCK_INSUFFICIENT:%',v_stock_id;
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
    'source','remapro-pos'
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
