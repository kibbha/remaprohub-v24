import {cloudConfigured,signIn,signOut,currentSession,loadIdentity,posFunction} from './cloud.js';
import {kvGet,kvSet,kvDelete,queuePut,queueDelete,queueAll,uuid} from './db.js';

const APP_VERSION='0.2.0';
const state={
  identity:null,restaurant:null,bootstrap:null,category:'Tous',cart:[],
  busy:false,error:'',queueCount:0,online:navigator.onLine,cashSession:null,
  receipts:[],serviceType:'counter',tableLabel:'',covers:1
};
const app=document.querySelector('#app');
const money=v=>new Intl.NumberFormat('fr-CH',{style:'currency',currency:state.restaurant?.currency||'CHF'}).format(Number(v)||0);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateKey=()=>new Intl.DateTimeFormat('en-CA',{timeZone:state.restaurant?.timezone||'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const sessionKey=id=>'cashSession:'+id;
const catalogKey=id=>'catalog:'+id;
const receiptsKey=id=>'receipts:'+id;

async function ensureDevice(){
  let d=await kvGet('device');
  if(!d){d={id:uuid(),installId:uuid(),label:'Caisse principale',platform:'android',appVersion:APP_VERSION};await kvSet('device',d)}
  d.appVersion=APP_VERSION;await kvSet('device',d);return d;
}
async function updateQueueCount(){state.queueCount=(await queueAll()).length}
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
  for(const item of list){
    if(item.restaurantId!==state.restaurant.id)continue;
    try{await executeQueued(item);await queueDelete(item.client_event_id)}
    catch(error){state.error='Synchronisation: '+(error.message||String(error));break}
  }
  await updateQueueCount();render();
}
async function queueCommand(action,payload){
  const item={client_event_id:uuid(),queued_at:new Date().toISOString(),action,restaurantId:state.restaurant.id,payload};
  await queuePut(item);await updateQueueCount();return item;
}
async function bootstrapRestaurant(restaurant){
  state.restaurant=restaurant;state.error='';
  state.receipts=await kvGet(receiptsKey(restaurant.id))||[];
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
  state.cashSession={...state.cashSession,status:'closing'};await kvSet(sessionKey(state.restaurant.id),state.cashSession);
  await queueCommand('close_cash_session',{sessionId:state.cashSession.id,countedCash:Number(countedCash)||0});
  render();flushQueue().catch(()=>{});
}
function addItem(item){const line=state.cart.find(x=>x.id===item.id);if(line)line.qty+=1;else state.cart.push({id:item.id,recipe_id:item.recipe_id||null,sku:item.sku||'',name:item.name,price:Number(item.price)||0,tax_rate:Number(item.tax_rate)||0,qty:1});render()}
function changeQty(id,delta){const line=state.cart.find(x=>x.id===id);if(!line)return;line.qty+=delta;if(line.qty<=0)state.cart=state.cart.filter(x=>x.id!==id);render()}
const cartTotal=()=>state.cart.reduce((s,x)=>s+x.qty*x.price,0);

async function checkout(method){
  if(!state.cart.length||!state.restaurant||!state.cashSession||state.cashSession.status!=='open')return;
  const device=await ensureDevice(),now=new Date(),orderId=uuid(),eventId=uuid();
  const order={
    id:orderId,clientEventId:eventId,deviceId:device.id,cashSessionId:state.cashSession.id,
    businessDate:state.cashSession.businessDate,serviceType:state.serviceType,tableLabel:state.tableLabel,
    covers:Number(state.covers)||0,currency:state.restaurant.currency||'CHF',
    lines:state.cart.map(x=>({id:uuid(),catalog_item_id:x.id,recipe_id:x.recipe_id,sku:x.sku,name:x.name,quantity:x.qty,unit_price:x.price,tax_rate:x.tax_rate})),
    paymentMethod:method,paymentProvider:'',paymentReference:'',tipAmount:0,occurredAt:now.toISOString()
  };
  const snapshot=state.cart.map(x=>({...x})),total=cartTotal();
  state.cart=[];render();
  await queuePut({client_event_id:eventId,queued_at:now.toISOString(),action:'commit_order',restaurantId:state.restaurant.id,payload:{order},local:{total,lines:snapshot}});
  await updateQueueCount();render();
  if(state.online)await flushQueue();else state.error='Vente enregistrée hors ligne — synchronisation automatique au retour du réseau.';
  render();
}

function loginView(){return `<div class="login-wrap"><form class="card" id="login-form"><h1>ReMaPro POS</h1><p>Caisse connectée à ReMaPro Hub.</p>${!cloudConfigured()?'<div class="notice error">Configuration Supabase non injectée.</div>':''}${state.error?'<div class="notice error">'+esc(state.error)+'</div>':''}<label class="field">E-mail<input name="email" type="email" autocomplete="username" required></label><label class="field">Mot de passe<input name="password" type="password" autocomplete="current-password" required></label><button class="primary" type="submit" ${state.busy?'disabled':''}>${state.busy?'Connexion…':'Se connecter'}</button><p class="muted">v${APP_VERSION}</p></form></div>`}
function pickerView(){return `<div class="picker-wrap"><div class="card"><h1>Choisir le restaurant</h1><label class="field">Établissement<select id="restaurant-select"><option value="">Sélectionner…</option>${(state.identity?.restaurants||[]).map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select></label><button class="secondary" id="logout">Déconnexion</button></div></div>`}
function sessionView(){return `<div class="picker-wrap"><form class="card" id="open-session"><h1>Ouvrir la caisse</h1><p>${esc(state.restaurant.name)} · ${dateKey()}</p><label class="field">Fond de caisse (CHF)<input name="opening" inputmode="decimal" value="0.00" required></label><button class="primary" type="submit">Ouvrir le service</button><button class="secondary wide" type="button" id="switch-restaurant">Changer de restaurant</button></form></div>`}
function mainView(){
  const catalog=state.bootstrap?.catalog||[],cats=['Tous',...new Set(catalog.map(x=>x.category||'Autres'))];
  if(!cats.includes(state.category))state.category='Tous';
  const visible=state.category==='Tous'?catalog:catalog.filter(x=>(x.category||'Autres')===state.category);
  return `<div class="shell"><header class="topbar"><div class="brand">ReMaPro POS <small>v${APP_VERSION}</small></div><div>${esc(state.restaurant.name)}</div><div class="spacer"></div><div class="session-chip">Caisse ${state.cashSession?.status==='closing'?'en clôture':'ouverte'} · ${money(state.cashSession?.openingCash)}</div><div class="queue">${state.queueCount} en attente</div><div class="status"><span class="dot ${state.online?'online':''}"></span>${state.online?'En ligne':'Hors ligne'}</div><button class="secondary" id="close-session" ${state.cashSession?.status!=='open'?'disabled':''}>Clôturer</button></header>
  ${state.error?'<div class="notice error banner">'+esc(state.error)+'</div>':''}
  <main class="workspace"><nav class="categories">${cats.map(c=>`<button class="category ${c===state.category?'active':''}" data-category="${esc(c)}">${esc(c)}</button>`).join('')}</nav>
  <section class="products">${visible.length?`<div class="product-grid">${visible.map(p=>`<button class="product" data-product="${p.id}"><strong>${esc(p.name)}</strong><span class="price">${money(p.price)}</span></button>`).join('')}</div>`:'<div class="empty"><h3>Catalogue POS vide</h3><p>Les articles seront publiés depuis ReMaPro Hub.</p></div>'}</section>
  <aside class="cart"><div class="cart-head"><h2>Commande</h2><div class="order-meta"><select id="service-type"><option value="counter" ${state.serviceType==='counter'?'selected':''}>Comptoir</option><option value="dine_in" ${state.serviceType==='dine_in'?'selected':''}>Sur place</option><option value="takeaway" ${state.serviceType==='takeaway'?'selected':''}>À emporter</option></select><input id="table-label" placeholder="Table" value="${esc(state.tableLabel)}"><input id="covers" type="number" min="0" value="${Number(state.covers)||0}" title="Couverts"></div></div>
  <div class="cart-list">${state.cart.length?state.cart.map(x=>`<div class="line"><div><strong>${esc(x.name)}</strong><div>${money(x.price)} × ${x.qty}</div></div><div class="qty"><button data-minus="${x.id}">−</button><span>${x.qty}</span><button data-plus="${x.id}">+</button></div></div>`).join(''):'<div class="empty">Touchez un article pour commencer.</div>'}</div>
  <div class="cart-foot"><div class="total-row"><span>Total</span><span>${money(cartTotal())}</span></div><div class="payments"><button data-pay="cash" ${!state.cart.length?'disabled':''}>Espèces</button><button data-pay="card" ${!state.cart.length?'disabled':''}>Carte</button><button data-pay="twint" ${!state.cart.length?'disabled':''}>TWINT</button></div>${state.receipts[0]?.receiptNumber?`<div class="last-receipt">Dernier ticket: <strong>${esc(state.receipts[0].receiptNumber)}</strong> · ${money(state.receipts[0].total)}</div>`:''}</div></aside></main></div>`;
}
function render(){
  if(!currentSession()){app.innerHTML=loginView();wire();return}
  if(!state.identity){app.innerHTML=`<div class="login-wrap"><div class="card"><h1>ReMaPro POS</h1><p>${state.busy?'Chargement…':'Connexion au compte…'}</p>${state.error?'<div class="notice error">'+esc(state.error)+'</div>':''}</div></div>`;wire();return}
  if(!state.restaurant){app.innerHTML=pickerView();wire();return}
  if(!state.cashSession){app.innerHTML=sessionView();wire();return}
  app.innerHTML=mainView();wire();
}
function wire(){
  document.querySelector('#login-form')?.addEventListener('submit',async e=>{e.preventDefault();state.busy=true;state.error='';render();const fd=new FormData(e.currentTarget);try{await signIn(fd.get('email'),fd.get('password'));await loadAccount()}catch(error){state.error=error.message||String(error);state.busy=false;render()}});
  document.querySelector('#restaurant-select')?.addEventListener('change',async e=>{const r=(state.identity?.restaurants||[]).find(x=>x.id===e.target.value);if(r){await kvSet('restaurantId',r.id);await bootstrapRestaurant(r)}});
  document.querySelector('#logout')?.addEventListener('click',()=>{signOut();state.identity=null;state.restaurant=null;render()});
  document.querySelector('#switch-restaurant')?.addEventListener('click',()=>{state.restaurant=null;state.cashSession=null;render()});
  document.querySelector('#open-session')?.addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);await openSession(Number(String(fd.get('opening')).replace(',','.'))||0)});
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
