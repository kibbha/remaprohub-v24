const KEY='remaprohub.diagnostics.v1';
const MAX=300;
const clean=value=>String(value??'').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig,'[email]').replace(/bearer\s+[a-z0-9._-]+/ig,'Bearer [redacted]').slice(0,260);
const safeDetails=details=>{const out={};for(const [key,value] of Object.entries(details||{})){if(['token','accessToken','refreshToken','password','pin','authorization'].includes(String(key)))continue;if(value==null||['string','number','boolean'].includes(typeof value))out[key]=typeof value==='string'?clean(value):value}return out};
export function recordDiagnostic(type,details={}){
  try{
    const rows=JSON.parse(localStorage.getItem(KEY)||'[]');const list=Array.isArray(rows)?rows:[];
    list.unshift({id:globalThis.crypto?.randomUUID?.()||String(Date.now()),type:clean(type),at:new Date().toISOString(),details:safeDetails(details)});
    if(list.length>MAX)list.length=MAX;localStorage.setItem(KEY,JSON.stringify(list));return true;
  }catch{return false}
}
export function diagnosticEvents(limit=100){try{const rows=JSON.parse(localStorage.getItem(KEY)||'[]');return(Array.isArray(rows)?rows:[]).slice(0,Math.max(1,Math.min(MAX,Number(limit)||100)))}catch{return[]}}
export function diagnosticSummary(){const rows=diagnosticEvents(MAX),counts={};for(const row of rows)counts[row.type]=(counts[row.type]||0)+1;return{count:rows.length,lastAt:rows[0]?.at||'',counts}}
export function clearDiagnostics(){try{localStorage.removeItem(KEY);return true}catch{return false}}
