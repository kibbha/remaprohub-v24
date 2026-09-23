-- ReMaPro POS advanced KDS: priorities, stage timestamps, recall and production metrics.
alter table public.pos_orders
  add column if not exists production_priority smallint not null default 0;

do $$
begin
  if not exists(select 1 from pg_constraint where conname='pos_orders_production_priority_check') then
    alter table public.pos_orders add constraint pos_orders_production_priority_check
      check (production_priority between 0 and 2);
  end if;
end $$;

alter table public.pos_order_items
  add column if not exists production_sent_at timestamptz,
  add column if not exists production_started_at timestamptz,
  add column if not exists production_ready_at timestamptz,
  add column if not exists production_served_at timestamptz;

update public.pos_order_items
set production_sent_at=coalesce(production_sent_at,created_at)
where kitchen_status in ('sent','preparing','ready','served') and production_sent_at is null;

update public.pos_order_items
set production_started_at=coalesce(production_started_at,updated_at,production_sent_at,created_at)
where kitchen_status in ('preparing','ready','served') and production_started_at is null;

update public.pos_order_items
set production_ready_at=coalesce(production_ready_at,updated_at,production_started_at,production_sent_at,created_at)
where kitchen_status in ('ready','served') and production_ready_at is null;

update public.pos_order_items
set production_served_at=coalesce(production_served_at,updated_at,production_ready_at,production_started_at,production_sent_at,created_at)
where kitchen_status='served' and production_served_at is null;

create index if not exists pos_orders_kds_priority_idx
  on public.pos_orders(restaurant_id,production_priority desc,updated_at);
create index if not exists pos_order_items_kds_metrics_idx
  on public.pos_order_items(station_snapshot,production_ready_at,production_served_at);

CREATE OR REPLACE FUNCTION public.pos_send_order_to_production(p_order_id uuid, p_actor_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order public.pos_orders%rowtype;
  v_sent integer:=0;
  v_sent_ids jsonb:='[]'::jsonb;
begin
  select * into v_order from public.pos_orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if not public.pos_actor_has_access(p_actor_user_id,v_order.organization_id,v_order.restaurant_id) then raise exception 'POS_ACCESS_DENIED'; end if;
  if v_order.status not in ('open','sent','preparing','served') then raise exception 'ORDER_NOT_SENDABLE'; end if;

  with changed as (
    update public.pos_order_items
    set kitchen_status='sent',
        production_sent_at=coalesce(production_sent_at,now()),
        updated_at=now()
    where order_id=p_order_id and kitchen_status='new' and station_snapshot<>'none'
    returning id
  )
  select count(*)::integer,coalesce(jsonb_agg(id),'[]'::jsonb)
  into v_sent,v_sent_ids from changed;

  if v_sent=0 and not exists(
    select 1 from public.pos_order_items
    where order_id=p_order_id and station_snapshot<>'none' and kitchen_status in ('sent','preparing','ready')
  ) then raise exception 'NO_PRODUCTION_ITEMS'; end if;

  update public.pos_orders
  set status=case when v_sent>0 and status in ('open','served') then 'sent' else status end,
      client_updated_at=now(),version=version+1
  where id=p_order_id returning * into v_order;

  insert into public.pos_event_log(client_event_id,organization_id,restaurant_id,device_id,actor_user_id,entity_type,entity_id,event_type,payload,occurred_at)
  values(gen_random_uuid(),v_order.organization_id,v_order.restaurant_id,v_order.device_id,p_actor_user_id,'order',v_order.id,'pos.order.sent_production',
    jsonb_build_object('sentItems',v_sent,'sentItemIds',v_sent_ids,'tableId',v_order.table_id,'tableLabel',v_order.table_label),now());

  return jsonb_build_object('ok',true,'orderId',v_order.id,'status',v_order.status,'sentItems',v_sent,'sentItemIds',v_sent_ids);
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
  if v_status not in ('sent','preparing','ready','served','cancelled') then raise exception 'INVALID_PRODUCTION_STATUS'; end if;
  select i.* into v_item from public.pos_order_items i where i.id=p_item_id for update;
  if not found then raise exception 'ITEM_NOT_FOUND'; end if;
  select * into v_order from public.pos_orders where id=v_item.order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if not public.pos_actor_has_access(p_actor_user_id,v_order.organization_id,v_order.restaurant_id) then raise exception 'POS_ACCESS_DENIED'; end if;
  if v_order.status in ('paid','refunded','cancelled') then raise exception 'ORDER_LOCKED'; end if;
  if v_item.station_snapshot='none' then raise exception 'ITEM_NOT_ROUTED'; end if;

  update public.pos_order_items
  set kitchen_status=v_status,
      production_sent_at=case when v_status='sent' then coalesce(production_sent_at,now()) else production_sent_at end,
      production_started_at=case when v_status='preparing' then coalesce(production_started_at,now()) else production_started_at end,
      production_ready_at=case when v_status='ready' then coalesce(production_ready_at,now()) else production_ready_at end,
      production_served_at=case when v_status='served' then coalesce(production_served_at,now()) else production_served_at end,
      updated_at=now()
  where id=p_item_id returning * into v_item;

  if exists(select 1 from public.pos_order_items where order_id=v_order.id and station_snapshot<>'none' and kitchen_status in ('preparing','ready')) then
    v_next_order_status:='preparing';
  elsif not exists(select 1 from public.pos_order_items where order_id=v_order.id and station_snapshot<>'none' and kitchen_status not in ('served','cancelled')) then
    v_next_order_status:='served';
  else v_next_order_status:='sent';
  end if;

  update public.pos_orders set status=v_next_order_status,client_updated_at=now(),version=version+1 where id=v_order.id returning * into v_order;

  insert into public.pos_event_log(client_event_id,organization_id,restaurant_id,device_id,actor_user_id,entity_type,entity_id,event_type,payload,occurred_at)
  values(gen_random_uuid(),v_order.organization_id,v_order.restaurant_id,v_order.device_id,p_actor_user_id,'order_item',v_item.id,'pos.production.status',
    jsonb_build_object('orderId',v_order.id,'station',v_item.station_snapshot,'status',v_item.kitchen_status,'orderStatus',v_order.status),now());

  return jsonb_build_object('ok',true,'itemId',v_item.id,'itemStatus',v_item.kitchen_status,'orderId',v_order.id,'orderStatus',v_order.status);
end;
$function$;

CREATE OR REPLACE FUNCTION public.pos_set_production_priority(p_order_id uuid,p_priority smallint,p_actor_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_order public.pos_orders%rowtype; v_priority smallint:=greatest(0,least(2,coalesce(p_priority,0)));
begin
  select * into v_order from public.pos_orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if not public.pos_actor_has_access(p_actor_user_id,v_order.organization_id,v_order.restaurant_id) then raise exception 'POS_ACCESS_DENIED'; end if;
  if v_order.status in ('paid','refunded','cancelled') then raise exception 'ORDER_LOCKED'; end if;
  if coalesce(v_order.production_priority,0)=v_priority then
    return jsonb_build_object('ok',true,'idempotent',true,'orderId',v_order.id,'priority',v_priority);
  end if;
  update public.pos_orders set production_priority=v_priority,client_updated_at=now(),version=version+1 where id=p_order_id returning * into v_order;
  insert into public.pos_event_log(client_event_id,organization_id,restaurant_id,device_id,actor_user_id,entity_type,entity_id,event_type,payload,occurred_at)
  values(gen_random_uuid(),v_order.organization_id,v_order.restaurant_id,v_order.device_id,p_actor_user_id,'order',v_order.id,'pos.production.priority',jsonb_build_object('priority',v_priority),now());
  return jsonb_build_object('ok',true,'orderId',v_order.id,'priority',v_priority);
end;
$function$;

CREATE OR REPLACE FUNCTION public.pos_recall_production_order(p_order_id uuid,p_actor_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_order public.pos_orders%rowtype; v_recalled integer:=0;
begin
  select * into v_order from public.pos_orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if not public.pos_actor_has_access(p_actor_user_id,v_order.organization_id,v_order.restaurant_id) then raise exception 'POS_ACCESS_DENIED'; end if;
  if v_order.status in ('paid','refunded','cancelled') then raise exception 'ORDER_LOCKED'; end if;
  update public.pos_order_items set kitchen_status='ready',production_served_at=null,updated_at=now()
  where order_id=p_order_id and station_snapshot<>'none' and kitchen_status='served';
  get diagnostics v_recalled=row_count;
  if v_recalled=0 then
    if exists(select 1 from public.pos_order_items where order_id=p_order_id and station_snapshot<>'none' and kitchen_status='ready') then
      return jsonb_build_object('ok',true,'idempotent',true,'orderId',v_order.id,'recalledItems',0,'status',v_order.status);
    end if;
    raise exception 'NO_SERVED_ITEMS_TO_RECALL';
  end if;
  update public.pos_orders set status='preparing',client_updated_at=now(),version=version+1 where id=p_order_id returning * into v_order;
  insert into public.pos_event_log(client_event_id,organization_id,restaurant_id,device_id,actor_user_id,entity_type,entity_id,event_type,payload,occurred_at)
  values(gen_random_uuid(),v_order.organization_id,v_order.restaurant_id,v_order.device_id,p_actor_user_id,'order',v_order.id,'pos.production.recalled',jsonb_build_object('recalledItems',v_recalled),now());
  return jsonb_build_object('ok',true,'orderId',v_order.id,'recalledItems',v_recalled,'status',v_order.status);
end;
$function$;

CREATE OR REPLACE FUNCTION public.pos_production_metrics(p_restaurant_id uuid,p_actor_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_org uuid; v_stations jsonb; v_products jsonb;
begin
  select organization_id into v_org from public.restaurants where id=p_restaurant_id and active=true;
  if v_org is null then raise exception 'RESTAURANT_NOT_FOUND'; end if;
  if not public.pos_actor_has_access(p_actor_user_id,v_org,p_restaurant_id) then raise exception 'POS_ACCESS_DENIED'; end if;

  select coalesce(jsonb_agg(to_jsonb(s) order by s.station),'[]'::jsonb) into v_stations from (
    select i.station_snapshot as station,count(*)::integer as samples,
      round(avg(extract(epoch from (i.production_ready_at-i.production_sent_at))/60)::numeric,1) as avg_ready_minutes,
      round(avg(extract(epoch from (i.production_served_at-i.production_sent_at))/60)::numeric,1) as avg_served_minutes
    from public.pos_order_items i join public.pos_orders o on o.id=i.order_id
    where o.restaurant_id=p_restaurant_id and i.station_snapshot<>'none'
      and i.production_sent_at>=now()-interval '7 days' and i.production_ready_at is not null
    group by i.station_snapshot
  ) s;

  select coalesce(jsonb_agg(to_jsonb(p) order by p.avg_ready_minutes desc nulls last),'[]'::jsonb) into v_products from (
    select i.name_snapshot as product,i.station_snapshot as station,count(*)::integer as samples,
      round(avg(extract(epoch from (i.production_ready_at-i.production_sent_at))/60)::numeric,1) as avg_ready_minutes
    from public.pos_order_items i join public.pos_orders o on o.id=i.order_id
    where o.restaurant_id=p_restaurant_id and i.station_snapshot<>'none'
      and i.production_sent_at>=now()-interval '7 days' and i.production_ready_at is not null
    group by i.name_snapshot,i.station_snapshot
    order by count(*) desc
    limit 20
  ) p;
  return jsonb_build_object('windowDays',7,'stations',v_stations,'products',v_products);
end;
$function$;

revoke all on function public.pos_send_order_to_production(uuid,uuid) from public,anon,authenticated;
revoke all on function public.pos_update_production_item(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.pos_set_production_priority(uuid,smallint,uuid) from public,anon,authenticated;
revoke all on function public.pos_recall_production_order(uuid,uuid) from public,anon,authenticated;
revoke all on function public.pos_production_metrics(uuid,uuid) from public,anon,authenticated;
grant execute on function public.pos_send_order_to_production(uuid,uuid) to service_role;
grant execute on function public.pos_update_production_item(uuid,text,uuid) to service_role;
grant execute on function public.pos_set_production_priority(uuid,smallint,uuid) to service_role;
grant execute on function public.pos_recall_production_order(uuid,uuid) to service_role;
grant execute on function public.pos_production_metrics(uuid,uuid) to service_role;
