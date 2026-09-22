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
function offeringPackage(offerings,plan,billing){
  const offering=offerings?.all?.[plan]||(offerings?.current?.identifier===plan?offerings.current:null);
  if(!offering)return null;
  return billing==='yearly'?(offering.annual||offering.availablePackages?.find(x=>x.identifier==='$rc_annual')):(offering.monthly||offering.availablePackages?.find(x=>x.identifier==='$rc_monthly'));
}
export async function purchasePlan(plan,billing){
  const p=plugin();if(!p)throw new Error('BILLING_UNAVAILABLE');
  const offerings=await p.getOfferings(),aPackage=offeringPackage(offerings,String(plan),String(billing));
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
  if(active.multi)return'multi';
  if(active.standard)return'standard';
  return'';
}
