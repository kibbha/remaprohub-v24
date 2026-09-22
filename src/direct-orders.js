export function directOrderAge(order,now=Date.now()){
  const at=Date.parse(order?.created_at||'');return Number.isFinite(at)?Math.max(0,Math.floor((now-at)/60000)):0;
}
export function directOrderCart(order){
  return (order?.direct_order_items||[]).map(item=>({
    id:item.catalog_item_id||('web:'+item.id),catalog_item_id:item.catalog_item_id||null,line_id:null,recipe_id:null,sku:'',
    name:String(item.name_snapshot||''),price:Number(item.unit_price)||0,tax_rate:Number(item.tax_rate)||0,
    production_station:item.station_snapshot||'kitchen',qty:Number(item.quantity)||1,quick:!item.catalog_item_id,
    locked:false,delta:false,modifiers:Array.isArray(item.modifiers)?item.modifiers:[],note:item.note||''
  }));
}
export function renderDirectOrders({orders=[],money,t,esc,online=true}){
  const pending=orders.filter(x=>x.status==='pending'),accepted=orders.filter(x=>x.status==='accepted');
  const card=o=>{const age=directOrderAge(o),items=o.direct_order_items||[],who=[o.customer_name,o.table_label].filter(Boolean).join(' · ');
    return `<article class="direct-order-card ${o.status==='pending'?'pending':'accepted'}">
      <header><div><strong>${esc(o.public_reference)}</strong><small>${esc(o.service_type)} · ${age} min</small></div><strong>${money(o.total)}</strong></header>
      <p>${esc(who||t('directAnonymous'))} · ${Number(o.covers)||0} ${t('covers')}</p>
      <div class="direct-order-lines">${items.map(i=>'<div><span>'+Number(i.quantity)+'× '+esc(i.name_snapshot)+'</span><strong>'+money(i.line_total)+'</strong></div>').join('')}</div>
      ${o.note?'<p class="direct-order-note">'+esc(o.note)+'</p>':''}
      <footer>${o.status==='pending'?'<button class="primary" data-direct-accept="'+o.id+'" '+(!online?'disabled':'')+'>'+t('directAccept')+'</button>':''}<button class="secondary danger-btn" data-direct-reject="${o.id}" ${!online?'disabled':''}>${t('directReject')}</button></footer>
    </article>`};
  return `<div class="shell"><main class="direct-orders-page"><div class="floor-head"><div><h2>${t('directOrders')}</h2><p>${pending.length} ${t('directPending')} · ${accepted.length} ${t('directAccepted')}</p></div><button class="secondary" id="refresh-direct-orders" ${!online?'disabled':''}>${t('refresh')}</button></div>
    <section class="direct-orders-grid">${orders.length?orders.map(card).join(''):'<div class="empty">'+t('directNone')+'</div>'}</section></main></div>`;
}
