import assert from 'node:assert/strict';
import {recordShift,recordLeave,recordTraining,updateRecord} from '../src/store.js';

const state={
  team:[{name:'Alice',role:'Manager'},{name:'Bob',role:'Server'}],
  shifts:[],leave:[],training:[],
  stock:[],deliveries:[],waste:[]
};

assert.equal(recordShift(state,{employee:'Unknown',date:'2026-09-18',start:'09:00',end:'17:00'}),false);
assert.ok(recordShift(state,{employee:'Alice',date:'2026-09-18',start:'09:00',end:'17:00'}));
assert.equal(state.shifts.length,1);
assert.equal(updateRecord(state,'shifts',0,{employee:'Unknown'}),false);
assert.equal(updateRecord(state,'shifts',0,{employee:'Bob',date:'2026-09-19',start:'18:00',end:'02:00'}),true);
assert.equal(state.shifts[0].employee,'Bob');

assert.equal(recordLeave(state,{employee:'Alice',start:'2026-09-20',end:'2026-09-19',status:'requested'}),false);
assert.ok(recordLeave(state,{employee:'Alice',start:'2026-09-20',end:'2026-09-22',status:'approved'}));
assert.equal(updateRecord(state,'leave',0,{end:'2026-09-19'}),false);
assert.equal(updateRecord(state,'leave',0,{status:'invalid'}),false);

assert.equal(recordTraining(state,{employee:'Unknown',topic:'HACCP',date:'2026-09-18',status:'planned'}),false);
assert.equal(recordTraining(state,{employee:'Alice',topic:'',date:'2026-09-18',status:'planned'}),false);
assert.ok(recordTraining(state,{employee:'Alice',topic:'HACCP',date:'2026-09-18',status:'planned'}));
assert.equal(updateRecord(state,'training',0,{status:'invalid'}),false);
assert.equal(updateRecord(state,'training',0,{employee:'Bob',status:'completed'}),true);

console.log('HR registry links and date/status validation OK');
