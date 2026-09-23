import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {clockIn,toggleBreak,clockOut,recordAvailability,recordForecastSignal,requestShiftSwap,resolveShiftSwap,recordRegistry,updateRecord} from '../src/store.js';
import {actualLabor,workforceVariance,laborForecast,availabilityConflicts} from '../src/intelligence.js';
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const cloud=readFileSync(new URL('../src/cloud.js',import.meta.url),'utf8');
const sync=readFileSync(new URL('../supabase/functions/remapro-sync/index.ts',import.meta.url),'utf8');
const state={team:[{name:'Ana',hourlyRate:30},{name:'Ben',hourlyRate:25}],shifts:[{employee:'Ana',date:'2026-09-23',start:'10:00',end:'18:00'}],timeClock:[],availability:[],shiftSwaps:[],forecastSignals:[],financeHistory:[{date:'2026-09-16',covers:40,revenue:2000},{date:'2026-08-19',covers:32,revenue:1500},{date:'2026-07-15',covers:36,revenue:1700}],reservations:[]};
assert.ok(clockIn(state,{employee:'Ana',at:'2026-09-23T08:00:00Z'}));assert.ok(toggleBreak(state,{employee:'Ana',at:'2026-09-23T12:00:00Z'}));assert.ok(toggleBreak(state,{employee:'Ana',at:'2026-09-23T12:30:00Z'}));assert.ok(clockOut(state,{employee:'Ana',at:'2026-09-23T16:30:00Z'}));
const actual=actualLabor(state,new Date('2026-09-23T23:00:00Z'),7);assert.equal(actual.hours,8);
assert.ok(recordAvailability(state,{employee:'Ana',date:'2026-09-23',status:'unavailable'}));assert.equal(availabilityConflicts(state,new Date('2026-09-23T08:00:00'),2).count,1);
assert.ok(requestShiftSwap(state,{shiftIndex:0,toEmployee:'Ben'}));assert.ok(resolveShiftSwap(state,state.shiftSwaps[0].id,'approved'));assert.equal(state.shifts[0].employee,'Ben');
const variance=workforceVariance(state,new Date('2026-09-23T23:00:00'),7);assert.ok(variance.rows.length>=1);assert.ok(variance.actualCost>0);assert.ok('weeklyOvertimeHours' in variance);
assert.ok(recordForecastSignal(state,{date:'2026-09-23',type:'weather',impactPct:20,note:'terrasse'}));const forecast=laborForecast(state,new Date('2026-09-23T08:00:00'),7);assert.equal(forecast.rows.length,7);assert.equal(forecast.rows[0].signalFactor,1.2);assert.ok(['low','medium','high'].includes(forecast.rows[0].confidence));
const teamState={team:[],shifts:[],leave:[],training:[],timeClock:[],availability:[],shiftSwaps:[]};const teamRow=recordRegistry(teamState,'team',{name:'Chris',role:'Salle',hourlyRate:28.5});assert.equal(teamRow.hourlyRate,28.5);assert.equal(updateRecord(teamState,'team',0,{hourlyRate:31}),true);assert.equal(teamState.team[0].hourlyRate,31);
for(const key of ['timeClock','availability','shiftSwaps','forecastSignals']){assert.ok(cloud.includes("'"+key+"'"),'cloud workspace missing '+key);assert.ok(sync.includes('"'+key+'"'),'server sync missing '+key)}
for(const token of ['timeClockEmployee','availabilityForm','forecastSignalForm','shiftSwapForm','data-clock-action','hourlyRate','plannedVsActual','laborVariance','leaveMobile'])assert.ok(app.includes(token),token+' UI missing');
console.log('Workforce planning, time clock and forecast checks passed');
