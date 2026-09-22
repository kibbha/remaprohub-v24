import {cloudConfigured,signIn,signOut,currentSession,loadIdentity,posFunction} from './cloud.js';
import {kvGet,kvSet,kvDelete,queuePut,queueDelete,queueAll,uuid} from './db.js';
import {discoverNativePrinters,printEscPosText,buildReceiptText,buildProductionText,buildTestText,nativePrinterReady} from './printer.js';

const APP_VERSION='0.15.1';
const state={
  identity:null,restaurant:null,bootstrap:null,category:'Tous',cart:[],
  busy:false,error:'',queueCount:0,online:navigator.onLine,cashSession:null,
  receipts:[],serviceType:'counter',tableLabel:'',covers:1,
  tables:[],openOrders:[],view:'sale',activeOrderId:null,activeTableId:null,
  productionQueue:[],productionStation:'all',serviceReport:null,reportDate:'',
  terminals:[],terminalIntents:[],printers:[],discoveredPrinters:[],pendingAutoReceiptNumber:''
};
const app=document.querySelector('#app');
let terminalPollTimer=null;
const money=v=>new Intl.NumberFormat('fr-CH',{style:'currency',currency:state.restaurant?.currency||'CHF'}).format(Number(v)||0);
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

async function refreshTerminals(){
  if(!state.restaurant)return;
  if(!state.online){
    state.terminals=await kvGet(terminalsKey(state.restaurant.id))||state.terminals||[];
    state.terminalIntents=[];
    return;
  }
  try{
    const [terminals,intents]=await Promise.all([
      posFunction({action:'list_terminals',restaurantId:state.restaurant.id}),
      posFunction({action:'list_terminal_intents',restaurantId:state.restaurant.id,limit:30})
    ]);
    state.terminals=terminals.rows||[];
    state.terminalIntents=intents.rows||[];
    await kvSet(terminalsKey(state.restaurant.id),state.terminals);
  }catch(error){state.error=error.message||String(error)}
}
function closeTerminalEditor(){
  document.querySelector('#terminal-editor-modal')?.remove();
  document.body.classList.remove('modal-open');
}
function openTerminalEditor(existing=null){
  if(!isManager()){alert('Accès manager requis.');return}
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
  document.body.appendChild(modal);document.body.classList.add('modal-open');
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
function terminalsView(){
  const intents=state.terminalIntents||[];
  return `<div class="shell">${topbar()}${state.error?'<div class="notice banner">'+esc(state.error)+'</div>':''}
    <main class="terminals-page">
      <div class="floor-head"><div><h2>Terminaux de paiement</h2><p>Profils et état de connexion. Les clés API restent exclusivement côté serveur.</p></div><div class="terminal-head-actions"><button class="secondary" id="refresh-terminals" ${!state.online?'disabled':''}>Actualiser</button>${isManager()?'<button class="primary compact" id="add-terminal">+ Terminal</button>':''}</div></div>
      <div class="terminal-warning"><strong>Mode préparation.</strong> Aucun connecteur Worldline/TWINT réel n’est encore activé. Une vente carte/TWINT peut seulement être enregistrée manuellement après confirmation sur un terminal externe indépendant.</div>
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
  if(!state.online){alert('Une connexion est nécessaire pour le terminal.');return null}
  if(!state.cart.length||!state.cashSession||state.cashSession.status!=='open')return null;
  if(standardPaymentBlocked()){alert(progressivePaymentActive()?'Un paiement progressif est déjà en cours.':'Envoyez d’abord les nouveaux articles en production.');return null}
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
  }
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
  document.body.appendChild(modal);document.body.classList.add('modal-open');
  modal.querySelector('#terminal-wait-cancel')?.addEventListener('click',async()=>{
    if(!confirm('Annuler cet intent de paiement ?'))return;
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
  const tip=askTip('0.00');if(tip===null)return;
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
  if(!confirm('Annuler cet intent terminal ?'))return;
  try{
    await posFunction({action:'cancel_terminal_intent',restaurantId:state.restaurant.id,intentId});
    await refreshTerminals();state.error='Intent terminal annulé.';render();
  }catch(error){state.error=error.message||String(error);render()}
}
async function payByMethod(method){
  if(method==='cash')return checkout(method);
  if(!['card','twint'].includes(method))return checkout(method);
  const matching=connectedTerminal(method);
  if(matching&&state.bootstrap?.capabilities?.paymentProviders===true){
    return startTerminalPayment(method,matching);
  }
  const label=method==='twint'?'TWINT':'carte';
  const ok=confirm('ReMaPro POS n’est pas encore relié au prestataire '+label+'. Confirmez uniquement si le paiement a DÉJÀ été accepté sur un terminal externe. L’enregistrer manuellement ?');
  if(!ok)return;
  return checkout(method);
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
    alert('Le profil réseau est conservé, mais le transport TCP natif sera activé lors de la future migration Capacitor 8. Utilisez Bluetooth/USB ou impression système pour cette version.');
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
  if(!isManager()){alert('Accès manager requis.');return}
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
  document.body.appendChild(modal);document.body.classList.add('modal-open');
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
  if(item.action==='settle_open_order_split'){
    const r=await posFunction({action:'settle_open_order_split',restaurantId:item.restaurantId,...item.payload});
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
      if(['save_open_order','settle_open_order','settle_open_order_split'].includes(item.action))floorChanged=true;
      await queueDelete(item.client_event_id);
    }catch(error){state.error='Synchronisation: '+(error.message||String(error));break}
  }
  if(floorChanged&&state.online)await refreshFloorData();
  if(state.pendingAutoReceiptNumber&&state.online)await refreshReceipts();
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
  state.productionQueue=await kvGet(productionKey(restaurant.id))||[];
  state.terminals=await kvGet(terminalsKey(restaurant.id))||[];
  state.printers=await kvGet(printersKey(restaurant.id))||[];
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
      await refreshProductionQueue();
      await refreshReceipts();
      await refreshTerminals();
      await refreshPrinters()
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
function linePayload(x){
  return {id:uuid(),catalog_item_id:x.quick?null:(x.catalog_item_id||x.id),recipe_id:x.recipe_id,sku:x.sku,name:x.name,quantity:x.qty,unit_price:x.price,tax_rate:x.tax_rate};
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
      qty:Number(item.quantity)||1,quick:!item.catalog_item_id,locked,delta:false
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
  if(orderLocked()){alert('Cette note a déjà été envoyée en production.');return}
  if(!state.cart.length||!state.cashSession||state.cashSession.status!=='open')return;
  const device=await ensureDevice(),orderId=state.activeOrderId||uuid(),eventId=uuid(),order=buildOpenOrder(orderId,eventId);
  order.deviceId=device.id;
  await queuePut({client_event_id:eventId,queued_at:new Date().toISOString(),action:'save_open_order',restaurantId:state.restaurant.id,payload:{order}});
  const local=localOpenOrder(order,'open');
  state.openOrders=[local,...state.openOrders.filter(x=>x.id!==orderId)];
  await saveFloorCache();state.cart=[];state.activeOrderId=null;state.activeTableId=null;state.tableLabel='';state.view='floor';
  await updateQueueCount();render();flushQueue().catch(()=>{});
}


async function refreshServiceReport(targetDate=state.reportDate||dateKey()){
  if(!state.restaurant)return;
  state.reportDate=targetDate||dateKey();
  if(!state.online){state.error='Le rapport de service nécessite une connexion.';render();return}
  try{
    const r=await posFunction({action:'service_report',restaurantId:state.restaurant.id,businessDate:state.reportDate});
    state.serviceReport=r.report||null;state.error='';
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
  const itemRows=items.map(i=>'<div class="print-line"><span>'+Number(i.quantity||1)+'× '+esc(i.name_snapshot)+'</span><span>'+money(i.line_total)+'</span></div>').join('')||'<div>Détail indisponible</div>';
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
  if(!allocations.length){alert('Aucun détail de partage disponible pour ce paiement.');return}
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
  const itemRows=items.map(i=>'<div class="print-production-line"><strong>'+Number(i.quantity||1)+'× '+esc(i.name_snapshot)+'</strong><small>'+(i.station_snapshot==='bar'?'BAR':'CUISINE')+' · '+esc(i.kitchen_status)+(i.note?' · '+esc(i.note):'')+'</small></div>').join('');
  const body='<div class="print-meta"><div class="production-title">'+esc(order.table_label||order.service_type||'Commande')+'</div><div>'+new Date().toLocaleString('fr-CH')+'</div></div><hr><div class="print-lines">'+itemRows+'</div>';
  printHtml('BON PRODUCTION',body);
}
function parseMoneyInput(value){
  const n=Number(String(value??'').trim().replace(',','.'));return Number.isFinite(n)?Math.round(n*100)/100:NaN;
}
function askTip(defaultValue='0.00'){
  const raw=prompt('Pourboire (CHF)',defaultValue);if(raw===null)return null;
  const tip=parseMoneyInput(raw);if(!Number.isFinite(tip)||tip<0){alert('Pourboire invalide');return null}return tip;
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
  if(!order){alert('Enregistrez d’abord la note avant de la transférer.');return}
  if(!state.online){alert('Le transfert de table nécessite une connexion.');return}
  const free=state.tables.filter(t=>t.id!==state.activeTableId&&!state.openOrders.some(o=>o.id!==order.id&&o.table_id===t.id));
  if(!free.length){alert('Aucune autre table libre.');return}
  const answer=prompt('Transférer vers :\n'+free.map(t=>t.label).join('\n'),free[0].label);if(answer===null)return;
  const target=free.find(t=>t.label.toLowerCase()===answer.trim().toLowerCase());
  if(!target){alert('Table introuvable ou occupée.');return}
  try{
    await posFunction({action:'transfer_open_order',restaurantId:state.restaurant.id,orderId:order.id,targetTableId:target.id});
    state.activeTableId=target.id;state.tableLabel=target.label;await refreshFloorData();state.error='';render();
  }catch(error){state.error=error.message||String(error);render()}
}
async function cancelCurrentOrder(){
  const order=currentServerOrder();
  if(!order){alert('Cette note n’est pas encore enregistrée.');return}
  if(!state.online){alert('L’annulation nécessite une connexion.');return}
  const reason=prompt('Motif de l’annulation');if(!reason?.trim())return;
  if(!confirm('Annuler cette note ? L’opération restera dans le journal d’audit.'))return;
  try{
    await posFunction({action:'cancel_open_order',restaurantId:state.restaurant.id,orderId:order.id,reason:reason.trim()});
    state.openOrders=state.openOrders.filter(x=>x.id!==order.id);await saveFloorCache();
    state.cart=[];state.activeOrderId=null;state.activeTableId=null;state.tableLabel='';state.view='floor';state.error='';render();
  }catch(error){state.error=error.message||String(error);render()}
}

async function prepareOrderForAllocatedSplit(){
  if(!state.online){alert('Le partage par articles nécessite une connexion.');return null}
  if(!state.cart.length||!state.cashSession||state.cashSession.status!=='open')return null;
  if(paymentBlockedByDelta()){alert('Envoyez d’abord les nouveaux articles en production.');return null}

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
  if(!items.length){alert('Aucun article à répartir.');return}
  const raw=prompt('Combien de personnes / groupes ?','2');if(raw===null)return;
  const groupCount=Math.max(2,Math.min(8,Math.trunc(Number(raw)||0)));
  if(groupCount<2){alert('Nombre invalide.');return}

  closeAllocatedSplit();
  const modal=document.createElement('div');
  modal.id='allocated-split-modal';modal.className='modal-overlay';modal.dataset.groups=String(groupCount);
  const groupHeads=Array.from({length:groupCount},(_,gi)=>'<th><input data-group-label="'+gi+'" class="split-label" value="Personne '+(gi+1)+'"><select data-group-method="'+gi+'" class="split-method"><option value="cash">Espèces</option><option value="card">Carte</option><option value="twint">TWINT</option><option value="voucher">Bon</option><option value="invoice">Facture</option></select><label class="split-tip">Tip <input data-group-tip="'+gi+'" inputmode="decimal" value="0.00"></label><strong data-split-total="'+gi+'">'+money(0)+'</strong></th>').join('');
  const itemRows=items.map(item=>'<tr data-split-item-row data-item-id="'+esc(item.id)+'" data-qty="'+Number(item.quantity||0)+'" data-total="'+Number(item.line_total||0)+'"><td><strong>'+esc(item.name_snapshot)+'</strong><small>'+Number(item.quantity||0)+' × '+money(item.unit_price)+'</small></td>'+Array.from({length:groupCount},(_,gi)=>'<td><input class="split-qty-input" data-split-group="'+gi+'" type="number" min="0" max="'+Number(item.quantity||0)+'" step="0.001" value="'+(gi===0?Number(item.quantity||0):0)+'"></td>').join('')+'<td><span class="split-remaining" data-split-remaining>OK</span></td></tr>').join('');
  modal.innerHTML='<div class="split-dialog"><div class="split-dialog-head"><div><h2>Partager par articles</h2><p>'+esc(order.table_label||order.service_type||'Commande')+' · '+money(order.total)+'</p></div><button class="split-close" id="allocated-split-close">×</button></div><div class="split-toolbar"><button class="secondary" id="allocated-auto">Répartir par unité</button><span>Chaque quantité doit être attribuée entièrement.</span></div><div class="split-table-wrap"><table class="split-table"><thead><tr><th>Article</th>'+groupHeads+'<th>Contrôle</th></tr></thead><tbody>'+itemRows+'</tbody></table></div><div class="split-footer"><button class="secondary" id="allocated-split-cancel">Annuler</button><button class="primary" id="allocated-split-submit">Encaisser la répartition</button></div></div>';
  document.body.appendChild(modal);document.body.classList.add('modal-open');
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
  if(!state.online){alert('Le paiement progressif nécessite une connexion.');return null}
  if(!state.cart.length||!state.cashSession||state.cashSession.status!=='open')return null;
  if(paymentBlockedByDelta()){alert('Envoyez d’abord les nouveaux articles en production.');return null}
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
  if(!remainingItems.length){alert('Cette note est déjà entièrement répartie.');return}
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
  document.body.appendChild(modal);document.body.classList.add('modal-open');

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
      if(paid&&confirm('Paiement enregistré. Imprimer le reçu '+(paid.paymentReceiptNumber||'')+' ?'))printProgressivePayment(order,paid);
    }catch(error){
      state.error=error.message||String(error);if(submit)submit.disabled=false;render();closeProgressiveModal();
    }
  });
  updateProgressiveTotal();
}
async function splitCheckout(){
  if(!state.cart.length||!state.cashSession||state.cashSession.status!=='open')return;
  if(standardPaymentBlocked()){alert(progressivePaymentActive()?'Un paiement progressif est déjà en cours. Utilisez « Encaisser une personne ».':'Envoyez d’abord les nouveaux articles en production.');return}
  const raw=prompt('Nombre de parts / moyens de paiement','2');if(raw===null)return;
  const count=Math.max(2,Math.min(6,Math.trunc(Number(raw)||0)));if(count<2){alert('Nombre invalide');return}
  const total=Math.round(cartTotal()*100)/100;
  const payments=[];let remaining=total;
  for(let i=0;i<count;i++){
    const suggested=i===count-1?remaining:Math.floor((total/count)*100)/100;
    const amountRaw=prompt(`Part ${i+1}/${count} — montant (reste ${remaining.toFixed(2)} CHF)`,suggested.toFixed(2));if(amountRaw===null)return;
    const amount=parseMoneyInput(amountRaw);if(!Number.isFinite(amount)||amount<=0||amount>remaining+0.01){alert('Montant invalide');return}
    const methodRaw=prompt(`Part ${i+1} — moyen : espèces, carte ou TWINT`,i===0?'cash':'card');if(methodRaw===null)return;
    const method=normalizePaymentMethod(methodRaw);if(!method){alert('Moyen de paiement invalide');return}
    const tip=askTip('0.00');if(tip===null)return;
    payments.push({method,amount,tipAmount:tip,provider:'',providerReference:''});
    remaining=Math.round((remaining-amount)*100)/100;
  }
  if(Math.abs(remaining)>0.01){alert('Le total des parts doit correspondre exactement à l’addition.');return}
  const device=await ensureDevice(),now=new Date(),orderId=state.activeOrderId||uuid(),saveEventId=uuid(),payEventId=uuid();
  const existing=currentServerOrder();
  if(!existing||existing.status==='open'){
    const order=buildOpenOrder(orderId,saveEventId);order.deviceId=device.id;
    await queuePut({client_event_id:saveEventId,queued_at:now.toISOString(),action:'save_open_order',restaurantId:state.restaurant.id,payload:{order}});
    state.openOrders=[localOpenOrder(order,'payment_pending'),...state.openOrders.filter(x=>x.id!==orderId)];
  }
  await queuePut({
    client_event_id:payEventId,queued_at:new Date(now.getTime()+1).toISOString(),action:'settle_open_order_split',restaurantId:state.restaurant.id,
    payload:{orderId,clientEventId:payEventId,deviceId:device.id,cashSessionId:state.cashSession.id,payments,occurredAt:now.toISOString()}
  });
  state.cart=[];state.activeOrderId=null;state.activeTableId=null;state.tableLabel='';state.view='floor';
  await saveFloorCache();await updateQueueCount();render();flushQueue().catch(()=>{});
}
async function refundReceipt(receipt){
  if(!state.online){alert('Un remboursement nécessite une connexion.');return}
  if(!state.cashSession||state.cashSession.status!=='open'){alert('Ouvrez une caisse avant de rembourser.');return}
  const refunds=Array.isArray(receipt.refunds)?receipt.refunds:[];
  const reserved=refunds.filter(r=>['completed','pending_external'].includes(r.status)).reduce((s,r)=>s+Number(r.amount||0),0);
  const remaining=Math.max(0,Math.round((Number(receipt.total||0)-reserved)*100)/100);
  if(remaining<=0){alert('Ce ticket est déjà entièrement remboursé ou réservé pour remboursement.');return}
  const raw=prompt('Montant à rembourser (CHF)',remaining.toFixed(2));if(raw===null)return;
  const amount=parseMoneyInput(raw);if(!Number.isFinite(amount)||amount<=0||amount>remaining+0.001){alert('Montant invalide');return}
  const defaultMethod=receipt.payments?.[0]?.method||'cash';
  const methodRaw=prompt('Moyen du remboursement : espèces, carte ou TWINT',defaultMethod);if(methodRaw===null)return;
  const method=normalizePaymentMethod(methodRaw);if(!method){alert('Moyen de remboursement invalide');return}
  const reason=prompt('Motif du remboursement');if(!reason?.trim())return;
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
  const ref=success?prompt('Référence de confirmation du prestataire (facultatif)',''):'';if(success&&ref===null)return;
  try{
    await posFunction({action:'confirm_external_refund',restaurantId:state.restaurant.id,refundId,success,providerReference:ref||''});
    await refreshReceipts();state.error=success?'Remboursement externe confirmé.':'Remboursement externe marqué en échec.';render();
  }catch(error){state.error=error.message||String(error);render()}
}
async function sendCurrentOrderProduction(){
  const order=currentServerOrder();
  if(!order){alert('Enregistrez d’abord la note avant de l’envoyer en production.');return}
  if(!state.online){alert('L’envoi cuisine/bar nécessite une connexion.');return}
  try{
    if(order.status==='open'){
      const device=await ensureDevice(),eventId=uuid(),payload=buildOpenOrder(order.id,eventId);payload.deviceId=device.id;
      await posFunction({action:'save_open_order',restaurantId:state.restaurant.id,order:payload});
    }else{
      const lines=deltaLines();
      if(!lines.length){alert('Aucun nouvel article à envoyer.');return}
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
async function updateProductionItem(itemId,status){
  if(!state.online){alert('Le suivi production nécessite une connexion.');return}
  try{
    await posFunction({action:'update_production_item',restaurantId:state.restaurant.id,itemId,status});
    await Promise.all([refreshProductionQueue(),refreshFloorData()]);
    state.error='';render();
  }catch(error){state.error=error.message||String(error);render()}
}
function addItem(item){
  if(progressivePaymentActive()){alert('Paiement progressif en cours : aucun nouvel article ne peut être ajouté à cette note.');return}
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
function changeQty(id,delta){const line=state.cart.find(x=>x.id===id);if(!line)return;if(line.locked){alert('Cet article a déjà été envoyé en production.');return}line.qty+=delta;if(line.qty<=0)state.cart=state.cart.filter(x=>x.id!==id);render()}
const cartTotal=()=>state.cart.reduce((s,x)=>s+x.qty*x.price,0);

async function checkout(method){
  if(!state.cart.length||!state.restaurant||!state.cashSession||state.cashSession.status!=='open')return;
  if(standardPaymentBlocked()){alert(progressivePaymentActive()?'Un paiement progressif est déjà en cours. Utilisez « Encaisser une personne ».':'Envoyez d’abord les nouveaux articles en production.');return}
  const tip=askTip('0.00');if(tip===null)return;
  const device=await ensureDevice(),now=new Date();

  if(state.activeTableId||state.activeOrderId||state.serviceType==='dine_in'){
    const orderId=state.activeOrderId||uuid(),saveEventId=uuid(),settleEventId=uuid();
    const existing=currentServerOrder();
    if(!existing||existing.status==='open'){
      const order=buildOpenOrder(orderId,saveEventId);order.deviceId=device.id;
      await queuePut({client_event_id:saveEventId,queued_at:now.toISOString(),action:'save_open_order',restaurantId:state.restaurant.id,payload:{order}});
      const local=localOpenOrder(order,'payment_pending');
      state.openOrders=[local,...state.openOrders.filter(x=>x.id!==orderId)];
    }
    await queuePut({
      client_event_id:settleEventId,queued_at:new Date(now.getTime()+1).toISOString(),action:'settle_open_order',restaurantId:state.restaurant.id,
      payload:{orderId,clientEventId:settleEventId,deviceId:device.id,cashSessionId:state.cashSession.id,paymentMethod:method,paymentProvider:'',paymentReference:'',tipAmount:tip,occurredAt:now.toISOString()}
    });
  }else{
    const orderId=uuid(),eventId=uuid();
    const order={
      id:orderId,clientEventId:eventId,deviceId:device.id,cashSessionId:state.cashSession.id,
      businessDate:state.cashSession.businessDate,serviceType:state.serviceType,tableLabel:state.tableLabel,
      covers:Number(state.covers)||0,currency:state.restaurant.currency||'CHF',lines:orderLines(),
      paymentMethod:method,paymentProvider:'',paymentReference:'',tipAmount:tip,occurredAt:now.toISOString()
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
    <button class="nav-tab ${state.view==='sale'?'active':''}" id="nav-sale">Caisse</button><button class="nav-tab ${state.view==='floor'?'active':''}" id="nav-floor">Salle</button><button class="nav-tab ${state.view==='production'?'active':''}" id="nav-production">Production</button><button class="nav-tab ${state.view==='tickets'?'active':''}" id="nav-tickets">Tickets</button><button class="nav-tab ${state.view==='report'?'active':''}" id="nav-report">Rapport</button><button class="nav-tab ${state.view==='terminals'?'active':''}" id="nav-terminals">Terminaux</button><button class="nav-tab ${state.view==='printers'?'active':''}" id="nav-printers">Imprimantes</button>
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
function productionView(){
  const station=state.productionStation;
  const filtered=(state.productionQueue||[]).map(o=>({...o,items:(o.items||[]).filter(i=>station==='all'||i.station_snapshot===station)})).filter(o=>o.items.length);
  const label=s=>s==='bar'?'Bar':'Cuisine';
  const action=i=>i.kitchen_status==='sent'?['preparing','Préparer']:i.kitchen_status==='preparing'?['ready','Prêt']:i.kitchen_status==='ready'?['served','Servi']:null;
  return `<div class="shell">${topbar()}${state.error?'<div class="notice banner">'+esc(state.error)+'</div>':''}
    <main class="production-page"><div class="floor-head"><div><h2>Production</h2><p>${filtered.length} commande${filtered.length>1?'s':''} en cours</p></div>
      <div class="station-tabs"><button data-station="all" class="${station==='all'?'active':''}">Tout</button><button data-station="kitchen" class="${station==='kitchen'?'active':''}">Cuisine</button><button data-station="bar" class="${station==='bar'?'active':''}">Bar</button><button class="secondary" id="refresh-production" ${!state.online?'disabled':''}>Actualiser</button></div></div>
      <div class="production-grid">${filtered.length?filtered.map(o=>`<article class="production-ticket"><header><strong>${esc(o.table_label||o.service_type||'Commande')}</strong><div class="production-head-actions"><span>${esc(o.status)}</span><button data-print-production="${o.id}">Imprimer</button></div></header>
        <div class="production-items">${o.items.map(i=>{const a=action(i);return `<div class="production-item status-${i.kitchen_status}"><div><strong>${Number(i.quantity)||1}× ${esc(i.name_snapshot)}</strong><small>${label(i.station_snapshot)} · ${esc(i.kitchen_status)}${i.note?' · '+esc(i.note):''}</small></div>${a?`<button data-production-item="${i.id}" data-production-status="${a[0]}">${a[1]}</button>`:''}</div>`}).join('')}</div></article>`).join(''):'<div class="empty">Aucune commande en préparation.</div>'}</div>
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
  const catalog=state.bootstrap?.catalog||[],cats=['Tous',...new Set(catalog.map(x=>x.category||'Autres'))];
  if(!cats.includes(state.category))state.category='Tous';
  const visible=state.category==='Tous'?catalog:catalog.filter(x=>(x.category||'Autres')===state.category);
  return `<div class="shell">${topbar()}
  ${state.error?'<div class="notice error banner">'+esc(state.error)+'</div>':''}
  <main class="workspace"><nav class="categories">${cats.map(c=>`<button class="category ${c===state.category?'active':''}" data-category="${esc(c)}">${esc(c)}</button>`).join('')}</nav>
  <section class="products"><div class="product-toolbar"><button class="secondary" id="quick-item">+ Article libre</button><span>${catalog.length} article${catalog.length>1?'s':''}</span></div>${visible.length?`<div class="product-grid">${visible.map(p=>`<button class="product" data-product="${p.id}"><strong>${esc(p.name)}</strong><small>${p.production_station==='bar'?'Bar':p.production_station==='none'?'Sans production':'Cuisine'}</small><span class="price">${money(p.price)}</span></button>`).join('')}</div>`:'<div class="empty"><h3>Catalogue POS vide</h3><p>Les articles seront publiés depuis ReMaPro Hub.</p></div>'}</section>
  <aside class="cart"><div class="cart-head"><h2>Commande</h2><div class="order-meta"><select id="service-type"><option value="counter" ${state.serviceType==='counter'?'selected':''}>Comptoir</option><option value="dine_in" ${state.serviceType==='dine_in'?'selected':''}>Sur place</option><option value="takeaway" ${state.serviceType==='takeaway'?'selected':''}>À emporter</option></select><input id="table-label" placeholder="Table" value="${esc(state.tableLabel)}"><input id="covers" type="number" min="0" value="${Number(state.covers)||0}" title="Couverts"></div></div>
  <div class="cart-list">${state.cart.length?state.cart.map(x=>`<div class="line ${x.delta?'delta-line':x.locked?'locked-line':''}"><div><strong>${esc(x.name)}</strong>${x.delta?'<span class="delta-badge">Ajout</span>':x.locked?'<span class="sent-badge">Envoyé</span>':''}<div>${money(x.price)} × ${x.qty}</div></div><div class="qty"><button data-minus="${x.id}" ${x.locked?'disabled':''}>−</button><span>${x.qty}</span><button data-plus="${x.id}" ${x.locked?'disabled':''}>+</button></div></div>`).join(''):'<div class="empty">Touchez un article pour commencer.</div>'}</div>
  <div class="cart-foot"><div class="total-row"><span>Total</span><span>${money(cartTotal())}</span></div>
    ${currentServerOrder()?'<div class="order-actions production-actions"><button class="secondary" id="transfer-order">Transférer</button><button class="secondary" id="send-production" '+(orderLocked()&&!hasPendingDelta()?'disabled':'')+'>'+(orderLocked()?'Envoyer les ajouts':'Envoyer cuisine/bar')+'</button><button class="secondary danger-btn" id="cancel-order" '+(progressivePaymentActive()?'disabled':'')+'>Annuler</button></div>':''}
    ${(state.activeTableId||state.serviceType==='dine_in')?'<button class="save-note" id="save-open-order" '+(!state.cart.length||orderLocked()?'disabled':'')+'>Enregistrer la note</button>':''}
    <div class="split-actions"><button class="split-pay" id="split-pay" ${!state.cart.length||progressivePaymentActive()?'disabled':''}>Partager par montants</button><button class="split-pay split-items-pay" id="split-items" ${!state.cart.length||!state.online||progressivePaymentActive()?'disabled':''}>Partager par articles</button></div><button class="progressive-pay" id="progressive-pay" ${!state.cart.length||!state.online?'disabled':''}>${progressivePaymentActive()?'Continuer le paiement par personne':'Encaisser une personne'}</button><div class="payments"><button data-pay="cash" ${!state.cart.length||progressivePaymentActive()?'disabled':''}>Espèces</button><button data-pay="card" ${!state.cart.length||progressivePaymentActive()?'disabled':''}>Carte</button><button data-pay="twint" ${!state.cart.length||progressivePaymentActive()?'disabled':''}>TWINT</button></div>${state.receipts[0]?.receiptNumber?`<div class="last-receipt">Dernier ticket: <strong>${esc(state.receipts[0].receiptNumber)}</strong> · ${money(state.receipts[0].total)}</div>`:''}</div></aside></main></div>`;
}
function render(){
  if(!currentSession()){app.innerHTML=loginView();wire();return}
  if(!state.identity){app.innerHTML=`<div class="login-wrap"><div class="card"><h1>ReMaPro POS</h1><p>${state.busy?'Chargement…':'Connexion au compte…'}</p>${state.error?'<div class="notice error">'+esc(state.error)+'</div>':''}</div></div>`;wire();return}
  if(!state.restaurant){app.innerHTML=pickerView();wire();return}
  if(!state.cashSession){app.innerHTML=sessionView();wire();return}
  app.innerHTML=state.view==='floor'?floorView():state.view==='production'?productionView():state.view==='tickets'?ticketsView():state.view==='report'?reportView():state.view==='terminals'?terminalsView():state.view==='printers'?printersView():mainView();wire();
}
function wire(){
  document.querySelector('#login-form')?.addEventListener('submit',async e=>{e.preventDefault();state.busy=true;state.error='';render();const fd=new FormData(e.currentTarget);try{await signIn(fd.get('email'),fd.get('password'));await loadAccount()}catch(error){state.error=error.message||String(error);state.busy=false;render()}});
  document.querySelector('#restaurant-select')?.addEventListener('change',async e=>{const r=(state.identity?.restaurants||[]).find(x=>x.id===e.target.value);if(r){await kvSet('restaurantId',r.id);await bootstrapRestaurant(r)}});
  document.querySelector('#logout')?.addEventListener('click',()=>{signOut();state.identity=null;state.restaurant=null;render()});
  document.querySelector('#switch-restaurant')?.addEventListener('click',()=>{state.restaurant=null;state.cashSession=null;render()});
  document.querySelector('#open-session')?.addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);await openSession(Number(String(fd.get('opening')).replace(',','.'))||0)});
  document.querySelector('#nav-sale')?.addEventListener('click',()=>{state.view='sale';state.activeOrderId=null;state.activeTableId=null;state.tableLabel='';state.serviceType='counter';state.cart=[];render()});
  document.querySelector('#nav-floor')?.addEventListener('click',()=>{state.view='floor';refreshFloorData().then(render)});
  document.querySelector('#nav-production')?.addEventListener('click',()=>{state.view='production';refreshProductionQueue().then(render)});
  document.querySelector('#nav-tickets')?.addEventListener('click',()=>{state.view='tickets';refreshReceipts().then(render)});
  document.querySelector('#nav-report')?.addEventListener('click',()=>{state.view='report';state.reportDate=state.reportDate||dateKey();refreshServiceReport(state.reportDate)});
  document.querySelector('#nav-terminals')?.addEventListener('click',()=>{state.view='terminals';refreshTerminals().then(render)});
  document.querySelector('#nav-printers')?.addEventListener('click',()=>{state.view='printers';refreshPrinters().then(render)});
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
  document.querySelectorAll('[data-order]').forEach(b=>b.addEventListener('click',()=>{const o=state.openOrders.find(x=>x.id===b.dataset.order);if(!o)return;state.activeOrderId=o.id;state.activeTableId=o.table_id||null;state.tableLabel=o.table_label||'';state.serviceType=o.service_type||'dine_in';state.covers=o.covers||1;const locked=o.status!=='open';state.cart=(o.items||[]).map(item=>({id:item.catalog_item_id||('saved:'+item.id),catalog_item_id:item.catalog_item_id||null,line_id:item.id,recipe_id:item.recipe_id||null,sku:item.sku_snapshot||'',name:item.name_snapshot,price:Number(item.unit_price)||0,tax_rate:Number(item.tax_rate)||0,production_station:item.station_snapshot||'kitchen',qty:Number(item.quantity)||1,quick:!item.catalog_item_id,locked,delta:false}));state.view='sale';render()}));
  document.querySelector('#save-open-order')?.addEventListener('click',()=>saveOpenOrder());
  document.querySelector('#split-pay')?.addEventListener('click',()=>splitCheckout());
  document.querySelector('#split-items')?.addEventListener('click',()=>openAllocatedSplit());
  document.querySelector('#progressive-pay')?.addEventListener('click',()=>openProgressivePayment());
  document.querySelector('#transfer-order')?.addEventListener('click',()=>transferCurrentOrder());
  document.querySelector('#cancel-order')?.addEventListener('click',()=>cancelCurrentOrder());
  document.querySelector('#send-production')?.addEventListener('click',()=>sendCurrentOrderProduction());
  document.querySelector('#refresh-production')?.addEventListener('click',()=>refreshProductionQueue().then(render));
  document.querySelectorAll('[data-station]').forEach(b=>b.addEventListener('click',()=>{state.productionStation=b.dataset.station;render()}));
  document.querySelectorAll('[data-production-item]').forEach(b=>b.addEventListener('click',()=>updateProductionItem(b.dataset.productionItem,b.dataset.productionStatus)));
  document.querySelectorAll('[data-print-production]').forEach(b=>b.addEventListener('click',()=>{const o=state.productionQueue.find(x=>x.id===b.dataset.printProduction);if(o)smartPrintProduction(o)}));
  document.querySelector('#refresh-receipts')?.addEventListener('click',()=>refreshReceipts().then(render));
  document.querySelectorAll('[data-print-receipt]').forEach(b=>b.addEventListener('click',()=>{const r=state.receipts.find(x=>x.id===b.dataset.printReceipt);if(r)smartPrintReceipt(r)}));
  document.querySelectorAll('[data-print-split-payment]').forEach(b=>b.addEventListener('click',()=>{const [orderId,paymentId]=String(b.dataset.printSplitPayment||'').split(':');const r=state.receipts.find(x=>x.id===orderId);const p=r?.payments?.find(x=>x.id===paymentId);if(r&&p){if(p.metadata?.splitType==='progressive_items')printProgressivePayment(r,p);else printSplitPayment(r,p)}}));
  document.querySelectorAll('[data-refund-order]').forEach(b=>b.addEventListener('click',()=>{const r=state.receipts.find(x=>x.id===b.dataset.refundOrder);if(r)refundReceipt(r)}));
  document.querySelectorAll('[data-confirm-refund]').forEach(b=>b.addEventListener('click',()=>confirmRefund(b.dataset.confirmRefund,true)));
  document.querySelectorAll('[data-fail-refund]').forEach(b=>b.addEventListener('click',()=>confirmRefund(b.dataset.failRefund,false)));
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
  document.querySelectorAll('[data-pay]').forEach(b=>b.addEventListener('click',()=>payByMethod(b.dataset.pay)));
}
async function init(){
  if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
  window.addEventListener('online',()=>{state.online=true;render();flushQueue().catch(()=>{})});
  window.addEventListener('offline',()=>{state.online=false;render()});
  setInterval(()=>{if(state.view==='production'&&state.online&&state.restaurant)refreshProductionQueue().then(render).catch(()=>{})},10000);
  await updateQueueCount();if(!currentSession()){render();return}await loadAccount();
}
init();
