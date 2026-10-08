-- ReMaPro billing: atomic, service-role-only application of RevenueCat events.
-- The API is intentionally SECURITY INVOKER. The webhook uses service_role
-- after verifying its shared secret; public users must never call this RPC.
create or replace function public.remapro_apply_revenuecat_event(
  p_organization_id uuid,
  p_user_id uuid,
  p_event_record_id uuid,
  p_event jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_type text := upper(coalesce(p_event->>'type',''));
  v_product text := coalesce(p_event->>'product_id',p_event->>'product_identifier','');
  v_event_id text := coalesce(p_event->>'id','');
  v_ts_text text := coalesce(p_event->>'event_timestamp_ms','');
  v_ts bigint;
  v_latest_ts bigint := 0;
  v_exp_text text := coalesce(p_event->>'expiration_at_ms','');
  v_expiration timestamptz := null;
  v_plan_id uuid;
  v_subscription_id uuid;
  v_current_product text := '';
  v_restaurant_limit integer;
  v_status public.subscription_status := 'active'::public.subscription_status;
  v_cancel_at_period_end boolean := false;
begin
  if p_organization_id is null or p_user_id is null or p_event_record_id is null
    or p_event is null or jsonb_typeof(p_event)<>'object'
    or length(v_event_id)<1 or length(v_event_id)>256
    or (p_event->>'app_user_id') is distinct from (p_user_id::text||':'||p_organization_id::text)
  then
    raise exception 'INVALID_REVENUECAT_EVENT' using errcode='22023';
  end if;

  if v_type not in (
    'INITIAL_PURCHASE','RENEWAL','CANCELLATION','UNCANCELLATION',
    'BILLING_ISSUE','EXPIRATION','SUBSCRIPTION_PAUSED',
    'SUBSCRIPTION_EXTENDED','REFUND_REVERSED'
  ) then return jsonb_build_object('ok',true,'ignored',true,'reason','UNSUPPORTED_EVENT'); end if;
  if v_product !~* '^remapro[_-][1-5](:[a-z0-9][a-z0-9._-]*)?$' then
    return jsonb_build_object('ok',true,'ignored',true,'reason','UNRELATED_PRODUCT');
  end if;
  if jsonb_typeof(p_event->'entitlement_ids')='array'
     and jsonb_array_length(p_event->'entitlement_ids')>0
     and not (p_event->'entitlement_ids' ? 'remapro') then
    return jsonb_build_object('ok',true,'ignored',true,'reason','UNRELATED_ENTITLEMENT');
  end if;
  if v_ts_text !~ '^[0-9]{12,16}$' then
    return jsonb_build_object('ok',true,'ignored',true,'reason','INVALID_EVENT_TIMESTAMP');
  end if;
  v_ts := v_ts_text::bigint;
  v_restaurant_limit := substring(v_product from '^remapro[_-]([1-5])')::integer;

  if v_exp_text ~ '^[0-9]{12,16}$' then
    v_expiration := pg_catalog.to_timestamp(v_exp_text::numeric / 1000);
  end if;

  -- Every notification for an organization is serialized by this TX-scoped lock,
  -- including distinct events delivered concurrently by RevenueCat.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'remapro:revenuecat:'||p_organization_id::text,0));

  if not exists (
    select 1 from public.memberships
    where organization_id=p_organization_id and user_id=p_user_id and active=true
  ) then
    raise exception 'REVENUECAT_ACTIVE_MEMBERSHIP_REQUIRED' using errcode='42501';
  end if;
  if exists(select 1 from public.subscription_events where id=p_event_record_id) then
    return jsonb_build_object('ok',true,'duplicate',true);
  end if;

  select id,revenuecat_product_id into v_subscription_id,v_current_product
  from public.subscriptions
  where organization_id=p_organization_id
  order by created_at desc,id desc limit 1 for update;

  if v_subscription_id is null and v_type not in ('INITIAL_PURCHASE','RENEWAL') then
    return jsonb_build_object('ok',true,'ignored',true,'reason','NO_ACTIVE_SUBSCRIPTION');
  end if;

  select coalesce(max((payload->>'event_timestamp_ms')::bigint),0) into v_latest_ts
  from public.subscription_events
  where organization_id=p_organization_id
    and (payload->>'event_timestamp_ms') ~ '^[0-9]{12,16}$';
  if v_latest_ts>v_ts then
    return jsonb_build_object('ok',true,'ignored',true,'reason','STALE_EVENT');
  end if;
  if v_latest_ts=v_ts and v_latest_ts>0 then
    return jsonb_build_object('ok',true,'ignored',true,'reason','AMBIGUOUS_EVENT_TIMESTAMP');
  end if;
  if coalesce(v_current_product,'')<>'' and v_current_product<>v_product
     and v_type not in ('INITIAL_PURCHASE','RENEWAL') then
    return jsonb_build_object('ok',true,'ignored',true,'reason','PREVIOUS_PRODUCT_EVENT');
  end if;

  -- Do not accidentally grant non-expiring paid access for missing/old periods.
  if v_type in ('INITIAL_PURCHASE','RENEWAL','UNCANCELLATION',
      'SUBSCRIPTION_PAUSED','SUBSCRIPTION_EXTENDED','REFUND_REVERSED')
     and (v_expiration is null or v_expiration<=pg_catalog.now()) then
    return jsonb_build_object('ok',true,'ignored',true,'reason','NO_VALID_PAID_PERIOD');
  end if;

  select id into v_plan_id from public.subscription_plans
  where code='standard' and active=true limit 1;
  if v_plan_id is null then raise exception 'REVENUECAT_STANDARD_PLAN_MISSING'; end if;

  if v_type='EXPIRATION' then v_status:='expired';
  elsif v_type='BILLING_ISSUE' then
    v_status:=case when v_expiration is null or v_expiration<=pg_catalog.now()
      then 'expired'::public.subscription_status else 'past_due'::public.subscription_status end;
  elsif v_type='CANCELLATION' then
    v_status:=case when v_expiration>pg_catalog.now()
      then 'active'::public.subscription_status else 'canceled'::public.subscription_status end;
    v_cancel_at_period_end:=true;
  end if;

  -- Insert and subscription update are ONE Postgres transaction. Either both
  -- commit, or neither does. A retry uses the same deterministic UUID PK.
  insert into public.subscription_events(
    id,organization_id,event_type,payload,revenuecat_event_id,app_user_id
  ) values (
    p_event_record_id,p_organization_id,v_type,p_event,v_event_id,p_event->>'app_user_id'
  );

  if v_subscription_id is null then
    insert into public.subscriptions(
      organization_id,plan_id,status,current_period_end,cancel_at_period_end,
      revenuecat_app_user_id,revenuecat_product_id,revenuecat_entitlement,
      restaurant_limit,store,updated_at
    ) values (
      p_organization_id,v_plan_id,v_status,v_expiration,v_cancel_at_period_end,
      p_event->>'app_user_id',v_product,'remapro',v_restaurant_limit,
      lower(coalesce(p_event->>'store','PLAY_STORE')),pg_catalog.now()
    );
  else
    update public.subscriptions set
      plan_id=v_plan_id,status=v_status,current_period_end=v_expiration,
      cancel_at_period_end=v_cancel_at_period_end,
      revenuecat_app_user_id=p_event->>'app_user_id',
      revenuecat_product_id=v_product,revenuecat_entitlement='remapro',
      restaurant_limit=v_restaurant_limit,
      store=lower(coalesce(p_event->>'store','PLAY_STORE')),
      updated_at=pg_catalog.now()
    where id=v_subscription_id;
  end if;

  return jsonb_build_object('ok',true,'organizationId',p_organization_id,
    'status',v_status::text,'restaurantLimit',v_restaurant_limit,
    'plan','standard');
end;
$function$;

-- Supabase public functions default to PUBLIC EXECUTE: revoke explicitly.
revoke all on function public.remapro_apply_revenuecat_event(uuid,uuid,uuid,jsonb)
  from public,anon,authenticated;
grant execute on function public.remapro_apply_revenuecat_event(uuid,uuid,uuid,jsonb)
  to service_role;
comment on function public.remapro_apply_revenuecat_event(uuid,uuid,uuid,jsonb) is
  'Service-role-only atomic RevenueCat notification ledger/subscription transition';
