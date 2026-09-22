-- ReMaPro POS v0.6: production routing and kitchen/bar workflow.
alter table public.pos_catalog_items add column if not exists production_station text not null default 'kitchen';
alter table public.pos_order_items add column if not exists station_snapshot text not null default 'kitchen';
do $$
begin
  if not exists(select 1 from pg_constraint where conname='pos_catalog_items_station_check') then
    alter table public.pos_catalog_items add constraint pos_catalog_items_station_check check (production_station in ('kitchen','bar','none'));
  end if;
  if not exists(select 1 from pg_constraint where conname='pos_order_items_station_check') then
    alter table public.pos_order_items add constraint pos_order_items_station_check check (station_snapshot in ('kitchen','bar','none'));
  end if;
end $$;
create index if not exists pos_order_items_station_status_idx on public.pos_order_items(station_snapshot,kitchen_status,order_id);

CREATE OR REPLACE FUNCTION public.pos_order_item_station_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_station text;
begin
  if new.catalog_item_id is not null then
    select production_station into v_station
    from public.pos_catalog_items
    where id=new.catalog_item_id;
    if v_station is not null then new.station_snapshot:=v_station; end if;
  end if;
  if new.station_snapshot not in ('kitchen','bar','none') then new.station_snapshot:='kitchen'; end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.pos_send_order_to_production(p_order_id uuid, p_actor_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order public.pos_orders%rowtype;
  v_sent integer:=0;
begin
  select * into v_order from public.pos_orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  if not public.pos_actor_has_access(p_actor_user_id,v_order.organization_id,v_order.restaurant_id) then
    raise exception 'POS_ACCESS_DENIED';
  end if;
  if v_order.status not in ('open','sent','preparing') then raise exception 'ORDER_NOT_SENDABLE'; end if;

  update public.pos_order_items
  set kitchen_status='sent',updated_at=now()
  where order_id=p_order_id and kitchen_status='new' and station_snapshot<>'none';
  get diagnostics v_sent=row_count;

  if v_sent=0 and not exists(
    select 1 from public.pos_order_items
    where order_id=p_order_id and station_snapshot<>'none' and kitchen_status in ('sent','preparing','ready')
  ) then raise exception 'NO_PRODUCTION_ITEMS'; end if;

  update public.pos_orders
  set status=case when status='open' then 'sent' else status end,
      client_updated_at=now(),version=version+1
  where id=p_order_id
  returning * into v_order;

  insert into public.pos_event_log(
    client_event_id,organization_id,restaurant_id,device_id,actor_user_id,
    entity_type,entity_id,event_type,payload,occurred_at
  ) values(
    gen_random_uuid(),v_order.organization_id,v_order.restaurant_id,v_order.device_id,p_actor_user_id,
    'order',v_order.id,'pos.order.sent_production',
    jsonb_build_object('sentItems',v_sent,'tableId',v_order.table_id,'tableLabel',v_order.table_label),
    now()
  );

  return jsonb_build_object('ok',true,'orderId',v_order.id,'status',v_order.status,'sentItems',v_sent);
end;
$function$;

CREATE OR REPLACE FUNCTION public.pos_update_production_item(p_item_id uuid, p_status text, p_actor_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_item public.pos_order_items%rowtype;
  v_order public.pos_orders%rowtype;
  v_status text:=lower(trim(coalesce(p_status,'')));
  v_next_order_status text;
begin
  if v_status not in ('sent','preparing','ready','served','cancelled') then
    raise exception 'INVALID_PRODUCTION_STATUS';
  end if;

  select i.* into v_item
  from public.pos_order_items i
  where i.id=p_item_id
  for update;
  if not found then raise exception 'ITEM_NOT_FOUND'; end if;

  select * into v_order from public.pos_orders where id=v_item.order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  if not public.pos_actor_has_access(p_actor_user_id,v_order.organization_id,v_order.restaurant_id) then
    raise exception 'POS_ACCESS_DENIED';
  end if;
  if v_order.status in ('paid','refunded','cancelled') then raise exception 'ORDER_LOCKED'; end if;
  if v_item.station_snapshot='none' then raise exception 'ITEM_NOT_ROUTED'; end if;

  update public.pos_order_items
  set kitchen_status=v_status,updated_at=now()
  where id=p_item_id
  returning * into v_item;

  if exists(
    select 1 from public.pos_order_items
    where order_id=v_order.id and station_snapshot<>'none' and kitchen_status='preparing'
  ) or exists(
    select 1 from public.pos_order_items
    where order_id=v_order.id and station_snapshot<>'none' and kitchen_status='ready'
  ) then
    v_next_order_status:='preparing';
  elsif not exists(
    select 1 from public.pos_order_items
    where order_id=v_order.id and station_snapshot<>'none' and kitchen_status not in ('served','cancelled')
  ) then
    v_next_order_status:='served';
  else
    v_next_order_status:='sent';
  end if;

  update public.pos_orders
  set status=v_next_order_status,client_updated_at=now(),version=version+1
  where id=v_order.id
  returning * into v_order;

  insert into public.pos_event_log(
    client_event_id,organization_id,restaurant_id,device_id,actor_user_id,
    entity_type,entity_id,event_type,payload,occurred_at
  ) values(
    gen_random_uuid(),v_order.organization_id,v_order.restaurant_id,v_order.device_id,p_actor_user_id,
    'order_item',v_item.id,'pos.production.status',
    jsonb_build_object(
      'orderId',v_order.id,'station',v_item.station_snapshot,
      'status',v_item.kitchen_status,'orderStatus',v_order.status
    ),
    now()
  );

  return jsonb_build_object(
    'ok',true,'itemId',v_item.id,'itemStatus',v_item.kitchen_status,
    'orderId',v_order.id,'orderStatus',v_order.status
  );
end;
$function$;


drop trigger if exists pos_order_item_station_snapshot_trigger on public.pos_order_items;
create trigger pos_order_item_station_snapshot_trigger
before insert on public.pos_order_items
for each row execute function public.pos_order_item_station_snapshot();
revoke all on function public.pos_order_item_station_snapshot() from public,anon,authenticated;
revoke all on function public.pos_send_order_to_production(uuid,uuid) from public,anon,authenticated;
revoke all on function public.pos_update_production_item(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.pos_order_item_station_snapshot() to service_role;
grant execute on function public.pos_send_order_to_production(uuid,uuid) to service_role;
grant execute on function public.pos_update_production_item(uuid,text,uuid) to service_role;
