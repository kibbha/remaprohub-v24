import fs from 'node:fs';
import assert from 'node:assert/strict';

const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const i18n=fs.readFileSync(new URL('../src/i18n.js',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../src/ui.js',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
const workflow=fs.readFileSync(new URL('../.github/workflows/pos-android-validation.yml',import.meta.url),'utf8');
const harden=fs.readFileSync(new URL('../scripts/harden-android.mjs',import.meta.url),'utf8');
const cloud=fs.readFileSync(new URL('../src/cloud.js',import.meta.url),'utf8');
const printerNative=fs.readFileSync(new URL('../android-native/NetworkPrinterPlugin.java',import.meta.url),'utf8');

assert.equal((app.match(/\bprompt\(/g)||[]).length,0,'native prompt() must not be used');
assert.equal((app.match(/\bconfirm\(/g)||[]).length,0,'native confirm() must not be used');
assert.equal((app.match(/\balert\(/g)||[]).length,0,'native alert() must not be used');
assert.ok(app.includes("from './i18n.js'"),'runtime i18n imported');
assert.ok(app.includes("from './ui.js'"),'touch dialog system imported');
for(const lang of ['fr','en','de','it'])assert.ok(i18n.includes(lang+':{'),lang+' dictionary required');
assert.ok(i18n.includes('translateDom'),'rendered UI translation required');
const modalMounts=(app.match(/document\.body\.appendChild\(modal\)/g)||[]).length;
const translatedModalMounts=(app.match(/appendChild\(modal\);translateDom\(modal\)/g)||[]).length;
assert.equal(translatedModalMounts,modalMounts,'dynamic POS modals must be translated at mount time');
for(const key of ['managerRequired','tableTransferNeedsNetwork','noFreeTable','tableNotFound','orderNotSaved','cancelNeedsNetwork','itemLocked','splitInvalid','splitTotalMismatch','refundNeedsNetwork','openCashBeforeRefund','alreadyRefunded','sendNewItemsFirst']){
  assert.ok(app.includes(`t('${key}')`),`critical POS message must use i18n key: ${key}`);
}
assert.ok(ui.includes('role="dialog"'),'accessible modal role required');
assert.ok(ui.includes("aria-modal"),'modal aria semantics required');
assert.ok(ui.includes("aria-labelledby"),'modal title must be announced');
assert.ok(ui.includes("e.key!=='Tab'"),'modal keyboard focus trap required');
assert.ok(ui.includes('previousFocus'),'modal must restore prior focus');
assert.ok(ui.includes("e.key==='Escape'"),'modal Escape handling required');
assert.ok(html.includes('Content-Security-Policy'),'POS CSP required');
assert.ok(sw.includes('./src/i18n.js')&&sw.includes('./src/ui.js')&&sw.includes('./src/telemetry.js'),'offline shell must cache new runtime modules');
assert.ok(app.includes("from './telemetry.js'"),'diagnostics module must be wired');
assert.ok(app.includes("sync.queue_error"),'queue failures must be instrumented');
for(const event of ['device.state','terminal.poll_error','terminal.start_error','terminal.cancel_error','printer.error','printer.discovery_error'])assert.ok(app.includes(event),event+' diagnostic missing');
assert.ok(sw.includes('skipWaiting')&&sw.includes('clients.claim'),'service worker update activation required');
assert.ok(css.includes('min-height:44px'),'touch targets must have 44px minimum');
assert.ok(css.includes('focus-visible'),'keyboard focus style required');
assert.ok(app.includes('paymentBusy:false'),'payment double-tap lock state required');
assert.ok(app.includes('guardedPayment'),'critical payment guard required');
assert.ok(app.includes("function canOperatorPermission(permission='sale')"),'shared POS must expose a generic operator permission gate');
assert.ok(app.includes("function requireOperatorPermission(permission='sale')"),'POS runtime must reject unauthorized operator actions before queueing them');
assert.ok(app.includes("function canManagerPermission(permission='settings')"),'shared POS must combine cloud-manager and operator permissions');
assert.ok(app.includes("if(!canManageSettings()){uiAlert(t('managerRequired'));return}"),'manager editors must respect active operator permission');
for(const [signature,permission] of [
  ['async function openSession','cash'],['async function closeSession','cash'],
  ['async function saveOpenOrder','sale'],['async function checkout','sale'],['async function splitCheckout','sale'],
  ['async function refundReceipt','refund'],['async function cancelCurrentOrder','cancel'],
  ['async function transferCurrentOrder','transfer'],['async function mergeCurrentOrderTable','transfer'],
  ['async function sendCurrentOrderProduction','production'],['async function updateProductionItem','production']
]){
  const start=app.indexOf(signature);
  assert.ok(start>=0,'missing POS handler '+signature);
  assert.ok(app.slice(start,start+240).includes(`requireOperatorPermission('${permission}')`),'operator permission guard missing: '+signature+' -> '+permission);
}
assert.ok(app.includes("if(!state.online||!canManagerPermission('refund'))return"),'external refund confirmation must respect active operator refund permission');
assert.ok(app.includes("canManageSettings()&&!plan"),'table administration must be hidden from non-manager PIN operators');
assert.ok(app.includes("preservedPermissions=existing&&nextRole===String(o.role||'')"),'editing an operator without changing role must preserve custom permissions');
assert.ok(app.includes("permissions:preservedPermissions"),'operator edit payload must not silently reset custom permissions');
assert.ok(cloud.includes("String(op.restaurantId||'')===restaurantId"),'operator PIN token must never cross restaurant boundaries');
assert.ok(cloud.includes("const body=operatorToken?{...payload,operatorSessionToken:operatorToken}:payload"),'POS calls must attach only a restaurant-matched operator token');
assert.ok(app.includes("state.support={tickets:[],loaded:false,loading:false,error:'',lastReply:'',selectedTicket:null,messages:[],conversationLoading:false}"),'restaurant switch must clear support tickets and conversations');
assert.ok(app.includes("state.academy={...state.academy")&&app.includes("managerRows:[]}"),'restaurant switch must invalidate academy organization state');
assert.match(app,/async function logoutPos\(\)\{[\s\S]{0,240}resetRestaurantRuntime\(\)/,'logout must clear restaurant-scoped runtime before the next account');

assert.ok(sw.includes("url.origin!==self.location.origin"),'service worker must ignore cross-origin requests');
assert.ok(sw.includes("runtime-config.js"),'runtime config must remain network-first');
assert.match(harden,/compileSdkVersion = 36/);
assert.match(harden,/targetSdkVersion = 36/);
assert.match(harden,/allowBackup="false"/);
assert.match(harden,/usesCleartextTraffic="false"/);
assert.match(workflow,/node scripts\/harden-android\.mjs/);
assert.match(workflow,/android:allowBackup="false"/);
assert.match(workflow,/android:usesCleartextTraffic="false"/);
assert.match(html,/frame-src 'none'/);
assert.match(html,/connect-src 'self' https:\/\/gkbzawjlmwjweuqckuxm\.supabase\.co/);
assert.match(cloud,/async function fetchWithTimeout/);
assert.match(cloud,/NETWORK_TIMEOUT/);
assert.match(printerNative,/PRINTER_DATA_TOO_LARGE/);
assert.match(printerNative,/PRINTER_HOST_BLOCKED/);
console.log('POS beta hardening checks passed');
