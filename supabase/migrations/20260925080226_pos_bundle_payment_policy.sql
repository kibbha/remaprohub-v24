-- Payment policy and KDS alert thresholds are edited in the bundle draft.
-- Existing restaurants retain every method until a manager publishes a policy.
create or replace function public.pos_bundle_save_draft(p_restaurant_id uuid,p_actor_user_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_org uuid;v_revision bigint;v_document jsonb;v_settings jsonb;
begin
  select organization_id into v_org from public.restaurants where id=p_restaurant_id and active=true;
  if v_org is null then raise exception 'RESTAURANT_NOT_FOUND';end if;
  if not public.pos_actor_is_manager(p_actor_user_id,v_org,p_restaurant_id) then raise exception 'MANAGER_ACCESS_REQUIRED';end if;
  insert into public.pos_configuration_revisions(restaurant_id,revision) values(p_restaurant_id,1) on conflict do nothing;
  select revision into v_revision from public.pos_configuration_revisions where restaurant_id=p_restaurant_id for update;
  select v.document->'settings' into v_settings from public.pos_configuration_bundle_heads h
    join public.pos_configuration_bundle_versions v on v.restaurant_id=h.restaurant_id and v.version=h.version
    where h.restaurant_id=p_restaurant_id;
  v_settings:=coalesce(v_settings,'{"payments":{"cash":true,"card":true,"twint":true,"voucher":true,"invoice":true,"other":true},"kdsWarningMinutes":12,"kdsCriticalMinutes":20}'::jsonb);
  v_document:=jsonb_set(public.pos_bundle_snapshot(p_restaurant_id),'{settings}',v_settings,true);
  insert into public.pos_configuration_bundle_drafts(restaurant_id,organization_id,source_revision,document,updated_by)
  values(p_restaurant_id,v_org,v_revision,v_document,p_actor_user_id)
  on conflict(restaurant_id) do update set source_revision=excluded.source_revision,document=excluded.document,updated_by=excluded.updated_by,updated_at=now();
  return jsonb_build_object('sourceRevision',v_revision,'document',v_document);
end;$$;

create function public.pos_bundle_update_settings(p_restaurant_id uuid,p_actor_user_id uuid,p_expected_revision bigint,p_settings jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_org uuid;v_revision bigint;v_draft public.pos_configuration_bundle_drafts%rowtype;v_methods text[]:=array['cash','card','twint','voucher','invoice','other'];v_method text;v_warn integer;v_critical integer;
begin
  select organization_id into v_org from public.restaurants where id=p_restaurant_id and active=true;
  if v_org is null then raise exception 'RESTAURANT_NOT_FOUND';end if;
  if not public.pos_actor_is_manager(p_actor_user_id,v_org,p_restaurant_id) then raise exception 'MANAGER_ACCESS_REQUIRED';end if;
  select revision into v_revision from public.pos_configuration_revisions where restaurant_id=p_restaurant_id for update;
  select * into v_draft from public.pos_configuration_bundle_drafts where restaurant_id=p_restaurant_id for update;
  if not found then raise exception 'BUNDLE_DRAFT_NOT_FOUND';end if;
  if v_revision is distinct from v_draft.source_revision or v_revision is distinct from p_expected_revision then raise exception 'BUNDLE_DRAFT_STALE';end if;
  if jsonb_typeof(p_settings)<>'object' or jsonb_typeof(p_settings->'payments')<>'object' then raise exception 'PAYMENT_POLICY_INVALID';end if;
  if (select count(*) from jsonb_object_keys(p_settings->'payments') k where k<>all(v_methods))>0 then raise exception 'PAYMENT_METHOD_UNKNOWN';end if;
  foreach v_method in array v_methods loop
    if jsonb_typeof(p_settings->'payments'->v_method)<>'boolean' then raise exception 'PAYMENT_POLICY_INVALID';end if;
  end loop;
  if not exists(select 1 from jsonb_each(p_settings->'payments') p where p.value='true'::jsonb) then raise exception 'PAYMENT_POLICY_EMPTY';end if;
  if coalesce(p_settings->>'kdsWarningMinutes','') !~ '^[0-9]+$' or coalesce(p_settings->>'kdsCriticalMinutes','') !~ '^[0-9]+$' then raise exception 'KDS_THRESHOLDS_INVALID';end if;
  v_warn:=(p_settings->>'kdsWarningMinutes')::integer;v_critical:=(p_settings->>'kdsCriticalMinutes')::integer;
  if v_warn not between 1 and 120 or v_critical not between 2 and 180 or v_critical<=v_warn then raise exception 'KDS_THRESHOLDS_INVALID';end if;
  update public.pos_configuration_bundle_drafts set document=jsonb_set(document,'{settings}',
    jsonb_build_object('payments',p_settings->'payments','kdsWarningMinutes',v_warn,'kdsCriticalMinutes',v_critical),true),
    updated_by=p_actor_user_id,updated_at=now() where restaurant_id=p_restaurant_id;
  return jsonb_build_object('sourceRevision',v_revision,'settings',p_settings);
end;$$;
revoke all on function public.pos_bundle_save_draft(uuid,uuid),public.pos_bundle_update_settings(uuid,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.pos_bundle_save_draft(uuid,uuid),public.pos_bundle_update_settings(uuid,uuid,bigint,jsonb) to service_role;
