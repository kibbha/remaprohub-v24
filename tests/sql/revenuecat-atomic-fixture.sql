-- Isolated PostgreSQL fixture. This file never connects to Supabase production.
create role service_role nologin;
create role anon nologin;
create role authenticated nologin;
create type public.subscription_status as enum ('trialing','active','past_due','paused','canceled','incomplete','expired');
create table public.memberships (
 id uuid default gen_random_uuid() primary key,
 user_id uuid not null,organization_id uuid not null,active boolean not null default true
);
create table public.subscription_plans (
 id uuid default gen_random_uuid() primary key,
 code text not null,active boolean not null default true
);
create table public.subscriptions (
 id uuid default gen_random_uuid() primary key,
 organization_id uuid not null,plan_id uuid,
 status public.subscription_status not null default 'trialing',
 current_period_end timestamptz,cancel_at_period_end boolean not null default false,
 revenuecat_app_user_id text,revenuecat_product_id text,revenuecat_entitlement text,
 restaurant_limit integer not null default 1 check (restaurant_limit between 1 and 5),
 store text not null default 'play_store',
 updated_at timestamptz not null default now(),
 created_at timestamptz not null default now()
);
create table public.subscription_events (
 id uuid default gen_random_uuid() primary key,
 organization_id uuid,event_type text not null,payload jsonb not null default '{}'::jsonb,
 revenuecat_event_id text,app_user_id text,created_at timestamptz not null default now()
);
grant usage on schema public to service_role;
grant select on public.memberships,public.subscription_plans,public.subscriptions,public.subscription_events to service_role;
grant insert,update on public.subscriptions to service_role;
grant insert on public.subscription_events to service_role;
insert into public.memberships(user_id,organization_id,active)
values('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001',true);
insert into public.subscription_plans(code,active) values('standard',true);
insert into public.subscriptions(organization_id,plan_id,status)
select '00000000-0000-4000-8000-000000000001',id,'trialing' from public.subscription_plans where code='standard';
