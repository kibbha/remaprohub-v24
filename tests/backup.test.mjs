import assert from 'node:assert/strict';
import {load,save,exportData,importData} from '../src/store.js';
const storage=new Map();globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
const state=load();state.preferences.restaurant='Bistro';state.documentEntries.push({type:'inventory',date:'2026-09-18',title:'Stock',details:'Test'});save(state);
const backup=exportData(state);state.preferences.restaurant='Changed';state.documentEntries=[];
assert.equal(importData(state,backup),true);assert.equal(state.preferences.restaurant,'Bistro');assert.equal(state.documentEntries[0].title,'Stock');
assert.equal(load().preferences.restaurant,'Bistro');
const legacy26=JSON.parse(backup);legacy26.version=26;assert.equal(importData(state,JSON.stringify(legacy26)),true);assert.equal(state.preferences.restaurant,'Bistro');
for(const invalid of ['not json',JSON.stringify({version:24,state:{}}),JSON.stringify({version:27,state:{...JSON.parse(backup).state,docs:{}}})]){const before=JSON.stringify(state);assert.equal(importData(state,invalid),false);assert.equal(JSON.stringify(state),before)}
console.log('Backup restore, V26 compatibility and rejection guards OK');
