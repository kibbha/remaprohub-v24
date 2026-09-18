import {financeTotals,stockAvailable} from './store.js';

const URL_KEY='remaprohub-sb-url';
const KEY_KEY='remaprohub-sb-key';

export function cloudConfig(){
  return {
    url:String(localStorage.getItem(URL_KEY)||'').trim(),
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
  localStorage.setItem(URL_KEY,cleanUrl);
  localStorage.setItem(KEY_KEY,cleanKey);
  return true;
}
export function disconnectCloud(){
  localStorage.removeItem(URL_KEY);
  localStorage.removeItem(KEY_KEY);
}
export function aiEndpoint(){
  const {url}=cloudConfig();
  return url?url.replace(/\/+$/,'')+'/functions/v1/remapro-ai':'';
}
export function buildAiContext(state,now=new Date()){
  const day=financeTotals(state,'day',now),week=financeTotals(state,'week',now),month=financeTotals(state,'month',now);
  const stock=state.stock||[];
  return {
    restaurant:state.preferences?.restaurant||'',
    currency:state.preferences?.currency||'CHF',
    finance:{
      day:{revenue:day.revenue,covers:day.covers,expenses:day.expenses},
      week:{revenue:week.revenue,covers:week.covers,expenses:week.expenses},
      month:{revenue:month.revenue,covers:month.covers,expenses:month.expenses}
    },
    operations:{
      openTasks:(state.tasks||[]).filter(x=>!x[1]).map(x=>x[0]),
      urgentAlerts:(state.alerts||[]).filter(x=>x.level==='urgent').length,
      pendingInvoices:(state.invoices||[]).filter(x=>x.status!=='paid').length,
      openOrders:(state.orders||[]).filter(x=>x.status!=='paid').length
    },
    stock:{
      items:stock.length,
      low:stock.filter(x=>+(x.min||0)>0&&stockAvailable(state,x)<=+(x.min||0)).map(x=>({name:x.name,available:stockAvailable(state,x),minimum:+x.min||0}))
    },
    team:{members:(state.team||[]).length},
    reservations:{count:(state.reservations||[]).length}
  };
}
export async function callRemaproAi(payload){
  if(!cloudConfigured())throw new Error('CLOUD_NOT_CONFIGURED');
  const {key}=cloudConfig();
  const response=await fetch(aiEndpoint(),{
    method:'POST',
    headers:{'Content-Type':'application/json','apikey':key,'Authorization':'Bearer '+key},
    body:JSON.stringify(payload)
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data?.error||'AI_REQUEST_FAILED');
  return data;
}
export function fileToDataUrl(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result||''));
    reader.onerror=()=>reject(reader.error||new Error('FILE_READ_FAILED'));
    reader.readAsDataURL(file);
  });
}
