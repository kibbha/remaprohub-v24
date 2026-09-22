-- ReMaPro POS v0.7: append-only production deltas after a first kitchen/bar send.
CREATE OR REPLACE FUNCTION public.pos_append_order_items(p_order_id uuid, p_client_event_id uuid, p_lines jsonb, p_actor_user_id uuid, p_occurred_at timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order public.pos_orders%rowtype;
  v_line jsonb;
  v_line_id uuid;
  v_catalog_id uuid;
  v_recipe_id uuid;
  v_name text;
  v_sku text;
  v_qty numeric(12,3);
  v_unit_price numeric(14,2);
  v_tax_rate numeric(6,3);
  v_line_total numeric(14,2);
  v_tax_amount numeric(14,2);
  v_added integer:=0;
  v_subtotal numeric(14,2):=0;
  v_tax_total numeric(14,2):=0;
begin
  select * into v_order from public.pos_orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  if not public.pos_actor_has_access(p_actor_user_id,v_order.organization_id,v_order.restaurant_id) then
    raise exception 'POS_ACCESS_DENIED';
  end if;
  if v_order.status not in ('open','sent','preparing','served') then raise exception 'ORDER_LOCKED'; end if;
  if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then raise exception 'ORDER_LINES_REQUIRED'; end if;

  if exists(select 1 from public.pos_event_log where client_event_id=p_client_event_id) then
    return jsonb_build_object('ok',true,'idempotent',true,'orderId',v_order.id,'status',v_order.status,'total',v_order.total);
  end if;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    begin v_line_id:=(v_line->>'id')::uuid; exception when others then v_line_id:=gen_random_uuid(); end;
    begin v_catalog_id:=nullif(v_line->>'catalog_item_id','')::uuid; exception when others then v_catalog_id:=null; end;
    begin v_recipe_id:=nullif(v_line->>'recipe_id','')::uuid; exception when others then v_recipe_id:=null; end;

    v_name:=left(trim(coalesce(v_line->>'name','')),240);
    v_sku:=left(trim(coalesce(v_line->>'sku','')),120);
    v_qty:=coalesce((v_line->>'quantity')::numeric,0);
    v_unit_price:=coalesce((v_line->>'unit_price')::numeric,0);
    v_tax_rate:=coalesce((v_line->>'tax_rate')::numeric,8.1);

    if v_name='' or v_qty<=0 or v_unit_price<0 or v_tax_rate<0 or v_tax_rate>100 then
      raise exception 'INVALID_ORDER_LINE';
    end if;

    v_line_total:=round(v_qty*v_unit_price,2);
    v_tax_amount:=case when v_tax_rate=0 then 0 else round(v_line_total-(v_line_total/(1+(v_tax_rate/100))),2) end;

    insert into public.pos_order_items(
      id,order_id,catalog_item_id,recipe_id,name_snapshot,sku_snapshot,quantity,unit_price,
      discount_total,tax_rate,tax_amount,line_total,course,kitchen_status,note
    ) values(
      v_line_id,p_order_id,v_catalog_id,v_recipe_id,v_name,nullif(v_sku,''),v_qty,v_unit_price,
      0,v_tax_rate,v_tax_amount,v_line_total,
      nullif(left(trim(coalesce(v_line->>'course','')),40),''),
      'new',nullif(left(trim(coalesce(v_line->>'note','')),500),'')
    );
    v_added:=v_added+1;
  end loop;

  select coalesce(sum(line_total),0),coalesce(sum(tax_amount),0)
  into v_subtotal,v_tax_total
  from public.pos_order_items
  where order_id=p_order_id and kitchen_status<>'cancelled';

  update public.pos_orders
  set subtotal=round(v_subtotal,2),tax_total=round(v_tax_total,2),total=round(v_subtotal,2),
      client_updated_at=coalesce(p_occurred_at,now()),version=version+1
  where id=p_order_id
  returning * into v_order;

  insert into public.pos_event_log(
    client_event_id,organization_id,restaurant_id,device_id,actor_user_id,
    entity_type,entity_id,event_type,payload,occurred_at
  ) values(
    p_client_event_id,v_order.organization_id,v_order.restaurant_id,v_order.device_id,p_actor_user_id,
    'order',v_order.id,'pos.order.items_appended',
    jsonb_build_object('addedItems',v_added,'total',v_order.total,'tableId',v_order.table_id,'tableLabel',v_order.table_label),
    coalesce(p_occurred_at,now())
  );

  return jsonb_build_object('ok',true,'idempotent',false,'orderId',v_order.id,'status',v_order.status,'addedItems',v_added,'total',v_order.total,'taxTotal',v_order.tax_total);
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
  if v_order.status not in ('open','sent','preparing','served') then raise exception 'ORDER_NOT_SENDABLE'; end if;

  update public.pos_order_items
  set kitchen_status='sent',updated_at=now()
  where order_id=p_order_id and kitchen_status='new' and station_snapshot<>'none';
  get diagnostics v_sent=row_count;

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
    jsonb_build_object('sentItems',v_sent,'tableId',v_order.table_id,'tableLabel',v_order.table_label),
    now()
  );

  return jsonb_build_object('ok',true,'orderId',v_order.id,'status',v_order.status,'sentItems',v_sent);
end;
$function$;


revoke all on function public.pos_append_order_items(uuid,uuid,jsonb,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.pos_send_order_to_production(uuid,uuid) from public,anon,authenticated;
grant execute on function public.pos_append_order_items(uuid,uuid,jsonb,uuid,timestamptz) to service_role;
grant execute on function public.pos_send_order_to_production(uuid,uuid) to service_role;
