-- Execute after the fixture and the migration in an isolated PostgreSQL DB.
create or replace function public.test_revenuecat_event(
  v_uuid uuid,v_id text,v_type text,v_product text,v_timestamp bigint,v_store text default 'PLAY_STORE'
) returns jsonb language sql as $$
  select public.remapro_apply_revenuecat_event(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011',
    v_uuid,
    jsonb_build_object(
      'id',v_id,'type',v_type,'product_id',v_product,
      'app_user_id','00000000-0000-4000-8000-000000000011:00000000-0000-4000-8000-000000000001',
      'event_timestamp_ms',v_timestamp,'expiration_at_ms',4102444800000::bigint,
      'entitlement_ids',jsonb_build_array('remapro'),
      'store',v_store
    )
  );
$$;
do $$
begin
  if pg_catalog.has_function_privilege('anon','public.remapro_apply_revenuecat_event(uuid,uuid,uuid,jsonb)','EXECUTE')
    or pg_catalog.has_function_privilege('authenticated','public.remapro_apply_revenuecat_event(uuid,uuid,uuid,jsonb)','EXECUTE')
    or not pg_catalog.has_function_privilege('service_role','public.remapro_apply_revenuecat_event(uuid,uuid,uuid,jsonb)','EXECUTE')
  then raise exception 'Improper RevenueCat RPC execute permissions'; end if;
end $$;

set role service_role;
do $$
declare
  v_result jsonb;
  v_count integer;
begin
  v_result:=public.test_revenuecat_event('00000000-0000-4000-8000-000000000101','purchase-one','INITIAL_PURCHASE','remapro_1',1760000001000);
  if v_result->>'status'<>'active' or (v_result->>'restaurantLimit')::integer<>1 then
    raise exception 'Initial purchase not active: %',v_result;
  end if;
  v_result:=public.test_revenuecat_event('00000000-0000-4000-8000-000000000101','purchase-one','INITIAL_PURCHASE','remapro_1',1760000001000);
  if v_result->>'duplicate'<>'true' then raise exception 'Retry was not idempotent'; end if;

  v_result:=public.test_revenuecat_event('00000000-0000-4000-8000-000000000102','upgrade-three','RENEWAL','remapro_3',1760000002000);
  if (v_result->>'restaurantLimit')::integer<>3 then raise exception 'Upgrade failed'; end if;
  v_result:=public.test_revenuecat_event('00000000-0000-4000-8000-000000000103','stale-old-expiry','EXPIRATION','remapro_1',1760000001500);
  if v_result->>'reason'<>'STALE_EVENT' then raise exception 'Old expiry was not refused: %',v_result; end if;
  v_result:=public.test_revenuecat_event('00000000-0000-4000-8000-000000000104','new-old-expiry','EXPIRATION','remapro_1',1760000003500);
  if v_result->>'reason'<>'PREVIOUS_PRODUCT_EVENT' then raise exception 'Prior-product expiry was not refused'; end if;

  v_result:=public.test_revenuecat_event('00000000-0000-4000-8000-000000000105','cancel-current','CANCELLATION','remapro_3',1760000004000);
  if v_result->>'status'<>'active' then raise exception 'Cancellation revoked a paid period'; end if;
  v_result:=public.test_revenuecat_event('00000000-0000-4000-8000-000000000106','uncancel','UNCANCELLATION','remapro_3',1760000005000);
  if v_result->>'status'<>'active' then raise exception 'Uncancellation failed'; end if;

  select count(*) into v_count from public.subscription_events;
  if v_count<>4 then raise exception 'Expected four accepted ledger events, got %',v_count; end if;
  if not exists(
    select 1 from public.subscriptions where organization_id='00000000-0000-4000-8000-000000000001'
      and status='active' and restaurant_limit=3 and revenuecat_product_id='remapro_3'
      and cancel_at_period_end=false
  ) then raise exception 'Subscription not synchronized with ledger'; end if;
end $$;
reset role;

-- Deliberately fail the subscription write AFTER the ledger insert. The RPC
-- must roll back both records; this test catches the former split-write bug.
create or replace function public.test_reject_subscription_update() returns trigger
language plpgsql as $$
begin
  if new.store='force_fail' then raise exception 'forced rollback test'; end if;
  return new;
end $$;
create trigger test_sub_fail before update on public.subscriptions
for each row execute function public.test_reject_subscription_update();

set role service_role;
do $$
declare
  v_failed boolean:=false;
begin
  begin
    perform public.test_revenuecat_event(
      '00000000-0000-4000-8000-000000000107',
      'forced-failure','RENEWAL','remapro_4',1760000006000,'FORCE_FAIL'
    );
  exception when raise_exception then
    v_failed:=true;
  end;
  if not v_failed then raise exception 'Test trigger did not reject subscription write'; end if;
  if exists(select 1 from public.subscription_events where revenuecat_event_id='forced-failure') then
    raise exception 'Ledger was committed despite failed subscription update'; end if;
  if not exists(select 1 from public.subscriptions where restaurant_limit=3) then
    raise exception 'Subscription was changed despite failed transaction'; end if;
end $$;
reset role;
drop trigger test_sub_fail on public.subscriptions;
drop function public.test_reject_subscription_update();
select 'RevenueCat transaction rollback, role isolation, retry, stale event, and product change: PASS' as result;
