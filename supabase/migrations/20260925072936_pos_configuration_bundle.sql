-- First shared publication boundary for Hub-managed POS configuration.
-- Existing direct-write APIs remain available during migration to this contract.
create table public.pos_configuration_bundle_drafts (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  schema_version integer not null default 1 check (schema_version = 1),
  source_revision bigint not null check (source_revision > 0),
  document jsonb not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create table public.pos_configuration_bundle_versions (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  version bigint not null check (version > 0),
  schema_version integer not null default 1 check (schema_version = 1),
  source_revision bigint not null,
  document jsonb not null,
  payload text not null,
  checksum text not null,
  restored_from_version bigint,
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz not null default now(),
  primary key (restaurant_id,version)
);
create table public.pos_configuration_bundle_heads (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  version bigint not null check (version > 0),
  published_at timestamptz not null default now(),
  foreign key (restaurant_id,version) references public.pos_configuration_bundle_versions(restaurant_id,version)
);
create index pos_configuration_bundle_versions_org_idx on public.pos_configuration_bundle_versions(organization_id);
create index pos_configuration_bundle_drafts_org_idx on public.pos_configuration_bundle_drafts(organization_id);
alter table public.pos_configuration_bundle_drafts enable row level security;
alter table public.pos_configuration_bundle_versions enable row level security;
alter table public.pos_configuration_bundle_heads enable row level security;
revoke all on public.pos_configuration_bundle_drafts,public.pos_configuration_bundle_versions,public.pos_configuration_bundle_heads from public,anon,authenticated;
grant all on public.pos_configuration_bundle_drafts,public.pos_configuration_bundle_versions,public.pos_configuration_bundle_heads to service_role;

create function public.pos_bundle_deny_version_mutation() returns trigger
language plpgsql security invoker set search_path=public as $$
begin raise exception 'BUNDLE_VERSION_IMMUTABLE';end;$$;
create trigger pos_bundle_versions_immutable before update or delete on public.pos_configuration_bundle_versions
for each row execute function public.pos_bundle_deny_version_mutation();
create trigger pos_bundle_head_revision after insert or update on public.pos_configuration_bundle_heads
for each row execute function public.pos_bump_configuration_revision();

create function public.pos_bundle_snapshot(p_restaurant_id uuid) returns jsonb
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
      from public.pos_floor_plans f where f.restaurant_id=p_restaurant_id and f.active=true and f.published_document is not null limit 1)
  );
$$;

create function public.pos_bundle_save_draft(p_restaurant_id uuid,p_actor_user_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_org uuid;v_revision bigint;v_document jsonb;
begin
  select organization_id into v_org from public.restaurants where id=p_restaurant_id and active=true;
  if v_org is null then raise exception 'RESTAURANT_NOT_FOUND';end if;
  if not public.pos_actor_is_manager(p_actor_user_id,v_org,p_restaurant_id) then raise exception 'MANAGER_ACCESS_REQUIRED';end if;
  insert into public.pos_configuration_revisions(restaurant_id,revision) values(p_restaurant_id,1) on conflict do nothing;
  select revision into v_revision from public.pos_configuration_revisions where restaurant_id=p_restaurant_id for update;
  v_document:=public.pos_bundle_snapshot(p_restaurant_id);
  insert into public.pos_configuration_bundle_drafts(restaurant_id,organization_id,source_revision,document,updated_by)
  values(p_restaurant_id,v_org,v_revision,v_document,p_actor_user_id)
  on conflict(restaurant_id) do update set source_revision=excluded.source_revision,document=excluded.document,updated_by=excluded.updated_by,updated_at=now();
  return jsonb_build_object('sourceRevision',v_revision,'document',v_document);
end;$$;

create function public.pos_bundle_publish(p_restaurant_id uuid,p_actor_user_id uuid,p_expected_revision bigint) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_org uuid;v_revision bigint;v_draft public.pos_configuration_bundle_drafts%rowtype;v_version bigint;v_checksum text;
begin
  select organization_id into v_org from public.restaurants where id=p_restaurant_id and active=true;
  if v_org is null then raise exception 'RESTAURANT_NOT_FOUND';end if;
  if not public.pos_actor_is_manager(p_actor_user_id,v_org,p_restaurant_id) then raise exception 'MANAGER_ACCESS_REQUIRED';end if;
  select revision into v_revision from public.pos_configuration_revisions where restaurant_id=p_restaurant_id for update;
  select * into v_draft from public.pos_configuration_bundle_drafts where restaurant_id=p_restaurant_id;
  if not found then raise exception 'BUNDLE_DRAFT_NOT_FOUND';end if;
  if v_revision is distinct from v_draft.source_revision or v_revision is distinct from p_expected_revision then
    raise exception 'BUNDLE_DRAFT_STALE';
  end if;
  select coalesce(max(version),0)+1 into v_version from public.pos_configuration_bundle_versions where restaurant_id=p_restaurant_id;
  v_checksum:=encode(extensions.digest(v_draft.document::text,'sha256'),'hex');
  insert into public.pos_configuration_bundle_versions(restaurant_id,organization_id,version,source_revision,document,payload,checksum,published_by)
  values(p_restaurant_id,v_org,v_version,v_revision,v_draft.document,v_draft.document::text,v_checksum,p_actor_user_id);
  insert into public.pos_configuration_bundle_heads(restaurant_id,version) values(p_restaurant_id,v_version)
  on conflict(restaurant_id) do update set version=excluded.version,published_at=now();
  return jsonb_build_object('version',v_version,'sourceRevision',v_revision,'checksum',v_checksum);
end;$$;

create function public.pos_bundle_restore(p_restaurant_id uuid,p_actor_user_id uuid,p_version bigint) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_org uuid;v_source public.pos_configuration_bundle_versions%rowtype;v_next bigint;v_revision bigint;
begin
  select organization_id into v_org from public.restaurants where id=p_restaurant_id and active=true;
  if v_org is null then raise exception 'RESTAURANT_NOT_FOUND';end if;
  if not public.pos_actor_is_manager(p_actor_user_id,v_org,p_restaurant_id) then raise exception 'MANAGER_ACCESS_REQUIRED';end if;
  select revision into v_revision from public.pos_configuration_revisions where restaurant_id=p_restaurant_id for update;
  select * into v_source from public.pos_configuration_bundle_versions where restaurant_id=p_restaurant_id and version=p_version;
  if not found then raise exception 'BUNDLE_VERSION_NOT_FOUND';end if;
  select coalesce(max(version),0)+1 into v_next from public.pos_configuration_bundle_versions where restaurant_id=p_restaurant_id;
  insert into public.pos_configuration_bundle_versions(restaurant_id,organization_id,version,source_revision,document,payload,checksum,restored_from_version,published_by)
  values(p_restaurant_id,v_org,v_next,v_revision,v_source.document,v_source.payload,v_source.checksum,p_version,p_actor_user_id);
  insert into public.pos_configuration_bundle_heads(restaurant_id,version) values(p_restaurant_id,v_next)
  on conflict(restaurant_id) do update set version=excluded.version,published_at=now();
  return jsonb_build_object('version',v_next,'restoredFromVersion',p_version,'checksum',v_source.checksum);
end;$$;

revoke all on function public.pos_bundle_deny_version_mutation(),public.pos_bundle_snapshot(uuid),public.pos_bundle_save_draft(uuid,uuid),public.pos_bundle_publish(uuid,uuid,bigint),public.pos_bundle_restore(uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.pos_bundle_snapshot(uuid),public.pos_bundle_save_draft(uuid,uuid),public.pos_bundle_publish(uuid,uuid,bigint),public.pos_bundle_restore(uuid,uuid,bigint) to service_role;
