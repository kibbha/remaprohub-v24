-- ReMaPro pre-launch: keep Hub daily finance aligned with the POS Z report.
-- Refunds belong to the business date of the cash session in which the refund
-- was completed, not retroactively to the original sale's business date.

drop view if exists public.pos_daily_sales_summary;

create view public.pos_daily_sales_summary with (security_invoker = true) as
with sales as (
  select
    o.organization_id,
    o.restaurant_id,
    o.business_date,
    count(*)::integer as paid_orders,
    coalesce(sum(o.covers),0)::integer as covers,
    coalesce(sum(o.subtotal),0)::numeric(14,2) as subtotal,
    coalesce(sum(o.discount_total),0)::numeric(14,2) as discounts,
    coalesce(sum(o.tax_total),0)::numeric(14,2) as tax_total,
    coalesce(sum(o.total),0)::numeric(14,2) as gross_sales,
    coalesce(sum(o.tip_total),0)::numeric(14,2) as tips,
    count(*) filter (where o.status='refunded')::integer as refunded_orders
  from public.pos_orders o
  where o.status in ('paid','refunded')
  group by o.organization_id,o.restaurant_id,o.business_date
),
refunds as (
  select
    r.organization_id,
    r.restaurant_id,
    s.business_date,
    coalesce(sum(r.amount),0)::numeric(14,2) as refund_total,
    coalesce(sum(r.tip_amount),0)::numeric(14,2) as refund_tip_total
  from public.pos_refunds r
  join public.pos_cash_sessions s
    on s.id=r.cash_session_id
   and s.restaurant_id=r.restaurant_id
  where r.status='completed'
  group by r.organization_id,r.restaurant_id,s.business_date
),
days as (
  select organization_id,restaurant_id,business_date from sales
  union
  select organization_id,restaurant_id,business_date from refunds
)
select
  d.organization_id,
  d.restaurant_id,
  d.business_date,
  coalesce(sa.paid_orders,0)::integer as paid_orders,
  coalesce(sa.covers,0)::integer as covers,
  coalesce(sa.subtotal,0)::numeric(14,2) as subtotal,
  coalesce(sa.discounts,0)::numeric(14,2) as discounts,
  coalesce(sa.tax_total,0)::numeric(14,2) as tax_total,
  coalesce(sa.gross_sales,0)::numeric(14,2) as gross_sales,
  coalesce(sa.tips,0)::numeric(14,2) as tips,
  coalesce(sa.refunded_orders,0)::integer as refunded_orders,
  coalesce(rf.refund_total,0)::numeric(14,2) as refund_total,
  (coalesce(sa.gross_sales,0)-coalesce(rf.refund_total,0))::numeric(14,2) as net_sales,
  coalesce(rf.refund_tip_total,0)::numeric(14,2) as refund_tips,
  (coalesce(sa.tips,0)-coalesce(rf.refund_tip_total,0))::numeric(14,2) as net_tips
from days d
left join sales sa
  on sa.organization_id=d.organization_id
 and sa.restaurant_id=d.restaurant_id
 and sa.business_date=d.business_date
left join refunds rf
  on rf.organization_id=d.organization_id
 and rf.restaurant_id=d.restaurant_id
 and rf.business_date=d.business_date;

grant select on public.pos_daily_sales_summary to authenticated;
