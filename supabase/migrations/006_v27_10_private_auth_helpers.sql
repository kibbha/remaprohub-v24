-- ReMaPro Hub V27.10 — move privileged auth helpers out of exposed public schema
begin;

create or replace function private.is_org_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = p_org
      and m.user_id = auth.uid()
      and m.active = true
  );
$$;

create or replace function private.is_restaurant_member(p_restaurant uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1 from public.memberships m
    where m.restaurant_id = p_restaurant
      and m.user_id = auth.uid()
      and m.active = true
  );
$$;

create or replace function private.is_org_admin(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = p_org
      and m.user_id = auth.uid()
      and m.active = true
      and m.role::text in ('network_admin','network_manager')
  );
$$;

create or replace function private.is_restaurant_admin(p_restaurant uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1 from public.memberships m
    where m.restaurant_id = p_restaurant
      and m.user_id = auth.uid()
      and m.active = true
      and m.role::text in ('restaurant_admin','director','manager')
  );
$$;

revoke all on function private.is_org_member(uuid) from public, anon;
revoke all on function private.is_restaurant_member(uuid) from public, anon;
revoke all on function private.is_org_admin(uuid) from public, anon;
revoke all on function private.is_restaurant_admin(uuid) from public, anon;
grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.is_restaurant_member(uuid) to authenticated;
grant execute on function private.is_org_admin(uuid) to authenticated;
grant execute on function private.is_restaurant_admin(uuid) to authenticated;

create or replace function public.is_org_member(p_org uuid)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog
as $$ select private.is_org_member(p_org); $$;

create or replace function public.is_restaurant_member(p_restaurant uuid)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog
as $$ select private.is_restaurant_member(p_restaurant); $$;

create or replace function public.is_org_admin(p_org uuid)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog
as $$ select private.is_org_admin(p_org); $$;

create or replace function public.is_restaurant_admin(p_restaurant uuid)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog
as $$ select private.is_restaurant_admin(p_restaurant); $$;

revoke all on function public.is_org_member(uuid) from public, anon;
revoke all on function public.is_restaurant_member(uuid) from public, anon;
revoke all on function public.is_org_admin(uuid) from public, anon;
revoke all on function public.is_restaurant_admin(uuid) from public, anon;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_restaurant_member(uuid) to authenticated;
grant execute on function public.is_org_admin(uuid) to authenticated;
grant execute on function public.is_restaurant_admin(uuid) to authenticated;

create or replace function private.has_restaurant_permission(p_restaurant uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.restaurants r
    where r.id = p_restaurant
      and (
        private.is_org_admin(r.organization_id)
        or exists (
          select 1
          from public.memberships m
          where m.restaurant_id = p_restaurant
            and m.user_id = auth.uid()
            and m.active = true
            and (
              m.role::text in ('restaurant_admin','director','manager')
              or p_permission = any(m.permissions)
            )
        )
      )
  );
$$;

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  insert into public.profiles (id, first_name, last_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure private.handle_new_user();

alter function public.set_updated_at() set search_path = pg_catalog, public;

commit;
