import assert from 'node:assert/strict';
import {updateRecord,removeRecord} from '../src/store.js';

const state={
  categories:[{name:'Boissons'}],
  products:[{name:'Cola',category:'Boissons'}],
  suppliers:[{name:'Metro'}],
  purchases:[{supplier:'Metro',amount:20}],
  invoices:[{supplier:'Metro',amount:30}],
  team:[{name:'Alice',role:'Manager'}],
  shifts:[{employee:'Alice',date:'2026-09-18'}],
  leave:[{employee:'Alice',start:'2026-09-20',end:'2026-09-21'}],
  training:[{employee:'Alice',topic:'HACCP'}],
  stock:[],deliveries:[],waste:[]
};

assert.equal(updateRecord(state,'categories',0,{name:'Bar'}),true);
assert.equal(state.products[0].category,'Bar');
assert.equal(removeRecord(state,'categories',0),false);
state.products=[];
assert.equal(removeRecord(state,'categories',0),true);

assert.equal(updateRecord(state,'suppliers',0,{name:'Aligro'}),true);
assert.equal(state.purchases[0].supplier,'Aligro');
assert.equal(state.invoices[0].supplier,'Aligro');
assert.equal(removeRecord(state,'suppliers',0),false);
state.purchases=[];state.invoices=[];
assert.equal(removeRecord(state,'suppliers',0),true);

assert.equal(updateRecord(state,'team',0,{name:'Alicia'}),true);
assert.equal(state.shifts[0].employee,'Alicia');
assert.equal(state.leave[0].employee,'Alicia');
assert.equal(state.training[0].employee,'Alicia');
assert.equal(removeRecord(state,'team',0),false);
state.shifts=[];state.leave=[];state.training=[];
assert.equal(removeRecord(state,'team',0),true);

console.log('Registry rename cascades and deletion guards OK');
