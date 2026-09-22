-- ReMaPro POS v0.15: synchronized printer profiles for receipt/kitchen/bar.
create table if not exists public.pos_printers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  device_id uuid references public.pos_devices(id) on delete set null,
  label text not null,
  role text not null check (role in ('receipt','kitchen','bar')),
  connection_type text not null check (connection_type in ('bluetooth','usb','system','network')),
  address text,
  chars_per_line integer not null default 42 check (chars_per_line between 24 and 80),
  codepage text not null default 'ascii',
  auto_print boolean not null default false,
  cut_after_print boolean not null default true,
  active boolean not null default true,
  status text not null default 'unknown' check (status in ('unknown','online','offline','error')),
  last_tested_at timestamptz,
  public_config jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(restaurant_id,label)
);
create index if not exists pos_printers_restaurant_idx on public.pos_printers(restaurant_id,role,active);
create index if not exists pos_printers_device_idx on public.pos_printers(device_id);
drop trigger if exists pos_printers_updated_at on public.pos_printers;
create trigger pos_printers_updated_at before update on public.pos_printers for each row execute function public.set_updated_at();
alter table public.pos_printers enable row level security;
revoke all on public.pos_printers from anon;
revoke insert,update,delete on public.pos_printers from authenticated;
grant select on public.pos_printers to authenticated;
drop policy if exists pos_printers_select on public.pos_printers;
create policy pos_printers_select on public.pos_printers for select to authenticated using (public.is_restaurant_member(restaurant_id));

CREATE OR REPLACE FUNCTION public.pos_set_printer_status(p_printer_id uuid, p_status text, p_actor_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row public.pos_printers%rowtype;
  v_status text:=lower(trim(coalesce(p_status,'')));
begin
  select * into v_row from public.pos_printers where id=p_printer_id for update;
  if not found then raise exception 'PRINTER_NOT_FOUND'; end if;
  if not public.pos_actor_has_access(p_actor_user_id,v_row.organization_id,v_row.restaurant_id) then
    raise exception 'POS_ACCESS_DENIED';
  end if;
  if v_status not in ('unknown','online','offline','error') then raise exception 'INVALID_PRINTER_STATUS'; end if;

  update public.pos_printers
  set status=v_status,last_tested_at=now(),updated_by=p_actor_user_id
  where id=p_printer_id returning * into v_row;

  return to_jsonb(v_row);
end;
$function$;

CREATE OR REPLACE FUNCTION public.pos_upsert_printer(p_printer_id uuid, p_restaurant_id uuid, p_device_id uuid, p_label text, p_role text, p_connection_type text, p_address text, p_chars_per_line integer, p_codepage text, p_auto_print boolean, p_cut_after_print boolean, p_active boolean, p_public_config jsonb, p_actor_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rest public.restaurants%rowtype;
  v_row public.pos_printers%rowtype;
  v_id uuid:=coalesce(p_printer_id,gen_random_uuid());
  v_label text:=left(trim(coalesce(p_label,'')),120);
  v_role text:=lower(trim(coalesce(p_role,'')));
  v_type text:=lower(trim(coalesce(p_connection_type,'')));
  v_chars integer:=coalesce(p_chars_per_line,42);
begin
  select * into v_rest from public.restaurants where id=p_restaurant_id and active=true;
  if not found then raise exception 'RESTAURANT_NOT_FOUND'; end if;
  if not public.pos_actor_is_manager(p_actor_user_id,v_rest.organization_id,p_restaurant_id) then
    raise exception 'MANAGER_ACCESS_REQUIRED';
  end if;
  if v_label='' then raise exception 'PRINTER_LABEL_REQUIRED'; end if;
  if v_role not in ('receipt','kitchen','bar') then raise exception 'INVALID_PRINTER_ROLE'; end if;
  if v_type not in ('bluetooth','usb','system','network') then raise exception 'INVALID_PRINTER_TYPE'; end if;
  if v_chars<24 or v_chars>80 then raise exception 'INVALID_PRINTER_WIDTH'; end if;
  if p_device_id is not null and not exists(
    select 1 from public.pos_devices d where d.id=p_device_id and d.restaurant_id=p_restaurant_id
  ) then raise exception 'POS_DEVICE_INVALID'; end if;

  insert into public.pos_printers(
    id,organization_id,restaurant_id,device_id,label,role,connection_type,address,
    chars_per_line,codepage,auto_print,cut_after_print,active,public_config,created_by,updated_by
  ) values(
    v_id,v_rest.organization_id,p_restaurant_id,p_device_id,v_label,v_role,v_type,
    nullif(left(trim(coalesce(p_address,'')),240),''),
    v_chars,left(trim(coalesce(nullif(p_codepage,''),'ascii')),40),
    coalesce(p_auto_print,false),coalesce(p_cut_after_print,true),coalesce(p_active,true),
    case when jsonb_typeof(p_public_config)='object' then p_public_config else '{}'::jsonb end,
    p_actor_user_id,p_actor_user_id
  )
  on conflict(id) do update set
    device_id=excluded.device_id,label=excluded.label,role=excluded.role,
    connection_type=excluded.connection_type,address=excluded.address,
    chars_per_line=excluded.chars_per_line,codepage=excluded.codepage,
    auto_print=excluded.auto_print,cut_after_print=excluded.cut_after_print,
    active=excluded.active,public_config=excluded.public_config,updated_by=p_actor_user_id
  where public.pos_printers.restaurant_id=p_restaurant_id
  returning * into v_row;

  if not found then raise exception 'PRINTER_UPDATE_DENIED'; end if;

  insert into public.pos_event_log(
    client_event_id,organization_id,restaurant_id,device_id,actor_user_id,
    entity_type,entity_id,event_type,payload,occurred_at
  ) values(
    gen_random_uuid(),v_row.organization_id,v_row.restaurant_id,v_row.device_id,p_actor_user_id,
    'printer',v_row.id,'pos.printer.configured',
    jsonb_build_object('label',v_row.label,'role',v_row.role,'type',v_row.connection_type,'active',v_row.active),now()
  );

  return to_jsonb(v_row);
end;
$function$;


revoke all on function public.pos_upsert_printer(uuid,uuid,uuid,text,text,text,text,integer,text,boolean,boolean,boolean,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.pos_set_printer_status(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.pos_upsert_printer(uuid,uuid,uuid,text,text,text,text,integer,text,boolean,boolean,boolean,jsonb,uuid) to service_role;
grant execute on function public.pos_set_printer_status(uuid,text,uuid) to service_role;
