import {cloudConfigured,signIn,signOut,currentSession,loadIdentity,posFunction} from './cloud.js';
import {kvGet,kvSet,kvDelete,queuePut,queueDelete,queueAll,uuid} from './db.js';

const APP_VERSION='0.4.0';
const state={
  identity:null,restaurant:null,bootstrap:null,category:'Tous',cart:[],
  busy:false,error:'',queueCount:0,online:navigator.onLine,cashSession:null,
  receipts:[],serviceType:'counter',tableLabel:'',covers:1,
  tables:[],openOrders:[],view:'sale',activeOrderId:null,activeTableId:null
};
const app=document.querySelector('#app');
const money=v=>new Intl.NumberFormat('fr-CH',{style:'currency',currency:state.restaurant?.currency||'CHF'}).format(Number(v)||0);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateKey=()=>new Intl.DateTimeFormat('en-CA',{timeZone:state.restaurant?.timezone||'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const sessionKey=id=>'cashSession:'+id;
const catalogKey=id=>'catalog:'+id;
const receiptsKey=id=>'receipts:'+id;
const tablesKey=id=>'tables:'+id;
const openOrdersKey=id=>'openOrders:'+id;

async function ensureDevice(){
  let d=await kvGet('device');
  if(!d){d={id:uuid(),installId:uuid(),label:'Caisse principale',platform:'android',appVersion:APP_VERSION};await kvSet('device',d)}
  d.appVersion=APP_VERSION;await kvSet('device',d);return d;
}
async function updateQueueCount(){state.queueCount=(await queueAll()).length}
function isManager(){
  const restaurant=state.restaurant;if(!restaurant)return false;
  return (state.identity?.memberships||[]).some(m=>
    m.organization_id===restaurant.organization_id &&
    ((!m.restaurant_id&&['network_admin','network_manager'].includes(m.role)) ||
     (m.restaurant_id===restaurant.id&&['restaurant_admin','director','manager'].includes(m.role)))
  );
}
async function saveFloorCache(){
  if(!state.restaurant)return;
  await kvSet(tablesKey(state.restaurant.id),state.tables);
  await kvSet(openOrdersKey(state.restaurant.id),state.openOrders);
}
async function refreshFloorData(){
  if(!state.restaurant)return;
  if(!state.online){
    state.tables=await kvGet(tablesKey(state.restaurant.id))||state.tables||[];
    state.openOrders=await kvGet(openOrdersKey(state.restaurant.id))||state.openOrders||[];
    return;
  }
  try{
    const [tables,orders]=await Promise.all([
      posFunction({action:'list_tables',restaurantId:state.restaurant.id}),
      posFunction({action:'list_open_orders',restaurantId:state.restaurant.id})
    ]);
    state.tables=tables.rows||[];
    state.openOrders=orders.rows||[];
    await saveFloorCache();
  }catch(error){state.error=error.message||String(error)}
}
async function saveReceipt(receipt){
  if(!receipt?.receiptNumber||!state.restaurant)return;
  state.receipts=[receipt,...state.receipts.filter(x=>x.receiptNumber!==receipt.receiptNumber)].slice(0,30);
  await kvSet(receiptsKey(state.restaurant.id),state.receipts);
}
async function executeQueued(item){
  if(item.action==='open_cash_session'){
    const r=await posFunction({action:'open_cash_session',restaurantId:item.restaurantId,...item.payload});
    if(state.cashSession?.id===item.payload.sessionId){state.cashSession={...state.cashSession,...r.session,synced:true};await kvSet(sessionKey(item.restaurantId),state.cashSession)}
    return r;
  }
  if(item.action==='commit_order'){
    const r=await posFunction({action:'commit_order',restaurantId:item.restaurantId,order:item.payload.order});
    if(r.receipt)await saveReceipt(r.receipt);
    return r;
  }
  if(item.action==='save_open_order'){
    return posFunction({action:'save_open_order',restaurantId:item.restaurantId,order:item.payload.order});
  }
  if(item.action==='settle_open_order'){
    const r=await posFunction({action:'settle_open_order',restaurantId:item.restaurantId,...item.payload});
    if(r.receipt)await saveReceipt(r.receipt);
    state.openOrders=state.openOrders.filter(x=>x.id!==item.payload.orderId);
    await saveFloorCache();
    return r;
  }
  if(item.action==='close_cash_session'){
    const r=await posFunction({action:'close_cash_session',restaurantId:item.restaurantId,...item.payload});
    if(state.cashSession?.id===item.payload.sessionId){
      await kvSet('lastClosedSession:'+item.restaurantId,r.session||state.cashSession);
      state.cashSession=null;await kvDelete(sessionKey(item.restaurantId));
    }
    return r;
  }
  throw new Error('UNKNOWN_QUEUE_ACTION');
}
async function flushQueue(){
  if(!state.online||!state.restaurant)return;
  const list=await queueAll();
  let floorChanged=false;
  for(const item of list){
    if(item.restaurantId!==state.restaurant.id)continue;
    try{
      await executeQueued(item);
      if(['save_open_order','settle_open_order'].includes(item.action))floorChanged=true;
      await queueDelete(item.client_event_id);
    }catch(error){state.error='Synchronisation: '+(error.message||String(error));break}
  }
  if(floorChanged&&state.online)await refreshFloorData();
  await updateQueueCount();render();
}
async function queueCommand(action,payload){
  const item={client_event_id:uuid(),queued_at:new Date().toISOString(),action,restaurantId:state.restaurant.id,payload};
  await queuePut(item);await updateQueueCount();return item;
}
async function bootstrapRestaurant(restaurant){
  state.restaurant=restaurant;state.error='';
  state.receipts=await kvGet(receiptsKey(restaurant.id))||[];
  state.tables=await kvGet(tablesKey(restaurant.id))||[];
  state.openOrders=await kvGet(openOrdersKey(restaurant.id))||[];
  state.cashSession=await kvGet(sessionKey(restaurant.id));
  const cached=await kvGet(catalogKey(restaurant.id));if(cached)state.bootstrap=cached;
  render();
  const device=await ensureDevice();
  if(state.online){
    try{
      await posFunction({action:'heartbeat',restaurantId:restaurant.id,device});
      const data=await posFunction({action:'bootstrap',restaurantId:restaurant.id,deviceId:device.id});
      state.bootstrap=data;await kvSet(catalogKey(restaurant.id),data);
      if(data.openSession){
        state.cashSession={id:data.openSession.id,businessDate:data.openSession.business_date||data.openSession.businessDate,status:'open',openingCash:Number(data.openSession.opening_cash??data.openSession.openingCash)||0,synced:true};
        await kvSet(sessionKey(restaurant.id),state.cashSession);
      }
      await refreshFloorData();
      const rr=await posFunction({action:'recent_receipts',restaurantId:restaurant.id,limit:30}).catch(()=>({rows:[]}));
      if(rr.rows?.length){state.receipts=rr.rows.map(x=>({receiptNumber:x.receipt_number,total:x.total,status:x.status,businessDate:x.business_date}));await kvSet(receiptsKey(restaurant.id),state.receipts)}
    }catch(error){state.error=error.message||String(error)}
  }
  await updateQueueCount();render();flushQueue().catch(()=>{});
}
async function loadAccount(){
  state.busy=true;state.error='';render();
  try{
    state.identity=await loadIdentity();
    const preferred=await kvGet('restaurantId'),restaurants=state.identity.restaurants||[];
    const target=restaurants.find(r=>r.id===preferred)||restaurants[0]||null;
    if(target){await kvSet('restaurantId',target.id);await bootstrapRestaurant(target)}
  }catch(error){state.error=error.message||String(error);if(/AUTH/.test(state.error))signOut()}
  finally{state.busy=false;render()}
}
async function openSession(openingCash){
  const device=await ensureDevice();
  const session={id:uuid(),businessDate:dateKey(),status:'open',openingCash:Number(openingCash)||0,synced:false};
  state.cashSession=session;await kvSet(sessionKey(state.restaurant.id),session);
  await queueCommand('open_cash_session',{sessionId:session.id,deviceId:device.id,businessDate:session.businessDate,openingCash:session.openingCash});
  render();flushQueue().catch(()=>{});
}
async function closeSession(countedCash){
  if(!state.cashSession)return;
  if(state.openOrders.some(x=>['open','sent','preparing','served','payment_pending'].includes(x.status))){
    alert('Impossible de clôturer : il reste des notes ouvertes.');
    return;
  }
  state.cashSession={...state.cashSession,status:'closing'};await kvSet(sessionKey(state.restaurant.id),state.cashSession);
  await queueCommand('close_cash_session',{sessionId:state.cashSession.id,countedCash:Number(countedCash)||0});
  render();flushQueue().catch(()=>{});
}
function orderLines(){
  return state.cart.map(x=>({id:uuid(),catalog_item_id:x.quick?null:x.id,recipe_id:x.recipe_id,sku:x.sku,name:x.name,quantity:x.qty,unit_price:x.price,tax_rate:x.tax_rate}));
}
function openTable(table){
  const existing=state.openOrders.find(o=>o.table_id===table.id||(!o.table_id&&o.table_label===table.label));
  state.activeTableId=table.id;state.tableLabel=table.label;state.serviceType='dine_in';
  if(existing){
    state.activeOrderId=existing.id;state.covers=Number(existing.covers)||table.seats||1;
    state.cart=(existing.items||[]).map(item=>({
      id:item.catalog_item_id||('saved:'+item.id),recipe_id:item.recipe_id||null,sku:item.sku_snapshot||'',
      name:item.name_snapshot,price:Number(item.unit_price)||0,tax_rate:Number(item.tax_rate)||0,
      qty:Number(item.quantity)||1,quick:!item.catalog_item_id
    }));
  }else{
    state.activeOrderId=uuid();state.covers=table.seats||1;state.cart=[];
  }
  state.view='sale';render();
}
async function addDiningTable(){
  if(!isManager())return;
  const label=prompt('Nom de la table (ex. Table 1)');if(!label?.trim())return;
  const raw=prompt('Nombre de places','2');if(raw===null)return;
  const seats=Math.max(0,Math.min(99,Math.trunc(Number(raw)||2)));
  try{
    const r=await posFunction({action:'sync_tables',restaurantId:state.restaurant.id,tables:[{label:label.trim(),seats,area:'Salle',sortOrder:state.tables.length}],replace:false});
    state.tables=r.rows||state.tables;await saveFloorCache();state.error='';render();
  }catch(error){state.error=error.message||String(error);render()}
}
function localOpenOrder(order,status='open'){
  return {
    id:order.id,business_date:order.businessDate,table_id:order.tableId||null,table_label:order.tableLabel||null,
    service_type:order.serviceType,status,currency:order.currency,covers:order.covers,
    total:order.lines.reduce((s,x)=>s+Number(x.quantity)*Number(x.unit_price),0),
    items:order.lines.map(x=>({id:x.id,order_id:order.id,catalog_item_id:x.catalog_item_id,recipe_id:x.recipe_id,name_snapshot:x.name,sku_snapshot:x.sku,quantity:x.quantity,unit_price:x.unit_price,tax_rate:x.tax_rate,line_total:Number(x.quantity)*Number(x.unit_price),kitchen_status:'new'})),
    updated_at:new Date().toISOString()
  };
}
function buildOpenOrder(orderId,eventId){
  return {
    id:orderId,clientEventId:eventId,deviceId:null,cashSessionId:state.cashSession.id,businessDate:state.cashSession.businessDate,
    serviceType:state.serviceType,tableId:state.activeTableId,tableLabel:state.tableLabel,covers:Number(state.covers)||0,
    currency:state.restaurant.currency||'CHF',lines:orderLines(),occurredAt:new Date().toISOString()
  };
}
async function saveOpenOrder(){
  if(!state.cart.length||!state.cashSession||state.cashSession.status!=='open')return;
  const device=await ensureDevice(),orderId=state.activeOrderId||uuid(),eventId=uuid(),order=buildOpenOrder(orderId,eventId);
  order.deviceId=device.id;
  await queuePut({client_event_id:eventId,queued_at:new Date().toISOString(),action:'save_open_order',restaurantId:state.restaurant.id,payload:{order}});
  const local=localOpenOrder(order,'open');
  state.openOrders=[local,...state.openOrders.filter(x=>x.id!==orderId)];
  await saveFloorCache();state.cart=[];state.activeOrderId=null;state.activeTableId=null;state.tableLabel='';state.view='floor';
  await updateQueueCount();render();flushQueue().catch(()=>{});
}
function addItem(item){const line=state.cart.find(x=>x.id===item.id);if(line)line.qty+=1;else state.cart.push({id:item.id,recipe_id:item.recipe_id||null,sku:item.sku||'',name:item.name,price:Number(item.price)||0,tax_rate:Number(item.tax_rate)||0,qty:1,quick:!!item.quick});render()}
function addQuickItem(){
  const name=prompt('Nom de l’article libre');if(!name?.trim())return;
  const raw=prompt('Prix TTC (CHF)','0.00');if(raw===null)return;
  const price=Number(String(raw).replace(',','.'));if(!Number.isFinite(price)||price<0){alert('Prix invalide');return}
  addItem({id:'quick:'+uuid(),name:name.trim(),price,tax_rate:8.1,quick:true});
}
async function refreshCatalog(){
  if(!state.restaurant||!state.online)return;
  try{
    const device=await ensureDevice();
    const data=await posFunction({action:'bootstrap',restaurantId:state.restaurant.id,deviceId:device.id});
    state.bootstrap=data;await kvSet(catalogKey(state.restaurant.id),data);state.error='';
  }catch(error){state.error=error.message||String(error)}
  render();
}
function changeQty(id,delta){const line=state.cart.find(x=>x.id===id);if(!line)return;line.qty+=delta;if(line.qty<=0)state.cart=state.cart.filter(x=>x.id!==id);render()}
const cartTotal=()=>state.cart.reduce((s,x)=>s+x.qty*x.price,0);

async function checkout(method){
  if(!state.cart.length||!state.restaurant||!state.cashSession||state.cashSession.status!=='open')return;
  const device=await ensureDevice(),now=new Date();

  if(state.activeTableId||state.activeOrderId||state.serviceType==='dine_in'){
    const orderId=state.activeOrderId||uuid(),saveEventId=uuid(),settleEventId=uuid();
    const order=buildOpenOrder(orderId,saveEventId);order.deviceId=device.id;
    await queuePut({client_event_id:saveEventId,queued_at:now.toISOString(),action:'save_open_order',restaurantId:state.restaurant.id,payload:{order}});
    await queuePut({
      client_event_id:settleEventId,queued_at:new Date(now.getTime()+1).toISOString(),action:'settle_open_order',restaurantId:state.restaurant.id,
      payload:{orderId,clientEventId:settleEventId,deviceId:device.id,cashSessionId:state.cashSession.id,paymentMethod:method,paymentProvider:'',paymentReference:'',tipAmount:0,occurredAt:now.toISOString()}
    });
    const local=localOpenOrder(order,'payment_pending');
    state.openOrders=[local,...state.openOrders.filter(x=>x.id!==orderId)];
  }else{
    const orderId=uuid(),eventId=uuid();
    const order={
      id:orderId,clientEventId:eventId,deviceId:device.id,cashSessionId:state.cashSession.id,
      businessDate:state.cashSession.businessDate,serviceType:state.serviceType,tableLabel:state.tableLabel,
      covers:Number(state.covers)||0,currency:state.restaurant.currency||'CHF',lines:orderLines(),
      paymentMethod:method,paymentProvider:'',paymentReference:'',tipAmount:0,occurredAt:now.toISOString()
    };
    await queuePut({client_event_id:eventId,queued_at:now.toISOString(),action:'commit_order',restaurantId:state.restaurant.id,payload:{order}});
  }

  state.cart=[];state.activeOrderId=null;state.activeTableId=null;state.tableLabel='';state.view='floor';
  await saveFloorCache();await updateQueueCount();render();
  if(state.online)await flushQueue();else state.error='Vente enregistrée hors ligne — synchronisation automatique au retour du réseau.';
  render();
}

function loginView(){return `<div class="login-wrap"><form class="card" id="login-form"><h1>ReMaPro POS</h1><p>Caisse connectée à ReMaPro Hub.</p>${!cloudConfigured()?'<div class="notice error">Configuration Supabase non injectée.</div>':''}${state.error?'<div class="notice error">'+esc(state.error)+'</div>':''}<label class="field">E-mail<input name="email" type="email" autocomplete="username" required></label><label class="field">Mot de passe<input name="password" type="password" autocomplete="current-password" required></label><button class="primary" type="submit" ${state.busy?'disabled':''}>${state.busy?'Connexion…':'Se connecter'}</button><p class="muted">v${APP_VERSION}</p></form></div>`}
function pickerView(){return `<div class="picker-wrap"><div class="card"><h1>Choisir le restaurant</h1><label class="field">Établissement<select id="restaurant-select"><option value="">Sélectionner…</option>${(state.identity?.restaurants||[]).map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select></label><button class="secondary" id="logout">Déconnexion</button></div></div>`}
function sessionView(){return `<div class="picker-wrap"><form class="card" id="open-session"><h1>Ouvrir la caisse</h1><p>${esc(state.restaurant.name)} · ${dateKey()}</p><label class="field">Fond de caisse (CHF)<input name="opening" inputmode="decimal" value="0.00" required></label><button class="primary" type="submit">Ouvrir le service</button><button class="secondary wide" type="button" id="switch-restaurant">Changer de restaurant</button></form></div>`}
function topbar(){
  return `<header class="topbar"><div class="brand">ReMaPro POS <small>v${APP_VERSION}</small></div><div>${esc(state.restaurant.name)}</div>
    <button class="nav-tab ${state.view==='sale'?'active':''}" id="nav-sale">Caisse</button><button class="nav-tab ${state.view==='floor'?'active':''}" id="nav-floor">Salle</button>
    <div class="spacer"></div><div class="session-chip">Caisse ${state.cashSession?.status==='closing'?'en clôture':'ouverte'} · ${money(state.cashSession?.openingCash)}</div>
    <div class="queue">${state.queueCount} en attente</div><div class="status"><span class="dot ${state.online?'online':''}"></span>${state.online?'En ligne':'Hors ligne'}</div>
    <button class="secondary" id="refresh-catalog" ${!state.online?'disabled':''}>Rafraîchir</button><button class="secondary" id="close-session" ${state.cashSession?.status!=='open'?'disabled':''}>Clôturer</button></header>`;
}
function floorView(){
  const unassigned=state.openOrders.filter(o=>!o.table_id);
  return `<div class="shell">${topbar()}${state.error?'<div class="notice error banner">'+esc(state.error)+'</div>':''}
    <main class="floor-page"><div class="floor-head"><div><h2>Plan de salle</h2><p>${state.openOrders.length} note${state.openOrders.length>1?'s':''} ouverte${state.openOrders.length>1?'s':''}</p></div>
      ${isManager()?'<button class="primary compact" id="add-table">+ Table</button>':''}</div>
      <div class="table-grid">${state.tables.map(t=>{const o=state.openOrders.find(x=>x.table_id===t.id||(!x.table_id&&x.table_label===t.label));return `<button class="table-card ${o?'occupied':'free'}" data-table="${t.id}"><span class="table-label">${esc(t.label)}</span><span>${t.seats||0} pl.</span><strong>${o?money(o.total):'Libre'}</strong>${o?'<small>'+esc(o.status)+'</small>':''}</button>`}).join('')||'<div class="empty">Aucune table configurée.</div>'}</div>
      ${unassigned.length?`<section class="unassigned"><h3>Notes sans table</h3>${unassigned.map(o=>`<button class="secondary open-order" data-order="${o.id}">${esc(o.table_label||o.service_type)} · ${money(o.total)}</button>`).join('')}</section>`:''}
    </main></div>`;
}
function mainView(){
  const catalog=state.bootstrap?.catalog||[],cats=['Tous',...new Set(catalog.map(x=>x.category||'Autres'))];
  if(!cats.includes(state.category))state.category='Tous';
  const visible=state.category==='Tous'?catalog:catalog.filter(x=>(x.category||'Autres')===state.category);
  return `<div class="shell">${topbar()}
  ${state.error?'<div class="notice error banner">'+esc(state.error)+'</div>':''}
  <main class="workspace"><nav class="categories">${cats.map(c=>`<button class="category ${c===state.category?'active':''}" data-category="${esc(c)}">${esc(c)}</button>`).join('')}</nav>
  <section class="products"><div class="product-toolbar"><button class="secondary" id="quick-item">+ Article libre</button><span>${catalog.length} article${catalog.length>1?'s':''}</span></div>${visible.length?`<div class="product-grid">${visible.map(p=>`<button class="product" data-product="${p.id}"><strong>${esc(p.name)}</strong><span class="price">${money(p.price)}</span></button>`).join('')}</div>`:'<div class="empty"><h3>Catalogue POS vide</h3><p>Les articles seront publiés depuis ReMaPro Hub.</p></div>'}</section>
  <aside class="cart"><div class="cart-head"><h2>Commande</h2><div class="order-meta"><select id="service-type"><option value="counter" ${state.serviceType==='counter'?'selected':''}>Comptoir</option><option value="dine_in" ${state.serviceType==='dine_in'?'selected':''}>Sur place</option><option value="takeaway" ${state.serviceType==='takeaway'?'selected':''}>À emporter</option></select><input id="table-label" placeholder="Table" value="${esc(state.tableLabel)}"><input id="covers" type="number" min="0" value="${Number(state.covers)||0}" title="Couverts"></div></div>
  <div class="cart-list">${state.cart.length?state.cart.map(x=>`<div class="line"><div><strong>${esc(x.name)}</strong><div>${money(x.price)} × ${x.qty}</div></div><div class="qty"><button data-minus="${x.id}">−</button><span>${x.qty}</span><button data-plus="${x.id}">+</button></div></div>`).join(''):'<div class="empty">Touchez un article pour commencer.</div>'}</div>
  <div class="cart-foot"><div class="total-row"><span>Total</span><span>${money(cartTotal())}</span></div>${(state.activeTableId||state.serviceType==='dine_in')?'<button class="save-note" id="save-open-order" '+(!state.cart.length?'disabled':'')+'>Enregistrer la note</button>':''}<div class="payments"><button data-pay="cash" ${!state.cart.length?'disabled':''}>Espèces</button><button data-pay="card" ${!state.cart.length?'disabled':''}>Carte</button><button data-pay="twint" ${!state.cart.length?'disabled':''}>TWINT</button></div>${state.receipts[0]?.receiptNumber?`<div class="last-receipt">Dernier ticket: <strong>${esc(state.receipts[0].receiptNumber)}</strong> · ${money(state.receipts[0].total)}</div>`:''}</div></aside></main></div>`;
}
function render(){
  if(!currentSession()){app.innerHTML=loginView();wire();return}
  if(!state.identity){app.innerHTML=`<div class="login-wrap"><div class="card"><h1>ReMaPro POS</h1><p>${state.busy?'Chargement…':'Connexion au compte…'}</p>${state.error?'<div class="notice error">'+esc(state.error)+'</div>':''}</div></div>`;wire();return}
  if(!state.restaurant){app.innerHTML=pickerView();wire();return}
  if(!state.cashSession){app.innerHTML=sessionView();wire();return}
  app.innerHTML=state.view==='floor'?floorView():mainView();wire();
}
function wire(){
  document.querySelector('#login-form')?.addEventListener('submit',async e=>{e.preventDefault();state.busy=true;state.error='';render();const fd=new FormData(e.currentTarget);try{await signIn(fd.get('email'),fd.get('password'));await loadAccount()}catch(error){state.error=error.message||String(error);state.busy=false;render()}});
  document.querySelector('#restaurant-select')?.addEventListener('change',async e=>{const r=(state.identity?.restaurants||[]).find(x=>x.id===e.target.value);if(r){await kvSet('restaurantId',r.id);await bootstrapRestaurant(r)}});
  document.querySelector('#logout')?.addEventListener('click',()=>{signOut();state.identity=null;state.restaurant=null;render()});
  document.querySelector('#switch-restaurant')?.addEventListener('click',()=>{state.restaurant=null;state.cashSession=null;render()});
  document.querySelector('#open-session')?.addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);await openSession(Number(String(fd.get('opening')).replace(',','.'))||0)});
  document.querySelector('#nav-sale')?.addEventListener('click',()=>{state.view='sale';state.activeOrderId=null;state.activeTableId=null;state.tableLabel='';state.serviceType='counter';state.cart=[];render()});
  document.querySelector('#nav-floor')?.addEventListener('click',()=>{state.view='floor';refreshFloorData().then(render)});
  document.querySelector('#add-table')?.addEventListener('click',()=>addDiningTable());
  document.querySelectorAll('[data-table]').forEach(b=>b.addEventListener('click',()=>{const t=state.tables.find(x=>x.id===b.dataset.table);if(t)openTable(t)}));
  document.querySelectorAll('[data-order]').forEach(b=>b.addEventListener('click',()=>{const o=state.openOrders.find(x=>x.id===b.dataset.order);if(!o)return;state.activeOrderId=o.id;state.activeTableId=o.table_id||null;state.tableLabel=o.table_label||'';state.serviceType=o.service_type||'dine_in';state.covers=o.covers||1;state.cart=(o.items||[]).map(item=>({id:item.catalog_item_id||('saved:'+item.id),recipe_id:item.recipe_id||null,sku:item.sku_snapshot||'',name:item.name_snapshot,price:Number(item.unit_price)||0,tax_rate:Number(item.tax_rate)||0,qty:Number(item.quantity)||1,quick:!item.catalog_item_id}));state.view='sale';render()}));
  document.querySelector('#save-open-order')?.addEventListener('click',()=>saveOpenOrder());
  document.querySelector('#refresh-catalog')?.addEventListener('click',()=>{refreshCatalog();refreshFloorData().then(render)});
  document.querySelector('#quick-item')?.addEventListener('click',()=>addQuickItem());
  document.querySelector('#close-session')?.addEventListener('click',async()=>{const v=prompt('Montant espèces compté dans le tiroir (CHF)');if(v===null)return;const n=Number(String(v).replace(',','.'));if(!Number.isFinite(n)||n<0){alert('Montant invalide');return}await closeSession(n)});
  document.querySelector('#service-type')?.addEventListener('change',e=>state.serviceType=e.target.value);
  document.querySelector('#table-label')?.addEventListener('input',e=>state.tableLabel=e.target.value);
  document.querySelector('#covers')?.addEventListener('input',e=>state.covers=Math.max(0,Number(e.target.value)||0));
  document.querySelectorAll('[data-category]').forEach(b=>b.addEventListener('click',()=>{state.category=b.dataset.category;render()}));
  document.querySelectorAll('[data-product]').forEach(b=>b.addEventListener('click',()=>{const p=(state.bootstrap?.catalog||[]).find(x=>x.id===b.dataset.product);if(p)addItem(p)}));
  document.querySelectorAll('[data-minus]').forEach(b=>b.addEventListener('click',()=>changeQty(b.dataset.minus,-1)));
  document.querySelectorAll('[data-plus]').forEach(b=>b.addEventListener('click',()=>changeQty(b.dataset.plus,1)));
  document.querySelectorAll('[data-pay]').forEach(b=>b.addEventListener('click',()=>checkout(b.dataset.pay)));
}
async function init(){
  if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
  window.addEventListener('online',()=>{state.online=true;render();flushQueue().catch(()=>{})});
  window.addEventListener('offline',()=>{state.online=false;render()});
  await updateQueueCount();if(!currentSession()){render();return}await loadAccount();
}
init();
