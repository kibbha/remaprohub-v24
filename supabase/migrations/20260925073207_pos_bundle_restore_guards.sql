-- A historical layout may refer to products or tables that no longer exist.
-- Refuse an unsafe rollback rather than showing unusable buttons on a POS.
create or replace function public.pos_bundle_restore(p_restaurant_id uuid,p_actor_user_id uuid,p_version bigint) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_org uuid;v_source public.pos_configuration_bundle_versions%rowtype;v_next bigint;v_revision bigint;
begin
  select organization_id into v_org from public.restaurants where id=p_restaurant_id and active=true;
  if v_org is null then raise exception 'RESTAURANT_NOT_FOUND';end if;
  if not public.pos_actor_is_manager(p_actor_user_id,v_org,p_restaurant_id) then raise exception 'MANAGER_ACCESS_REQUIRED';end if;
  select revision into v_revision from public.pos_configuration_revisions where restaurant_id=p_restaurant_id for update;
  select * into v_source from public.pos_configuration_bundle_versions where restaurant_id=p_restaurant_id and version=p_version;
  if not found then raise exception 'BUNDLE_VERSION_NOT_FOUND';end if;
  if exists(select 1 from jsonb_array_elements(v_source.document->'catalog') item
    where not exists(select 1 from public.pos_catalog_items c where c.restaurant_id=p_restaurant_id and c.id::text=item->>'id' and c.active=true))
  then raise exception 'BUNDLE_RESTORE_CATALOG_MISSING';end if;
  if exists(select 1 from jsonb_array_elements(v_source.document->'tables') item
    where coalesce((item->>'active')::boolean,true)=true and not exists
      (select 1 from public.pos_tables t where t.restaurant_id=p_restaurant_id and t.id::text=item->>'id' and t.active=true))
  then raise exception 'BUNDLE_RESTORE_TABLE_MISSING';end if;
  select coalesce(max(version),0)+1 into v_next from public.pos_configuration_bundle_versions where restaurant_id=p_restaurant_id;
  insert into public.pos_configuration_bundle_versions(restaurant_id,organization_id,version,source_revision,document,payload,checksum,restored_from_version,published_by)
  values(p_restaurant_id,v_org,v_next,v_revision,v_source.document,v_source.payload,v_source.checksum,p_version,p_actor_user_id);
  insert into public.pos_configuration_bundle_heads(restaurant_id,version) values(p_restaurant_id,v_next)
  on conflict(restaurant_id) do update set version=excluded.version,published_at=now();
  return jsonb_build_object('version',v_next,'restoredFromVersion',p_version,'checksum',v_source.checksum);
end;$$;
revoke all on function public.pos_bundle_restore(uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.pos_bundle_restore(uuid,uuid,bigint) to service_role;
