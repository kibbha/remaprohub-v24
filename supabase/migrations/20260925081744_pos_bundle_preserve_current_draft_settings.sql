-- Preserve payment and KDS edits when the manager refreshes a current draft snapshot.
create or replace function public.pos_bundle_save_draft(p_restaurant_id uuid,p_actor_user_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_org uuid;v_revision bigint;v_document jsonb;v_settings jsonb;
begin
  select organization_id into v_org from public.restaurants where id=p_restaurant_id and active=true;
  if v_org is null then raise exception 'RESTAURANT_NOT_FOUND';end if;
  if not public.pos_actor_is_manager(p_actor_user_id,v_org,p_restaurant_id) then raise exception 'MANAGER_ACCESS_REQUIRED';end if;
  insert into public.pos_configuration_revisions(restaurant_id,revision) values(p_restaurant_id,1) on conflict do nothing;
  select revision into v_revision from public.pos_configuration_revisions where restaurant_id=p_restaurant_id for update;
  select document->'settings' into v_settings from public.pos_configuration_bundle_drafts
    where restaurant_id=p_restaurant_id and source_revision=v_revision;
  if v_settings is null then
    select v.document->'settings' into v_settings from public.pos_configuration_bundle_heads h
    join public.pos_configuration_bundle_versions v on v.restaurant_id=h.restaurant_id and v.version=h.version
    where h.restaurant_id=p_restaurant_id;
  end if;
  v_settings:=coalesce(v_settings,'{"payments":{"cash":true,"card":true,"twint":true,"voucher":true,"invoice":true,"other":true},"kdsWarningMinutes":12,"kdsCriticalMinutes":20}'::jsonb);
  v_document:=jsonb_set(public.pos_bundle_snapshot(p_restaurant_id),'{settings}',v_settings,true);
  insert into public.pos_configuration_bundle_drafts(restaurant_id,organization_id,source_revision,document,updated_by)
  values(p_restaurant_id,v_org,v_revision,v_document,p_actor_user_id)
  on conflict(restaurant_id) do update set source_revision=excluded.source_revision,document=excluded.document,updated_by=excluded.updated_by,updated_at=now();
  return jsonb_build_object('sourceRevision',v_revision,'document',v_document);
end;$$;


revoke all on function public.pos_bundle_save_draft(uuid,uuid) from public,anon,authenticated;
grant execute on function public.pos_bundle_save_draft(uuid,uuid) to service_role;
