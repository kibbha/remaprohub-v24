-- ReMaPro POS: add Worldline Tap to Pay / Tap on Mobile as an explicit integration mode.
-- This migration changes configuration/readiness only. Provider capture remains disabled
-- until the official Worldline adapter is installed and validated.

alter table public.pos_payment_terminals
  drop constraint if exists pos_payment_terminals_integration_mode_check;
alter table public.pos_payment_terminals
  add constraint pos_payment_terminals_integration_mode_check
  check (integration_mode in ('cloud','tap_to_pay','external_app','local_network'));

alter table public.pos_provider_connections
  drop constraint if exists pos_provider_connections_integration_mode_check;
alter table public.pos_provider_connections
  add constraint pos_provider_connections_integration_mode_check
  check (integration_mode in ('terminal_api_cloud','tim','tap_to_pay','direct','terminal_psp'));

CREATE OR REPLACE FUNCTION public.pos_upsert_payment_terminal(p_terminal_id uuid, p_restaurant_id uuid, p_device_id uuid, p_label text, p_provider text, p_integration_mode text, p_external_terminal_id text, p_currency text, p_supports_card boolean, p_supports_twint boolean, p_supports_tips boolean, p_supports_refunds boolean, p_active boolean, p_public_config jsonb, p_actor_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rest public.restaurants%rowtype;
  v_row public.pos_payment_terminals%rowtype;
  v_id uuid:=coalesce(p_terminal_id,gen_random_uuid());
  v_provider text:=lower(trim(coalesce(p_provider,'')));
  v_mode text:=lower(trim(coalesce(p_integration_mode,'cloud')));
  v_label text:=left(trim(coalesce(p_label,'')),120);
  v_currency text:=upper(left(trim(coalesce(p_currency,'CHF')),3));
begin
  select * into v_rest from public.restaurants where id=p_restaurant_id and active=true;
  if not found then raise exception 'RESTAURANT_NOT_FOUND'; end if;
  if not public.pos_actor_is_manager(p_actor_user_id,v_rest.organization_id,p_restaurant_id) then
    raise exception 'MANAGER_ACCESS_REQUIRED';
  end if;
  if v_label='' then raise exception 'TERMINAL_LABEL_REQUIRED'; end if;
  if v_provider not in ('worldline','twint','generic') then raise exception 'INVALID_TERMINAL_PROVIDER'; end if;
  if v_mode not in ('cloud','tap_to_pay','external_app','local_network') then raise exception 'INVALID_INTEGRATION_MODE'; end if;
  if p_device_id is not null and not exists(
    select 1 from public.pos_devices d
    where d.id=p_device_id and d.restaurant_id=p_restaurant_id
  ) then raise exception 'POS_DEVICE_INVALID'; end if;

  insert into public.pos_payment_terminals(
    id,organization_id,restaurant_id,device_id,label,provider,integration_mode,
    external_terminal_id,currency,supports_card,supports_twint,supports_tips,
    supports_refunds,active,connection_status,public_config,created_by,updated_by
  ) values(
    v_id,v_rest.organization_id,p_restaurant_id,p_device_id,v_label,v_provider,v_mode,
    nullif(left(trim(coalesce(p_external_terminal_id,'')),180),''),
    v_currency,coalesce(p_supports_card,true),coalesce(p_supports_twint,false),
    coalesce(p_supports_tips,true),coalesce(p_supports_refunds,true),
    coalesce(p_active,false),'not_configured',
    case when jsonb_typeof(p_public_config)='object' then p_public_config else '{}'::jsonb end,
    p_actor_user_id,p_actor_user_id
  )
  on conflict(id) do update set
    device_id=excluded.device_id,
    label=excluded.label,
    provider=excluded.provider,
    integration_mode=excluded.integration_mode,
    external_terminal_id=excluded.external_terminal_id,
    currency=excluded.currency,
    supports_card=excluded.supports_card,
    supports_twint=excluded.supports_twint,
    supports_tips=excluded.supports_tips,
    supports_refunds=excluded.supports_refunds,
    active=excluded.active,
    public_config=excluded.public_config,
    updated_by=p_actor_user_id
  where public.pos_payment_terminals.restaurant_id=p_restaurant_id
  returning * into v_row;

  if not found then raise exception 'TERMINAL_UPDATE_DENIED'; end if;

  insert into public.pos_event_log(
    client_event_id,organization_id,restaurant_id,device_id,actor_user_id,
    entity_type,entity_id,event_type,payload,occurred_at
  ) values(
    gen_random_uuid(),v_row.organization_id,v_row.restaurant_id,v_row.device_id,p_actor_user_id,
    'payment_terminal',v_row.id,'pos.terminal.configured',
    jsonb_build_object(
      'label',v_row.label,'provider',v_row.provider,'integrationMode',v_row.integration_mode,
      'active',v_row.active,'connectionStatus',v_row.connection_status
    ),now()
  );

  return to_jsonb(v_row)-'public_config';
end;
$function$;

create or replace function public.pos_upsert_provider_connection(
  p_connection_id uuid,
  p_restaurant_id uuid,
  p_provider text,
  p_integration_mode text,
  p_environment text,
  p_status text,
  p_merchant_reference text,
  p_public_config jsonb,
  p_notes text,
  p_actor_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_rest public.restaurants%rowtype;
  v_row public.pos_provider_connections%rowtype;
  v_provider text:=lower(trim(coalesce(p_provider,'')));
  v_mode text:=lower(trim(coalesce(p_integration_mode,'')));
  v_env text:=lower(trim(coalesce(p_environment,'test')));
  v_status text:=lower(trim(coalesce(p_status,'not_configured')));
  v_id uuid:=coalesce(p_connection_id,gen_random_uuid());
begin
  select * into v_rest from public.restaurants where id=p_restaurant_id and active=true;
  if not found then raise exception 'RESTAURANT_NOT_FOUND'; end if;
  if not public.pos_actor_is_manager(p_actor_user_id,v_rest.organization_id,p_restaurant_id) then
    raise exception 'MANAGER_ACCESS_REQUIRED';
  end if;
  if v_provider not in ('worldline','twint') then raise exception 'INVALID_PROVIDER'; end if;
  if v_provider='worldline' and v_mode not in ('terminal_api_cloud','tim','tap_to_pay') then raise exception 'INVALID_WORLDLINE_MODE'; end if;
  if v_provider='twint' and v_mode not in ('direct','terminal_psp') then raise exception 'INVALID_TWINT_MODE'; end if;
  if v_env not in ('test','live') then raise exception 'INVALID_PROVIDER_ENVIRONMENT'; end if;
  if v_status not in ('not_configured','waiting_contract','credentials_pending','ready_for_adapter','disabled') then
    raise exception 'INVALID_PROVIDER_STATUS';
  end if;

  insert into public.pos_provider_connections(
    id,organization_id,restaurant_id,provider,integration_mode,environment,status,
    merchant_reference,public_config,notes,created_by,updated_by
  ) values(
    v_id,v_rest.organization_id,p_restaurant_id,v_provider,v_mode,v_env,v_status,
    nullif(left(trim(coalesce(p_merchant_reference,'')),180),''),
    case when jsonb_typeof(p_public_config)='object' then p_public_config else '{}'::jsonb end,
    nullif(left(trim(coalesce(p_notes,'')),1000),''),
    p_actor_user_id,p_actor_user_id
  )
  on conflict(id) do update set
    provider=excluded.provider,integration_mode=excluded.integration_mode,environment=excluded.environment,
    status=excluded.status,merchant_reference=excluded.merchant_reference,
    public_config=excluded.public_config,notes=excluded.notes,updated_by=p_actor_user_id
  where public.pos_provider_connections.restaurant_id=p_restaurant_id
  returning * into v_row;

  if not found then raise exception 'PROVIDER_CONNECTION_UPDATE_DENIED'; end if;

  insert into public.pos_event_log(
    client_event_id,organization_id,restaurant_id,actor_user_id,
    entity_type,entity_id,event_type,payload,occurred_at
  ) values(
    gen_random_uuid(),v_row.organization_id,v_row.restaurant_id,p_actor_user_id,
    'provider_connection',v_row.id,'pos.provider_connection.updated',
    jsonb_build_object('provider',v_row.provider,'mode',v_row.integration_mode,'environment',v_row.environment,'status',v_row.status),
    now()
  );

  return jsonb_build_object(
    'id',v_row.id,'provider',v_row.provider,'integration_mode',v_row.integration_mode,
    'environment',v_row.environment,'status',v_row.status,
    'merchant_reference',v_row.merchant_reference,'public_config',v_row.public_config,
    'secret_version',v_row.secret_version,'notes',v_row.notes,'updated_at',v_row.updated_at
  );
end;
$$;
