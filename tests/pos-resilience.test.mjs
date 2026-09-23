import fs from 'node:fs';
import assert from 'node:assert/strict';

const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const db=fs.readFileSync(new URL('../src/db.js',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');

assert.ok(app.includes('queueFlushPromise=null'),'queue single-flight state required');
assert.ok(app.includes('async function flushQueueInternal()'),'queue flush implementation must be isolated');
assert.ok(app.includes('if(queueFlushPromise)return queueFlushPromise'),'concurrent queue flushes must collapse');
assert.ok(app.includes('terminalPollInFlight=false'),'terminal poll single-flight state required');
assert.ok(app.includes('if(terminalPollInFlight)return'),'overlapping terminal polls must be blocked');
assert.ok(app.includes('finally{terminalPollInFlight=false}'),'terminal poll guard must always release');
assert.ok(app.includes('function queuedPayload(item)'),'queued actions must normalize idempotency metadata');
assert.ok(app.includes('clientEventId:item.payload?.clientEventId||item.client_event_id'),'queued actions must preserve a stable client event id');
for(const action of ['open_cash_session','append_order_items','send_to_production','update_production_item','settle_open_order','settle_open_order_split','close_cash_session']){
  assert.ok(app.includes(`action:'${action}',restaurantId:item.restaurantId,...queuedPayload(item)`),`${action} must forward stable clientEventId`);
}
assert.ok(db.includes("keyPath:'client_event_id'"),'IndexedDB queue must deduplicate by client_event_id');
assert.ok(db.includes('client_event_id TEXT PRIMARY KEY NOT NULL'),'SQLite queue must deduplicate by client_event_id');
assert.ok(sw.includes("request.method!=='GET'"),'service worker must never cache mutation requests');
assert.ok(sw.includes("runtime-config.js"),'runtime config must keep network-first recovery');
console.log('POS resilience checks passed');
