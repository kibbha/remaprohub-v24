const csvCell=value=>{
  const text=String(value??'');
  return /[;"\n\r]/.test(text)?'"'+text.replaceAll('"','""')+'"':text;
};
export function csv(rows=[],headers=[]){
  const cols=headers.length?headers:Object.keys(rows[0]||{});
  return '\uFEFF'+[cols.join(';'),...rows.map(row=>cols.map(key=>csvCell(row?.[key])).join(';'))].join('\r\n');
}
export function accountingIntegrationProfiles(){
  return[
    {id:'csv_ch',label:'CSV comptable CH',status:'ready',mode:'file'},
    {id:'bexio',label:'bexio',status:'prepared',mode:'api'},
    {id:'abacus',label:'Abacus',status:'prepared',mode:'api'},
    {id:'banana',label:'Banana Accounting',status:'prepared',mode:'file'},
    {id:'sage',label:'Sage',status:'prepared',mode:'file'}
  ];
}
export function posAccountingSheets(data={}){
  const orderById=new Map((data.orders||[]).map(x=>[String(x.id),x]));
  const sales=(data.orders||[]).map(o=>({
    date:o.business_date,receipt:o.receipt_number,status:o.status,service:o.service_type,
    covers:Number(o.covers)||0,subtotal:Number(o.subtotal)||0,tax:Number(o.tax_total)||0,
    total:Number(o.total)||0,tips:Number(o.tip_total)||0,currency:o.currency||data.restaurant?.currency||'CHF'
  }));
  const vat=(data.taxSummary||[]).map(x=>({from:data.range?.from,to:data.range?.to,taxRate:x.taxRate,net:x.net,tax:x.tax,gross:x.gross,currency:data.restaurant?.currency||'CHF'}));
  const payments=(data.paymentSummary||[]).map(x=>({from:data.range?.from,to:data.range?.to,method:x.method,amount:x.amount,currency:data.restaurant?.currency||'CHF'}));
  const refunds=(data.refunds||[]).map(r=>{const o=orderById.get(String(r.order_id))||{};return{date:String(r.completed_at||r.requested_at||'').slice(0,10),receipt:o.receipt_number||'',method:r.method||'',amount:Number(r.amount)||0,tip:Number(r.tip_amount)||0,status:r.status||'',reason:r.reason||'',currency:o.currency||data.restaurant?.currency||'CHF'}});
  return{sales,vat,payments,refunds};
}
export function hubPurchaseSheet(state={},from='',to=''){
  const inRange=date=>String(date||'')>=from&&String(date||'')<=to;
  const purchases=(state.purchases||[]).filter(x=>inRange(x.date)).map(x=>({date:x.date,supplier:x.supplier||'',reference:x.reference||'',amount:Number(x.amount)||0,note:x.note||'',source:'purchase'}));
  const invoices=(state.invoices||[]).filter(x=>inRange(x.date)).map(x=>({date:x.date,supplier:x.supplier||'',reference:x.reference||'',amount:Number(x.amount)||0,note:x.status||'',source:'invoice'}));
  return [...purchases,...invoices].sort((a,b)=>String(a.date).localeCompare(String(b.date)));
}
export function accountingCsv(kind,{pos={},state={},from='',to=''}={}){
  const sheets=posAccountingSheets(pos);
  if(kind==='sales')return csv(sheets.sales,['date','receipt','status','service','covers','subtotal','tax','total','tips','currency']);
  if(kind==='vat')return csv(sheets.vat,['from','to','taxRate','net','tax','gross','currency']);
  if(kind==='payments')return csv(sheets.payments,['from','to','method','amount','currency']);
  if(kind==='refunds')return csv(sheets.refunds,['date','receipt','method','amount','tip','status','reason','currency']);
  if(kind==='purchases')return csv(hubPurchaseSheet(state,from,to),['date','supplier','reference','amount','note','source']);
  throw new Error('UNKNOWN_ACCOUNTING_EXPORT');
}
