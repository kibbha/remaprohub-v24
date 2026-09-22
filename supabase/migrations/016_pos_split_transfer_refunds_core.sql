-- ReMaPro POS v0.5: split payments, transfers, cancellations and auditable refunds.
create table if not exists public.pos_refunds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null references public.pos_orders(id) on delete restrict,
  payment_id uuid references public.pos_payments(id) on delete set null,
  cash_session_id uuid references public.pos_cash_sessions(id) on delete set null,
  device_id uuid references public.pos_devices(id) on delete set null,
  method text not null check (method in ('cash','card','twint','voucher','invoice','other')),
  amount numeric(14,2) not null check (amount > 0),
  tip_amount numeric(14,2) not null default 0 check (tip_amount >= 0),
  status text not null default 'recorded' check (status in ('recorded','pending_external','completed','failed')),
  reason text not null,
  provider text,
  provider_reference text,
  requested_by uuid references auth.users(id) on delete set null,
  completed_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pos_refunds_order_idx on public.pos_refunds(order_id,status);
create index if not exists pos_refunds_restaurant_date_idx on public.pos_refunds(restaurant_id,requested_at desc);
create index if not exists pos_refunds_cash_session_idx on public.pos_refunds(cash_session_id);
create index if not exists pos_refunds_payment_idx on public.pos_refunds(payment_id);
create index if not exists pos_refunds_device_idx on public.pos_refunds(device_id);
create index if not exists pos_refunds_requested_by_idx on public.pos_refunds(requested_by);
create index if not exists pos_refunds_completed_by_idx on public.pos_refunds(completed_by);
create index if not exists pos_refunds_organization_idx on public.pos_refunds(organization_id);
drop trigger if exists pos_refunds_updated_at on public.pos_refunds;
create trigger pos_refunds_updated_at before update on public.pos_refunds for each row execute function public.set_updated_at();
alter table public.pos_refunds enable row level security;
revoke all on public.pos_refunds from anon;
revoke insert,update,delete on public.pos_refunds from authenticated;
grant select on public.pos_refunds to authenticated;
drop policy if exists pos_refunds_select on public.pos_refunds;
create policy pos_refunds_select on public.pos_refunds for select to authenticated using (public.is_restaurant_member(restaurant_id));

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
 update public.pos_orders set status='cancelled',closed_by=p_actor_user_id,closed_at=now(),client_updated_at=now(),version=version+1 where id=p_order_id returning * into v_order;
 update public.pos_order_items set kitchen_status='cancelled' where order_id=p_order_id;
 insert into public.pos_event_log(client_event_id,organization_id,restaurant_id,device_id,actor_user_id,entity_type,entity_id,event_type,payload,occurred_at)
 values(gen_random_uuid(),v_order.organization_id,v_order.restaurant_id,v_order.device_id,p_actor_user_id,'order',v_order.id,'pos.order.cancelled',
 jsonb_build_object('reason',v_reason,'total',v_order.total,'tableId',v_order.table_id,'tableLabel',v_order.table_label),now());
 return jsonb_build_object('ok',true,'idempotent',false,'orderId',v_order.id,'status','cancelled');
end $function$;

CREATE OR REPLACE FUNCTION public.pos_close_cash_session(p_session_id uuid, p_counted_cash numeric, p_actor_user_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_session public.pos_cash_sessions%rowtype; v_cash_sales numeric(14,2):=0; v_cash_refunds numeric(14,2):=0;
v_expected numeric(14,2):=0; v_counted numeric(14,2):=0; v_difference numeric(14,2):=0;
begin
 select * into v_session from public.pos_cash_sessions where id=p_session_id for update; if not found then raise exception 'SESSION_NOT_FOUND'; end if;
 if not public.pos_actor_has_access(p_actor_user_id,v_session.organization_id,v_session.restaurant_id) then raise exception 'POS_ACCESS_DENIED'; end if;
 if v_session.status='closed' then return jsonb_build_object('id',v_session.id,'status',v_session.status,'expectedCash',v_session.expected_cash,'countedCash',v_session.counted_cash,'differenceCash',v_session.difference_cash,'closedAt',v_session.closed_at); end if;
 if exists(select 1 from public.pos_orders o where o.cash_session_id=p_session_id and o.status in ('open','sent','preparing','served','payment_pending')) then raise exception 'OPEN_ORDERS_EXIST'; end if;
 if coalesce(p_counted_cash,0)<0 then raise exception 'INVALID_COUNTED_CASH'; end if;
 select coalesce(sum(p.amount+p.tip_amount),0)::numeric(14,2) into v_cash_sales from public.pos_payments p join public.pos_orders o on o.id=p.order_id
 where o.cash_session_id=p_session_id and o.status in ('paid','refunded') and p.status='captured' and p.method='cash';
 select coalesce(sum(r.amount+r.tip_amount),0)::numeric(14,2) into v_cash_refunds from public.pos_refunds r
 where r.cash_session_id=p_session_id and r.status='completed' and r.method='cash';
 v_expected:=round(coalesce(v_session.opening_cash,0)+coalesce(v_cash_sales,0)-coalesce(v_cash_refunds,0),2);
 v_counted:=round(coalesce(p_counted_cash,0),2); v_difference:=round(v_counted-v_expected,2);
 update public.pos_cash_sessions set status='closed',expected_cash=v_expected,counted_cash=v_counted,difference_cash=v_difference,
 closed_by=p_actor_user_id,closed_at=now(),notes=coalesce(nullif(trim(coalesce(p_notes,'')),''),notes) where id=p_session_id returning * into v_session;
 insert into public.pos_event_log(client_event_id,organization_id,restaurant_id,device_id,actor_user_id,entity_type,entity_id,event_type,payload,occurred_at)
 values(gen_random_uuid(),v_session.organization_id,v_session.restaurant_id,v_session.device_id,p_actor_user_id,'cash_session',v_session.id,'pos.cash_session.closed',
 jsonb_build_object('businessDate',v_session.business_date,'openingCash',v_session.opening_cash,'cashSales',v_cash_sales,'cashRefunds',v_cash_refunds,'expectedCash',v_expected,'countedCash',v_counted,'differenceCash',v_difference),now());
 return jsonb_build_object('id',v_session.id,'status',v_session.status,'cashSales',v_cash_sales,'cashRefunds',v_cash_refunds,'expectedCash',v_expected,'countedCash',v_counted,'differenceCash',v_difference,'closedAt',v_session.closed_at);
end $function$;

CREATE OR REPLACE FUNCTION public.pos_confirm_external_refund(p_refund_id uuid, p_success boolean, p_provider_reference text, p_actor_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_refund public.pos_refunds%rowtype; v_order public.pos_orders%rowtype; v_completed numeric(14,2):=0;
begin
 select * into v_refund from public.pos_refunds where id=p_refund_id for update; if not found then raise exception 'REFUND_NOT_FOUND'; end if;
 if not public.pos_actor_has_access(p_actor_user_id,v_refund.organization_id,v_refund.restaurant_id) then raise exception 'POS_ACCESS_DENIED'; end if;
 if v_refund.status in ('completed','failed') then return jsonb_build_object('ok',true,'idempotent',true,'refundId',v_refund.id,'status',v_refund.status); end if;
 update public.pos_refunds set status=case when p_success then 'completed' else 'failed' end,
 provider_reference=coalesce(nullif(left(trim(coalesce(p_provider_reference,'')),180),''),provider_reference),
 completed_by=p_actor_user_id,completed_at=now() where id=p_refund_id returning * into v_refund;
 select * into v_order from public.pos_orders where id=v_refund.order_id for update;
 if p_success then
   select coalesce(sum(amount),0) into v_completed from public.pos_refunds where order_id=v_order.id and status='completed';
   if round(v_completed,2)>=round(v_order.total,2) then update public.pos_orders set status='refunded',client_updated_at=now(),version=version+1 where id=v_order.id returning * into v_order; end if;
 end if;
 insert into public.pos_event_log(client_event_id,organization_id,restaurant_id,device_id,actor_user_id,entity_type,entity_id,event_type,payload,occurred_at)
 values(gen_random_uuid(),v_refund.organization_id,v_refund.restaurant_id,v_refund.device_id,p_actor_user_id,'refund',v_refund.id,
 case when p_success then 'pos.refund.completed' else 'pos.refund.failed' end,
 jsonb_build_object('orderId',v_order.id,'amount',v_refund.amount,'status',v_refund.status,'providerReference',v_refund.provider_reference),now());
 return jsonb_build_object('ok',true,'idempotent',false,'refundId',v_refund.id,'status',v_refund.status,'orderStatus',v_order.status);
end $function$;

CREATE OR REPLACE FUNCTION public.pos_refund_order(p_order_id uuid, p_client_event_id uuid, p_cash_session_id uuid, p_device_id uuid, p_method text, p_amount numeric, p_tip_amount numeric, p_reason text, p_provider text, p_provider_reference text, p_actor_user_id uuid, p_occurred_at timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
 v_order public.pos_orders%rowtype; v_session public.pos_cash_sessions%rowtype; v_method text:=lower(trim(coalesce(p_method,'')));
 v_amount numeric(14,2):=round(coalesce(p_amount,0),2); v_tip numeric(14,2):=round(coalesce(p_tip_amount,0),2);
 v_reason text:=left(trim(coalesce(p_reason,'')),500); v_refunded numeric(14,2):=0; v_refunded_tip numeric(14,2):=0;
 v_refund_id uuid:=gen_random_uuid(); v_status text;
begin
 if v_method not in ('cash','card','twint','voucher','invoice','other') then raise exception 'INVALID_REFUND_METHOD'; end if;
 if v_amount<=0 or v_tip<0 then raise exception 'INVALID_REFUND_AMOUNT'; end if; if v_reason='' then raise exception 'REFUND_REASON_REQUIRED'; end if;
 select * into v_order from public.pos_orders where id=p_order_id for update; if not found then raise exception 'ORDER_NOT_FOUND'; end if;
 if not public.pos_actor_has_access(p_actor_user_id,v_order.organization_id,v_order.restaurant_id) then raise exception 'POS_ACCESS_DENIED'; end if;
 if v_order.status not in ('paid','refunded') then raise exception 'ORDER_NOT_PAID'; end if;
 if exists(select 1 from public.pos_event_log where client_event_id=p_client_event_id) then return jsonb_build_object('ok',true,'idempotent',true,'orderId',v_order.id,'status',v_order.status); end if;
 select coalesce(sum(r.amount),0),coalesce(sum(r.tip_amount),0) into v_refunded,v_refunded_tip from public.pos_refunds r where r.order_id=p_order_id and r.status='completed';
 if round(v_refunded+v_amount,2)>round(v_order.total,2) then raise exception 'REFUND_EXCEEDS_ORDER_TOTAL'; end if;
 if round(v_refunded_tip+v_tip,2)>round(v_order.tip_total,2) then raise exception 'REFUND_EXCEEDS_TIP_TOTAL'; end if;
 select * into v_session from public.pos_cash_sessions where id=p_cash_session_id for update;
 if not found or v_session.status<>'open' or v_session.restaurant_id<>v_order.restaurant_id then raise exception 'OPEN_CASH_SESSION_REQUIRED'; end if;
 if not exists(select 1 from public.pos_devices d where d.id=p_device_id and d.restaurant_id=v_order.restaurant_id and d.active=true) then raise exception 'POS_DEVICE_INVALID'; end if;
 v_status:=case when v_method='cash' then 'completed' else 'pending_external' end;
 insert into public.pos_refunds(id,organization_id,restaurant_id,order_id,cash_session_id,device_id,method,amount,tip_amount,status,reason,provider,provider_reference,requested_by,completed_by,requested_at,completed_at)
 values(v_refund_id,v_order.organization_id,v_order.restaurant_id,v_order.id,p_cash_session_id,p_device_id,v_method,v_amount,v_tip,v_status,v_reason,
 nullif(left(trim(coalesce(p_provider,'')),80),''),nullif(left(trim(coalesce(p_provider_reference,'')),180),''),
 p_actor_user_id,case when v_status='completed' then p_actor_user_id else null end,coalesce(p_occurred_at,now()),case when v_status='completed' then now() else null end);
 if v_status='completed' and round(v_refunded+v_amount,2)>=round(v_order.total,2) then
   update public.pos_orders set status='refunded',client_updated_at=now(),version=version+1 where id=p_order_id returning * into v_order;
 end if;
 insert into public.pos_event_log(client_event_id,organization_id,restaurant_id,device_id,actor_user_id,entity_type,entity_id,event_type,payload,occurred_at)
 values(p_client_event_id,v_order.organization_id,v_order.restaurant_id,p_device_id,p_actor_user_id,'refund',v_refund_id,'pos.refund.requested',
 jsonb_build_object('orderId',v_order.id,'receiptNumber',v_order.receipt_number,'method',v_method,'amount',v_amount,'tipAmount',v_tip,'status',v_status,'reason',v_reason),coalesce(p_occurred_at,now()));
 return jsonb_build_object('ok',true,'idempotent',false,'refundId',v_refund_id,'orderId',v_order.id,'amount',v_amount,'tipAmount',v_tip,'refundStatus',v_status,'orderStatus',v_order.status);
end $function$;

CREATE OR REPLACE FUNCTION public.pos_settle_open_order_split(p_order_id uuid, p_client_event_id uuid, p_device_id uuid, p_cash_session_id uuid, p_payments jsonb, p_actor_user_id uuid, p_occurred_at timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
 v_order public.pos_orders%rowtype; v_session public.pos_cash_sessions%rowtype; v_payment jsonb;
 v_method text; v_provider text; v_provider_reference text; v_amount numeric(14,2); v_tip numeric(14,2);
 v_amount_total numeric(14,2):=0; v_tip_total numeric(14,2):=0; v_receipt_no bigint; v_receipt text;
 v_payment_count int:=0; v_payment_ids jsonb:='[]'::jsonb; v_payment_id uuid;
begin
 select * into v_order from public.pos_orders where id=p_order_id for update;
 if not found then raise exception 'ORDER_NOT_FOUND'; end if;
 if not public.pos_actor_has_access(p_actor_user_id,v_order.organization_id,v_order.restaurant_id) then raise exception 'POS_ACCESS_DENIED'; end if;
 if v_order.status='paid' then return jsonb_build_object('ok',true,'idempotent',true,'orderId',v_order.id,'receiptNumber',v_order.receipt_number,'total',v_order.total,'tip',v_order.tip_total,'status',v_order.status); end if;
 if v_order.status in ('refunded','cancelled') then raise exception 'ORDER_LOCKED'; end if;
 if jsonb_typeof(p_payments)<>'array' or jsonb_array_length(p_payments)<1 then raise exception 'PAYMENTS_REQUIRED'; end if;
 if exists(select 1 from public.pos_event_log where client_event_id=p_client_event_id) then raise exception 'EVENT_ID_CONFLICT'; end if;
 select * into v_session from public.pos_cash_sessions where id=p_cash_session_id for update;
 if not found or v_session.status<>'open' or v_session.restaurant_id<>v_order.restaurant_id then raise exception 'OPEN_CASH_SESSION_REQUIRED'; end if;
 if not exists(select 1 from public.pos_devices d where d.id=p_device_id and d.restaurant_id=v_order.restaurant_id and d.active=true) then raise exception 'POS_DEVICE_INVALID'; end if;
 for v_payment in select value from jsonb_array_elements(p_payments) loop
   v_method:=lower(trim(coalesce(v_payment->>'method','')));
   if v_method not in ('cash','card','twint','voucher','invoice','other') then raise exception 'INVALID_PAYMENT_METHOD'; end if;
   v_amount:=round(coalesce((v_payment->>'amount')::numeric,0),2);
   v_tip:=round(coalesce((v_payment->>'tipAmount')::numeric,0),2);
   if v_amount<=0 or v_tip<0 then raise exception 'INVALID_PAYMENT_AMOUNT'; end if;
   v_amount_total:=v_amount_total+v_amount; v_tip_total:=v_tip_total+v_tip; v_payment_count:=v_payment_count+1;
 end loop;
 if abs(round(v_amount_total,2)-round(v_order.total,2))>0.005 then raise exception 'PAYMENT_TOTAL_MISMATCH'; end if;
 insert into public.pos_receipt_counters(restaurant_id,business_date,last_number,updated_at)
 values(v_order.restaurant_id,v_order.business_date,1,now())
 on conflict(restaurant_id,business_date) do update set last_number=public.pos_receipt_counters.last_number+1,updated_at=now()
 returning last_number into v_receipt_no;
 v_receipt:=to_char(v_order.business_date,'YYYYMMDD')||'-'||lpad(v_receipt_no::text,6,'0');
 for v_payment in select value from jsonb_array_elements(p_payments) loop
   v_method:=lower(trim(coalesce(v_payment->>'method',''))); v_amount:=round((v_payment->>'amount')::numeric,2);
   v_tip:=round(coalesce((v_payment->>'tipAmount')::numeric,0),2); v_provider:=nullif(left(trim(coalesce(v_payment->>'provider','')),80),'');
   v_provider_reference:=nullif(left(trim(coalesce(v_payment->>'providerReference','')),180),''); v_payment_id:=gen_random_uuid();
   insert into public.pos_payments(id,order_id,device_id,method,provider,provider_reference,amount,tip_amount,status,paid_at,metadata,created_by)
   values(v_payment_id,p_order_id,p_device_id,v_method,v_provider,v_provider_reference,v_amount,v_tip,'captured',now(),'{}'::jsonb,p_actor_user_id);
   v_payment_ids:=v_payment_ids||jsonb_build_array(v_payment_id);
 end loop;
 update public.pos_orders set device_id=p_device_id,cash_session_id=p_cash_session_id,status='paid',tip_total=round(v_tip_total,2),
 receipt_number=v_receipt,closed_by=p_actor_user_id,closed_at=now(),client_updated_at=coalesce(p_occurred_at,now()),version=version+1
 where id=p_order_id returning * into v_order;
 insert into public.pos_event_log(client_event_id,organization_id,restaurant_id,device_id,actor_user_id,entity_type,entity_id,event_type,payload,occurred_at)
 values(p_client_event_id,v_order.organization_id,v_order.restaurant_id,p_device_id,p_actor_user_id,'order',p_order_id,'pos.order.paid_split',
 jsonb_build_object('receiptNumber',v_receipt,'total',v_order.total,'tip',round(v_tip_total,2),'paymentCount',v_payment_count,'paymentIds',v_payment_ids,'tableId',v_order.table_id,'tableLabel',v_order.table_label),
 coalesce(p_occurred_at,now()));
 return jsonb_build_object('ok',true,'idempotent',false,'orderId',p_order_id,'receiptNumber',v_receipt,'total',v_order.total,'tip',round(v_tip_total,2),'paymentCount',v_payment_count,'paymentIds',v_payment_ids,'status','paid');
end $function$;

CREATE OR REPLACE FUNCTION public.pos_transfer_open_order(p_order_id uuid, p_target_table_id uuid, p_actor_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_order public.pos_orders%rowtype; v_table public.pos_tables%rowtype; v_previous_table uuid; v_previous_label text;
begin
 select * into v_order from public.pos_orders where id=p_order_id for update; if not found then raise exception 'ORDER_NOT_FOUND'; end if;
 if not public.pos_actor_has_access(p_actor_user_id,v_order.organization_id,v_order.restaurant_id) then raise exception 'POS_ACCESS_DENIED'; end if;
 if v_order.status not in ('open','sent','preparing','served','payment_pending') then raise exception 'ORDER_LOCKED'; end if;
 select * into v_table from public.pos_tables where id=p_target_table_id and restaurant_id=v_order.restaurant_id and active=true;
 if not found then raise exception 'TARGET_TABLE_INVALID'; end if;
 if exists(select 1 from public.pos_orders o where o.restaurant_id=v_order.restaurant_id and o.table_id=p_target_table_id and o.id<>p_order_id and o.status in ('open','sent','preparing','served','payment_pending')) then raise exception 'TARGET_TABLE_OCCUPIED'; end if;
 v_previous_table:=v_order.table_id; v_previous_label:=v_order.table_label;
 update public.pos_orders set table_id=v_table.id,table_label=v_table.label,service_type='dine_in',client_updated_at=now(),version=version+1 where id=p_order_id returning * into v_order;
 insert into public.pos_event_log(client_event_id,organization_id,restaurant_id,device_id,actor_user_id,entity_type,entity_id,event_type,payload,occurred_at)
 values(gen_random_uuid(),v_order.organization_id,v_order.restaurant_id,v_order.device_id,p_actor_user_id,'order',v_order.id,'pos.order.transferred',
 jsonb_build_object('fromTableId',v_previous_table,'fromTableLabel',v_previous_label,'toTableId',v_table.id,'toTableLabel',v_table.label),now());
 return jsonb_build_object('ok',true,'orderId',v_order.id,'tableId',v_table.id,'tableLabel',v_table.label,'status',v_order.status);
end $function$;


revoke all on function public.pos_settle_open_order_split(uuid,uuid,uuid,uuid,jsonb,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.pos_transfer_open_order(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.pos_cancel_open_order(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.pos_refund_order(uuid,uuid,uuid,uuid,text,numeric,numeric,text,text,text,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.pos_confirm_external_refund(uuid,boolean,text,uuid) from public,anon,authenticated;
revoke all on function public.pos_close_cash_session(uuid,numeric,uuid,text) from public,anon,authenticated;
grant execute on function public.pos_settle_open_order_split(uuid,uuid,uuid,uuid,jsonb,uuid,timestamptz) to service_role;
grant execute on function public.pos_transfer_open_order(uuid,uuid,uuid) to service_role;
grant execute on function public.pos_cancel_open_order(uuid,text,uuid) to service_role;
grant execute on function public.pos_refund_order(uuid,uuid,uuid,uuid,text,numeric,numeric,text,text,text,uuid,timestamptz) to service_role;
grant execute on function public.pos_confirm_external_refund(uuid,boolean,text,uuid) to service_role;
grant execute on function public.pos_close_cash_session(uuid,numeric,uuid,text) to service_role;
