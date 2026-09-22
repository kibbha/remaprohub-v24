import assert from 'node:assert/strict';
import fs from 'node:fs';
import {emptyPosLayout,normalizePosLayout,seedPosLayoutFromCatalog} from '../src/pos-layout.js';

const catalog=Array.from({length:10},(_,i)=>({
  id:'p'+(i+1),
  name:'Produit '+(i+1),
  category:i<5?'Cuisine':'Bar',
  price:10+i,
  production_station:i<5?'kitchen':'bar',
  active:true
}));
const seeded=seedPosLayoutFromCatalog(catalog);
assert.equal(seeded.schemaVersion,1);
assert.equal(seeded.buttons.length,10);
assert.equal(seeded.categories.length,2);
assert.equal(seeded.pages.length,1);

seeded.pages.push({id:'page2',name:'Favoris',sortOrder:1,color:'#ffffff'});
seeded.categories.push({id:'sub1',name:'Sous-cat',parentId:seeded.categories[0].id,sortOrder:2,color:'#ffffff'});
seeded.buttons[0]={...seeded.buttons[0],w:2,h:2,color:'#123456',favorite:true,hidden:false,unavailable:true};
seeded.modifierGroups.push({
  id:'g1',name:'Cuisson',type:'cooking',required:true,min:1,max:1,station:'kitchen',
  options:[
    {id:'o1',name:'Saignant',priceDelta:0,station:'kitchen',ingredientId:'',omitIngredient:false},
    {id:'o2',name:'Bien cuit',priceDelta:0,station:'kitchen',ingredientId:'',omitIngredient:false}
  ]
});
seeded.buttons[0].modifierGroupIds=['g1'];
seeded.menus.push({
  id:'m1',name:'Menu midi',productId:'p1',price:24.5,
  choices:[{id:'c1',name:'Accompagnement',required:true,min:1,max:1,categoryId:seeded.categories[0].id,productIds:[],modifierGroupIds:[]}]
});
const normalized=normalizePosLayout(seeded);
assert.equal(normalized.buttons[0].w,2);
assert.equal(normalized.buttons[0].h,2);
assert.equal(normalized.buttons[0].color,'#123456');
assert.equal(normalized.buttons[0].unavailable,true);
assert.equal(normalized.modifierGroups[0].required,true);
assert.equal(normalized.menus[0].choices[0].required,true);

const source=fs.readFileSync(new URL('../src/pos-layout.js',import.meta.url),'utf8');
for(const token of ['dragstart','drop','data-layout-page-select','data-layout-page-move','data-layout-category-move','data-layout-add-option','data-layout-add-choice'])assert.ok(source.includes(token),token);

console.log('Hub POS layout editor issue #6 checks passed');
