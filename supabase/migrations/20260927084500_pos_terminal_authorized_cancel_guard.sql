-- ReMaPro pre-launch audit: an authorized card/TWINT intent may already
-- reserve funds at the provider. Never mark it cancelled locally without a
-- provider-confirmed void/reversal path.

create or replace function public.pos_cancel_payment_intent(
  p_intent_id uuid,
  p_actor_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_intent public.pos_payment_intents%rowtype;
begin
  select * into v_intent from public.pos_payment_intents where id=p_intent_id for update;
  if not found then raise exception 'PAYMENT_INTENT_NOT_FOUND'; end if;
  if not public.pos_actor_has_access(p_actor_user_id,v_intent.organization_id,v_intent.restaurant_id) then
    raise exception 'POS_ACCESS_DENIED';
  end if;
  if v_intent.status='cancelled' then
    return jsonb_build_object('ok',true,'idempotent',true,'intent',to_jsonb(v_intent));
  end if;
  if v_intent.status='authorized' then
    raise exception 'AUTHORIZED_INTENT_REQUIRES_PROVIDER_VOID';
  end if;
  if v_intent.status not in ('created','pending') then
    raise exception 'PAYMENT_INTENT_NOT_CANCELLABLE';
  end if;

  update public.pos_payment_intents
  set status='cancelled',completed_by=p_actor_user_id,completed_at=now()
  where id=p_intent_id
  returning * into v_intent;

  return jsonb_build_object('ok',true,'idempotent',false,'intent',to_jsonb(v_intent));
end;
$$;

revoke all on function public.pos_cancel_payment_intent(uuid,uuid) from public,anon,authenticated;
grant execute on function public.pos_cancel_payment_intent(uuid,uuid) to service_role;
