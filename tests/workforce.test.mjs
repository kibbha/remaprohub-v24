import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {clockIn,toggleBreak,clockOut,recordAvailability,requestShiftSwap,resolveShiftSwap} from '../src/store.js';
import {actualLabor,laborForecast,availabilityConflicts} from '../src/intelligence.js';
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const cloud=readFileSync(new URL('../src/cloud.js',import.meta.url),'utf8');
const sync=readFileSync(new URL('../supabase/functions/remapro-sync/index.ts',import.meta.url),'utf8');
const state={team:[{name:'Ana',hourlyRate:30},{name:'Ben',hourlyRate:25}],shifts:[{employee:'Ana',date:'2026-09-23',start:'10:00',end:'18:00'}],timeClock:[],availability:[],shiftSwaps:[],financeHistory:[{date:'2026-09-16',covers:40,revenue:2000}],reservations:[]};
assert.ok(clockIn(state,{employee:'Ana',at:'2026-09-23T08:00:00Z'}));assert.ok(toggleBreak(state,{employee:'Ana',at:'2026-09-23T12:00:00Z'}));assert.ok(toggleBreak(state,{employee:'Ana',at:'2026-09-23T12:30:00Z'}));assert.ok(clockOut(state,{employee:'Ana',at:'2026-09-23T16:30:00Z'}));
const actual=actualLabor(state,new Date('2026-09-23T23:00:00Z'),7);assert.equal(actual.hours,8);
assert.ok(recordAvailability(state,{employee:'Ana',date:'2026-09-23',status:'unavailable'}));assert.equal(availabilityConflicts(state,new Date('2026-09-23T08:00:00'),2).count,1);
assert.ok(requestShiftSwap(state,{shiftIndex:0,toEmployee:'Ben'}));assert.ok(resolveShiftSwap(state,state.shiftSwaps[0].id,'approved'));assert.equal(state.shifts[0].employee,'Ben');
assert.ok(laborForecast(state,new Date('2026-09-23T08:00:00'),7).rows.length===7);
for(const key of ['timeClock','availability','shiftSwaps']){assert.ok(cloud.includes("'"+key+"'"),'cloud workspace missing '+key);assert.ok(sync.includes('"'+key+'"'),'server sync missing '+key)}
for(const token of ['timeClockEmployee','availabilityForm','shiftSwapForm','data-clock-action'])assert.ok(app.includes(token),token+' UI missing');
console.log('Workforce planning, time clock and forecast checks passed');
