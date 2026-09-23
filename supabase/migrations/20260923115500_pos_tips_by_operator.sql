-- ReMaPro POS — attribute tips to the authenticated POS operator handling the payment.

alter table public.pos_payments
  add column if not exists tip_operator_id uuid references public.pos_operators(id) on delete set null,
  add column if not exists tip_operator_name_snapshot text;

create index if not exists pos_payments_tip_operator_idx
  on public.pos_payments(tip_operator_id,paid_at desc)
  where tip_amount>0;

create or replace function private.pos_attribute_terminal_tip()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_operator_id uuid;
  v_operator_name text;
  v_intent_id uuid;
  v_order_restaurant uuid;
begin
  if coalesce(new.tip_amount,0)<=0 or new.tip_operator_id is not null then return new; end if;

  begin
    v_operator_id:=nullif(new.metadata->>'tipOperatorId','')::uuid;
  exception when invalid_text_representation then
    v_operator_id:=null;
  end;
  v_operator_name:=nullif(left(trim(coalesce(new.metadata->>'tipOperatorName','')),120),'');

  if v_operator_id is null then
    begin
      v_intent_id:=nullif(new.metadata->>'terminalIntentId','')::uuid;
    exception when invalid_text_representation then
      v_intent_id:=null;
    end;
    if v_intent_id is not null then
      select
        nullif(i.metadata->>'tipOperatorId','')::uuid,
        nullif(left(trim(coalesce(i.metadata->>'tipOperatorName','')),120),'')
      into v_operator_id,v_operator_name
      from public.pos_payment_intents i
      where i.id=v_intent_id;
    end if;
  end if;

  if v_operator_id is null then return new; end if;
  select restaurant_id into v_order_restaurant from public.pos_orders where id=new.order_id;
  if not exists(
    select 1 from public.pos_operators o
    where o.id=v_operator_id and o.restaurant_id=v_order_restaurant
  ) then return new; end if;

  update public.pos_payments
  set tip_operator_id=v_operator_id,
      tip_operator_name_snapshot=coalesce(v_operator_name,(select display_name from public.pos_operators where id=v_operator_id))
  where id=new.id and tip_operator_id is null;
  return new;
end;
$$;

revoke all on function private.pos_attribute_terminal_tip() from public,anon,authenticated;

drop trigger if exists pos_payments_tip_operator_trigger on public.pos_payments;
create trigger pos_payments_tip_operator_trigger
after insert on public.pos_payments
for each row execute function private.pos_attribute_terminal_tip();

comment on column public.pos_payments.tip_operator_id is
'POS operator credited with this payment tip. Null only for legacy/unattributed tips.';
comment on column public.pos_payments.tip_operator_name_snapshot is
'Immutable display-name snapshot used for historical tip reporting.';
