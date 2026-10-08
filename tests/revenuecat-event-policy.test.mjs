import assert from 'node:assert/strict';
import fs from 'node:fs';
import {classifyRevenueCatEvent as classify, shouldIgnoreOlderRevenueCatEvent as timeline, revenueCatEventRecordId} from '../supabase/functions/remapro-revenuecat-webhook/policy.mjs';

const event=(type,product_id='remapro_1',overrides={})=>({
  type,product_id,entitlement_ids:['remapro'],...overrides
});
for(let n=1;n<=5;n++){
  const basic=classify(event('INITIAL_PURCHASE','remapro_'+n));
  assert.equal(basic.action,'process');
  assert.equal(basic.restaurantLimit,n);
  const play=classify(event('RENEWAL','remapro_'+n+':monthly'));
  assert.equal(play.action,'process','Google Play base plan format must be supported');
  assert.equal(play.restaurantLimit,n);
}
for(const type of ['CANCELLATION','UNCANCELLATION','BILLING_ISSUE','EXPIRATION','SUBSCRIPTION_PAUSED','SUBSCRIPTION_EXTENDED']){
  assert.equal(classify(event(type,'remapro_2')).action,'process',type);
}
assert.equal(classify({type:'TEST'}).reason,'TEST_EVENT','RevenueCat dashboard test should not modify subscriptions');
assert.equal(classify(event('PRODUCT_CHANGE','remapro_1',{new_product_id:'remapro_5'})).reason,'AWAIT_EFFECTIVE_PURCHASE','deferred upgrade cannot grant 5 locations prematurely');
assert.equal(classify(event('TRANSFER','remapro_5')).action,'ignore','transfer needs subscriber reconciliation');
assert.equal(classify(event('VIRTUAL_CURRENCY_TRANSACTION','remapro_5')).action,'ignore');
assert.equal(classify(event('INITIAL_PURCHASE','other_app_5')).reason,'UNRELATED_PRODUCT');
assert.equal(classify(event('INITIAL_PURCHASE','xremapro_5')).action,'ignore');
assert.equal(classify(event('INITIAL_PURCHASE','remapro_6')).action,'ignore');
assert.equal(classify(event('INITIAL_PURCHASE','remapro_2',{entitlement_ids:['other']})).reason,'UNRELATED_ENTITLEMENT');
assert.equal(classify(event('INITIAL_PURCHASE','remapro_2',{entitlement_ids:[]})).action,'process','strict product whitelist permits omitted entitlements');
assert.equal(classify(null).action,'ignore');
assert.equal(classify('garbage').action,'ignore');
const webhook=fs.readFileSync(new URL('../supabase/functions/remapro-revenuecat-webhook/index.ts',import.meta.url),'utf8');
assert.ok(webhook.includes('const policy=classifyRevenueCatEvent(event)'));
assert.ok(webhook.includes('if(policy.action==="ignore")return json({ok:true,ignored:true'));
assert.ok(webhook.includes('restaurant_limit:restaurantLimit'));
assert.ok(webhook.includes('revenuecat_entitlement:"remapro"'));
assert.ok(webhook.includes('id:recordId'));
assert.ok(webhook.includes('shouldIgnoreOlderRevenueCatEvent'));
assert.ok(webhook.includes('.eq("active",true)'));
console.log('RevenueCat event gating, product whitelist and deferred product-change tests passed');

const uuid1=await revenueCatEventRecordId('rc_123');
const uuid2=await revenueCatEventRecordId('rc_123');
const uuid3=await revenueCatEventRecordId('rc_456');
assert.equal(uuid1,uuid2,'retries must use one stable PK');
assert.notEqual(uuid1,uuid3,'different notification IDs need different PKs');
assert.match(uuid1,/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,'event ID must be a version-5 style UUID');
await assert.rejects(revenueCatEventRecordId(''),/INVALID_REVENUECAT_EVENT_ID/);

const ts=1760000000000;
assert.equal(timeline(event('RENEWAL','remapro_2',{event_timestamp_ms:ts}),{revenuecat_product_id:'remapro_2'},ts+1000),'STALE_EVENT');
assert.equal(timeline(event('EXPIRATION','remapro_1',{event_timestamp_ms:ts+1000}),{revenuecat_product_id:'remapro_2'},ts),'PREVIOUS_PRODUCT_EVENT');
assert.equal(timeline(event('CANCELLATION','remapro_1',{event_timestamp_ms:ts+1000}),{revenuecat_product_id:'remapro_2'},ts),'PREVIOUS_PRODUCT_EVENT');
assert.equal(timeline(event('INITIAL_PURCHASE','remapro_2',{event_timestamp_ms:ts+1000}),{revenuecat_product_id:'remapro_1'},ts),'');
assert.equal(timeline(event('RENEWAL','remapro_2',{event_timestamp_ms:ts+1000}),{revenuecat_product_id:'remapro_1'},ts),'');
assert.equal(timeline(event('BILLING_ISSUE','remapro_1',{event_timestamp_ms:ts+1000}),null,ts),'');
assert.equal(timeline(event('RENEWAL','remapro_1'),null,0),'INVALID_EVENT_TIMESTAMP');
console.log('RevenueCat event ID idempotency and stale lifecycle guards passed');
