const URL_KEY='remaprohub-sb-url';
const KEY_KEY='remaprohub-sb-key';
const SESSION_KEY='remaprohub-sb-session';

export function cloudConfig(){
  return {
    url:String(localStorage.getItem(URL_KEY)||'').trim().replace(/\/+$/,''),
    key:String(localStorage.getItem(KEY_KEY)||'').trim()
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
  const previous=cloudConfig();
  localStorage.setItem(URL_KEY,cleanUrl);
  localStorage.setItem(KEY_KEY,cleanKey);
  if(previous.url!==cleanUrl||previous.key!==cleanKey)localStorage.removeItem(SESSION_KEY);
  return true;
}
export function disconnectCloud(){
  localStorage.removeItem(URL_KEY);
  localStorage.removeItem(KEY_KEY);
  localStorage.removeItem(SESSION_KEY);
}
export function cloudSession(){
  try{
    const value=JSON.parse(localStorage.getItem(SESSION_KEY)||'null');
    return value&&typeof value==='object'&&value.access_token&&value.refresh_token?value:null;
  }catch{return null}
}
function saveSession(data){
  if(!data?.access_token||!data?.refresh_token)return false;
  const expiresAt=Number(data.expires_at)||Math.floor(Date.now()/1000)+(Number(data.expires_in)||3600);
  const session={...data,expires_at:expiresAt};
  localStorage.setItem(SESSION_KEY,JSON.stringify(session));
  return session;
}
async function authRequest(path,{body,token}={}){
  const {url,key}=cloudConfig();
  if(!url||!key)throw new Error('CLOUD_NOT_CONFIGURED');
  const headers={'Content-Type':'application/json','apikey':key};
  if(token)headers.Authorization='Bearer '+token;
  const response=await fetch(url+path,{method:'POST',headers,body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data?.msg||data?.message||data?.error_description||data?.error||'AUTH_REQUEST_FAILED');
  return data;
}
export async function signInCloud(email,password){
  const mail=String(email||'').trim().toLowerCase(),secret=String(password||'');
  if(!mail||!secret)throw new Error('AUTH_REQUIRED');
  return saveSession(await authRequest('/auth/v1/token?grant_type=password',{body:{email:mail,password:secret}}));
}
export async function refreshCloudSession(){
  const current=cloudSession();
  if(!current?.refresh_token)throw new Error('NO_REFRESH_TOKEN');
  return saveSession(await authRequest('/auth/v1/token?grant_type=refresh_token',{body:{refresh_token:current.refresh_token}}));
}
export async function ensureFreshCloudSession(){
  let session=cloudSession();
  if(!session)return null;
  if(Number(session.expires_at||0)*1000-Date.now()<60_000){
    try{session=await refreshCloudSession()}catch{localStorage.removeItem(SESSION_KEY);return null}
  }
  return session;
}
export async function signOutCloud(){
  const session=cloudSession(),{url,key}=cloudConfig();
  try{
    if(session?.access_token&&url&&key)await fetch(url+'/auth/v1/logout',{method:'POST',headers:{'apikey':key,'Authorization':'Bearer '+session.access_token}});
  }finally{localStorage.removeItem(SESSION_KEY)}
}
async function dataRequest(path,{method='GET',body,retry=true}={}){
  const {url,key}=cloudConfig();
  let session=await ensureFreshCloudSession();
  if(!url||!key)throw new Error('CLOUD_NOT_CONFIGURED');
  if(!session?.access_token)throw new Error('AUTH_REQUIRED');
  const headers={'apikey':key,'Authorization':'Bearer '+session.access_token,'Accept':'application/json'};
  if(body!==undefined)headers['Content-Type']='application/json';
  const response=await fetch(url+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
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
  return {user,memberships:Array.isArray(memberships)?memberships:[],restaurants:Array.isArray(restaurants)?restaurants:[],organizations:Array.isArray(organizations)?organizations:[],subscriptions:Array.isArray(subscriptions)?subscriptions:[]};
}
const ADMIN_ROLES=new Set(['network_admin','network_manager','restaurant_admin','director','manager']);
export function cloudMultiAccess(identity,organizationId,now=new Date()){
  if(!identity||!organizationId)return false;
  const subscription=(identity.subscriptions||[]).find(x=>x.organization_id===organizationId);
  if(subscription){
    if(subscription.status==='active'&&subscription.plan?.code==='multi')return true;
    if(subscription.status==='trialing'&&subscription.trial_ends_at&&new Date(subscription.trial_ends_at).getTime()>now.getTime())return true;
    return false;
  }
  const organization=(identity.organizations||[]).find(x=>x.id===organizationId);
  return !!organization?.created_at&&new Date(organization.created_at).getTime()+7*86400000>now.getTime();
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
    if((membership.permissions||[]).includes(page))return true;
  }
  return false;
}
export async function cloudFunction(path,payload){
  const {url,key}=cloudConfig();
  const session=await ensureFreshCloudSession();
  if(!url||!key)throw new Error('CLOUD_NOT_CONFIGURED');
  if(!session?.access_token)throw new Error('AUTH_REQUIRED');
  const response=await fetch(url+'/functions/v1/'+path,{
    method:'POST',
    headers:{'Content-Type':'application/json','apikey':key,'Authorization':'Bearer '+session.access_token},
    body:JSON.stringify(payload)
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data?.error||'FUNCTION_REQUEST_FAILED');
  return data;
}
