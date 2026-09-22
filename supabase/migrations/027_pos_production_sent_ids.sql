-- ReMaPro POS v0.15.1: return exact newly-sent production item IDs for duplicate-free auto printing.
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

  if not public.pos_actor_has_access(p_actor_user_id,v_order.organization_id,v_order.restaurant_id) then
    raise exception 'POS_ACCESS_DENIED';
  end if;
  if v_order.status not in ('open','sent','preparing','served') then raise exception 'ORDER_NOT_SENDABLE'; end if;

  with changed as (
    update public.pos_order_items
    set kitchen_status='sent',updated_at=now()
    where order_id=p_order_id and kitchen_status='new' and station_snapshot<>'none'
    returning id
  )
  select count(*)::integer,coalesce(jsonb_agg(id),'[]'::jsonb)
  into v_sent,v_sent_ids
  from changed;

  if v_sent=0 and not exists(
    select 1 from public.pos_order_items
    where order_id=p_order_id and station_snapshot<>'none' and kitchen_status in ('sent','preparing','ready')
  ) then raise exception 'NO_PRODUCTION_ITEMS'; end if;

  update public.pos_orders
  set status=case
        when v_sent>0 and status in ('open','served') then 'sent'
        else status
      end,
      client_updated_at=now(),version=version+1
  where id=p_order_id
  returning * into v_order;

  insert into public.pos_event_log(
    client_event_id,organization_id,restaurant_id,device_id,actor_user_id,
    entity_type,entity_id,event_type,payload,occurred_at
  ) values(
    gen_random_uuid(),v_order.organization_id,v_order.restaurant_id,v_order.device_id,p_actor_user_id,
    'order',v_order.id,'pos.order.sent_production',
    jsonb_build_object(
      'sentItems',v_sent,'sentItemIds',v_sent_ids,
      'tableId',v_order.table_id,'tableLabel',v_order.table_label
    ),
    now()
  );

  return jsonb_build_object(
    'ok',true,'orderId',v_order.id,'status',v_order.status,
    'sentItems',v_sent,'sentItemIds',v_sent_ids
  );
end;
$function$;
revoke all on function public.pos_send_order_to_production(uuid,uuid) from public,anon,authenticated;
grant execute on function public.pos_send_order_to_production(uuid,uuid) to service_role;
