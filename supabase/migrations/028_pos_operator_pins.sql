-- ReMaPro POS v0.17: operator PIN profiles, short-lived sessions and action audit.
create table if not exists public.pos_operators (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  employee_id uuid references public.employees(id) on delete set null,
  display_name text not null,
  role text not null check (role in ('manager','cashier','server','bar','kitchen')),
  pin_hash text not null,
  permissions jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  last_login_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(restaurant_id,display_name)
);
create table if not exists public.pos_operator_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  operator_id uuid not null references public.pos_operators(id) on delete cascade,
  device_id uuid references public.pos_devices(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.pos_operator_audit (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  operator_id uuid not null references public.pos_operators(id) on delete restrict,
  device_id uuid references public.pos_devices(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists pos_operators_restaurant_idx on public.pos_operators(restaurant_id,active,display_name);
create index if not exists pos_operators_user_idx on public.pos_operators(user_id) where user_id is not null;
create index if not exists pos_operator_sessions_lookup_idx on public.pos_operator_sessions(restaurant_id,token_hash,expires_at) where revoked_at is null;
create index if not exists pos_operator_sessions_operator_idx on public.pos_operator_sessions(operator_id,device_id);
create index if not exists pos_operator_audit_restaurant_idx on public.pos_operator_audit(restaurant_id,created_at desc);
create index if not exists pos_operator_audit_operator_idx on public.pos_operator_audit(operator_id,created_at desc);
drop trigger if exists pos_operators_updated_at on public.pos_operators;
create trigger pos_operators_updated_at before update on public.pos_operators for each row execute function public.set_updated_at();
alter table public.pos_operators enable row level security;
alter table public.pos_operator_sessions enable row level security;
alter table public.pos_operator_audit enable row level security;
revoke all on public.pos_operators from anon;
revoke all on public.pos_operator_sessions from anon,authenticated;
revoke all on public.pos_operator_audit from anon;
revoke insert,update,delete on public.pos_operators from authenticated;
revoke insert,update,delete on public.pos_operator_audit from authenticated;
grant select on public.pos_operators to authenticated;
grant select on public.pos_operator_audit to authenticated;
drop policy if exists pos_operators_select on public.pos_operators;
create policy pos_operators_select on public.pos_operators for select to authenticated using (public.is_restaurant_member(restaurant_id));
drop policy if exists pos_operator_audit_select on public.pos_operator_audit;
create policy pos_operator_audit_select on public.pos_operator_audit for select to authenticated using (public.is_restaurant_admin(restaurant_id));

CREATE OR REPLACE FUNCTION public.pos_log_operator_action(p_restaurant_id uuid, p_token text, p_actor_user_id uuid, p_action text, p_entity_type text, p_entity_id uuid, p_metadata jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_auth jsonb;
  v_operator_id uuid;
  v_session_id uuid;
  v_device_id uuid;
  v_rest public.restaurants%rowtype;
begin
  v_auth:=public.pos_operator_authorize(p_restaurant_id,p_token,'',p_actor_user_id);
  if coalesce((v_auth->>'required')::boolean,false)=false then return true; end if;
  if coalesce((v_auth->>'authorized')::boolean,false)=false then return false; end if;
  v_operator_id:=(v_auth->'operator'->>'id')::uuid;
  v_session_id:=(v_auth->'operator'->>'sessionId')::uuid;
  select device_id into v_device_id from public.pos_operator_sessions where id=v_session_id;
  select * into v_rest from public.restaurants where id=p_restaurant_id;

  insert into public.pos_operator_audit(
    organization_id,restaurant_id,operator_id,device_id,action,entity_type,entity_id,metadata
  ) values(
    v_rest.organization_id,p_restaurant_id,v_operator_id,v_device_id,
    left(trim(coalesce(p_action,'')),120),nullif(left(trim(coalesce(p_entity_type,'')),80),''),
    p_entity_id,case when jsonb_typeof(p_metadata)='object' then p_metadata else '{}'::jsonb end
  );
  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.pos_operator_authorize(p_restaurant_id uuid, p_token text, p_permission text, p_actor_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_rest public.restaurants%rowtype;
  v_required boolean:=false;
  v_op public.pos_operators%rowtype;
  v_session public.pos_operator_sessions%rowtype;
  v_allowed boolean:=false;
begin
  select * into v_rest from public.restaurants where id=p_restaurant_id and active=true;
  if not found then raise exception 'RESTAURANT_NOT_FOUND'; end if;
  if not public.pos_actor_has_access(p_actor_user_id,v_rest.organization_id,p_restaurant_id) then raise exception 'POS_ACCESS_DENIED'; end if;

  select exists(select 1 from public.pos_operators where restaurant_id=p_restaurant_id and active=true) into v_required;
  if not v_required then
    return jsonb_build_object('required',false,'authorized',true,'operator',null);
  end if;
  if trim(coalesce(p_token,''))='' then
    return jsonb_build_object('required',true,'authorized',false,'error','OPERATOR_REQUIRED');
  end if;

  select s.* into v_session
  from public.pos_operator_sessions s
  where s.restaurant_id=p_restaurant_id
    and s.token_hash=encode(digest(trim(p_token),'sha256'),'hex')
    and s.revoked_at is null and s.expires_at>now()
  order by s.created_at desc limit 1;
  if not found then
    return jsonb_build_object('required',true,'authorized',false,'error','OPERATOR_SESSION_INVALID');
  end if;

  select * into v_op from public.pos_operators where id=v_session.operator_id and active=true;
  if not found then
    return jsonb_build_object('required',true,'authorized',false,'error','OPERATOR_INACTIVE');
  end if;

  v_allowed:=v_op.role='manager'
    or trim(coalesce(p_permission,''))=''
    or coalesce((v_op.permissions->>p_permission)::boolean,false);

  update public.pos_operator_sessions set last_seen_at=now() where id=v_session.id;

  return jsonb_build_object(
    'required',true,'authorized',v_allowed,
    'error',case when v_allowed then null else 'OPERATOR_PERMISSION_DENIED' end,
    'operator',jsonb_build_object(
      'id',v_op.id,'display_name',v_op.display_name,'role',v_op.role,
      'permissions',v_op.permissions,'sessionId',v_session.id,'expiresAt',v_session.expires_at
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.pos_operator_default_permissions(p_role text)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case lower(coalesce(p_role,''))
    when 'manager' then '{"sale":true,"cash":true,"refund":true,"cancel":true,"transfer":true,"production":true,"settings":true}'::jsonb
    when 'cashier' then '{"sale":true,"cash":true,"refund":true,"cancel":false,"transfer":true,"production":false,"settings":false}'::jsonb
    when 'server' then '{"sale":true,"cash":false,"refund":false,"cancel":false,"transfer":true,"production":true,"settings":false}'::jsonb
    when 'bar' then '{"sale":false,"cash":false,"refund":false,"cancel":false,"transfer":false,"production":true,"settings":false}'::jsonb
    when 'kitchen' then '{"sale":false,"cash":false,"refund":false,"cancel":false,"transfer":false,"production":true,"settings":false}'::jsonb
    else '{}'::jsonb
  end;
$function$;

CREATE OR REPLACE FUNCTION public.pos_operator_login(p_restaurant_id uuid, p_operator_id uuid, p_pin text, p_device_id uuid, p_actor_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_op public.pos_operators%rowtype;
  v_rest public.restaurants%rowtype;
  v_token text;
  v_expires timestamptz:=now()+interval '12 hours';
begin
  select * into v_rest from public.restaurants where id=p_restaurant_id and active=true;
  if not found then raise exception 'RESTAURANT_NOT_FOUND'; end if;
  if not public.pos_actor_has_access(p_actor_user_id,v_rest.organization_id,p_restaurant_id) then raise exception 'POS_ACCESS_DENIED'; end if;
  if p_device_id is not null and not exists(select 1 from public.pos_devices where id=p_device_id and restaurant_id=p_restaurant_id and active=true) then raise exception 'POS_DEVICE_INVALID'; end if;

  select * into v_op from public.pos_operators
  where id=p_operator_id and restaurant_id=p_restaurant_id and active=true
  for update;
  if not found then raise exception 'OPERATOR_NOT_FOUND'; end if;
  if crypt(trim(coalesce(p_pin,'')),v_op.pin_hash)<>v_op.pin_hash then raise exception 'INVALID_OPERATOR_PIN'; end if;

  update public.pos_operator_sessions
  set revoked_at=now()
  where operator_id=v_op.id and device_id is not distinct from p_device_id
    and revoked_at is null and expires_at>now();

  v_token:=encode(gen_random_bytes(32),'hex');
  insert into public.pos_operator_sessions(
    organization_id,restaurant_id,operator_id,device_id,token_hash,expires_at
  ) values(
    v_op.organization_id,v_op.restaurant_id,v_op.id,p_device_id,
    encode(digest(v_token,'sha256'),'hex'),v_expires
  );

  update public.pos_operators set last_login_at=now() where id=v_op.id;

  return jsonb_build_object(
    'token',v_token,'expiresAt',v_expires,
    'operator',jsonb_build_object(
      'id',v_op.id,'display_name',v_op.display_name,'role',v_op.role,
      'permissions',v_op.permissions,'active',v_op.active
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.pos_operator_logout(p_restaurant_id uuid, p_token text, p_actor_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_rest public.restaurants%rowtype;
begin
  select * into v_rest from public.restaurants where id=p_restaurant_id and active=true;
  if not found then raise exception 'RESTAURANT_NOT_FOUND'; end if;
  if not public.pos_actor_has_access(p_actor_user_id,v_rest.organization_id,p_restaurant_id) then raise exception 'POS_ACCESS_DENIED'; end if;
  update public.pos_operator_sessions
  set revoked_at=now()
  where restaurant_id=p_restaurant_id
    and token_hash=encode(digest(trim(coalesce(p_token,'')),'sha256'),'hex')
    and revoked_at is null;
  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.pos_upsert_operator(p_operator_id uuid, p_restaurant_id uuid, p_user_id uuid, p_employee_id uuid, p_display_name text, p_role text, p_pin text, p_active boolean, p_permissions jsonb, p_actor_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_rest public.restaurants%rowtype;
  v_row public.pos_operators%rowtype;
  v_id uuid:=coalesce(p_operator_id,gen_random_uuid());
  v_name text:=left(trim(coalesce(p_display_name,'')),120);
  v_role text:=lower(trim(coalesce(p_role,'')));
  v_pin text:=trim(coalesce(p_pin,''));
  v_hash text;
  v_permissions jsonb;
begin
  select * into v_rest from public.restaurants where id=p_restaurant_id and active=true;
  if not found then raise exception 'RESTAURANT_NOT_FOUND'; end if;
  if not public.pos_actor_is_manager(p_actor_user_id,v_rest.organization_id,p_restaurant_id) then
    raise exception 'MANAGER_ACCESS_REQUIRED';
  end if;
  if v_name='' then raise exception 'OPERATOR_NAME_REQUIRED'; end if;
  if v_role not in ('manager','cashier','server','bar','kitchen') then raise exception 'INVALID_OPERATOR_ROLE'; end if;
  if p_user_id is not null and not exists(select 1 from auth.users where id=p_user_id) then raise exception 'USER_NOT_FOUND'; end if;
  if p_employee_id is not null and not exists(select 1 from public.employees where id=p_employee_id and restaurant_id=p_restaurant_id) then raise exception 'EMPLOYEE_NOT_FOUND'; end if;

  select pin_hash into v_hash from public.pos_operators where id=v_id and restaurant_id=p_restaurant_id;
  if v_pin<>'' then
    if v_pin !~ '^[0-9]{4,8}$' then raise exception 'PIN_MUST_BE_4_TO_8_DIGITS'; end if;
    v_hash:=crypt(v_pin,gen_salt('bf',10));
  elsif v_hash is null then
    raise exception 'PIN_REQUIRED';
  end if;

  v_permissions:=case
    when p_permissions is null or p_permissions='{}'::jsonb then public.pos_operator_default_permissions(v_role)
    else p_permissions
  end;

  insert into public.pos_operators(
    id,organization_id,restaurant_id,user_id,employee_id,display_name,role,pin_hash,
    permissions,active,created_by,updated_by
  ) values(
    v_id,v_rest.organization_id,p_restaurant_id,p_user_id,p_employee_id,v_name,v_role,v_hash,
    v_permissions,coalesce(p_active,true),p_actor_user_id,p_actor_user_id
  )
  on conflict(id) do update set
    user_id=excluded.user_id,employee_id=excluded.employee_id,display_name=excluded.display_name,
    role=excluded.role,pin_hash=v_hash,permissions=excluded.permissions,active=excluded.active,
    updated_by=p_actor_user_id
  where public.pos_operators.restaurant_id=p_restaurant_id
  returning * into v_row;

  if not found then raise exception 'OPERATOR_UPDATE_DENIED'; end if;

  return jsonb_build_object(
    'id',v_row.id,'restaurant_id',v_row.restaurant_id,'user_id',v_row.user_id,
    'employee_id',v_row.employee_id,'display_name',v_row.display_name,'role',v_row.role,
    'permissions',v_row.permissions,'active',v_row.active,'last_login_at',v_row.last_login_at
  );
end;
$function$;



revoke all on function public.pos_operator_default_permissions(text) from public,anon,authenticated;
revoke all on function public.pos_upsert_operator(uuid,uuid,uuid,uuid,text,text,text,boolean,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.pos_operator_login(uuid,uuid,text,uuid,uuid) from public,anon,authenticated;
revoke all on function public.pos_operator_authorize(uuid,text,text,uuid) from public,anon,authenticated;
revoke all on function public.pos_operator_logout(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.pos_log_operator_action(uuid,text,uuid,text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pos_operator_default_permissions(text) to service_role;
grant execute on function public.pos_upsert_operator(uuid,uuid,uuid,uuid,text,text,text,boolean,jsonb,uuid) to service_role;
grant execute on function public.pos_operator_login(uuid,uuid,text,uuid,uuid) to service_role;
grant execute on function public.pos_operator_authorize(uuid,text,text,uuid) to service_role;
grant execute on function public.pos_operator_logout(uuid,text,uuid) to service_role;
grant execute on function public.pos_log_operator_action(uuid,text,uuid,text,text,uuid,jsonb) to service_role;
