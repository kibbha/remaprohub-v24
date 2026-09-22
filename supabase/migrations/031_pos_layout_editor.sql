-- ReMaPro POS issue #6: versioned cash-register layout drafts and immutable published revisions.
create table if not exists public.pos_layout_drafts (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  schema_version integer not null default 1 check (schema_version between 1 and 20),
  document jsonb not null default '{"schemaVersion":1,"pages":[],"categories":[],"buttons":[],"modifierGroups":[],"productModifiers":[],"menus":[]}'::jsonb,
  draft_revision bigint not null default 1,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create table if not exists public.pos_layout_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  version integer not null check (version > 0),
  schema_version integer not null check (schema_version between 1 and 20),
  document jsonb not null,
  checksum text not null,
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz not null default now(),
  unique(restaurant_id,version)
);
create index if not exists pos_layout_versions_restaurant_published_idx on public.pos_layout_versions(restaurant_id,version desc);
alter table public.pos_layout_drafts enable row level security;
alter table public.pos_layout_versions enable row level security;
revoke all on public.pos_layout_drafts from anon;
revoke all on public.pos_layout_versions from anon;
revoke insert,update,delete on public.pos_layout_drafts from authenticated;
revoke insert,update,delete on public.pos_layout_versions from authenticated;
grant select on public.pos_layout_drafts to authenticated;
grant select on public.pos_layout_versions to authenticated;
drop policy if exists pos_layout_drafts_select on public.pos_layout_drafts;
create policy pos_layout_drafts_select on public.pos_layout_drafts for select to authenticated using (public.is_restaurant_admin(restaurant_id));
drop policy if exists pos_layout_versions_select on public.pos_layout_versions;
create policy pos_layout_versions_select on public.pos_layout_versions for select to authenticated using (public.is_restaurant_member(restaurant_id));

create or replace function public.pos_validate_layout_document(p_document jsonb) returns void
language plpgsql security invoker set search_path=public as $$
declare v_pages integer;v_categories integer;v_buttons integer;v_modifiers integer;v_menus integer;
begin
  if p_document is null or jsonb_typeof(p_document)<>'object' then raise exception 'LAYOUT_DOCUMENT_REQUIRED';end if;
  if coalesce((p_document->>'schemaVersion')::integer,0)<>1 then raise exception 'LAYOUT_SCHEMA_UNSUPPORTED';end if;
  if jsonb_typeof(p_document->'pages')<>'array' or jsonb_typeof(p_document->'categories')<>'array'
    or jsonb_typeof(p_document->'buttons')<>'array' or jsonb_typeof(p_document->'modifierGroups')<>'array'
    or jsonb_typeof(p_document->'productModifiers')<>'array' or jsonb_typeof(p_document->'menus')<>'array'
  then raise exception 'LAYOUT_ARRAYS_REQUIRED';end if;
  v_pages:=jsonb_array_length(p_document->'pages');v_categories:=jsonb_array_length(p_document->'categories');
  v_buttons:=jsonb_array_length(p_document->'buttons');v_modifiers:=jsonb_array_length(p_document->'modifierGroups');
  v_menus:=jsonb_array_length(p_document->'menus');
  if v_pages>50 or v_categories>200 or v_buttons>1000 or v_modifiers>200 or v_menus>200 then raise exception 'LAYOUT_LIMIT_EXCEEDED';end if;
  if exists(select 1 from jsonb_array_elements(p_document->'buttons') b
    where nullif(trim(b->>'id'),'') is null or coalesce((b->>'w')::integer,1) not between 1 and 4 or coalesce((b->>'h')::integer,1) not between 1 and 4)
  then raise exception 'LAYOUT_BUTTON_INVALID';end if;
  if exists(select id from (select b->>'id' id from jsonb_array_elements(p_document->'buttons') b)x where id is not null group by id having count(*)>1)
  then raise exception 'LAYOUT_BUTTON_ID_DUPLICATE';end if;
end;$$;

create or replace function public.pos_publish_layout(p_restaurant_id uuid,p_actor_user_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_rest public.restaurants%rowtype;v_draft public.pos_layout_drafts%rowtype;v_version integer;v_row public.pos_layout_versions%rowtype;
begin
  select * into v_rest from public.restaurants where id=p_restaurant_id and active=true;
  if not found then raise exception 'RESTAURANT_NOT_FOUND';end if;
  if not public.pos_actor_is_manager(p_actor_user_id,v_rest.organization_id,p_restaurant_id) then raise exception 'MANAGER_ACCESS_REQUIRED';end if;
  select * into v_draft from public.pos_layout_drafts where restaurant_id=p_restaurant_id for update;
  if not found then raise exception 'LAYOUT_DRAFT_NOT_FOUND';end if;
  perform public.pos_validate_layout_document(v_draft.document);
  select coalesce(max(version),0)+1 into v_version from public.pos_layout_versions where restaurant_id=p_restaurant_id;
  insert into public.pos_layout_versions(organization_id,restaurant_id,version,schema_version,document,checksum,published_by)
  values(v_rest.organization_id,p_restaurant_id,v_version,v_draft.schema_version,v_draft.document,md5(v_draft.document::text),p_actor_user_id)
  returning * into v_row;
  return jsonb_build_object('id',v_row.id,'restaurantId',v_row.restaurant_id,'version',v_row.version,'schemaVersion',v_row.schema_version,'document',v_row.document,'checksum',v_row.checksum,'publishedAt',v_row.published_at);
end;$$;
revoke all on function public.pos_validate_layout_document(jsonb) from public,anon,authenticated;
revoke all on function public.pos_publish_layout(uuid,uuid) from public,anon,authenticated;
grant execute on function public.pos_validate_layout_document(jsonb) to service_role;
grant execute on function public.pos_publish_layout(uuid,uuid) to service_role;
