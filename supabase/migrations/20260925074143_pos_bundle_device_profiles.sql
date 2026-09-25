-- Static printer/KDS routes and terminal payment capabilities join the bundle.
-- Connectivity and health remain live: never publish status/last_seen timestamps.
create or replace function public.pos_bundle_snapshot(p_restaurant_id uuid) returns jsonb
language sql security definer set search_path=public as $$
  select jsonb_build_object(
    'schemaVersion',1,
    'catalog',coalesce((select jsonb_agg(to_jsonb(c) order by c.sort_order,c.name,c.id)
      from (select id,source_key,recipe_id,sku,name,category,item_type,price,tax_rate,production_station,active,sort_order,metadata,version,updated_at
            from public.pos_catalog_items where restaurant_id=p_restaurant_id and active=true) c),'[]'::jsonb),
    'layout',(select jsonb_build_object('version',l.version,'schemaVersion',l.schema_version,'document',l.document,'checksum',l.checksum,'publishedAt',l.published_at)
      from public.pos_layout_versions l where l.restaurant_id=p_restaurant_id order by l.version desc limit 1),
    'tables',coalesce((select jsonb_agg(to_jsonb(t) order by t.sort_order,t.label,t.id)
      from (select id,label,area,seats,sort_order,x,y,active,updated_at from public.pos_tables where restaurant_id=p_restaurant_id) t),'[]'::jsonb),
    'floorPlan',(select jsonb_build_object('id',f.id,'name',f.name,'document',f.published_document,'version',f.published_version,'publishedAt',f.published_at)
      from public.pos_floor_plans f where f.restaurant_id=p_restaurant_id and f.active=true and f.published_document is not null limit 1),
    'printers',coalesce((select jsonb_agg(to_jsonb(p) order by p.role,p.label,p.id)
      from (select id,device_id,label,role,connection_type,address,chars_per_line,codepage,auto_print,cut_after_print,active,public_config
            from public.pos_printers where restaurant_id=p_restaurant_id) p),'[]'::jsonb),
    'terminals',coalesce((select jsonb_agg(to_jsonb(t) order by t.label,t.id)
      from (select id,device_id,label,provider,integration_mode,external_terminal_id,currency,supports_card,supports_twint,supports_tips,supports_refunds,active
            from public.pos_payment_terminals where restaurant_id=p_restaurant_id) t),'[]'::jsonb)
  );
$$;

-- A health update must not supersede an otherwise valid published bundle.
drop trigger if exists pos_printers_config_revision on public.pos_printers;
create trigger pos_printers_config_revision
after insert or delete or update of device_id,label,role,connection_type,address,chars_per_line,codepage,auto_print,cut_after_print,active,public_config
on public.pos_printers for each row execute function public.pos_bump_configuration_revision();
drop trigger if exists pos_payment_terminals_config_revision on public.pos_payment_terminals;
create trigger pos_payment_terminals_config_revision
after insert or delete or update of device_id,label,provider,integration_mode,external_terminal_id,currency,supports_card,supports_twint,supports_tips,supports_refunds,active,public_config
on public.pos_payment_terminals for each row execute function public.pos_bump_configuration_revision();

create function public.pos_bundle_validate_device_profiles() returns trigger
language plpgsql security invoker set search_path=public as $$
begin
  if exists(select 1 from jsonb_array_elements(coalesce(new.document->'printers','[]'::jsonb)) item
    where coalesce((item->>'active')::boolean,true) and not exists
      (select 1 from public.pos_printers p where p.restaurant_id=new.restaurant_id and p.id::text=item->>'id' and p.active=true))
  then raise exception 'BUNDLE_RESTORE_PRINTER_MISSING';end if;
  if exists(select 1 from jsonb_array_elements(coalesce(new.document->'terminals','[]'::jsonb)) item
    where coalesce((item->>'active')::boolean,true) and not exists
      (select 1 from public.pos_payment_terminals t where t.restaurant_id=new.restaurant_id and t.id::text=item->>'id' and t.active=true))
  then raise exception 'BUNDLE_RESTORE_TERMINAL_MISSING';end if;
  return new;
end;$$;
create trigger pos_bundle_version_device_guard before insert on public.pos_configuration_bundle_versions
for each row execute function public.pos_bundle_validate_device_profiles();
revoke all on function public.pos_bundle_validate_device_profiles() from public,anon,authenticated;
revoke all on function public.pos_bundle_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.pos_bundle_snapshot(uuid) to service_role;
