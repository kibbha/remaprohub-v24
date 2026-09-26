create table if not exists public.ai_engineering_jobs (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null unique references public.support_tickets(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  application text not null check (application in ('hub','pos')),
  repository_full_name text not null default 'kibbha/remaprohub-v24',
  base_branch text not null,
  work_branch text,
  status text not null default 'queued' check (status in (
    'queued','planning','awaiting_execution','executing','testing','pr_open','failed','completed','cancelled'
  )),
  requested_by_agent text not null default 'developer_hub',
  approved_by uuid references auth.users(id) on delete set null,
  execution_plan jsonb not null default '{}'::jsonb,
  qa_plan jsonb not null default '{}'::jsonb,
  selected_files jsonb not null default '[]'::jsonb,
  result_summary text not null default '',
  github_issue_number integer,
  github_issue_url text,
  github_pr_number integer,
  github_pr_url text,
  attempt_count integer not null default 0,
  last_error text not null default '',
  locked_at timestamptz,
  locked_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists ai_engineering_jobs_status_created_idx
  on public.ai_engineering_jobs(status, created_at);
create index if not exists ai_engineering_jobs_org_updated_idx
  on public.ai_engineering_jobs(organization_id, updated_at desc);
create index if not exists ai_engineering_jobs_approved_by_idx
  on public.ai_engineering_jobs(approved_by) where approved_by is not null;

alter table public.ai_engineering_jobs enable row level security;
revoke all on public.ai_engineering_jobs from anon, authenticated;
grant all on public.ai_engineering_jobs to service_role;

drop policy if exists ai_engineering_jobs_server_only on public.ai_engineering_jobs;
create policy ai_engineering_jobs_server_only on public.ai_engineering_jobs
  for all to authenticated using (false) with check (false);
