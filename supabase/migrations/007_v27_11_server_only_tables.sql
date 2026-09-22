begin;

-- ReMaPro Hub V27.11 — make server-only storage explicit at the SQL privilege layer.
-- RLS without client policies is intentional for these tables: access is mediated
-- by authenticated Edge Functions using the service role after their own checks.

alter table public.restaurant_workspaces enable row level security;
alter table public.subscription_events enable row level security;

revoke all privileges on table public.restaurant_workspaces from public, anon, authenticated;
revoke all privileges on table public.subscription_events from public, anon, authenticated;

comment on table public.restaurant_workspaces is
  'Server-only restaurant workspace storage. Access is mediated by remapro-sync.';
comment on table public.subscription_events is
  'Server-only RevenueCat event log. Access is mediated by remapro-revenuecat-webhook.';

commit;
