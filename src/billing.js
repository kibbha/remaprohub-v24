const plugin=()=>globalThis.Capacitor?.Plugins?.Purchases||null;
const apiKey=()=>String(globalThis.REMAPRO_REVENUECAT_ANDROID_API_KEY||'').trim();
let configuredFor='';

export function billingAvailable(){
  return !!(globalThis.Capacitor?.isNativePlatform?.()&&plugin()&&apiKey());
}
export async function configureBilling(userId,organizationId){
  const p=plugin(),key=apiKey(),uid=String(userId||''),org=String(organizationId||'');
  if(!p||!key||!uid||!org)return false;
  const appUserID=uid+':'+org;
  if(configuredFor===appUserID)return true;
  await p.configure({apiKey:key,appUserID});
  configuredFor=appUserID;
  return true;
}
export async function billingOfferings(){
  const p=plugin();if(!p)throw new Error('BILLING_UNAVAILABLE');
  return await p.getOfferings();
}
function offeringPackage(offerings,restaurantCount=1){
  const count=Math.min(5,Math.max(1,Math.trunc(Number(restaurantCount)||1)));
  const id='remapro_'+count;
  const offering=offerings?.all?.[id]||(offerings?.current?.identifier===id?offerings.current:null)||offerings?.all?.standard||(offerings?.current?.identifier==='standard'?offerings.current:null);
  if(!offering)return null;
  return offering.monthly||offering.availablePackages?.find(x=>x.identifier==='$rc_monthly')||offering.availablePackages?.[0]||null;
}
export async function purchasePlan(restaurantCount=1){
  const p=plugin();if(!p)throw new Error('BILLING_UNAVAILABLE');
  const offerings=await p.getOfferings(),aPackage=offeringPackage(offerings,restaurantCount);
  if(!aPackage)throw new Error('BILLING_PACKAGE_MISSING');
  return await p.purchasePackage({aPackage});
}
export async function restorePurchases(){
  const p=plugin();if(!p)throw new Error('BILLING_UNAVAILABLE');
  return await p.restorePurchases();
}
export async function customerInfo(){
  const p=plugin();if(!p)throw new Error('BILLING_UNAVAILABLE');
  return await p.getCustomerInfo();
}
export function entitlementPlan(info){
  const active=info?.customerInfo?.entitlements?.active||info?.entitlements?.active||{};
  if(active.remapro)return'remapro';
  if(active.multi)return'multi';
  if(active.standard)return'standard';
  return'';
}
