import assert from 'node:assert/strict';
import fs from 'node:fs';
import {emptyPosLayout,normalizePosLayout,seedPosLayoutFromCatalog,autoMatchLayoutButton,layoutButtonItem,renderPosLayoutEditor} from '../src/pos-layout.js';

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
const standalone=normalizePosLayout({
  ...emptyPosLayout(),
  buttons:[{id:'standalone',pageId:'',categoryId:'',productId:'',label:'Café maison',item:{name:'Café maison',price:4.5,taxRate:8.1,type:'drink',station:'bar'}}]
});
assert.equal(standalone.buttons[0].item.name,'Café maison');
assert.equal(standalone.buttons[0].item.price,4.5);
assert.equal(standalone.buttons[0].item.type,'drink');
assert.equal(layoutButtonItem(standalone.buttons[0],catalog).source,'layout');
assert.equal(layoutButtonItem(standalone.buttons[0],catalog).production_station,'bar');
const linkedButton={id:'linked',productId:'p1'};
assert.equal(layoutButtonItem(linkedButton,catalog).source,'hub');
const saladCatalog=[
  {id:'salad-1',name:'Salade César',price:19,active:true,production_station:'kitchen'},
  {id:'salad-2',name:'Salade maison',price:14,active:true,production_station:'kitchen'}
];
const saladButton=normalizePosLayout({...emptyPosLayout(),buttons:[{id:'salad-btn',label:'Salade Cesar',productId:'',item:{name:'Salade Cesar',price:19,taxRate:8.1,type:'dish',station:'kitchen'},availability:{mode:'stock',manualQuantity:0,lowThreshold:2}}]}).buttons[0];
assert.equal(autoMatchLayoutButton(saladButton,saladCatalog)?.id,'salad-1');
assert.equal(layoutButtonItem(saladButton,saladCatalog).autoMatched,true);
assert.equal(saladButton.availability.mode,'stock');
assert.equal(saladButton.availability.lowThreshold,2);
const ambiguousCatalog=[
  {id:'dup-1',name:'Salade',price:12,active:true},
  {id:'dup-2',name:'Salade',price:12,active:true}
];
const ambiguousButton=normalizePosLayout({...emptyPosLayout(),buttons:[{id:'dup-btn',label:'Salade',productId:'',item:{name:'Salade',price:12,taxRate:8.1,type:'dish',station:'kitchen'}}]}).buttons[0];
assert.equal(autoMatchLayoutButton(ambiguousButton,ambiguousCatalog),null);
assert.equal(layoutButtonItem(ambiguousButton,ambiguousCatalog).source,'layout');

const editorHtml=renderPosLayoutEditor({layout:standalone,catalog});
assert.match(editorHtml,/Créer une touche de caisse/);
assert.match(editorHtml,/Aucun — touche autonome/);
assert.match(editorHtml,/Auto : Caisse/);
assert.match(editorHtml,/Plat/);
assert.match(editorHtml,/Boisson/);
assert.match(editorHtml,/Quantité manuelle/);
assert.match(editorHtml,/Calculée par stock\/recette/);
assert.match(editorHtml,/Alerte basse/);

const normalized=normalizePosLayout(seeded);
assert.equal(normalized.buttons[0].w,2);
assert.equal(normalized.buttons[0].h,2);
assert.equal(normalized.buttons[0].color,'#123456');
assert.equal(normalized.buttons[0].unavailable,true);
assert.equal(normalized.modifierGroups[0].required,true);
assert.equal(normalized.menus[0].choices[0].required,true);

const source=fs.readFileSync(new URL('../src/pos-layout.js',import.meta.url),'utf8');
const edge=fs.readFileSync(new URL('../supabase/functions/remapro-pos-sync/index.ts',import.meta.url),'utf8');
for(const token of ['dragstart','drop','data-layout-page-select','data-layout-page-move','data-layout-category-move','data-layout-add-option','data-layout-add-choice','posLayoutItemPrice','Auto : Caisse','defaultCategory(type)'])assert.ok(source.includes(token),token);
assert.ok(source.includes('Remettre la quantité disponible'));
assert.ok(source.includes('posLayoutAvailabilityReset'));

assert.ok(edge.includes('Standalone layout item requires name, price and valid tax rate'));
assert.ok(edge.includes('standaloneLayoutItems:true'));
console.log('Hub POS layout editor issue #6 checks passed');
