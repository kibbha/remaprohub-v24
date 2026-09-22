import assert from 'node:assert/strict';
import {PLAN_CONFIG,load,resetState,exportData,importData,ensureSubscriptionState,trialRemaining,subscriptionPrice,selectSubscriptionPlan} from '../src/store.js';

const storage=new Map();
globalThis.localStorage={
  getItem:key=>storage.get(key)??null,
  setItem:(key,value)=>storage.set(key,value),
  removeItem:key=>storage.delete(key)
};

assert.equal(PLAN_CONFIG.standard.monthly,19.90);
assert.equal(PLAN_CONFIG.standard.yearly,199);
assert.equal(PLAN_CONFIG.standard.restaurants,1);
assert.equal(PLAN_CONFIG.standard.managers,1);
assert.equal(PLAN_CONFIG.multi.monthly,39.90);
assert.equal(PLAN_CONFIG.multi.yearly,399);
assert.equal(PLAN_CONFIG.multi.restaurants,5);
assert.equal(PLAN_CONFIG.multi.staffLimited,true);

const state=load();
assert.equal(state.subscription.status,'trialing');
assert.equal(state.subscription.trialDays,14);
assert.ok(state.subscription.trialStart);
assert.ok(JSON.parse(storage.get('remaprohub.v27.state')).subscription.trialStart,'trial start must persist immediately');

state.subscription={status:'trialing',trialStart:'2026-09-18T08:00:00.000Z',trialDays:7,plan:'standard',billing:'monthly'};
assert.equal(ensureSubscriptionState(state,new Date('2026-09-26T08:00:00.000Z')),true);
assert.equal(state.subscription.trialDays,14,'legacy seven-day trials must be upgraded to fourteen days');
assert.equal(state.subscription.status,'trialing');
assert.equal(trialRemaining(state,new Date('2026-09-26T08:00:00.000Z')),6);
assert.equal(ensureSubscriptionState(state,new Date('2026-10-02T08:00:00.000Z')),true);
assert.equal(state.subscription.status,'expired');
assert.equal(trialRemaining(state,new Date('2026-10-02T08:00:00.000Z')),0);

state.subscription={status:'trialing',trialStart:new Date().toISOString(),trialDays:14,plan:'standard',billing:'monthly'};
assert.equal(subscriptionPrice(state),19.90);
assert.equal(selectSubscriptionPlan(state,{plan:'multi',billing:'yearly'}),true);
assert.equal(state.subscription.plan,'multi');
assert.equal(state.subscription.billing,'yearly');
assert.equal(subscriptionPrice(state),399);
assert.equal(selectSubscriptionPlan(state,{plan:'invalid',billing:'monthly'}),false);
const preservedStart=state.subscription.trialStart,preservedPlan=state.subscription.plan,preservedBilling=state.subscription.billing;
state.stock=[{id:'x',name:'X',qty:1}];
resetState(state);
assert.equal(state.subscription.trialStart,preservedStart,'data reset must not restart trial');
assert.equal(state.subscription.plan,preservedPlan);
assert.equal(state.subscription.billing,preservedBilling);
assert.equal(state.stock.length,0);


const backup=JSON.parse(exportData(state));
delete backup.state.subscription;
const target=load();
assert.equal(importData(target,JSON.stringify(backup)),true,'older V27 backup without subscription must remain importable');
assert.equal(target.subscription.plan,'standard');
assert.equal(target.subscription.trialDays,14);

console.log('Subscription trial, prices and backward-compatible backup restore OK');
