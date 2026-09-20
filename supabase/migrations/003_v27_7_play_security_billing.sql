begin;

-- ReMaPro Hub V27.7 — Play security, immutable HACCP, RevenueCat billing.

-- One effective subscription record per organization.
with ranked as (
  select id,row_number() over(partition by organization_id order by updated_at desc nulls last,created_at desc) rn
  from public.subscriptions
)
delete from public.subscriptions s using ranked r where s.id=r.id and r.rn>1;

create unique index if not exists subscriptions_organization_unique
  on public.subscriptions(organization_id);

alter table public.subscriptions
  add column if not exists revenuecat_app_user_id text,
  add column if not exists revenuecat_product_id text,
  add column if not exists revenuecat_entitlement text,
  add column if not exists store text not null default 'play_store';

alter table public.subscription_events
  add column if not exists revenuecat_event_id text,
  add column if not exists app_user_id text;

create unique index if not exists subscription_events_revenuecat_unique
  on public.subscription_events(revenuecat_event_id)
  where revenuecat_event_id is not null;

-- Validated HACCP readings are append-only at the database boundary too.
revoke update, delete on public.temperature_logs from authenticated;
drop policy if exists temp_update on public.temperature_logs;
drop policy if exists temp_delete on public.temperature_logs;

-- Client code may read subscription state but never forge paid status.
revoke insert, update, delete on public.subscriptions from authenticated;
revoke insert, update, delete on public.subscription_events from authenticated;
grant select on public.subscriptions to authenticated;
grant select on public.subscription_plans to authenticated;

commit;
