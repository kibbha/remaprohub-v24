import { cloudFunction } from './cloud.js';

export const POS_BRIDGE_VERSION='1';

export async function loadPosBootstrap(restaurantId){
  return cloudFunction('remapro-pos-sync',{action:'bootstrap',restaurantId});
}

export async function registerPosDevice(restaurantId,device){
  return cloudFunction('remapro-pos-sync',{action:'heartbeat',restaurantId,device});
}

export async function pullPosEvents(restaurantId,after=0,limit=100){
  return cloudFunction('remapro-pos-sync',{action:'pull_events',restaurantId,after,limit});
}

export async function loadPosDailySummary(restaurantId,{from='',to=''}={}){
  return cloudFunction('remapro-pos-sync',{action:'daily_summary',restaurantId,from,to});
}
