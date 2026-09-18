import assert from 'node:assert/strict';
import {recordRegistry,updateRecord,removeRecord} from '../src/store.js';

const unique={categories:[],suppliers:[],team:[]};
assert.ok(recordRegistry(unique,'categories',{name:'Boissons'}));
assert.equal(recordRegistry(unique,'categories',{name:' boissons '}),false);
assert.ok(recordRegistry(unique,'suppliers',{name:'Metro',contact:'A'}));
assert.equal(recordRegistry(unique,'suppliers',{name:'METRO',contact:'B'}),false);
assert.ok(recordRegistry(unique,'team',{name:'Alice',role:'Manager'}));
assert.equal(recordRegistry(unique,'team',{name:'alice',role:'Server'}),false);

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

state.categories.push({name:'Desserts'});
assert.equal(updateRecord(state,'categories',0,{name:' desserts '}),false);
state.categories.pop();
state.suppliers.push({name:'Other'});
assert.equal(updateRecord(state,'suppliers',0,{name:' other '}),false);
state.suppliers.pop();
state.team.push({name:'Bob'});
assert.equal(updateRecord(state,'team',0,{name:' bob '}),false);
state.team.pop();
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
