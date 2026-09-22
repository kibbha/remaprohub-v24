-- ReMaPro POS v0.20: payment-provider readiness registry.
-- Stores only non-secret configuration. Provider credentials stay server-side.

create table if not exists public.pos_provider_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  provider text not null check (provider in ('worldline','twint')),
  integration_mode text not null check (integration_mode in ('terminal_api_cloud','tim','direct','terminal_psp')),
  environment text not null default 'test' check (environment in ('test','live')),
  status text not null default 'not_configured'
    check (status in ('not_configured','waiting_contract','credentials_pending','ready_for_adapter','disabled')),
  merchant_reference text,
  public_config jsonb not null default '{}'::jsonb,
  secret_version integer not null default 0,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(restaurant_id,provider,integration_mode,environment)
);

create index if not exists pos_provider_connections_restaurant_idx
  on public.pos_provider_connections(restaurant_id,provider,status);

drop trigger if exists pos_provider_connections_updated_at on public.pos_provider_connections;
create trigger pos_provider_connections_updated_at
before update on public.pos_provider_connections
for each row execute function public.set_updated_at();

alter table public.pos_provider_connections enable row level security;
revoke all on public.pos_provider_connections from anon;
revoke insert,update,delete on public.pos_provider_connections from authenticated;
grant select on public.pos_provider_connections to authenticated;

drop policy if exists pos_provider_connections_select on public.pos_provider_connections;
create policy pos_provider_connections_select on public.pos_provider_connections
for select to authenticated using (public.is_restaurant_admin(restaurant_id));

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
  if v_provider='worldline' and v_mode not in ('terminal_api_cloud','tim') then raise exception 'INVALID_WORLDLINE_MODE'; end if;
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

revoke all on function public.pos_upsert_provider_connection(uuid,uuid,text,text,text,text,text,jsonb,text,uuid)
from public,anon,authenticated;
grant execute on function public.pos_upsert_provider_connection(uuid,uuid,text,text,text,text,text,jsonb,text,uuid)
to service_role;
