import assert from 'node:assert/strict';
import fs from 'node:fs';
import {classifyRevenueCatEvent as classify} from '../supabase/functions/remapro-revenuecat-webhook/policy.mjs';

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
console.log('RevenueCat event gating, product whitelist and deferred product-change tests passed');
