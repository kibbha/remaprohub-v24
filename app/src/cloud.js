import{recordDiagnostic}from'./telemetry.js';
const cloudDiag=(type,error,details={})=>recordDiagnostic(type,{...details,message:error?.message||String(error||'unknown')});
const URL_KEY='remaprohub-sb-url';
const KEY_KEY='remaprohub-sb-key';
const SESSION_KEY='remaprohub-sb-session';
const IDENTITY_KEY='remaprohub-cloud-identity';
let SESSION_CACHE=null,SESSION_READY=false;
const secureStorage=()=>globalThis.Capacitor?.isNativePlatform?.()?globalThis.Capacitor?.Plugins?.SecureStoragePlugin:null;
function parseSession(raw){try{const value=typeof raw==='string'?JSON.parse(raw):raw;return value&&typeof value==='object'&&value.access_token&&value.refresh_token?value:null}catch{return null}}
async function removeStoredSession(){SESSION_CACHE=null;SESSION_READY=true;localStorage.removeItem(SESSION_KEY);localStorage.removeItem(IDENTITY_KEY);const plugin=secureStorage();if(plugin){try{await plugin.remove({key:SESSION_KEY})}catch(error){cloudDiag('cloud.secure_storage_remove_error',error,{key:'session'})}try{await plugin.remove({key:IDENTITY_KEY})}catch(error){cloudDiag('cloud.secure_storage_remove_error',error,{key:'identity'})}}}
async function persistCloudIdentity(identity){if(!identity||typeof identity!=='object')return false;const raw=JSON.stringify(identity),plugin=secureStorage();if(plugin){await plugin.set({key:IDENTITY_KEY,value:raw});localStorage.removeItem(IDENTITY_KEY)}else localStorage.setItem(IDENTITY_KEY,raw);return identity}
export async function loadCachedCloudIdentity(){const plugin=secureStorage();let raw='';if(plugin)try{raw=String((await plugin.get({key:IDENTITY_KEY}))?.value||'')}catch(error){cloudDiag('cloud.secure_storage_read_error',error,{key:'identity'})};if(!raw)raw=String(localStorage.getItem(IDENTITY_KEY)||'');try{const value=JSON.parse(raw||'null');return value&&typeof value==='object'?value:null}catch{return null}}
async function persistStoredSession(session){SESSION_CACHE=session;SESSION_READY=true;const plugin=secureStorage();if(plugin){await plugin.set({key:SESSION_KEY,value:JSON.stringify(session)});localStorage.removeItem(SESSION_KEY)}else localStorage.setItem(SESSION_KEY,JSON.stringify(session));return session}
export async function initializeCloudSessionStorage(){if(SESSION_READY)return SESSION_CACHE;const legacy=localStorage.getItem(SESSION_KEY),plugin=secureStorage();if(plugin){let secureRaw='';try{secureRaw=String((await plugin.get({key:SESSION_KEY}))?.value||'')}catch(error){cloudDiag('cloud.secure_storage_read_error',error,{key:'session'})}SESSION_CACHE=parseSession(secureRaw||legacy);if(SESSION_CACHE&&!secureRaw)try{await plugin.set({key:SESSION_KEY,value:JSON.stringify(SESSION_CACHE)})}catch(error){cloudDiag('cloud.secure_storage_write_error',error,{key:'session'})}localStorage.removeItem(SESSION_KEY)}else SESSION_CACHE=parseSession(legacy);SESSION_READY=true;return SESSION_CACHE}

function runtimeCloudConfig(){
  return {
    url:String(globalThis.REMAPRO_SUPABASE_URL||'').trim().replace(/\/+$/,''),
    key:String(globalThis.REMAPRO_SUPABASE_PUBLISHABLE_KEY||'').trim()
  };
}
const NETWORK_TIMEOUT_MS=20000;
async function fetchWithTimeout(url,options={},timeoutMs=NETWORK_TIMEOUT_MS){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.max(1000,Number(timeoutMs)||NETWORK_TIMEOUT_MS));
  try{return await fetch(url,{...options,signal:controller.signal})}
  catch(error){if(error?.name==='AbortError')throw new Error('NETWORK_TIMEOUT');throw error}
  finally{clearTimeout(timer)}
}
const customBackendAllowed=()=>globalThis.REMAPRO_ALLOW_CUSTOM_BACKEND===true;
export function cloudConfig(){
  const runtime=runtimeCloudConfig();
  if(runtime.url&&runtime.key&&!customBackendAllowed())return runtime;
  return {
    url:String(localStorage.getItem(URL_KEY)||runtime.url).trim().replace(/\/+$/,''),
    key:String(localStorage.getItem(KEY_KEY)||runtime.key).trim()
  };
}
export function cloudConfigured(){
  const {url,key}=cloudConfig();
  return /^https:\/\//i.test(url)&&!!key;
}
export function saveCloudConfig(url,key){
  const cleanUrl=String(url||'').trim().replace(/\/+$/,'');
  const cleanKey=String(key||'').trim();
  if(!/^https:\/\//i.test(cleanUrl)||!cleanKey)return false;
  const runtime=runtimeCloudConfig();
  if(runtime.url&&runtime.key&&!customBackendAllowed()){
    return cleanUrl===runtime.url&&cleanKey===runtime.key;
  }
  const previous=cloudConfig();
  localStorage.setItem(URL_KEY,cleanUrl);
  localStorage.setItem(KEY_KEY,cleanKey);
  if(previous.url!==cleanUrl||previous.key!==cleanKey){SESSION_CACHE=null;SESSION_READY=true;localStorage.removeItem(SESSION_KEY);localStorage.removeItem(IDENTITY_KEY);const plugin=secureStorage();if(plugin){plugin.remove({key:SESSION_KEY}).catch(error=>cloudDiag('cloud.background_operation_error',error));plugin.remove({key:IDENTITY_KEY}).catch(error=>cloudDiag('cloud.background_operation_error',error))}}
  return true;
}
export function disconnectCloud(){
  localStorage.removeItem(URL_KEY);
  localStorage.removeItem(KEY_KEY);
  SESSION_CACHE=null;SESSION_READY=true;localStorage.removeItem(SESSION_KEY);localStorage.removeItem(IDENTITY_KEY);const plugin=secureStorage();if(plugin){plugin.remove({key:SESSION_KEY}).catch(error=>cloudDiag('cloud.background_operation_error',error));plugin.remove({key:IDENTITY_KEY}).catch(error=>cloudDiag('cloud.background_operation_error',error))}
}
export function cloudSession(){return SESSION_READY?SESSION_CACHE:parseSession(localStorage.getItem(SESSION_KEY))}
async function saveSession(data){if(!data?.access_token||!data?.refresh_token)return false;const expiresAt=Number(data.expires_at)||Math.floor(Date.now()/1000)+(Number(data.expires_in)||3600);return persistStoredSession({...data,expires_at:expiresAt})}
async function authRequest(path,{body,token}={}){
  const {url,key}=cloudConfig();
  if(!url||!key)throw new Error('CLOUD_NOT_CONFIGURED');
  const headers={'Content-Type':'application/json','apikey':key};
  if(token)headers.Authorization='Bearer '+token;
  const response=await fetchWithTimeout(url+path,{method:'POST',headers,body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data?.msg||data?.message||data?.error_description||data?.error||'AUTH_REQUEST_FAILED');
  return data;
}
export async function signInCloud(email,password){
  const mail=String(email||'').trim().toLowerCase(),secret=String(password||'');
  if(!mail||!secret)throw new Error('AUTH_REQUIRED');
  return await saveSession(await authRequest('/auth/v1/token?grant_type=password',{body:{email:mail,password:secret}}));
}
export async function signUpCloud(email,password,name,restaurantName){
  const mail=String(email||'').trim().toLowerCase(),secret=String(password||''),display=String(name||'').trim(),restaurant=String(restaurantName||'').trim();
  if(!mail||!secret||!display||!restaurant)throw new Error('SIGNUP_REQUIRED');
  const data=await authRequest('/auth/v1/signup',{body:{
    email:mail,password:secret,
    data:{name:display,first_name:display,remapro_signup:true,organization_name:restaurant,restaurant_name:restaurant}
  }});
  const session=data?.access_token&&data?.refresh_token?await saveSession(data):null;
  return {user:data?.user||null,session,confirmationRequired:!session};
}
export async function requestPasswordReset(email,redirectTo=''){
  const mail=String(email||'').trim().toLowerCase();
  if(!mail)throw new Error('EMAIL_REQUIRED');
  const body={email:mail};if(redirectTo)body.redirect_to=String(redirectTo);
  return authRequest('/auth/v1/recover',{body});
}
export async function refreshCloudSession(){
  const current=cloudSession();
  if(!current?.refresh_token)throw new Error('NO_REFRESH_TOKEN');
  return await saveSession(await authRequest('/auth/v1/token?grant_type=refresh_token',{body:{refresh_token:current.refresh_token}}));
}
export async function ensureFreshCloudSession(){
  let session=cloudSession();
  if(!session)return null;
  if(Number(session.expires_at||0)*1000-Date.now()<60_000){
    try{session=await refreshCloudSession()}catch{await removeStoredSession();return null}
  }
  return session;
}
export async function signOutCloud(){
  const session=cloudSession(),{url,key}=cloudConfig();
  try{
    if(session?.access_token&&url&&key)await fetchWithTimeout(url+'/auth/v1/logout',{method:'POST',headers:{'apikey':key,'Authorization':'Bearer '+session.access_token}},10000);
  }finally{await removeStoredSession()}
}
async function dataRequest(path,{method='GET',body,retry=true}={}){
  const {url,key}=cloudConfig();
  let session=await ensureFreshCloudSession();
  if(!url||!key)throw new Error('CLOUD_NOT_CONFIGURED');
  if(!session?.access_token)throw new Error('AUTH_REQUIRED');
  const headers={'apikey':key,'Authorization':'Bearer '+session.access_token,'Accept':'application/json'};
  if(body!==undefined)headers['Content-Type']='application/json';
  const response=await fetchWithTimeout(url+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  if(response.status===401&&retry){
    session=await refreshCloudSession();
    return dataRequest(path,{method,body,retry:false});
  }
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(data?.message||data?.error||'DATA_REQUEST_FAILED');
  return data;
}
export async function loadCloudIdentity(){
  const session=await ensureFreshCloudSession();
  if(!session)return null;
  const user=await dataRequest('/auth/v1/user');
  const userId=encodeURIComponent(user?.id||'');
  if(!userId)return null;
  const memberships=await dataRequest('/rest/v1/memberships?select=id,organization_id,restaurant_id,role,permissions&active=eq.true&user_id=eq.'+userId);
  const orgIds=[...new Set((memberships||[]).map(x=>x.organization_id).filter(Boolean))];
  const orgFilter=orgIds.map(encodeURIComponent).join(',');
  const restaurants=orgIds.length?await dataRequest('/rest/v1/restaurants?select=id,organization_id,name,city,canton,country_code,currency,active&active=eq.true&organization_id=in.('+orgFilter+')'):[];
  const organizations=orgIds.length?await dataRequest('/rest/v1/organizations?select=id,created_at&id=in.('+orgFilter+')'):[];
  const subscriptions=orgIds.length?await dataRequest('/rest/v1/subscriptions?select=organization_id,status,trial_ends_at,created_at,plan:subscription_plans(code)&organization_id=in.('+orgFilter+')&order=created_at.desc'):[];
  const identity={user,memberships:Array.isArray(memberships)?memberships:[],restaurants:Array.isArray(restaurants)?restaurants:[],organizations:Array.isArray(organizations)?organizations:[],subscriptions:Array.isArray(subscriptions)?subscriptions:[]};await persistCloudIdentity(identity);return identity;
}
const ADMIN_ROLES=new Set(['network_admin','network_manager','restaurant_admin','director','manager']);
const CLOUD_WORKSPACE_KEYS=['revenue','covers','expenses','recipeTarget','recipeWarning','payrollSettings','sales','orders','products','loyalty','briefings','invoices','checklists','alerts','goals','training','leave','leaveHolidays','equipment','audits','cleaning','deliveries','allergens','recalls','financeHistory','expenseEntries','cashChecks','weeklyKpis','managerTasks','stockMoves','complianceItems','priceHistory','stock','temps','haccpAudit','suppliers','purchases','purchaseOrders','productionBatches','inventoryCounts','team','shifts','timeClock','availability','shiftSwaps','incidents','waste','reservations','forecastSignals','customers','giftCards','loyaltyTransactions','reservationSettings','recipes','maintenance','handover','categories','tasksDate','tasks','documentEntries'];
const WORKSPACE_READ_BY_PERMISSION={
  operations:['tasksDate','tasks','briefings','handover','maintenance','equipment'],
  finance:['revenue','covers','expenses','sales','financeHistory','expenseEntries','cashChecks','weeklyKpis','goals','alerts'],
  haccp:['temps','haccpAudit','cleaning','allergens','recalls','incidents','waste','complianceItems','audits'],
  stock:['stock','stockMoves','products','categories','priceHistory','inventoryCounts','productionBatches'],
  deliveries:['deliveries','stock','suppliers'],
  checklists:['checklists'],
  planning:['shifts','team','leave','leaveHolidays','training','managerTasks','timeClock','availability','shiftSwaps','forecastSignals'],
  reservations:['reservations','customers','reservationSettings'],
  recipes:['recipes','stock','products','categories','recipeTarget','recipeWarning','productionBatches'],
  documents:['documentEntries'],
  hr:['team','shifts','leave','leaveHolidays','training','documentEntries','payrollSettings'],
  team:['team','shifts','leave','training','tasks','managerTasks','timeClock','availability','shiftSwaps'],
  orders:['orders','sales'],
  suppliers:['suppliers'],
  purchases:['purchases','suppliers','stock','priceHistory','purchaseOrders'],
  invoices:['invoices','suppliers','purchases','priceHistory'],
  customers:['customers','reservations','loyalty','giftCards','loyaltyTransactions'],
  loyalty:['loyalty','customers','giftCards','loyaltyTransactions'],
  ai:[]
};
const WORKSPACE_WRITE_BY_PERMISSION={
  operations:['tasksDate','tasks','briefings','handover','maintenance','equipment'],
  finance:['revenue','covers','expenses','sales','financeHistory','expenseEntries','cashChecks','weeklyKpis','goals','alerts'],
  haccp:['temps','haccpAudit','cleaning','allergens','recalls','incidents','waste','complianceItems','audits'],
  stock:['stock','stockMoves','products','categories','priceHistory'],
  deliveries:['deliveries','stock'],
  checklists:['checklists'],
  planning:['shifts','leave','leaveHolidays','training','tasks','managerTasks','timeClock','availability','shiftSwaps','forecastSignals'],
  reservations:['reservations'],
  recipes:['recipes','recipeTarget','recipeWarning'],
  documents:['documentEntries'],
  hr:['team','shifts','leave','leaveHolidays','training','documentEntries','payrollSettings'],
  team:['team','shifts','leave','training','tasks','managerTasks'],
  orders:['orders','sales'],
  suppliers:['suppliers'],
  purchases:['purchases','stock','priceHistory','purchaseOrders'],
  invoices:['invoices','purchases','priceHistory'],
  customers:['customers','reservations'],
  loyalty:['loyalty'],
  ai:[]
};
const PAGE_PERMISSION={
  operations:'operations',maintenance:'operations',equipment:'operations',briefing:'operations',handover:'operations',taskManager:'operations',
  finance:'finance',cashRegister:'finance',weeklyKpi:'finance',goals:'finance',alerts:'finance',
  stock:'stock',stockMoves:'stock',products:'stock',categories:'stock',
  deliveries:'deliveries',haccp:'haccp',compliance:'haccp',incidents:'haccp',waste:'haccp',recalls:'haccp',allergens:'haccp',cleaning:'haccp',audits:'haccp',
  checklists:'checklists',planning:'planning',leave:'planning',training:'planning',
  reservations:'reservations',recipes:'recipes',documents:'documents',hrTools:'hr',team:'team',
  orders:'orders',suppliers:'suppliers',purchases:'purchases',invoices:'invoices',customers:'customers',loyalty:'loyalty',ai:'ai'
};
function cloudRestaurantContext(identity,restaurantId){const restaurant=(identity?.restaurants||[]).find(x=>x.id===restaurantId);if(!restaurant)return{restaurant:null,memberships:[],manager:false};const memberships=(identity?.memberships||[]).filter(m=>m.organization_id===restaurant.organization_id&&(!m.restaurant_id||m.restaurant_id===restaurantId));const manager=memberships.some(m=>['network_admin','network_manager'].includes(m.role)&&!m.restaurant_id)||memberships.some(m=>m.restaurant_id===restaurantId&&['restaurant_admin','director','manager'].includes(m.role));return{restaurant,memberships,manager}}
function cloudWorkspaceKeys(identity,restaurantId,map){const ctx=cloudRestaurantContext(identity,restaurantId);if(!ctx.restaurant)return[];if(ctx.manager)return[...CLOUD_WORKSPACE_KEYS];const out=new Set();for(const membership of ctx.memberships)if(membership.restaurant_id===restaurantId)for(const permission of membership.permissions||[])for(const key of map[permission]||[])out.add(key);return[...out]}
export function cloudWorkspaceReadKeys(identity,restaurantId){return cloudWorkspaceKeys(identity,restaurantId,WORKSPACE_READ_BY_PERMISSION)}
export function cloudWorkspaceWriteKeys(identity,restaurantId){return cloudWorkspaceKeys(identity,restaurantId,WORKSPACE_WRITE_BY_PERMISSION)}
export function cloudMultiAccess(identity,organizationId,now=new Date()){
  if(!identity||!organizationId)return false;
  const subscription=(identity.subscriptions||[]).find(x=>x.organization_id===organizationId);
  if(subscription){
    if(subscription.status==='active'&&subscription.plan?.code==='multi')return true;
    if(subscription.status==='trialing'&&subscription.trial_ends_at&&new Date(subscription.trial_ends_at).getTime()>now.getTime())return true;
    return false;
  }
  const organization=(identity.organizations||[]).find(x=>x.id===organizationId);
  return !!organization?.created_at&&new Date(organization.created_at).getTime()+14*86400000>now.getTime();
}
export function cloudPageAllowed(identity,page,restaurantId){
  if(!identity)return true;
  if(['dashboard','more','help'].includes(page))return true;
  const memberships=identity.memberships||[];
  const targetRestaurant=(identity.restaurants||[]).find(x=>x.id===restaurantId);
  const targetOrganizationId=targetRestaurant?.organization_id||'';
  for(const membership of memberships){
    if(!membership?.active&&membership?.active!==undefined)continue;
    const role=String(membership.role||'');
    if(['network_admin','network_manager'].includes(role)){
      if(!targetOrganizationId||membership.organization_id===targetOrganizationId)return true;
      continue;
    }
    if(membership.restaurant_id!==restaurantId)continue;
    if(ADMIN_ROLES.has(role))return true;
    const permission=PAGE_PERMISSION[page]||page;if((membership.permissions||[]).includes(permission))return true;
  }
  return false;
}
const RETRYABLE_FUNCTION_STATUS=new Set([429,502,503,504]);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function cloudFunction(path,payload,{attempts=3}={}){
  const {url,key}=cloudConfig();
  if(!url||!key)throw new Error('CLOUD_NOT_CONFIGURED');
  const tries=Math.max(1,Math.min(5,Math.trunc(+attempts||3)));
  let lastError=null;
  for(let attempt=0;attempt<tries;attempt++){
    let session=await ensureFreshCloudSession();
    if(!session?.access_token)throw new Error('AUTH_REQUIRED');
    let response;
    try{
      response=await fetchWithTimeout(url+'/functions/v1/'+path,{method:'POST',headers:{'Content-Type':'application/json','apikey':key,'Authorization':'Bearer '+session.access_token},body:JSON.stringify(payload)});
    }catch(error){lastError=error;recordDiagnostic('edge.function_network_error',{path,attempt:attempt+1,message:error?.message||String(error)});if(attempt+1<tries){recordDiagnostic('edge.function_retry',{path,attempt:attempt+1,reason:'network'});await sleep(250*(2**attempt));continue}throw error}
    const data=await response.json().catch(()=>({}));
    if(response.ok)return data;
    if(response.status===401&&attempt+1<tries){try{await refreshCloudSession()}catch(error){cloudDiag('cloud.refresh_session_error',error)}await sleep(100);continue}
    const error=new Error(data?.error||'FUNCTION_REQUEST_FAILED');error.status=response.status;error.payload=data;lastError=error;recordDiagnostic('edge.function_error',{path,status:response.status,attempt:attempt+1,message:error.message});
    if(RETRYABLE_FUNCTION_STATUS.has(response.status)&&attempt+1<tries){recordDiagnostic('edge.function_retry',{path,status:response.status,attempt:attempt+1,reason:'status'});await sleep(250*(2**attempt));continue}
    throw error;
  }
  throw lastError||new Error('FUNCTION_REQUEST_FAILED');
}

export async function uploadStorageObject(bucket,path,blob,{attempts=3,upsert=true}={}){
  const {url,key}=cloudConfig();
  if(!url||!key)throw new Error('CLOUD_NOT_CONFIGURED');
  if(!(blob instanceof Blob))throw new Error('STORAGE_BLOB_REQUIRED');
  const safeBucket=encodeURIComponent(String(bucket||'')),safePath=String(path||'').split('/').map(encodeURIComponent).join('/');
  if(!safeBucket||!safePath)throw new Error('STORAGE_PATH_REQUIRED');
  const tries=Math.max(1,Math.min(5,Math.trunc(+attempts||3)));let last=null;
  for(let attempt=0;attempt<tries;attempt++){
    const session=await ensureFreshCloudSession();if(!session?.access_token)throw new Error('AUTH_REQUIRED');
    try{
      const response=await fetchWithTimeout(url+'/storage/v1/object/'+safeBucket+'/'+safePath,{
        method:'POST',
        headers:{apikey:key,Authorization:'Bearer '+session.access_token,'Content-Type':blob.type||'application/octet-stream','x-upsert':upsert?'true':'false'},
        body:blob
      },30000);
      const data=await response.json().catch(()=>({}));
      if(response.ok)return data;
      const error=new Error(data?.message||data?.error||'STORAGE_UPLOAD_FAILED');error.status=response.status;last=error;recordDiagnostic('storage.upload_error',{bucket:safeBucket,status:response.status,attempt:attempt+1,message:error.message});
      if((response.status===401||RETRYABLE_FUNCTION_STATUS.has(response.status))&&attempt+1<tries){if(response.status===401)try{await refreshCloudSession()}catch(error){cloudDiag('cloud.refresh_session_error',error)}await sleep(300*(2**attempt));continue}
      throw error;
    }catch(error){
      last=error;
      if(error?.status&&error.status!==401&&!RETRYABLE_FUNCTION_STATUS.has(error.status))throw error;
      recordDiagnostic('storage.upload_transport_error',{bucket:safeBucket,attempt:attempt+1,message:error?.message||String(error)});
      if(attempt+1<tries){await sleep(300*(2**attempt));continue}
      throw error;
    }
  }
  throw last||new Error('STORAGE_UPLOAD_FAILED');
}
