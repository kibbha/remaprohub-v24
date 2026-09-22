import {kvGet,kvSet} from './db.js';

const KEY='diagnostics:v1';
const MAX=250;
const clean=value=>String(value??'').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig,'[email]').replace(/bearer\s+[a-z0-9._-]+/ig,'Bearer [redacted]').slice(0,240);

export async function recordDiagnostic(type,details={}){
  try{
    const rows=Array.isArray(await kvGet(KEY))?await kvGet(KEY):[];
    const safe={};
    for(const [key,value] of Object.entries(details||{})){
      if(['token','accessToken','refreshToken','password','pin','authorization'].includes(String(key)))continue;
      if(value==null||['string','number','boolean'].includes(typeof value))safe[key]=typeof value==='string'?clean(value):value;
    }
    rows.unshift({id:crypto.randomUUID?.()||String(Date.now()),type:clean(type),at:new Date().toISOString(),details:safe});
    if(rows.length>MAX)rows.length=MAX;
    await kvSet(KEY,rows);
    return true;
  }catch{return false}
}
export async function diagnosticSummary(){
  const rows=Array.isArray(await kvGet(KEY))?await kvGet(KEY):[];
  const counts={};
  for(const row of rows)counts[row.type]=(counts[row.type]||0)+1;
  return{count:rows.length,lastAt:rows[0]?.at||'',counts};
}
export async function diagnosticEvents(limit=100){
  const rows=Array.isArray(await kvGet(KEY))?await kvGet(KEY):[];
  return rows.slice(0,Math.max(1,Math.min(250,Number(limit)||100)));
}
export async function clearDiagnostics(){await kvSet(KEY,[]);return true}
