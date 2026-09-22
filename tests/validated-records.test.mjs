import assert from 'node:assert/strict';
import {load,recordValidated,recordInvoice,updateRecord} from '../src/store.js';

const values=new Map();
globalThis.localStorage={
  getItem:key=>values.get(key)??null,
  setItem:(key,value)=>values.set(key,value),
  removeItem:key=>values.delete(key)
};

const state=load();
state.categories=[{name:'Food'}];

assert.equal(recordValidated(state,'products',{name:'Dish',category:'Food',cost:2,price:8})?.name,'Dish');
assert.equal(recordValidated(state,'products',{name:'Bad',category:'Missing',cost:2,price:8}),false);
assert.equal(recordValidated(state,'products',{name:'Bad',category:'Food',cost:-1,price:8}),false);

assert.equal(recordValidated(state,'stock',{name:'Rice',unit:'kg',qty:3,price:'',min:''})?.price,0);
assert.equal(recordValidated(state,'stock',{name:'Bad',qty:1,price:'oops',min:0}),false);
assert.equal(recordValidated(state,'stock',{name:'Bad',qty:-1,price:1,min:0}),false);

assert.equal(recordValidated(state,'recipes',{name:'Soup',cost:1.5,price:6})?.name,'Soup');
assert.equal(recordValidated(state,'recipes',{name:'Soup',cost:1.5,price:-2}),false);

assert.equal(recordValidated(state,'reservations',{name:'Guest',time:'2026-09-20T19:00',covers:2})?.covers,2);
assert.equal(recordValidated(state,'reservations',{name:'Guest',time:'2026-09-20T19:00',covers:0}),false);
assert.equal(recordValidated(state,'reservations',{name:'Guest',time:'',covers:2}),false);

assert.equal(recordValidated(state,'audits',{date:'2026-09-18',type:'internal',score:100,actions:''})?.score,100);
assert.equal(recordValidated(state,'audits',{date:'2026-09-18',type:'internal',score:101}),false);
assert.equal(recordValidated(state,'audits',{date:'2026-09-18',type:'unknown',score:50}),false);
assert.equal(recordValidated(state,'audits',{date:'2026-09-18',type:'internal',score:'oops'}),false);

assert.equal(recordValidated(state,'goals',{metric:'revenue',target:1000,period:'month'})?.target,1000);
assert.equal(recordValidated(state,'goals',{metric:'revenue',target:-1,period:'month'}),false);
assert.equal(recordValidated(state,'goals',{metric:'bad',target:1,period:'month'}),false);

assert.equal(recordValidated(state,'loyalty',{name:'Client',points:''})?.points,0);
assert.equal(recordValidated(state,'loyalty',{name:'Client',points:'oops'}),false);
assert.equal(recordValidated(state,'loyalty',{name:'Client',points:-1}),false);

assert.equal(recordValidated(state,'temps',{equipment:'Fridge',value:-3.5})?.value,-3.5);
assert.equal(recordValidated(state,'temps',{equipment:'Fridge',value:'oops'}),false);
assert.equal(recordValidated(state,'temps',{equipment:'',value:4}),false);
assert.equal(recordInvoice(state,{supplier:'Metro',reference:'F-1',date:'2026-09-20',dueDate:'2026-10-20',amount:120,status:'pending'})?.dueDate,'2026-10-20');
assert.equal(recordInvoice(state,{supplier:'Metro',reference:'F-2',date:'2026-09-20',dueDate:'2026-09-19',amount:120,status:'pending'}),false);

assert.equal(updateRecord(state,'audits',0,{score:120}),false);
assert.equal(updateRecord(state,'goals',0,{target:-1}),false);
assert.equal(updateRecord(state,'loyalty',0,{points:-1}),false);
assert.equal(updateRecord(state,'temps',0,{value:'oops'}),false);
assert.equal(updateRecord(state,'temps',0,{value:4}),false);

console.log('Validated creation and edit constraints OK');
