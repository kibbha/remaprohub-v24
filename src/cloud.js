const SESSION_KEY='remapro-pos-session';
const config=()=>({
  url:String(globalThis.REMAPRO_SUPABASE_URL||'').trim().replace(/\/+$/,''),
  key:String(globalThis.REMAPRO_SUPABASE_PUBLISHABLE_KEY||'').trim()
});
export const cloudConfigured=()=>{const c=config();return /^https:\/\//.test(c.url)&&!!c.key};
const parseSession=()=>{try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{return null}};
const saveSession=session=>{localStorage.setItem(SESSION_KEY,JSON.stringify(session));return session};
export const currentSession=()=>parseSession();
export const signOut=()=>localStorage.removeItem(SESSION_KEY);

async function auth(path,body){
  const {url,key}=config();if(!url||!key)throw new Error('Configuration Supabase manquante');
  const r=await fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json','apikey':key},body:JSON.stringify(body)});
  const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data?.msg||data?.message||data?.error_description||'Connexion impossible');return data;
}
export async function signIn(email,password){return saveSession(await auth('/auth/v1/token?grant_type=password',{email:String(email).trim().toLowerCase(),password:String(password)}))}
export async function refreshSession(){
  const s=parseSession();if(!s?.refresh_token)throw new Error('Session expirée');
  return saveSession(await auth('/auth/v1/token?grant_type=refresh_token',{refresh_token:s.refresh_token}));
}
async function fresh(){
  let s=parseSession();if(!s)return null;
  const exp=Number(s.expires_at||0)*1000;
  if(exp&&exp-Date.now()<60000)s=await refreshSession();
  return s;
}
async function request(path,{method='GET',body,prefer}={}){
  const {url,key}=config();let s=await fresh();if(!s?.access_token)throw new Error('AUTH_REQUIRED');
  const headers={'apikey':key,'Authorization':'Bearer '+s.access_token,'Accept':'application/json'};
  if(body!==undefined)headers['Content-Type']='application/json';if(prefer)headers.Prefer=prefer;
  let r=await fetch(url+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  if(r.status===401){s=await refreshSession();headers.Authorization='Bearer '+s.access_token;r=await fetch(url+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)})}
  const data=await r.json().catch(()=>null);if(!r.ok)throw new Error(data?.message||data?.error||'REQUEST_FAILED');return data;
}
export async function loadIdentity(){
  const user=await request('/auth/v1/user');
  const uid=encodeURIComponent(user.id);
  const memberships=await request('/rest/v1/memberships?select=organization_id,restaurant_id,role,permissions&active=eq.true&user_id=eq.'+uid);
  const orgs=[...new Set((memberships||[]).map(m=>m.organization_id).filter(Boolean))];
  const restaurants=orgs.length?await request('/rest/v1/restaurants?select=id,organization_id,name,currency,timezone,active&active=eq.true&organization_id=in.('+orgs.map(encodeURIComponent).join(',')+')'):[];
  return{user,memberships:memberships||[],restaurants:restaurants||[]};
}
export async function posFunction(payload){
  const {url,key}=config();let s=await fresh();if(!s?.access_token)throw new Error('AUTH_REQUIRED');
  const call=()=>fetch(url+'/functions/v1/remapro-pos-sync',{method:'POST',headers:{'Content-Type':'application/json','apikey':key,'Authorization':'Bearer '+s.access_token},body:JSON.stringify(payload)});
  let r=await call();if(r.status===401){s=await refreshSession();r=await call()}
  const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data?.error||'POS_SYNC_FAILED');return data;
}
export async function pushEvent(event){
  const q='?on_conflict=client_event_id';
  return request('/rest/v1/pos_event_log'+q,{method:'POST',body:event,prefer:'resolution=ignore-duplicates,return=minimal'});
}
