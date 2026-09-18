import assert from 'node:assert/strict';
import {load,save,setStorageScope,storageScope} from '../src/store.js';

const values=new Map();
globalThis.localStorage={
  getItem:key=>values.get(key)??null,
  setItem:(key,value)=>values.set(key,value),
  removeItem:key=>values.delete(key)
};

setStorageScope('');
const local=load();
local.preferences.restaurant='Local';
local.stock=[{id:'local',name:'Local Milk',qty:1,min:0,price:1}];
save(local);
assert.equal(storageScope(),'');
assert.ok(values.has('remaprohub.v27.state'));

setStorageScope('user-a');
const userA=load();
assert.equal(userA.stock.length,0,'cloud user A must not inherit offline stock');
userA.preferences.restaurant='A';
userA.stock=[{id:'a',name:'A Rice',qty:2,min:0,price:1}];
save(userA);
assert.ok(values.has('remaprohub.v27.state.cloud.user-a'));

setStorageScope('user-b');
const userB=load();
assert.equal(userB.stock.length,0,'cloud user B must not inherit user A stock');
userB.preferences.restaurant='B';
userB.stock=[{id:'b',name:'B Bread',qty:3,min:0,price:1}];
save(userB);

setStorageScope('user-a');
assert.equal(load().stock[0].name,'A Rice');
setStorageScope('user-b');
assert.equal(load().stock[0].name,'B Bread');

setStorageScope('');
const localAgain=load();
assert.equal(localAgain.stock[0].name,'Local Milk');
assert.equal(localAgain.preferences.restaurant,'Local');

console.log('Offline and per-user cloud caches remain isolated');
