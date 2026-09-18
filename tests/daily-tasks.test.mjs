import assert from 'node:assert/strict';
import {ensureDailyTasks} from '../src/store.js';

const state={tasksDate:'2026-09-18',tasks:[['openKitchen',true],['cashCheck',false]]};
assert.equal(ensureDailyTasks(state,new Date(2026,8,18,23,59)),false);
assert.deepEqual(state.tasks,[['openKitchen',true],['cashCheck',false]]);
assert.equal(ensureDailyTasks(state,new Date(2026,8,19,0,1)),true);
assert.equal(state.tasksDate,'2026-09-19');
assert.deepEqual(state.tasks,[['openKitchen',false],['cashCheck',false]]);
state.tasks[1][1]=true;
assert.equal(ensureDailyTasks(state,new Date(2026,8,19,12)),false);
assert.equal(state.tasks[1][1],true);
console.log('Daily tasks reset only after local date changes OK');
