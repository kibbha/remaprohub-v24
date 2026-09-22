const nativePlatform=()=>Boolean(globalThis.Capacitor?.isNativePlatform?.());
const nativePrinterPlugin=()=>globalThis.Capacitor?.Plugins?.EscPosPrinter||null;
const safeAscii=value=>String(value??'')
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .replace(/[’‘]/g,"'").replace(/[“”]/g,'"').replace(/[–—]/g,'-')
  .replace(/€/g,'EUR').replace(/[^\x20-\x7E\n]/g,'?');

const money=(value,currency='CHF')=>Number(value||0).toFixed(2)+' '+currency;
const fit=(left,right,width)=>{
  left=safeAscii(left);right=safeAscii(right);
  const room=Math.max(1,width-right.length-1);
  const l=left.length>room?left.slice(0,Math.max(1,room-1))+'~':left;
  return l+' '.repeat(Math.max(1,width-l.length-right.length))+right;
};
const center=(text,width)=>{
  text=safeAscii(text).slice(0,width);
  return ' '.repeat(Math.max(0,Math.floor((width-text.length)/2)))+text;
};
const line=width=>'-'.repeat(Math.max(24,width));

function printerPlugin(){
  if(!nativePlatform())throw new Error('NATIVE_PRINTER_UNAVAILABLE');
  const plugin=nativePrinterPlugin();
  if(!plugin)throw new Error('ESC_POS_PLUGIN_UNAVAILABLE');
  return plugin;
}

export const nativePrinterReady=()=>nativePlatform()&&Boolean(nativePrinterPlugin());

export async function discoverNativePrinters(){
  if(!nativePlatform())return[];
  const plugin=printerPlugin();
  const found=[];
  try{await plugin.requestBluetoothEnable()}catch{}
  try{
    const result=await plugin.getBluetoothPrinterDevices();
    for(const d of result?.devices||[])found.push({
      connectionType:'bluetooth',address:d.address,name:d.name||d.alias||d.address,
      detail:d.address
    });
  }catch{}
  try{
    const result=await plugin.getUsbPrinterDevices();
    for(const d of result?.devices||[])found.push({
      connectionType:'usb',address:d.id,name:d.name||d.deviceName||d.id,
      detail:[d.manufacturerName,d.vendorId&&('VID '+d.vendorId),d.productId&&('PID '+d.productId)].filter(Boolean).join(' · '),
      hasPermission:d.hasPermission===true
    });
  }catch{}
  return found;
}

export async function printEscPosText(profile,text){
  if(!profile)throw new Error('PRINTER_PROFILE_REQUIRED');
  if(profile.connection_type==='system'||profile.connectionType==='system')return{system:true};
  const type=profile.connection_type||profile.connectionType;
  if(!['bluetooth','usb'].includes(type))throw new Error(type==='network'?'NETWORK_ESC_POS_NOT_AVAILABLE_ON_CAPACITOR7':'UNSUPPORTED_PRINTER_CONNECTION');
  const address=String(profile.address||'').trim();
  if(!address)throw new Error('PRINTER_ADDRESS_REQUIRED');
  const plugin=printerPlugin();
  let hashKey='';
  try{
    if(type==='usb'){
      const devices=(await plugin.getUsbPrinterDevices())?.devices||[];
      const device=devices.find(d=>d.id===address);
      if(device&&!device.hasPermission){
        const permission=await plugin.requestUsbPermission({address});
        if(!permission?.value)throw new Error('USB_PERMISSION_DENIED');
      }
    }
    const created=await plugin.createPrinter({connectionType:type,address});
    hashKey=String(created?.value||'');
    if(!hashKey)throw new Error('PRINTER_LINK_FAILED');
    await plugin.connectPrinter({hashKey});
    const payload=escPosBytes(text,profile.cut_after_print!==false&&profile.cutAfterPrint!==false);
    await plugin.sendToPrinter({hashKey,data:Array.from(payload)});
    return{ok:true,bytes:payload.length};
  }finally{
    if(hashKey){
      try{await plugin.disconnectPrinter({hashKey})}catch{}
      try{await plugin.disposePrinter({hashKey})}catch{}
    }
  }
}

export function escPosBytes(text,cut=true){
  const body=new TextEncoder().encode(safeAscii(text).replace(/\r/g,''));
  const bytes=[27,64,27,97,0,...body,10,10];
  if(cut)bytes.push(29,86,65,0);
  return bytes;
}

export function buildReceiptText(receipt,{restaurantName='ReMaPro POS',currency='CHF',width=42}={}){
  width=Math.max(24,Math.min(80,Number(width)||42));
  const items=Array.isArray(receipt?.items)?receipt.items:[];
  const payments=Array.isArray(receipt?.payments)?receipt.payments:[];
  const refunds=Array.isArray(receipt?.refunds)?receipt.refunds.filter(r=>r.status==='completed'):[];
  const rows=[
    center(restaurantName,width),
    center(receipt?.receipt_number||receipt?.receiptNumber||'TICKET',width),
    center(receipt?.table_label||receipt?.service_type||'',width),
    line(width)
  ];
  for(const item of items){
    rows.push(fit((Number(item.quantity)||1)+'x '+(item.name_snapshot||'Article'),money(item.line_total,currency),width));
  }
  rows.push(line(width));
  rows.push(fit('TOTAL TTC',money(receipt?.total,currency),width));
  if(Number(receipt?.tip_total))rows.push(fit('Pourboire',money(receipt.tip_total,currency),width));
  const refundTotal=refunds.reduce((s,r)=>s+Number(r.amount||0),0);
  if(refundTotal)rows.push(fit('Rembourse',money(-refundTotal,currency),width));
  if(payments.length){
    rows.push(line(width));
    for(const p of payments)rows.push(fit(((p.metadata?.splitLabel?p.metadata.splitLabel+' ':'')+String(p.method||'').toUpperCase()),money(Number(p.amount||0)+Number(p.tip_amount||0),currency),width));
  }
  rows.push(line(width),center('Merci et a bientot',width));
  return rows.join('\n');
}

export function buildProductionText(order,{station='kitchen',width=42}={}){
  width=Math.max(24,Math.min(80,Number(width)||42));
  const items=(Array.isArray(order?.items)?order.items:[]).filter(i=>station==='all'||i.station_snapshot===station);
  const title=station==='bar'?'BAR':'CUISINE';
  const rows=[
    center(title,width),
    center(order?.table_label||order?.service_type||'COMMANDE',width),
    line(width)
  ];
  for(const item of items){
    rows.push((Number(item.quantity)||1)+'x '+safeAscii(item.name_snapshot||'Article'));
    if(item.note)rows.push('  NOTE: '+safeAscii(item.note));
  }
  rows.push(line(width));
  return rows.join('\n');
}

export function buildTestText(profile){
  const width=Math.max(24,Math.min(80,Number(profile?.chars_per_line||profile?.charsPerLine)||42));
  return [
    center('ReMaPro POS',width),
    center('TEST IMPRIMANTE',width),
    line(width),
    'Profil: '+safeAscii(profile?.label||'Imprimante'),
    'Role: '+safeAscii(profile?.role||'receipt'),
    'Type: '+safeAscii(profile?.connection_type||profile?.connectionType||'system'),
    line(width),
    center('Impression OK',width)
  ].join('\n');
}
