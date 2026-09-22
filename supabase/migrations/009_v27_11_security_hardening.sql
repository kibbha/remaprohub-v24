-- ReMaPro Hub V27.11 — security hardening
begin;

revoke all privileges on all tables in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;

drop policy if exists restaurant_workspaces_server_only_deny on public.restaurant_workspaces;
create policy restaurant_workspaces_server_only_deny
on public.restaurant_workspaces
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists subscription_events_server_only_deny on public.subscription_events;
create policy subscription_events_server_only_deny
on public.subscription_events
for all
to anon, authenticated
using (false)
with check (false);

alter function private.has_org_role(uuid, text[]) set search_path = pg_catalog;

commit;
