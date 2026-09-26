create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  restaurant_id uuid references public.restaurants(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  application text not null check (application in ('hub','pos')),
  app_version text not null default '',
  category text not null default 'other' check (category in ('question','bug','feature','billing','account','other')),
  priority text not null default 'normal' check (priority in ('low','normal','high','critical')),
  status text not null default 'open' check (status in ('open','triaged','in_progress','waiting_customer','waiting_approval','resolved','closed')),
  subject text not null,
  summary text not null default '',
  latest_message text not null default '',
  assigned_agent text,
  ai_classification jsonb not null default '{}'::jsonb,
  engineering_context jsonb not null default '{}'::jsonb,
  github_issue_url text,
  github_issue_number integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sender_user_id uuid references auth.users(id) on delete set null,
  sender_type text not null check (sender_type in ('customer','ai','operator','system')),
  agent_role text,
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_agent_runs (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references public.support_tickets(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_role text not null check (agent_role in ('dispatcher','support','diagnostic','developer_hub','developer_pos','qa','release','product','knowledge')),
  status text not null default 'queued' check (status in ('queued','running','completed','failed','waiting_approval')),
  input_summary text not null default '',
  output_summary text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.support_approvals (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  requested_by_agent text not null,
  action text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','executed','cancelled')),
  payload jsonb not null default '{}'::jsonb,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists support_tickets_org_status_updated_idx on public.support_tickets (organization_id,status,updated_at desc);
create index if not exists support_tickets_restaurant_updated_idx on public.support_tickets (restaurant_id,updated_at desc) where restaurant_id is not null;
create index if not exists support_tickets_created_by_updated_idx on public.support_tickets (created_by,updated_at desc);
create index if not exists support_messages_ticket_created_idx on public.support_messages (ticket_id,created_at);
create index if not exists ai_agent_runs_ticket_created_idx on public.ai_agent_runs (ticket_id,created_at desc);
create index if not exists support_approvals_status_created_idx on public.support_approvals (status,created_at desc);

alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
alter table public.ai_agent_runs enable row level security;
alter table public.support_approvals enable row level security;

revoke all on public.support_tickets from anon, authenticated;
revoke all on public.support_messages from anon, authenticated;
revoke all on public.ai_agent_runs from anon, authenticated;
revoke all on public.support_approvals from anon, authenticated;

grant all on public.support_tickets to service_role;
grant all on public.support_messages to service_role;
grant all on public.ai_agent_runs to service_role;
grant all on public.support_approvals to service_role;
