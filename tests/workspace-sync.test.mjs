import assert from 'node:assert/strict';
import {load,exportWorkspace,applyWorkspaceData,restrictWorkspace,resetWorkspaceKeys,WORKSPACE_KEYS} from '../src/store.js';

const values=new Map();
globalThis.localStorage={
  getItem:key=>values.get(key)??null,
  setItem:(key,value)=>values.set(key,value),
  removeItem:key=>values.delete(key)
};

const state=load();
state.stock=[{id:'rice',name:'Rice',qty:2,min:1,price:1}];
state.temps=[{equipment:'Fridge',value:4}];
state.financeHistory=[{date:'2026-09-18',revenue:100,expenses:20,covers:4}];
state.tasks=[['openKitchen',true]];

const exported=exportWorkspace(state);
assert.ok(WORKSPACE_KEYS.includes('stock'));
assert.ok(WORKSPACE_KEYS.includes('financeHistory'));
assert.equal(exported.stock[0].name,'Rice');
exported.stock[0].name='Changed outside';
assert.equal(state.stock[0].name,'Rice','workspace export must be deep-cloned');

const invalidBefore=JSON.stringify(state.stock);
assert.equal(applyWorkspaceData(state,{stock:'not-an-array'}),false);
assert.equal(JSON.stringify(state.stock),invalidBefore,'invalid patch must not partially mutate state');

const remote={stock:[{id:'cloud',name:'Cloud Stock',qty:3,min:0,price:2}],temps:[{equipment:'Freezer',value:-18}]};
assert.equal(applyWorkspaceData(state,remote),true);
remote.stock[0].name='Mutated';
assert.equal(state.stock[0].name,'Cloud Stock','workspace import must clone remote data');

assert.equal(restrictWorkspace(state,['stock','temps']),true);
assert.equal(state.financeHistory.length,0,'unauthorized finance data must be purged');
assert.equal(state.stock[0].name,'Cloud Stock');
assert.equal(state.temps[0].value,-18);

assert.equal(resetWorkspaceKeys(state,['stock']),true);
assert.equal(state.stock.length,0);
assert.equal(state.temps[0].value,-18);

console.log('Workspace export, import, restriction and reset semantics OK');
