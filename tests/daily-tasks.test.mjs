import assert from 'node:assert/strict';
import {ensureDailyTasks,setDailyTaskCompletion,dailyRoutineStatus} from '../src/store.js';

const state={tasksDate:'2026-09-18',tasks:[['openKitchen',true],['cashCheck',false]],checklists:[],cleaning:[]};
assert.equal(ensureDailyTasks(state,new Date(2026,8,18,23,59)),false);
assert.deepEqual(state.tasks,[['openKitchen',true],['cashCheck',false]]);
assert.equal(ensureDailyTasks(state,new Date(2026,8,19,0,1)),true);
assert.equal(state.tasksDate,'2026-09-19');
assert.deepEqual(state.tasks,[['openKitchen',false],['cashCheck',false]]);
assert.equal(setDailyTaskCompletion(state,1,true,new Date(2026,8,19,12)),true);
assert.equal(ensureDailyTasks(state,new Date(2026,8,19,12)),false);
assert.equal(state.tasks[1][1],true);

state.checklists=[{type:'closing',title:'Éteindre les fours'}];
state.cleaning=[{area:'Cuisine',task:'Dégraisser la hotte',frequency:'weekly',responsible:'Alex'}];
assert.equal(ensureDailyTasks(state,new Date(2026,8,19,13)),true);
assert.ok(state.tasks.some(x=>x[0]==='Éteindre les fours'&&x[2]?.type==='closing'));
assert.ok(state.tasks.some(x=>x[0]==='Cuisine — Dégraisser la hotte'&&x[2]?.source==='cleaning'));
const cleanIndex=state.tasks.findIndex(x=>x[2]?.source==='cleaning');
assert.equal(setDailyTaskCompletion(state,cleanIndex,true,new Date(2026,8,19,14)),true);
assert.equal(state.cleaning[0].lastCompleted,'2026-09-19');
assert.equal(ensureDailyTasks(state,new Date(2026,8,20,9)),true);
assert.equal(state.tasks.some(x=>x[2]?.source==='cleaning'),false,'weekly cleaning must stay hidden until due again');
assert.equal(ensureDailyTasks(state,new Date(2026,8,26,9)),true);
assert.equal(state.tasks.some(x=>x[2]?.source==='cleaning'),true,'weekly cleaning must reappear after seven days');
const status=dailyRoutineStatus(state,new Date(2026,8,26,9));
assert.ok(status.total>=2);assert.ok(status.closing.total>=1);
console.log('Daily routines are generated, persisted and rescheduled safely');
