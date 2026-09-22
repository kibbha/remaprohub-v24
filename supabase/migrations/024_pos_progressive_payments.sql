-- ReMaPro POS v0.12: progressive item/person payments with guarded final settlement.
alter table public.pos_payments add column if not exists receipt_number text;

create table if not exists public.pos_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null references public.pos_orders(id) on delete restrict,
  order_item_id uuid not null references public.pos_order_items(id) on delete restrict,
  payment_id uuid not null references public.pos_payments(id) on delete restrict,
  quantity numeric(12,3) not null check (quantity > 0),
  amount numeric(14,2) not null check (amount >= 0),
  tax_amount numeric(14,2) not null default 0 check (tax_amount >= 0),
  created_at timestamptz not null default now(),
  unique(payment_id,order_item_id)
);
create index if not exists pos_payment_allocations_order_item_idx on public.pos_payment_allocations(order_item_id,order_id);
create index if not exists pos_payment_allocations_order_idx on public.pos_payment_allocations(order_id);
create index if not exists pos_payment_allocations_restaurant_idx on public.pos_payment_allocations(restaurant_id,created_at desc);
create index if not exists pos_payments_receipt_number_idx on public.pos_payments(receipt_number);
alter table public.pos_payment_allocations enable row level security;
revoke all on public.pos_payment_allocations from anon;
revoke insert,update,delete on public.pos_payment_allocations from authenticated;
grant select on public.pos_payment_allocations to authenticated;
drop policy if exists pos_payment_allocations_select on public.pos_payment_allocations;
create policy pos_payment_allocations_select on public.pos_payment_allocations
for select to authenticated
using (public.is_restaurant_member(restaurant_id));

CREATE OR REPLACE FUNCTION public.pos_cancel_open_order(p_order_id uuid, p_reason text, p_actor_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_order public.pos_orders%rowtype; v_reason text:=left(trim(coalesce(p_reason,'')),500);
begin
 if v_reason='' then raise exception 'CANCELLATION_REASON_REQUIRED'; end if;
 select * into v_order from public.pos_orders where id=p_order_id for update; if not found then raise exception 'ORDER_NOT_FOUND'; end if;
 if not public.pos_actor_has_access(p_actor_user_id,v_order.organization_id,v_order.restaurant_id) then raise exception 'POS_ACCESS_DENIED'; end if;
 if v_order.status='cancelled' then return jsonb_build_object('ok',true,'idempotent',true,'orderId',v_order.id,'status','cancelled'); end if;
 if v_order.status in ('paid','refunded') then raise exception 'PAID_ORDER_REQUIRES_REFUND'; end if;
 if v_order.status='payment_pending' or exists(select 1 from public.pos_payments where order_id=p_order_id and status='captured') then raise exception 'ORDER_HAS_PAYMENTS'; end if;
 update public.pos_orders set status='cancelled',closed_by=p_actor_user_id,closed_at=now(),client_updated_at=now(),version=version+1 where id=p_order_id returning * into v_order;
 update public.pos_order_items set kitchen_status='cancelled' where order_id=p_order_id;
 insert into public.pos_event_log(client_event_id,organization_id,restaurant_id,device_id,actor_user_id,entity_type,entity_id,event_type,payload,occurred_at)
 values(gen_random_uuid(),v_order.organization_id,v_order.restaurant_id,v_order.device_id,p_actor_user_id,'order',v_order.id,'pos.order.cancelled',
 jsonb_build_object('reason',v_reason,'total',v_order.total,'tableId',v_order.table_id,'tableLabel',v_order.table_label),now());
 return jsonb_build_object('ok',true,'idempotent',false,'orderId',v_order.id,'status','cancelled');
end $function$;

CREATE OR REPLACE FUNCTION public.pos_pay_allocated_group(p_order_id uuid, p_client_event_id uuid, p_device_id uuid, p_cash_session_id uuid, p_label text, p_method text, p_selections jsonb, p_tip_amount numeric, p_provider text, p_provider_reference text, p_actor_user_id uuid, p_occurred_at timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order public.pos_orders%rowtype;
  v_session public.pos_cash_sessions%rowtype;
  v_item public.pos_order_items%rowtype;
  v_selection jsonb;
  v_event public.pos_event_log%rowtype;
  v_payment_id uuid:=gen_random_uuid();
  v_master_receipt text;
  v_payment_receipt text;
  v_receipt_no bigint;
  v_payment_index integer;
  v_label text:=left(trim(coalesce(p_label,'')),80);
  v_method text:=lower(trim(coalesce(p_method,'')));
  v_tip numeric(14,2):=round(coalesce(p_tip_amount,0),2);
  v_qty numeric(12,3);
  v_paid_qty numeric(12,3);
  v_amount numeric(14,2):=0;
  v_tax numeric(14,2):=0;
  v_line_amount numeric(14,2);
  v_line_tax numeric(14,2);
  v_allocations jsonb:='[]'::jsonb;
  v_complete boolean:=false;
  v_remaining numeric(14,2):=0;
  v_tip_total numeric(14,2):=0;
begin
  select * into v_event from public.pos_event_log where client_event_id=p_client_event_id;
  if found and v_event.event_type='pos.payment.progressive' then
    select * into v_order from public.pos_orders where id=p_order_id;
    return jsonb_build_object(
      'ok',true,'idempotent',true,'orderId',p_order_id,'orderStatus',v_order.status,
      'masterReceiptNumber',v_order.receipt_number,
      'paymentId',v_event.entity_id,
      'paymentReceiptNumber',v_event.payload->>'paymentReceiptNumber',
      'amount',v_event.payload->'amount',
      'tip',v_event.payload->'tip',
      'remainingAmount',v_event.payload->'remainingAmount',
      'label',v_event.payload->>'label'
    );
  elsif found then
    raise exception 'EVENT_ID_CONFLICT';
  end if;

  select * into v_order from public.pos_orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if not public.pos_actor_has_access(p_actor_user_id,v_order.organization_id,v_order.restaurant_id) then raise exception 'POS_ACCESS_DENIED'; end if;
  if v_order.status not in ('open','sent','preparing','served','payment_pending') then raise exception 'ORDER_LOCKED'; end if;
  if v_method not in ('cash','card','twint','voucher','invoice','other') then raise exception 'INVALID_PAYMENT_METHOD'; end if;
  if v_tip<0 then raise exception 'INVALID_TIP'; end if;
  if v_label='' then v_label:='Part'; end if;
  if jsonb_typeof(p_selections)<>'array' or jsonb_array_length(p_selections)<1 then raise exception 'SPLIT_SELECTION_REQUIRED'; end if;

  select * into v_session from public.pos_cash_sessions where id=p_cash_session_id for update;
  if not found or v_session.status<>'open' or v_session.restaurant_id<>v_order.restaurant_id then raise exception 'OPEN_CASH_SESSION_REQUIRED'; end if;
  if not exists(select 1 from public.pos_devices d where d.id=p_device_id and d.restaurant_id=v_order.restaurant_id and d.active=true) then raise exception 'POS_DEVICE_INVALID'; end if;

  if exists(
    select 1 from public.pos_payments p
    where p.order_id=p_order_id and p.status='captured'
      and not exists(select 1 from public.pos_payment_allocations a where a.payment_id=p.id)
  ) then raise exception 'PAYMENT_MODE_CONFLICT'; end if;

  create temporary table if not exists pg_temp.pos_progress_alloc(
    item_id uuid primary key,
    quantity numeric(12,3) not null,
    amount numeric(14,2) not null,
    tax_amount numeric(14,2) not null
  ) on commit drop;
  truncate pg_temp.pos_progress_alloc;

  for v_selection in select value from jsonb_array_elements(p_selections)
  loop
    begin
      select * into v_item
      from public.pos_order_items
      where id=(v_selection->>'itemId')::uuid and order_id=p_order_id
      for update;
    exception when others then
      raise exception 'INVALID_SPLIT_ITEM';
    end;
    if not found then raise exception 'SPLIT_ITEM_NOT_FOUND'; end if;
    if v_item.kitchen_status='cancelled' then raise exception 'SPLIT_ITEM_CANCELLED'; end if;

    v_qty:=round(coalesce((v_selection->>'quantity')::numeric,0),3);
    if v_qty<=0 then raise exception 'INVALID_SPLIT_QUANTITY'; end if;

    select coalesce(sum(a.quantity),0)
    into v_paid_qty
    from public.pos_payment_allocations a
    join public.pos_payments p on p.id=a.payment_id and p.status='captured'
    where a.order_item_id=v_item.id;

    if v_paid_qty+v_qty>v_item.quantity+0.0005 then raise exception 'SPLIT_QUANTITY_EXCEEDED'; end if;

    v_line_amount:=round((v_item.line_total/v_item.quantity)*v_qty,2);
    v_line_tax:=round((v_item.tax_amount/v_item.quantity)*v_qty,2);

    insert into pg_temp.pos_progress_alloc(item_id,quantity,amount,tax_amount)
    values(v_item.id,v_qty,v_line_amount,v_line_tax)
    on conflict(item_id) do update set
      quantity=pg_temp.pos_progress_alloc.quantity+excluded.quantity,
      amount=pg_temp.pos_progress_alloc.amount+excluded.amount,
      tax_amount=pg_temp.pos_progress_alloc.tax_amount+excluded.tax_amount;

    if v_paid_qty+(select quantity from pg_temp.pos_progress_alloc where item_id=v_item.id)>v_item.quantity+0.0005 then
      raise exception 'SPLIT_QUANTITY_EXCEEDED';
    end if;
  end loop;

  select coalesce(sum(amount),0),coalesce(sum(tax_amount),0)
  into v_amount,v_tax from pg_temp.pos_progress_alloc;
  v_amount:=round(v_amount,2);v_tax:=round(v_tax,2);
  if v_amount<=0 then raise exception 'INVALID_SPLIT_AMOUNT'; end if;

  v_master_receipt:=v_order.receipt_number;
  if v_master_receipt is null then
    insert into public.pos_receipt_counters(restaurant_id,business_date,last_number,updated_at)
    values(v_order.restaurant_id,v_order.business_date,1,now())
    on conflict(restaurant_id,business_date)
    do update set last_number=public.pos_receipt_counters.last_number+1,updated_at=now()
    returning last_number into v_receipt_no;

    v_master_receipt:=to_char(v_order.business_date,'YYYYMMDD')||'-'||lpad(v_receipt_no::text,6,'0');
    update public.pos_orders set receipt_number=v_master_receipt where id=p_order_id;
  end if;

  select count(*)+1 into v_payment_index
  from public.pos_payments p
  where p.order_id=p_order_id and p.status='captured'
    and exists(select 1 from public.pos_payment_allocations a where a.payment_id=p.id);

  v_payment_receipt:=v_master_receipt||'-P'||lpad(v_payment_index::text,2,'0');

  select coalesce(jsonb_agg(jsonb_build_object(
    'itemId',a.item_id,
    'name',i.name_snapshot,
    'quantity',a.quantity,
    'amount',a.amount,
    'tax',a.tax_amount
  ) order by i.created_at),'[]'::jsonb)
  into v_allocations
  from pg_temp.pos_progress_alloc a
  join public.pos_order_items i on i.id=a.item_id;

  insert into public.pos_payments(
    id,order_id,device_id,method,provider,provider_reference,amount,tip_amount,
    status,paid_at,metadata,receipt_number,created_by
  ) values(
    v_payment_id,p_order_id,p_device_id,v_method,
    nullif(left(trim(coalesce(p_provider,'')),80),''),
    nullif(left(trim(coalesce(p_provider_reference,'')),180),''),
    v_amount,v_tip,'captured',now(),
    jsonb_build_object(
      'splitType','progressive_items',
      'splitLabel',v_label,
      'splitIndex',v_payment_index,
      'splitTax',v_tax,
      'allocations',v_allocations
    ),
    v_payment_receipt,p_actor_user_id
  );

  insert into public.pos_payment_allocations(
    organization_id,restaurant_id,order_id,order_item_id,payment_id,quantity,amount,tax_amount
  )
  select v_order.organization_id,v_order.restaurant_id,p_order_id,item_id,v_payment_id,quantity,amount,tax_amount
  from pg_temp.pos_progress_alloc;

  select not exists(
    select 1
    from public.pos_order_items i
    where i.order_id=p_order_id and i.kitchen_status<>'cancelled'
      and coalesce((
        select sum(a.quantity)
        from public.pos_payment_allocations a
        join public.pos_payments p on p.id=a.payment_id and p.status='captured'
        where a.order_item_id=i.id
      ),0)<i.quantity-0.0005
  ) into v_complete;

  select coalesce(sum(i.line_total-coalesce(x.paid_amount,0)),0)::numeric(14,2)
  into v_remaining
  from public.pos_order_items i
  left join (
    select a.order_item_id,sum(a.amount)::numeric(14,2) paid_amount
    from public.pos_payment_allocations a
    join public.pos_payments p on p.id=a.payment_id and p.status='captured'
    where a.order_id=p_order_id
    group by a.order_item_id
  ) x on x.order_item_id=i.id
  where i.order_id=p_order_id and i.kitchen_status<>'cancelled';
  v_remaining:=greatest(0,round(v_remaining,2));

  select coalesce(sum(tip_amount),0)::numeric(14,2)
  into v_tip_total
  from public.pos_payments
  where order_id=p_order_id and status='captured';

  update public.pos_orders
  set device_id=p_device_id,cash_session_id=p_cash_session_id,
      status=case when v_complete then 'paid' else 'payment_pending' end,
      tip_total=v_tip_total,
      closed_by=case when v_complete then p_actor_user_id else null end,
      closed_at=case when v_complete then now() else null end,
      client_updated_at=coalesce(p_occurred_at,now()),version=version+1
  where id=p_order_id
  returning * into v_order;

  insert into public.pos_event_log(
    client_event_id,organization_id,restaurant_id,device_id,actor_user_id,
    entity_type,entity_id,event_type,payload,occurred_at
  ) values(
    p_client_event_id,v_order.organization_id,v_order.restaurant_id,p_device_id,p_actor_user_id,
    'payment',v_payment_id,'pos.payment.progressive',
    jsonb_build_object(
      'orderId',p_order_id,'masterReceiptNumber',v_master_receipt,
      'paymentReceiptNumber',v_payment_receipt,'label',v_label,'method',v_method,
      'amount',v_amount,'tip',v_tip,'remainingAmount',v_remaining,
      'orderStatus',v_order.status,'allocations',v_allocations
    ),
    coalesce(p_occurred_at,now())
  );

  return jsonb_build_object(
    'ok',true,'idempotent',false,'orderId',p_order_id,'orderStatus',v_order.status,
    'masterReceiptNumber',v_master_receipt,'paymentId',v_payment_id,
    'paymentReceiptNumber',v_payment_receipt,'label',v_label,'method',v_method,
    'amount',v_amount,'tip',v_tip,'remainingAmount',v_remaining,'allocations',v_allocations
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.pos_settle_open_order(p_order_id uuid, p_client_event_id uuid, p_device_id uuid, p_cash_session_id uuid, p_payment_method text, p_payment_provider text, p_payment_reference text, p_tip_amount numeric, p_actor_user_id uuid, p_occurred_at timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if v_order.status='payment_pending' or exists(select 1 from public.pos_payment_allocations where order_id=p_order_id) then raise exception 'PARTIAL_PAYMENTS_EXIST'; end if;
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
    id,order_id,device_id,method,provider,provider_reference,amount,tip_amount,status,paid_at,metadata,receipt_number,created_by
  ) values(
    v_payment_id,p_order_id,p_device_id,p_payment_method,
    nullif(left(trim(coalesce(p_payment_provider,'')),80),''),
    nullif(left(trim(coalesce(p_payment_reference,'')),180),''),
    v_order.total,v_tip,'captured',now(),'{}'::jsonb,v_receipt,p_actor_user_id
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
$function$;

CREATE OR REPLACE FUNCTION public.pos_settle_open_order_allocated(p_order_id uuid, p_client_event_id uuid, p_device_id uuid, p_cash_session_id uuid, p_groups jsonb, p_actor_user_id uuid, p_occurred_at timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order public.pos_orders%rowtype;
  v_group jsonb;
  v_selection jsonb;
  v_item public.pos_order_items%rowtype;
  v_label text;
  v_method text;
  v_tip numeric(14,2);
  v_qty numeric(12,3);
  v_group_amount numeric(14,2);
  v_group_tax numeric(14,2);
  v_group_index integer:=0;
  v_payments jsonb:='[]'::jsonb;
  v_allocations jsonb:='[]'::jsonb;
  v_total_allocated numeric(14,2):=0;
  v_result jsonb;
begin
  select * into v_order from public.pos_orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  if not public.pos_actor_has_access(p_actor_user_id,v_order.organization_id,v_order.restaurant_id) then
    raise exception 'POS_ACCESS_DENIED';
  end if;
  if v_order.status in ('paid','refunded','cancelled') then raise exception 'ORDER_LOCKED'; end if;
  if v_order.status='payment_pending' or exists(select 1 from public.pos_payment_allocations where order_id=p_order_id) then raise exception 'PARTIAL_PAYMENTS_EXIST'; end if;
  if jsonb_typeof(p_groups)<>'array' or jsonb_array_length(p_groups)<1 then raise exception 'SPLIT_GROUPS_REQUIRED'; end if;

  create temporary table if not exists pg_temp.pos_split_alloc(
    item_id uuid primary key,
    allocated_qty numeric(12,3) not null default 0
  ) on commit drop;
  truncate pg_temp.pos_split_alloc;

  for v_group in select value from jsonb_array_elements(p_groups)
  loop
    v_group_index:=v_group_index+1;
    v_label:=left(trim(coalesce(v_group->>'label','')),80);
    if v_label='' then v_label:='Personne '||v_group_index::text; end if;

    v_method:=lower(trim(coalesce(v_group->>'method','')));
    if v_method not in ('cash','card','twint','voucher','invoice','other') then raise exception 'INVALID_PAYMENT_METHOD'; end if;

    v_tip:=round(coalesce((v_group->>'tipAmount')::numeric,0),2);
    if v_tip<0 then raise exception 'INVALID_TIP'; end if;
    if jsonb_typeof(v_group->'selections')<>'array' or jsonb_array_length(v_group->'selections')<1 then
      raise exception 'SPLIT_SELECTION_REQUIRED';
    end if;

    v_group_amount:=0;
    v_group_tax:=0;
    v_allocations:='[]'::jsonb;

    for v_selection in select value from jsonb_array_elements(v_group->'selections')
    loop
      begin
        select * into v_item
        from public.pos_order_items
        where id=(v_selection->>'itemId')::uuid and order_id=p_order_id
        for update;
      exception when others then
        raise exception 'INVALID_SPLIT_ITEM';
      end;

      if not found then raise exception 'SPLIT_ITEM_NOT_FOUND'; end if;
      if v_item.kitchen_status='cancelled' then raise exception 'SPLIT_ITEM_CANCELLED'; end if;

      v_qty:=round(coalesce((v_selection->>'quantity')::numeric,0),3);
      if v_qty<=0 then raise exception 'INVALID_SPLIT_QUANTITY'; end if;

      insert into pg_temp.pos_split_alloc(item_id,allocated_qty)
      values(v_item.id,v_qty)
      on conflict(item_id) do update
      set allocated_qty=pg_temp.pos_split_alloc.allocated_qty+excluded.allocated_qty;

      if (select allocated_qty from pg_temp.pos_split_alloc where item_id=v_item.id)>v_item.quantity+0.0005 then
        raise exception 'SPLIT_QUANTITY_EXCEEDED';
      end if;

      v_group_amount:=v_group_amount+round((v_item.line_total/v_item.quantity)*v_qty,2);
      v_group_tax:=v_group_tax+round((v_item.tax_amount/v_item.quantity)*v_qty,2);
      v_allocations:=v_allocations||jsonb_build_array(jsonb_build_object(
        'itemId',v_item.id,
        'name',v_item.name_snapshot,
        'quantity',v_qty,
        'amount',round((v_item.line_total/v_item.quantity)*v_qty,2),
        'tax',round((v_item.tax_amount/v_item.quantity)*v_qty,2)
      ));
    end loop;

    v_group_amount:=round(v_group_amount,2);
    v_group_tax:=round(v_group_tax,2);
    if v_group_amount<=0 then raise exception 'INVALID_SPLIT_AMOUNT'; end if;

    v_total_allocated:=v_total_allocated+v_group_amount;
    v_payments:=v_payments||jsonb_build_array(jsonb_build_object(
      'method',v_method,
      'amount',v_group_amount,
      'tipAmount',v_tip,
      'provider',nullif(left(trim(coalesce(v_group->>'provider','')),80),''),
      'providerReference',nullif(left(trim(coalesce(v_group->>'providerReference','')),180),''),
      'metadata',jsonb_build_object(
        'splitType','items',
        'splitLabel',v_label,
        'splitIndex',v_group_index,
        'splitTax',v_group_tax,
        'allocations',v_allocations
      )
    ));
  end loop;

  if exists(
    select 1
    from public.pos_order_items i
    left join pg_temp.pos_split_alloc a on a.item_id=i.id
    where i.order_id=p_order_id
      and i.kitchen_status<>'cancelled'
      and abs(coalesce(a.allocated_qty,0)-i.quantity)>0.0005
  ) then
    raise exception 'SPLIT_NOT_COMPLETE';
  end if;

  if abs(round(v_total_allocated,2)-round(v_order.total,2))>0.005 then
    raise exception 'SPLIT_TOTAL_MISMATCH';
  end if;

  v_result:=public.pos_settle_open_order_split(
    p_order_id,p_client_event_id,p_device_id,p_cash_session_id,
    v_payments,p_actor_user_id,coalesce(p_occurred_at,now())
  );

  insert into public.pos_event_log(
    client_event_id,organization_id,restaurant_id,device_id,actor_user_id,
    entity_type,entity_id,event_type,payload,occurred_at
  ) values(
    gen_random_uuid(),v_order.organization_id,v_order.restaurant_id,p_device_id,p_actor_user_id,
    'order',p_order_id,'pos.order.split_allocated',
    jsonb_build_object('groupCount',jsonb_array_length(p_groups),'groups',p_groups),
    coalesce(p_occurred_at,now())
  );

  return v_result||jsonb_build_object('splitType','items','groupCount',jsonb_array_length(p_groups));
end;
$function$;

CREATE OR REPLACE FUNCTION public.pos_settle_open_order_split(p_order_id uuid, p_client_event_id uuid, p_device_id uuid, p_cash_session_id uuid, p_payments jsonb, p_actor_user_id uuid, p_occurred_at timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order public.pos_orders%rowtype;
  v_session public.pos_cash_sessions%rowtype;
  v_payment jsonb;
  v_method text;
  v_provider text;
  v_provider_reference text;
  v_metadata jsonb;
  v_amount numeric(14,2);
  v_tip numeric(14,2);
  v_amount_total numeric(14,2):=0;
  v_tip_total numeric(14,2):=0;
  v_receipt_no bigint;
  v_receipt text;
  v_payment_count integer:=0;
  v_payment_ids jsonb:='[]'::jsonb;
  v_payment_id uuid;
begin
  select * into v_order from public.pos_orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  if not public.pos_actor_has_access(p_actor_user_id,v_order.organization_id,v_order.restaurant_id) then
    raise exception 'POS_ACCESS_DENIED';
  end if;

  if v_order.status='paid' then
    return jsonb_build_object(
      'ok',true,'idempotent',true,'orderId',v_order.id,
      'receiptNumber',v_order.receipt_number,'total',v_order.total,
      'tip',v_order.tip_total,'status',v_order.status
    );
  end if;
  if v_order.status in ('refunded','cancelled') then raise exception 'ORDER_LOCKED'; end if;
  if v_order.status='payment_pending' or exists(select 1 from public.pos_payment_allocations where order_id=p_order_id) then raise exception 'PARTIAL_PAYMENTS_EXIST'; end if;
  if jsonb_typeof(p_payments)<>'array' or jsonb_array_length(p_payments)<1 then raise exception 'PAYMENTS_REQUIRED'; end if;
  if exists(select 1 from public.pos_event_log where client_event_id=p_client_event_id) then raise exception 'EVENT_ID_CONFLICT'; end if;

  select * into v_session from public.pos_cash_sessions where id=p_cash_session_id for update;
  if not found or v_session.status<>'open' or v_session.restaurant_id<>v_order.restaurant_id then
    raise exception 'OPEN_CASH_SESSION_REQUIRED';
  end if;

  if not exists(
    select 1 from public.pos_devices d
    where d.id=p_device_id and d.restaurant_id=v_order.restaurant_id and d.active=true
  ) then raise exception 'POS_DEVICE_INVALID'; end if;

  for v_payment in select value from jsonb_array_elements(p_payments)
  loop
    v_method:=lower(trim(coalesce(v_payment->>'method','')));
    if v_method not in ('cash','card','twint','voucher','invoice','other') then raise exception 'INVALID_PAYMENT_METHOD'; end if;

    v_amount:=round(coalesce((v_payment->>'amount')::numeric,0),2);
    v_tip:=round(coalesce((v_payment->>'tipAmount')::numeric,0),2);
    if v_amount<=0 or v_tip<0 then raise exception 'INVALID_PAYMENT_AMOUNT'; end if;

    v_amount_total:=v_amount_total+v_amount;
    v_tip_total:=v_tip_total+v_tip;
    v_payment_count:=v_payment_count+1;
  end loop;

  if abs(round(v_amount_total,2)-round(v_order.total,2))>0.005 then
    raise exception 'PAYMENT_TOTAL_MISMATCH';
  end if;

  insert into public.pos_receipt_counters(restaurant_id,business_date,last_number,updated_at)
  values(v_order.restaurant_id,v_order.business_date,1,now())
  on conflict(restaurant_id,business_date)
  do update set last_number=public.pos_receipt_counters.last_number+1,updated_at=now()
  returning last_number into v_receipt_no;

  v_receipt:=to_char(v_order.business_date,'YYYYMMDD')||'-'||lpad(v_receipt_no::text,6,'0');

  for v_payment in select value from jsonb_array_elements(p_payments)
  loop
    v_method:=lower(trim(coalesce(v_payment->>'method','')));
    v_amount:=round((v_payment->>'amount')::numeric,2);
    v_tip:=round(coalesce((v_payment->>'tipAmount')::numeric,0),2);
    v_provider:=nullif(left(trim(coalesce(v_payment->>'provider','')),80),'');
    v_provider_reference:=nullif(left(trim(coalesce(v_payment->>'providerReference','')),180),'');
    v_metadata:=case
      when jsonb_typeof(v_payment->'metadata')='object' then v_payment->'metadata'
      else '{}'::jsonb
    end;
    v_payment_id:=gen_random_uuid();

    insert into public.pos_payments(
      id,order_id,device_id,method,provider,provider_reference,amount,tip_amount,
      status,paid_at,metadata,receipt_number,created_by
    ) values(
      v_payment_id,p_order_id,p_device_id,v_method,v_provider,v_provider_reference,
      v_amount,v_tip,'captured',now(),v_metadata,v_receipt,p_actor_user_id
    );

    v_payment_ids:=v_payment_ids||jsonb_build_array(v_payment_id);
  end loop;

  update public.pos_orders
  set device_id=p_device_id,cash_session_id=p_cash_session_id,status='paid',
      tip_total=round(v_tip_total,2),receipt_number=v_receipt,
      closed_by=p_actor_user_id,closed_at=now(),client_updated_at=coalesce(p_occurred_at,now()),
      version=version+1
  where id=p_order_id
  returning * into v_order;

  insert into public.pos_event_log(
    client_event_id,organization_id,restaurant_id,device_id,actor_user_id,
    entity_type,entity_id,event_type,payload,occurred_at
  ) values(
    p_client_event_id,v_order.organization_id,v_order.restaurant_id,p_device_id,p_actor_user_id,
    'order',p_order_id,'pos.order.paid_split',
    jsonb_build_object(
      'receiptNumber',v_receipt,'total',v_order.total,'tip',round(v_tip_total,2),
      'paymentCount',v_payment_count,'paymentIds',v_payment_ids,
      'tableId',v_order.table_id,'tableLabel',v_order.table_label
    ),
    coalesce(p_occurred_at,now())
  );

  return jsonb_build_object(
    'ok',true,'idempotent',false,'orderId',p_order_id,
    'receiptNumber',v_receipt,'total',v_order.total,'tip',round(v_tip_total,2),
    'paymentCount',v_payment_count,'paymentIds',v_payment_ids,'status','paid'
  );
end;
$function$;



revoke all on function public.pos_pay_allocated_group(uuid,uuid,uuid,uuid,text,text,jsonb,numeric,text,text,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.pos_settle_open_order(uuid,uuid,uuid,uuid,text,text,text,numeric,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.pos_settle_open_order_split(uuid,uuid,uuid,uuid,jsonb,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.pos_settle_open_order_allocated(uuid,uuid,uuid,uuid,jsonb,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.pos_cancel_open_order(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.pos_pay_allocated_group(uuid,uuid,uuid,uuid,text,text,jsonb,numeric,text,text,uuid,timestamptz) to service_role;
grant execute on function public.pos_settle_open_order(uuid,uuid,uuid,uuid,text,text,text,numeric,uuid,timestamptz) to service_role;
grant execute on function public.pos_settle_open_order_split(uuid,uuid,uuid,uuid,jsonb,uuid,timestamptz) to service_role;
grant execute on function public.pos_settle_open_order_allocated(uuid,uuid,uuid,uuid,jsonb,uuid,timestamptz) to service_role;
grant execute on function public.pos_cancel_open_order(uuid,text,uuid) to service_role;
