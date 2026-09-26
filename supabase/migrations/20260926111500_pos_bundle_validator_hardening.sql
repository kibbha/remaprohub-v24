CREATE OR REPLACE FUNCTION public.pos_bundle_validate(p_restaurant_id uuid, p_document jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
 v_errors jsonb:='[]'::jsonb; v_catalog jsonb; v_tables jsonb; v_layout jsonb; v_mods jsonb; v_buttons jsonb; v_menus jsonb; v_printers jsonb; v_terminals jsonb; v_payments jsonb; v_elements jsonb;
 v_catalog_ids text[]:='{}'; v_table_ids text[]:='{}'; v_modifier_ids text[]:='{}'; v_button jsonb; v_menu jsonb; v_choice jsonb; v_ref text; v_active text;
begin
 if p_document is null or jsonb_typeof(p_document)<>'object' then return jsonb_build_object('valid',false,'errors',jsonb_build_array(jsonb_build_object('code','BUNDLE_DOCUMENT_REQUIRED'))); end if;
 if coalesce(p_document->>'schemaVersion','') !~ '^[0-9]+$' or (p_document->>'schemaVersion')::int<>1 then v_errors:=v_errors||jsonb_build_array(jsonb_build_object('code','BUNDLE_SCHEMA_UNSUPPORTED','path','schemaVersion')); end if;
 v_catalog:=case when jsonb_typeof(p_document->'catalog')='array' then p_document->'catalog' else '[]'::jsonb end;
 v_tables:=case when jsonb_typeof(p_document->'tables')='array' then p_document->'tables' else '[]'::jsonb end;
 if jsonb_typeof(p_document->'catalog') is distinct from 'array' then v_errors:=v_errors||jsonb_build_array(jsonb_build_object('code','CATALOG_ARRAY_REQUIRED','path','catalog')); end if;
 if jsonb_typeof(p_document->'tables') is distinct from 'array' then v_errors:=v_errors||jsonb_build_array(jsonb_build_object('code','TABLES_ARRAY_REQUIRED','path','tables')); end if;
 select coalesce(array_agg(x->>'id') filter(where nullif(x->>'id','') is not null),'{}') into v_catalog_ids from jsonb_array_elements(v_catalog)x;
 select coalesce(array_agg(x->>'id') filter(where nullif(x->>'id','') is not null),'{}') into v_table_ids from jsonb_array_elements(v_tables)x;
 if exists(select 1 from jsonb_array_elements(v_catalog)x where nullif(x->>'id','') is null) then v_errors:=v_errors||jsonb_build_array(jsonb_build_object('code','CATALOG_ID_REQUIRED','path','catalog')); end if;
 if exists(select 1 from jsonb_array_elements(v_catalog)x group by x->>'id' having count(*)>1) then v_errors:=v_errors||jsonb_build_array(jsonb_build_object('code','CATALOG_ID_DUPLICATE','path','catalog')); end if;
 if exists(select 1 from jsonb_array_elements(v_tables)x group by x->>'id' having count(*)>1) then v_errors:=v_errors||jsonb_build_array(jsonb_build_object('code','TABLE_ID_DUPLICATE','path','tables')); end if;
 v_layout:=case when jsonb_typeof(p_document#>'{layout,document}')='object' then p_document#>'{layout,document}' else '{}'::jsonb end;
 v_mods:=case when jsonb_typeof(v_layout->'modifierGroups')='array' then v_layout->'modifierGroups' else '[]'::jsonb end;
 v_buttons:=case when jsonb_typeof(v_layout->'buttons')='array' then v_layout->'buttons' else '[]'::jsonb end;
 v_menus:=case when jsonb_typeof(v_layout->'menus')='array' then v_layout->'menus' else '[]'::jsonb end;
 select coalesce(array_agg(x->>'id') filter(where nullif(x->>'id','') is not null),'{}') into v_modifier_ids from jsonb_array_elements(v_mods)x;
 if exists(select 1 from jsonb_array_elements(v_mods)x group by x->>'id' having count(*)>1) then v_errors:=v_errors||jsonb_build_array(jsonb_build_object('code','MODIFIER_ID_DUPLICATE','path','layout.modifierGroups')); end if;
 for v_button in select value from jsonb_array_elements(v_buttons) loop
  v_ref:=nullif(v_button->>'productId','');
  if v_ref is not null and not(v_ref=any(v_catalog_ids)) then v_errors:=v_errors||jsonb_build_array(jsonb_build_object('code','LAYOUT_PRODUCT_MISSING','path','layout.buttons.'||coalesce(v_button->>'id','?'),'ref',v_ref)); end if;
  if v_ref is null and jsonb_typeof(v_button->'item')<>'object' then v_errors:=v_errors||jsonb_build_array(jsonb_build_object('code','LAYOUT_BUTTON_UNRESOLVED','path','layout.buttons.'||coalesce(v_button->>'id','?'))); end if;
  if jsonb_typeof(v_button->'modifierGroupIds')='array' then for v_ref in select value#>>'{}' from jsonb_array_elements(v_button->'modifierGroupIds') loop if not(v_ref=any(v_modifier_ids)) then v_errors:=v_errors||jsonb_build_array(jsonb_build_object('code','LAYOUT_MODIFIER_MISSING','path','layout.buttons.'||coalesce(v_button->>'id','?'),'ref',v_ref)); end if; end loop; end if;
 end loop;
 for v_menu in select value from jsonb_array_elements(v_menus) loop
  v_ref:=nullif(v_menu->>'productId',''); if v_ref is not null and not(v_ref=any(v_catalog_ids)) then v_errors:=v_errors||jsonb_build_array(jsonb_build_object('code','MENU_PRODUCT_MISSING','path','layout.menus.'||coalesce(v_menu->>'id','?'),'ref',v_ref)); end if;
  if jsonb_typeof(v_menu->'choices')='array' then for v_choice in select value from jsonb_array_elements(v_menu->'choices') loop if jsonb_typeof(v_choice->'productIds')='array' then for v_ref in select value#>>'{}' from jsonb_array_elements(v_choice->'productIds') loop if not(v_ref=any(v_catalog_ids)) then v_errors:=v_errors||jsonb_build_array(jsonb_build_object('code','MENU_CHOICE_PRODUCT_MISSING','path','layout.menus.'||coalesce(v_menu->>'id','?'),'ref',v_ref)); end if; end loop; end if; end loop; end if;
 end loop;
 if jsonb_typeof(p_document->'floorPlan')='object' then
  v_elements:=case when jsonb_typeof(p_document#>'{floorPlan,document,elements}')='array' then p_document#>'{floorPlan,document,elements}' else '[]'::jsonb end;
  for v_choice in select value from jsonb_array_elements(v_elements) loop
   if v_choice->>'type'='table' then v_active:=lower(coalesce(v_choice->>'active','true')); if v_active not in('false','0','no','off') then v_ref:=v_choice->>'tableId'; if nullif(v_ref,'') is null or not(v_ref=any(v_table_ids)) then v_errors:=v_errors||jsonb_build_array(jsonb_build_object('code','FLOOR_TABLE_MISSING','path','floorPlan','ref',coalesce(v_ref,''))); end if; end if; end if;
  end loop;
 end if;
 v_printers:=case when jsonb_typeof(p_document->'printers')='array' then p_document->'printers' else '[]'::jsonb end; v_terminals:=case when jsonb_typeof(p_document->'terminals')='array' then p_document->'terminals' else '[]'::jsonb end;
 if exists(select 1 from jsonb_array_elements(v_printers)x group by x->>'id' having count(*)>1) then v_errors:=v_errors||jsonb_build_array(jsonb_build_object('code','PRINTER_ID_DUPLICATE','path','printers')); end if;
 if exists(select 1 from jsonb_array_elements(v_terminals)x group by x->>'id' having count(*)>1) then v_errors:=v_errors||jsonb_build_array(jsonb_build_object('code','TERMINAL_ID_DUPLICATE','path','terminals')); end if;
 v_payments:=case when jsonb_typeof(p_document#>'{settings,payments}')='object' then p_document#>'{settings,payments}' else '{}'::jsonb end;
 if not exists(select 1 from jsonb_each(v_payments)p where p.value='true'::jsonb) then v_errors:=v_errors||jsonb_build_array(jsonb_build_object('code','PAYMENT_METHOD_REQUIRED','path','settings.payments')); end if;
 return jsonb_build_object('valid',jsonb_array_length(v_errors)=0,'errors',v_errors);
exception when others then return jsonb_build_object('valid',false,'errors',jsonb_build_array(jsonb_build_object('code','BUNDLE_VALIDATION_ERROR','detail',sqlstate)));
end;$function$
;

revoke all on function public.pos_bundle_validate(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pos_bundle_validate(uuid,jsonb) to service_role;
