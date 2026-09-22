-- ReMaPro POS v0.13: payment terminal profiles and provider-confirmed payment/refund intents.
create table if not exists public.pos_payment_terminals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  device_id uuid references public.pos_devices(id) on delete set null,
  label text not null,
  provider text not null check (provider in ('worldline','twint','generic')),
  integration_mode text not null default 'cloud' check (integration_mode in ('cloud','external_app','local_network')),
  external_terminal_id text,
  currency text not null default 'CHF',
  supports_card boolean not null default true,
  supports_twint boolean not null default false,
  supports_tips boolean not null default true,
  supports_refunds boolean not null default true,
  active boolean not null default false,
  connection_status text not null default 'not_configured'
    check (connection_status in ('not_configured','configured','online','offline','error')),
  public_config jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(restaurant_id,label)
);

create table if not exists public.pos_payment_intents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null references public.pos_orders(id) on delete restrict,
  refund_id uuid references public.pos_refunds(id) on delete restrict,
  payment_id uuid references public.pos_payments(id) on delete set null,
  cash_session_id uuid references public.pos_cash_sessions(id) on delete restrict,
  device_id uuid references public.pos_devices(id) on delete set null,
  terminal_id uuid not null references public.pos_payment_terminals(id) on delete restrict,
  client_event_id uuid not null unique,
  kind text not null check (kind in ('payment','refund')),
  method text not null check (method in ('card','twint')),
  amount numeric(14,2) not null check (amount > 0),
  tip_amount numeric(14,2) not null default 0 check (tip_amount >= 0),
  currency text not null default 'CHF',
  status text not null default 'created'
    check (status in ('created','pending','authorized','captured','failed','cancelled','expired')),
  provider text not null,
  provider_reference text,
  provider_status text,
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  completed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists pos_payment_terminals_restaurant_idx on public.pos_payment_terminals(restaurant_id,active,connection_status);
create index if not exists pos_payment_terminals_device_idx on public.pos_payment_terminals(device_id);
create index if not exists pos_payment_intents_order_idx on public.pos_payment_intents(order_id,status,created_at desc);
create index if not exists pos_payment_intents_terminal_idx on public.pos_payment_intents(terminal_id,status,created_at desc);
create index if not exists pos_payment_intents_refund_idx on public.pos_payment_intents(refund_id) where refund_id is not null;
create index if not exists pos_payment_intents_provider_ref_idx on public.pos_payment_intents(provider,provider_reference) where provider_reference is not null;

drop trigger if exists pos_payment_terminals_updated_at on public.pos_payment_terminals;
create trigger pos_payment_terminals_updated_at before update on public.pos_payment_terminals for each row execute function public.set_updated_at();
drop trigger if exists pos_payment_intents_updated_at on public.pos_payment_intents;
create trigger pos_payment_intents_updated_at before update on public.pos_payment_intents for each row execute function public.set_updated_at();

alter table public.pos_payment_terminals enable row level security;
alter table public.pos_payment_intents enable row level security;
revoke all on public.pos_payment_terminals from anon;
revoke all on public.pos_payment_intents from anon;
revoke insert,update,delete on public.pos_payment_terminals from authenticated;
revoke insert,update,delete on public.pos_payment_intents from authenticated;
grant select on public.pos_payment_terminals to authenticated;
grant select on public.pos_payment_intents to authenticated;
drop policy if exists pos_payment_terminals_select on public.pos_payment_terminals;
create policy pos_payment_terminals_select on public.pos_payment_terminals for select to authenticated using (public.is_restaurant_member(restaurant_id));
drop policy if exists pos_payment_intents_select on public.pos_payment_intents;
create policy pos_payment_intents_select on public.pos_payment_intents for select to authenticated using (public.is_restaurant_member(restaurant_id));

CREATE OR REPLACE FUNCTION public.pos_actor_is_manager(p_actor uuid, p_organization uuid, p_restaurant uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists(
    select 1
    from public.memberships m
    where m.user_id=p_actor
      and m.organization_id=p_organization
      and m.active=true
      and m.role in ('network_admin','network_manager','restaurant_admin','director','manager')
      and (m.restaurant_id is null or m.restaurant_id=p_restaurant)
  );
$function$;

CREATE OR REPLACE FUNCTION public.pos_cancel_payment_intent(p_intent_id uuid, p_actor_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_intent public.pos_payment_intents%rowtype;
begin
  select * into v_intent from public.pos_payment_intents where id=p_intent_id for update;
  if not found then raise exception 'PAYMENT_INTENT_NOT_FOUND'; end if;
  if not public.pos_actor_has_access(p_actor_user_id,v_intent.organization_id,v_intent.restaurant_id) then raise exception 'POS_ACCESS_DENIED'; end if;
  if v_intent.status='cancelled' then return jsonb_build_object('ok',true,'idempotent',true,'intent',to_jsonb(v_intent)); end if;
  if v_intent.status not in ('created','pending','authorized') then raise exception 'PAYMENT_INTENT_NOT_CANCELLABLE'; end if;

  update public.pos_payment_intents
  set status='cancelled',completed_by=p_actor_user_id,completed_at=now()
  where id=p_intent_id
  returning * into v_intent;

  return jsonb_build_object('ok',true,'idempotent',false,'intent',to_jsonb(v_intent));
end;
$function$;

CREATE OR REPLACE FUNCTION public.pos_create_payment_intent(p_order_id uuid, p_client_event_id uuid, p_terminal_id uuid, p_device_id uuid, p_cash_session_id uuid, p_method text, p_amount numeric, p_tip_amount numeric, p_actor_user_id uuid, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order public.pos_orders%rowtype;
  v_terminal public.pos_payment_terminals%rowtype;
  v_session public.pos_cash_sessions%rowtype;
  v_row public.pos_payment_intents%rowtype;
  v_method text:=lower(trim(coalesce(p_method,'')));
  v_amount numeric(14,2):=round(coalesce(p_amount,0),2);
  v_tip numeric(14,2):=round(coalesce(p_tip_amount,0),2);
  v_captured numeric(14,2):=0;
  v_remaining numeric(14,2):=0;
begin
  select * into v_row from public.pos_payment_intents where client_event_id=p_client_event_id;
  if found then return jsonb_build_object('ok',true,'idempotent',true,'intent',to_jsonb(v_row)); end if;

  select * into v_order from public.pos_orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if not public.pos_actor_has_access(p_actor_user_id,v_order.organization_id,v_order.restaurant_id) then
    raise exception 'POS_ACCESS_DENIED';
  end if;
  if v_order.status not in ('open','sent','preparing','served') then raise exception 'ORDER_NOT_PAYABLE'; end if;

  select * into v_terminal from public.pos_payment_terminals where id=p_terminal_id for update;
  if not found or v_terminal.restaurant_id<>v_order.restaurant_id or not v_terminal.active then
    raise exception 'TERMINAL_NOT_AVAILABLE';
  end if;
  if v_terminal.connection_status not in ('configured','online') then raise exception 'TERMINAL_NOT_CONNECTED'; end if;
  if v_method='card' and not v_terminal.supports_card then raise exception 'TERMINAL_CARD_UNSUPPORTED'; end if;
  if v_method='twint' and not v_terminal.supports_twint then raise exception 'TERMINAL_TWINT_UNSUPPORTED'; end if;
  if v_method not in ('card','twint') then raise exception 'INVALID_TERMINAL_METHOD'; end if;
  if v_tip>0 and not v_terminal.supports_tips then raise exception 'TERMINAL_TIP_UNSUPPORTED'; end if;
  if v_amount<=0 or v_tip<0 then raise exception 'INVALID_PAYMENT_AMOUNT'; end if;
  if upper(v_order.currency)<>upper(v_terminal.currency) then raise exception 'TERMINAL_CURRENCY_MISMATCH'; end if;

  select * into v_session from public.pos_cash_sessions where id=p_cash_session_id for update;
  if not found or v_session.status<>'open' or v_session.restaurant_id<>v_order.restaurant_id then
    raise exception 'OPEN_CASH_SESSION_REQUIRED';
  end if;
  if not exists(select 1 from public.pos_devices d where d.id=p_device_id and d.restaurant_id=v_order.restaurant_id and d.active=true) then
    raise exception 'POS_DEVICE_INVALID';
  end if;

  if exists(
    select 1 from public.pos_payment_intents i
    where i.order_id=p_order_id and i.kind='payment'
      and i.status in ('created','pending','authorized')
  ) then raise exception 'ACTIVE_PAYMENT_INTENT_EXISTS'; end if;

  select coalesce(sum(amount),0)::numeric(14,2)
  into v_captured
  from public.pos_payments
  where order_id=p_order_id and status='captured';

  v_remaining:=round(v_order.total-v_captured,2);
  if v_remaining<=0 then raise exception 'ORDER_ALREADY_FUNDED'; end if;
  if abs(v_amount-v_remaining)>0.005 then raise exception 'TERMINAL_INTENT_MUST_MATCH_REMAINING_TOTAL'; end if;

  insert into public.pos_payment_intents(
    organization_id,restaurant_id,order_id,cash_session_id,device_id,terminal_id,
    client_event_id,kind,method,amount,tip_amount,currency,status,provider,metadata,created_by
  ) values(
    v_order.organization_id,v_order.restaurant_id,p_order_id,p_cash_session_id,p_device_id,p_terminal_id,
    p_client_event_id,'payment',v_method,v_amount,v_tip,v_order.currency,'created',v_terminal.provider,
    case when jsonb_typeof(p_metadata)='object' then p_metadata else '{}'::jsonb end,p_actor_user_id
  )
  returning * into v_row;

  insert into public.pos_event_log(
    client_event_id,organization_id,restaurant_id,device_id,actor_user_id,
    entity_type,entity_id,event_type,payload,occurred_at
  ) values(
    gen_random_uuid(),v_row.organization_id,v_row.restaurant_id,v_row.device_id,p_actor_user_id,
    'payment_intent',v_row.id,'pos.payment_intent.created',
    jsonb_build_object('orderId',p_order_id,'provider',v_row.provider,'method',v_row.method,'amount',v_row.amount,'tip',v_row.tip_amount),
    now()
  );

  return jsonb_build_object('ok',true,'idempotent',false,'intent',to_jsonb(v_row));
end;
$function$;

CREATE OR REPLACE FUNCTION public.pos_create_refund_intent(p_refund_id uuid, p_client_event_id uuid, p_terminal_id uuid, p_actor_user_id uuid, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ref public.pos_refunds%rowtype;
  v_order public.pos_orders%rowtype;
  v_terminal public.pos_payment_terminals%rowtype;
  v_row public.pos_payment_intents%rowtype;
begin
  select * into v_row from public.pos_payment_intents where client_event_id=p_client_event_id;
  if found then return jsonb_build_object('ok',true,'idempotent',true,'intent',to_jsonb(v_row)); end if;

  select * into v_ref from public.pos_refunds where id=p_refund_id for update;
  if not found then raise exception 'REFUND_NOT_FOUND'; end if;
  if v_ref.status<>'pending_external' then raise exception 'REFUND_NOT_PENDING_EXTERNAL'; end if;
  if v_ref.method not in ('card','twint') then raise exception 'REFUND_METHOD_NOT_TERMINAL'; end if;

  select * into v_order from public.pos_orders where id=v_ref.order_id;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if not public.pos_actor_has_access(p_actor_user_id,v_ref.organization_id,v_ref.restaurant_id) then
    raise exception 'POS_ACCESS_DENIED';
  end if;

  select * into v_terminal from public.pos_payment_terminals where id=p_terminal_id for update;
  if not found or v_terminal.restaurant_id<>v_ref.restaurant_id or not v_terminal.active then raise exception 'TERMINAL_NOT_AVAILABLE'; end if;
  if v_terminal.connection_status not in ('configured','online') then raise exception 'TERMINAL_NOT_CONNECTED'; end if;
  if not v_terminal.supports_refunds then raise exception 'TERMINAL_REFUNDS_UNSUPPORTED'; end if;
  if v_ref.method='card' and not v_terminal.supports_card then raise exception 'TERMINAL_CARD_UNSUPPORTED'; end if;
  if v_ref.method='twint' and not v_terminal.supports_twint then raise exception 'TERMINAL_TWINT_UNSUPPORTED'; end if;

  if exists(
    select 1 from public.pos_payment_intents i
    where i.refund_id=p_refund_id and i.kind='refund'
      and i.status in ('created','pending','authorized')
  ) then raise exception 'ACTIVE_REFUND_INTENT_EXISTS'; end if;

  insert into public.pos_payment_intents(
    organization_id,restaurant_id,order_id,refund_id,cash_session_id,device_id,terminal_id,
    client_event_id,kind,method,amount,tip_amount,currency,status,provider,metadata,created_by
  ) values(
    v_ref.organization_id,v_ref.restaurant_id,v_ref.order_id,v_ref.id,v_ref.cash_session_id,v_ref.device_id,p_terminal_id,
    p_client_event_id,'refund',v_ref.method,v_ref.amount,v_ref.tip_amount,v_order.currency,'created',v_terminal.provider,
    case when jsonb_typeof(p_metadata)='object' then p_metadata else '{}'::jsonb end,p_actor_user_id
  )
  returning * into v_row;

  return jsonb_build_object('ok',true,'idempotent',false,'intent',to_jsonb(v_row));
end;
$function$;

CREATE OR REPLACE FUNCTION public.pos_set_payment_terminal_connection(p_terminal_id uuid, p_status text, p_actor_user_id uuid, p_last_seen_at timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row public.pos_payment_terminals%rowtype;
  v_status text:=lower(trim(coalesce(p_status,'')));
begin
  select * into v_row from public.pos_payment_terminals where id=p_terminal_id for update;
  if not found then raise exception 'TERMINAL_NOT_FOUND'; end if;
  if not public.pos_actor_is_manager(p_actor_user_id,v_row.organization_id,v_row.restaurant_id) then
    raise exception 'MANAGER_ACCESS_REQUIRED';
  end if;
  if v_status not in ('not_configured','configured','online','offline','error') then
    raise exception 'INVALID_TERMINAL_STATUS';
  end if;

  update public.pos_payment_terminals
  set connection_status=v_status,
      last_seen_at=case when v_status in ('online','configured') then coalesce(p_last_seen_at,now()) else last_seen_at end,
      updated_by=p_actor_user_id
  where id=p_terminal_id
  returning * into v_row;

  return to_jsonb(v_row)-'public_config';
end;
$function$;

CREATE OR REPLACE FUNCTION public.pos_transition_payment_intent(p_intent_id uuid, p_status text, p_provider_reference text, p_provider_status text, p_error_code text, p_error_message text, p_actor_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_intent public.pos_payment_intents%rowtype;
  v_order public.pos_orders%rowtype;
  v_payment_id uuid;
  v_receipt_no bigint;
  v_receipt text;
  v_status text:=lower(trim(coalesce(p_status,'')));
  v_current text;
  v_allowed boolean:=false;
begin
  select * into v_intent from public.pos_payment_intents where id=p_intent_id for update;
  if not found then raise exception 'PAYMENT_INTENT_NOT_FOUND'; end if;
  if not public.pos_actor_has_access(p_actor_user_id,v_intent.organization_id,v_intent.restaurant_id) then
    raise exception 'POS_ACCESS_DENIED';
  end if;

  v_current:=v_intent.status;
  if v_current=v_status then return jsonb_build_object('ok',true,'idempotent',true,'intent',to_jsonb(v_intent)); end if;
  if v_current in ('captured','failed','cancelled','expired') then raise exception 'PAYMENT_INTENT_TERMINAL_STATE'; end if;

  v_allowed:=
    (v_current='created' and v_status in ('pending','authorized','failed','cancelled','expired'))
    or (v_current='pending' and v_status in ('authorized','captured','failed','cancelled','expired'))
    or (v_current='authorized' and v_status in ('captured','failed','cancelled','expired'));
  if not v_allowed then raise exception 'INVALID_PAYMENT_INTENT_TRANSITION'; end if;

  update public.pos_payment_intents
  set status=v_status,
      provider_reference=coalesce(nullif(left(trim(coalesce(p_provider_reference,'')),180),''),provider_reference),
      provider_status=nullif(left(trim(coalesce(p_provider_status,'')),120),''),
      error_code=nullif(left(trim(coalesce(p_error_code,'')),120),''),
      error_message=nullif(left(trim(coalesce(p_error_message,'')),500),''),
      completed_by=case when v_status in ('captured','failed','cancelled','expired') then p_actor_user_id else completed_by end,
      completed_at=case when v_status in ('captured','failed','cancelled','expired') then now() else completed_at end
  where id=p_intent_id
  returning * into v_intent;

  if v_status='captured' and v_intent.kind='payment' then
    select * into v_order from public.pos_orders where id=v_intent.order_id for update;
    if not found then raise exception 'ORDER_NOT_FOUND'; end if;
    if v_order.status in ('paid','refunded','cancelled') then raise exception 'ORDER_LOCKED'; end if;
    if exists(select 1 from public.pos_payments where order_id=v_order.id and status='captured') then
      raise exception 'ORDER_HAS_EXISTING_CAPTURED_PAYMENT';
    end if;

    v_receipt:=v_order.receipt_number;
    if v_receipt is null then
      insert into public.pos_receipt_counters(restaurant_id,business_date,last_number,updated_at)
      values(v_order.restaurant_id,v_order.business_date,1,now())
      on conflict(restaurant_id,business_date)
      do update set last_number=public.pos_receipt_counters.last_number+1,updated_at=now()
      returning last_number into v_receipt_no;
      v_receipt:=to_char(v_order.business_date,'YYYYMMDD')||'-'||lpad(v_receipt_no::text,6,'0');
    end if;

    v_payment_id:=gen_random_uuid();
    insert into public.pos_payments(
      id,order_id,device_id,method,provider,provider_reference,amount,tip_amount,
      status,paid_at,metadata,receipt_number,created_by
    ) values(
      v_payment_id,v_order.id,v_intent.device_id,v_intent.method,v_intent.provider,v_intent.provider_reference,
      v_intent.amount,v_intent.tip_amount,'captured',now(),
      jsonb_build_object('terminalIntentId',v_intent.id,'terminalId',v_intent.terminal_id,'integration','terminal'),
      v_receipt,p_actor_user_id
    );

    update public.pos_orders
    set device_id=v_intent.device_id,cash_session_id=v_intent.cash_session_id,status='paid',
        tip_total=v_intent.tip_amount,receipt_number=v_receipt,
        closed_by=p_actor_user_id,closed_at=now(),client_updated_at=now(),version=version+1
    where id=v_order.id;

    update public.pos_payment_intents set payment_id=v_payment_id where id=v_intent.id returning * into v_intent;
  elsif v_status='captured' and v_intent.kind='refund' then
    perform public.pos_confirm_external_refund(v_intent.refund_id,true,v_intent.provider_reference,p_actor_user_id);
  end if;

  insert into public.pos_event_log(
    client_event_id,organization_id,restaurant_id,device_id,actor_user_id,
    entity_type,entity_id,event_type,payload,occurred_at
  ) values(
    gen_random_uuid(),v_intent.organization_id,v_intent.restaurant_id,v_intent.device_id,p_actor_user_id,
    'payment_intent',v_intent.id,'pos.payment_intent.'||v_status,
    jsonb_build_object(
      'kind',v_intent.kind,'provider',v_intent.provider,'providerReference',v_intent.provider_reference,
      'amount',v_intent.amount,'tip',v_intent.tip_amount,'orderId',v_intent.order_id,'refundId',v_intent.refund_id
    ),now()
  );

  return jsonb_build_object('ok',true,'idempotent',false,'intent',to_jsonb(v_intent));
end;
$function$;

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
  if v_mode not in ('cloud','external_app','local_network') then raise exception 'INVALID_INTEGRATION_MODE'; end if;
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



revoke all on function public.pos_actor_is_manager(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.pos_upsert_payment_terminal(uuid,uuid,uuid,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.pos_set_payment_terminal_connection(uuid,text,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.pos_create_payment_intent(uuid,uuid,uuid,uuid,uuid,text,numeric,numeric,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.pos_create_refund_intent(uuid,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.pos_transition_payment_intent(uuid,text,text,text,text,text,uuid) from public,anon,authenticated;
revoke all on function public.pos_cancel_payment_intent(uuid,uuid) from public,anon,authenticated;
grant execute on function public.pos_actor_is_manager(uuid,uuid,uuid) to service_role;
grant execute on function public.pos_upsert_payment_terminal(uuid,uuid,uuid,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,jsonb,uuid) to service_role;
grant execute on function public.pos_set_payment_terminal_connection(uuid,text,uuid,timestamptz) to service_role;
grant execute on function public.pos_create_payment_intent(uuid,uuid,uuid,uuid,uuid,text,numeric,numeric,uuid,jsonb) to service_role;
grant execute on function public.pos_create_refund_intent(uuid,uuid,uuid,uuid,jsonb) to service_role;
grant execute on function public.pos_transition_payment_intent(uuid,text,text,text,text,text,uuid) to service_role;
grant execute on function public.pos_cancel_payment_intent(uuid,uuid) to service_role;
