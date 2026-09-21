import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const base=readFileSync('supabase/migrations/001_initial_schema.sql','utf8');
const v27=readFileSync('supabase/migrations/002_v27_permissions_and_plans.sql','utf8');
const play=readFileSync('supabase/migrations/003_v27_7_play_security_billing.sql','utf8');
const security=readFileSync('supabase/migrations/004_v27_10_security_accounts_audit.sql','utf8');
const alignment=readFileSync('supabase/migrations/005_v27_10_permission_alignment.sql','utf8');
const privateHelpers=readFileSync('supabase/migrations/006_v27_10_private_auth_helpers.sql','utf8');
const config=readFileSync('supabase/config.toml','utf8');

assert.match(base,/create table if not exists public\.organizations/);
assert.match(base,/create table if not exists public\.restaurants/);
assert.match(base,/create table if not exists public\.memberships/);
assert.match(base,/alter table public\.memberships enable row level security/);

assert.match(v27,/add column if not exists permissions text\[\]/);
assert.match(v27,/STAFF|memberships_permissions_allowed/i);
for(const permission of ['operations','haccp','stock','deliveries','checklists','planning','reservations'])assert.match(v27,new RegExp(`'${permission}'`));

assert.match(v27,/monthly_price_cents = 999/);
assert.match(v27,/yearly_price_cents = 9900/);
assert.match(v27,/\('multi', 'ReMaPro Hub Multi', 1499, 15000/);

assert.match(v27,/create schema if not exists private/);
for(const fn of ['is_org_member','is_restaurant_member','is_org_admin','is_restaurant_admin']){
  assert.match(v27,new RegExp(`revoke execute on function public\\.${fn}\\(uuid\\) from public, anon`));
  assert.match(v27,new RegExp(`grant execute on function public\\.${fn}\\(uuid\\) to authenticated`));
}
assert.match(v27,/create or replace function private\.has_org_role/);
assert.match(v27,/create or replace function private\.has_restaurant_permission/);
assert.doesNotMatch(v27,/create or replace function public\.has_restaurant_permission/);

assert.match(v27,/grant select, insert, update, delete on public\.restaurants to authenticated/);
assert.match(v27,/grant select, insert, update, delete on public\.memberships to authenticated/);
assert.doesNotMatch(v27,/grant [^;]+ to anon/i);

const restaurantPolicy=v27.match(/create policy restaurant_select[\s\S]*?;\n/)?.[0]||'';
assert.match(restaurantPolicy,/is_restaurant_member\(id\)/);
assert.doesNotMatch(restaurantPolicy,/is_org_member\(organization_id\)/);

const payroll=v27.match(/create policy payroll_select[\s\S]*?;\n/)?.[0]||'';
assert.match(payroll,/is_org_admin/);
assert.match(payroll,/has_org_role/);
assert.doesNotMatch(payroll,/is_org_member/);

const temperature=v27.match(/create policy temp_select[\s\S]*?;\n/)?.[0]||'';
assert.match(temperature,/has_restaurant_permission\(restaurant_id, 'haccp'\)/);

console.log('Supabase tenancy, pricing and RLS hardening guards OK');

assert.match(play,/revoke update, delete on public\.temperature_logs from authenticated/);
assert.match(play,/drop policy if exists temp_update/);
assert.match(play,/revoke insert, update, delete on public\.subscriptions from authenticated/);
assert.match(play,/subscriptions_organization_unique/);
assert.match(play,/revenuecat_event_id/);

assert.match(security,/create table if not exists public\.audit_logs/);
assert.match(security,/alter table public\.audit_logs enable row level security/);
assert.match(security,/revoke insert, update, delete on public\.memberships from authenticated/);
assert.match(security,/grant select on public\.memberships to authenticated/);
assert.match(security,/restaurant_admin','director','manager/);

for(const permission of ['finance','documents','hr','team','orders','suppliers','purchases','invoices','customers','loyalty','ai'])
  assert.match(alignment,new RegExp(`'${permission}'`));
assert.match(alignment,/has_restaurant_permission\(restaurant_id,'finance'\)/);
assert.match(alignment,/has_restaurant_permission\(restaurant_id,'documents'\)/);
assert.match(privateHelpers,/create or replace function private\.is_org_member/);
assert.match(privateHelpers,/create or replace function public\.is_org_member[\s\S]*?security invoker/);
assert.match(privateHelpers,/drop function if exists public\.handle_new_user/);
assert.match(config,/\[functions\.remapro-bootstrap\][\s\S]*?verify_jwt\s*=\s*true/);
