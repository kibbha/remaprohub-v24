import {recordDiagnostic} from './telemetry.js';
const cloudDiag=(type,error,details={})=>{void recordDiagnostic(type,{...details,message:error?.message||String(error||'unknown')})};
const SESSION_KEY='remapro-pos-session';
const OPERATOR_KEY='remapro-pos-operator-session';
let SESSION_CACHE=null,SESSION_READY=false,OPERATOR_CACHE=null,OPERATOR_READY=false;

const config=()=>({url:String(globalThis.REMAPRO_SUPABASE_URL||'').trim().replace(/\/+$/,''),key:String(globalThis.REMAPRO_SUPABASE_PUBLISHABLE_KEY||'').trim()});
const NETWORK_TIMEOUT_MS=20000;
async function fetchWithTimeout(url,options={},timeoutMs=NETWORK_TIMEOUT_MS){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.max(1000,Number(timeoutMs)||NETWORK_TIMEOUT_MS));
  try{return await fetch(url,{...options,signal:controller.signal})}
  catch(error){if(error?.name==='AbortError')throw new Error('NETWORK_TIMEOUT');throw error}
  finally{clearTimeout(timer)}
}

export const cloudConfigured=()=>{const c=config();return /^https:\/\//.test(c.url)&&!!c.key};
const secureStorage=()=>globalThis.Capacitor?.isNativePlatform?.()?globalThis.Capacitor?.Plugins?.SecureStoragePlugin:null;
const parseSession=raw=>{try{const value=typeof raw==='string'?JSON.parse(raw):raw;return value&&typeof value==='object'&&value.access_token&&value.refresh_token?value:null}catch{return null}};
const parseOperator=raw=>{try{const value=typeof raw==='string'?JSON.parse(raw):raw;return value&&typeof value==='object'&&value.token&&value.operator?value:null}catch{return null}};

async function persistSession(session){
  SESSION_CACHE=session;SESSION_READY=true;
  const plugin=secureStorage(),raw=JSON.stringify(session);
  if(plugin){await plugin.set({key:SESSION_KEY,value:raw});localStorage.removeItem(SESSION_KEY)}
  else localStorage.setItem(SESSION_KEY,raw);
  return session;
}
function persistOperator(session){
  OPERATOR_CACHE=session;OPERATOR_READY=true;
  const plugin=secureStorage(),raw=JSON.stringify(session);
  if(plugin){plugin.set({key:OPERATOR_KEY,value:raw}).catch(error=>cloudDiag('cloud.secure_storage_write_error',error,{key:'operator'}));localStorage.removeItem(OPERATOR_KEY)}
  else localStorage.setItem(OPERATOR_KEY,raw);
  return session;
}
async function removeStoredSession(){
  SESSION_CACHE=null;SESSION_READY=true;localStorage.removeItem(SESSION_KEY);
  const plugin=secureStorage();if(plugin)try{await plugin.remove({key:SESSION_KEY})}catch(error){cloudDiag('cloud.secure_storage_remove_error',error,{key:'session'})}
}
function removeStoredOperator(){
  OPERATOR_CACHE=null;OPERATOR_READY=true;localStorage.removeItem(OPERATOR_KEY);
  const plugin=secureStorage();if(plugin)plugin.remove({key:OPERATOR_KEY}).catch(error=>cloudDiag('cloud.secure_storage_remove_error',error,{key:'operator'}));
}
export async function initializePosSessionStorage(){
  if(!SESSION_READY){
    const legacy=localStorage.getItem(SESSION_KEY),plugin=secureStorage();let secureRaw='';
    if(plugin)try{secureRaw=String((await plugin.get({key:SESSION_KEY}))?.value||'')}catch(error){cloudDiag('cloud.secure_storage_read_error',error,{key:'session'})}
    SESSION_CACHE=parseSession(secureRaw||legacy);
    if(plugin&&SESSION_CACHE&&!secureRaw)try{await plugin.set({key:SESSION_KEY,value:JSON.stringify(SESSION_CACHE)})}catch(error){cloudDiag('cloud.secure_storage_write_error',error,{key:'session'})}
    if(plugin)localStorage.removeItem(SESSION_KEY);
    SESSION_READY=true;
  }
  if(!OPERATOR_READY){
    const legacy=localStorage.getItem(OPERATOR_KEY),plugin=secureStorage();let secureRaw='';
    if(plugin)try{secureRaw=String((await plugin.get({key:OPERATOR_KEY}))?.value||'')}catch(error){cloudDiag('cloud.secure_storage_read_error',error,{key:'operator'})}
    OPERATOR_CACHE=parseOperator(secureRaw||legacy);
    if(plugin&&OPERATOR_CACHE&&!secureRaw)try{await plugin.set({key:OPERATOR_KEY,value:JSON.stringify(OPERATOR_CACHE)})}catch(error){cloudDiag('cloud.secure_storage_write_error',error,{key:'operator'})}
    if(plugin)localStorage.removeItem(OPERATOR_KEY);
    OPERATOR_READY=true;
  }
  return{session:SESSION_CACHE,operator:OPERATOR_CACHE};
}
export const currentSession=()=>SESSION_READY?SESSION_CACHE:parseSession(localStorage.getItem(SESSION_KEY)||'null');
export const currentOperatorSession=()=>OPERATOR_READY?OPERATOR_CACHE:parseOperator(localStorage.getItem(OPERATOR_KEY)||'null');
export const saveOperatorSession=session=>persistOperator(session);
export const clearOperatorSession=()=>removeStoredOperator();
export const signOut=()=>{removeStoredSession().catch(error=>cloudDiag('cloud.signout_storage_error',error));removeStoredOperator();};

async function auth(path,body){
  const {url,key}=config();if(!url||!key)throw new Error('Configuration Supabase manquante');
  const r=await fetchWithTimeout(url+path,{method:'POST',headers:{'Content-Type':'application/json','apikey':key},body:JSON.stringify(body)});
  const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data?.msg||data?.message||data?.error_description||'Connexion impossible');return data;
}
export async function signIn(email,password){return persistSession(await auth('/auth/v1/token?grant_type=password',{email:String(email).trim().toLowerCase(),password:String(password)}))}
export async function refreshSession(){const s=currentSession();if(!s?.refresh_token)throw new Error('Session expirée');return persistSession(await auth('/auth/v1/token?grant_type=refresh_token',{refresh_token:s.refresh_token}))}
async function fresh(){let s=currentSession();if(!s)return null;const exp=Number(s.expires_at||0)*1000;if(exp&&exp-Date.now()<60000){try{s=await refreshSession()}catch(error){await removeStoredSession();removeStoredOperator();cloudDiag('cloud.refresh_session_error',error);return null}}return s}
async function request(path){
  const {url,key}=config();let s=await fresh();if(!s?.access_token)throw new Error('AUTH_REQUIRED');
  let r=await fetchWithTimeout(url+path,{headers:{'apikey':key,'Authorization':'Bearer '+s.access_token,'Accept':'application/json'}});
  if(r.status===401){try{s=await refreshSession()}catch(error){await removeStoredSession();removeStoredOperator();throw error}r=await fetchWithTimeout(url+path,{headers:{'apikey':key,'Authorization':'Bearer '+s.access_token,'Accept':'application/json'}})}
  const data=await r.json().catch(()=>null);if(!r.ok)throw new Error(data?.message||data?.error||'REQUEST_FAILED');return data;
}
export function subscriptionAccessForIdentity(identity,organizationId,now=new Date()){
  if(!identity||!organizationId)return{allowed:false,status:'missing',plan:'standard',restaurantLimit:1,trialEndsAt:null,currentPeriodEnd:null};
  if(!Array.isArray(identity.subscriptions))return{allowed:true,status:'legacy_cache',plan:'standard',restaurantLimit:1,trialEndsAt:null,currentPeriodEnd:null};
  const subscription=identity.subscriptions.find(x=>x.organization_id===organizationId);
  if(subscription){
    const status=String(subscription.status||''),trialEnd=subscription.trial_ends_at?new Date(subscription.trial_ends_at).getTime():0;
    const periodEnd=subscription.current_period_end?new Date(subscription.current_period_end).getTime():0;
    const allowed=status==='active'||(status==='trialing'&&trialEnd>now.getTime())||(status==='past_due'&&periodEnd>now.getTime());
    return{allowed,status,plan:subscription.plan?.code==='multi'?'multi':'standard',restaurantLimit:Math.min(5,Math.max(1,Number(subscription.restaurant_limit)||1)),trialEndsAt:subscription.trial_ends_at||null,currentPeriodEnd:subscription.current_period_end||null};
  }
  const organization=(identity.organizations||[]).find(x=>x.id===organizationId);
  const end=organization?.created_at?new Date(organization.created_at).getTime()+14*86400000:0;
  return{allowed:end>now.getTime(),status:end?'legacy_trial':'missing',plan:'standard',restaurantLimit:1,trialEndsAt:end?new Date(end).toISOString():null,currentPeriodEnd:null};
}
export async function loadIdentity(){
  const user=await request('/auth/v1/user'),uid=encodeURIComponent(user.id);
  const memberships=await request('/rest/v1/memberships?select=organization_id,restaurant_id,role,permissions&active=eq.true&user_id=eq.'+uid);
  const orgs=[...new Set((memberships||[]).map(m=>m.organization_id).filter(Boolean))];
  const filter=orgs.map(encodeURIComponent).join(',');
  const restaurants=orgs.length?await request('/rest/v1/restaurants?select=id,organization_id,name,currency,timezone,active&active=eq.true&organization_id=in.('+filter+')'):[];
  const organizations=orgs.length?await request('/rest/v1/organizations?select=id,created_at&id=in.('+filter+')'):[];
  const subscriptions=orgs.length?await request('/rest/v1/subscriptions?select=organization_id,status,trial_ends_at,current_period_end,cancel_at_period_end,restaurant_limit,created_at,plan:subscription_plans(code)&organization_id=in.('+filter+')&order=created_at.desc'):[];
  return{user,memberships:memberships||[],restaurants:restaurants||[],organizations:organizations||[],subscriptions:subscriptions||[],fetchedAt:new Date().toISOString()};
}
export async function posFunction(payload){
  const {url,key}=config();let s=await fresh();if(!s?.access_token)throw new Error('AUTH_REQUIRED');
  const op=currentOperatorSession();
  const body=op?.token?{...payload,operatorSessionToken:op.token}:payload;
  const call=()=>fetchWithTimeout(url+'/functions/v1/remapro-pos-sync',{method:'POST',headers:{'Content-Type':'application/json','apikey':key,'Authorization':'Bearer '+s.access_token},body:JSON.stringify(body)});
  let r=await call();if(r.status===401){try{s=await refreshSession()}catch(error){await removeStoredSession();removeStoredOperator();throw error}r=await call()}
  const data=await r.json().catch(()=>({}));if(!r.ok){if(r.status===402&&data?.error==='SUBSCRIPTION_REQUIRED'&&typeof globalThis.dispatchEvent==='function'&&typeof globalThis.CustomEvent==='function')globalThis.dispatchEvent(new CustomEvent('remapro:subscription-required',{detail:data.entitlement||{allowed:false,status:'expired'}}));const error=new Error(data?.error||'POS_SYNC_FAILED');error.status=r.status;error.payload=data;throw error}return data;
}

export async function academyFunction(payload){
  const {url,key}=config();let s=await fresh();if(!s?.access_token)throw new Error('AUTH_REQUIRED');
  const call=()=>fetchWithTimeout(url+'/functions/v1/remapro-academy',{method:'POST',headers:{'Content-Type':'application/json','apikey':key,'Authorization':'Bearer '+s.access_token},body:JSON.stringify(payload)});
  let r=await call();if(r.status===401){try{s=await refreshSession()}catch(error){await removeStoredSession();removeStoredOperator();throw error}r=await call()}
  const data=await r.json().catch(()=>({}));if(!r.ok){const error=new Error(data?.error||'ACADEMY_SYNC_FAILED');error.status=r.status;throw error}return data;
}


export async function supportFunction(payload){
  const {url,key}=config();let s=await fresh();if(!s?.access_token)throw new Error('AUTH_REQUIRED');
  const call=()=>fetchWithTimeout(url+'/functions/v1/remapro-support',{method:'POST',headers:{'Content-Type':'application/json','apikey':key,'Authorization':'Bearer '+s.access_token},body:JSON.stringify(payload)});
  let r=await call();if(r.status===401){try{s=await refreshSession()}catch(error){await removeStoredSession();removeStoredOperator();throw error}r=await call()}
  const data=await r.json().catch(()=>({}));if(!r.ok){const error=new Error(data?.error||'SUPPORT_REQUEST_FAILED');error.status=r.status;error.payload=data;throw error}return data;
}
