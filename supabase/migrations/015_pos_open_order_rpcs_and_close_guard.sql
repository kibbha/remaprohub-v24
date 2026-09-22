-- ReMaPro POS v0.4 server-only RPCs for open checks and safe cash closing.

create or replace function public.pos_save_open_order(
  p_order_id uuid,
  p_client_event_id uuid,
  p_organization_id uuid,
  p_restaurant_id uuid,
  p_device_id uuid,
  p_cash_session_id uuid,
  p_business_date date,
  p_service_type text,
  p_table_id uuid,
  p_table_label text,
  p_covers integer,
  p_currency text,
  p_lines jsonb,
  p_actor_user_id uuid,
  p_occurred_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_order public.pos_orders%rowtype;
  v_session public.pos_cash_sessions%rowtype;
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
  v_subtotal numeric(14,2):=0;
  v_tax_total numeric(14,2):=0;
  v_line_count integer:=0;
begin
  if not public.pos_actor_has_access(p_actor_user_id,p_organization_id,p_restaurant_id) then
    raise exception 'POS_ACCESS_DENIED';
  end if;
  if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then
    raise exception 'ORDER_LINES_REQUIRED';
  end if;
  if p_service_type not in ('dine_in','takeaway','delivery','counter') then raise exception 'INVALID_SERVICE_TYPE'; end if;
  if coalesce(p_covers,0)<0 then raise exception 'INVALID_COVERS'; end if;

  if exists(select 1 from public.pos_event_log where client_event_id=p_client_event_id) then
    select * into v_order from public.pos_orders where id=p_order_id;
    if not found then raise exception 'EVENT_ID_CONFLICT'; end if;
    return jsonb_build_object('ok',true,'idempotent',true,'orderId',v_order.id,'status',v_order.status,'total',v_order.total);
  end if;

  if not exists (
    select 1 from public.pos_devices d
    where d.id=p_device_id and d.organization_id=p_organization_id
      and d.restaurant_id=p_restaurant_id and d.active=true
  ) then raise exception 'POS_DEVICE_INVALID'; end if;

  select * into v_session from public.pos_cash_sessions where id=p_cash_session_id for update;
  if not found or v_session.status<>'open' or v_session.restaurant_id<>p_restaurant_id then
    raise exception 'OPEN_CASH_SESSION_REQUIRED';
  end if;

  if p_table_id is not null and not exists(
    select 1 from public.pos_tables t where t.id=p_table_id and t.restaurant_id=p_restaurant_id and t.active=true
  ) then raise exception 'POS_TABLE_INVALID'; end if;

  select * into v_order from public.pos_orders where id=p_order_id for update;
  if found and v_order.status in ('paid','refunded','cancelled') then raise exception 'ORDER_LOCKED'; end if;
  if found and v_order.restaurant_id<>p_restaurant_id then raise exception 'ORDER_ID_CONFLICT'; end if;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    begin v_catalog_id:=nullif(v_line->>'catalog_item_id','')::uuid; exception when others then v_catalog_id:=null; end;
    begin v_recipe_id:=nullif(v_line->>'recipe_id','')::uuid; exception when others then v_recipe_id:=null; end;
    v_name:=left(trim(coalesce(v_line->>'name','')),240);
    v_sku:=left(trim(coalesce(v_line->>'sku','')),120);
    v_qty:=coalesce((v_line->>'quantity')::numeric,0);
    v_unit_price:=coalesce((v_line->>'unit_price')::numeric,0);
    v_tax_rate:=coalesce((v_line->>'tax_rate')::numeric,8.1);
    if v_name='' or v_qty<=0 or v_unit_price<0 or v_tax_rate<0 or v_tax_rate>100 then raise exception 'INVALID_ORDER_LINE'; end if;
    v_line_total:=round(v_qty*v_unit_price,2);
    v_tax_amount:=case when v_tax_rate=0 then 0 else round(v_line_total-(v_line_total/(1+(v_tax_rate/100))),2) end;
    v_subtotal:=v_subtotal+v_line_total;
    v_tax_total:=v_tax_total+v_tax_amount;
    v_line_count:=v_line_count+1;
  end loop;

  if found then
    update public.pos_orders
    set device_id=p_device_id,cash_session_id=p_cash_session_id,business_date=p_business_date,
        table_id=p_table_id,table_label=nullif(left(trim(coalesce(p_table_label,'')),80),''),
        service_type=p_service_type,status='open',currency=upper(left(coalesce(nullif(trim(p_currency),''),'CHF'),3)),
        covers=coalesce(p_covers,0),subtotal=round(v_subtotal,2),discount_total=0,
        tax_total=round(v_tax_total,2),total=round(v_subtotal,2),client_updated_at=coalesce(p_occurred_at,now()),
        version=version+1
    where id=p_order_id returning * into v_order;
    delete from public.pos_order_items where order_id=p_order_id;
  else
    insert into public.pos_orders(
      id,organization_id,restaurant_id,device_id,cash_session_id,business_date,table_id,table_label,
      service_type,status,currency,covers,subtotal,discount_total,tax_total,total,tip_total,
      opened_by,opened_at,client_updated_at
    ) values (
      p_order_id,p_organization_id,p_restaurant_id,p_device_id,p_cash_session_id,p_business_date,p_table_id,
      nullif(left(trim(coalesce(p_table_label,'')),80),''),p_service_type,'open',
      upper(left(coalesce(nullif(trim(p_currency),''),'CHF'),3)),coalesce(p_covers,0),
      round(v_subtotal,2),0,round(v_tax_total,2),round(v_subtotal,2),0,
      p_actor_user_id,coalesce(p_occurred_at,now()),coalesce(p_occurred_at,now())
    ) returning * into v_order;
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
    v_line_total:=round(v_qty*v_unit_price,2);
    v_tax_amount:=case when v_tax_rate=0 then 0 else round(v_line_total-(v_line_total/(1+(v_tax_rate/100))),2) end;
    insert into public.pos_order_items(
      id,order_id,catalog_item_id,recipe_id,name_snapshot,sku_snapshot,quantity,unit_price,
      discount_total,tax_rate,tax_amount,line_total,course,kitchen_status,note
    ) values(
      v_line_id,p_order_id,v_catalog_id,v_recipe_id,v_name,nullif(v_sku,''),v_qty,v_unit_price,
      0,v_tax_rate,v_tax_amount,v_line_total,nullif(left(trim(coalesce(v_line->>'course','')),40),''),
      'new',nullif(left(trim(coalesce(v_line->>'note','')),500),'')
    );
  end loop;

  insert into public.pos_event_log(
    client_event_id,organization_id,restaurant_id,device_id,actor_user_id,
    entity_type,entity_id,event_type,payload,occurred_at
  ) values(
    p_client_event_id,p_organization_id,p_restaurant_id,p_device_id,p_actor_user_id,
    'order',p_order_id,'pos.order.saved',
    jsonb_build_object('businessDate',p_business_date,'tableId',p_table_id,'tableLabel',p_table_label,'total',round(v_subtotal,2),'lineCount',v_line_count),
    coalesce(p_occurred_at,now())
  );

  return jsonb_build_object('ok',true,'idempotent',false,'orderId',p_order_id,'status','open','total',round(v_subtotal,2),'taxTotal',round(v_tax_total,2));
end;
$$;

create or replace function public.pos_settle_open_order(
  p_order_id uuid,
  p_client_event_id uuid,
  p_device_id uuid,
  p_cash_session_id uuid,
  p_payment_method text,
  p_payment_provider text,
  p_payment_reference text,
  p_tip_amount numeric,
  p_actor_user_id uuid,
  p_occurred_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_order public.pos_orders%rowtype;
  v_session public.pos_cash_sessions%rowtype;
  v_receipt_no bigint;
  v_receipt text;
  v_payment_id uuid:=gen_random_uuid();
  v_tip numeric(14,2):=round(coalesce(p_tip_amount,0),2);
begin
  select * into v_order from public.pos_orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if not public.pos_actor_has_access(p_actor_user_id,v_order.organization_id,v_order.restaurant_id) then raise exception 'POS_ACCESS_DENIED'; end if;

  if v_order.status='paid' then
    return jsonb_build_object('ok',true,'idempotent',true,'orderId',v_order.id,'receiptNumber',v_order.receipt_number,'total',v_order.total,'status',v_order.status);
  end if;
  if v_order.status in ('refunded','cancelled') then raise exception 'ORDER_LOCKED'; end if;
  if p_payment_method not in ('cash','card','twint','voucher','invoice','other') then raise exception 'INVALID_PAYMENT_METHOD'; end if;
  if v_tip<0 then raise exception 'INVALID_TIP'; end if;
  if exists(select 1 from public.pos_event_log where client_event_id=p_client_event_id) then raise exception 'EVENT_ID_CONFLICT'; end if;

  select * into v_session from public.pos_cash_sessions where id=p_cash_session_id for update;
  if not found or v_session.status<>'open' or v_session.restaurant_id<>v_order.restaurant_id then raise exception 'OPEN_CASH_SESSION_REQUIRED'; end if;

  if not exists(select 1 from public.pos_devices d where d.id=p_device_id and d.restaurant_id=v_order.restaurant_id and d.active=true) then raise exception 'POS_DEVICE_INVALID'; end if;

  insert into public.pos_receipt_counters(restaurant_id,business_date,last_number,updated_at)
  values(v_order.restaurant_id,v_order.business_date,1,now())
  on conflict(restaurant_id,business_date)
  do update set last_number=public.pos_receipt_counters.last_number+1,updated_at=now()
  returning last_number into v_receipt_no;

  v_receipt:=to_char(v_order.business_date,'YYYYMMDD')||'-'||lpad(v_receipt_no::text,6,'0');

  insert into public.pos_payments(
    id,order_id,device_id,method,provider,provider_reference,amount,tip_amount,status,paid_at,metadata,created_by
  ) values(
    v_payment_id,p_order_id,p_device_id,p_payment_method,
    nullif(left(trim(coalesce(p_payment_provider,'')),80),''),
    nullif(left(trim(coalesce(p_payment_reference,'')),180),''),
    v_order.total,v_tip,'captured',now(),'{}'::jsonb,p_actor_user_id
  );

  update public.pos_orders
  set device_id=p_device_id,cash_session_id=p_cash_session_id,status='paid',tip_total=v_tip,
      receipt_number=v_receipt,closed_by=p_actor_user_id,closed_at=now(),client_updated_at=coalesce(p_occurred_at,now()),
      version=version+1
  where id=p_order_id returning * into v_order;

  insert into public.pos_event_log(
    client_event_id,organization_id,restaurant_id,device_id,actor_user_id,
    entity_type,entity_id,event_type,payload,occurred_at
  ) values(
    p_client_event_id,v_order.organization_id,v_order.restaurant_id,p_device_id,p_actor_user_id,
    'order',p_order_id,'pos.order.paid',
    jsonb_build_object('receiptNumber',v_receipt,'total',v_order.total,'tip',v_tip,'paymentMethod',p_payment_method,'tableId',v_order.table_id,'tableLabel',v_order.table_label),
    coalesce(p_occurred_at,now())
  );

  return jsonb_build_object('ok',true,'idempotent',false,'orderId',p_order_id,'paymentId',v_payment_id,'receiptNumber',v_receipt,'total',v_order.total,'tip',v_tip,'status','paid');
end;
$$;

create or replace function public.pos_close_cash_session(
  p_session_id uuid,
  p_counted_cash numeric,
  p_actor_user_id uuid,
  p_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_session public.pos_cash_sessions%rowtype;
  v_cash_sales numeric(14,2):=0;
  v_expected numeric(14,2):=0;
  v_counted numeric(14,2):=0;
  v_difference numeric(14,2):=0;
begin
  select * into v_session from public.pos_cash_sessions where id=p_session_id for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;

  if not public.pos_actor_has_access(p_actor_user_id,v_session.organization_id,v_session.restaurant_id) then
    raise exception 'POS_ACCESS_DENIED';
  end if;

  if v_session.status='closed' then
    return jsonb_build_object('id',v_session.id,'status',v_session.status,'expectedCash',v_session.expected_cash,'countedCash',v_session.counted_cash,'differenceCash',v_session.difference_cash,'closedAt',v_session.closed_at);
  end if;

  if exists (
    select 1 from public.pos_orders o
    where o.cash_session_id=p_session_id
      and o.status in ('open','sent','preparing','served','payment_pending')
  ) then raise exception 'OPEN_ORDERS_EXIST'; end if;

  if coalesce(p_counted_cash,0)<0 then raise exception 'INVALID_COUNTED_CASH'; end if;

  select coalesce(sum(p.amount+p.tip_amount),0)::numeric(14,2)
  into v_cash_sales
  from public.pos_payments p
  join public.pos_orders o on o.id=p.order_id
  where o.cash_session_id=p_session_id and o.status='paid' and p.status='captured' and p.method='cash';

  v_expected:=round(coalesce(v_session.opening_cash,0)+coalesce(v_cash_sales,0),2);
  v_counted:=round(coalesce(p_counted_cash,0),2);
  v_difference:=round(v_counted-v_expected,2);

  update public.pos_cash_sessions
  set status='closed',expected_cash=v_expected,counted_cash=v_counted,difference_cash=v_difference,
      closed_by=p_actor_user_id,closed_at=now(),notes=coalesce(nullif(trim(coalesce(p_notes,'')),''),notes)
  where id=p_session_id returning * into v_session;

  insert into public.pos_event_log(
    client_event_id,organization_id,restaurant_id,device_id,actor_user_id,
    entity_type,entity_id,event_type,payload,occurred_at
  ) values(
    gen_random_uuid(),v_session.organization_id,v_session.restaurant_id,v_session.device_id,p_actor_user_id,
    'cash_session',v_session.id,'pos.cash_session.closed',
    jsonb_build_object('businessDate',v_session.business_date,'openingCash',v_session.opening_cash,'cashSales',v_cash_sales,'expectedCash',v_expected,'countedCash',v_counted,'differenceCash',v_difference),
    now()
  );

  return jsonb_build_object('id',v_session.id,'status',v_session.status,'expectedCash',v_expected,'countedCash',v_counted,'differenceCash',v_difference,'closedAt',v_session.closed_at);
end;
$$;

revoke all on function public.pos_save_open_order(uuid,uuid,uuid,uuid,uuid,uuid,date,text,uuid,text,integer,text,jsonb,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.pos_settle_open_order(uuid,uuid,uuid,uuid,text,text,text,numeric,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.pos_close_cash_session(uuid,numeric,uuid,text) from public,anon,authenticated;
grant execute on function public.pos_save_open_order(uuid,uuid,uuid,uuid,uuid,uuid,date,text,uuid,text,integer,text,jsonb,uuid,timestamptz) to service_role;
grant execute on function public.pos_settle_open_order(uuid,uuid,uuid,uuid,text,text,text,numeric,uuid,timestamptz) to service_role;
grant execute on function public.pos_close_cash_session(uuid,numeric,uuid,text) to service_role;
