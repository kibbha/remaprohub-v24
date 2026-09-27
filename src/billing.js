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
const packageProductIdentifier=aPackage=>String(aPackage?.product?.identifier||aPackage?.product?.productId||'');
const packageMatchesCount=(aPackage,count)=>{
  const expected='remapro_'+count;
  const values=[aPackage?.identifier,packageProductIdentifier(aPackage)].map(v=>String(v||''));
  return values.some(value=>value===expected||new RegExp('remapro[_-]'+count+'(?:\\D|$)','i').test(value));
};
function offeringPackage(offerings,restaurantCount=1){
  const count=Math.min(5,Math.max(1,Math.trunc(Number(restaurantCount)||1)));
  const id='remapro_'+count;
  const direct=offerings?.all?.[id]||(offerings?.current?.identifier===id?offerings.current:null);
  const directPackage=direct&&(direct.monthly||direct.availablePackages?.find(x=>x.identifier==='$rc_monthly')||direct.availablePackages?.find(x=>packageMatchesCount(x,count))||direct.availablePackages?.[0]);
  if(directPackage)return directPackage;
  for(const offering of Object.values(offerings?.all||{})){
    const packages=Array.isArray(offering?.availablePackages)?offering.availablePackages:[];
    const match=packages.find(x=>packageMatchesCount(x,count));
    if(match)return match;
  }
  const legacy=offerings?.all?.standard||(offerings?.current?.identifier==='standard'?offerings.current:null);
  return legacy&&(legacy.monthly||legacy.availablePackages?.find(x=>x.identifier==='$rc_monthly')||legacy.availablePackages?.[0])||null;
}
export async function purchasePlan(restaurantCount=1){
  const p=plugin();if(!p)throw new Error('BILLING_UNAVAILABLE');
  const offerings=await p.getOfferings(),aPackage=offeringPackage(offerings,restaurantCount);
  if(!aPackage)throw new Error('BILLING_PACKAGE_MISSING');
  const options={aPackage};
  try{
    const info=await p.getCustomerInfo(),customer=info?.customerInfo||info||{};
    const target=packageProductIdentifier(aPackage);
    const active=Array.isArray(customer?.activeSubscriptions)?customer.activeSubscriptions.map(String):[];
    const oldProductIdentifier=active.find(id=>id&&id!==target)||'';
    if(oldProductIdentifier&&target&&oldProductIdentifier!==target)options.storeProductChangeInfo={oldProductIdentifier};
  }catch{}
  return await p.purchasePackage(options);
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
