create index if not exists ai_agent_runs_organization_idx on public.ai_agent_runs (organization_id);
create index if not exists support_messages_organization_idx on public.support_messages (organization_id);
create index if not exists support_messages_sender_user_idx on public.support_messages (sender_user_id) where sender_user_id is not null;
create index if not exists support_approvals_ticket_idx on public.support_approvals (ticket_id);
create index if not exists support_approvals_organization_idx on public.support_approvals (organization_id);
create index if not exists support_approvals_reviewed_by_idx on public.support_approvals (reviewed_by) where reviewed_by is not null;

drop policy if exists support_tickets_server_only on public.support_tickets;
create policy support_tickets_server_only on public.support_tickets
  for all to authenticated using (false) with check (false);

drop policy if exists support_messages_server_only on public.support_messages;
create policy support_messages_server_only on public.support_messages
  for all to authenticated using (false) with check (false);

drop policy if exists ai_agent_runs_server_only on public.ai_agent_runs;
create policy ai_agent_runs_server_only on public.ai_agent_runs
  for all to authenticated using (false) with check (false);

drop policy if exists support_approvals_server_only on public.support_approvals;
create policy support_approvals_server_only on public.support_approvals
  for all to authenticated using (false) with check (false);
