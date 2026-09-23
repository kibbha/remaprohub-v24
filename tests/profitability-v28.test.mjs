import assert from 'node:assert/strict';
import {profitLeakCockpit,multiRestaurantBenchmark} from '../src/intelligence.js';

const base={
 activeRestaurantId:'r1',recipeTarget:30,recipeWarning:35,
 payrollSettings:{ccnt:{weeklyHours:42}},
 financeHistory:[{date:'2026-09-23',revenue:1000,expenses:350,covers:50}],
 team:[{name:'Ana',hourlyRate:30}],
 shifts:[{employee:'Ana',date:'2026-09-23',start:'10:00',end:'16:00'}],
 timeClock:[{employee:'Ana',clockIn:'2026-09-23T08:00:00Z',clockOut:'2026-09-23T16:00:00Z',breaks:[],status:'closed'}],
 waste:[{stockId:'s1',qty:2,date:'2026-09-23'}],
 stock:[{id:'s1',name:'Produit',price:5,qty:1,min:0}],
 inventoryCounts:[{status:'closed',closedAt:'2026-09-23T16:00:00Z',absoluteVarianceValue:25}],
 priceHistory:[],recipes:[],sales:[],orders:[],reservations:[],forecastSignals:[],
 restaurants:[
  {id:'r1',name:'Site A',workspace:null},
  {id:'r2',name:'Site B',workspace:{financeHistory:[{date:'2026-09-23',revenue:600,expenses:300,covers:20}],waste:[],stock:[],team:[],shifts:[],recipes:[],sales:[],orders:[],priceHistory:[],inventoryCounts:[],reservations:[],forecastSignals:[],payrollSettings:{ccnt:{weeklyHours:42}},recipeTarget:30,recipeWarning:35}}
 ]
};
const cockpit=profitLeakCockpit(base,new Date('2026-09-23T23:00:00Z'));
assert.ok(cockpit.signals.some(x=>x.code==='laborOverrun'&&x.amount>0));
assert.ok(cockpit.signals.some(x=>x.code==='inventoryVariance'&&x.amount===25));
assert.ok(cockpit.signals.some(x=>x.code==='waste'&&x.amount===10));
assert.ok(cockpit.totalExposure>=35);
const benchmark=multiRestaurantBenchmark(base,new Date('2026-09-23T23:00:00Z'));
assert.equal(benchmark.rows.length,2);
assert.equal(benchmark.network.restaurants,2);
assert.ok(benchmark.rows.some(x=>x.name==='Site A'&&x.revenue===1000));
assert.ok(benchmark.rows.every(x=>'revenueVsNetwork' in x));
console.log('Profit leak cockpit and multi-restaurant benchmark checks passed');
