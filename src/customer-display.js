const CHANNEL='remapro-pos-customer-display',STORAGE_KEY='remapro-pos-customer-display:last';
const n=value=>Number.isFinite(Number(value))?Number(value):0;

export function customerDisplaySnapshot({restaurant=null,cart=[],serviceType='counter',tableLabel='',covers=0,currency='CHF',activeOrderId=null}={}){
  const items=(Array.isArray(cart)?cart:[]).map(x=>({id:String(x.id||''),name:String(x.name||''),qty:Math.max(0,n(x.qty)),unitPrice:Math.max(0,n(x.price)),lineTotal:Math.round(Math.max(0,n(x.qty))*Math.max(0,n(x.price))*100)/100,note:String(x.note||'')})).filter(x=>x.name&&x.qty>0);
  return{version:1,restaurantName:String(restaurant?.name||'ReMaPro'),currency:String(currency||restaurant?.currency||'CHF').toUpperCase(),serviceType:String(serviceType||'counter'),tableLabel:String(tableLabel||''),covers:Math.max(0,Math.trunc(n(covers))),activeOrderId:String(activeOrderId||''),items,total:Math.round(items.reduce((s,x)=>s+x.lineTotal,0)*100)/100,updatedAt:new Date().toISOString()};
}
export function publishCustomerDisplay(snapshot){
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(snapshot))}catch{}
  try{const channel=new BroadcastChannel(CHANNEL);channel.postMessage(snapshot);channel.close()}catch{}
  return snapshot;
}
export function readCustomerDisplaySnapshot(){
  try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')}catch{return null}
}
export function subscribeCustomerDisplay(callback){
  if(typeof callback!=='function')return()=>{};
  let channel=null;try{channel=new BroadcastChannel(CHANNEL);channel.onmessage=e=>callback(e.data)}catch{}
  const onStorage=e=>{if(e.key!==STORAGE_KEY||!e.newValue)return;try{callback(JSON.parse(e.newValue))}catch{}};
  globalThis.addEventListener?.('storage',onStorage);
  return()=>{try{channel?.close()}catch{}globalThis.removeEventListener?.('storage',onStorage)}
}
export function hardwareExtensionProfiles(){
  return[
    {id:'customer_display',status:'ready',transport:'BroadcastChannel / navigateur secondaire'},
    {id:'barcode_scanner',status:'prepared',transport:'USB / Bluetooth HID'},
    {id:'scale',status:'prepared',transport:'WebSerial / adaptateur natif'},
    {id:'cash_drawer',status:'prepared',transport:'ESC/POS via imprimante'}
  ];
}
