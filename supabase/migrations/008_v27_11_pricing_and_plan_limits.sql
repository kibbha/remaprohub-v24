begin;

-- ReMaPro Hub V27.11 — align production plans with the public launch offer.
update public.subscription_plans
set name = 'ReMaPro Hub Standard',
    monthly_price_cents = 1990,
    yearly_price_cents = 19900,
    currency = 'CHF',
    trial_days = 14,
    active = true,
    features = jsonb_build_object(
      'restaurants', 1,
      'managers', 1,
      'staff_limited', false,
      'trial_full_access', true
    )
where code = 'standard';

update public.subscription_plans
set name = 'ReMaPro Hub Pro',
    monthly_price_cents = 3990,
    yearly_price_cents = 39900,
    currency = 'CHF',
    trial_days = 14,
    active = true,
    features = jsonb_build_object(
      'restaurants', 5,
      'managers', 'unlimited',
      'staff_limited', true,
      'trial_full_access', true
    )
where code = 'multi';

-- Existing trials are never shortened; seven-day launch trials are extended to 14 days.
update public.subscriptions
set trial_ends_at = greatest(
  coalesce(trial_ends_at, created_at + interval '14 days'),
  created_at + interval '14 days'
)
where status = 'trialing';

commit;
