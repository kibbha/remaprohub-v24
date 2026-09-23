import fs from 'node:fs';
import assert from 'node:assert/strict';

const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const i18n=fs.readFileSync(new URL('../src/i18n.js',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../src/ui.js',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');

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
assert.ok(sw.includes("url.origin!==self.location.origin"),'service worker must ignore cross-origin requests');
assert.ok(sw.includes("runtime-config.js"),'runtime config must remain network-first');
console.log('POS beta hardening checks passed');
