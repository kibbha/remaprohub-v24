-- ReMaPro POS v0.5: gross sales, refunds and net sales.
drop view if exists public.pos_daily_sales_summary;
create view public.pos_daily_sales_summary with (security_invoker = true) as
 WITH refunds AS (
         SELECT pos_refunds.order_id,
            COALESCE(sum(pos_refunds.amount) FILTER (WHERE pos_refunds.status = 'completed'::text), 0::numeric)::numeric(14,2) AS refund_total,
            COALESCE(sum(pos_refunds.tip_amount) FILTER (WHERE pos_refunds.status = 'completed'::text), 0::numeric)::numeric(14,2) AS refund_tip_total
           FROM pos_refunds
          GROUP BY pos_refunds.order_id
        )
 SELECT o.organization_id,
    o.restaurant_id,
    o.business_date,
    count(*) FILTER (WHERE o.status = ANY (ARRAY['paid'::text, 'refunded'::text]))::integer AS paid_orders,
    COALESCE(sum(o.covers) FILTER (WHERE o.status = ANY (ARRAY['paid'::text, 'refunded'::text])), 0::bigint)::integer AS covers,
    COALESCE(sum(o.subtotal) FILTER (WHERE o.status = ANY (ARRAY['paid'::text, 'refunded'::text])), 0::numeric)::numeric(14,2) AS subtotal,
    COALESCE(sum(o.discount_total) FILTER (WHERE o.status = ANY (ARRAY['paid'::text, 'refunded'::text])), 0::numeric)::numeric(14,2) AS discounts,
    COALESCE(sum(o.tax_total) FILTER (WHERE o.status = ANY (ARRAY['paid'::text, 'refunded'::text])), 0::numeric)::numeric(14,2) AS tax_total,
    COALESCE(sum(o.total) FILTER (WHERE o.status = ANY (ARRAY['paid'::text, 'refunded'::text])), 0::numeric)::numeric(14,2) AS gross_sales,
    COALESCE(sum(o.tip_total) FILTER (WHERE o.status = ANY (ARRAY['paid'::text, 'refunded'::text])), 0::numeric)::numeric(14,2) AS tips,
    count(*) FILTER (WHERE o.status = 'refunded'::text)::integer AS refunded_orders,
    COALESCE(sum(r.refund_total) FILTER (WHERE o.status = ANY (ARRAY['paid'::text, 'refunded'::text])), 0::numeric)::numeric(14,2) AS refund_total,
    (COALESCE(sum(o.total) FILTER (WHERE o.status = ANY (ARRAY['paid'::text, 'refunded'::text])), 0::numeric) - COALESCE(sum(r.refund_total) FILTER (WHERE o.status = ANY (ARRAY['paid'::text, 'refunded'::text])), 0::numeric))::numeric(14,2) AS net_sales,
    COALESCE(sum(r.refund_tip_total) FILTER (WHERE o.status = ANY (ARRAY['paid'::text, 'refunded'::text])), 0::numeric)::numeric(14,2) AS refund_tips,
    (COALESCE(sum(o.tip_total) FILTER (WHERE o.status = ANY (ARRAY['paid'::text, 'refunded'::text])), 0::numeric) - COALESCE(sum(r.refund_tip_total) FILTER (WHERE o.status = ANY (ARRAY['paid'::text, 'refunded'::text])), 0::numeric))::numeric(14,2) AS net_tips
   FROM pos_orders o
     LEFT JOIN refunds r ON r.order_id = o.id
  GROUP BY o.organization_id, o.restaurant_id, o.business_date;;
grant select on public.pos_daily_sales_summary to authenticated;
