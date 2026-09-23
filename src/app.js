import {cloudConfigured,initializePosSessionStorage,signIn,signOut,currentSession,currentOperatorSession,saveOperatorSession,clearOperatorSession,loadIdentity,posFunction,academyFunction} from './cloud.js';
import {kvGet,kvSet,kvDelete,queuePut,queueDelete,queueAll,uuid} from './db.js';
import {discoverNativePrinters,printEscPosText,buildReceiptText,buildProductionText,buildTestText,nativePrinterReady} from './printer.js';
import {publishedLayout,productById,buttonById,pageButtons,categoriesForPage,configurationForButton,modifierPriceDelta,modifierSummary,productionModifierSummary,modifierRoutesToStation} from './layout.js';
import {renderAcademyCenter,academyContextTopics,academyTopic,loadLocalAcademyProgress,saveLocalAcademyProgress,mergeAcademyProgress,startAcademyTour,ensureAcademyStyles} from './academy.js';
import {ACADEMY_CONTENT_VERSION} from './academy-content.js';
import {LANGS,language,setLanguage,t,languageOptions,translateDom} from './i18n.js';
import {uiAlert,uiConfirm,uiPrompt,uiFields} from './ui.js';
import {recordDiagnostic} from './telemetry.js';
import {queuedPayload,queueRetryDelayMs,queueRetryDue} from './resilience.js';
import {directOrderCart,renderDirectOrders} from './direct-orders.js';

const APP_VERSION='0.27.0';
const state={
  identity:null,restaurant:null,bootstrap:null,category:'Tous',cart:[],
  busy:false,error:'',queueCount:0,online:navigator.onLine,cashSession:null,
  receipts:[],serviceType:'counter',tableLabel:'',covers:1,
  tables:[],openOrders:[],view:'sale',activeOrderId:null,activeTableId:null,
  productionQueue:[],productionStation:'all',productionSort:'oldest',kdsWarnMinutes:Math.max(1,Number(localStorage.getItem('remapro-kds-warn'))||12),kdsCriticalMinutes:Math.max(2,Number(localStorage.getItem('remapro-kds-critical'))||20),serviceReport:null,reportDate:'',
  terminals:[],terminalIntents:[],printers:[],discoveredPrinters:[],pendingAutoReceiptNumber:'',
  operators:[],operator:null,operatorRequired:false,foodCostReport:null,providerConnections:[],directOrders:[],
  pendingQueue:[],syncLastRun:'',paymentBusy:false,layoutPageId:'',layoutCategoryId:'all',academyLocale:(localStorage.getItem('remapro-academy-lang')||navigator.language?.slice(0,2)||'fr'),academy:{query:'',scope:'all',role:'',module:'',selectedTopic:'',selectedPath:'',troubleshoot:'',progress:[],loaded:false,loading:false,managerVisibility:false,managerRows:[]},trainingMode:false,training:{opened:false,table:false,cart:[],modified:false,sent:false,paid:false,closed:false,payment:''}
};
const app=document.querySelector('#app');
let terminalPollTimer=null,directOrderPollTimer=null,queueFlushPromise=null,terminalPollInFlight=false;
const money=v=>new Intl.NumberFormat(({fr:'fr-CH',en:'en-CH',de:'de-CH',it:'it-CH'})[language()]||'fr-CH',{style:'currency',currency:state.restaurant?.currency||'CHF'}).format(Number(v)||0);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateKey=()=>new Intl.DateTimeFormat('en-CA',{timeZone:state.restaurant?.timezone||'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const sessionKey=id=>'cashSession:'+id;
const catalogKey=id=>'catalog:'+id;
const receiptsKey=id=>'receipts:'+id;
const tablesKey=id=>'tables:'+id;
const openOrdersKey=id=>'openOrders:'+id;
const productionKey=id=>'production:'+id;
const terminalsKey=id=>'terminals:'+id;
const printersKey=id=>'printers:'+id;
const operatorsKey=id=>'operators:'+id;
const providersKey=id=>'providers:'+id;

async function ensureDevice(){
  let d=await kvGet('device');
  if(!d){d={id:uuid(),installId:uuid(),label:'Caisse principale',platform:'android',appVersion:APP_VERSION};await kvSet('device',d)}
  d.appVersion=APP_VERSION;await kvSet('device',d);return d;
}
async function updateQueueCount(){
  const rows=await queueAll();
  state.pendingQueue=rows;
  state.queueCount=state.restaurant?rows.filter(x=>x.restaurantId===state.restaurant.id).length:rows.length;
}
function queuedOperatorContext(){
  if(!state.operatorRequired||!state.operator)return{};
  return{operatorId:String(state.operator.id||''),operatorName:String(state.operator.display_name||'Opérateur')};
}
function queuedItem(action,restaurantId,payload,{clientEventId='',queuedAt=''}={}){
  return{
    client_event_id:clientEventId||uuid(),
    queued_at:queuedAt||new Date().toISOString(),
    action,restaurantId,payload,
    ...queuedOperatorContext()
  };
}
function assertQueuedOperator(item){
  if(!item?.operatorId)return;
  const current=currentOperatorSession();
  if(current?.operator?.id===item.operatorId&&current?.token)return;
  const err=new Error('OFFLINE_OPERATOR_REAUTH');
  err.operatorName=item.operatorName||'opérateur';
  throw err;
}

function isManager(){
  const restaurant=state.restaurant;if(!restaurant)return false;
  return (state.identity?.memberships||[]).some(m=>
    m.organization_id===restaurant.organization_id &&
    ((!m.restaurant_id&&['network_admin','network_manager'].includes(m.role)) ||
     (m.restaurant_id===restaurant.id&&['restaurant_admin','director','manager'].includes(m.role)))
  );
}
function posOrgAdmin(){
  const org=academyOrgId?.()||state.restaurant?.organization_id||'';
  return !!org&&(state.identity?.memberships||[]).some(m=>m.organization_id===org&&!m.restaurant_id&&['network_admin','network_manager'].includes(m.role));
}
async function saveFloorCache(){
  if(!state.restaurant)return;
  await kvSet(tablesKey(state.restaurant.id),state.tables);
  await kvSet(openOrdersKey(state.restaurant.id),state.openOrders);
}

async function refreshTerminals(){
  if(!state.restaurant)return;
  if(!state.online){
    state.terminals=await kvGet(terminalsKey(state.restaurant.id))||state.terminals||[];
    state.providerConnections=await kvGet(providersKey(state.restaurant.id))||state.providerConnections||[];
    state.terminalIntents=[];
    return;
  }
  try{
    const [terminals,intents,providers]=await Promise.all([
      posFunction({action:'list_terminals',restaurantId:state.restaurant.id}),
      posFunction({action:'list_terminal_intents',restaurantId:state.restaurant.id,limit:30}),
      posFunction({action:'list_provider_connections',restaurantId:state.restaurant.id}).catch(()=>({rows:[]}))
    ]);
    state.terminals=terminals.rows||[];
    state.terminalIntents=intents.rows||[];
    state.providerConnections=providers.rows||[];
    await Promise.all([
      kvSet(terminalsKey(state.restaurant.id),state.terminals),
      kvSet(providersKey(state.restaurant.id),state.providerConnections)
    ]);
  }catch(error){state.error=error.message||String(error)}
}
function closeTerminalEditor(){
  document.querySelector('#terminal-editor-modal')?.remove();
  document.body.classList.remove('modal-open');
}
function openTerminalEditor(existing=null){
  if(!isManager()){uiAlert(t('managerRequired'));return}
  closeTerminalEditor();
  const modal=document.createElement('div');
  modal.id='terminal-editor-modal';modal.className='modal-overlay';
  const t=existing||{};
  const checked=(v,d=false)=>(v===undefined?d:!!v)?'checked':'';
  modal.innerHTML='<form class="terminal-dialog" id="terminal-editor-form">'
    +'<div class="split-dialog-head"><div><h2>'+(existing?'Modifier le terminal':'Ajouter un profil terminal')+'</h2><p>Aucun secret/API key n’est stocké dans ce formulaire.</p></div><button type="button" class="split-close" id="terminal-editor-close">×</button></div>'
    +'<div class="terminal-form-grid">'
    +'<label>Nom<input name="label" required maxlength="120" value="'+esc(t.label||'Terminal principal')+'"></label>'
    +'<label>Prestataire<select name="provider"><option value="worldline" '+(t.provider==='worldline'?'selected':'')+'>Worldline</option><option value="twint" '+(t.provider==='twint'?'selected':'')+'>TWINT</option><option value="generic" '+(!t.provider||t.provider==='generic'?'selected':'')+'>Générique</option></select></label>'
    +'<label>Mode<select name="integrationMode"><option value="cloud" '+(!t.integration_mode||t.integration_mode==='cloud'?'selected':'')+'>Cloud/API</option><option value="external_app" '+(t.integration_mode==='external_app'?'selected':'')+'>Application externe</option><option value="local_network" '+(t.integration_mode==='local_network'?'selected':'')+'>Réseau local</option></select></label>'
    +'<label>ID terminal prestataire<input name="externalTerminalId" maxlength="180" value="'+esc(t.external_terminal_id||'')+'" placeholder="Optionnel"></label>'
    +'<label>Devise<input name="currency" maxlength="3" value="'+esc(t.currency||state.restaurant?.currency||'CHF')+'"></label>'
    +'<label class="terminal-check"><input type="checkbox" name="supportsCard" '+checked(t.supports_card,true)+'> Carte</label>'
    +'<label class="terminal-check"><input type="checkbox" name="supportsTwint" '+checked(t.supports_twint,false)+'> TWINT</label>'
    +'<label class="terminal-check"><input type="checkbox" name="supportsTips" '+checked(t.supports_tips,true)+'> Pourboires</label>'
    +'<label class="terminal-check"><input type="checkbox" name="supportsRefunds" '+checked(t.supports_refunds,true)+'> Remboursements</label>'
    +'<label class="terminal-check"><input type="checkbox" name="active" '+checked(t.active,false)+'> Profil actif</label>'
    +'</div>'
    +'<div class="terminal-security-note"><strong>Connexion réelle non configurée.</strong> Les identifiants prestataire seront ajoutés plus tard dans les secrets serveur, jamais dans l’application.</div>'
    +'<div class="split-footer"><button type="button" class="secondary" id="terminal-editor-cancel">Annuler</button><button type="submit" class="primary">Enregistrer le profil</button></div>'
    +'</form>';
  document.body.appendChild(modal);translateDom(modal);document.body.classList.add('modal-open');
  modal.querySelector('#terminal-editor-close')?.addEventListener('click',closeTerminalEditor);
  modal.querySelector('#terminal-editor-cancel')?.addEventListener('click',closeTerminalEditor);
  modal.querySelector('#terminal-editor-form')?.addEventListener('submit',async e=>{
    e.preventDefault();
    const fd=new FormData(e.currentTarget);
    const device=await ensureDevice();
    const terminal={
      id:t.id||'',deviceId:device.id,label:String(fd.get('label')||'').trim(),
      provider:String(fd.get('provider')||'generic'),integrationMode:String(fd.get('integrationMode')||'cloud'),
      externalTerminalId:String(fd.get('externalTerminalId')||'').trim(),
      currency:String(fd.get('currency')||'CHF').trim().toUpperCase(),
      supportsCard:fd.get('supportsCard')==='on',supportsTwint:fd.get('supportsTwint')==='on',
      supportsTips:fd.get('supportsTips')==='on',supportsRefunds:fd.get('supportsRefunds')==='on',
      active:fd.get('active')==='on',publicConfig:{}
    };
    try{
      await posFunction({action:'upsert_terminal',restaurantId:state.restaurant.id,terminal});
      await refreshTerminals();closeTerminalEditor();state.error='Profil terminal enregistré. Connexion prestataire toujours à configurer.';render();
    }catch(error){state.error=error.message||String(error);render();closeTerminalEditor()}
  });
}
function terminalStatusLabel(status){
  return ({not_configured:'Non configuré',configured:'Configuré',online:'En ligne',offline:'Hors ligne',error:'Erreur'})[status]||status||'Inconnu';
}
function terminalProviderLabel(provider){
  return ({worldline:'Worldline',twint:'TWINT',generic:'Générique'})[provider]||provider||'—';
}
function providerStatusLabel(status){
  return ({
    not_configured:'Non configuré',
    waiting_contract:'Contrat en attente',
    credentials_pending:'Identifiants attendus',
    ready_for_adapter:'Prêt pour adaptateur',
    disabled:'Désactivé'
  })[status]||status||'Inconnu';
}
function providerModeLabel(mode){
  return ({
    terminal_api_cloud:'Terminal API Cloud',
    tim:'TIM',
    direct:'Direct',
    terminal_psp:'Terminal / PSP'
  })[mode]||mode||'—';
}

function terminalsView(){
  const intents=state.terminalIntents||[];
  return `<div class="shell">${topbar()}${state.error?'<div class="notice banner">'+esc(state.error)+'</div>':''}
    <main class="terminals-page">
      <div class="floor-head"><div><h2>Terminaux de paiement</h2><p>Profils et état de connexion. Les clés API restent exclusivement côté serveur.</p></div><div class="terminal-head-actions"><button class="secondary" id="refresh-terminals" ${!state.online?'disabled':''}>Actualiser</button>${isManager()?'<button class="primary compact" id="add-terminal">+ Terminal</button>':''}</div></div>
      <div class="terminal-warning"><strong>Mode préparation.</strong> Aucun connecteur Worldline/TWINT réel n’est encore activé. Une vente carte/TWINT peut seulement être enregistrée manuellement après confirmation sur un terminal externe indépendant.</div>
      <section class="provider-readiness"><h3>Préparation prestataires</h3>
        ${state.providerConnections.length?state.providerConnections.map(c=>`<article class="provider-readiness-card"><div><strong>${esc(terminalProviderLabel(c.provider))}</strong><small>${esc(providerModeLabel(c.integration_mode))} · ${esc(c.environment||'test')}</small></div><span class="provider-readiness-status provider-${esc(c.status)}">${esc(providerStatusLabel(c.status))}</span>${c.merchant_reference?'<small class="provider-merchant">Réf. marchand '+esc(c.merchant_reference)+'</small>':''}</article>`).join(''):'<div class="muted">Aucun prestataire préparé dans ReMaPro Hub.</div>'}
      </section>
      <section class="terminal-grid">${state.terminals.length?state.terminals.map(t=>`<article class="terminal-card">
        <div class="terminal-card-head"><div><strong>${esc(t.label)}</strong><small>${esc(terminalProviderLabel(t.provider))} · ${esc(t.integration_mode)}</small></div><span class="terminal-state state-${esc(t.connection_status)}">${esc(terminalStatusLabel(t.connection_status))}</span></div>
        <div class="terminal-capabilities"><span>${t.supports_card?'Carte':''}</span><span>${t.supports_twint?'TWINT':''}</span><span>${t.supports_tips?'Tips':''}</span><span>${t.supports_refunds?'Remb.':''}</span></div>
        <div class="terminal-meta"><div>ID prestataire <strong>${esc(t.external_terminal_id||'—')}</strong></div><div>Devise <strong>${esc(t.currency||'CHF')}</strong></div><div>Profil <strong>${t.active?'Actif':'Inactif'}</strong></div></div>
        ${isManager()?'<button class="secondary wide" data-edit-terminal="'+t.id+'">Modifier</button>':''}
      </article>`).join(''):'<div class="empty"><h3>Aucun profil terminal</h3><p>Ajoutez Worldline, TWINT ou un profil générique. La connexion réelle sera activée séparément côté serveur.</p></div>'}</section>
      <section class="terminal-intents"><h3>Derniers intents terminal</h3>${intents.length?intents.map(i=>`<div class="terminal-intent-row"><div><strong>${esc(i.kind)} · ${esc(i.method)}</strong><small>${esc(i.provider)} · ${new Date(i.created_at).toLocaleString('fr-CH')}</small></div><span>${money(i.amount)}${Number(i.tip_amount)?' + '+money(i.tip_amount)+' tip':''}</span><div class="intent-control"><strong class="intent-status intent-${esc(i.status)}">${esc(terminalIntentText(i.status))}</strong>${['created','pending','authorized'].includes(i.status)?'<button class="secondary tiny" data-cancel-intent="'+i.id+'">Annuler</button>':''}</div></div>`).join(''):'<div class="muted">Aucun intent terminal récent.</div>'}</section>
    </main></div>`;
}

function connectedTerminal(method){
  return state.terminals.find(t=>t.active&&['configured','online'].includes(t.connection_status)&&(method==='card'?t.supports_card:t.supports_twint))||null;
}
async function prepareOrderForTerminalIntent(){
  if(!state.online){uiAlert('Une connexion est nécessaire pour le terminal.');return null}
  if(!state.cart.length||!state.cashSession||state.cashSession.status!=='open')return null;
  if(standardPaymentBlocked()){uiAlert(progressivePaymentActive()?'Un paiement progressif est déjà en cours.':'Envoyez d’abord les nouveaux articles en production.');return null}
  let order=currentServerOrder();
  if(!order||order.status==='open'){
    const device=await ensureDevice(),orderId=state.activeOrderId||uuid(),eventId=uuid();
    const payload=buildOpenOrder(orderId,eventId);payload.deviceId=device.id;
    try{
      await posFunction({action:'save_open_order',restaurantId:state.restaurant.id,order:payload});
      state.activeOrderId=orderId;
      await refreshFloorData();
      order=state.openOrders.find(x=>x.id===orderId)||null;
    }catch(error){state.error=error.message||String(error);render();return null}
  }
  return order;
}
function normalizeIntentResult(value){
  return value?.intent?.intent||value?.intent||value||null;
}
function stopTerminalPolling(){
  if(terminalPollTimer){clearInterval(terminalPollTimer);terminalPollTimer=null}
}
function closeTerminalIntentModal(){
  stopTerminalPolling();
  document.querySelector('#terminal-intent-modal')?.remove();
  document.body.classList.remove('modal-open');
}
function terminalIntentText(status){
  return ({created:'Créé',pending:'En attente du terminal',authorized:'Autorisé',captured:'Payé',failed:'Échec',cancelled:'Annulé',expired:'Expiré'})[status]||status||'Inconnu';
}
async function finalizeTerminalUi(intent){
  if(intent.status==='captured'){
    closeTerminalIntentModal();
    await Promise.all([refreshFloorData(),refreshReceipts(),refreshTerminals()]);
    state.cart=[];state.activeOrderId=null;state.activeTableId=null;state.tableLabel='';state.view='tickets';
    state.error='Paiement terminal confirmé.';
    render();
    return true;
  }
  if(['failed','cancelled','expired'].includes(intent.status)){
    closeTerminalIntentModal();
    await refreshTerminals();
    state.error='Paiement terminal : '+terminalIntentText(intent.status)+(intent.error_message?' — '+intent.error_message:'');
    render();
    return true;
  }
  return false;
}
async function pollTerminalIntent(intentId,orderId){
  if(terminalPollInFlight)return;
  terminalPollInFlight=true;
  try{
    const r=await posFunction({action:'list_terminal_intents',restaurantId:state.restaurant.id,orderId,limit:20});
    const intent=(r.rows||[]).find(x=>x.id===intentId);
    if(!intent)return;
    const modal=document.querySelector('#terminal-intent-modal');
    const status=modal?.querySelector('#terminal-live-status');
    if(status)status.textContent=terminalIntentText(intent.status);
    const ref=modal?.querySelector('#terminal-live-reference');
    if(ref)ref.textContent=intent.provider_reference||'—';
    await finalizeTerminalUi(intent);
  }catch(error){
    const modal=document.querySelector('#terminal-intent-modal');
    const msg=modal?.querySelector('#terminal-live-error');
    if(msg)msg.textContent=error.message||String(error);
  }finally{terminalPollInFlight=false}
}
function showTerminalIntentModal(order,intent,terminal){
  closeTerminalIntentModal();
  const modal=document.createElement('div');
  modal.id='terminal-intent-modal';modal.className='modal-overlay';
  modal.innerHTML='<div class="terminal-wait-dialog"><div class="terminal-wait-icon">⌁</div><h2>En attente du terminal</h2><p>'+esc(terminalProviderLabel(terminal.provider))+' · '+esc(terminal.label)+'</p>'
    +'<div class="terminal-wait-amount">'+money(Number(intent.amount||0)+Number(intent.tip_amount||0))+'</div>'
    +'<div class="terminal-live-grid"><span>Statut</span><strong id="terminal-live-status">'+esc(terminalIntentText(intent.status))+'</strong><span>Référence</span><strong id="terminal-live-reference">'+esc(intent.provider_reference||'—')+'</strong></div>'
    +'<div class="terminal-live-error" id="terminal-live-error"></div>'
    +'<div class="terminal-security-note">La vente ne sera comptabilisée que lorsque le backend recevra un statut <strong>captured</strong> signé/validé par le prestataire.</div>'
    +'<div class="terminal-wait-actions"><button class="secondary" id="terminal-wait-cancel">Annuler l’intent</button></div></div>';
  document.body.appendChild(modal);translateDom(modal);document.body.classList.add('modal-open');
  modal.querySelector('#terminal-wait-cancel')?.addEventListener('click',async()=>{
    if(!(await uiConfirm({title:t('cancelPaymentIntent'),message:t('cancelAudit'),danger:true})))return;
    try{
      await posFunction({action:'cancel_terminal_intent',restaurantId:state.restaurant.id,intentId:intent.id});
      closeTerminalIntentModal();await refreshTerminals();state.error='Intent terminal annulé.';render();
    }catch(error){state.error=error.message||String(error);render();closeTerminalIntentModal()}
  });
  terminalPollTimer=setInterval(()=>pollTerminalIntent(intent.id,order.id),2000);
  pollTerminalIntent(intent.id,order.id);
}
async function startTerminalPayment(method,terminal){
  const order=await prepareOrderForTerminalIntent();if(!order)return;
  const tip=await askTip('0.00');if(tip===null)return;
  const device=await ensureDevice();
  try{
    const r=await posFunction({
      action:'create_terminal_intent',restaurantId:state.restaurant.id,
      orderId:order.id,clientEventId:uuid(),terminalId:terminal.id,deviceId:device.id,
      cashSessionId:state.cashSession.id,method,amount:Number(order.total)||cartTotal(),tipAmount:tip,
      metadata:{source:'remapro-pos',appVersion:APP_VERSION}
    });
    const intent=normalizeIntentResult(r);
    if(!intent?.id)throw new Error('Intent terminal invalide');
    await refreshTerminals();
    showTerminalIntentModal(order,intent,terminal);
  }catch(error){state.error=error.message||String(error);render()}
}
async function cancelTerminalIntentFromList(intentId){
  if(!(await uiConfirm({title:t('cancelTerminalIntent'),danger:true})))return;
  try{
    await posFunction({action:'cancel_terminal_intent',restaurantId:state.restaurant.id,intentId});
    await refreshTerminals();state.error='Intent terminal annulé.';render();
  }catch(error){state.error=error.message||String(error);render()}
}
async function guardedPayment(task){
  if(state.paymentBusy){uiAlert('Paiement déjà en cours.');return null}
  state.paymentBusy=true;
  try{return await task()}finally{state.paymentBusy=false}
}
async function payByMethod(method){
  if(method==='cash')return checkout(method);
  if(!['card','twint'].includes(method))return checkout(method);
  const matching=connectedTerminal(method);
  if(matching&&state.bootstrap?.capabilities?.paymentProviders===true){
    return startTerminalPayment(method,matching);
  }
  const label=method==='twint'?'TWINT':'carte';
  const ok=await uiConfirm({title:t('externalPaymentTitle'),message:t('externalPaymentHint')+' '+label,danger:true});
  if(!ok)return;
  return checkout(method);
}


function operatorSessionUsable(session,restaurantId){
  if(!session?.token||session.restaurantId!==restaurantId||!session.operator)return false;
  const exp=Date.parse(session.expiresAt||'');return !Number.isNaN(exp)&&exp>Date.now()+15000;
}
async function refreshOperators(){
  if(!state.restaurant)return;
  if(!state.online){
    state.operators=await kvGet(operatorsKey(state.restaurant.id))||state.operators||[];
    state.operatorRequired=state.operators.some(x=>x.active!==false);
    const cached=currentOperatorSession();
    state.operator=state.operatorRequired&&operatorSessionUsable(cached,state.restaurant.id)?cached.operator:null;
    return;
  }
  try{
    const r=await posFunction({action:'list_operators',restaurantId:state.restaurant.id});
    state.operators=r.rows||[];state.operatorRequired=r.required===true;
    await kvSet(operatorsKey(state.restaurant.id),state.operators);
    if(!state.operatorRequired){
      state.operator=null;clearOperatorSession();return;
    }
    const cached=currentOperatorSession();
    if(!operatorSessionUsable(cached,state.restaurant.id)){state.operator=null;clearOperatorSession();return}
    const current=await posFunction({action:'operator_current',restaurantId:state.restaurant.id});
    if(current.authorization?.authorized===true){
      state.operator=current.authorization.operator;
      saveOperatorSession({...cached,operator:state.operator,expiresAt:state.operator.expiresAt||cached.expiresAt});
    }else{
      state.operator=null;clearOperatorSession();
    }
  }catch(error){state.error=error.message||String(error)}
}
async function refreshDirectOrders(){
  if(!state.restaurant||!state.online||state.trainingMode)return state.directOrders;
  try{
    const r=await posFunction({action:'list_direct_orders',restaurantId:state.restaurant.id,statuses:['pending','accepted']});
    state.directOrders=Array.isArray(r.rows)?r.rows:[];return state.directOrders;
  }catch(error){recordDiagnostic('direct_orders.refresh_error',{message:error.message||String(error)});return state.directOrders}
}
function startDirectOrderPolling(){
  if(directOrderPollTimer)clearInterval(directOrderPollTimer);
  directOrderPollTimer=setInterval(async()=>{
    if(!state.online||!state.restaurant||!state.cashSession||(state.operatorRequired&&!state.operator)||state.trainingMode)return;
    const before=state.directOrders.filter(x=>x.status==='pending').length;await refreshDirectOrders();const after=state.directOrders.filter(x=>x.status==='pending').length;
    if(before!==after||state.view==='directOrders')render();
  },20000);
}
async function refreshOperationalData(){
  if(state.operatorRequired&&!state.operator)return;
  await Promise.all([refreshFloorData(),refreshProductionQueue(),refreshReceipts(),refreshTerminals(),refreshPrinters(),refreshDirectOrders()]);
}
async function operatorLogin(operatorId,pin){
  const op=state.operators.find(x=>x.id===operatorId);
  if(!op)return;
  if(!state.online){state.error='La session opérateur a expiré ou manque. Reconnectez Internet pour valider le PIN.';render();return}
  const device=await ensureDevice();
  try{
    const r=await posFunction({action:'operator_login',restaurantId:state.restaurant.id,operatorId:op.id,pin:String(pin||''),deviceId:device.id});
    const session=r.session;
    saveOperatorSession({token:session.token,expiresAt:session.expiresAt,restaurantId:state.restaurant.id,operator:session.operator});
    state.operator=session.operator;state.error='';
    await refreshOperationalData();startDirectOrderPolling();render();
  }catch(error){state.error=error.message||String(error);render()}
}
async function switchOperator(){
  try{if(state.online&&currentOperatorSession()?.token)await posFunction({action:'operator_logout',restaurantId:state.restaurant.id})}catch{}
  clearOperatorSession();state.operator=null;state.view='sale';render();
}
function canManageSettings(){
  return isManager()&&(!state.operatorRequired||state.operator?.role==='manager'||state.operator?.permissions?.settings===true);
}
function operatorLoginView(){
  return `<div class="login-wrap operator-login-wrap"><div class="card operator-login-card"><h1>Qui utilise la caisse ?</h1><p>Sélectionnez votre profil et saisissez votre PIN.</p>${state.error?'<div class="notice error">'+esc(state.error)+'</div>':''}
    ${!state.online?'<div class="terminal-warning"><strong>Hors ligne.</strong> Un PIN ne peut être revalidé sans serveur. Une session opérateur encore valide reste utilisable automatiquement.</div>':''}
    <form id="operator-login-form"><label>Profil<select name="operatorId" required>${state.operators.filter(x=>x.active!==false).map(o=>'<option value="'+o.id+'">'+esc(o.display_name)+' · '+esc(o.role)+'</option>').join('')}</select></label><label>PIN<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4,8}" minlength="4" maxlength="8" autocomplete="off" required></label><button class="primary" type="submit" ${!state.online?'disabled':''}>Ouvrir ma session</button></form>
    <button class="secondary wide" id="open-academy">? Académie / Aide</button><button class="secondary wide" id="operator-account-logout">Changer de compte</button></div></div>`;
}
function closeOperatorEditor(){document.querySelector('#operator-editor-modal')?.remove();document.body.classList.remove('modal-open')}
function openOperatorEditor(existing=null){
  if(!canManageSettings()){uiAlert(t('managerRequired'));return}
  closeOperatorEditor();const o=existing||{};
  const modal=document.createElement('div');modal.id='operator-editor-modal';modal.className='modal-overlay';
  modal.innerHTML='<form class="terminal-dialog" id="operator-editor-form"><div class="split-dialog-head"><div><h2>'+(existing?'Modifier le profil':'Ajouter un opérateur')+'</h2><p>Le PIN est hashé côté serveur et n’est jamais relu.</p></div><button type="button" class="split-close" id="operator-editor-close">×</button></div>'
    +'<div class="terminal-form-grid"><label>Nom affiché<input name="displayName" required maxlength="120" value="'+esc(o.display_name||'')+'"></label>'
    +'<label>Rôle<select name="role"><option value="manager" '+(o.role==='manager'?'selected':'')+'>Manager</option><option value="cashier" '+(o.role==='cashier'?'selected':'')+'>Caissier</option><option value="server" '+(!o.role||o.role==='server'?'selected':'')+'>Serveur</option><option value="bar" '+(o.role==='bar'?'selected':'')+'>Bar</option><option value="kitchen" '+(o.role==='kitchen'?'selected':'')+'>Cuisine</option></select></label>'
    +'<label>PIN '+(existing?'(laisser vide pour conserver)':'')+'<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4,8}" '+(existing?'':'required')+' maxlength="8"></label>'
    +'<label class="terminal-check"><input type="checkbox" name="active" '+(o.active!==false?'checked':'')+'> Profil actif</label></div>'
    +'<div class="split-footer"><button type="button" class="secondary" id="operator-editor-cancel">Annuler</button><button type="submit" class="primary">Enregistrer</button></div></form>';
  document.body.appendChild(modal);translateDom(modal);document.body.classList.add('modal-open');
  modal.querySelector('#operator-editor-close')?.addEventListener('click',closeOperatorEditor);
  modal.querySelector('#operator-editor-cancel')?.addEventListener('click',closeOperatorEditor);
  modal.querySelector('#operator-editor-form')?.addEventListener('submit',async e=>{
    e.preventDefault();const fd=new FormData(e.currentTarget);
    try{
      await posFunction({action:'upsert_operator',restaurantId:state.restaurant.id,operator:{
        id:o.id||'',displayName:String(fd.get('displayName')||'').trim(),role:String(fd.get('role')||'server'),
        pin:String(fd.get('pin')||''),active:fd.get('active')==='on',permissions:{}
      }});
      await refreshOperators();closeOperatorEditor();state.error='Profil opérateur enregistré.';render();
    }catch(error){state.error=error.message||String(error);render();closeOperatorEditor()}
  });
}
function teamView(){
  return `<div class="shell">${topbar()}${state.error?'<div class="notice banner">'+esc(state.error)+'</div>':''}<main class="team-page"><div class="floor-head"><div><h2>Équipe POS</h2><p>PIN, rôles et permissions de caisse.</p></div>${canManageSettings()?'<button class="primary compact" id="add-operator">+ Opérateur</button>':''}</div><section class="operator-grid">${state.operators.length?state.operators.map(o=>`<article class="operator-card"><div><strong>${esc(o.display_name)}</strong><small>${esc(o.role)} · ${o.active?'Actif':'Inactif'}</small></div><div class="operator-perms">${Object.entries(o.permissions||{}).filter(([,v])=>v===true).map(([k])=>'<span>'+esc(k)+'</span>').join('')}</div>${canManageSettings()?'<button class="secondary" data-edit-operator="'+o.id+'">Modifier</button>':''}</article>`).join(''):'<div class="empty"><h3>Aucun opérateur</h3><p>Créez le premier profil pour activer les PIN sur cette caisse.</p></div>'}</section></main></div>`;
}

async function refreshPrinters(){
  if(!state.restaurant)return;
  if(!state.online){
    state.printers=await kvGet(printersKey(state.restaurant.id))||state.printers||[];
    return;
  }
  try{
    const r=await posFunction({action:'list_printers',restaurantId:state.restaurant.id});
    state.printers=r.rows||[];
    await kvSet(printersKey(state.restaurant.id),state.printers);
  }catch(error){state.error=error.message||String(error)}
}
function printerRoleLabel(role){return({receipt:'Ticket client',kitchen:'Cuisine',bar:'Bar'})[role]||role||'—'}
function printerTypeLabel(type){return({bluetooth:'Bluetooth',usb:'USB',system:'Impression système',network:'Réseau/TCP'})[type]||type||'—'}
function activePrinter(role){return state.printers.find(p=>p.active&&p.role===role)||null}
async function markPrinter(printer,status){
  if(!state.online||!printer?.id)return;
  try{await posFunction({action:'set_printer_status',restaurantId:state.restaurant.id,printerId:printer.id,status})}catch{}
}
async function testPrinterProfile(printer){
  if(!printer)return;
  if(printer.connection_type==='system'){window.print();return}
  if(printer.connection_type==='network'){
    uiAlert('Le profil réseau est conservé, mais le transport TCP natif sera activé lors de la future migration Capacitor 8. Utilisez Bluetooth/USB ou impression système pour cette version.');
    return;
  }
  try{
    await printEscPosText(printer,buildTestText(printer));
    await markPrinter(printer,'online');
    state.error='Test imprimante réussi : '+printer.label+'.';
  }catch(error){
    await markPrinter(printer,'error');
    state.error='Échec imprimante '+printer.label+' : '+(error.message||String(error));
  }
  await refreshPrinters();render();
}
async function scanPrinters(){
  if(!nativePrinterReady()){
    state.error='Découverte native disponible uniquement dans l’application Android installée.';
    render();return;
  }
  try{
    state.discoveredPrinters=await discoverNativePrinters();
    state.error=state.discoveredPrinters.length
      ?state.discoveredPrinters.length+' imprimante(s) détectée(s).'
      :'Aucune imprimante Bluetooth/USB détectée.';
  }catch(error){state.error=error.message||String(error)}
  render();
}
function closePrinterEditor(){
  document.querySelector('#printer-editor-modal')?.remove();
  document.body.classList.remove('modal-open');
}
function openPrinterEditor(existing=null,discovered=null){
  if(!isManager()){uiAlert(t('managerRequired'));return}
  closePrinterEditor();
  const p=existing||{};
  const deviceAddress=discovered?.address||p.address||'';
  const connectionType=discovered?.connectionType||p.connection_type||'system';
  const modal=document.createElement('div');
  modal.id='printer-editor-modal';modal.className='modal-overlay';
  modal.innerHTML='<form class="printer-dialog" id="printer-editor-form">'
    +'<div class="split-dialog-head"><div><h2>'+(existing?'Modifier l’imprimante':'Ajouter une imprimante')+'</h2><p>Profil synchronisé Hub ↔ POS.</p></div><button type="button" class="split-close" id="printer-editor-close">×</button></div>'
    +'<div class="terminal-form-grid">'
    +'<label>Nom<input name="label" required maxlength="120" value="'+esc(p.label||discovered?.name||'Imprimante principale')+'"></label>'
    +'<label>Rôle<select name="role"><option value="receipt" '+((p.role||'receipt')==='receipt'?'selected':'')+'>Ticket client</option><option value="kitchen" '+(p.role==='kitchen'?'selected':'')+'>Cuisine</option><option value="bar" '+(p.role==='bar'?'selected':'')+'>Bar</option></select></label>'
    +'<label>Connexion<select name="connectionType"><option value="bluetooth" '+(connectionType==='bluetooth'?'selected':'')+'>Bluetooth</option><option value="usb" '+(connectionType==='usb'?'selected':'')+'>USB</option><option value="system" '+(connectionType==='system'?'selected':'')+'>Système Android</option><option value="network" '+(connectionType==='network'?'selected':'')+'>Réseau/TCP (préparé)</option></select></label>'
    +'<label>Adresse / ID<input name="address" maxlength="240" value="'+esc(deviceAddress)+'" placeholder="MAC Bluetooth / ID USB"></label>'
    +'<label>Largeur caractères<input name="charsPerLine" type="number" min="24" max="80" value="'+Number(p.chars_per_line||42)+'"></label>'
    +'<label>Codepage<input name="codepage" maxlength="40" value="'+esc(p.codepage||'ascii')+'"></label>'
    +'<label class="terminal-check"><input type="checkbox" name="autoPrint" '+(p.auto_print?'checked':'')+'> Impression automatique</label>'
    +'<label class="terminal-check"><input type="checkbox" name="cutAfterPrint" '+(p.cut_after_print!==false?'checked':'')+'> Coupe papier</label>'
    +'<label class="terminal-check"><input type="checkbox" name="active" '+(p.active!==false?'checked':'')+'> Profil actif</label>'
    +'</div><div class="terminal-security-note">Bluetooth/USB utilise le pilote ESC/POS natif. Le mode système utilise le dialogue d’impression Android.</div>'
    +'<div class="split-footer"><button type="button" class="secondary" id="printer-editor-cancel">Annuler</button><button type="submit" class="primary">Enregistrer</button></div></form>';
  document.body.appendChild(modal);translateDom(modal);document.body.classList.add('modal-open');
  modal.querySelector('#printer-editor-close')?.addEventListener('click',closePrinterEditor);
  modal.querySelector('#printer-editor-cancel')?.addEventListener('click',closePrinterEditor);
  modal.querySelector('#printer-editor-form')?.addEventListener('submit',async e=>{
    e.preventDefault();const fd=new FormData(e.currentTarget);const device=await ensureDevice();
    const printer={
      id:p.id||'',deviceId:device.id,label:String(fd.get('label')||'').trim(),
      role:String(fd.get('role')||'receipt'),connectionType:String(fd.get('connectionType')||'system'),
      address:String(fd.get('address')||'').trim(),charsPerLine:Number(fd.get('charsPerLine'))||42,
      codepage:String(fd.get('codepage')||'ascii').trim(),autoPrint:fd.get('autoPrint')==='on',
      cutAfterPrint:fd.get('cutAfterPrint')==='on',active:fd.get('active')==='on',publicConfig:{}
    };
    try{
      await posFunction({action:'upsert_printer',restaurantId:state.restaurant.id,printer});
      await refreshPrinters();closePrinterEditor();state.error='Profil imprimante enregistré.';render();
    }catch(error){state.error=error.message||String(error);render();closePrinterEditor()}
  });
}
function printersView(){
  const discovered=state.discoveredPrinters||[];
  return `<div class="shell">${topbar()}${state.error?'<div class="notice banner">'+esc(state.error)+'</div>':''}
    <main class="printers-page"><div class="floor-head"><div><h2>Imprimantes</h2><p>Tickets clients, cuisine et bar.</p></div><div class="terminal-head-actions"><button class="secondary" id="scan-printers">Détecter Bluetooth/USB</button><button class="secondary" id="refresh-printers" ${!state.online?'disabled':''}>Actualiser</button>${isManager()?'<button class="primary compact" id="add-printer">+ Imprimante</button>':''}</div></div>
      <div class="printer-note">Android natif : Bluetooth/USB ESC/POS. L’impression système reste disponible en secours. Le TCP réseau est préparé mais volontairement non activé sur Capacitor 7.</div>
      ${discovered.length?'<section class="discovered-printers"><h3>Périphériques détectés</h3>'+discovered.map((d,i)=>'<button class="secondary discovered-printer" data-discovered-printer="'+i+'"><strong>'+esc(d.name)+'</strong><span>'+esc(printerTypeLabel(d.connectionType))+' · '+esc(d.detail||d.address)+'</span></button>').join('')+'</section>':''}
      <section class="printer-grid">${state.printers.length?state.printers.map(p=>`<article class="printer-card"><div class="terminal-card-head"><div><strong>${esc(p.label)}</strong><small>${esc(printerRoleLabel(p.role))} · ${esc(printerTypeLabel(p.connection_type))}</small></div><span class="printer-status printer-${esc(p.status)}">${esc(p.status)}</span></div><div class="terminal-meta"><div>Adresse <strong>${esc(p.address||'—')}</strong></div><div>Largeur <strong>${Number(p.chars_per_line)||42} car.</strong></div><div>Auto <strong>${p.auto_print?'Oui':'Non'}</strong></div></div><div class="printer-actions"><button class="secondary" data-test-printer="${p.id}">Test</button>${isManager()?'<button class="secondary" data-edit-printer="'+p.id+'">Modifier</button>':''}</div></article>`).join(''):'<div class="empty"><h3>Aucune imprimante configurée</h3><p>Ajoutez une imprimante système ou détectez un périphérique Bluetooth/USB.</p></div>'}</section>
    </main></div>`;
}
async function smartPrintReceipt(receipt){
  const printer=activePrinter('receipt');
  if(!printer||printer.connection_type==='system')return printReceipt(receipt);
  try{
    await printEscPosText(printer,buildReceiptText(receipt,{restaurantName:state.restaurant?.name||'ReMaPro POS',currency:state.restaurant?.currency||'CHF',width:printer.chars_per_line}));
    await markPrinter(printer,'online');
  }catch(error){
    await markPrinter(printer,'error');
    state.error='Impression ESC/POS impossible, bascule vers impression système : '+(error.message||String(error));
    render();printReceipt(receipt);
  }
}
async function autoPrintProductionItems(orderId,sentIds){
  const ids=new Set((sentIds||[]).map(String));
  if(!ids.size)return;
  const order=state.productionQueue.find(x=>x.id===orderId);
  if(!order)return;
  const selected={...order,items:(order.items||[]).filter(i=>ids.has(String(i.id)))};
  for(const role of ['kitchen','bar']){
    const printer=activePrinter(role);
    const items=selected.items.filter(i=>i.station_snapshot===role);
    if(!items.length||!printer?.auto_print)continue;
    if(['system','network'].includes(printer.connection_type))continue;
    try{
      await printEscPosText(printer,buildProductionText({...selected,items},{station:role,width:printer.chars_per_line}));
      await markPrinter(printer,'online');
    }catch(error){
      await markPrinter(printer,'error');
      state.error='Auto-impression '+printerRoleLabel(role)+' impossible : '+(error.message||String(error));
    }
  }
}
async function smartPrintProduction(order){
  const roles=[...new Set((order.items||[]).map(i=>i.station_snapshot).filter(x=>['kitchen','bar'].includes(x)))];
  if(!roles.length)return printProductionOrder(order);
  let nativeDone=false;
  for(const role of roles){
    const printer=activePrinter(role);
    if(!printer||printer.connection_type==='system')continue;
    try{
      await printEscPosText(printer,buildProductionText(order,{station:role,width:printer.chars_per_line}));
      await markPrinter(printer,'online');nativeDone=true;
    }catch(error){await markPrinter(printer,'error');state.error='Impression '+printerRoleLabel(role)+' impossible : '+(error.message||String(error))}
  }
  if(!nativeDone)printProductionOrder(order);
}

async function refreshProductionQueue(){
  if(!state.restaurant)return;
  if(!state.online){
    state.productionQueue=await kvGet(productionKey(state.restaurant.id))||state.productionQueue||[];
    return;
  }
  try{
    const r=await posFunction({action:'production_queue',restaurantId:state.restaurant.id});
    state.productionQueue=r.rows||[];
    await kvSet(productionKey(state.restaurant.id),state.productionQueue);
  }catch(error){state.error=error.message||String(error)}
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
  const normalized={...receipt,receipt_number:receipt.receipt_number||receipt.receiptNumber,total:Number(receipt.total)||0,status:receipt.status||'paid'};
  state.receipts=[normalized,...state.receipts.filter(x=>(x.receipt_number||x.receiptNumber)!==normalized.receipt_number)].slice(0,50);
  await kvSet(receiptsKey(state.restaurant.id),state.receipts);
  const printer=activePrinter('receipt');
  if(printer?.auto_print&&printer.connection_type!=='system'&&printer.connection_type!=='network'){
    state.pendingAutoReceiptNumber=normalized.receipt_number;
  }
}
async function refreshReceipts(){
  if(!state.restaurant)return;
  if(!state.online){state.receipts=await kvGet(receiptsKey(state.restaurant.id))||state.receipts||[];return}
  try{
    const r=await posFunction({action:'recent_receipts',restaurantId:state.restaurant.id,limit:50});
    state.receipts=r.rows||[];
    await kvSet(receiptsKey(state.restaurant.id),state.receipts);
    if(state.pendingAutoReceiptNumber){
      const pending=state.receipts.find(x=>(x.receipt_number||x.receiptNumber)===state.pendingAutoReceiptNumber);
      if(pending){state.pendingAutoReceiptNumber='';await smartPrintReceipt(pending)}
    }
  }catch(error){state.error=error.message||String(error)}
}
async function executeQueued(item){
  assertQueuedOperator(item);
  if(item.action==='open_cash_session'){
    const r=await posFunction({action:'open_cash_session',restaurantId:item.restaurantId,...queuedPayload(item)});
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
  if(item.action==='append_order_items'){
    return posFunction({action:'append_order_items',restaurantId:item.restaurantId,...queuedPayload(item)});
  }
  if(item.action==='send_to_production'){
    return posFunction({action:'send_to_production',restaurantId:item.restaurantId,...queuedPayload(item)});
  }
  if(item.action==='update_production_item'){
    return posFunction({action:'update_production_item',restaurantId:item.restaurantId,...queuedPayload(item)});
  }
  if(item.action==='settle_open_order'){
    const r=await posFunction({action:'settle_open_order',restaurantId:item.restaurantId,...queuedPayload(item)});
    if(r.receipt)await saveReceipt(r.receipt);
    state.openOrders=state.openOrders.filter(x=>x.id!==item.payload.orderId);
    await saveFloorCache();
    return r;
  }
  if(item.action==='settle_open_order_split'){
    const r=await posFunction({action:'settle_open_order_split',restaurantId:item.restaurantId,...queuedPayload(item)});
    if(r.receipt)await saveReceipt(r.receipt);
    state.openOrders=state.openOrders.filter(x=>x.id!==item.payload.orderId);
    await saveFloorCache();
    return r;
  }
  if(item.action==='close_cash_session'){
    const r=await posFunction({action:'close_cash_session',restaurantId:item.restaurantId,...queuedPayload(item)});
    if(state.cashSession?.id===item.payload.sessionId){
      await kvSet('lastClosedSession:'+item.restaurantId,r.session||state.cashSession);
      state.cashSession=null;await kvDelete(sessionKey(item.restaurantId));
    }
    return r;
  }
  throw new Error('UNKNOWN_QUEUE_ACTION');
}
async function flushQueueInternal({force=false}={}){
  if(state.trainingMode)return;
  if(!state.online||!state.restaurant)return;
  const list=await queueAll();
  let floorChanged=false,productionChanged=false;
  for(const item of list){
    if(item.restaurantId!==state.restaurant.id)continue;
    if(!force&&!queueRetryDue(item))break;
    try{
      await executeQueued(item);
      if(['save_open_order','append_order_items','send_to_production','update_production_item','settle_open_order','settle_open_order_split'].includes(item.action))floorChanged=true;
      if(['append_order_items','send_to_production','update_production_item'].includes(item.action))productionChanged=true;
      await queueDelete(item.client_event_id);
    }catch(error){
      const message=error?.message==='OFFLINE_OPERATOR_REAUTH'
        ?'Reconnectez '+(error.operatorName||'l’opérateur d’origine')+' pour synchroniser cette action.'
        :(error.message||String(error));
      const attempts=Number(item.attempts||0)+1,lastAttemptAt=new Date().toISOString(),nextRetryAt=new Date(Date.now()+queueRetryDelayMs(attempts)).toISOString();
      await queuePut({...item,attempts,last_error:message,last_attempt_at:lastAttemptAt,next_retry_at:nextRetryAt});
      recordDiagnostic('sync.queue_error',{action:item.action,attempts,message,nextRetryAt});
      state.error='Synchronisation: '+message;
      break
    }
  }
  if(floorChanged&&state.online)await refreshFloorData();
  if(productionChanged&&state.online)await refreshProductionQueue();
  if(state.pendingAutoReceiptNumber&&state.online)await refreshReceipts();
  state.syncLastRun=new Date().toISOString();
  await updateQueueCount();render();
}
async function flushQueue(options={}){
  if(queueFlushPromise)return queueFlushPromise;
  queueFlushPromise=flushQueueInternal(options);
  try{return await queueFlushPromise}finally{queueFlushPromise=null}
}
async function queueCommand(action,payload,options={}){
  if(state.trainingMode)throw new Error('TRAINING_REAL_ACTION_BLOCKED');
  const item=queuedItem(action,state.restaurant.id,payload,options);
  await queuePut(item);await updateQueueCount();return item;
}
async function bootstrapRestaurant(restaurant){
  state.restaurant=restaurant;state.error='';
  state.receipts=await kvGet(receiptsKey(restaurant.id))||[];
  state.tables=await kvGet(tablesKey(restaurant.id))||[];
  state.openOrders=await kvGet(openOrdersKey(restaurant.id))||[];
  state.productionQueue=await kvGet(productionKey(restaurant.id))||[];
  state.terminals=await kvGet(terminalsKey(restaurant.id))||[];
  state.printers=await kvGet(printersKey(restaurant.id))||[];
  state.operators=await kvGet(operatorsKey(restaurant.id))||[];
  state.operatorRequired=state.operators.some(x=>x.active!==false);
  const cachedOperator=currentOperatorSession();
  state.operator=state.operatorRequired&&operatorSessionUsable(cachedOperator,restaurant.id)?cachedOperator.operator:null;
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
      await refreshOperators();
      await refreshOperationalData();startDirectOrderPolling()
    }catch(error){state.error=error.message||String(error)}
  }
  await updateQueueCount();render();flushQueue().catch(()=>{});
}
async function openCachedIdentity(cached,message=''){
  if(!cached?.restaurants?.length)return false;
  state.identity=cached;
  const preferred=await kvGet('restaurantId'),restaurants=cached.restaurants||[];
  const target=restaurants.find(r=>r.id===preferred)||restaurants[0]||null;
  if(target){await kvSet('restaurantId',target.id);await bootstrapRestaurant(target)}
  if(message)state.error=message;
  return true;
}
async function loadAccount(){
  state.busy=true;state.error='';render();
  const cached=await kvGet('identity');
  if(!state.online){
    const ok=await openCachedIdentity(cached,'Mode hors ligne — identité et restaurant chargés depuis SQLite.');
    if(!ok)state.error='Première connexion nécessaire : reconnectez Internet une fois pour initialiser ReMaPro POS.';
    state.busy=false;render();return;
  }
  try{
    state.identity=await loadIdentity();
    await kvSet('identity',state.identity);
    const preferred=await kvGet('restaurantId'),restaurants=state.identity.restaurants||[];
    const target=restaurants.find(r=>r.id===preferred)||restaurants[0]||null;
    if(target){await kvSet('restaurantId',target.id);await bootstrapRestaurant(target)}
  }catch(error){
    const message=error.message||String(error);
    if(/AUTH/.test(message)){
      signOut();await kvDelete('identity');state.identity=null;state.error=message;
    }else if(!(await openCachedIdentity(cached,'Serveur indisponible — mode cache local actif.'))){
      state.error=message;
    }
  }finally{state.busy=false;render()}
}
async function logoutPos(){
  signOut();clearOperatorSession();await kvDelete('identity');
  state.identity=null;state.restaurant=null;state.operator=null;state.cashSession=null;state.view='sale';render();
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
    uiAlert('Impossible de clôturer : il reste des notes ouvertes.');
    return;
  }
  state.cashSession={...state.cashSession,status:'closing'};await kvSet(sessionKey(state.restaurant.id),state.cashSession);
  await queueCommand('close_cash_session',{sessionId:state.cashSession.id,countedCash:Number(countedCash)||0});
  render();flushQueue().catch(()=>{});
}
function linePayload(x){
  return {
    id:uuid(),catalog_item_id:x.quick?null:(x.catalog_item_id||x.id),recipe_id:x.recipe_id,sku:x.sku,name:x.name,
    quantity:x.qty,unit_price:x.price,tax_rate:x.tax_rate,
    production_station:x.production_station||'kitchen',note:x.note||'',modifiers:Array.isArray(x.modifiers)?x.modifiers:[]
  };
}
function orderLines(){return state.cart.map(linePayload)}
function deltaLines(){return state.cart.filter(x=>x.delta).map(linePayload)}
function hasPendingDelta(){return state.cart.some(x=>x.delta)}
function openTable(table){
  const existing=state.openOrders.find(o=>o.table_id===table.id||(!o.table_id&&o.table_label===table.label));
  state.activeTableId=table.id;state.tableLabel=table.label;state.serviceType='dine_in';
  if(existing){
    state.activeOrderId=existing.id;state.covers=Number(existing.covers)||table.seats||1;
    const locked=existing.status!=='open';
    state.cart=(existing.items||[]).map(item=>({
      id:item.catalog_item_id||('saved:'+item.id),catalog_item_id:item.catalog_item_id||null,line_id:item.id,
      recipe_id:item.recipe_id||null,sku:item.sku_snapshot||'',name:item.name_snapshot,
      price:Number(item.unit_price)||0,tax_rate:Number(item.tax_rate)||0,production_station:item.station_snapshot||'kitchen',
      qty:Number(item.quantity)||1,quick:!item.catalog_item_id,locked,delta:false,modifiers:Array.isArray(item.modifiers)?item.modifiers:[],note:item.note||''
    }));
  }else{
    state.activeOrderId=uuid();state.covers=table.seats||1;state.cart=[];
  }
  state.view='sale';render();
}
async function addDiningTable(){
  if(!isManager())return;
  const form=await uiFields({title:t('addTable'),fields:[
    {name:'label',label:t('tableName'),value:t('tableNameExample'),required:true},
    {name:'seats',label:t('seats'),value:'2',type:'number',inputMode:'numeric',min:'0',max:'99',step:'1',required:true}
  ]});if(!form?.label?.trim())return;
  const label=String(form.label).trim(),seats=Math.max(0,Math.min(99,Math.trunc(Number(form.seats)||2)));
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
    items:order.lines.map(x=>({id:x.id,order_id:order.id,catalog_item_id:x.catalog_item_id,recipe_id:x.recipe_id,name_snapshot:x.name,sku_snapshot:x.sku,quantity:x.quantity,unit_price:x.unit_price,tax_rate:x.tax_rate,line_total:Number(x.quantity)*Number(x.unit_price),station_snapshot:x.production_station||'kitchen',kitchen_status:'new',note:x.note||null,modifiers:Array.isArray(x.modifiers)?x.modifiers:[]})),
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
  if(orderLocked()){uiAlert('Cette note a déjà été envoyée en production.');return}
  if(!state.cart.length||!state.cashSession||state.cashSession.status!=='open')return;
  const device=await ensureDevice(),orderId=state.activeOrderId||uuid(),eventId=uuid(),order=buildOpenOrder(orderId,eventId);
  order.deviceId=device.id;
  await queuePut(queuedItem('save_open_order',state.restaurant.id,{order},{clientEventId:eventId}));
  const local=localOpenOrder(order,'open');
  state.openOrders=[local,...state.openOrders.filter(x=>x.id!==orderId)];
  await saveFloorCache();state.cart=[];state.activeOrderId=null;state.activeTableId=null;state.tableLabel='';state.view='floor';
  await updateQueueCount();render();flushQueue().catch(()=>{});
}


async function acceptDirectOrder(id){
  if(!state.online){uiAlert(t('connectionRequired'));return}
  const direct=state.directOrders.find(x=>String(x.id)===String(id));if(!direct||direct.status!=='pending')return;
  if(!state.cashSession||state.cashSession.status!=='open'){uiAlert(t('directCashRequired'));return}
  try{
    await posFunction({action:'claim_direct_order',restaurantId:state.restaurant.id,directOrderId:direct.id});
    const cart=directOrderCart(direct);if(!cart.length)throw new Error(t('directEmpty'));
    const device=await ensureDevice(),orderId=uuid(),eventId=uuid(),table=direct.service_type==='dine_in'?(state.tables||[]).find(x=>String(x.label||'').trim().toLocaleLowerCase()===String(direct.table_label||'').trim().toLocaleLowerCase()&&!state.openOrders.some(o=>o.table_id===x.id)):null;
    const lines=cart.map(linePayload),order={id:orderId,clientEventId:eventId,deviceId:device.id,cashSessionId:state.cashSession.id,businessDate:state.cashSession.businessDate,serviceType:direct.service_type||'takeaway',tableId:table?.id||null,tableLabel:direct.table_label||'',covers:Number(direct.covers)||0,currency:direct.currency||state.restaurant.currency||'CHF',lines,occurredAt:new Date().toISOString()};
    const saved=await posFunction({action:'save_open_order',restaurantId:state.restaurant.id,order});
    await posFunction({action:'link_direct_order',restaurantId:state.restaurant.id,directOrderId:direct.id,posOrderId:orderId});
    const local=saved?.order||localOpenOrder(order,'open');state.openOrders=[local,...state.openOrders.filter(x=>x.id!==orderId)];await saveFloorCache();
    state.activeOrderId=orderId;state.activeTableId=table?.id||null;state.tableLabel=direct.table_label||'';state.serviceType=direct.service_type||'takeaway';state.covers=Number(direct.covers)||0;
    state.cart=(local.items||[]).map(item=>({id:item.catalog_item_id||('saved:'+item.id),catalog_item_id:item.catalog_item_id||null,line_id:item.id,recipe_id:item.recipe_id||null,sku:item.sku_snapshot||'',name:item.name_snapshot,price:Number(item.unit_price)||0,tax_rate:Number(item.tax_rate)||0,production_station:item.station_snapshot||'kitchen',qty:Number(item.quantity)||1,quick:!item.catalog_item_id,locked:false,delta:false,modifiers:Array.isArray(item.modifiers)?item.modifiers:[],note:item.note||''}));
    await refreshDirectOrders();state.view='sale';state.error=t('directImported');render();
  }catch(error){state.error=error.message||String(error);recordDiagnostic('direct_orders.accept_error',{message:state.error});await refreshDirectOrders();render()}
}
async function rejectDirectOrder(id){
  if(!state.online){uiAlert(t('connectionRequired'));return}
  const reason=await uiPrompt({title:t('directReject'),label:t('cancelReason'),required:true});if(!reason?.trim())return;
  try{await posFunction({action:'reject_direct_order',restaurantId:state.restaurant.id,directOrderId:id,reason:reason.trim()});await refreshDirectOrders();render()}
  catch(error){state.error=error.message||String(error);recordDiagnostic('direct_orders.reject_error',{message:state.error});render()}
}
function directOrdersView(){return renderDirectOrders({orders:state.directOrders,money,t,esc,online:state.online,topbar:topbar()})}

async function refreshServiceReport(targetDate=state.reportDate||dateKey()){
  if(!state.restaurant)return;
  state.reportDate=targetDate||dateKey();
  if(!state.online){state.error='Le rapport de service nécessite une connexion.';render();return}
  try{
    const [r,cost]=await Promise.all([
      posFunction({action:'service_report',restaurantId:state.restaurant.id,businessDate:state.reportDate}),
      posFunction({action:'food_cost_report',restaurantId:state.restaurant.id,businessDate:state.reportDate}).catch(()=>({report:null}))
    ]);
    state.serviceReport=r.report||null;state.foodCostReport=cost.report||null;state.error='';
  }catch(error){state.error=error.message||String(error)}
  render();
}
function printServiceReport(report){
  if(!report)return;
  const payments=Array.isArray(report.payments)?report.payments:[];
  const refunds=Array.isArray(report.refundsByMethod)?report.refundsByMethod:[];
  const taxes=Array.isArray(report.taxGroups)?report.taxGroups:[];
  const sessions=report.cashSessions||{};
  const paymentRows=payments.map(x=>'<div class="print-line"><span>'+esc(String(x.method||'').toUpperCase())+' ('+Number(x.count||0)+')</span><span>'+money(x.amount)+'</span></div>').join('');
  const refundRows=refunds.map(x=>'<div class="print-line refund"><span>Remb. '+esc(String(x.method||'').toUpperCase())+'</span><span>− '+money(x.amount)+'</span></div>').join('');
  const taxRows=taxes.map(x=>'<div class="print-line"><span>TVA '+Number(x.tax_rate||0)+'%</span><span>'+money(x.tax)+'</span></div>').join('');
  const body='<div class="print-meta"><div>'+esc(state.restaurant?.name||'ReMaPro POS')+'</div><div><strong>Rapport service / Z</strong></div><div>'+esc(report.businessDate||'')+'</div></div>'
    +'<hr><div class="print-line"><span>Tickets</span><span>'+Number(report.orders||0)+'</span></div>'
    +'<div class="print-line"><span>Couverts</span><span>'+Number(report.covers||0)+'</span></div>'
    +'<div class="print-line"><span>Ticket moyen</span><span>'+money(report.averageTicket)+'</span></div>'
    +'<hr><div class="print-line"><span>CA brut</span><span>'+money(report.grossSales)+'</span></div>'
    +'<div class="print-line refund"><span>Remboursements</span><span>− '+money(report.refundTotal)+'</span></div>'
    +'<div class="print-line total"><span>CA net</span><span>'+money(report.netSales)+'</span></div>'
    +'<div class="print-line"><span>Pourboires nets</span><span>'+money(report.netTips)+'</span></div>'
    +'<hr>'+paymentRows+refundRows+'<hr>'+taxRows
    +'<hr><div class="print-line"><span>Fond caisse</span><span>'+money(sessions.openingCash)+'</span></div>'
    +'<div class="print-line"><span>Espèces attendues</span><span>'+money(sessions.expectedCash)+'</span></div>'
    +'<div class="print-line"><span>Écart caisse</span><span>'+money(sessions.differenceCash)+'</span></div>';
  printHtml('RAPPORT Z',body);
}
function cleanupPrintSheet(){
  document.body.classList.remove('print-mode');
  document.querySelector('#print-sheet')?.remove();
}
function printHtml(title,bodyHtml){
  cleanupPrintSheet();
  const sheet=document.createElement('section');
  sheet.id='print-sheet';sheet.className='print-sheet';
  sheet.innerHTML='<header class="print-head"><strong>'+esc(title)+'</strong></header>'+bodyHtml;
  document.body.appendChild(sheet);document.body.classList.add('print-mode');
  window.addEventListener('afterprint',cleanupPrintSheet,{once:true});
  setTimeout(()=>{try{window.print()}catch{cleanupPrintSheet()}},80);
  setTimeout(()=>{if(document.querySelector('#print-sheet'))cleanupPrintSheet()},30000);
}
function printReceipt(receipt){
  const items=Array.isArray(receipt.items)?receipt.items:[];
  const payments=Array.isArray(receipt.payments)?receipt.payments:[];
  const refunds=Array.isArray(receipt.refunds)?receipt.refunds.filter(r=>r.status==='completed'):[];
  const taxGroups=new Map();
  for(const item of items){
    const rate=Number(item.tax_rate)||0;
    taxGroups.set(rate,(taxGroups.get(rate)||0)+Number(item.tax_amount||0));
  }
  const refundTotal=refunds.reduce((s,r)=>s+Number(r.amount||0),0);
  const tip=Number(receipt.tip_total||0);
  const when=receipt.closed_at?new Date(receipt.closed_at).toLocaleString('fr-CH'):'';
  const itemRows=items.map(i=>'<div class="print-line"><span>'+Number(i.quantity||1)+'× '+esc(i.name_snapshot)+(modifierSummary(i.modifiers)?'<small>'+esc(modifierSummary(i.modifiers))+'</small>':'')+'</span><span>'+money(i.line_total)+'</span></div>').join('')||'<div>Détail indisponible</div>';
  const taxRows=[...taxGroups.entries()].map(([rate,tax])=>'<div class="print-line"><span>TVA '+rate+'%</span><span>'+money(tax)+'</span></div>').join('');
  const paymentRows=payments.map(p=>'<div class="print-line"><span>'+esc((p.metadata?.splitLabel?p.metadata.splitLabel+' · ':'')+String(p.method||'').toUpperCase())+'</span><span>'+money(Number(p.amount||0)+Number(p.tip_amount||0))+'</span></div>').join('');
  const tipRow=tip?'<div class="print-line"><span>Pourboire</span><span>'+money(tip)+'</span></div>':'';
  const refundRow=refundTotal?'<div class="print-line refund"><span>Remboursé</span><span>− '+money(refundTotal)+'</span></div>':'';
  const body='<div class="print-meta"><div>'+esc(state.restaurant?.name||'ReMaPro POS')+'</div><div>'+esc(receipt.receipt_number||receipt.receiptNumber||'')+'</div><div>'+esc(when)+'</div><div>'+esc(receipt.table_label||receipt.service_type||'')+'</div></div>'
    +'<hr><div class="print-lines">'+itemRows+'</div><hr>'
    +'<div class="print-line total"><span>Total TTC</span><span>'+money(receipt.total)+'</span></div>'
    +tipRow+refundRow+'<div class="print-taxes">'+taxRows+'</div><hr><div class="print-payments">'+paymentRows+'</div>'
    +'<p class="print-thanks">Merci et à bientôt.</p>';
  printHtml(state.restaurant?.name||'ReMaPro POS',body);
}

function printSplitPayment(receipt,payment){
  const meta=payment?.metadata||{};
  const allocations=Array.isArray(meta.allocations)?meta.allocations:[];
  if(!allocations.length){uiAlert('Aucun détail de partage disponible pour ce paiement.');return}
  const label=meta.splitLabel||'Part individuelle';
  const taxGroups=new Map();
  for(const a of allocations){
    const tax=Number(a.tax)||0,amount=Number(a.amount)||0;
    const key=amount>0?Math.round((tax/(Math.max(amount-tax,0.0001)))*10000)/100:0;
    taxGroups.set(key,(taxGroups.get(key)||0)+tax);
  }
  const itemRows=allocations.map(a=>'<div class="print-line"><span>'+Number(a.quantity||0)+'× '+esc(a.name||'Article')+'</span><span>'+money(a.amount)+'</span></div>').join('');
  const taxTotal=allocations.reduce((s,a)=>s+Number(a.tax||0),0);
  const body='<div class="print-meta"><div>'+esc(state.restaurant?.name||'ReMaPro POS')+'</div><div><strong>'+esc(label)+'</strong></div><div>Ticket maître '+esc(receipt.receipt_number||receipt.receiptNumber||'')+'</div><div>'+esc(receipt.table_label||receipt.service_type||'')+'</div></div>'
    +'<hr><div class="print-lines">'+itemRows+'</div><hr>'
    +'<div class="print-line total"><span>Part</span><span>'+money(payment.amount)+'</span></div>'
    +(Number(payment.tip_amount)?'<div class="print-line"><span>Pourboire</span><span>'+money(payment.tip_amount)+'</span></div>':'')
    +'<div class="print-line"><span>TVA incluse</span><span>'+money(taxTotal)+'</span></div>'
    +'<hr><div class="print-line"><span>'+esc(String(payment.method||'').toUpperCase())+'</span><span>'+money(Number(payment.amount||0)+Number(payment.tip_amount||0))+'</span></div>'
    +'<p class="print-thanks">Sous-ticket de partage · ticket maître conservé.</p>';
  printHtml(label,body);
}
function printProductionOrder(order){
  const items=Array.isArray(order.items)?order.items:[];
  const itemRows=items.map(i=>'<div class="print-production-line"><strong>'+Number(i.quantity||1)+'× '+esc(i.name_snapshot)+'</strong><small>'+(i.station_snapshot==='bar'?'BAR':'CUISINE')+' · '+esc(i.kitchen_status)+(productionModifierSummary(i.modifiers)?' · '+esc(productionModifierSummary(i.modifiers)):i.note?' · '+esc(i.note):'')+'</small></div>').join('');
  const body='<div class="print-meta"><div class="production-title">'+esc(order.table_label||order.service_type||'Commande')+'</div><div>'+new Date().toLocaleString('fr-CH')+'</div></div><hr><div class="print-lines">'+itemRows+'</div>';
  printHtml('BON PRODUCTION',body);
}
function parseMoneyInput(value){
  const n=Number(String(value??'').trim().replace(',','.'));return Number.isFinite(n)?Math.round(n*100)/100:NaN;
}
async function askTip(defaultValue='0.00'){
  const raw=await uiPrompt({title:t('tipTitle'),label:t('tipLabel'),value:defaultValue,type:'number',inputMode:'decimal',min:'0',step:'0.01'});if(raw===null)return null;
  const tip=parseMoneyInput(raw);if(!Number.isFinite(tip)||tip<0){uiAlert(t('invalidTip'));return null}return tip;
}
function normalizePaymentMethod(value){
  const v=String(value||'').trim().toLowerCase();
  if(['cash','especes','espèces'].includes(v))return'cash';
  if(['card','carte'].includes(v))return'card';
  if(v==='twint')return'twint';
  if(['voucher','bon'].includes(v))return'voucher';
  if(['invoice','facture'].includes(v))return'invoice';
  if(v==='other')return'other';
  return'';
}
function currentServerOrder(){return state.openOrders.find(o=>o.id===state.activeOrderId)||null}
function orderLocked(){const o=currentServerOrder();return !!o&&o.status!=='open'}
function paymentBlockedByDelta(){return orderLocked()&&hasPendingDelta()}
function progressivePaymentActive(){return currentServerOrder()?.status==='payment_pending'}
function standardPaymentBlocked(){return paymentBlockedByDelta()||progressivePaymentActive()}
async function transferCurrentOrder(){
  const order=currentServerOrder();
  if(!order){uiAlert('Enregistrez d’abord la note avant de la transférer.');return}
  if(!state.online){uiAlert(t('tableTransferNeedsNetwork'));return}
  const free=state.tables.filter(t=>t.id!==state.activeTableId&&!state.openOrders.some(o=>o.id!==order.id&&o.table_id===t.id));
  if(!free.length){uiAlert(t('noFreeTable'));return}
  const transfer=await uiFields({title:t('transferTitle'),fields:[{name:'tableId',label:t('transferTo'),type:'select',value:free[0].id,options:free.map(x=>({value:x.id,label:x.label}))}]});if(!transfer)return;
  const target=free.find(t=>String(t.id)===String(transfer.tableId));
  if(!target){uiAlert(t('tableNotFound'));return}
  try{
    await posFunction({action:'transfer_open_order',restaurantId:state.restaurant.id,orderId:order.id,targetTableId:target.id});
    state.activeTableId=target.id;state.tableLabel=target.label;await refreshFloorData();state.error='';render();
  }catch(error){state.error=error.message||String(error);render()}
}
async function cancelCurrentOrder(){
  const order=currentServerOrder();
  if(!order){uiAlert(t('orderNotSaved'));return}
  if(!state.online){uiAlert(t('cancelNeedsNetwork'));return}
  const reason=await uiPrompt({title:t('cancelOrderTitle'),label:t('cancelReason'),required:true});if(!reason?.trim())return;
  if(!(await uiConfirm({title:t('cancelOrderTitle'),message:t('cancelAudit'),danger:true})))return;
  try{
    await posFunction({action:'cancel_open_order',restaurantId:state.restaurant.id,orderId:order.id,reason:reason.trim()});
    state.openOrders=state.openOrders.filter(x=>x.id!==order.id);await saveFloorCache();
    state.cart=[];state.activeOrderId=null;state.activeTableId=null;state.tableLabel='';state.view='floor';state.error='';render();
  }catch(error){state.error=error.message||String(error);render()}
}

async function prepareOrderForAllocatedSplit(){
  if(!state.online){uiAlert('Le partage par articles nécessite une connexion.');return null}
  if(!state.cart.length||!state.cashSession||state.cashSession.status!=='open')return null;
  if(paymentBlockedByDelta()){uiAlert(t('sendNewItemsFirst'));return null}

  let order=currentServerOrder();
  if(!order||order.status==='open'){
    const device=await ensureDevice();
    const orderId=state.activeOrderId||uuid(),eventId=uuid();
    const payload=buildOpenOrder(orderId,eventId);payload.deviceId=device.id;
    try{
      await posFunction({action:'save_open_order',restaurantId:state.restaurant.id,order:payload});
      state.activeOrderId=orderId;
      await refreshFloorData();
      order=state.openOrders.find(x=>x.id===orderId)||null;
    }catch(error){
      state.error=error.message||String(error);render();return null;
    }
  }
  return order;
}
function closeAllocatedSplit(){
  document.querySelector('#allocated-split-modal')?.remove();
  document.body.classList.remove('modal-open');
}
function splitQty(value){
  const n=Number(value);return Number.isFinite(n)?Math.max(0,Math.round(n*1000)/1000):0;
}
function updateAllocatedSplitTotals(){
  const modal=document.querySelector('#allocated-split-modal');if(!modal)return;
  const rows=[...modal.querySelectorAll('[data-split-item-row]')];
  const groupCount=Number(modal.dataset.groups)||0;
  let complete=true;
  const totals=Array(groupCount).fill(0);

  for(const row of rows){
    const qty=Number(row.dataset.qty)||0,lineTotal=Number(row.dataset.total)||0;
    const unit=qty?lineTotal/qty:0;
    let assigned=0;
    for(let gi=0;gi<groupCount;gi++){
      const input=row.querySelector('[data-split-group="'+gi+'"]');
      const q=splitQty(input?.value);assigned+=q;totals[gi]+=unit*q;
    }
    const remaining=Math.round((qty-assigned)*1000)/1000;
    const rem=row.querySelector('[data-split-remaining]');
    if(rem){rem.textContent=Math.abs(remaining)<0.0005?'OK':'Reste '+remaining;rem.classList.toggle('ok',Math.abs(remaining)<0.0005)}
    if(Math.abs(remaining)>0.0005)complete=false;
  }
  for(let gi=0;gi<groupCount;gi++){
    const el=modal.querySelector('[data-split-total="'+gi+'"]');
    if(el)el.textContent=money(Math.round(totals[gi]*100)/100);
  }
  const pay=modal.querySelector('#allocated-split-submit');
  if(pay)pay.disabled=!complete||totals.some(x=>x<=0.005);
}
function autoAllocateSplit(){
  const modal=document.querySelector('#allocated-split-modal');if(!modal)return;
  const groupCount=Number(modal.dataset.groups)||0;
  for(const row of modal.querySelectorAll('[data-split-item-row]')){
    const qty=Number(row.dataset.qty)||0;
    const values=Array(groupCount).fill(0);
    if(Math.abs(qty-Math.round(qty))<0.0005){
      for(let unit=0;unit<Math.round(qty);unit++)values[unit%groupCount]+=1;
    }else{
      const base=Math.floor((qty/groupCount)*1000)/1000;
      for(let gi=0;gi<groupCount;gi++)values[gi]=base;
      values[groupCount-1]=Math.round((qty-base*(groupCount-1))*1000)/1000;
    }
    values.forEach((v,gi)=>{const input=row.querySelector('[data-split-group="'+gi+'"]');if(input)input.value=String(v)});
  }
  updateAllocatedSplitTotals();
}
function collectAllocatedGroups(){
  const modal=document.querySelector('#allocated-split-modal');if(!modal)return[];
  const groupCount=Number(modal.dataset.groups)||0,groups=[];
  for(let gi=0;gi<groupCount;gi++){
    const selections=[];
    for(const row of modal.querySelectorAll('[data-split-item-row]')){
      const input=row.querySelector('[data-split-group="'+gi+'"]');
      const q=splitQty(input?.value);
      if(q>0)selections.push({itemId:row.dataset.itemId,quantity:q});
    }
    if(!selections.length)continue;
    const label=modal.querySelector('[data-group-label="'+gi+'"]')?.value?.trim()||('Personne '+(gi+1));
    const method=modal.querySelector('[data-group-method="'+gi+'"]')?.value||'cash';
    const tip=parseMoneyInput(modal.querySelector('[data-group-tip="'+gi+'"]')?.value||'0');
    groups.push({label,method,tipAmount:Number.isFinite(tip)&&tip>=0?tip:0,provider:'',providerReference:'',selections});
  }
  return groups;
}
async function settleAllocatedSplit(order){
  const groups=collectAllocatedGroups();if(!groups.length)return;
  const modal=document.querySelector('#allocated-split-modal');
  const submit=modal?.querySelector('#allocated-split-submit');
  if(submit)submit.disabled=true;
  try{
    const device=await ensureDevice(),eventId=uuid();
    const r=await posFunction({
      action:'settle_open_order_allocated',restaurantId:state.restaurant.id,
      orderId:order.id,clientEventId:eventId,deviceId:device.id,cashSessionId:state.cashSession.id,
      groups,occurredAt:new Date().toISOString()
    });
    state.openOrders=state.openOrders.filter(x=>x.id!==order.id);
    state.cart=[];state.activeOrderId=null;state.activeTableId=null;state.tableLabel='';
    await saveFloorCache();await Promise.all([refreshFloorData(),refreshReceipts()]);
    closeAllocatedSplit();state.view='tickets';
    state.error='Addition répartie entre '+groups.length+' personne'+(groups.length>1?'s':'')+'.';
    render();
    return r;
  }catch(error){
    state.error=error.message||String(error);
    if(submit)submit.disabled=false;
    render();closeAllocatedSplit();
  }
}
async function openAllocatedSplit(){
  const order=await prepareOrderForAllocatedSplit();if(!order)return;
  const items=(order.items||[]).filter(x=>x.kitchen_status!=='cancelled');
  if(!items.length){uiAlert('Aucun article à répartir.');return}
  const raw=await uiPrompt({title:t('splitPeople'),label:t('splitPeople'),value:'2',type:'number',inputMode:'numeric',min:'2',max:'8',step:'1'});if(raw===null)return;
  const groupCount=Math.max(2,Math.min(8,Math.trunc(Number(raw)||0)));
  if(groupCount<2){uiAlert(t('splitInvalid'));return}

  closeAllocatedSplit();
  const modal=document.createElement('div');
  modal.id='allocated-split-modal';modal.className='modal-overlay';modal.dataset.groups=String(groupCount);
  const groupHeads=Array.from({length:groupCount},(_,gi)=>'<th><input data-group-label="'+gi+'" class="split-label" value="Personne '+(gi+1)+'"><select data-group-method="'+gi+'" class="split-method"><option value="cash">Espèces</option><option value="card">Carte</option><option value="twint">TWINT</option><option value="voucher">Bon</option><option value="invoice">Facture</option></select><label class="split-tip">Tip <input data-group-tip="'+gi+'" inputmode="decimal" value="0.00"></label><strong data-split-total="'+gi+'">'+money(0)+'</strong></th>').join('');
  const itemRows=items.map(item=>'<tr data-split-item-row data-item-id="'+esc(item.id)+'" data-qty="'+Number(item.quantity||0)+'" data-total="'+Number(item.line_total||0)+'"><td><strong>'+esc(item.name_snapshot)+'</strong><small>'+Number(item.quantity||0)+' × '+money(item.unit_price)+'</small></td>'+Array.from({length:groupCount},(_,gi)=>'<td><input class="split-qty-input" data-split-group="'+gi+'" type="number" min="0" max="'+Number(item.quantity||0)+'" step="0.001" value="'+(gi===0?Number(item.quantity||0):0)+'"></td>').join('')+'<td><span class="split-remaining" data-split-remaining>OK</span></td></tr>').join('');
  modal.innerHTML='<div class="split-dialog"><div class="split-dialog-head"><div><h2>Partager par articles</h2><p>'+esc(order.table_label||order.service_type||'Commande')+' · '+money(order.total)+'</p></div><button class="split-close" id="allocated-split-close">×</button></div><div class="split-toolbar"><button class="secondary" id="allocated-auto">Répartir par unité</button><span>Chaque quantité doit être attribuée entièrement.</span></div><div class="split-table-wrap"><table class="split-table"><thead><tr><th>Article</th>'+groupHeads+'<th>Contrôle</th></tr></thead><tbody>'+itemRows+'</tbody></table></div><div class="split-footer"><button class="secondary" id="allocated-split-cancel">Annuler</button><button class="primary" id="allocated-split-submit">Encaisser la répartition</button></div></div>';
  document.body.appendChild(modal);translateDom(modal);document.body.classList.add('modal-open');
  modal.querySelector('#allocated-split-close')?.addEventListener('click',closeAllocatedSplit);
  modal.querySelector('#allocated-split-cancel')?.addEventListener('click',closeAllocatedSplit);
  modal.querySelector('#allocated-auto')?.addEventListener('click',autoAllocateSplit);
  modal.querySelectorAll('.split-qty-input,.split-tip').forEach(el=>el.addEventListener('input',updateAllocatedSplitTotals));
  modal.querySelector('#allocated-split-submit')?.addEventListener('click',()=>settleAllocatedSplit(order));
  updateAllocatedSplitTotals();
}

function printProgressivePayment(order,payment){
  const meta=payment?.metadata||{};
  const allocations=Array.isArray(payment?.allocations)?payment.allocations:Array.isArray(meta.allocations)?meta.allocations:[];
  const label=payment?.label||meta.splitLabel||'Part';
  const paymentReceipt=payment?.paymentReceiptNumber||payment?.receipt_number||'';
  const master=payment?.masterReceiptNumber||order?.receipt_number||order?.receiptNumber||'';
  const method=payment?.method||'';
  const amount=Number(payment?.amount||0),tip=Number(payment?.tip ?? payment?.tip_amount ?? 0);
  const taxTotal=allocations.reduce((s,a)=>s+Number(a.tax||0),0);
  const itemRows=allocations.map(a=>'<div class="print-line"><span>'+Number(a.quantity||0)+'× '+esc(a.name||'Article')+'</span><span>'+money(a.amount)+'</span></div>').join('');
  const body='<div class="print-meta"><div>'+esc(state.restaurant?.name||'ReMaPro POS')+'</div><div><strong>'+esc(label)+'</strong></div><div>'+esc(paymentReceipt)+'</div><div>Ticket maître '+esc(master)+'</div><div>'+esc(order?.table_label||order?.service_type||'')+'</div></div>'
    +'<hr><div class="print-lines">'+itemRows+'</div><hr>'
    +'<div class="print-line total"><span>Part payée</span><span>'+money(amount)+'</span></div>'
    +(tip?'<div class="print-line"><span>Pourboire</span><span>'+money(tip)+'</span></div>':'')
    +'<div class="print-line"><span>TVA incluse</span><span>'+money(taxTotal)+'</span></div>'
    +'<hr><div class="print-line"><span>'+esc(String(method).toUpperCase())+'</span><span>'+money(amount+tip)+'</span></div>'
    +'<p class="print-thanks">Paiement partiel · ticket maître '+esc(master)+'</p>';
  printHtml(label,body);
}
async function prepareOrderForProgressivePayment(){
  if(!state.online){uiAlert('Le paiement progressif nécessite une connexion.');return null}
  if(!state.cart.length||!state.cashSession||state.cashSession.status!=='open')return null;
  if(paymentBlockedByDelta()){uiAlert(t('sendNewItemsFirst'));return null}
  let order=currentServerOrder();
  if(!order||order.status==='open'){
    const device=await ensureDevice(),orderId=state.activeOrderId||uuid(),eventId=uuid();
    const payload=buildOpenOrder(orderId,eventId);payload.deviceId=device.id;
    try{
      await posFunction({action:'save_open_order',restaurantId:state.restaurant.id,order:payload});
      state.activeOrderId=orderId;await refreshFloorData();
      order=state.openOrders.find(x=>x.id===orderId)||null;
    }catch(error){state.error=error.message||String(error);render();return null}
  }
  return order;
}
function closeProgressiveModal(){
  document.querySelector('#progressive-payment-modal')?.remove();
  document.body.classList.remove('modal-open');
}
function updateProgressiveTotal(){
  const modal=document.querySelector('#progressive-payment-modal');if(!modal)return;
  let selected=0;
  for(const row of modal.querySelectorAll('[data-progress-item-row]')){
    const remainingQty=Number(row.dataset.remainingQty)||0,lineTotal=Number(row.dataset.remainingAmount)||0;
    const q=Math.min(remainingQty,splitQty(row.querySelector('[data-progress-qty]')?.value));
    selected+=remainingQty?lineTotal*(q/remainingQty):0;
  }
  selected=Math.round(selected*100)/100;
  const total=modal.querySelector('#progressive-selected-total');if(total)total.textContent=money(selected);
  const left=modal.querySelector('#progressive-after-total');
  if(left)left.textContent=money(Math.max(0,(Number(modal.dataset.remainingAmount)||0)-selected));
  const submit=modal.querySelector('#progressive-submit');if(submit)submit.disabled=selected<=0.005;
}
async function openProgressivePayment(){
  const order=await prepareOrderForProgressivePayment();if(!order)return;
  let progress;
  try{
    const r=await posFunction({action:'order_payment_progress',restaurantId:state.restaurant.id,orderId:order.id});
    progress=r;
  }catch(error){state.error=error.message||String(error);render();return}

  const remainingItems=(progress.items||[]).filter(x=>Number(x.remainingQty)>0.0005);
  if(!remainingItems.length){uiAlert('Cette note est déjà entièrement répartie.');return}
  closeProgressiveModal();

  const modal=document.createElement('div');
  modal.id='progressive-payment-modal';modal.className='modal-overlay';modal.dataset.remainingAmount=String(progress.remainingAmount||0);
  const previous=(progress.payments||[]).filter(p=>p.metadata?.splitType==='progressive_items');
  const previousHtml=previous.length?'<div class="progressive-history"><h3>Déjà encaissé</h3>'+previous.map(p=>'<button class="secondary" data-reprint-progress="'+p.id+'">'+esc(p.metadata?.splitLabel||'Part')+' · '+money(p.amount)+' · '+esc(p.receipt_number||'')+'</button>').join('')+'</div>':'';
  const rows=remainingItems.map(i=>'<div class="progressive-item" data-progress-item-row data-item-id="'+esc(i.id)+'" data-remaining-qty="'+Number(i.remainingQty||0)+'" data-remaining-amount="'+Number(i.remainingAmount||0)+'"><div><strong>'+esc(i.name_snapshot)+'</strong><small>Reste '+Number(i.remainingQty||0)+' · '+money(i.remainingAmount)+'</small></div><input data-progress-qty type="number" min="0" max="'+Number(i.remainingQty||0)+'" step="0.001" value="0"></div>').join('');
  modal.innerHTML='<div class="progressive-dialog"><div class="split-dialog-head"><div><h2>Encaisser une personne</h2><p>'+esc(order.table_label||order.service_type||'Commande')+' · reste '+money(progress.remainingAmount)+'</p></div><button class="split-close" id="progressive-close">×</button></div>'
    +previousHtml
    +'<div class="progressive-form"><label>Nom / repère<input id="progressive-label" value="Personne '+(previous.length+1)+'"></label><label>Paiement<select id="progressive-method"><option value="cash">Espèces</option><option value="card">Carte</option><option value="twint">TWINT</option><option value="voucher">Bon</option><option value="invoice">Facture</option></select></label><label>Pourboire<input id="progressive-tip" inputmode="decimal" value="0.00"></label><button class="secondary" id="progressive-take-rest">Prendre tout le reste</button></div>'
    +'<div class="progressive-items">'+rows+'</div>'
    +'<div class="progressive-summary"><div><span>Cette personne</span><strong id="progressive-selected-total">'+money(0)+'</strong></div><div><span>Restera après paiement</span><strong id="progressive-after-total">'+money(progress.remainingAmount)+'</strong></div></div>'
    +'<div class="split-footer"><button class="secondary" id="progressive-cancel">Annuler</button><button class="primary" id="progressive-submit" disabled>Encaisser cette personne</button></div></div>';
  document.body.appendChild(modal);translateDom(modal);document.body.classList.add('modal-open');

  modal.querySelector('#progressive-close')?.addEventListener('click',closeProgressiveModal);
  modal.querySelector('#progressive-cancel')?.addEventListener('click',closeProgressiveModal);
  modal.querySelectorAll('[data-progress-qty]').forEach(x=>x.addEventListener('input',updateProgressiveTotal));
  modal.querySelector('#progressive-take-rest')?.addEventListener('click',()=>{
    modal.querySelectorAll('[data-progress-item-row]').forEach(row=>{const i=row.querySelector('[data-progress-qty]');if(i)i.value=row.dataset.remainingQty||'0'});updateProgressiveTotal();
  });
  modal.querySelectorAll('[data-reprint-progress]').forEach(b=>b.addEventListener('click',()=>{const p=previous.find(x=>x.id===b.dataset.reprintProgress);if(p)printProgressivePayment(progress.order,p)}));
  modal.querySelector('#progressive-submit')?.addEventListener('click',async()=>{
    const selections=[];
    for(const row of modal.querySelectorAll('[data-progress-item-row]')){
      const q=splitQty(row.querySelector('[data-progress-qty]')?.value);
      if(q>0)selections.push({itemId:row.dataset.itemId,quantity:q});
    }
    if(!selections.length)return;
    const label=modal.querySelector('#progressive-label')?.value?.trim()||('Personne '+(previous.length+1));
    const method=modal.querySelector('#progressive-method')?.value||'cash';
    const tip=parseMoneyInput(modal.querySelector('#progressive-tip')?.value||'0');
    const submit=modal.querySelector('#progressive-submit');if(submit)submit.disabled=true;
    try{
      const device=await ensureDevice(),eventId=uuid();
      const r=await posFunction({
        action:'pay_allocated_group',restaurantId:state.restaurant.id,orderId:order.id,clientEventId:eventId,
        deviceId:device.id,cashSessionId:state.cashSession.id,label,method,selections,
        tipAmount:Number.isFinite(tip)&&tip>=0?tip:0,provider:'',providerReference:'',occurredAt:new Date().toISOString()
      });
      const paid=r.payment;
      closeProgressiveModal();
      await Promise.all([refreshFloorData(),refreshReceipts()]);
      state.cart=[];state.activeOrderId=null;state.activeTableId=null;state.tableLabel='';state.view=paid?.orderStatus==='paid'?'tickets':'floor';
      state.error=paid?.orderStatus==='paid'
        ?'Addition entièrement soldée.'
        :label+' encaissé · reste '+money(paid?.remainingAmount)+'.';
      render();
      if(paid&&await uiConfirm({title:t('printPaymentReceipt'),message:String(paid.paymentReceiptNumber||''),confirmLabel:t('print')}))printProgressivePayment(order,paid);
    }catch(error){
      state.error=error.message||String(error);if(submit)submit.disabled=false;render();closeProgressiveModal();
    }
  });
  updateProgressiveTotal();
}
async function splitCheckout(){
  if(!state.cart.length||!state.cashSession||state.cashSession.status!=='open')return;
  if(standardPaymentBlocked()){uiAlert(progressivePaymentActive()?'Un paiement progressif est déjà en cours. Utilisez « Encaisser une personne ».':'Envoyez d’abord les nouveaux articles en production.');return}
  const raw=await uiPrompt({title:t('splitCount'),label:t('splitCount'),value:'2',type:'number',inputMode:'numeric',min:'2',max:'6',step:'1'});if(raw===null)return;
  const count=Math.max(2,Math.min(6,Math.trunc(Number(raw)||0)));if(count<2){uiAlert(t('splitInvalid'));return}
  const total=Math.round(cartTotal()*100)/100;
  const payments=[];let remaining=total;
  for(let i=0;i<count;i++){
    const suggested=i===count-1?remaining:Math.floor((total/count)*100)/100;
    const part=await uiFields({title:t('splitCount')+' '+(i+1)+'/'+count,message:money(remaining),fields:[
      {name:'amount',label:t('partAmount'),value:suggested.toFixed(2),type:'number',inputMode:'decimal',min:'0.01',max:String(remaining),step:'0.01',required:true},
      {name:'method',label:t('paymentMethod'),type:'select',value:i===0?'cash':'card',options:[{value:'cash',label:t('cashMethod')},{value:'card',label:t('cardMethod')},{value:'twint',label:t('twintMethod')}]}
    ]});if(!part)return;
    const amount=parseMoneyInput(part.amount);if(!Number.isFinite(amount)||amount<=0||amount>remaining+0.01){uiAlert(t('invalidAmount'));return}
    const method=normalizePaymentMethod(part.method);if(!method){uiAlert(t('paymentMethod'));return}
    const tip=await askTip('0.00');if(tip===null)return;
    payments.push({method,amount,tipAmount:tip,provider:'',providerReference:''});
    remaining=Math.round((remaining-amount)*100)/100;
  }
  if(Math.abs(remaining)>0.01){uiAlert(t('splitTotalMismatch'));return}
  const device=await ensureDevice(),now=new Date(),orderId=state.activeOrderId||uuid(),saveEventId=uuid(),payEventId=uuid();
  const existing=currentServerOrder();
  if(!existing||existing.status==='open'){
    const order=buildOpenOrder(orderId,saveEventId);order.deviceId=device.id;
    await queuePut(queuedItem('save_open_order',state.restaurant.id,{order},{clientEventId:saveEventId,queuedAt:now.toISOString()}));
    state.openOrders=[localOpenOrder(order,'payment_pending'),...state.openOrders.filter(x=>x.id!==orderId)];
  }
  await queuePut(queuedItem('settle_open_order_split',state.restaurant.id,{orderId,clientEventId:payEventId,deviceId:device.id,cashSessionId:state.cashSession.id,payments,occurredAt:now.toISOString()},{clientEventId:payEventId,queuedAt:new Date(now.getTime()+1).toISOString()}));
  state.cart=[];state.activeOrderId=null;state.activeTableId=null;state.tableLabel='';state.view='floor';
  await saveFloorCache();await updateQueueCount();render();flushQueue().catch(()=>{});
}
async function refundReceipt(receipt){
  if(!state.online){uiAlert(t('refundNeedsNetwork'));return}
  if(!state.cashSession||state.cashSession.status!=='open'){uiAlert(t('openCashBeforeRefund'));return}
  const refunds=Array.isArray(receipt.refunds)?receipt.refunds:[];
  const reserved=refunds.filter(r=>['completed','pending_external'].includes(r.status)).reduce((s,r)=>s+Number(r.amount||0),0);
  const remaining=Math.max(0,Math.round((Number(receipt.total||0)-reserved)*100)/100);
  if(remaining<=0){uiAlert(t('alreadyRefunded'));return}
  const defaultMethod=receipt.payments?.[0]?.method||'cash';
  const form=await uiFields({title:t('refundTitle'),fields:[
    {name:'amount',label:t('refundAmount'),value:remaining.toFixed(2),type:'number',inputMode:'decimal',min:'0.01',max:String(remaining),step:'0.01',required:true},
    {name:'method',label:t('refundMethod'),type:'select',value:defaultMethod,options:[{value:'cash',label:t('cashMethod')},{value:'card',label:t('cardMethod')},{value:'twint',label:t('twintMethod')}]},
    {name:'reason',label:t('refundReason'),required:true}
  ],danger:true});if(!form)return;
  const amount=parseMoneyInput(form.amount);if(!Number.isFinite(amount)||amount<=0||amount>remaining+0.001){uiAlert(t('invalidAmount'));return}
  const method=normalizePaymentMethod(form.method);if(!method){uiAlert(t('refundMethod'));return}
  const reason=String(form.reason||'');if(!reason.trim())return;
  const tip=0;
  const device=await ensureDevice(),eventId=uuid();
  try{
    const r=await posFunction({
      action:'refund_order',restaurantId:state.restaurant.id,orderId:receipt.id,clientEventId:eventId,
      cashSessionId:state.cashSession.id,deviceId:device.id,method,amount,tipAmount:tip,reason:reason.trim(),
      provider:method==='cash'?'':'external',providerReference:'',occurredAt:new Date().toISOString()
    });
    await refreshReceipts();
    state.error=r.refund?.refundStatus==='pending_external'
      ?'Remboursement enregistré : confirmation du terminal/prestataire encore nécessaire.'
      :'Remboursement enregistré.';
    render();
  }catch(error){state.error=error.message||String(error);render()}
}
async function confirmRefund(refundId,success){
  if(!state.online||!isManager())return;
  const ref=success?await uiPrompt({title:t('providerReference'),label:t('providerReference'),message:t('optional'),value:''}):'';if(success&&ref===null)return;
  try{
    await posFunction({action:'confirm_external_refund',restaurantId:state.restaurant.id,refundId,success,providerReference:ref||''});
    await refreshReceipts();state.error=success?'Remboursement externe confirmé.':'Remboursement externe marqué en échec.';render();
  }catch(error){state.error=error.message||String(error);render()}
}
function applyLocalProductionSend(order,newLines=[]){
  const existingItems=Array.isArray(order.items)?order.items.map(x=>({...x})):[];
  const appended=newLines.map(x=>({
    id:x.id,order_id:order.id,catalog_item_id:x.catalog_item_id||null,recipe_id:x.recipe_id||null,
    name_snapshot:x.name,sku_snapshot:x.sku||'',quantity:Number(x.quantity)||1,unit_price:Number(x.unit_price)||0,
    tax_rate:Number(x.tax_rate)||0,line_total:(Number(x.quantity)||1)*(Number(x.unit_price)||0),
    station_snapshot:x.production_station||'kitchen',kitchen_status:'new',note:x.note||null
  }));
  const all=[...existingItems,...appended];
  const sentIds=[];
  for(const item of all){
    if((item.station_snapshot||'kitchen')!=='none'&&item.kitchen_status==='new'){
      item.kitchen_status='sent';sentIds.push(String(item.id));
    }
  }
  const nextStatus=sentIds.length&&['open','served'].includes(order.status)?'sent':order.status;
  const next={...order,status:nextStatus,items:all,updated_at:new Date().toISOString()};
  state.openOrders=[next,...state.openOrders.filter(x=>x.id!==order.id)];
  state.productionQueue=[next,...state.productionQueue.filter(x=>x.id!==order.id)];
  return{order:next,sentIds};
}
async function persistLocalProduction(){
  await saveFloorCache();
  if(state.restaurant)await kvSet(productionKey(state.restaurant.id),state.productionQueue);
}
async function sendCurrentOrderProduction(){
  const order=currentServerOrder();
  if(!order){uiAlert('Enregistrez d’abord la note avant de l’envoyer en production.');return}
  if(!state.online){
    try{
      const now=Date.now(),newLines=order.status==='open'?[]:deltaLines();
      if(order.status!=='open'&&!newLines.length){uiAlert('Aucun nouvel article à envoyer.');return}
      if(newLines.length){
        const appendEventId=uuid();
        await queueCommand('append_order_items',{
          orderId:order.id,clientEventId:appendEventId,lines:newLines,occurredAt:new Date(now).toISOString()
        },{clientEventId:appendEventId,queuedAt:new Date(now).toISOString()});
      }
      await queueCommand('send_to_production',{orderId:order.id},{queuedAt:new Date(now+1).toISOString()});
      const local=applyLocalProductionSend(order,newLines);
      state.cart=state.cart.map(x=>({...x,locked:true,delta:false}));
      await persistLocalProduction();
      await autoPrintProductionItems(order.id,local.sentIds);
      state.error='Envoi Cuisine/Bar enregistré hors ligne — synchronisation automatique au retour du réseau.';
      render();return;
    }catch(error){state.error=error.message||String(error);render();return}
  }
  try{
    if(order.status==='open'){
      const device=await ensureDevice(),eventId=uuid(),payload=buildOpenOrder(order.id,eventId);payload.deviceId=device.id;
      await posFunction({action:'save_open_order',restaurantId:state.restaurant.id,order:payload});
    }else{
      const lines=deltaLines();
      if(!lines.length){uiAlert('Aucun nouvel article à envoyer.');return}
      await posFunction({
        action:'append_order_items',restaurantId:state.restaurant.id,orderId:order.id,
        clientEventId:uuid(),lines,occurredAt:new Date().toISOString()
      });
    }
    const sent=await posFunction({action:'send_to_production',restaurantId:state.restaurant.id,orderId:order.id});
    state.cart=state.cart.map(x=>({...x,locked:true,delta:false}));
    await Promise.all([refreshFloorData(),refreshProductionQueue()]);
    await autoPrintProductionItems(order.id,sent.order?.sentItemIds||[]);
    state.error=Number(sent.order?.sentItems||0)>0?'Nouveaux articles envoyés en production.':'Commande déjà en production.';
    render();
  }catch(error){state.error=error.message||String(error);render()}
}
async function updateProductionItem(itemId,status,{renderAfter=true,refreshAfter=true}={}){
  if(!state.online){
    const patchItems=order=>({...order,items:(order.items||[]).map(i=>String(i.id)===String(itemId)?{...i,kitchen_status:status}:i),updated_at:new Date().toISOString()});
    state.productionQueue=state.productionQueue.map(patchItems);
    state.openOrders=state.openOrders.map(patchItems);
    await queueCommand('update_production_item',{itemId,status});
    await persistLocalProduction();
    state.error='Statut production enregistré hors ligne.';
    if(renderAfter)render();return true;
  }
  try{
    await posFunction({action:'update_production_item',restaurantId:state.restaurant.id,itemId,status});
    if(refreshAfter)await Promise.all([refreshProductionQueue(),refreshFloorData()]);
    state.error='';if(renderAfter)render();return true;
  }catch(error){state.error=error.message||String(error);recordDiagnostic('production.update_error',{status,message:state.error});if(renderAfter)render();return false}
}

function activeLayout(){
  return publishedLayout(state.bootstrap);
}
function ensureLayoutSelection(layout){
  const doc=layout?.document;if(!doc)return;
  const pages=[...(doc.pages||[])].sort((a,b)=>(Number(a.sortOrder)||0)-(Number(b.sortOrder)||0));
  if(!pages.some(p=>String(p.id)===String(state.layoutPageId)))state.layoutPageId=String(pages[0]?.id||'');
  const cats=['all','favorites',...categoriesForPage(doc,state.layoutPageId).map(c=>String(c.id))];
  if(!cats.includes(String(state.layoutCategoryId)))state.layoutCategoryId='all';
}
function layoutVisibleButtons(layout){
  const doc=layout?.document;if(!doc)return[];
  ensureLayoutSelection(layout);
  return pageButtons(doc,state.layoutPageId).filter(b=>{
    if(b.hidden)return false;
    if(state.layoutCategoryId==='favorites')return !!b.favorite;
    if(state.layoutCategoryId!=='all')return String(b.categoryId||'')===String(state.layoutCategoryId);
    return true;
  });
}
function closeItemConfigurator(){
  document.querySelector('#item-configurator')?.remove();
  document.body.classList.remove('modal-open');
}
function addConfiguredLine(product,button,modifiers,menu){
  if(progressivePaymentActive()){uiAlert('Paiement progressif en cours : aucun nouvel article ne peut être ajouté à cette note.');return}
  const supplement=modifierPriceDelta(modifiers);
  const basePrice=menu&&Number(menu.price)>0?Number(menu.price):Number(product.price)||0;
  const line={
    id:'cart:'+uuid(),catalog_item_id:product.id,recipe_id:product.recipe_id||null,sku:product.sku||'',
    name:menu?.name||button?.label||product.name,price:Math.round((basePrice+supplement)*100)/100,
    tax_rate:Number(product.tax_rate)||0,
    production_station:button?.station||product.production_station||'kitchen',
    qty:1,quick:false,locked:false,delta:orderLocked(),modifiers:modifiers||[],
    note:modifierSummary(modifiers||[]),layout_button_id:button?.id||'',layout_version:activeLayout()?.version||0
  };
  state.cart.push(line);closeItemConfigurator();render();
}
function openItemConfigurator(buttonId){
  const layout=activeLayout(),doc=layout?.document,catalog=state.bootstrap?.catalog||[];
  if(!doc)return;
  const button=buttonById(doc,buttonId);if(!button||button.hidden)return;
  if(button.unavailable){uiAlert('Article temporairement indisponible.');return}
  const product=productById(catalog,button.productId);if(!product){uiAlert('Produit introuvable dans le catalogue publié.');return}
  const config=configurationForButton(doc,button,catalog);
  if(!config.groups.length&&!config.menu){addConfiguredLine(product,button,[],null);return}

  closeItemConfigurator();
  const modal=document.createElement('div');modal.id='item-configurator';modal.className='modal-overlay';
  const groupHtml=config.groups.map(group=>{
    if(group.type==='notes'){
      return '<fieldset class="modifier-group" data-group="'+esc(group.id)+'"><legend>'+esc(group.name)+(group.required?' *':'')+'</legend><textarea name="note_'+esc(group.id)+'" rows="2" placeholder="Note…"></textarea></fieldset>';
    }
    const single=Number(group.max||1)===1;
    return '<fieldset class="modifier-group" data-group="'+esc(group.id)+'"><legend>'+esc(group.name)+(group.required?' *':'')+' <small>'+Number(group.min||0)+'–'+Number(group.max||1)+'</small></legend>'
      +(group.options||[]).map(opt=>'<label class="modifier-option"><input type="'+(single?'radio':'checkbox')+'" name="mod_'+esc(group.id)+(single?'':'_'+esc(opt.id))+'" value="'+esc(opt.id)+'"><span>'+esc(opt.name)+'</span><strong>'+(Number(opt.priceDelta)?'+'+money(opt.priceDelta):'')+'</strong></label>').join('')
      +'</fieldset>';
  }).join('');
  const menuHtml=config.menu?'<section class="menu-config"><h3>'+esc(config.menu.name)+'</h3>'+(config.menu.choices||[]).map(choice=>{
    const single=Number(choice.max||1)===1;
    return '<fieldset class="modifier-group" data-menu-choice="'+esc(choice.id)+'"><legend>'+esc(choice.name)+(choice.required?' *':'')+'</legend>'
      +(choice.products||[]).map(p=>'<label class="modifier-option"><input type="'+(single?'radio':'checkbox')+'" name="menu_'+esc(choice.id)+(single?'':'_'+esc(p.id))+'" value="'+esc(p.id)+'"><span>'+esc(p.name)+'</span><strong>'+money(p.price)+'</strong></label>').join('')
      +'</fieldset>';
  }).join('')+'</section>':'';

  modal.innerHTML='<form class="item-config-dialog" id="item-config-form"><div class="split-dialog-head"><div><h2>'+esc(config.menu?.name||button.label||product.name)+'</h2><p>'+money(config.menu?.price||product.price)+' · '+esc(button.station||product.production_station||'kitchen')+'</p></div><button type="button" class="split-close" id="item-config-close">×</button></div><div class="item-config-body">'+menuHtml+groupHtml+'</div><div class="split-footer"><button type="button" class="secondary" id="item-config-cancel">Annuler</button><button class="primary">Ajouter à la commande</button></div></form>';
  document.body.appendChild(modal);translateDom(modal);document.body.classList.add('modal-open');
  modal.querySelector('#item-config-close')?.addEventListener('click',closeItemConfigurator);
  modal.querySelector('#item-config-cancel')?.addEventListener('click',closeItemConfigurator);
  modal.querySelector('#item-config-form')?.addEventListener('submit',e=>{
    e.preventDefault();const form=new FormData(e.currentTarget),mods=[];

    for(const group of config.groups){
      if(group.type==='notes'){
        const note=String(form.get('note_'+group.id)||'').trim();
        if(group.required&&!note){uiAlert('Le champ « '+group.name+' » est obligatoire.');return}
        if(note)mods.push({groupId:group.id,groupName:group.name,type:'notes',station:group.station||'',note,options:[]});
        continue;
      }
      const selected=(group.options||[]).filter(opt=>{
        if(Number(group.max||1)===1)return String(form.get('mod_'+group.id)||'')===String(opt.id);
        return form.get('mod_'+group.id+'_'+opt.id)==='on';
      });
      const min=Math.max(group.required?1:0,Number(group.min)||0),max=Math.max(min,Number(group.max)||1);
      if(selected.length<min||selected.length>max){uiAlert(group.name+' : choisissez entre '+min+' et '+max+' option(s).');return}
      if(selected.length)mods.push({groupId:group.id,groupName:group.name,type:group.type,station:group.station||'',options:selected.map(opt=>({optionId:opt.id,name:opt.name,priceDelta:Number(opt.priceDelta)||0,station:opt.station||group.station||'',ingredientId:opt.ingredientId||'',omitIngredient:!!opt.omitIngredient}))});
    }

    if(config.menu){
      const choices=[];
      for(const choice of config.menu.choices||[]){
        const selected=(choice.products||[]).filter(p=>{
          if(Number(choice.max||1)===1)return String(form.get('menu_'+choice.id)||'')===String(p.id);
          return form.get('menu_'+choice.id+'_'+p.id)==='on';
        });
        const min=Math.max(choice.required?1:0,Number(choice.min)||0),max=Math.max(min,Number(choice.max)||1);
        if(selected.length<min||selected.length>max){uiAlert(choice.name+' : choisissez entre '+min+' et '+max+' élément(s).');return}
        choices.push({choiceId:choice.id,name:choice.name,required:!!choice.required,products:selected.map(p=>({productId:p.id,name:p.name,recipeId:p.recipe_id||null,price:Number(p.price)||0,taxRate:Number(p.tax_rate)||0,station:p.production_station||'kitchen'}))});
      }
      mods.push({kind:'menu',menuId:config.menu.id,menuName:config.menu.name,choices});
    }
    addConfiguredLine(product,button,mods,config.menu);
  });
}
function addItem(item){
  if(progressivePaymentActive()){uiAlert('Paiement progressif en cours : aucun nouvel article ne peut être ajouté à cette note.');return}
  if(orderLocked()){
    const catalogId=item.quick?null:item.id;
    const line=state.cart.find(x=>x.delta&&x.catalog_item_id===catalogId&&x.name===item.name);
    if(line)line.qty+=1;
    else state.cart.push({
      id:'delta:'+uuid(),catalog_item_id:catalogId,recipe_id:item.recipe_id||null,sku:item.sku||'',name:item.name,
      price:Number(item.price)||0,tax_rate:Number(item.tax_rate)||0,production_station:item.production_station||'kitchen',
      qty:1,quick:!!item.quick,locked:false,delta:true
    });
  }else{
    const line=state.cart.find(x=>x.id===item.id&&!x.locked);
    if(line)line.qty+=1;
    else state.cart.push({
      id:item.id,catalog_item_id:item.quick?null:item.id,recipe_id:item.recipe_id||null,sku:item.sku||'',name:item.name,
      price:Number(item.price)||0,tax_rate:Number(item.tax_rate)||0,production_station:item.production_station||'kitchen',
      qty:1,quick:!!item.quick,locked:false,delta:false
    });
  }
  render();
}
async function addQuickItem(){
  const form=await uiFields({title:t('quickItemTitle'),fields:[{name:'name',label:t('itemName'),required:true},{name:'price',label:t('priceGross'),value:'0.00',type:'number',inputMode:'decimal',min:'0',step:'0.01',required:true}]});if(!form?.name?.trim())return;
  const price=Number(String(form.price).replace(',','.'));if(!Number.isFinite(price)||price<0){uiAlert(t('invalidPrice'));return}
  addItem({id:'quick:'+uuid(),name:String(form.name).trim(),price,tax_rate:8.1,quick:true});
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
function changeQty(id,delta){const line=state.cart.find(x=>x.id===id);if(!line)return;if(line.locked){uiAlert(t('itemLocked'));return}line.qty+=delta;if(line.qty<=0)state.cart=state.cart.filter(x=>x.id!==id);render()}
const cartTotal=()=>state.cart.reduce((s,x)=>s+x.qty*x.price,0);

async function checkout(method){
  if(!state.cart.length||!state.restaurant||!state.cashSession||state.cashSession.status!=='open')return;
  if(standardPaymentBlocked()){uiAlert(progressivePaymentActive()?'Un paiement progressif est déjà en cours. Utilisez « Encaisser une personne ».':'Envoyez d’abord les nouveaux articles en production.');return}
  const tip=await askTip('0.00');if(tip===null)return;
  const device=await ensureDevice(),now=new Date();

  if(state.activeTableId||state.activeOrderId||state.serviceType==='dine_in'){
    const orderId=state.activeOrderId||uuid(),saveEventId=uuid(),settleEventId=uuid();
    const existing=currentServerOrder();
    if(!existing||existing.status==='open'){
      const order=buildOpenOrder(orderId,saveEventId);order.deviceId=device.id;
      await queuePut(queuedItem('save_open_order',state.restaurant.id,{order},{clientEventId:saveEventId,queuedAt:now.toISOString()}));
      const local=localOpenOrder(order,'payment_pending');
      state.openOrders=[local,...state.openOrders.filter(x=>x.id!==orderId)];
    }
    await queuePut(queuedItem('settle_open_order',state.restaurant.id,{orderId,clientEventId:settleEventId,deviceId:device.id,cashSessionId:state.cashSession.id,paymentMethod:method,paymentProvider:'',paymentReference:'',tipAmount:tip,occurredAt:now.toISOString()},{clientEventId:settleEventId,queuedAt:new Date(now.getTime()+1).toISOString()}));
  }else{
    const orderId=uuid(),eventId=uuid();
    const order={
      id:orderId,clientEventId:eventId,deviceId:device.id,cashSessionId:state.cashSession.id,
      businessDate:state.cashSession.businessDate,serviceType:state.serviceType,tableLabel:state.tableLabel,
      covers:Number(state.covers)||0,currency:state.restaurant.currency||'CHF',lines:orderLines(),
      paymentMethod:method,paymentProvider:'',paymentReference:'',tipAmount:tip,occurredAt:now.toISOString()
    };
    await queuePut(queuedItem('commit_order',state.restaurant.id,{order},{clientEventId:eventId,queuedAt:now.toISOString()}));
  }

  state.cart=[];state.activeOrderId=null;state.activeTableId=null;state.tableLabel='';state.view='floor';
  await saveFloorCache();await updateQueueCount();render();
  if(state.online)await flushQueue();else state.error='Vente enregistrée hors ligne — synchronisation automatique au retour du réseau.';
  render();
}


function syncActionLabel(action){
  return ({
    open_cash_session:'Ouverture caisse',
    close_cash_session:'Clôture caisse',
    commit_order:'Vente comptoir',
    save_open_order:'Enregistrement note',
    append_order_items:'Ajout articles',
    send_to_production:'Envoi Cuisine/Bar',
    update_production_item:'Statut production',
    settle_open_order:'Encaissement note',
    settle_open_order_split:'Paiement fractionné'
  })[action]||action||'Action';
}
function syncView(){
  const rows=(state.pendingQueue||[]).filter(x=>x.restaurantId===state.restaurant?.id);
  const last=state.syncLastRun?new Date(state.syncLastRun).toLocaleString('fr-CH'):'—';
  return `<div class="shell">${topbar()}${state.error?'<div class="notice banner">'+esc(state.error)+'</div>':''}
    <main class="sync-page">
      <div class="floor-head"><div><h2>Synchronisation</h2><p>${rows.length} action(s) locale(s) à envoyer · dernière tentative ${esc(last)}</p></div><div class="terminal-head-actions"><button class="secondary" id="sync-refresh">Actualiser</button><button class="primary compact" id="sync-retry" ${!state.online||!rows.length?'disabled':''}>Relancer maintenant</button></div></div>
      <div class="sync-health ${state.online?'online':'offline'}"><strong>${state.online?'Connexion disponible':'Mode hors ligne'}</strong><span>${rows.length?'Les actions restent conservées localement dans SQLite jusqu’à confirmation serveur.':'Aucune action en attente.'}</span></div>
      <section class="sync-list">${rows.length?rows.map(item=>`<article class="sync-card">
        <div class="sync-card-head"><div><strong>${esc(syncActionLabel(item.action))}</strong><small>${new Date(item.queued_at).toLocaleString('fr-CH')}</small></div><span class="sync-attempts">${Number(item.attempts||0)} tentative(s)</span></div>
        <div class="sync-meta"><span>Opérateur <strong>${esc(item.operatorName||'Compte Hub')}</strong></span><span>ID <strong>${esc(String(item.client_event_id||'').slice(0,8))}</strong></span></div>
        ${item.last_error?'<div class="sync-error">'+esc(item.last_error)+'</div>':''}
        ${item.last_attempt_at?'<small class="muted">Dernier essai : '+esc(new Date(item.last_attempt_at).toLocaleString('fr-CH'))+'</small>':''}
      </article>`).join(''):'<div class="empty"><h3>Tout est synchronisé</h3><p>La caisse locale et le serveur sont à jour pour ce restaurant.</p></div>'}</section>
    </main></div>`;
}


const academyOrgId=()=>state.restaurant?.organization_id||state.identity?.memberships?.[0]?.organization_id||'';
const academyUserId=()=>String(state.identity?.user?.id||'local');
const academyLocale=()=>['fr','en','de','it'].includes(state.academyLocale)?state.academyLocale:'fr';
function academyChromeText(){
  return{
    fr:{contextHelp:'Aide contextuelle',contextCopied:'Contexte technique copié.'},
    en:{contextHelp:'Contextual help',contextCopied:'Technical context copied.'},
    de:{contextHelp:'Kontexthilfe',contextCopied:'Technischer Kontext kopiert.'},
    it:{contextHelp:'Aiuto contestuale',contextCopied:'Contesto tecnico copiato.'}
  }[academyLocale()];
}
const posAcademyRole=()=>isManager()?'manager':(['kitchen','bar'].includes(state.operator?.role)?'kitchen':'server');
function posAcademyAutoRows(){
  const rows=[],now=new Date().toISOString(),add=(id,yes)=>{if(yes)rows.push({application:'pos',topic_id:id,content_version:ACADEMY_CONTENT_VERSION,status:'completed',step_index:99,updated_at:now,metadata:{auto:true}})};
  add('pos-first-use',!!state.restaurant&&!!state.bootstrap);
  add('pos-operator',!state.operatorRequired||!!state.operator);
  add('pos-cash-session',!!state.cashSession);
  add('pos-printers',(state.printers||[]).length>0);
  add('pos-terminals',(state.terminals||[]).length>0);
  return rows;
}
function currentPosAcademyProgress(){return mergeAcademyProgress(mergeAcademyProgress(loadLocalAcademyProgress(academyUserId()),state.academy.progress),posAcademyAutoRows())}
async function refreshPosAcademy(){
  if(state.academy.loading)return;state.academy.loading=true;
  try{
    const org=academyOrgId();if(currentSession()&&org){
      const data=await academyFunction({action:'load',organizationId:org,restaurantId:state.restaurant?.id||''});
      state.academy.progress=mergeAcademyProgress(loadLocalAcademyProgress(academyUserId()),data.progress||[]);
      state.academy.managerVisibility=!!data.managerVisibility;
      if(data.manager&&data.managerVisibility){
        const team=await academyFunction({action:'manager_progress',organizationId:org,restaurantId:state.restaurant?.id||''}).catch(()=>({rows:[]}));
        state.academy.managerRows=team.rows||[];
      }
    }
  }catch{}finally{state.academy.loading=false;state.academy.loaded=true;if(state.view==='academy')render()}
}
async function savePosAcademyTopic(topicId,status,stepIndex=null){
  const topic=academyTopic(topicId);if(!topic)return;
  const resolvedStep=stepIndex==null?(status==='completed'?topic.steps.length:0):Math.max(0,Math.min(topic.steps.length,Math.trunc(Number(stepIndex)||0)));
  const row={application:topic.application,topic_id:topic.id,content_version:ACADEMY_CONTENT_VERSION,status,step_index:resolvedStep,updated_at:new Date().toISOString(),metadata:{}};
  saveLocalAcademyProgress(academyUserId(),row);state.academy.progress=mergeAcademyProgress(state.academy.progress,[row]);render();
  const org=academyOrgId();if(currentSession()&&org)try{await academyFunction({action:'save',organizationId:org,restaurantId:state.restaurant?.id||'',application:topic.application,topicId:topic.id,contentVersion:ACADEMY_CONTENT_VERSION,status:row.status,stepIndex:row.step_index,metadata:{}})}catch{}
}
async function trackTrainingProgress(stepIndex,status='in_progress'){
  const topic=academyTopic('pos-training');if(!topic)return;
  const resolvedStep=Math.max(0,Math.min(topic.steps.length,Math.trunc(Number(stepIndex)||0)));
  const row={application:'pos',topic_id:'pos-training',content_version:ACADEMY_CONTENT_VERSION,status,step_index:resolvedStep,updated_at:new Date().toISOString(),metadata:{training:true}};
  saveLocalAcademyProgress(academyUserId(),row);
  state.academy.progress=mergeAcademyProgress(state.academy.progress,[row]);
  const org=academyOrgId();
  if(currentSession()&&org)try{
    await academyFunction({action:'save',organizationId:org,restaurantId:state.restaurant?.id||'',application:'pos',topicId:'pos-training',contentVersion:ACADEMY_CONTENT_VERSION,status,stepIndex:resolvedStep,metadata:{training:true}});
  }catch{}
}
function academyView(){
  ensureAcademyStyles();if(!state.academy.loaded&&!state.academy.loading)setTimeout(()=>refreshPosAcademy(),0);
  return '<div class="shell academy-pos-shell"><div class="academy-training-banner" style="background:#3d342e"><button class="secondary" id="academy-back">← POS</button><strong>ReMaPro Academy</strong><select id="academy-locale"><option value="fr">FR</option><option value="en">EN</option><option value="de">DE</option><option value="it">IT</option></select></div><main class="academy-pos-main">'+renderAcademyCenter({application:'pos',scope:state.academy.scope,locale:academyLocale(),query:state.academy.query,role:state.academy.role,module:state.academy.module,progressRows:currentPosAcademyProgress(),selectedTopic:state.academy.selectedTopic,selectedPath:state.academy.selectedPath,troubleshoot:state.academy.troubleshoot,manager:isManager(),canManageVisibility:posOrgAdmin(),managerVisibility:state.academy.managerVisibility,managerRows:state.academy.managerRows})+'</main></div>';
}
function resetTraining(){state.training={opened:false,table:false,cart:[],modified:false,sent:false,paid:false,closed:false,payment:''}}
const trainingProducts=[
  {id:'demo-burger',name:'Burger ReMaPro',price:18.5,station:'kitchen'},
  {id:'demo-fries',name:'Frites',price:6,station:'kitchen'},
  {id:'demo-water',name:'Eau minérale',price:4.5,station:'bar'},
  {id:'demo-coffee',name:'Café',price:4.2,station:'bar'}
];
function trainingTotal(){return(state.training.cart||[]).reduce((sum,x)=>sum+x.price*x.qty,0)}
function trainingView(){
  ensureAcademyStyles();const tr=state.training,loc=academyLocale(),ui={
    fr:{banner:'MODE ENTRAÎNEMENT — aucune vente réelle, aucun RPC, aucun ticket réel',exit:'Quitter',title:'Entraînement ReMaPro POS',intro:'Données fictives. Recommencez autant de fois que nécessaire.',reset:'Réinitialiser',steps:['1. Ouvrir la caisse','2. Ouvrir une table','3. Saisir une commande','4. Ajouter un modificateur','5. Envoyer cuisine/bar','6. Encaisser','7. Clôturer'],done:'Terminé',todo:'À faire',simulation:'Simulation',open:'Ouvrir caisse CHF 100',table:'Ouvrir table 12 · 2 couverts',products:'Produits fictifs',modifier:'Ajouter “Cuisson à point”',send:'Envoyer cuisine/bar',empty:'Panier fictif vide.',total:'Total démo',cash:'Espèces',card:'Carte',twint:'TWINT',close:'Clôturer la caisse démo',success:'Exercice réussi.',safe:'Aucune donnée réelle n’a été créée.',stationKitchen:'Cuisine',stationBar:'Bar',productNames:['Burger ReMaPro','Frites','Eau minérale','Café'],note:'Cuisson à point'},
    en:{banner:'TRAINING MODE — no real sale, no sales RPC, no real receipt',exit:'Exit',title:'ReMaPro POS training',intro:'Fictitious data. Repeat the exercise as often as needed.',reset:'Reset',steps:['1. Open cash','2. Open a table','3. Enter an order','4. Add a modifier','5. Send kitchen/bar','6. Take payment','7. Close cash'],done:'Completed',todo:'To do',simulation:'Simulation',open:'Open cash CHF 100',table:'Open table 12 · 2 covers',products:'Training products',modifier:'Add “Medium cooking”',send:'Send kitchen/bar',empty:'Training cart is empty.',total:'Demo total',cash:'Cash',card:'Card',twint:'TWINT',close:'Close demo cash',success:'Exercise completed.',safe:'No real data was created.',stationKitchen:'Kitchen',stationBar:'Bar',productNames:['ReMaPro Burger','Fries','Mineral water','Coffee'],note:'Medium cooking'},
    de:{banner:'TRAININGSMODUS — kein echter Verkauf, keine Verkaufs-RPC, kein echter Beleg',exit:'Beenden',title:'ReMaPro POS Training',intro:'Fiktive Daten. Übung beliebig oft wiederholen.',reset:'Zurücksetzen',steps:['1. Kasse öffnen','2. Tisch öffnen','3. Bestellung erfassen','4. Modifikator hinzufügen','5. Küche/Bar senden','6. Kassieren','7. Kasse schließen'],done:'Abgeschlossen',todo:'Offen',simulation:'Simulation',open:'Kasse CHF 100 öffnen',table:'Tisch 12 · 2 Gäste öffnen',products:'Trainingsprodukte',modifier:'„Medium“ hinzufügen',send:'An Küche/Bar senden',empty:'Trainingskorb ist leer.',total:'Demo-Summe',cash:'Bar',card:'Karte',twint:'TWINT',close:'Demo-Kasse schließen',success:'Übung erfolgreich.',safe:'Es wurden keine echten Daten erstellt.',stationKitchen:'Küche',stationBar:'Bar',productNames:['ReMaPro Burger','Pommes','Mineralwasser','Kaffee'],note:'Medium'},
    it:{banner:'MODALITÀ FORMAZIONE — nessuna vendita reale, nessuna RPC vendita, nessuno scontrino reale',exit:'Esci',title:'Formazione ReMaPro POS',intro:'Dati fittizi. Ripeti l’esercizio quanto necessario.',reset:'Reimposta',steps:['1. Apri cassa','2. Apri un tavolo','3. Inserisci un ordine','4. Aggiungi modificatore','5. Invia cucina/bar','6. Incassa','7. Chiudi cassa'],done:'Completato',todo:'Da fare',simulation:'Simulazione',open:'Apri cassa CHF 100',table:'Apri tavolo 12 · 2 coperti',products:'Prodotti fittizi',modifier:'Aggiungi “Cottura media”',send:'Invia cucina/bar',empty:'Carrello fittizio vuoto.',total:'Totale demo',cash:'Contanti',card:'Carta',twint:'TWINT',close:'Chiudi cassa demo',success:'Esercizio riuscito.',safe:'Nessun dato reale è stato creato.',stationKitchen:'Cucina',stationBar:'Bar',productNames:['Burger ReMaPro','Patatine','Acqua minerale','Caffè'],note:'Cottura media'}
  }[loc];
  const keys=['opened','table','cart','modified','sent','paid','closed'],steps=keys.map((k,i)=>[k,ui.steps[i]]);
  const products=trainingProducts.map((p,i)=>({...p,name:ui.productNames[i]||p.name,stationLabel:p.station==='bar'?ui.stationBar:ui.stationKitchen}));
  const cartName=x=>{const i=trainingProducts.findIndex(p=>p.id===x.id);return i>=0?(ui.productNames[i]||x.name):x.name};
  return '<div class="shell"><div class="academy-training-banner">'+ui.banner+' <button id="training-exit" class="secondary">'+ui.exit+'</button></div><main class="academy-pos-main"><div class="floor-head"><div><h1>'+ui.title+'</h1><p>'+ui.intro+'</p></div><div class="actions"><select id="training-locale"><option value="fr">FR</option><option value="en">EN</option><option value="de">DE</option><option value="it">IT</option></select><button id="training-reset" class="secondary">'+ui.reset+'</button></div></div><div class="academy-path-grid">'+steps.map(([k,label])=>'<div class="academy-path-card"><strong>'+label+'</strong><small>'+((k==='cart'?tr.cart.length>0:tr[k])?'✓ '+ui.done:ui.todo)+'</small></div>').join('')+'</div><div class="academy-training-grid"><section class="academy-training-panel"><h2>'+ui.simulation+'</h2><div class="actions"><button id="training-open" '+(tr.opened?'disabled':'')+'>'+ui.open+'</button><button id="training-table" '+(!tr.opened||tr.table?'disabled':'')+'>'+ui.table+'</button></div><h3>'+ui.products+'</h3><div class="product-grid">'+products.map(p=>'<button class="product" data-training-product="'+p.id+'" '+(!tr.table||tr.sent?'disabled':'')+'><strong>'+esc(p.name)+'</strong><small>'+esc(p.stationLabel)+'</small><span class="price">'+money(p.price)+'</span></button>').join('')+'</div><div class="actions"><button id="training-modifier" '+(!tr.cart.length||tr.sent?'disabled':'')+'>'+ui.modifier+'</button><button id="training-send" '+(!tr.cart.length||tr.sent?'disabled':'')+'>'+ui.send+'</button></div></section><aside class="academy-training-panel"><h2>Table 12</h2>'+(tr.cart.length?tr.cart.map(x=>'<div class="line"><div><strong>'+esc(cartName(x))+'</strong><small>'+x.qty+' × '+money(x.price)+(x.note?' · '+esc(x.note):'')+'</small></div></div>').join(''):'<p class="muted">'+ui.empty+'</p>')+'<div class="total-row"><span>'+ui.total+'</span><strong>'+money(trainingTotal())+'</strong></div><div class="payments"><button data-training-pay="cash" '+(!tr.sent||tr.paid?'disabled':'')+'>'+ui.cash+'</button><button data-training-pay="card" '+(!tr.sent||tr.paid?'disabled':'')+'>'+ui.card+'</button><button data-training-pay="twint" '+(!tr.sent||tr.paid?'disabled':'')+'>'+ui.twint+'</button></div><button id="training-close" class="primary wide" '+(!tr.paid||tr.closed?'disabled':'')+'>'+ui.close+'</button>'+(tr.closed?'<div class="notice"><strong>'+ui.success+'</strong> '+ui.safe+'</div>':'')+'</aside></div></main></div>';
}
function academyTourView(id){return id==='pos-floor'?'floor':id==='pos-production'?'production':id==='pos-sync'?'sync':'sale'}
function bindPosAcademy(){
  document.getElementById('academy-back')?.addEventListener('click',()=>{state.view=state.cashSession?'sale':'sale';render()});
  document.getElementById('academy-locale')?.addEventListener('change',e=>{state.academyLocale=e.target.value;localStorage.setItem('remapro-academy-lang',state.academyLocale);render()});
  const locale=document.getElementById('academy-locale');if(locale)locale.value=academyLocale();
  document.getElementById('academy-search')?.addEventListener('input',e=>{state.academy.query=e.target.value;render()});
  document.getElementById('academy-scope')?.addEventListener('change',e=>{state.academy.scope=e.target.value;state.academy.module='';render()});
  document.getElementById('academy-role')?.addEventListener('change',e=>{state.academy.role=e.target.value;render()});
  document.getElementById('academy-module')?.addEventListener('change',e=>{state.academy.module=e.target.value;render()});
  document.querySelectorAll('[data-academy-topic]').forEach(b=>b.addEventListener('click',()=>{state.academy.selectedTopic=b.dataset.academyTopic;state.academy.selectedPath='';state.academy.troubleshoot='';render()}));
  document.querySelectorAll('[data-academy-path]').forEach(b=>b.addEventListener('click',()=>{state.academy.selectedPath=b.dataset.academyPath;state.academy.selectedTopic='';state.academy.troubleshoot='';render()}));
  document.querySelectorAll('[data-academy-trouble]').forEach(b=>b.addEventListener('click',()=>{state.academy.troubleshoot=b.dataset.academyTrouble;state.academy.selectedTopic='';state.academy.selectedPath='';render()}));
  document.querySelectorAll('[data-academy-close]').forEach(b=>b.addEventListener('click',()=>{state.academy.selectedTopic='';state.academy.selectedPath='';state.academy.troubleshoot='';render()}));
  document.querySelectorAll('[data-academy-complete]').forEach(b=>b.addEventListener('click',()=>savePosAcademyTopic(b.dataset.academyComplete,'completed')));
  document.querySelectorAll('[data-academy-restart]').forEach(b=>b.addEventListener('click',()=>savePosAcademyTopic(b.dataset.academyRestart,'in_progress')));
  document.querySelectorAll('[data-academy-step]').forEach(b=>b.addEventListener('click',()=>savePosAcademyTopic(b.dataset.academyStep,b.dataset.stepStatus||'in_progress',Number(b.dataset.stepIndex)||0)));
  document.querySelectorAll('[data-academy-tour]').forEach(b=>b.addEventListener('click',()=>{const id=b.dataset.academyTour;state.academy.selectedTopic='';state.view=academyTourView(id);render();setTimeout(()=>startAcademyTour(id,{locale:academyLocale()}),40)}));
  document.getElementById('academy-training-start')?.addEventListener('click',()=>{state.trainingMode=true;resetTraining();state.view='training';render()});
  document.getElementById('academy-copy-context')?.addEventListener('click',async()=>{const safe={application:'ReMaPro POS',appVersion:APP_VERSION,academyVersion:ACADEMY_CONTENT_VERSION,screen:state.view,online:state.online,pendingSync:state.queueCount};const value=JSON.stringify(safe,null,2);try{await navigator.clipboard.writeText(value);uiAlert(academyChromeText().contextCopied)}catch{uiAlert(value)}});
  document.getElementById('academy-manager-visibility')?.addEventListener('change',async e=>{const org=academyOrgId();if(!posOrgAdmin()||!org)return;e.target.disabled=true;try{const data=await academyFunction({action:'set_manager_visibility',organizationId:org,enabled:e.target.checked});state.academy.managerVisibility=!!data.managerVisibility;state.academy.loaded=false;await refreshPosAcademy()}catch{e.target.checked=!e.target.checked}finally{e.target.disabled=false}});
}
function bindTraining(){
  document.getElementById('training-exit')?.addEventListener('click',()=>{state.trainingMode=false;state.view='academy';render()});
  document.getElementById('training-reset')?.addEventListener('click',()=>{resetTraining();render()});
  document.getElementById('training-locale')?.addEventListener('change',e=>{state.academyLocale=e.target.value;localStorage.setItem('remapro-academy-lang',state.academyLocale);render()});
  const trainingLocale=document.getElementById('training-locale');if(trainingLocale)trainingLocale.value=academyLocale();
  document.getElementById('training-open')?.addEventListener('click',()=>{state.training.opened=true;trackTrainingProgress(1).catch(()=>{});render()});
  document.getElementById('training-table')?.addEventListener('click',()=>{state.training.table=true;trackTrainingProgress(2).catch(()=>{});render()});
  document.querySelectorAll('[data-training-product]').forEach(b=>b.addEventListener('click',()=>{const p=trainingProducts.find(x=>x.id===b.dataset.trainingProduct);if(!p||!state.training.table||state.training.sent)return;const existing=state.training.cart.find(x=>x.id===p.id);if(existing)existing.qty++;else state.training.cart.push({...p,qty:1,note:''});trackTrainingProgress(3).catch(()=>{});render()}));
  document.getElementById('training-modifier')?.addEventListener('click',()=>{if(!state.training.cart.length||state.training.sent)return;const notes={fr:'Cuisson à point',en:'Medium cooking',de:'Medium',it:'Cottura media'};state.training.cart[0].note=notes[academyLocale()]||notes.fr;state.training.modified=true;trackTrainingProgress(4).catch(()=>{});render()});
  document.getElementById('training-send')?.addEventListener('click',()=>{if(!state.training.cart.length)return;state.training.sent=true;trackTrainingProgress(5).catch(()=>{});render()});
  document.querySelectorAll('[data-training-pay]').forEach(b=>b.addEventListener('click',()=>{if(!state.training.sent)return;state.training.paid=true;state.training.payment=b.dataset.trainingPay;trackTrainingProgress(6).catch(()=>{});render()}));
  document.getElementById('training-close')?.addEventListener('click',async()=>{if(!state.training.paid)return;state.training.closed=true;await trackTrainingProgress(7,'completed');render()});
}

function loginView(){return `<div class="login-wrap"><form class="card" id="login-form"><h1>ReMaPro POS</h1><p>${t('loginSubtitle')}</p><label class="field compact-language"><span>${t('language')}</span><select id="pos-language">${languageOptions()}</select></label>${!cloudConfigured()?'<div class="notice error">Configuration Supabase non injectée.</div>':''}${state.error?'<div class="notice error">'+esc(state.error)+'</div>':''}<label class="field">E-mail<input name="email" type="email" autocomplete="username" required></label><label class="field">Mot de passe<input name="password" type="password" autocomplete="current-password" required></label><button class="primary" type="submit" ${state.busy?'disabled':''}>${state.busy?'Connexion…':'Se connecter'}</button><button class="secondary wide" type="button" id="open-academy">? Académie / Aide</button><p class="muted">v${APP_VERSION}</p></form></div>`}
function pickerView(){return `<div class="picker-wrap"><div class="card"><h1>${t('chooseRestaurant')}</h1><label class="field compact-language"><span>${t('language')}</span><select id="pos-language">${languageOptions()}</select></label><label class="field">Établissement<select id="restaurant-select"><option value="">Sélectionner…</option>${(state.identity?.restaurants||[]).map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select></label><button class="secondary wide" id="open-academy">? Académie / Aide</button><button class="secondary" id="logout">Déconnexion</button></div></div>`}
function sessionView(){return `<div class="picker-wrap"><form class="card" id="open-session"><h1>${t('openCash')}</h1><label class="field compact-language"><span>${t('language')}</span><select id="pos-language">${languageOptions()}</select></label><p>${esc(state.restaurant.name)} · ${dateKey()}</p><label class="field">Fond de caisse (CHF)<input name="opening" inputmode="decimal" value="0.00" required></label><button class="primary" type="submit">Ouvrir le service</button><button class="secondary wide" type="button" id="open-academy">? Académie / Aide</button><button class="secondary wide" type="button" id="switch-restaurant">Changer de restaurant</button></form></div>`}
function topbar(){
  return `<header class="topbar"><div class="brand">ReMaPro POS <small>v${APP_VERSION}</small></div><div>${esc(state.restaurant.name)}</div>
    <button class="nav-tab ${state.view==='sale'?'active':''}" id="nav-sale">Caisse</button><button class="nav-tab ${state.view==='floor'?'active':''}" id="nav-floor">Salle</button><button class="nav-tab ${state.view==='directOrders'?'active':''}" id="nav-direct-orders">${t('directOrders')}${state.directOrders.filter(x=>x.status==='pending').length?' <span class="nav-badge">'+state.directOrders.filter(x=>x.status==='pending').length+'</span>':''}</button><button class="nav-tab ${state.view==='production'?'active':''}" id="nav-production">Production</button><button class="nav-tab ${state.view==='tickets'?'active':''}" id="nav-tickets">Tickets</button><button class="nav-tab ${state.view==='report'?'active':''}" id="nav-report">Rapport</button><button class="nav-tab ${state.view==='terminals'?'active':''}" id="nav-terminals">Terminaux</button><button class="nav-tab ${state.view==='printers'?'active':''}" id="nav-printers">Imprimantes</button><button class="nav-tab ${state.view==='team'?'active':''}" id="nav-team">Équipe</button>
    <div class="spacer"></div><label class="top-language"><span class="sr-only">${t('language')}</span><select id="pos-language">${languageOptions()}</select></label><button class="secondary academy-help-context" id="academy-help-context" title="${academyChromeText().contextHelp}">?</button>${state.operator?'<button class="operator-chip" id="switch-operator">'+esc(state.operator.display_name)+' · '+esc(state.operator.role)+'</button>':''}<div class="session-chip">Caisse ${state.cashSession?.status==='closing'?'en clôture':'ouverte'} · ${money(state.cashSession?.openingCash)}</div>
    <button class="queue queue-button ${state.queueCount?'has-pending':''}" id="nav-sync">${state.queueCount?state.queueCount+' en attente':'Synchronisé'}</button><div class="status"><span class="dot ${state.online?'online':''}"></span>${state.online?'En ligne':'Hors ligne'}</div>
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
function productionAgeMinutes(item,order,now=Date.now()){
  const raw=item?.created_at||order?.opened_at||order?.updated_at||'';
  const at=Date.parse(raw);return Number.isFinite(at)?Math.max(0,Math.floor((now-at)/60000)):0;
}
function productionUrgency(age){
  if(age>=state.kdsCriticalMinutes)return'critical';
  if(age>=state.kdsWarnMinutes)return'warning';
  return'on-time';
}
function productionAgeLabel(age){return age<1?'<1 min':age+' min'}
function productionOrderAge(order,now=Date.now()){
  const ages=(order.items||[]).map(item=>productionAgeMinutes(item,order,now));return ages.length?Math.max(...ages):0;
}
async function updateKdsThresholds(warn,critical){
  const w=Math.max(1,Math.min(120,Math.trunc(Number(warn)||12))),c=Math.max(w+1,Math.min(180,Math.trunc(Number(critical)||20)));
  state.kdsWarnMinutes=w;state.kdsCriticalMinutes=c;
  localStorage.setItem('remapro-kds-warn',String(w));localStorage.setItem('remapro-kds-critical',String(c));render();
}
async function advanceProductionOrder(order,target){
  if(!order||!state.online){uiAlert(t('connectionRequired'));return}
  const eligible=(order.items||[]).filter(i=>{
    if(target==='ready')return['sent','preparing'].includes(i.kitchen_status);
    if(target==='served')return i.kitchen_status==='ready';
    return false;
  });
  if(!eligible.length)return;
  for(const item of eligible)await updateProductionItem(item.id,target,{renderAfter:false,refreshAfter:false});
  await refreshProductionQueue();render();
}
function productionView(){
  const station=state.productionStation,now=Date.now();
  const source=(state.productionQueue||[]).map(o=>({...o,items:(o.items||[]).filter(i=>station==='all'||station==='expo'||i.station_snapshot===station||modifierRoutesToStation(i.modifiers,station))})).filter(o=>o.items.length);
  const filtered=[...source].sort((a,b)=>{
    const aa=productionOrderAge(a,now),bb=productionOrderAge(b,now);
    return state.productionSort==='newest'?aa-bb:bb-aa;
  });
  const label=s=>s==='bar'?t('bar'):t('kitchen');
  const action=i=>i.kitchen_status==='sent'?['preparing',t('prepare')]:i.kitchen_status==='preparing'?['ready',t('ready')]:i.kitchen_status==='ready'?['served',t('served')]:null;
  const ages=filtered.map(o=>productionOrderAge(o,now)),late=ages.filter(x=>x>=state.kdsWarnMinutes).length,critical=ages.filter(x=>x>=state.kdsCriticalMinutes).length,avg=ages.length?Math.round(ages.reduce((a,b)=>a+b,0)/ages.length):0;
  return `<div class="shell">${topbar()}${state.error?'<div class="notice banner">'+esc(state.error)+'</div>':''}
    <main class="production-page kds-page">
      <div class="kds-summary">
        <article><span>${t('kdsOpen')}</span><strong>${filtered.length}</strong></article>
        <article><span>${t('kdsAverage')}</span><strong>${avg} min</strong></article>
        <article class="${late?'kds-warning':''}"><span>${t('kdsLate')}</span><strong>${late}</strong></article>
        <article class="${critical?'kds-critical':''}"><span>${t('kdsCritical')}</span><strong>${critical}</strong></article>
      </div>
      <div class="floor-head kds-head"><div><h2>${t('kdsTitle')}</h2><p>${filtered.length} ${t('ordersInProgress')}</p></div>
        <div class="kds-controls">
          <div class="station-tabs"><button data-station="all" class="${station==='all'?'active':''}">${t('all')}</button><button data-station="kitchen" class="${station==='kitchen'?'active':''}">${t('kitchen')}</button><button data-station="bar" class="${station==='bar'?'active':''}">${t('bar')}</button><button data-station="expo" class="${station==='expo'?'active':''}">Expo</button></div>
          <label>${t('kdsSort')}<select id="kds-sort"><option value="oldest" ${state.productionSort==='oldest'?'selected':''}>${t('kdsOldest')}</option><option value="newest" ${state.productionSort==='newest'?'selected':''}>${t('kdsNewest')}</option></select></label>
          <label>${t('kdsWarn')}<input id="kds-warn" type="number" min="1" max="120" value="${state.kdsWarnMinutes}"></label>
          <label>${t('kdsCriticalAt')}<input id="kds-critical" type="number" min="2" max="180" value="${state.kdsCriticalMinutes}"></label>
          <button class="secondary" id="refresh-production" ${!state.online?'disabled':''}>${t('refresh')}</button>
        </div>
      </div>
      <div class="production-grid kds-grid">${filtered.length?filtered.map(o=>{
        const age=productionOrderAge(o,now),urgency=productionUrgency(age),readyCount=(o.items||[]).filter(i=>i.kitchen_status==='ready').length,activeCount=(o.items||[]).filter(i=>['sent','preparing'].includes(i.kitchen_status)).length;
        return `<article class="production-ticket kds-ticket ${urgency}">
          <header><div><strong>${esc(o.table_label||o.service_type||t('order'))}</strong><small>${Number(o.covers)||0} ${t('covers')}</small></div><div class="production-head-actions"><span class="kds-age">${productionAgeLabel(age)}</span><button data-print-production="${o.id}">${t('print')}</button></div></header>
          <div class="kds-order-actions">${activeCount?'<button class="secondary" data-kds-order-ready="'+o.id+'">✓ '+t('kdsMarkReady')+'</button>':''}${readyCount?'<button class="primary compact" data-kds-order-served="'+o.id+'">✓ '+t('kdsServeReady')+'</button>':''}</div>
          <div class="production-items">${o.items.map(i=>{const a=action(i),itemAge=productionAgeMinutes(i,o,now),itemUrgency=productionUrgency(itemAge),course=i.course?'<span class="kds-course">'+esc(i.course)+'</span>':'';return `<div class="production-item status-${i.kitchen_status} ${itemUrgency}"><div><strong>${Number(i.quantity)||1}× ${esc(i.name_snapshot)} ${course}</strong><small>${label(i.station_snapshot)} · ${esc(i.kitchen_status)} · ${productionAgeLabel(itemAge)}${productionModifierSummary(i.modifiers,station==='all'||station==='expo'?'':station)?' · '+esc(productionModifierSummary(i.modifiers,station==='all'||station==='expo'?'':station)):i.note?' · '+esc(i.note):''}</small></div>${a?`<button data-production-item="${i.id}" data-production-status="${a[0]}">${a[1]}</button>`:''}</div>`}).join('')}</div>
        </article>`;
      }).join(''):'<div class="empty">'+t('noProduction')+'</div>'}</div>
    </main></div>`;
}
function ticketsView(){
  const rows=state.receipts||[];
  return `<div class="shell">${topbar()}${state.error?'<div class="notice banner">'+esc(state.error)+'</div>':''}
    <main class="tickets-page"><div class="floor-head"><div><h2>Tickets</h2><p>${rows.length} ticket${rows.length>1?'s':''} récent${rows.length>1?'s':''}</p></div><button class="secondary" id="refresh-receipts" ${!state.online?'disabled':''}>Actualiser</button></div>
    <div class="receipt-list">${rows.length?rows.map(r=>{
      const refunds=Array.isArray(r.refunds)?r.refunds:[];
      const completed=refunds.filter(x=>x.status==='completed').reduce((s,x)=>s+Number(x.amount||0),0);
      const pending=refunds.filter(x=>x.status==='pending_external');
      const payments=Array.isArray(r.payments)?r.payments:[];
      return `<article class="receipt-card"><div><strong>${esc(r.receipt_number||r.receiptNumber||'Ticket')}</strong><small>${esc(r.business_date||r.businessDate||'')} · ${esc(r.table_label||r.service_type||'')}</small></div>
        <div class="receipt-money"><strong>${money(r.total)}</strong>${completed?'<span>Remboursé '+money(completed)+'</span>':''}</div>
        <div class="receipt-payments">${payments.map(p=>`<span>${p.metadata?.splitLabel?'<strong>'+esc(p.metadata.splitLabel)+'</strong> · ':''}${esc(p.method)} ${money(p.amount)}${Number(p.tip_amount)?' + '+money(p.tip_amount)+' tip':''}</span>`).join('')}</div>
        <div class="receipt-actions"><button class="secondary" data-print-receipt="${r.id||''}">Ticket maître</button>${payments.filter(p=>['items','progressive_items'].includes(p.metadata?.splitType)).map(p=>`<button class="secondary split-ticket-btn" data-print-split-payment="${r.id}:${p.id}">${esc(p.metadata?.splitLabel||'Part')}</button>`).join('')}${r.id&&r.status!=='refunded'?'<button class="secondary" data-refund-order="'+r.id+'">Rembourser</button>':''}
          ${pending.map(x=>isManager()?`<span class="pending-refund">Attente ${money(x.amount)} <button data-confirm-refund="${x.id}">✓</button><button data-fail-refund="${x.id}">×</button></span>`:`<span class="pending-refund">Remboursement externe en attente</span>`).join('')}
        </div></article>`;
    }).join(''):'<div class="empty">Aucun ticket disponible.</div>'}</div></main></div>`;
}

function reportView(){
  const r=state.serviceReport;
  const payments=Array.isArray(r?.payments)?r.payments:[];
  const refunds=Array.isArray(r?.refundsByMethod)?r.refundsByMethod:[];
  const taxes=Array.isArray(r?.taxGroups)?r.taxGroups:[];
  const sessions=r?.cashSessions||{};
  return `<div class="shell">${topbar()}${state.error?'<div class="notice banner">'+esc(state.error)+'</div>':''}
    <main class="report-page"><div class="floor-head"><div><h2>Rapport de service</h2><p>Ventes et mouvements de caisse du jour sélectionné.</p></div><div class="report-controls"><input id="report-date" type="date" value="${esc(state.reportDate||dateKey())}"><button class="secondary" id="refresh-report" ${!state.online?'disabled':''}>Actualiser</button><button class="primary compact" id="print-report" ${!r?'disabled':''}>Imprimer Z</button></div></div>
    ${r?`<section class="report-metrics">
      <article><span>CA brut</span><strong>${money(r.grossSales)}</strong></article>
      <article><span>Remboursements</span><strong>${money(r.refundTotal)}</strong></article>
      <article class="net"><span>CA net</span><strong>${money(r.netSales)}</strong></article>
      <article><span>TVA</span><strong>${money(r.taxTotal)}</strong></article>
      <article><span>Pourboires nets</span><strong>${money(r.netTips)}</strong></article>
      <article><span>Ticket moyen</span><strong>${money(r.averageTicket)}</strong></article>
      ${state.foodCostReport?`<article><span>Food cost théorique</span><strong>${money(state.foodCostReport.theoreticalFoodCost)}</strong></article><article><span>Food cost %</span><strong>${Number(state.foodCostReport.foodCostPct||0).toFixed(1)}%</strong></article><article class="net"><span>Marge brute théorique</span><strong>${money(state.foodCostReport.grossMargin)}</strong></article>`:''}
      <article><span>Tickets</span><strong>${Number(r.orders)||0}</strong></article>
      <article><span>Couverts</span><strong>${Number(r.covers)||0}</strong></article>
    </section>
    <section class="report-columns">
      <article class="report-card"><h3>Moyens de paiement</h3>${payments.length?payments.map(x=>`<div class="report-row"><span>${esc(String(x.method||'').toUpperCase())} · ${Number(x.count)||0}</span><strong>${money(x.amount)}</strong></div>`).join(''):'<div class="muted">Aucun paiement.</div>'}</article>
      <article class="report-card"><h3>Remboursements du service</h3>${refunds.length?refunds.map(x=>`<div class="report-row"><span>${esc(String(x.method||'').toUpperCase())} · ${Number(x.count)||0}</span><strong>− ${money(x.amount)}</strong></div>`).join(''):'<div class="muted">Aucun remboursement.</div>'}</article>
      <article class="report-card"><h3>TVA brute</h3>${taxes.length?taxes.map(x=>`<div class="report-row"><span>${Number(x.tax_rate)||0}% · ${money(x.gross)}</span><strong>${money(x.tax)}</strong></div>`).join(''):'<div class="muted">Aucune TVA.</div>'}</article>
      <article class="report-card"><h3>Caisse espèces</h3><div class="report-row"><span>Sessions</span><strong>${Number(sessions.count)||0}</strong></div><div class="report-row"><span>Fond de caisse</span><strong>${money(sessions.openingCash)}</strong></div><div class="report-row"><span>Attendu clôturé</span><strong>${money(sessions.expectedCash)}</strong></div><div class="report-row"><span>Compté</span><strong>${money(sessions.countedCash)}</strong></div><div class="report-row"><span>Écart</span><strong class="${Math.abs(Number(sessions.differenceCash)||0)>0.005?'report-negative':''}">${money(sessions.differenceCash)}</strong></div></article>
    </section>`:'<div class="empty"><h3>Aucun rapport chargé</h3><p>Choisissez une date puis actualisez.</p></div>'}
    </main></div>`;
}
function mainView(){
  const catalog=state.bootstrap?.catalog||[],layout=activeLayout();
  let productArea='',categoryArea='';
  if(layout?.document?.buttons?.length){
    ensureLayoutSelection(layout);
    const doc=layout.document,pages=[...(doc.pages||[])].sort((a,b)=>(Number(a.sortOrder)||0)-(Number(b.sortOrder)||0));
    const cats=categoriesForPage(doc,state.layoutPageId),buttons=layoutVisibleButtons(layout);
    categoryArea='<nav class="categories layout-categories"><button class="category '+(state.layoutCategoryId==='all'?'active':'')+'" data-layout-category="all">Tous</button><button class="category '+(state.layoutCategoryId==='favorites'?'active':'')+'" data-layout-category="favorites">★ Favoris</button>'+cats.map(c=>'<button class="category '+(String(c.id)===String(state.layoutCategoryId)?'active':'')+'" data-layout-category="'+esc(c.id)+'">'+(c.parentId?'↳ ':'')+esc(c.name)+'</button>').join('')+'</nav>';
    productArea='<section class="products layout-products"><div class="layout-page-tabs">'+pages.map(p=>'<button class="'+(String(p.id)===String(state.layoutPageId)?'active':'')+'" data-layout-page="'+esc(p.id)+'">'+esc(p.name)+'</button>').join('')+'</div><div class="product-toolbar"><button class="secondary" id="quick-item">+ Article libre</button><span>Implantation v'+Number(layout.version||0)+(state.online?'':' · cache offline')+'</span></div>'
      +(buttons.length?'<div class="layout-product-grid">'+buttons.map(b=>{const p=productById(catalog,b.productId);if(!p)return'';return '<button class="product layout-product '+(b.unavailable?'unavailable':'')+'" data-layout-product="'+esc(b.id)+'" '+(b.unavailable?'disabled':'')+' style="--pos-color:'+esc(b.color||'#d6b98c')+';--pos-x:'+(Number(b.x)||0)+';--pos-y:'+(Number(b.y)||0)+';--pos-w:'+Math.max(1,Number(b.w)||1)+';--pos-h:'+Math.max(1,Number(b.h)||1)+'"><strong>'+esc(b.label||p.name)+'</strong><small>'+(b.unavailable?'Indisponible · ':'')+(b.favorite?'★ · ':'')+esc(b.station||p.production_station||'kitchen')+'</small><span class="price">'+money((doc.menus||[]).find(m=>String(m.productId)===String(p.id))?.price||p.price)+'</span></button>'}).join('')+'</div>':'<div class="empty"><h3>Aucune touche sur cette page</h3><p>Configurez l’implantation dans ReMaPro Hub.</p></div>')+'</section>';
  }else{
    const cats=['Tous',...new Set(catalog.map(x=>x.category||'Autres'))];
    if(!cats.includes(state.category))state.category='Tous';
    const visible=state.category==='Tous'?catalog:catalog.filter(x=>(x.category||'Autres')===state.category);
    categoryArea='<nav class="categories">'+cats.map(c=>'<button class="category '+(c===state.category?'active':'')+'" data-category="'+esc(c)+'">'+esc(c)+'</button>').join('')+'</nav>';
    productArea='<section class="products"><div class="product-toolbar"><button class="secondary" id="quick-item">+ Article libre</button><span>'+catalog.length+' article'+(catalog.length>1?'s':'')+'</span></div>'+(visible.length?'<div class="product-grid">'+visible.map(p=>'<button class="product" data-product="'+p.id+'"><strong>'+esc(p.name)+'</strong><small>'+(p.production_station==='bar'?'Bar':p.production_station==='none'?'Sans production':'Cuisine')+'</small><span class="price">'+money(p.price)+'</span></button>').join('')+'</div>':'<div class="empty"><h3>Catalogue POS vide</h3><p>Les articles seront publiés depuis ReMaPro Hub.</p></div>')+'</section>';
  }

  return `<div class="shell">${topbar()}
  ${state.error?'<div class="notice error banner">'+esc(state.error)+'</div>':''}
  <main class="workspace">${categoryArea}${productArea}
  <aside class="cart"><div class="cart-head"><h2>Commande</h2><div class="order-meta"><select id="service-type"><option value="counter" ${state.serviceType==='counter'?'selected':''}>Comptoir</option><option value="dine_in" ${state.serviceType==='dine_in'?'selected':''}>Sur place</option><option value="takeaway" ${state.serviceType==='takeaway'?'selected':''}>À emporter</option></select><input id="table-label" placeholder="Table" value="${esc(state.tableLabel)}"><input id="covers" type="number" min="0" value="${Number(state.covers)||0}" title="Couverts"></div></div>
  <div class="cart-list">${state.cart.length?state.cart.map(x=>`<div class="line ${x.delta?'delta-line':x.locked?'locked-line':''}"><div><strong>${esc(x.name)}</strong>${x.delta?'<span class="delta-badge">Ajout</span>':x.locked?'<span class="sent-badge">Envoyé</span>':''}<div>${money(x.price)} × ${x.qty}</div>${x.note?'<small class="line-modifiers">'+esc(x.note)+'</small>':''}</div><div class="qty"><button data-minus="${x.id}" ${x.locked?'disabled':''}>−</button><span>${x.qty}</span><button data-plus="${x.id}" ${x.locked?'disabled':''}>+</button></div></div>`).join(''):'<div class="empty">Touchez un article pour commencer.</div>'}</div>
  <div class="cart-foot"><div class="total-row"><span>Total</span><span>${money(cartTotal())}</span></div>
    ${currentServerOrder()?'<div class="order-actions production-actions"><button class="secondary" id="transfer-order">Transférer</button><button class="secondary" id="send-production" '+(orderLocked()&&!hasPendingDelta()?'disabled':'')+'>'+(orderLocked()?'Envoyer les ajouts':'Envoyer cuisine/bar')+'</button><button class="secondary danger-btn" id="cancel-order" '+(progressivePaymentActive()?'disabled':'')+'>Annuler</button></div>':''}
    ${(state.activeTableId||state.serviceType==='dine_in')?'<button class="save-note" id="save-open-order" '+(!state.cart.length||orderLocked()?'disabled':'')+'>Enregistrer la note</button>':''}
    <div class="split-actions"><button class="split-pay" id="split-pay" ${!state.cart.length||progressivePaymentActive()?'disabled':''}>Partager par montants</button><button class="split-pay split-items-pay" id="split-items" ${!state.cart.length||!state.online||progressivePaymentActive()?'disabled':''}>Partager par articles</button></div><button class="progressive-pay" id="progressive-pay" ${!state.cart.length||!state.online?'disabled':''}>${progressivePaymentActive()?'Continuer le paiement par personne':'Encaisser une personne'}</button><div class="payments"><button data-pay="cash" ${!state.cart.length||progressivePaymentActive()?'disabled':''}>Espèces</button><button data-pay="card" ${!state.cart.length||progressivePaymentActive()?'disabled':''}>Carte</button><button data-pay="twint" ${!state.cart.length||progressivePaymentActive()?'disabled':''}>TWINT</button></div>${state.receipts[0]?.receiptNumber?`<div class="last-receipt">Dernier ticket: <strong>${esc(state.receipts[0].receiptNumber)}</strong> · ${money(state.receipts[0].total)}</div>`:''}</div></aside></main></div>`;
}
function render(){
  document.documentElement.lang=language();
  if(state.view==='academy'){app.innerHTML=academyView();wire();translateDom(app);return}
  if(state.view==='training'){state.trainingMode=true;app.innerHTML=trainingView();wire();translateDom(app);return}
  state.trainingMode=false;
  if(!currentSession()){app.innerHTML=loginView();wire();translateDom(app);return}
  if(!state.identity){app.innerHTML=`<div class="login-wrap"><div class="card"><h1>ReMaPro POS</h1><label class="field compact-language"><span>${t('language')}</span><select id="pos-language">${languageOptions()}</select></label><p>${state.busy?'Chargement…':'Connexion au compte…'}</p>${state.error?'<div class="notice error">'+esc(state.error)+'</div>':''}<button class="secondary wide" id="open-academy">? Académie / Aide</button></div></div>`;wire();translateDom(app);return}
  if(!state.restaurant){app.innerHTML=pickerView();wire();translateDom(app);return}
  if(state.operatorRequired&&!state.operator){app.innerHTML=operatorLoginView();wire();translateDom(app);return}
  if(!state.cashSession){app.innerHTML=sessionView();wire();translateDom(app);return}
  app.innerHTML=state.view==='floor'?floorView():state.view==='directOrders'?directOrdersView():state.view==='production'?productionView():state.view==='tickets'?ticketsView():state.view==='report'?reportView():state.view==='terminals'?terminalsView():state.view==='printers'?printersView():state.view==='team'?teamView():state.view==='sync'?syncView():mainView();wire();translateDom(app);
}
function wire(){
  document.querySelector('#pos-language')?.addEventListener('change',e=>{const next=setLanguage(e.target.value);state.academyLocale=next;localStorage.setItem('remapro-academy-lang',next);render()});
  bindPosAcademy();bindTraining();
  document.querySelectorAll('#open-academy').forEach(b=>b.addEventListener('click',()=>{const context=!currentSession()?'login':!state.restaurant?'picker':state.operatorRequired&&!state.operator?'operator':!state.cashSession?'session':state.view;const topic=academyContextTopics('pos',context)[0];state.academy.selectedTopic=topic?.id||'';state.academy.selectedPath='';state.academy.troubleshoot='';state.view='academy';render()}));
  document.getElementById('academy-help-context')?.addEventListener('click',()=>{const topic=academyContextTopics('pos',state.view)[0];state.academy.selectedTopic=topic?.id||'';state.academy.selectedPath='';state.academy.troubleshoot='';state.view='academy';render()});
  document.querySelector('#login-form')?.addEventListener('submit',async e=>{e.preventDefault();state.busy=true;state.error='';render();const fd=new FormData(e.currentTarget);try{await signIn(fd.get('email'),fd.get('password'));await loadAccount()}catch(error){state.error=error.message||String(error);state.busy=false;render()}});
  document.querySelector('#restaurant-select')?.addEventListener('change',async e=>{const r=(state.identity?.restaurants||[]).find(x=>x.id===e.target.value);if(r){await kvSet('restaurantId',r.id);await bootstrapRestaurant(r)}});
  document.querySelector('#logout')?.addEventListener('click',()=>logoutPos());
  document.querySelector('#operator-account-logout')?.addEventListener('click',()=>logoutPos());
  document.querySelector('#operator-login-form')?.addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);await operatorLogin(String(fd.get('operatorId')||''),String(fd.get('pin')||''))});
  document.querySelector('#switch-operator')?.addEventListener('click',()=>switchOperator());
  document.querySelector('#nav-sync')?.addEventListener('click',()=>{state.view='sync';updateQueueCount().then(render)});
  document.querySelector('#sync-refresh')?.addEventListener('click',()=>updateQueueCount().then(render));
  document.querySelector('#sync-retry')?.addEventListener('click',async()=>{await flushQueue({force:true});if(state.view==='sync')render()});
  document.querySelector('#switch-restaurant')?.addEventListener('click',()=>{state.restaurant=null;state.cashSession=null;render()});
  document.querySelector('#open-session')?.addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);await openSession(Number(String(fd.get('opening')).replace(',','.'))||0)});
  document.querySelector('#nav-sale')?.addEventListener('click',()=>{state.view='sale';state.activeOrderId=null;state.activeTableId=null;state.tableLabel='';state.serviceType='counter';state.cart=[];render()});
  document.querySelector('#nav-floor')?.addEventListener('click',()=>{state.view='floor';refreshFloorData().then(render)});
  document.querySelector('#nav-direct-orders')?.addEventListener('click',()=>{state.view='directOrders';refreshDirectOrders().then(render)});
  document.querySelector('#refresh-direct-orders')?.addEventListener('click',()=>refreshDirectOrders().then(render));
  document.querySelectorAll('[data-direct-accept]').forEach(b=>b.addEventListener('click',()=>acceptDirectOrder(b.dataset.directAccept)));
  document.querySelectorAll('[data-direct-reject]').forEach(b=>b.addEventListener('click',()=>rejectDirectOrder(b.dataset.directReject)));
  document.querySelector('#nav-production')?.addEventListener('click',()=>{state.view='production';refreshProductionQueue().then(render)});
  document.querySelector('#nav-tickets')?.addEventListener('click',()=>{state.view='tickets';refreshReceipts().then(render)});
  document.querySelector('#nav-report')?.addEventListener('click',()=>{state.view='report';state.reportDate=state.reportDate||dateKey();refreshServiceReport(state.reportDate)});
  document.querySelector('#nav-terminals')?.addEventListener('click',()=>{state.view='terminals';refreshTerminals().then(render)});
  document.querySelector('#nav-printers')?.addEventListener('click',()=>{state.view='printers';refreshPrinters().then(render)});
  document.querySelector('#nav-team')?.addEventListener('click',()=>{state.view='team';refreshOperators().then(render)});
  document.querySelector('#add-operator')?.addEventListener('click',()=>openOperatorEditor());
  document.querySelectorAll('[data-edit-operator]').forEach(b=>b.addEventListener('click',()=>{const o=state.operators.find(x=>x.id===b.dataset.editOperator);if(o)openOperatorEditor(o)}));
  document.querySelector('#refresh-printers')?.addEventListener('click',()=>refreshPrinters().then(render));
  document.querySelector('#scan-printers')?.addEventListener('click',()=>scanPrinters());
  document.querySelector('#add-printer')?.addEventListener('click',()=>openPrinterEditor());
  document.querySelectorAll('[data-discovered-printer]').forEach(b=>b.addEventListener('click',()=>openPrinterEditor(null,state.discoveredPrinters[Number(b.dataset.discoveredPrinter)])));
  document.querySelectorAll('[data-edit-printer]').forEach(b=>b.addEventListener('click',()=>{const p=state.printers.find(x=>x.id===b.dataset.editPrinter);if(p)openPrinterEditor(p)}));
  document.querySelectorAll('[data-test-printer]').forEach(b=>b.addEventListener('click',()=>{const p=state.printers.find(x=>x.id===b.dataset.testPrinter);if(p)testPrinterProfile(p)}));
  document.querySelector('#refresh-terminals')?.addEventListener('click',()=>refreshTerminals().then(render));
  document.querySelector('#add-terminal')?.addEventListener('click',()=>openTerminalEditor());
  document.querySelectorAll('[data-edit-terminal]').forEach(b=>b.addEventListener('click',()=>{const t=state.terminals.find(x=>x.id===b.dataset.editTerminal);if(t)openTerminalEditor(t)}));
  document.querySelectorAll('[data-cancel-intent]').forEach(b=>b.addEventListener('click',()=>cancelTerminalIntentFromList(b.dataset.cancelIntent)));
  document.querySelector('#report-date')?.addEventListener('change',e=>{state.reportDate=e.target.value;refreshServiceReport(state.reportDate)});
  document.querySelector('#refresh-report')?.addEventListener('click',()=>refreshServiceReport(state.reportDate||dateKey()));
  document.querySelector('#print-report')?.addEventListener('click',()=>printServiceReport(state.serviceReport));
  document.querySelector('#add-table')?.addEventListener('click',()=>addDiningTable());
  document.querySelectorAll('[data-table]').forEach(b=>b.addEventListener('click',()=>{const t=state.tables.find(x=>x.id===b.dataset.table);if(t)openTable(t)}));
  document.querySelectorAll('[data-order]').forEach(b=>b.addEventListener('click',()=>{const o=state.openOrders.find(x=>x.id===b.dataset.order);if(!o)return;state.activeOrderId=o.id;state.activeTableId=o.table_id||null;state.tableLabel=o.table_label||'';state.serviceType=o.service_type||'dine_in';state.covers=o.covers||1;const locked=o.status!=='open';state.cart=(o.items||[]).map(item=>({id:item.catalog_item_id||('saved:'+item.id),catalog_item_id:item.catalog_item_id||null,line_id:item.id,recipe_id:item.recipe_id||null,sku:item.sku_snapshot||'',name:item.name_snapshot,price:Number(item.unit_price)||0,tax_rate:Number(item.tax_rate)||0,production_station:item.station_snapshot||'kitchen',qty:Number(item.quantity)||1,quick:!item.catalog_item_id,locked,delta:false,modifiers:Array.isArray(item.modifiers)?item.modifiers:[],note:item.note||''}));state.view='sale';render()}));
  document.querySelector('#save-open-order')?.addEventListener('click',()=>saveOpenOrder());
  document.querySelector('#split-pay')?.addEventListener('click',()=>guardedPayment(()=>splitCheckout()));
  document.querySelector('#split-items')?.addEventListener('click',()=>openAllocatedSplit());
  document.querySelector('#progressive-pay')?.addEventListener('click',()=>openProgressivePayment());
  document.querySelector('#transfer-order')?.addEventListener('click',()=>transferCurrentOrder());
  document.querySelector('#cancel-order')?.addEventListener('click',()=>cancelCurrentOrder());
  document.querySelector('#send-production')?.addEventListener('click',()=>sendCurrentOrderProduction());
  document.querySelector('#refresh-production')?.addEventListener('click',()=>refreshProductionQueue().then(render));
  document.querySelector('#kds-sort')?.addEventListener('change',e=>{state.productionSort=e.target.value==='newest'?'newest':'oldest';render()});
  document.querySelector('#kds-warn')?.addEventListener('change',e=>updateKdsThresholds(e.target.value,state.kdsCriticalMinutes));
  document.querySelector('#kds-critical')?.addEventListener('change',e=>updateKdsThresholds(state.kdsWarnMinutes,e.target.value));
  document.querySelectorAll('[data-kds-order-ready]').forEach(b=>b.addEventListener('click',()=>advanceProductionOrder(state.productionQueue.find(x=>x.id===b.dataset.kdsOrderReady),'ready')));
  document.querySelectorAll('[data-kds-order-served]').forEach(b=>b.addEventListener('click',()=>advanceProductionOrder(state.productionQueue.find(x=>x.id===b.dataset.kdsOrderServed),'served')));
  document.querySelectorAll('[data-station]').forEach(b=>b.addEventListener('click',()=>{state.productionStation=b.dataset.station;render()}));
  document.querySelectorAll('[data-production-item]').forEach(b=>b.addEventListener('click',()=>updateProductionItem(b.dataset.productionItem,b.dataset.productionStatus)));
  document.querySelectorAll('[data-print-production]').forEach(b=>b.addEventListener('click',()=>{const o=state.productionQueue.find(x=>x.id===b.dataset.printProduction);if(o)smartPrintProduction(o)}));
  document.querySelector('#refresh-receipts')?.addEventListener('click',()=>refreshReceipts().then(render));
  document.querySelectorAll('[data-print-receipt]').forEach(b=>b.addEventListener('click',()=>{const r=state.receipts.find(x=>x.id===b.dataset.printReceipt);if(r)smartPrintReceipt(r)}));
  document.querySelectorAll('[data-print-split-payment]').forEach(b=>b.addEventListener('click',()=>{const [orderId,paymentId]=String(b.dataset.printSplitPayment||'').split(':');const r=state.receipts.find(x=>x.id===orderId);const p=r?.payments?.find(x=>x.id===paymentId);if(r&&p){if(p.metadata?.splitType==='progressive_items')printProgressivePayment(r,p);else printSplitPayment(r,p)}}));
  document.querySelectorAll('[data-refund-order]').forEach(b=>b.addEventListener('click',()=>{const r=state.receipts.find(x=>x.id===b.dataset.refundOrder);if(r)guardedPayment(()=>refundReceipt(r))}));
  document.querySelectorAll('[data-confirm-refund]').forEach(b=>b.addEventListener('click',()=>confirmRefund(b.dataset.confirmRefund,true)));
  document.querySelectorAll('[data-fail-refund]').forEach(b=>b.addEventListener('click',()=>confirmRefund(b.dataset.failRefund,false)));
  document.querySelector('#refresh-catalog')?.addEventListener('click',()=>{refreshCatalog();refreshFloorData().then(render)});
  document.querySelector('#quick-item')?.addEventListener('click',()=>addQuickItem());
  document.querySelector('#close-session')?.addEventListener('click',async()=>{const v=await uiPrompt({title:t('closeCash'),label:t('countedCash'),value:'0.00',type:'number',inputMode:'decimal',min:'0',step:'0.01'});if(v===null)return;const n=Number(String(v).replace(',','.'));if(!Number.isFinite(n)||n<0){uiAlert(t('invalidAmount'));return}await closeSession(n)});
  document.querySelector('#service-type')?.addEventListener('change',e=>state.serviceType=e.target.value);
  document.querySelector('#table-label')?.addEventListener('input',e=>state.tableLabel=e.target.value);
  document.querySelector('#covers')?.addEventListener('input',e=>state.covers=Math.max(0,Number(e.target.value)||0));
  document.querySelectorAll('[data-category]').forEach(b=>b.addEventListener('click',()=>{state.category=b.dataset.category;render()}));
  document.querySelectorAll('[data-layout-page]').forEach(b=>b.addEventListener('click',()=>{state.layoutPageId=b.dataset.layoutPage;state.layoutCategoryId='all';render()}));
  document.querySelectorAll('[data-layout-category]').forEach(b=>b.addEventListener('click',()=>{state.layoutCategoryId=b.dataset.layoutCategory;render()}));
  document.querySelectorAll('[data-layout-product]').forEach(b=>b.addEventListener('click',()=>openItemConfigurator(b.dataset.layoutProduct)));
  document.querySelectorAll('[data-product]').forEach(b=>b.addEventListener('click',()=>{const p=(state.bootstrap?.catalog||[]).find(x=>x.id===b.dataset.product);if(p)addItem(p)}));
  document.querySelectorAll('[data-minus]').forEach(b=>b.addEventListener('click',()=>changeQty(b.dataset.minus,-1)));
  document.querySelectorAll('[data-plus]').forEach(b=>b.addEventListener('click',()=>changeQty(b.dataset.plus,1)));
  document.querySelectorAll('[data-pay]').forEach(b=>b.addEventListener('click',()=>guardedPayment(()=>payByMethod(b.dataset.pay))));
}
async function init(){
  await initializePosSessionStorage();
  if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
  window.addEventListener('error',event=>recordDiagnostic('runtime.error',{message:event.message||'runtime error',source:String(event.filename||'').split('/').pop()||'',line:Number(event.lineno)||0}));
  window.addEventListener('unhandledrejection',event=>recordDiagnostic('runtime.unhandled_rejection',{message:event.reason?.message||String(event.reason||'promise rejection')}));
  window.addEventListener('online',()=>{state.online=true;recordDiagnostic('network.online');render();flushQueue().catch(()=>{})});
  window.addEventListener('offline',()=>{state.online=false;recordDiagnostic('network.offline');render()});
  setInterval(()=>{if(state.view==='production'&&state.online&&state.restaurant)refreshProductionQueue().then(render).catch(()=>{})},10000);
  await updateQueueCount();if(!currentSession()){render();return}await loadAccount();
}
init();
