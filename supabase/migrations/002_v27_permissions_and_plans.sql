-- ReMaPro Hub V27 — scoped memberships, plan limits and stricter RLS
-- Apply after 001_initial_schema.sql.
-- The mobile client must use only the publishable/anon key. Never expose service_role.

begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

-- The helpers created by migration 001 are SECURITY DEFINER. Remove the
-- implicit PUBLIC execute privilege and expose them only to signed-in users.
revoke execute on function public.is_org_member(uuid) from public, anon;
revoke execute on function public.is_restaurant_member(uuid) from public, anon;
revoke execute on function public.is_org_admin(uuid) from public, anon;
revoke execute on function public.is_restaurant_admin(uuid) from public, anon;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_restaurant_member(uuid) to authenticated;
grant execute on function public.is_org_admin(uuid) to authenticated;
grant execute on function public.is_restaurant_admin(uuid) to authenticated;

alter table public.memberships
  add column if not exists permissions text[] not null default '{}'::text[];

alter table public.subscription_plans
  add column if not exists yearly_price_cents integer;

update public.subscription_plans
set monthly_price_cents = 999,
    yearly_price_cents = 9900,
    trial_days = 7,
    features = jsonb_build_object(
      'restaurants', 1,
      'managers', 1,
      'staff_limited', false,
      'trial_full_access', true
    )
where code = 'standard';

insert into public.subscription_plans
  (code, name, monthly_price_cents, yearly_price_cents, currency, trial_days, active, features)
values
  ('multi', 'ReMaPro Hub Multi', 1499, 15000, 'CHF', 7, true,
   jsonb_build_object(
     'restaurants', 'unlimited',
     'managers', 'unlimited',
     'staff_limited', true,
     'trial_full_access', true
   ))
on conflict (code) do update
set name = excluded.name,
    monthly_price_cents = excluded.monthly_price_cents,
    yearly_price_cents = excluded.yearly_price_cents,
    currency = excluded.currency,
    trial_days = excluded.trial_days,
    active = excluded.active,
    features = excluded.features;

create or replace function private.has_org_role(p_org uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    where m.organization_id = p_org
      and m.user_id = auth.uid()
      and m.active = true
      and m.role::text = any(p_roles)
  );
$$;

create or replace function private.has_restaurant_permission(p_restaurant uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.restaurants r
    where r.id = p_restaurant
      and (
        public.is_org_admin(r.organization_id)
        or exists (
          select 1
          from public.memberships m
          where m.restaurant_id = p_restaurant
            and m.user_id = auth.uid()
            and m.active = true
            and (
              m.role in ('restaurant_admin','director','manager')
              or p_permission = any(m.permissions)
            )
        )
      )
  );
$$;

revoke all on function private.has_org_role(uuid,text[]) from public, anon;
revoke all on function private.has_restaurant_permission(uuid,text) from public, anon;
grant execute on function private.has_org_role(uuid,text[]) to authenticated;
grant execute on function private.has_restaurant_permission(uuid,text) to authenticated;

-- Explicit Data API grants: since 2026, new Supabase projects may not expose
-- public-schema tables automatically. RLS remains the authorization layer.
grant select, update on public.organizations to authenticated;
grant select, insert, update, delete on public.restaurants to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.memberships to authenticated;
grant select on public.subscription_plans to authenticated;
grant select on public.subscriptions to authenticated;
grant select, insert, update, delete on public.advice_sheets to authenticated;
grant select, insert, update, delete on public.temperature_logs to authenticated;
grant select, insert, update, delete on public.ingredients to authenticated;
grant select, insert, update, delete on public.recipes to authenticated;
grant select, insert, update, delete on public.recipe_ingredients to authenticated;
grant select, insert, update, delete on public.sales_daily to authenticated;
grant select, insert, update, delete on public.employees to authenticated;
grant select, insert, update, delete on public.payroll_records to authenticated;
grant select, insert, update, delete on public.documents to authenticated;
grant select, insert, update on public.migration_batches to authenticated;

-- Recreate only the policies whose scope changes in V27.
drop policy if exists restaurant_select on public.restaurants;
create policy restaurant_select on public.restaurants
for select to authenticated
using (
  public.is_org_admin(organization_id)
  or public.is_restaurant_member(id)
);

drop policy if exists temp_select on public.temperature_logs;
drop policy if exists temp_insert on public.temperature_logs;
drop policy if exists temp_update on public.temperature_logs;
create policy temp_select on public.temperature_logs
for select to authenticated
using (private.has_restaurant_permission(restaurant_id, 'haccp'));
create policy temp_insert on public.temperature_logs
for insert to authenticated
with check (private.has_restaurant_permission(restaurant_id, 'haccp'));
create policy temp_update on public.temperature_logs
for update to authenticated
using (private.has_restaurant_permission(restaurant_id, 'haccp'))
with check (private.has_restaurant_permission(restaurant_id, 'haccp'));

drop policy if exists sales_select on public.sales_daily;
drop policy if exists sales_insert on public.sales_daily;
drop policy if exists sales_update on public.sales_daily;
create policy sales_select on public.sales_daily
for select to authenticated
using (public.is_restaurant_admin(restaurant_id) or public.is_org_admin(organization_id));
create policy sales_insert on public.sales_daily
for insert to authenticated
with check (public.is_restaurant_admin(restaurant_id) or public.is_org_admin(organization_id));
create policy sales_update on public.sales_daily
for update to authenticated
using (public.is_restaurant_admin(restaurant_id) or public.is_org_admin(organization_id))
with check (public.is_restaurant_admin(restaurant_id) or public.is_org_admin(organization_id));

drop policy if exists employee_select on public.employees;
drop policy if exists employee_insert on public.employees;
drop policy if exists employee_update on public.employees;
create policy employee_select on public.employees
for select to authenticated
using (
  public.is_org_admin(organization_id)
  or private.has_org_role(organization_id, array['hr']::text[])
  or (restaurant_id is not null and public.is_restaurant_admin(restaurant_id))
);
create policy employee_insert on public.employees
for insert to authenticated
with check (
  public.is_org_admin(organization_id)
  or private.has_org_role(organization_id, array['hr']::text[])
  or (restaurant_id is not null and public.is_restaurant_admin(restaurant_id))
);
create policy employee_update on public.employees
for update to authenticated
using (
  public.is_org_admin(organization_id)
  or private.has_org_role(organization_id, array['hr']::text[])
  or (restaurant_id is not null and public.is_restaurant_admin(restaurant_id))
)
with check (
  public.is_org_admin(organization_id)
  or private.has_org_role(organization_id, array['hr']::text[])
  or (restaurant_id is not null and public.is_restaurant_admin(restaurant_id))
);

drop policy if exists payroll_select on public.payroll_records;
drop policy if exists payroll_insert on public.payroll_records;
drop policy if exists payroll_update on public.payroll_records;
create policy payroll_select on public.payroll_records
for select to authenticated
using (
  public.is_org_admin(organization_id)
  or private.has_org_role(organization_id, array['hr','finance']::text[])
);
create policy payroll_insert on public.payroll_records
for insert to authenticated
with check (
  public.is_org_admin(organization_id)
  or private.has_org_role(organization_id, array['hr','finance']::text[])
);
create policy payroll_update on public.payroll_records
for update to authenticated
using (
  public.is_org_admin(organization_id)
  or private.has_org_role(organization_id, array['hr','finance']::text[])
)
with check (
  public.is_org_admin(organization_id)
  or private.has_org_role(organization_id, array['hr','finance']::text[])
);

drop policy if exists documents_select on public.documents;
drop policy if exists documents_insert on public.documents;
drop policy if exists documents_update on public.documents;
create policy documents_select on public.documents
for select to authenticated
using (
  public.is_org_admin(organization_id)
  or (restaurant_id is not null and public.is_restaurant_admin(restaurant_id))
);
create policy documents_insert on public.documents
for insert to authenticated
with check (
  public.is_org_admin(organization_id)
  or (restaurant_id is not null and public.is_restaurant_admin(restaurant_id))
);
create policy documents_update on public.documents
for update to authenticated
using (
  public.is_org_admin(organization_id)
  or (restaurant_id is not null and public.is_restaurant_admin(restaurant_id))
)
with check (
  public.is_org_admin(organization_id)
  or (restaurant_id is not null and public.is_restaurant_admin(restaurant_id))
);

-- Operational restaurant-scoped content may be delegated explicitly.
drop policy if exists advice_select on public.advice_sheets;
drop policy if exists advice_insert on public.advice_sheets;
drop policy if exists advice_update on public.advice_sheets;
create policy advice_select on public.advice_sheets
for select to authenticated
using (
  public.is_org_admin(organization_id)
  or (restaurant_id is not null and private.has_restaurant_permission(restaurant_id, 'operations'))
);
create policy advice_insert on public.advice_sheets
for insert to authenticated
with check (
  public.is_org_admin(organization_id)
  or (restaurant_id is not null and private.has_restaurant_permission(restaurant_id, 'operations'))
);
create policy advice_update on public.advice_sheets
for update to authenticated
using (
  public.is_org_admin(organization_id)
  or (restaurant_id is not null and private.has_restaurant_permission(restaurant_id, 'operations'))
)
with check (
  public.is_org_admin(organization_id)
  or (restaurant_id is not null and private.has_restaurant_permission(restaurant_id, 'operations'))
);

-- Keep membership permissions constrained to the client-supported limited-access set.
alter table public.memberships
  drop constraint if exists memberships_permissions_allowed;
alter table public.memberships
  add constraint memberships_permissions_allowed
  check (
    permissions <@ array[
      'operations','haccp','stock','deliveries',
      'checklists','planning','reservations'
    ]::text[]
  );

commit;
