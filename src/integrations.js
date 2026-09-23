const ADAPTERS=Object.freeze([
  {id:'worldline',label:'Worldline',category:'payments',status:'prepared',transport:'Terminal API Cloud / TIM',secretPolicy:'server_only'},
  {id:'twint',label:'TWINT',category:'payments',status:'prepared',transport:'Direct / PSP terminal',secretPolicy:'server_only'},
  {id:'bexio',label:'bexio',category:'accounting',status:'prepared',transport:'REST API',secretPolicy:'server_only'},
  {id:'abacus',label:'Abacus',category:'accounting',status:'prepared',transport:'API / export',secretPolicy:'server_only'},
  {id:'banana',label:'Banana Accounting',category:'accounting',status:'ready',transport:'CSV CH',secretPolicy:'none'},
  {id:'sage',label:'Sage',category:'accounting',status:'prepared',transport:'CSV / API adapter',secretPolicy:'server_only'},
  {id:'uber_eats',label:'Uber Eats',category:'ordering',status:'prepared',transport:'Order adapter / webhook',secretPolicy:'server_only'},
  {id:'just_eat',label:'Just Eat',category:'ordering',status:'prepared',transport:'Order adapter / webhook',secretPolicy:'server_only'},
  {id:'smood',label:'Smood',category:'ordering',status:'prepared',transport:'Order adapter / webhook',secretPolicy:'server_only'},
  {id:'customer_display',label:'Customer Display',category:'hardware',status:'ready',transport:'BroadcastChannel / secondary browser',secretPolicy:'none'},
  {id:'barcode_scanner',label:'Barcode Scanner',category:'hardware',status:'prepared',transport:'USB / Bluetooth HID',secretPolicy:'none'},
  {id:'scale',label:'Connected Scale',category:'hardware',status:'prepared',transport:'WebSerial / native adapter',secretPolicy:'none'},
  {id:'cash_drawer',label:'Cash Drawer',category:'hardware',status:'prepared',transport:'ESC/POS',secretPolicy:'none'}
]);
export function integrationAdapterRegistry(){return ADAPTERS.map(x=>({...x}))}
export function integrationAdapterSummary(){
  const rows=integrationAdapterRegistry();return{total:rows.length,ready:rows.filter(x=>x.status==='ready').length,prepared:rows.filter(x=>x.status==='prepared').length,categories:[...new Set(rows.map(x=>x.category))]}
}
export function clientSafeIntegrationAdapter(adapter){
  if(!adapter||typeof adapter!=='object')return null;const {id,label,category,status,transport,secretPolicy}=adapter;return{id,label,category,status,transport,secretPolicy}
}
