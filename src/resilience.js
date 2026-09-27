export function queuedPayload(item={}){
  const payload=item?.payload&&typeof item.payload==='object'?item.payload:{};
  return{...payload,clientEventId:payload.clientEventId||item?.client_event_id||''};
}

export function queueRetryDelayMs(attempts){
  const n=Math.max(1,Number(attempts)||1);
  return Math.min(60000,1000*(2**Math.min(6,n-1)));
}

export function queueRetryDue(item,now=Date.now()){
  const at=Date.parse(item?.next_retry_at||'');
  return !Number.isFinite(at)||at<=now;
}

export function definitiveQueueRejection(error){
  const status=Number(error?.status)||0;
  return [400,402,403,404,409].includes(status);
}
