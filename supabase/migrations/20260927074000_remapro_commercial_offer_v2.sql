-- ReMaPro commercial offer v2 — 2026-09-27
-- Base: CHF 49.90/month, 14-day trial, 1 establishment, up to 10 users.
-- Additional establishments: CHF 19.90/month each, capped at 5 total establishments.

alter table public.subscription_plans
  add column if not exists extra_restaurant_monthly_price_cents integer not null default 1990,
  add column if not exists max_restaurants integer not null default 5,
  add column if not exists user_limit integer not null default 10;

update public.subscription_plans
set trial_days=14,
    monthly_price_cents=4990,
    extra_restaurant_monthly_price_cents=1990,
    max_restaurants=5,
    user_limit=10
where code in ('standard','multi');

alter table public.subscriptions
  add column if not exists restaurant_limit integer not null default 1;

alter table public.subscriptions
  drop constraint if exists subscriptions_restaurant_limit_check;

alter table public.subscriptions
  add constraint subscriptions_restaurant_limit_check
  check (restaurant_limit between 1 and 5);

-- This is still pre-launch: align existing trial accounts with the newly approved 14-day offer.
update public.subscriptions
set trial_ends_at = greatest(
  coalesce(trial_ends_at, created_at),
  created_at + interval '14 days'
)
where status='trialing';
