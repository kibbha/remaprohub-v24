-- Final pre-APK audit: RLS init-plan optimization and targeted FK indexes.
-- Keeps deny-by-default service-only tables unchanged.

drop policy if exists profile_select on public.profiles;
create policy profile_select on public.profiles
for select to authenticated
using (id = (select auth.uid()));

drop policy if exists profile_update on public.profiles;
create policy profile_update on public.profiles
for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

drop policy if exists membership_select on public.memberships;
create policy membership_select on public.memberships
for select to authenticated
using (
  user_id = (select auth.uid())
  or public.is_org_admin(organization_id)
);

drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs
for select to authenticated
using (
  private.has_org_role(organization_id, array['network_admin'::text,'network_manager'::text])
  or (
    restaurant_id is not null
    and exists (
      select 1
      from public.memberships m
      where m.user_id = (select auth.uid())
        and m.organization_id = audit_logs.organization_id
        and m.restaurant_id = audit_logs.restaurant_id
        and m.active = true
        and m.role = any (
          array[
            'restaurant_admin'::public.membership_role,
            'director'::public.membership_role,
            'manager'::public.membership_role
          ]
        )
    )
  )
);

create index if not exists pos_floor_plans_organization_idx
  on public.pos_floor_plans(organization_id);
create index if not exists pos_floor_plans_updated_by_idx
  on public.pos_floor_plans(updated_by) where updated_by is not null;
create index if not exists pos_floor_plans_published_by_idx
  on public.pos_floor_plans(published_by) where published_by is not null;

create index if not exists pos_floor_plan_versions_organization_idx
  on public.pos_floor_plan_versions(organization_id);
create index if not exists pos_floor_plan_versions_restaurant_idx
  on public.pos_floor_plan_versions(restaurant_id);
create index if not exists pos_floor_plan_versions_published_by_idx
  on public.pos_floor_plan_versions(published_by) where published_by is not null;

create index if not exists pos_order_table_links_order_idx
  on public.pos_order_table_links(order_id);
create index if not exists pos_order_table_links_table_idx
  on public.pos_order_table_links(table_id);
