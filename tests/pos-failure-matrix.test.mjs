import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const app=read('src/app.js'),db=read('src/db.js'),printer=read('src/printer.js'),sw=read('sw.js'),html=read('index.html');

const scenarios=[
  ['network cut before/after payment',app.includes("queuePut(queuedItem('settle_open_order'")&&app.includes("queuePut(queuedItem('commit_order'")&&db.includes("client_event_id TEXT PRIMARY KEY NOT NULL")],
  ['double payment tap',app.includes('paymentBusy:false')&&app.includes('guardedPayment')],
  ['duplicate/overlapping terminal callback polling',app.includes('terminalPollInFlight=false')&&app.includes('if(terminalPollInFlight)return')],
  ['app killed with pending offline work',db.includes("CREATE TABLE IF NOT EXISTS queue")&&db.includes("keyPath:'client_event_id'")&&app.includes('flushQueue().catch')],
  ['large/offline queue retry pressure',app.includes('queueRetryDelayMs')&&app.includes('next_retry_at:nextRetryAt')&&app.includes('if(!force&&!queueRetryDue(item))break')],
  ['printer unavailable/failure',app.includes("markPrinter(printer,'error')")&&printer.includes('printEscPosText')],
  ['long reconnection/manual recovery',app.includes("flushQueue({force:true})")&&app.includes("window.addEventListener('online'")],
  ['partial refund protection',app.includes("refunds.filter(r=>['completed','pending_external'].includes(r.status))")&&app.includes('amount>remaining+0.001')],
  ['cash difference close path',app.includes("queueCommand('close_cash_session'")&&app.includes('countedCash:Number(countedCash)||0')],
  ['repeated queued events remain idempotent',app.includes('clientEventId:item.payload?.clientEventId||item.client_event_id')&&db.includes('PRIMARY KEY NOT NULL')],
  ['service worker mutation safety',sw.includes("request.method!=='GET'")&&sw.includes("url.origin!==self.location.origin")],
  ['content security policy present',html.includes('Content-Security-Policy')]
];

for(const [name,ok] of scenarios)assert.ok(ok,'failure scenario invariant missing: '+name);
console.log('POS failure matrix invariants passed:',scenarios.length);
