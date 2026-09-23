-- ReMaPro Hub/POS — apply POS sale stock movements to the Hub workspace immediately.
-- Quantity remains event-based: POS appends a stockMove instead of overwriting stock.qty.

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

drop trigger if exists pos_inventory_workspace_realtime on public.pos_inventory_movements;
create trigger pos_inventory_workspace_realtime
after insert on public.pos_inventory_movements
for each row execute function private.pos_apply_inventory_movement_to_workspace();

comment on function private.pos_apply_inventory_movement_to_workspace() is
'Immediately appends idempotent POS inventory events to restaurant_workspaces.stockMoves; never overwrites base stock quantities.';
