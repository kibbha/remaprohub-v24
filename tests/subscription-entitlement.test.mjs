import assert from 'node:assert/strict';
import fs from 'node:fs';

globalThis.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});
const {subscriptionAccessForIdentity}=await import('../src/cloud.js');

const now=new Date('2026-09-27T12:00:00Z');
const org={id:'org',created_at:'2026-09-25T00:00:00Z'};
const identity={organizations:[org],subscriptions:[]};

assert.equal(subscriptionAccessForIdentity({...identity,subscriptions:[{organization_id:'org',status:'active',plan:{code:'standard'}}]},'org',now).allowed,true);
assert.equal(subscriptionAccessForIdentity({...identity,subscriptions:[{organization_id:'org',status:'trialing',trial_ends_at:'2026-09-28T00:00:00Z'}]},'org',now).allowed,true);
assert.equal(subscriptionAccessForIdentity({...identity,subscriptions:[{organization_id:'org',status:'trialing',trial_ends_at:'2026-09-26T00:00:00Z'}]},'org',now).allowed,false);
assert.equal(subscriptionAccessForIdentity({...identity,subscriptions:[{organization_id:'org',status:'past_due',current_period_end:'2026-09-28T00:00:00Z'}]},'org',now).allowed,true);
assert.equal(subscriptionAccessForIdentity({...identity,subscriptions:[{organization_id:'org',status:'expired'}]},'org',now).allowed,false);
assert.equal(subscriptionAccessForIdentity(identity,'org',new Date('2026-09-30T00:00:00Z')).allowed,true);
assert.equal(subscriptionAccessForIdentity(identity,'org',new Date('2026-10-03T00:00:01Z')).allowed,false);
assert.equal(subscriptionAccessForIdentity({restaurants:[]},'org',now).status,'legacy_cache','old offline identity cache must not abruptly break a service before first refresh');

const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const cloud=fs.readFileSync(new URL('../src/cloud.js',import.meta.url),'utf8');
const i18n=fs.readFileSync(new URL('../src/i18n.js',import.meta.url),'utf8');

for(const token of ['currentSubscriptionAccess','subscriptionRequiredView','SUBSCRIPTION_REQUIRED','remapro:subscription-required'])
  assert.ok(app.includes(token),'POS app entitlement gate must include '+token);
const renderStart=app.indexOf('function render(){'),renderEnd=app.indexOf('function wire(){',renderStart),renderBlock=app.slice(renderStart,renderEnd);
assert.ok(renderStart>=0&&renderEnd>renderStart,'POS render block must exist');
assert.ok(renderBlock.indexOf("if(!currentSubscriptionAccess().allowed)")<renderBlock.indexOf("if(state.operatorRequired&&!state.operator)"),'subscription gate must run before operator/service opening');
assert.ok(app.includes("if(!currentSubscriptionAccess().allowed)throw new Error('SUBSCRIPTION_REQUIRED')"),'offline queue must reject new mutations after local entitlement expiry');
for(const token of ['organizations?select=id,created_at','subscriptions?select=organization_id,status,trial_ends_at,current_period_end','remapro:subscription-required'])
  assert.ok(cloud.includes(token),'POS identity/server response handling must include '+token);
for(const token of ['subscriptionRequired','subscriptionRequiredHint'])
  assert.ok(i18n.includes(token),'POS translations must include '+token);

console.log('POS pre-launch subscription gate and offline continuity checks passed');

for(const token of ['noRestaurantAssigned','noRestaurantAssignedHint'])
  assert.ok(app.includes(token),'POS zero-restaurant recovery screen must include '+token);
assert.ok(app.includes("(state.identity?.restaurants||[]).length"),'picker must explicitly handle an empty restaurant list');
