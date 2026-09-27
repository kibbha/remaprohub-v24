-- ReMaPro pre-launch audit: cash close must reconcile cash refunds and must
-- not close while a terminal payment/refund is still unresolved.

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
  v_cash_refunds numeric(14,2):=0;
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
    return jsonb_build_object(
      'id',v_session.id,'status',v_session.status,
      'expectedCash',v_session.expected_cash,'countedCash',v_session.counted_cash,
      'differenceCash',v_session.difference_cash,'closedAt',v_session.closed_at
    );
  end if;

  if exists (
    select 1 from public.pos_orders o
    where o.cash_session_id=p_session_id
      and o.status in ('open','sent','preparing','served','payment_pending')
  ) then raise exception 'OPEN_ORDERS_EXIST'; end if;

  if to_regclass('public.pos_payment_intents') is not null and exists (
    select 1 from public.pos_payment_intents i
    where i.cash_session_id=p_session_id
      and i.status in ('created','pending','authorized')
  ) then raise exception 'OPEN_PAYMENT_INTENTS_EXIST'; end if;

  if to_regclass('public.pos_refunds') is not null and exists (
    select 1 from public.pos_refunds r
    where r.cash_session_id=p_session_id and r.status='pending_external'
  ) then raise exception 'PENDING_REFUNDS_EXIST'; end if;

  if coalesce(p_counted_cash,0)<0 then raise exception 'INVALID_COUNTED_CASH'; end if;

  select coalesce(sum(p.amount+p.tip_amount),0)::numeric(14,2)
  into v_cash_sales
  from public.pos_payments p
  join public.pos_orders o on o.id=p.order_id
  where o.cash_session_id=p_session_id
    and o.status in ('paid','refunded')
    and p.status='captured'
    and p.method='cash';

  select coalesce(sum(r.amount+r.tip_amount),0)::numeric(14,2)
  into v_cash_refunds
  from public.pos_refunds r
  where r.cash_session_id=p_session_id
    and r.status='completed'
    and r.method='cash';

  v_expected:=round(coalesce(v_session.opening_cash,0)+coalesce(v_cash_sales,0)-coalesce(v_cash_refunds,0),2);
  v_counted:=round(coalesce(p_counted_cash,0),2);
  v_difference:=round(v_counted-v_expected,2);

  update public.pos_cash_sessions
  set status='closed',expected_cash=v_expected,counted_cash=v_counted,difference_cash=v_difference,
      closed_by=p_actor_user_id,closed_at=now(),
      notes=coalesce(nullif(trim(coalesce(p_notes,'')),''),notes)
  where id=p_session_id
  returning * into v_session;

  insert into public.pos_event_log(
    client_event_id,organization_id,restaurant_id,device_id,actor_user_id,
    entity_type,entity_id,event_type,payload,occurred_at
  ) values(
    gen_random_uuid(),v_session.organization_id,v_session.restaurant_id,v_session.device_id,p_actor_user_id,
    'cash_session',v_session.id,'pos.cash_session.closed',
    jsonb_build_object(
      'businessDate',v_session.business_date,'openingCash',v_session.opening_cash,
      'cashSales',v_cash_sales,'cashRefunds',v_cash_refunds,
      'expectedCash',v_expected,'countedCash',v_counted,'differenceCash',v_difference
    ),
    now()
  );

  return jsonb_build_object(
    'id',v_session.id,'status',v_session.status,
    'expectedCash',v_expected,'cashSales',v_cash_sales,'cashRefunds',v_cash_refunds,
    'countedCash',v_counted,'differenceCash',v_difference,'closedAt',v_session.closed_at
  );
end;
$$;

revoke all on function public.pos_close_cash_session(uuid,numeric,uuid,text) from public,anon,authenticated;
grant execute on function public.pos_close_cash_session(uuid,numeric,uuid,text) to service_role;
