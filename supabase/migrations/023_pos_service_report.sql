-- ReMaPro POS v0.11: service/Z report with refunds attributed to the service date.
CREATE OR REPLACE FUNCTION public.pos_service_report(p_restaurant_id uuid, p_business_date date, p_actor_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_restaurant public.restaurants%rowtype;
  v_orders integer:=0;
  v_refunded_orders integer:=0;
  v_covers integer:=0;
  v_subtotal numeric(14,2):=0;
  v_tax numeric(14,2):=0;
  v_gross numeric(14,2):=0;
  v_tips numeric(14,2):=0;
  v_refunds numeric(14,2):=0;
  v_refund_tips numeric(14,2):=0;
  v_payments jsonb:='[]'::jsonb;
  v_refund_methods jsonb:='[]'::jsonb;
  v_tax_groups jsonb:='[]'::jsonb;
  v_sessions jsonb:='{}'::jsonb;
begin
  select * into v_restaurant from public.restaurants where id=p_restaurant_id and active=true;
  if not found then raise exception 'RESTAURANT_NOT_FOUND'; end if;

  if not public.pos_actor_has_access(p_actor_user_id,v_restaurant.organization_id,p_restaurant_id) then
    raise exception 'POS_ACCESS_DENIED';
  end if;

  select
    count(*)::integer,
    count(*) filter (where status='refunded')::integer,
    coalesce(sum(covers),0)::integer,
    coalesce(sum(subtotal),0)::numeric(14,2),
    coalesce(sum(tax_total),0)::numeric(14,2),
    coalesce(sum(total),0)::numeric(14,2),
    coalesce(sum(tip_total),0)::numeric(14,2)
  into v_orders,v_refunded_orders,v_covers,v_subtotal,v_tax,v_gross,v_tips
  from public.pos_orders
  where restaurant_id=p_restaurant_id
    and business_date=p_business_date
    and status in ('paid','refunded');

  select
    coalesce(sum(r.amount),0)::numeric(14,2),
    coalesce(sum(r.tip_amount),0)::numeric(14,2)
  into v_refunds,v_refund_tips
  from public.pos_refunds r
  join public.pos_cash_sessions s on s.id=r.cash_session_id
  where r.restaurant_id=p_restaurant_id
    and s.business_date=p_business_date
    and r.status='completed';

  select coalesce(jsonb_agg(x order by x.method),'[]'::jsonb)
  into v_payments
  from (
    select p.method,
           count(*)::integer as count,
           coalesce(sum(p.amount),0)::numeric(14,2) as amount,
           coalesce(sum(p.tip_amount),0)::numeric(14,2) as tips
    from public.pos_payments p
    join public.pos_orders o on o.id=p.order_id
    where o.restaurant_id=p_restaurant_id
      and o.business_date=p_business_date
      and o.status in ('paid','refunded')
      and p.status='captured'
    group by p.method
  ) x;

  select coalesce(jsonb_agg(x order by x.method),'[]'::jsonb)
  into v_refund_methods
  from (
    select r.method,
           count(*)::integer as count,
           coalesce(sum(r.amount),0)::numeric(14,2) as amount,
           coalesce(sum(r.tip_amount),0)::numeric(14,2) as tips
    from public.pos_refunds r
    join public.pos_cash_sessions s on s.id=r.cash_session_id
    where r.restaurant_id=p_restaurant_id
      and s.business_date=p_business_date
      and r.status='completed'
    group by r.method
  ) x;

  select coalesce(jsonb_agg(x order by x.tax_rate),'[]'::jsonb)
  into v_tax_groups
  from (
    select i.tax_rate,
           coalesce(sum(i.line_total),0)::numeric(14,2) as gross,
           coalesce(sum(i.tax_amount),0)::numeric(14,2) as tax
    from public.pos_order_items i
    join public.pos_orders o on o.id=i.order_id
    where o.restaurant_id=p_restaurant_id
      and o.business_date=p_business_date
      and o.status in ('paid','refunded')
      and i.kitchen_status<>'cancelled'
    group by i.tax_rate
  ) x;

  select jsonb_build_object(
    'count',count(*)::integer,
    'openCount',count(*) filter (where status='open')::integer,
    'closedCount',count(*) filter (where status='closed')::integer,
    'openingCash',coalesce(sum(opening_cash),0)::numeric(14,2),
    'expectedCash',coalesce(sum(expected_cash) filter (where status='closed'),0)::numeric(14,2),
    'countedCash',coalesce(sum(counted_cash) filter (where status='closed'),0)::numeric(14,2),
    'differenceCash',coalesce(sum(difference_cash) filter (where status='closed'),0)::numeric(14,2)
  )
  into v_sessions
  from public.pos_cash_sessions
  where restaurant_id=p_restaurant_id and business_date=p_business_date;

  return jsonb_build_object(
    'restaurantId',p_restaurant_id,
    'businessDate',p_business_date,
    'currency',coalesce(v_restaurant.currency,'CHF'),
    'orders',v_orders,
    'refundedOrders',v_refunded_orders,
    'covers',v_covers,
    'subtotal',v_subtotal,
    'taxTotal',v_tax,
    'grossSales',v_gross,
    'refundTotal',v_refunds,
    'netSales',round(v_gross-v_refunds,2),
    'tips',v_tips,
    'refundTips',v_refund_tips,
    'netTips',round(v_tips-v_refund_tips,2),
    'averageTicket',case when v_orders>0 then round(v_gross/v_orders,2) else 0 end,
    'payments',v_payments,
    'refundsByMethod',v_refund_methods,
    'taxGroups',v_tax_groups,
    'cashSessions',v_sessions
  );
end;
$function$;
revoke all on function public.pos_service_report(uuid,date,uuid) from public,anon,authenticated;
grant execute on function public.pos_service_report(uuid,date,uuid) to service_role;
