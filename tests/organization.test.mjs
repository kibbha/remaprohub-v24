import assert from 'node:assert/strict';
import {load,save,recordRestaurant,switchRestaurant,activeRestaurant,recordManager,recordStaffAccess,staffCanAccess,removeRestaurant,ensureOrganizationState,mergeCloudRestaurants} from '../src/store.js';

const storage=new Map();
globalThis.localStorage={
  getItem:key=>storage.get(key)??null,
  setItem:(key,value)=>storage.set(key,value),
  removeItem:key=>storage.delete(key)
};

const state=load();
const firstId=state.activeRestaurantId;
state.preferences.restaurant='Alpha';
state.stock.push({id:'milk',name:'Milk',qty:2,min:0,price:1});
save(state);

const beta=recordRestaurant(state,{name:'Beta',country:'CH',region:'Geneva',currency:'CHF'},new Date());
assert.ok(beta,'trial must expose full multi features');
assert.equal(switchRestaurant(state,beta.id,new Date()),true);
assert.equal(activeRestaurant(state).name,'Beta');
assert.equal(state.stock.length,0,'new restaurant must start with empty workspace');
state.stock.push({id:'bread',name:'Bread',qty:3,min:0,price:1});
save(state);

assert.equal(switchRestaurant(state,firstId,new Date()),true);
assert.equal(state.stock.length,1);
assert.equal(state.stock[0].name,'Milk');
assert.equal(switchRestaurant(state,beta.id,new Date()),true);
assert.equal(state.stock[0].name,'Bread');

const manager=recordManager(state,{name:'Second Manager',email:'manager2@example.com',restaurantIds:[firstId,beta.id]},new Date());
assert.ok(manager);
const staff=recordStaffAccess(state,{name:'Team User',email:'staff@example.com',restaurantIds:[beta.id],permissions:['operations','stock','finance']},new Date());
assert.ok(staff);
assert.deepEqual(staff.permissions,['operations','stock','finance'],'supported staff permissions must be retained');
assert.equal(staffCanAccess(state,staff.id,'stock'),true);
assert.equal(staffCanAccess(state,staff.id,'finance'),true);

state.subscription={status:'active',trialStart:new Date().toISOString(),trialDays:14,plan:'standard',billing:'monthly'};
assert.equal(recordRestaurant(state,{name:'Gamma',currency:'CHF'},new Date()),false,'active Standard plan must block extra restaurants');
assert.equal(recordManager(state,{name:'Third',email:'third@example.com',restaurantIds:[beta.id]},new Date()),false,'active Standard plan must block extra managers');
assert.equal(recordStaffAccess(state,{name:'Staff 2',email:'staff2@example.com',restaurantIds:[beta.id],permissions:['stock']},new Date()),false,'active Standard plan must block staff access accounts');
assert.equal(switchRestaurant(state,firstId,new Date()),false,'active Standard plan must block restaurant switching');

state.subscription.plan='multi';
assert.equal(switchRestaurant(state,firstId,new Date()),true,'active Multi plan must allow restaurant switching');

const merged=mergeCloudRestaurants(state,[
  {id:'cloud-beta',name:'Beta',country_code:'CH',canton:'GE',currency:'CHF',active:true},
  {id:'cloud-gamma',name:'Gamma Cloud',country_code:'CH',canton:'GE',currency:'CHF',active:true}
]);
assert.ok(merged>=2,'cloud sync should link the matching restaurant and add authorized missing restaurants');
assert.equal(state.restaurants.find(x=>x.name==='Beta').cloudId,'cloud-beta');
const gamma=state.restaurants.find(x=>x.cloudId==='cloud-gamma');
assert.ok(gamma);
assert.equal(gamma.workspace.stock.length,0,'new cloud restaurant must get an isolated empty workspace');

state.subscription.plan='standard';
assert.equal(switchRestaurant(state,gamma.id,new Date()),false,'local Standard rules still block ordinary switching');
assert.equal(switchRestaurant(state,gamma.id,new Date(),true),true,'validated cloud authorization may force the workspace switch');
assert.equal(state.stock.length,0);
assert.equal(removeRestaurant(state,gamma.id),true);
state.subscription.plan='multi';

const persisted=JSON.parse(storage.get('remaprohub.v27.state'));
assert.equal(persisted.restaurants.length,2);
assert.ok(persisted.restaurants.every(r=>r.workspace&&typeof r.workspace==='object'));

assert.equal(removeRestaurant(state,beta.id),true);
assert.equal(state.restaurants.length,1);
assert.equal(removeRestaurant(state,firstId),false,'last restaurant cannot be deleted');

const loaded=load();
ensureOrganizationState(loaded,new Date(),true);
assert.equal(loaded.restaurants.length,1);
assert.equal(loaded.activeRestaurantId,loaded.restaurants[0].id);

storage.clear();
const limitState=load();
for(let i=2;i<=5;i++)assert.ok(recordRestaurant(limitState,{name:'Limit '+i,currency:'CHF'},new Date()),'trial/Pro must allow up to five restaurants');
assert.equal(limitState.restaurants.length,5);
assert.equal(recordRestaurant(limitState,{name:'Limit 6',currency:'CHF'},new Date()),false,'trial/Pro must block a sixth restaurant');

console.log('Multi-restaurant workspaces and organization access rules OK');
