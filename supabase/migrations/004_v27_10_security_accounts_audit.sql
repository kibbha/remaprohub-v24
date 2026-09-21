-- ReMaPro Hub V27.10 — per-user security, manager delegation and audit log
begin;

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  restaurant_id uuid references public.restaurants(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_org_created_idx
  on public.audit_logs(organization_id, created_at desc);
create index if not exists audit_logs_restaurant_created_idx
  on public.audit_logs(restaurant_id, created_at desc);

alter table public.audit_logs enable row level security;
revoke all on public.audit_logs from public, anon, authenticated;
grant select on public.audit_logs to authenticated;

drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs
for select to authenticated
using (
  private.has_org_role(organization_id,array['network_admin','network_manager'])
  or (
    restaurant_id is not null
    and exists (
      select 1 from public.memberships m
      where m.user_id=auth.uid()
        and m.organization_id=audit_logs.organization_id
        and m.restaurant_id=audit_logs.restaurant_id
        and m.active=true
        and m.role in ('restaurant_admin','director','manager')
    )
  )
);

-- Membership writes remain mediated by remapro-admin.
revoke insert, update, delete on public.memberships from authenticated;
grant select on public.memberships to authenticated;

commit;
