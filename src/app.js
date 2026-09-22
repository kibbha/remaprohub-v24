import {cloudConfigured,signIn,signOut,currentSession,loadIdentity,posFunction,pushEvent} from './cloud.js';
import {kvGet,kvSet,queuePut,queueDelete,queueAll,uuid} from './db.js';

const APP_VERSION='0.1.0';
const state={identity:null,restaurant:null,bootstrap:null,category:'Tous',cart:[],busy:false,error:'',queueCount:0,online:navigator.onLine};
const app=document.querySelector('#app');
const money=v=>new Intl.NumberFormat('fr-CH',{style:'currency',currency:state.restaurant?.currency||'CHF'}).format(Number(v)||0);
const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const deviceKey='device';
const catalogKey=id=>'catalog:'+id;

async function ensureDevice(){
  let d=await kvGet(deviceKey);
  if(!d){d={id:uuid(),installId:uuid(),label:'Caisse principale',platform:'android',appVersion:APP_VERSION};await kvSet(deviceKey,d)}
  return d;
}
async function updateQueueCount(){state.queueCount=(await queueAll()).length}
async function flushQueue(){
  if(!state.online||!state.restaurant)return;
  const list=await queueAll();
  for(const event of list){
    try{await pushEvent(event);await queueDelete(event.client_event_id)}catch{break}
  }
  await updateQueueCount();render();
}
async function bootstrapRestaurant(restaurant){
  state.restaurant=restaurant;state.error='';render();
  const cached=await kvGet(catalogKey(restaurant.id));
  if(cached)state.bootstrap=cached;
  if(state.online){
    try{
      const data=await posFunction({action:'bootstrap',restaurantId:restaurant.id});
      state.bootstrap=data;await kvSet(catalogKey(restaurant.id),data);
      const device=await ensureDevice();
      await posFunction({action:'heartbeat',restaurantId:restaurant.id,device});
    }catch(error){state.error=error.message||String(error)}
  }
  await updateQueueCount();render();flushQueue().catch(()=>{});
}
async function init(){
  if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
  window.addEventListener('online',()=>{state.online=true;render();flushQueue().catch(()=>{})});
  window.addEventListener('offline',()=>{state.online=false;render()});
  await updateQueueCount();
  if(!currentSession()){render();return}
  await loadAccount();
}
async function loadAccount(){
  state.busy=true;state.error='';render();
  try{
    state.identity=await loadIdentity();
    const preferred=await kvGet('restaurantId');
    const restaurants=state.identity.restaurants||[];
    const target=restaurants.find(r=>r.id===preferred)||restaurants[0]||null;
    if(target){await kvSet('restaurantId',target.id);await bootstrapRestaurant(target)}
  }catch(error){state.error=error.message||String(error);if(/AUTH/.test(state.error))signOut()}
  finally{state.busy=false;render()}
}
function addItem(item){const line=state.cart.find(x=>x.id===item.id);if(line)line.qty+=1;else state.cart.push({id:item.id,name:item.name,price:Number(item.price)||0,tax_rate:Number(item.tax_rate)||0,qty:1});render()}
function changeQty(id,delta){const line=state.cart.find(x=>x.id===id);if(!line)return;line.qty+=delta;if(line.qty<=0)state.cart=state.cart.filter(x=>x.id!==id);render()}
const cartTotal=()=>state.cart.reduce((s,x)=>s+x.qty*x.price,0);
async function closeLocalOrder(method){
  if(!state.cart.length||!state.restaurant)return;
  const device=await ensureDevice();
  const now=new Date(),total=cartTotal(),clientEventId=uuid();
  const payload={
    client_event_id:clientEventId,
    organization_id:state.restaurant.organization_id,
    restaurant_id:state.restaurant.id,
    device_id:device.id,
    actor_user_id:state.identity?.user?.id||null,
    entity_type:'order',
    entity_id:uuid(),
    event_type:'pos.order.closed_local',
    payload:{version:1,paymentMethod:method,currency:state.restaurant.currency||'CHF',total,lines:state.cart.map(x=>({...x})),appVersion:APP_VERSION},
    occurred_at:now.toISOString()
  };
  await queuePut(payload);state.cart=[];await updateQueueCount();render();flushQueue().catch(()=>{});
  alert('Commande enregistrée localement. Le ledger de vente complet sera activé dans la prochaine étape POS.');
}
function loginView(){
  return `<div class="login-wrap"><form class="card" id="login-form">
    <h1>ReMaPro POS</h1><p>Caisse restaurant connectée à ReMaPro Hub.</p>
    ${!cloudConfigured()?'<div class="notice error">Configuration Supabase non injectée.</div>':''}
    ${state.error?'<div class="notice error">'+escapeHtml(state.error)+'</div>':''}
    <label class="field">E-mail<input name="email" type="email" autocomplete="username" required></label>
    <label class="field">Mot de passe<input name="password" type="password" autocomplete="current-password" required></label>
    <button class="primary" type="submit" ${state.busy?'disabled':''}>${state.busy?'Connexion…':'Se connecter'}</button>
    <p style="font-size:12px">v${APP_VERSION}</p>
  </form></div>`;
}
function restaurantPicker(){
  const rows=(state.identity?.restaurants||[]).map(r=>`<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');
  return `<div class="picker-wrap"><div class="card"><h1>Choisir le restaurant</h1>
  ${state.error?'<div class="notice error">'+escapeHtml(state.error)+'</div>':''}
  <label class="field">Établissement<select id="restaurant-select"><option value="">Sélectionner…</option>${rows}</select></label>
  <button class="secondary" id="logout">Déconnexion</button></div></div>`;
}
function mainView(){
  const catalog=state.bootstrap?.catalog||[];
  const cats=['Tous',...new Set(catalog.map(x=>x.category||'Autres'))];
  if(!cats.includes(state.category))state.category='Tous';
  const visible=state.category==='Tous'?catalog:catalog.filter(x=>(x.category||'Autres')===state.category);
  return `<div class="shell">
  <header class="topbar"><div class="brand">ReMaPro POS <small>v${APP_VERSION}</small></div>
    <div>${escapeHtml(state.restaurant.name)}</div><div class="spacer"></div>
    <div class="queue">${state.queueCount} en attente</div>
    <div class="status"><span class="dot ${state.online?'online':''}"></span>${state.online?'En ligne':'Hors ligne'}</div>
    <button class="secondary" id="switch-restaurant">Changer</button>
  </header>
  ${state.error?'<div class="notice error" style="margin:8px 18px">'+escapeHtml(state.error)+'</div>':''}
  <main class="workspace">
    <nav class="categories">${cats.map(c=>`<button class="category ${c===state.category?'active':''}" data-category="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('')}</nav>
    <section class="products">${visible.length?`<div class="product-grid">${visible.map(p=>`<button class="product" data-product="${p.id}"><strong>${escapeHtml(p.name)}</strong><span class="price">${money(p.price)}</span></button>`).join('')}</div>`:'<div class="empty"><h3>Catalogue POS vide</h3><p>Les articles seront publiés depuis ReMaPro Hub.</p></div>'}</section>
    <aside class="cart"><div class="cart-head"><h2>Commande</h2></div>
      <div class="cart-list">${state.cart.length?state.cart.map(x=>`<div class="line"><div><strong>${escapeHtml(x.name)}</strong><div>${money(x.price)} × ${x.qty}</div></div><div class="qty"><button data-minus="${x.id}">−</button><span>${x.qty}</span><button data-plus="${x.id}">+</button></div></div>`).join(''):'<div class="empty">Touchez un article pour commencer.</div>'}</div>
      <div class="cart-foot"><div class="total-row"><span>Total</span><span>${money(cartTotal())}</span></div>
        <div class="payments"><button data-pay="cash">Espèces</button><button data-pay="card">Carte</button><button data-pay="twint">TWINT</button></div>
      </div>
    </aside>
  </main></div>`;
}
function render(){
  if(!currentSession()){app.innerHTML=loginView();wire();return}
  if(!state.identity){app.innerHTML=`<div class="login-wrap"><div class="card"><h1>ReMaPro POS</h1><p>${state.busy?'Chargement…':'Connexion au compte…'}</p>${state.error?'<div class="notice error">'+escapeHtml(state.error)+'</div>':''}</div></div>`;wire();return}
  if(!state.restaurant){app.innerHTML=restaurantPicker();wire();return}
  app.innerHTML=mainView();wire();
}
function wire(){
  document.querySelector('#login-form')?.addEventListener('submit',async e=>{
    e.preventDefault();state.busy=true;state.error='';render();
    const fd=new FormData(e.currentTarget);
    try{await signIn(fd.get('email'),fd.get('password'));await loadAccount()}catch(error){state.error=error.message||String(error);state.busy=false;render()}
  });
  document.querySelector('#restaurant-select')?.addEventListener('change',async e=>{
    const r=(state.identity?.restaurants||[]).find(x=>x.id===e.target.value);if(r){await kvSet('restaurantId',r.id);await bootstrapRestaurant(r)}
  });
  document.querySelector('#logout')?.addEventListener('click',()=>{signOut();state.identity=null;state.restaurant=null;render()});
  document.querySelector('#switch-restaurant')?.addEventListener('click',()=>{state.restaurant=null;render()});
  document.querySelectorAll('[data-category]').forEach(b=>b.addEventListener('click',()=>{state.category=b.dataset.category;render()}));
  document.querySelectorAll('[data-product]').forEach(b=>b.addEventListener('click',()=>{const p=(state.bootstrap?.catalog||[]).find(x=>x.id===b.dataset.product);if(p)addItem(p)}));
  document.querySelectorAll('[data-minus]').forEach(b=>b.addEventListener('click',()=>changeQty(b.dataset.minus,-1)));
  document.querySelectorAll('[data-plus]').forEach(b=>b.addEventListener('click',()=>changeQty(b.dataset.plus,1)));
  document.querySelectorAll('[data-pay]').forEach(b=>b.addEventListener('click',()=>closeLocalOrder(b.dataset.pay)));
}
init();
