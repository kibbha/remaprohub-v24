import assert from 'node:assert/strict';
import {configureBilling,purchasePlan} from '../src/billing.js';

let customerActive=['remapro_1_monthly'];
let purchaseOptions=null;
let configured=null;
const packages=[
  {identifier:'slot_1',product:{identifier:'remapro_1_monthly'}},
  {identifier:'slot_2',product:{identifier:'remapro_2_monthly'}},
  {identifier:'slot_3',product:{identifier:'remapro_3_monthly'}}
];

globalThis.REMAPRO_REVENUECAT_ANDROID_API_KEY='rc-test-key';
globalThis.Capacitor={
  isNativePlatform:()=>true,
  Plugins:{
    Purchases:{
      configure:async options=>{configured=options;},
      getOfferings:async()=>({all:{default:{identifier:'default',availablePackages:packages}}}),
      getCustomerInfo:async()=>({customerInfo:{activeSubscriptions:customerActive}}),
      purchasePackage:async options=>{purchaseOptions=options;return{customerInfo:{entitlements:{active:{remapro:{}}}}};}
    }
  }
};

assert.equal(await configureBilling('user','org'),true);
assert.deepEqual(configured,{apiKey:'rc-test-key',appUserID:'user:org'});

await purchasePlan(2);
assert.equal(purchaseOptions.aPackage.product.identifier,'remapro_2_monthly','restaurant-count purchase must resolve the matching product even inside one shared offering');
assert.deepEqual(purchaseOptions.storeProductChangeInfo,{oldProductIdentifier:'remapro_1_monthly'},'Google Play subscription changes must identify the current product');

customerActive=['remapro_2_monthly'];
purchaseOptions=null;
await purchasePlan(2);
assert.equal(purchaseOptions.aPackage.product.identifier,'remapro_2_monthly');
assert.equal(purchaseOptions.storeProductChangeInfo,undefined,'repurchasing the already active product must not send product-change metadata');

console.log('RevenueCat restaurant-count purchase and Google Play product-change wiring OK');
