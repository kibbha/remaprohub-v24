import {financeTotals,stockAvailable} from './store.js';
import {managerSnapshot} from './intelligence.js';
import {cloudConfig,cloudConfigured,saveCloudConfig,disconnectCloud,cloudFunction} from './cloud.js';
export {cloudConfig,cloudConfigured,saveCloudConfig,disconnectCloud} from './cloud.js';

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
    reservations:{count:(state.reservations||[]).length},
    manager:managerSnapshot(state,now)
  };
}
export async function callRemaproAi(payload){
  if(!cloudConfigured())throw new Error('CLOUD_NOT_CONFIGURED');
  return cloudFunction('remapro-ai',payload);
}
export function fileToDataUrl(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result||''));
    reader.onerror=()=>reject(reader.error||new Error('FILE_READ_FAILED'));
    reader.readAsDataURL(file);
  });
}
