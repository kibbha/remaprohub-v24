-- ReMaPro POS: lightweight Hub -> POS configuration revision tracking.
-- POS devices poll one small row and reload managed configuration only after an actual Hub change.

create table if not exists public.pos_configuration_revisions (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);

alter table public.pos_configuration_revisions enable row level security;
revoke all on public.pos_configuration_revisions from anon;
revoke insert,update,delete on public.pos_configuration_revisions from authenticated;
grant select on public.pos_configuration_revisions to authenticated;

drop policy if exists pos_configuration_revisions_select on public.pos_configuration_revisions;
create policy pos_configuration_revisions_select on public.pos_configuration_revisions
for select to authenticated using (public.is_restaurant_member(restaurant_id));

insert into public.pos_configuration_revisions(restaurant_id,revision,updated_at)
select id,1,now() from public.restaurants
on conflict(restaurant_id) do nothing;

create or replace function public.pos_bump_configuration_revision() returns trigger
language plpgsql security invoker set search_path=public as $
declare v_restaurant_id uuid;
begin
  v_restaurant_id:=case when tg_op='DELETE' then old.restaurant_id else new.restaurant_id end;
  if v_restaurant_id is null then return coalesce(new,old); end if;
  insert into public.pos_configuration_revisions(restaurant_id,revision,updated_at)
  values(v_restaurant_id,1,now())
  on conflict(restaurant_id) do update
    set revision=public.pos_configuration_revisions.revision+1,updated_at=excluded.updated_at;
  return coalesce(new,old);
end;$$;

revoke all on function public.pos_bump_configuration_revision() from public,anon,authenticated;
grant execute on function public.pos_bump_configuration_revision() to service_role;

drop trigger if exists pos_catalog_config_revision on public.pos_catalog_items;
create trigger pos_catalog_config_revision after insert or update or delete on public.pos_catalog_items
for each row execute function public.pos_bump_configuration_revision();

drop trigger if exists pos_tables_config_revision on public.pos_tables;
create trigger pos_tables_config_revision after insert or update or delete on public.pos_tables
for each row execute function public.pos_bump_configuration_revision();

drop trigger if exists pos_operators_config_revision on public.pos_operators;
create trigger pos_operators_config_revision after insert or update or delete on public.pos_operators
for each row execute function public.pos_bump_configuration_revision();

drop trigger if exists pos_printers_config_revision on public.pos_printers;
create trigger pos_printers_config_revision after insert or update or delete on public.pos_printers
for each row execute function public.pos_bump_configuration_revision();

drop trigger if exists pos_payment_terminals_config_revision on public.pos_payment_terminals;
create trigger pos_payment_terminals_config_revision after insert or update or delete on public.pos_payment_terminals
for each row execute function public.pos_bump_configuration_revision();

drop trigger if exists pos_provider_connections_config_revision on public.pos_provider_connections;
create trigger pos_provider_connections_config_revision after insert or update or delete on public.pos_provider_connections
for each row execute function public.pos_bump_configuration_revision();

drop trigger if exists pos_layout_versions_config_revision on public.pos_layout_versions;
create trigger pos_layout_versions_config_revision after insert or update or delete on public.pos_layout_versions
for each row execute function public.pos_bump_configuration_revision();
