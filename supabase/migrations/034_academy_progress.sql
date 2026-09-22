-- ReMaPro Academy shared progress Hub + POS.
create table if not exists public.academy_settings(
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  manager_visibility boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index if not exists academy_settings_updated_by_idx on public.academy_settings(updated_by);

create table if not exists public.academy_progress(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  application text not null check(application in ('hub','pos','common')),
  topic_id text not null,
  content_version text not null,
  status text not null default 'not_started' check(status in ('not_started','in_progress','completed')),
  step_index integer not null default 0 check(step_index>=0),
  score integer check(score is null or (score>=0 and score<=100)),
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(user_id,application,topic_id)
);
create index if not exists academy_progress_user_idx on public.academy_progress(user_id,updated_at desc);
create index if not exists academy_progress_org_idx on public.academy_progress(organization_id,updated_at desc);
create index if not exists academy_progress_restaurant_idx on public.academy_progress(restaurant_id,updated_at desc);
create index if not exists academy_progress_content_idx on public.academy_progress(content_version);

alter table public.academy_settings enable row level security;
alter table public.academy_progress enable row level security;
revoke all on public.academy_settings from anon,authenticated;
revoke all on public.academy_progress from anon,authenticated;


-- Explicit deny-all policies document the server-only access model.
-- remapro-academy uses the service role and authenticated clients have no direct grants.
drop policy if exists academy_progress_server_only on public.academy_progress;
create policy academy_progress_server_only on public.academy_progress
for all to authenticated using (false) with check (false);

drop policy if exists academy_settings_server_only on public.academy_settings;
create policy academy_settings_server_only on public.academy_settings
for all to authenticated using (false) with check (false);
