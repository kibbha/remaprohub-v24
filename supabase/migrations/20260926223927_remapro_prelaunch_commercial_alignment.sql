update public.subscription_plans
set trial_days=7,
    monthly_price_cents=case when code='multi' then 4990 else monthly_price_cents end
where code in ('standard','multi');

-- Existing subscriptions keep their current trial_ends_at.
-- New trials use the updated plan trial_days through remapro-bootstrap.
