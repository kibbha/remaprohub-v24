-- ReMaPro AI monthly customer budget: CHF 15 per establishment.
-- Server-only ledger. Customer-facing AI calls reserve budget before any provider call,
-- then commit measured token cost afterwards. Internal training/simulation is excluded.

create table if not exists public.ai_usage_months (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  period_start date not null,
  budget_micros bigint not null default 15000000 check (budget_micros >= 0),
  spent_micros bigint not null default 0 check (spent_micros >= 0),
  reserved_micros bigint not null default 0 check (reserved_micros >= 0),
  updated_at timestamptz not null default now(),
  primary key (restaurant_id, period_start),
  check (spent_micros <= budget_micros),
  check (reserved_micros <= budget_micros),
  check (spent_micros + reserved_micros <= budget_micros)
);

create index if not exists ai_usage_months_org_period_idx
  on public.ai_usage_months(organization_id, period_start desc);

create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  period_start date not null,
  source text not null,
  model text not null default '',
  status text not null default 'reserved' check (status in ('reserved','committed','released','blocked')),
  reserved_micros bigint not null default 0 check (reserved_micros >= 0),
  actual_micros bigint not null default 0 check (actual_micros >= 0),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  cached_input_tokens bigint not null default 0 check (cached_input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  committed_at timestamptz
);

create index if not exists ai_usage_events_restaurant_period_idx
  on public.ai_usage_events(restaurant_id, period_start desc, created_at desc);
create index if not exists ai_usage_events_org_created_idx
  on public.ai_usage_events(organization_id, created_at desc);
create index if not exists ai_usage_events_source_created_idx
  on public.ai_usage_events(source, created_at desc);

alter table public.ai_usage_months enable row level security;
alter table public.ai_usage_events enable row level security;
revoke all on public.ai_usage_months, public.ai_usage_events from public, anon, authenticated;
grant all on public.ai_usage_months, public.ai_usage_events to service_role;

create or replace function public.ai_budget_period_start(p_timezone text)
returns date
language plpgsql
stable
set search_path=pg_catalog,public
as $$
declare v_timezone text:=coalesce(nullif(trim(p_timezone),''),'Europe/Zurich');
begin
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=v_timezone) then
    v_timezone:='Europe/Zurich';
  end if;
  return date_trunc('month', timezone(v_timezone, now()))::date;
end;
$$;
revoke all on function public.ai_budget_period_start(text) from public, anon, authenticated;
grant execute on function public.ai_budget_period_start(text) to service_role;

create or replace function public.ai_budget_status(p_organization_id uuid,p_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_timezone text;
  v_period date;
  v_row public.ai_usage_months%rowtype;
begin
  select coalesce(nullif(r.timezone,''),'Europe/Zurich') into v_timezone
  from public.restaurants r
  where r.id=p_restaurant_id and r.organization_id=p_organization_id and r.active=true;
  if not found then raise exception 'AI_RESTAURANT_NOT_FOUND'; end if;
  v_period:=public.ai_budget_period_start(v_timezone);

  insert into public.ai_usage_months(organization_id,restaurant_id,period_start)
  values(p_organization_id,p_restaurant_id,v_period)
  on conflict(restaurant_id,period_start) do nothing;

  select * into v_row from public.ai_usage_months
  where restaurant_id=p_restaurant_id and period_start=v_period;

  return jsonb_build_object(
    'periodStart',v_period,
    'budgetMicros',v_row.budget_micros,
    'spentMicros',v_row.spent_micros,
    'reservedMicros',v_row.reserved_micros,
    'remainingMicros',greatest(0,v_row.budget_micros-v_row.spent_micros-v_row.reserved_micros),
    'budgetChf',round(v_row.budget_micros::numeric/1000000,2),
    'spentChf',round(v_row.spent_micros::numeric/1000000,4),
    'reservedChf',round(v_row.reserved_micros::numeric/1000000,4),
    'remainingChf',round(greatest(0,v_row.budget_micros-v_row.spent_micros-v_row.reserved_micros)::numeric/1000000,4)
  );
end;
$$;
revoke all on function public.ai_budget_status(uuid,uuid) from public, anon, authenticated;
grant execute on function public.ai_budget_status(uuid,uuid) to service_role;

create or replace function public.ai_budget_reserve(
  p_organization_id uuid,
  p_restaurant_id uuid,
  p_source text,
  p_reserve_micros bigint,
  p_model text default '',
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_timezone text;
  v_period date;
  v_row public.ai_usage_months%rowtype;
  v_event_id uuid:=gen_random_uuid();
  v_reserve bigint:=greatest(1,coalesce(p_reserve_micros,0));
begin
  select coalesce(nullif(r.timezone,''),'Europe/Zurich') into v_timezone
  from public.restaurants r
  where r.id=p_restaurant_id and r.organization_id=p_organization_id and r.active=true;
  if not found then raise exception 'AI_RESTAURANT_NOT_FOUND'; end if;
  v_period:=public.ai_budget_period_start(v_timezone);

  insert into public.ai_usage_months(organization_id,restaurant_id,period_start)
  values(p_organization_id,p_restaurant_id,v_period)
  on conflict(restaurant_id,period_start) do nothing;

  select * into v_row from public.ai_usage_months
  where restaurant_id=p_restaurant_id and period_start=v_period
  for update;

  if v_row.spent_micros+v_row.reserved_micros+v_reserve>v_row.budget_micros then
    insert into public.ai_usage_events(
      id,organization_id,restaurant_id,period_start,source,model,status,reserved_micros,metadata
    ) values(
      v_event_id,p_organization_id,p_restaurant_id,v_period,left(coalesce(p_source,'unknown'),80),
      left(coalesce(p_model,''),120),'blocked',0,coalesce(p_metadata,'{}'::jsonb)
    );
    return jsonb_build_object(
      'allowed',false,'reservationId',v_event_id,'periodStart',v_period,
      'budgetMicros',v_row.budget_micros,'spentMicros',v_row.spent_micros,
      'reservedMicros',v_row.reserved_micros,
      'remainingMicros',greatest(0,v_row.budget_micros-v_row.spent_micros-v_row.reserved_micros)
    );
  end if;

  update public.ai_usage_months
  set reserved_micros=reserved_micros+v_reserve,updated_at=now()
  where restaurant_id=p_restaurant_id and period_start=v_period
  returning * into v_row;

  insert into public.ai_usage_events(
    id,organization_id,restaurant_id,period_start,source,model,status,reserved_micros,metadata
  ) values(
    v_event_id,p_organization_id,p_restaurant_id,v_period,left(coalesce(p_source,'unknown'),80),
    left(coalesce(p_model,''),120),'reserved',v_reserve,coalesce(p_metadata,'{}'::jsonb)
  );

  return jsonb_build_object(
    'allowed',true,'reservationId',v_event_id,'periodStart',v_period,
    'budgetMicros',v_row.budget_micros,'spentMicros',v_row.spent_micros,
    'reservedMicros',v_row.reserved_micros,
    'remainingMicros',greatest(0,v_row.budget_micros-v_row.spent_micros-v_row.reserved_micros)
  );
end;
$$;
revoke all on function public.ai_budget_reserve(uuid,uuid,text,bigint,text,jsonb) from public, anon, authenticated;
grant execute on function public.ai_budget_reserve(uuid,uuid,text,bigint,text,jsonb) to service_role;

create or replace function public.ai_budget_commit(
  p_reservation_id uuid,
  p_actual_micros bigint,
  p_input_tokens bigint default 0,
  p_cached_input_tokens bigint default 0,
  p_output_tokens bigint default 0,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_event public.ai_usage_events%rowtype;
  v_month public.ai_usage_months%rowtype;
  v_actual bigint:=greatest(0,coalesce(p_actual_micros,0));
begin
  select * into v_event from public.ai_usage_events where id=p_reservation_id for update;
  if not found then raise exception 'AI_RESERVATION_NOT_FOUND'; end if;
  if v_event.status='committed' then
    return public.ai_budget_status(v_event.organization_id,v_event.restaurant_id)||jsonb_build_object('idempotent',true);
  end if;
  if v_event.status<>'reserved' then raise exception 'AI_RESERVATION_NOT_ACTIVE'; end if;

  -- Every caller must reserve a conservative upper bound before invoking the provider.
  if v_actual>v_event.reserved_micros then raise exception 'AI_COST_EXCEEDED_RESERVATION'; end if;

  select * into v_month from public.ai_usage_months
  where restaurant_id=v_event.restaurant_id and period_start=v_event.period_start
  for update;

  update public.ai_usage_months
  set reserved_micros=greatest(0,reserved_micros-v_event.reserved_micros),
      spent_micros=spent_micros+v_actual,
      updated_at=now()
  where restaurant_id=v_event.restaurant_id and period_start=v_event.period_start
  returning * into v_month;

  update public.ai_usage_events
  set status='committed',actual_micros=v_actual,
      input_tokens=greatest(0,coalesce(p_input_tokens,0)),
      cached_input_tokens=greatest(0,coalesce(p_cached_input_tokens,0)),
      output_tokens=greatest(0,coalesce(p_output_tokens,0)),
      metadata=coalesce(metadata,'{}'::jsonb)||coalesce(p_metadata,'{}'::jsonb),
      committed_at=now()
  where id=p_reservation_id;

  return jsonb_build_object(
    'periodStart',v_event.period_start,'budgetMicros',v_month.budget_micros,
    'spentMicros',v_month.spent_micros,'reservedMicros',v_month.reserved_micros,
    'remainingMicros',greatest(0,v_month.budget_micros-v_month.spent_micros-v_month.reserved_micros),
    'budgetChf',round(v_month.budget_micros::numeric/1000000,2),
    'spentChf',round(v_month.spent_micros::numeric/1000000,4),
    'remainingChf',round(greatest(0,v_month.budget_micros-v_month.spent_micros-v_month.reserved_micros)::numeric/1000000,4)
  );
end;
$$;
revoke all on function public.ai_budget_commit(uuid,bigint,bigint,bigint,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.ai_budget_commit(uuid,bigint,bigint,bigint,bigint,jsonb) to service_role;

create or replace function public.ai_budget_release(
  p_reservation_id uuid,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_event public.ai_usage_events%rowtype;
  v_month public.ai_usage_months%rowtype;
begin
  select * into v_event from public.ai_usage_events where id=p_reservation_id for update;
  if not found then raise exception 'AI_RESERVATION_NOT_FOUND'; end if;
  if v_event.status='released' then
    return public.ai_budget_status(v_event.organization_id,v_event.restaurant_id)||jsonb_build_object('idempotent',true);
  end if;
  if v_event.status<>'reserved' then raise exception 'AI_RESERVATION_NOT_ACTIVE'; end if;

  update public.ai_usage_months
  set reserved_micros=greatest(0,reserved_micros-v_event.reserved_micros),updated_at=now()
  where restaurant_id=v_event.restaurant_id and period_start=v_event.period_start
  returning * into v_month;

  update public.ai_usage_events
  set status='released',metadata=coalesce(metadata,'{}'::jsonb)||coalesce(p_metadata,'{}'::jsonb),committed_at=now()
  where id=p_reservation_id;

  return jsonb_build_object(
    'periodStart',v_event.period_start,'budgetMicros',v_month.budget_micros,
    'spentMicros',v_month.spent_micros,'reservedMicros',v_month.reserved_micros,
    'remainingMicros',greatest(0,v_month.budget_micros-v_month.spent_micros-v_month.reserved_micros)
  );
end;
$$;
revoke all on function public.ai_budget_release(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.ai_budget_release(uuid,jsonb) to service_role;

update public.subscription_plans
set features=jsonb_set(coalesce(features,'{}'::jsonb),'{aiMonthlyBudgetChfPerRestaurant}','15'::jsonb,true)
where active=true;
