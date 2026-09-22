import { cloudFunction } from './cloud.js';

export const POS_BRIDGE_VERSION='2';

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
