import { cloudFunction } from './cloud.js';

export const POS_BRIDGE_VERSION='5';

const n=value=>Number.isFinite(Number(value))?Number(value):0;
const sourceKey=(kind,item,index)=>kind+':'+String(item?.id||item?.sku||item?.name||index).trim();

export function buildPosCatalogFromHubState(state){
  const products=Array.isArray(state?.products)?state.products:[];
  const recipes=Array.isArray(state?.recipes)?state.recipes:[];
  const out=[];
  products.forEach((item,index)=>{
    const name=String(item?.name||'').trim();
    if(!name)return;
    out.push({
      sourceKey:sourceKey('product',item,index),
      sku:String(item?.sku||item?.code||'').trim(),
      name,
      category:String(item?.category||'Produits').trim(),
      itemType:'product',
      price:Math.max(0,n(item?.price)),
      taxRate:Math.max(0,n(item?.taxRate??item?.vatRate??8.1)),
      active:item?.active!==false,
      sortOrder:index,
      metadata:{hubSource:'products'}
    });
  });
  recipes.forEach((item,index)=>{
    const name=String(item?.name||'').trim();
    if(!name)return;
    const id=String(item?.id||'');
    out.push({
      sourceKey:sourceKey('recipe',item,index),
      recipeId:/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)?id:undefined,
      sku:String(item?.sku||item?.code||'').trim(),
      name,
      category:String(item?.category||'Recettes').trim(),
      itemType:'recipe',
      price:Math.max(0,n(item?.price??item?.sellingPrice)),
      taxRate:Math.max(0,n(item?.taxRate??item?.vatRate??8.1)),
      active:item?.active!==false,
      sortOrder:10000+index,
      metadata:{hubSource:'recipes'}
    });
  });
  return out;
}

export async function publishPosCatalog(restaurantId,state,{replace=true}={}){
  const items=buildPosCatalogFromHubState(state);
  return cloudFunction('remapro-pos-sync',{action:'sync_catalog',restaurantId,items,replace});
}
export async function loadPosBootstrap(restaurantId,deviceId=''){
  return cloudFunction('remapro-pos-sync',{action:'bootstrap',restaurantId,deviceId});
}
export async function registerPosDevice(restaurantId,device){
  return cloudFunction('remapro-pos-sync',{action:'heartbeat',restaurantId,device});
}
export async function openPosCashSession(restaurantId,payload){
  return cloudFunction('remapro-pos-sync',{action:'open_cash_session',restaurantId,...payload});
}
export async function closePosCashSession(restaurantId,payload){
  return cloudFunction('remapro-pos-sync',{action:'close_cash_session',restaurantId,...payload});
}
export async function commitPosOrder(restaurantId,order){
  return cloudFunction('remapro-pos-sync',{action:'commit_order',restaurantId,order});
}
export async function loadRecentPosReceipts(restaurantId,limit=30){
  return cloudFunction('remapro-pos-sync',{action:'recent_receipts',restaurantId,limit});
}
export async function pullPosEvents(restaurantId,after=0,limit=100){
  return cloudFunction('remapro-pos-sync',{action:'pull_events',restaurantId,after,limit});
}
export async function loadPosDailySummary(restaurantId,{from='',to=''}={}){
  return cloudFunction('remapro-pos-sync',{action:'daily_summary',restaurantId,from,to});
}

export async function loadPosTables(restaurantId){
  return cloudFunction('remapro-pos-sync',{action:'list_tables',restaurantId});
}
export async function syncPosTables(restaurantId,tables,{replace=true}={}){
  return cloudFunction('remapro-pos-sync',{action:'sync_tables',restaurantId,tables,replace});
}
export async function savePosOpenOrder(restaurantId,order){
  return cloudFunction('remapro-pos-sync',{action:'save_open_order',restaurantId,order});
}
export async function settlePosOpenOrder(restaurantId,payload){
  return cloudFunction('remapro-pos-sync',{action:'settle_open_order',restaurantId,...payload});
}
export async function loadPosOpenOrders(restaurantId){
  return cloudFunction('remapro-pos-sync',{action:'list_open_orders',restaurantId});
}

export async function settlePosOpenOrderSplit(restaurantId,payload){
  return cloudFunction('remapro-pos-sync',{action:'settle_open_order_split',restaurantId,...payload});
}
export async function transferPosOpenOrder(restaurantId,orderId,targetTableId){
  return cloudFunction('remapro-pos-sync',{action:'transfer_open_order',restaurantId,orderId,targetTableId});
}
export async function cancelPosOpenOrder(restaurantId,orderId,reason){
  return cloudFunction('remapro-pos-sync',{action:'cancel_open_order',restaurantId,orderId,reason});
}
export async function refundPosOrder(restaurantId,payload){
  return cloudFunction('remapro-pos-sync',{action:'refund_order',restaurantId,...payload});
}
export async function confirmPosExternalRefund(restaurantId,refundId,success,providerReference=''){
  return cloudFunction('remapro-pos-sync',{action:'confirm_external_refund',restaurantId,refundId,success,providerReference});
}
export async function loadPosRefunds(restaurantId,{orderId='',limit=50}={}){
  return cloudFunction('remapro-pos-sync',{action:'list_refunds',restaurantId,orderId,limit});
}
