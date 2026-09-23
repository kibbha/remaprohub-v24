-- ReMaPro Hub/POS — versioned visual dining-room plans.
create table if not exists public.pos_floor_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  draft_document jsonb not null default '{"schemaVersion":1,"name":"Plan de salle","canvas":{"width":1000,"height":700,"gridSize":20,"background":"#f7f3ed"},"zones":[],"elements":[]}'::jsonb,
  published_document jsonb,
  draft_revision bigint not null default 1,
  published_version integer not null default 0,
  active boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pos_floor_plans_restaurant_idx on public.pos_floor_plans(restaurant_id,active,updated_at desc);
create unique index if not exists pos_floor_plans_one_active_idx on public.pos_floor_plans(restaurant_id) where active=true;

create table if not exists public.pos_floor_plan_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  plan_id uuid not null references public.pos_floor_plans(id) on delete cascade,
  version integer not null check(version>0),
  document jsonb not null,
  checksum text not null,
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz not null default now(),
  unique(plan_id,version)
);
create index if not exists pos_floor_plan_versions_plan_idx on public.pos_floor_plan_versions(plan_id,version desc);

drop trigger if exists pos_floor_plans_updated_at on public.pos_floor_plans;
create trigger pos_floor_plans_updated_at before update on public.pos_floor_plans for each row execute function public.set_updated_at();

alter table public.pos_floor_plans enable row level security;
alter table public.pos_floor_plan_versions enable row level security;
revoke all on public.pos_floor_plans from anon,authenticated;
revoke all on public.pos_floor_plan_versions from anon,authenticated;
grant all on public.pos_floor_plans to service_role;
grant all on public.pos_floor_plan_versions to service_role;

drop trigger if exists pos_floor_plans_config_revision on public.pos_floor_plans;
create trigger pos_floor_plans_config_revision after insert or update or delete on public.pos_floor_plans
for each row execute function public.pos_bump_configuration_revision();
drop trigger if exists pos_floor_plan_versions_config_revision on public.pos_floor_plan_versions;
create trigger pos_floor_plan_versions_config_revision after insert or update or delete on public.pos_floor_plan_versions
for each row execute function public.pos_bump_configuration_revision();
