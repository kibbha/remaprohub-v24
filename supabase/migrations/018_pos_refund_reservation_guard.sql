-- Prevent completed + pending refunds from reserving more than the original ticket total.
CREATE OR REPLACE FUNCTION public.pos_refunds_validate_total()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order_total numeric(14,2);
  v_order_tip numeric(14,2);
  v_reserved numeric(14,2):=0;
  v_reserved_tip numeric(14,2):=0;
begin
  if new.status not in ('completed','pending_external') then return new; end if;

  select total,tip_total into v_order_total,v_order_tip
  from public.pos_orders where id=new.order_id;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  select coalesce(sum(amount),0),coalesce(sum(tip_amount),0)
  into v_reserved,v_reserved_tip
  from public.pos_refunds
  where order_id=new.order_id
    and status in ('completed','pending_external')
    and id<>new.id;

  if round(v_reserved+new.amount,2)>round(v_order_total,2) then
    raise exception 'REFUND_EXCEEDS_ORDER_TOTAL';
  end if;
  if round(v_reserved_tip+new.tip_amount,2)>round(v_order_tip,2) then
    raise exception 'REFUND_EXCEEDS_TIP_TOTAL';
  end if;
  return new;
end;
$function$;
drop trigger if exists pos_refunds_validate_total_trigger on public.pos_refunds;
create trigger pos_refunds_validate_total_trigger
before insert or update of amount,tip_amount,status on public.pos_refunds
for each row execute function public.pos_refunds_validate_total();
revoke all on function public.pos_refunds_validate_total() from public,anon,authenticated;
grant execute on function public.pos_refunds_validate_total() to service_role;
