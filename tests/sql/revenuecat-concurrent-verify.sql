do $$
declare
  v_slots integer;
  v_product text;
  v_total integer;
begin
  select restaurant_limit,revenuecat_product_id into v_slots,v_product
  from public.subscriptions
  where organization_id='00000000-0000-4000-8000-000000000001';
  if v_slots<>5 or v_product<>'remapro_5' then
    raise exception 'Concurrent notifications did not resolve to latest paid product: %, %',v_slots,v_product;
  end if;
  select count(*) into v_total from public.subscription_events;
  if v_total not between 5 and 6 then
    raise exception 'Unexpected accepted event count after concurrent notifications: %',v_total;
  end if;
end $$;
select 'Concurrent RevenueCat notifications: newer entitlement retained' as result;
