import assert from 'node:assert/strict';
import {load,save,recordRestaurant,switchRestaurant,activeRestaurant,recordManager,recordStaffAccess,staffCanAccess,removeRestaurant,ensureOrganizationState} from '../src/store.js';

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
assert.deepEqual(staff.permissions,['operations','stock'],'unknown or sensitive staff permissions must be removed');
assert.equal(staffCanAccess(state,staff.id,'stock'),true);
assert.equal(staffCanAccess(state,staff.id,'finance'),false);

state.subscription={status:'active',trialStart:new Date().toISOString(),trialDays:7,plan:'standard',billing:'monthly'};
assert.equal(recordRestaurant(state,{name:'Gamma',currency:'CHF'},new Date()),false,'active Standard plan must block extra restaurants');
assert.equal(recordManager(state,{name:'Third',email:'third@example.com',restaurantIds:[beta.id]},new Date()),false,'active Standard plan must block extra managers');
assert.equal(recordStaffAccess(state,{name:'Staff 2',email:'staff2@example.com',restaurantIds:[beta.id],permissions:['stock']},new Date()),false,'active Standard plan must block staff access accounts');
assert.equal(switchRestaurant(state,firstId,new Date()),false,'active Standard plan must block restaurant switching');

state.subscription.plan='multi';
assert.equal(switchRestaurant(state,firstId,new Date()),true,'active Multi plan must allow restaurant switching');

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

console.log('Multi-restaurant workspaces and organization access rules OK');
