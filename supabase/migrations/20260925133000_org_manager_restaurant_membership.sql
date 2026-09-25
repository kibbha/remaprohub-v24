-- Organization managers have access to their organization's restaurants.
-- The previous helper only recognized restaurant-specific memberships, so
-- Storage rejected delivery photos for organization-wide managers.
create or replace function private.is_restaurant_member(p_restaurant uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.restaurants r
    join public.memberships m on m.organization_id = r.organization_id
    where r.id = p_restaurant
      and r.active = true
      and m.user_id = auth.uid()
      and m.active = true
      and (
        m.restaurant_id = r.id
        or (m.restaurant_id is null and m.role::text in ('network_admin', 'network_manager'))
      )
  );
$$;

revoke all on function private.is_restaurant_member(uuid) from public, anon;
grant execute on function private.is_restaurant_member(uuid) to authenticated;
