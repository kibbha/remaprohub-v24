-- Validate a Hub-managed POS configuration bundle before publication.
-- This is intentionally server-side: POS must never decide whether a configuration is publishable.
create or replace function public.pos_bundle_validate(p_restaurant_id uuid,p_document jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_errors jsonb := '[]'::jsonb;
  v_catalog_ids text[];
  v_table_ids text[];
  v_modifier_ids text[];
  v_layout jsonb;
  v_button jsonb;
  v_menu jsonb;
  v_choice jsonb;
  v_ref text;
begin
  if p_document is null or jsonb_typeof(p_document)<>'object' then
    return jsonb_build_object('valid',false,'errors',jsonb_build_array(jsonb_build_object('code','BUNDLE_DOCUMENT_REQUIRED')));
  end if;
  if coalesce((p_document->>'schemaVersion')::int,0)<>1 then
    v_errors:=v_errors||jsonb_build_array(jsonb_build_object('code','BUNDLE_SCHEMA_UNSUPPORTED','path','schemaVersion'));
  end if;

  select coalesce(array_agg(x->>'id'),'{}') into v_catalog_ids from jsonb_array_elements(coalesce(p_document->'catalog','[]'::jsonb)) x;
  select coalesce(array_agg(x->>'id'),'{}') into v_table_ids from jsonb_array_elements(coalesce(p_document->'tables','[]'::jsonb)) x;
  v_layout:=coalesce(p_document#>'{layout,document}','{}'::jsonb);
  select coalesce(array_agg(x->>'id'),'{}') into v_modifier_ids from jsonb_array_elements(coalesce(v_layout->'modifierGroups','[]'::jsonb)) x;

  for v_button in select value from jsonb_array_elements(coalesce(v_layout->'buttons','[]'::jsonb)) loop
    v_ref:=nullif(v_button->>'productId','');
    if v_ref is not null and not (v_ref=any(v_catalog_ids)) then
      v_errors:=v_errors||jsonb_build_array(jsonb_build_object('code','LAYOUT_PRODUCT_MISSING','path','layout.buttons.'||coalesce(v_button->>'id','?'),'ref',v_ref));
    end if;
    if v_ref is null and jsonb_typeof(v_button->'item')<>'object' then
      v_errors:=v_errors||jsonb_build_array(jsonb_build_object('code','LAYOUT_BUTTON_UNRESOLVED','path','layout.buttons.'||coalesce(v_button->>'id','?')));
    end if;
    for v_ref in select value #>> '{}' from jsonb_array_elements(coalesce(v_button->'modifierGroupIds','[]'::jsonb)) loop
      if not (v_ref=any(v_modifier_ids)) then
        v_errors:=v_errors||jsonb_build_array(jsonb_build_object('code','LAYOUT_MODIFIER_MISSING','path','layout.buttons.'||coalesce(v_button->>'id','?'),'ref',v_ref));
      end if;
    end loop;
  end loop;

  for v_menu in select value from jsonb_array_elements(coalesce(v_layout->'menus','[]'::jsonb)) loop
    v_ref:=nullif(v_menu->>'productId','');
    if v_ref is not null and not (v_ref=any(v_catalog_ids)) then
      v_errors:=v_errors||jsonb_build_array(jsonb_build_object('code','MENU_PRODUCT_MISSING','path','layout.menus.'||coalesce(v_menu->>'id','?'),'ref',v_ref));
    end if;
    for v_choice in select value from jsonb_array_elements(coalesce(v_menu->'choices','[]'::jsonb)) loop
      for v_ref in select value #>> '{}' from jsonb_array_elements(coalesce(v_choice->'productIds','[]'::jsonb)) loop
        if not (v_ref=any(v_catalog_ids)) then
          v_errors:=v_errors||jsonb_build_array(jsonb_build_object('code','MENU_CHOICE_PRODUCT_MISSING','path','layout.menus.'||coalesce(v_menu->>'id','?'),'ref',v_ref));
        end if;
      end loop;
    end loop;
  end loop;

  if jsonb_typeof(p_document->'floorPlan')='object' then
    for v_ref in select value->>'tableId' from jsonb_array_elements(coalesce(p_document#>'{floorPlan,document,elements}','[]'::jsonb))
      where value->>'type'='table' and coalesce((value->>'active')::boolean,true)
    loop
      if nullif(v_ref,'') is null or not (v_ref=any(v_table_ids)) then
        v_errors:=v_errors||jsonb_build_array(jsonb_build_object('code','FLOOR_TABLE_MISSING','path','floorPlan','ref',coalesce(v_ref,'')));
      end if;
    end loop;
  end if;

  if exists(select 1 from jsonb_array_elements(coalesce(p_document->'printers','[]'::jsonb)) x group by x->>'id' having count(*)>1) then
    v_errors:=v_errors||jsonb_build_array(jsonb_build_object('code','PRINTER_ID_DUPLICATE','path','printers'));
  end if;
  if exists(select 1 from jsonb_array_elements(coalesce(p_document->'terminals','[]'::jsonb)) x group by x->>'id' having count(*)>1) then
    v_errors:=v_errors||jsonb_build_array(jsonb_build_object('code','TERMINAL_ID_DUPLICATE','path','terminals'));
  end if;
  if not exists(select 1 from jsonb_each(coalesce(p_document#>'{settings,payments}','{}'::jsonb)) p where p.value='true'::jsonb) then
    v_errors:=v_errors||jsonb_build_array(jsonb_build_object('code','PAYMENT_METHOD_REQUIRED','path','settings.payments'));
  end if;
  return jsonb_build_object('valid',jsonb_array_length(v_errors)=0,'errors',v_errors);
end;$$;

revoke all on function public.pos_bundle_validate(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pos_bundle_validate(uuid,jsonb) to service_role;

create or replace function public.pos_bundle_publish(p_restaurant_id uuid,p_actor_user_id uuid,p_expected_revision bigint) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_org uuid;v_revision bigint;v_draft public.pos_configuration_bundle_drafts%rowtype;v_version bigint;v_checksum text;v_validation jsonb;
begin
  select organization_id into v_org from public.restaurants where id=p_restaurant_id and active=true;
  if v_org is null then raise exception 'RESTAURANT_NOT_FOUND';end if;
  if not public.pos_actor_is_manager(p_actor_user_id,v_org,p_restaurant_id) then raise exception 'MANAGER_ACCESS_REQUIRED';end if;
  select revision into v_revision from public.pos_configuration_revisions where restaurant_id=p_restaurant_id for update;
  select * into v_draft from public.pos_configuration_bundle_drafts where restaurant_id=p_restaurant_id;
  if not found then raise exception 'BUNDLE_DRAFT_NOT_FOUND';end if;
  if v_revision is distinct from v_draft.source_revision or v_revision is distinct from p_expected_revision then raise exception 'BUNDLE_DRAFT_STALE';end if;
  v_validation:=public.pos_bundle_validate(p_restaurant_id,v_draft.document);
  if coalesce((v_validation->>'valid')::boolean,false)=false then raise exception 'BUNDLE_VALIDATION_FAILED:%',v_validation::text;end if;
  select coalesce(max(version),0)+1 into v_version from public.pos_configuration_bundle_versions where restaurant_id=p_restaurant_id;
  v_checksum:=encode(extensions.digest(v_draft.document::text,'sha256'),'hex');
  insert into public.pos_configuration_bundle_versions(restaurant_id,organization_id,version,source_revision,document,payload,checksum,published_by)
  values(p_restaurant_id,v_org,v_version,v_revision,v_draft.document,v_draft.document::text,v_checksum,p_actor_user_id);
  insert into public.pos_configuration_bundle_heads(restaurant_id,version) values(p_restaurant_id,v_version)
  on conflict(restaurant_id) do update set version=excluded.version,published_at=now();
  return jsonb_build_object('version',v_version,'sourceRevision',v_revision,'checksum',v_checksum,'validation',v_validation);
end;$$;
revoke all on function public.pos_bundle_publish(uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.pos_bundle_publish(uuid,uuid,bigint) to service_role;
