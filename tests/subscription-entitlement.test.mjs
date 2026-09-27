import assert from 'node:assert/strict';
import fs from 'node:fs';

globalThis.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});
const {subscriptionAccessForIdentity,accessibleRestaurants}=await import('../src/cloud.js');

const now=new Date('2026-09-27T12:00:00Z');
const org={id:'org',created_at:'2026-09-25T00:00:00Z'};
const identity={organizations:[org],subscriptions:[]};

assert.equal(subscriptionAccessForIdentity({...identity,subscriptions:[{organization_id:'org',status:'active',restaurant_limit:3,plan:{code:'standard'}}]},'org',now).restaurantLimit,3);
assert.equal(subscriptionAccessForIdentity({...identity,subscriptions:[{organization_id:'org',status:'trialing',trial_ends_at:'2026-09-28T00:00:00Z'}]},'org',now).allowed,true);
assert.equal(subscriptionAccessForIdentity({...identity,subscriptions:[{organization_id:'org',status:'trialing',trial_ends_at:'2026-09-26T00:00:00Z'}]},'org',now).allowed,false);
assert.equal(subscriptionAccessForIdentity({...identity,subscriptions:[{organization_id:'org',status:'past_due',current_period_end:'2026-09-28T00:00:00Z'}]},'org',now).allowed,true);
assert.equal(subscriptionAccessForIdentity({...identity,subscriptions:[{organization_id:'org',status:'past_due',current_period_end:'2026-09-26T00:00:00Z'}]},'org',now).allowed,true,'billing issue remains entitled until EXPIRATION');
assert.equal(subscriptionAccessForIdentity({...identity,subscriptions:[{organization_id:'org',status:'expired'}]},'org',now).allowed,false);
assert.equal(subscriptionAccessForIdentity(identity,'org',new Date('2026-10-08T00:00:00Z')).allowed,true,'legacy fallback remains valid inside fourteen days');
assert.equal(subscriptionAccessForIdentity(identity,'org',new Date('2026-10-09T00:00:01Z')).allowed,false,'legacy fallback expires after fourteen days');
assert.equal(subscriptionAccessForIdentity({restaurants:[]},'org',now).status,'legacy_cache','old offline identity cache must not abruptly break a service before first refresh');

const restaurants=[
  {id:'a',organization_id:'org',name:'A'},
  {id:'b',organization_id:'org',name:'B'},
  {id:'c',organization_id:'other',name:'C'}
];
assert.deepEqual(accessibleRestaurants({restaurants,memberships:[{organization_id:'org',restaurant_id:'a',role:'employee'}]}).map(x=>x.id),['a'],'restaurant-scoped staff must only see assigned POS establishments');
assert.deepEqual(accessibleRestaurants({restaurants,memberships:[{organization_id:'org',restaurant_id:null,role:'network_admin'}]}).map(x=>x.id),['a','b'],'organization admin must see every establishment in its organization');
assert.deepEqual(accessibleRestaurants({restaurants,memberships:[{organization_id:'org',restaurant_id:null,role:'employee'}]}).map(x=>x.id),[],'non-admin organization-wide membership must not grant POS establishment access');

const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const cloud=fs.readFileSync(new URL('../src/cloud.js',import.meta.url),'utf8');
const i18n=fs.readFileSync(new URL('../src/i18n.js',import.meta.url),'utf8');

for(const token of ['currentSubscriptionAccess','subscriptionRequiredView','SUBSCRIPTION_REQUIRED','remapro:subscription-required'])
  assert.ok(app.includes(token),'POS app entitlement gate must include '+token);
const renderStart=app.indexOf('function render(){'),renderEnd=app.indexOf('function wire(){',renderStart),renderBlock=app.slice(renderStart,renderEnd);
assert.ok(renderStart>=0&&renderEnd>renderStart,'POS render block must exist');
assert.ok(renderBlock.indexOf("if(!currentSubscriptionAccess().allowed)")<renderBlock.indexOf("if(state.operatorRequired&&!state.operator)"),'subscription gate must run before operator/service opening');
assert.ok(app.includes("expiredServiceContinuity()&&action==='close_cash_session'"),'expired service may queue only its final cash-session close');
assert.ok(app.includes('function expiredServiceContinuity()'),'POS must distinguish expired entitlement from an already-open service');
assert.ok(app.includes("if(!currentSubscriptionAccess().allowed&&!expiredServiceContinuity())"),'expired subscription screen must not strand an already-open service');
assert.ok(app.includes("if(expiredServiceContinuity()&&!currentServerOrder())"),'expiry continuity must reject checkout unless the note already exists on the server');
assert.ok(app.includes("if((!existing||existing.status==='open')&&!expiredServiceContinuity())"),'expiry continuity must never create/resave a new note while settling an existing one');
assert.ok(app.includes('if(!existing&&blockExpiredNewSale())return'),'an empty table must not become a new sale after expiry');
assert.ok(app.includes('if(blockExpiredNewSale())return;\n  if(!state.online){uiAlert(t(\'connectionRequired\'))'),'direct orders must remain blocked as new business after expiry');
for(const token of ['organizations?select=id,created_at','subscriptions?select=organization_id,status,trial_ends_at,current_period_end','restaurant_limit','remapro:subscription-required'])
  assert.ok(cloud.includes(token),'POS identity/server response handling must include '+token);
for(const token of ['subscriptionRequired','subscriptionRequiredHint'])
  assert.ok(i18n.includes(token),'POS translations must include '+token);

console.log('POS pre-launch subscription gate and offline continuity checks passed');

for(const token of ['noRestaurantAssigned','noRestaurantAssignedHint'])
  assert.ok(app.includes(token),'POS zero-restaurant recovery screen must include '+token);
assert.ok(app.includes("const restaurants=state.identity?.restaurants||[]")&&app.includes("if(!restaurants.length)"),'picker must explicitly handle an empty restaurant list');
assert.ok(app.includes('const restaurants=accessibleRestaurants(cached)'),'offline identity cache must be re-filtered before POS restaurant selection');
