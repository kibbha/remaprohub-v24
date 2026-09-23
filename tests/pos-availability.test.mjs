import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildPosCatalogFromHubState} from '../src/pos.js';

const state={
  stock:[
    {id:'stock-chicken',name:'Poulet',unit:'kg',qty:1,price:12},
    {id:'stock-salad',name:'Salade',unit:'kg',qty:.8,price:8}
  ],
  stockMoves:[],deliveries:[],waste:[],
  products:[
    {id:'water',name:'Eau',price:4,taxRate:8.1,posAvailabilityMode:'manual',posManualAvailability:10,posLowStockThreshold:2,productionStation:'bar'}
  ],
  recipes:[
    {id:'recipe-salad',name:'Salade César',price:19,vatRate:8.1,portions:4,ingredients:[
      {stockId:'stock-chicken',quantity:.6,unit:'kg'},
      {stockId:'stock-salad',quantity:.4,unit:'kg'}
    ],productionStation:'kitchen'}
  ]
};
const catalog=buildPosCatalogFromHubState(state);
const salad=catalog.find(x=>x.name==='Salade César');
assert.ok(salad);
assert.equal(salad.metadata.stockComponents.length,2);
assert.equal(salad.metadata.stockComponents.find(x=>x.stockId==='stock-chicken').quantity,.15);
assert.equal(salad.metadata.stockComponents.find(x=>x.stockId==='stock-salad').quantity,.1);
assert.equal(salad.metadata.availability.mode,'stock');
assert.equal(salad.metadata.availability.availablePortions,6);

const water=catalog.find(x=>x.name==='Eau');
assert.equal(water.metadata.availability.mode,'manual');
assert.equal(water.metadata.availability.manualQuantity,10);
assert.equal(water.metadata.availability.lowThreshold,2);

const edge=fs.readFileSync(new URL('../supabase/functions/remapro-pos-sync/index.ts',import.meta.url),'utf8');
const manualSql=fs.readFileSync(new URL('../supabase/migrations/20260923145500_pos_item_availability.sql',import.meta.url),'utf8');
const stockSql=fs.readFileSync(new URL('../supabase/migrations/20260923151000_pos_stock_availability_guard.sql',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const restored=fs.readFileSync(new URL('../src/restored.js',import.meta.url),'utf8');
const posBridge=fs.readFileSync(new URL('../src/pos.js',import.meta.url),'utf8');
assert.ok(edge.includes('action==="availability_snapshot"'));
assert.ok(edge.includes('automaticCatalogMatching:true'));
assert.ok(edge.includes('itemAvailability:true'));
assert.ok(edge.includes('const quantityChanged='));
assert.ok(edge.includes('const nextRemaining=quantityChanged?cfg.manualQuantity'));
assert.ok(manualSql.includes('POS_ITEM_AVAILABILITY_EXCEEDED'));
assert.ok(manualSql.includes('availability_consumed_at'));
assert.ok(stockSql.includes('POS_STOCK_INSUFFICIENT'));
assert.ok(stockSql.includes('for update'));
assert.ok(app.includes('schedulePosCatalogAutoSync'));
assert.ok(app.includes("schedulePosCatalogAutoSync('product-created')"));
assert.ok(app.includes("schedulePosCatalogAutoSync('recipe-created')"));
assert.ok(app.includes('onPosCatalogChange:reason=>schedulePosCatalogAutoSync(reason)'));
assert.ok(restored.includes("onPosCatalogChange('recipe-created')"));
assert.ok(posBridge.includes("POS_BRIDGE_VERSION='22'"));
console.log('POS auto-match catalog availability and atomic stock guards OK');
