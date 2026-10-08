// Fail-closed policy for RevenueCat subscription lifecycle notifications.
// Google Play product IDs may include a :base_plan_id suffix.
const BILLING_EVENTS=new Set([
  'INITIAL_PURCHASE','RENEWAL','CANCELLATION','UNCANCELLATION',
  'BILLING_ISSUE','EXPIRATION','SUBSCRIPTION_PAUSED',
  'SUBSCRIPTION_EXTENDED','REFUND_REVERSED'
]);

export function classifyRevenueCatEvent(event){
  if(!event||typeof event!=='object'||Array.isArray(event))return{action:'ignore',reason:'INVALID_EVENT'};
  const type=String(event.type||'').trim().toUpperCase();
  if(type==='TEST')return{action:'ignore',reason:'TEST_EVENT'};
  // PRODUCT_CHANGE may announce a deferred downgrade/upgrade.
  // Change the purchased slot count only after actual purchase/renewal.
  if(type==='PRODUCT_CHANGE')return{action:'ignore',reason:'AWAIT_EFFECTIVE_PURCHASE'};
  // Transfers require authenticated subscriber reconciliation, not a grant.
  if(!BILLING_EVENTS.has(type))return{action:'ignore',reason:'UNSUPPORTED_EVENT'};
  const productId=String(event.product_id||event.product_identifier||'').trim();
  const match=/^remapro[_-]([1-5])(?::[a-z0-9][a-z0-9._-]*)?$/i.exec(productId);
  if(!match)return{action:'ignore',reason:'UNRELATED_PRODUCT'};
  const entitlementIds=Array.isArray(event.entitlement_ids)?event.entitlement_ids.map(String):[];
  if(entitlementIds.length&&!entitlementIds.includes('remapro'))return{action:'ignore',reason:'UNRELATED_ENTITLEMENT'};
  return{action:'process',type,productId,restaurantLimit:Number(match[1])};
}

export async function revenueCatEventRecordId(eventId){
  const raw=String(eventId||'');
  if(!raw||raw.length>256)throw new Error('INVALID_REVENUECAT_EVENT_ID');
  // The subscription_events.id PK is unique while revenuecat_event_id is
  // not. Hash a namespaced identifier to a stable UUID, so retries share
  // one storage identity without exposing raw third-party IDs in the PK.
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('remapro:revenuecat:'+raw)));
  bytes[6]=(bytes[6]&0x0f)|0x50;
  bytes[8]=(bytes[8]&0x3f)|0x80;
  const hex=Array.from(bytes.slice(0,16),byte=>byte.toString(16).padStart(2,'0')).join('');
  return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20,32)].join('-');
}
