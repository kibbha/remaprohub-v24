-- ReMaPro Hub V27.10 — align delegated permissions across database and sync
begin;

alter table public.memberships
  drop constraint if exists memberships_permissions_allowed;

alter table public.memberships
  add constraint memberships_permissions_allowed
  check (
    permissions <@ array[
      'operations','finance','stock','deliveries','haccp','checklists','planning',
      'reservations','recipes','documents','hr','team','orders','suppliers',
      'purchases','invoices','customers','loyalty','ai'
    ]::text[]
  );

drop policy if exists sales_select on public.sales_daily;
drop policy if exists sales_insert on public.sales_daily;
drop policy if exists sales_update on public.sales_daily;
create policy sales_select on public.sales_daily
for select to authenticated
using (private.has_restaurant_permission(restaurant_id,'finance'));
create policy sales_insert on public.sales_daily
for insert to authenticated
with check (private.has_restaurant_permission(restaurant_id,'finance'));
create policy sales_update on public.sales_daily
for update to authenticated
using (private.has_restaurant_permission(restaurant_id,'finance'))
with check (private.has_restaurant_permission(restaurant_id,'finance'));

drop policy if exists employee_select on public.employees;
drop policy if exists employee_insert on public.employees;
drop policy if exists employee_update on public.employees;
create policy employee_select on public.employees
for select to authenticated
using (
  public.is_org_admin(organization_id)
  or private.has_org_role(organization_id,array['hr']::text[])
  or (restaurant_id is not null and private.has_restaurant_permission(restaurant_id,'hr'))
);
create policy employee_insert on public.employees
for insert to authenticated
with check (
  public.is_org_admin(organization_id)
  or private.has_org_role(organization_id,array['hr']::text[])
  or (restaurant_id is not null and private.has_restaurant_permission(restaurant_id,'hr'))
);
create policy employee_update on public.employees
for update to authenticated
using (
  public.is_org_admin(organization_id)
  or private.has_org_role(organization_id,array['hr']::text[])
  or (restaurant_id is not null and private.has_restaurant_permission(restaurant_id,'hr'))
)
with check (
  public.is_org_admin(organization_id)
  or private.has_org_role(organization_id,array['hr']::text[])
  or (restaurant_id is not null and private.has_restaurant_permission(restaurant_id,'hr'))
);

drop policy if exists payroll_select on public.payroll_records;
drop policy if exists payroll_insert on public.payroll_records;
drop policy if exists payroll_update on public.payroll_records;
create policy payroll_select on public.payroll_records
for select to authenticated
using (
  public.is_org_admin(organization_id)
  or private.has_org_role(organization_id,array['hr','finance']::text[])
  or (restaurant_id is not null and (
    private.has_restaurant_permission(restaurant_id,'hr')
    or private.has_restaurant_permission(restaurant_id,'finance')
  ))
);
create policy payroll_insert on public.payroll_records
for insert to authenticated
with check (
  public.is_org_admin(organization_id)
  or private.has_org_role(organization_id,array['hr','finance']::text[])
  or (restaurant_id is not null and (
    private.has_restaurant_permission(restaurant_id,'hr')
    or private.has_restaurant_permission(restaurant_id,'finance')
  ))
);
create policy payroll_update on public.payroll_records
for update to authenticated
using (
  public.is_org_admin(organization_id)
  or private.has_org_role(organization_id,array['hr','finance']::text[])
  or (restaurant_id is not null and (
    private.has_restaurant_permission(restaurant_id,'hr')
    or private.has_restaurant_permission(restaurant_id,'finance')
  ))
)
with check (
  public.is_org_admin(organization_id)
  or private.has_org_role(organization_id,array['hr','finance']::text[])
  or (restaurant_id is not null and (
    private.has_restaurant_permission(restaurant_id,'hr')
    or private.has_restaurant_permission(restaurant_id,'finance')
  ))
);

drop policy if exists documents_select on public.documents;
drop policy if exists documents_insert on public.documents;
drop policy if exists documents_update on public.documents;
create policy documents_select on public.documents
for select to authenticated
using (
  public.is_org_admin(organization_id)
  or (restaurant_id is not null and (
    private.has_restaurant_permission(restaurant_id,'documents')
    or private.has_restaurant_permission(restaurant_id,'hr')
  ))
);
create policy documents_insert on public.documents
for insert to authenticated
with check (
  public.is_org_admin(organization_id)
  or (restaurant_id is not null and (
    private.has_restaurant_permission(restaurant_id,'documents')
    or private.has_restaurant_permission(restaurant_id,'hr')
  ))
);
create policy documents_update on public.documents
for update to authenticated
using (
  public.is_org_admin(organization_id)
  or (restaurant_id is not null and (
    private.has_restaurant_permission(restaurant_id,'documents')
    or private.has_restaurant_permission(restaurant_id,'hr')
  ))
)
with check (
  public.is_org_admin(organization_id)
  or (restaurant_id is not null and (
    private.has_restaurant_permission(restaurant_id,'documents')
    or private.has_restaurant_permission(restaurant_id,'hr')
  ))
);

commit;
