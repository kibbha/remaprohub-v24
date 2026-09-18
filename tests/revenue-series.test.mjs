import assert from 'node:assert/strict';
import {revenueSeries} from '../src/store.js';

const state={financeHistory:[
  {date:'2026-09-18',revenue:90},
  {date:'2026-09-17',revenue:30},
  {date:'2026-09-14',revenue:12},
  {date:'2026-09-07',revenue:8},
  {date:'2026-08-31',revenue:5},
  {date:'2026-03-01',revenue:1000},
]};
const now=new Date(2026,8,18);
const day=revenueSeries(state,'day',now);
assert.deepEqual(day.map(x=>x.key),['2026-09-12','2026-09-13','2026-09-14','2026-09-15','2026-09-16','2026-09-17','2026-09-18']);
assert.deepEqual(day.map(x=>x.revenue),[0,0,12,0,0,30,90]);
const week=revenueSeries(state,'week',now);
assert.equal(week.at(-1).key,'2026-09-14');
assert.deepEqual(week.slice(-3).map(x=>x.revenue),[5,8,132]);
const month=revenueSeries(state,'month',now);
assert.deepEqual(month.map(x=>x.key),['2026-04-01','2026-05-01','2026-06-01','2026-07-01','2026-08-01','2026-09-01']);
assert.deepEqual(month.map(x=>x.revenue),[0,0,0,0,5,140]);
assert.equal(revenueSeries({financeHistory:[]},'month',new Date(2027,0,5))[0].key,'2026-08-01');
console.log('Revenue series: day, week, month and year boundary OK');
