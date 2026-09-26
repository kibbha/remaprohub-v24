create table if not exists public.ai_simulation_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'draft'
    check (status in ('draft','generating','ready','running','paused','completed','failed','cancelled')),
  target_cases integer not null default 100 check (target_cases between 1 and 5000),
  max_daily_cases integer not null default 25 check (max_daily_cases between 1 and 500),
  batch_size integer not null default 5 check (batch_size between 1 and 20),
  modes text[] not null default array['standard','difficult','edge','multilingual','chaos']::text[],
  applications text[] not null default array['hub','pos']::text[],
  languages text[] not null default array['fr','en','de','it']::text[],
  difficulties text[] not null default array['easy','normal','hard','critical']::text[],
  category_mix jsonb not null default '{}'::jsonb,
  auto_run boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  last_error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);
create table if not exists public.ai_simulation_scenarios (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.ai_simulation_campaigns(id) on delete cascade,
  application text not null check (application in ('hub','pos')),
  language text not null check (language in ('fr','en','de','it')),
  category text not null check (category in ('question','bug','feature','billing','account','other')),
  difficulty text not null check (difficulty in ('easy','normal','hard','critical')),
  mode text not null check (mode in ('standard','difficult','edge','multilingual','chaos')),
  persona jsonb not null default '{}'::jsonb,
  environment jsonb not null default '{}'::jsonb,
  subject text not null,
  message text not null,
  expected_route text not null default 'support'
    check (expected_route in ('support','knowledge','diagnostic','developer_hub','developer_pos','product','qa','release','human')),
  expected jsonb not null default '{}'::jsonb,
  rubric jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}'::text[],
  dedupe_key text not null unique,
  status text not null default 'queued'
    check (status in ('queued','running','passed','failed','error','skipped')),
  generated_by_model text,
  last_error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create table if not exists public.ai_simulation_runs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.ai_simulation_campaigns(id) on delete cascade,
  scenario_id uuid not null references public.ai_simulation_scenarios(id) on delete cascade,
  status text not null default 'running' check (status in ('running','passed','failed','error')),
  chain jsonb not null default '{}'::jsonb,
  scores jsonb not null default '{}'::jsonb,
  overall_score numeric(5,4) check (overall_score is null or (overall_score between 0 and 1)),
  passed boolean,
  safety_failure boolean not null default false,
  evaluator_notes text not null default '',
  token_usage jsonb not null default '{}'::jsonb,
  latency_ms integer,
  error_message text not null default '',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create table if not exists public.ai_simulation_findings (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.ai_simulation_campaigns(id) on delete cascade,
  scenario_id uuid not null references public.ai_simulation_scenarios(id) on delete cascade,
  run_id uuid not null references public.ai_simulation_runs(id) on delete cascade,
  agent_role text not null check (agent_role in ('dispatcher','support','diagnostic','developer_hub','developer_pos','qa','release','product','knowledge','system')),
  severity text not null default 'medium' check (severity in ('low','medium','high','critical')),
  finding_type text not null check (finding_type in ('routing','knowledge_gap','instruction_gap','quality','safety','tool_policy','technical_error')),
  summary text not null,
  evidence jsonb not null default '{}'::jsonb,
  suggested_change jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open','promoted','resolved','dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.ai_simulation_worker_auth (
  singleton boolean primary key default true check (singleton),
  token_hash text not null,
  enabled boolean not null default true,
  rotated_at timestamptz not null default now()
);
create index if not exists ai_sim_campaign_status_idx on public.ai_simulation_campaigns(status,updated_at desc);
create index if not exists ai_sim_scenario_campaign_status_idx on public.ai_simulation_scenarios(campaign_id,status,created_at);
create index if not exists ai_sim_scenario_status_idx on public.ai_simulation_scenarios(status,created_at);
create index if not exists ai_sim_run_campaign_created_idx on public.ai_simulation_runs(campaign_id,created_at desc);
create index if not exists ai_sim_run_scenario_created_idx on public.ai_simulation_runs(scenario_id,created_at desc);
create index if not exists ai_sim_finding_campaign_status_idx on public.ai_simulation_findings(campaign_id,status,created_at desc);
create index if not exists ai_sim_finding_role_status_idx on public.ai_simulation_findings(agent_role,status,created_at desc);
alter table public.ai_simulation_campaigns enable row level security;
alter table public.ai_simulation_scenarios enable row level security;
alter table public.ai_simulation_runs enable row level security;
alter table public.ai_simulation_findings enable row level security;
alter table public.ai_simulation_worker_auth enable row level security;
revoke all on public.ai_simulation_campaigns, public.ai_simulation_scenarios, public.ai_simulation_runs,
  public.ai_simulation_findings, public.ai_simulation_worker_auth from anon, authenticated;
grant all on public.ai_simulation_campaigns, public.ai_simulation_scenarios, public.ai_simulation_runs,
  public.ai_simulation_findings, public.ai_simulation_worker_auth to service_role;
drop policy if exists ai_sim_campaigns_server_only on public.ai_simulation_campaigns;
create policy ai_sim_campaigns_server_only on public.ai_simulation_campaigns for all to authenticated using (false) with check (false);
drop policy if exists ai_sim_scenarios_server_only on public.ai_simulation_scenarios;
create policy ai_sim_scenarios_server_only on public.ai_simulation_scenarios for all to authenticated using (false) with check (false);
drop policy if exists ai_sim_runs_server_only on public.ai_simulation_runs;
create policy ai_sim_runs_server_only on public.ai_simulation_runs for all to authenticated using (false) with check (false);
drop policy if exists ai_sim_findings_server_only on public.ai_simulation_findings;
create policy ai_sim_findings_server_only on public.ai_simulation_findings for all to authenticated using (false) with check (false);
drop policy if exists ai_sim_worker_auth_server_only on public.ai_simulation_worker_auth;
create policy ai_sim_worker_auth_server_only on public.ai_simulation_worker_auth for all to authenticated using (false) with check (false);
