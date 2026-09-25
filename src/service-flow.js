export const OPEN_ORDER_STATUSES=['open','sent','preparing','served','payment_pending'];

export function parseCashAmount(value){
  const raw=String(value??'').trim().replace(',','.');
  if(!/^\d+(?:\.\d{1,2})?$/.test(raw))return null;
  const n=Number(raw);
  return Number.isFinite(n)&&n>=0?n:null;
}

// A server refresh must not erase a note whose local changes are still queued.
export function mergePendingOrders(remote=[],local=[],queue=[],restaurantId=''){
  const pending=new Set(queue.filter(x=>x.restaurantId===restaurantId).map(x=>x.payload?.order?.id||x.payload?.orderId).filter(Boolean));
  const rows=new Map(remote.map(x=>[x.id,x]));
  for(const order of local)if(pending.has(order.id))rows.set(order.id,order);
  return [...rows.values()];
}

export function closingChecks(state){
  const pending=(state.pendingQueue||[]).filter(x=>x.restaurantId===state.restaurant?.id);
  const open=(state.openOrders||[]).filter(x=>OPEN_ORDER_STATUSES.includes(x.status));
  const draft=(state.cart||[]).filter(x=>!x.locked||x.delta);
  const terminals=(state.terminalIntents||[]).filter(x=>['created','pending','authorized'].includes(x.status));
  return {pending:pending.length,open:open.length,draft:draft.length,terminals:terminals.length,
    canClose:state.cashSession?.status==='open'&&!pending.length&&!open.length&&!draft.length&&!terminals.length&&!state.paymentBusy};
}

export function syncIndicator(state){
  const rows=(state.pendingQueue||[]).filter(x=>x.restaurantId===state.restaurant?.id);
  if(!state.online)return {key:'serviceSyncOffline',tone:'offline',count:rows.length};
  if(rows.some(x=>x.last_error))return {key:'serviceSyncError',tone:'error',count:rows.length};
  if(rows.length)return {key:'serviceSyncPending',tone:'pending',count:rows.length};
  return {key:state.syncConfirmedAt?'serviceSyncConfirmed':'serviceSyncEmpty',tone:state.syncConfirmedAt?'confirmed':'idle',count:0};
}
