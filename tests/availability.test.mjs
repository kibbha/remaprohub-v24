import assert from 'node:assert/strict';
import fs from 'node:fs';
import {normalizeLayout,autoMatchButtonProduct,itemForButton,availabilityKeyForButton,availabilityConfigForButton} from '../src/layout.js';

const catalog=[
  {id:'11111111-1111-4111-8111-111111111111',name:'Salade César',price:19,tax_rate:8.1,production_station:'kitchen',active:true,metadata:{availability:{mode:'stock',manualQuantity:0,lowThreshold:2,availablePortions:7}}},
  {id:'22222222-2222-4222-8222-222222222222',name:'Eau',price:4,tax_rate:8.1,production_station:'bar',active:true,metadata:{availability:{mode:'manual',manualQuantity:10,lowThreshold:2}}}
];
const doc=normalizeLayout({pages:[{id:'p',name:'Caisse'}],categories:[],buttons:[
  {id:'salad-button',pageId:'p',productId:'',label:'Salade Cesar',item:{name:'Salade Cesar',price:19,taxRate:8.1,type:'dish',station:'kitchen'},availability:{mode:'unlimited',manualQuantity:0,lowThreshold:3}},
  {id:'water-button',pageId:'p',productId:'22222222-2222-4222-8222-222222222222',label:'Eau',availability:{mode:'unlimited',manualQuantity:0,lowThreshold:3}}
]});
const saladButton=doc.buttons[0],waterButton=doc.buttons[1];
assert.equal(autoMatchButtonProduct(saladButton,catalog)?.id,catalog[0].id);
const salad=itemForButton(saladButton,catalog);
assert.equal(salad.autoMatched,true);
assert.equal(salad.layoutStandalone,false);
assert.equal(availabilityKeyForButton(saladButton,catalog),'layout:salad-button');
const saladAvailability=availabilityConfigForButton(saladButton,catalog);
assert.equal(saladAvailability.mode,'stock');
assert.equal(saladAvailability.key,'layout:salad-button');
assert.equal(saladAvailability.catalogItemId,catalog[0].id);
assert.equal(saladAvailability.autoMatched,true);

assert.equal(availabilityKeyForButton(waterButton,catalog),'catalog:'+catalog[1].id);
assert.equal(availabilityConfigForButton(waterButton,catalog).mode,'manual');

const manualStandalone=normalizeLayout({buttons:[{
  id:'daily-special',productId:'',label:'Plat du jour',
  item:{name:'Plat du jour',price:24,taxRate:8.1,type:'dish',station:'kitchen'},
  availability:{mode:'manual',manualQuantity:5,lowThreshold:1}
}]}).buttons[0];
assert.equal(availabilityConfigForButton(manualStandalone,[]).manualQuantity,5);
assert.equal(availabilityConfigForButton(manualStandalone,[]).key,'layout:daily-special');
const resetStandalone=normalizeLayout({buttons:[{
  id:'reset',productId:'',label:'Plat du jour',
  item:{name:'Plat du jour',price:24,taxRate:8.1,type:'dish',station:'kitchen'},
  availability:{mode:'manual',manualQuantity:5,lowThreshold:1,resetAt:'2026-09-23T15:00:00.000Z'}
}]}).buttons[0];
assert.equal(availabilityConfigForButton(resetStandalone,[]).resetAt,'2026-09-23T15:00:00.000Z');

const ambiguous=[
  {id:'a',name:'Salade',price:12,active:true},
  {id:'b',name:'Salade',price:12,active:true}
];
const ambiguousButton=normalizeLayout({buttons:[{id:'amb',productId:'',label:'Salade',item:{name:'Salade',price:12,taxRate:8.1,type:'dish',station:'kitchen'}}]}).buttons[0];
assert.equal(autoMatchButtonProduct(ambiguousButton,ambiguous),null);
assert.equal(itemForButton(ambiguousButton,ambiguous).layoutStandalone,true);

const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
assert.ok(app.includes("action:'availability_snapshot'"));
assert.ok(app.includes('availability-badge soldout'));
assert.ok(app.includes("uiAlert('Article épuisé.')"));
assert.ok(app.includes('applyLocalAvailabilityConsumption(state.cart)'));
assert.ok(app.includes("p.autoMatched?' · lié auto'"));
assert.ok(app.includes('await refreshAvailability()'));
console.log('POS automatic matching and live availability runtime checks passed');
