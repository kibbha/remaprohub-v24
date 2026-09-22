-- Explicit deny policy for server-only receipt counters.
-- Table privileges for anon/authenticated remain revoked.
create policy pos_receipt_counters_no_client_select
on public.pos_receipt_counters
for select to authenticated
using (false);
