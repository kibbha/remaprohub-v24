import assert from 'node:assert/strict';
import {
  normalizeLayout,publishedLayout,pageButtons,categoriesForPage,configurationForButton,
  modifierPriceDelta,modifierSummary,productionModifierSummary,modifierRoutesToStation
} from '../src/layout.js';

const catalog=Array.from({length:10},(_,i)=>({
  id:'p'+(i+1),name:'Produit '+(i+1),category:i<5?'Cuisine':'Bar',
  price:10+i,tax_rate:8.1,recipe_id:i===0?'recipe-1':null,
  production_station:i<5?'kitchen':'bar'
}));
const doc=normalizeLayout({
  schemaVersion:1,
  pages:[{id:'page1',name:'Service',sortOrder:0},{id:'page2',name:'Favoris',sortOrder:1}],
  categories:[{id:'cat1',name:'Cuisine',sortOrder:0},{id:'cat2',name:'Bar',sortOrder:1}],
  buttons:catalog.map((p,i)=>({
    id:'b'+(i+1),pageId:i<8?'page1':'page2',categoryId:i<5?'cat1':'cat2',productId:p.id,
    label:p.name,sortOrder:i,x:i%4,y:Math.floor(i/4),w:i===0?2:1,h:i===0?2:1,
    color:i===0?'#123456':'#d6b98c',hidden:i===8,unavailable:i===9,favorite:i<3,
    station:p.production_station,modifierGroupIds:i===0?['g1','g2']:[]
  })),
  modifierGroups:[
    {id:'g1',name:'Cuisson',type:'cooking',required:true,min:1,max:1,station:'kitchen',options:[
      {id:'o1',name:'Saignant',priceDelta:0,station:'kitchen'},
      {id:'o2',name:'Bien cuit',priceDelta:0,station:'kitchen'}
    ]},
    {id:'g2',name:'Sauce',type:'supplement',required:false,min:0,max:2,station:'bar',options:[
      {id:'o3',name:'Sauce maison',priceDelta:2.5,station:'bar'}
    ]}
  ],
  productModifiers:[],
  menus:[{id:'m1',name:'Menu midi',productId:'p1',price:24.5,choices:[
    {id:'c1',name:'Accompagnement',required:true,min:1,max:1,categoryId:'cat1',productIds:[],modifierGroupIds:[]}
  ]}]
});
const layout=publishedLayout({layout:{version:3,schemaVersion:1,checksum:'abc',document:doc}});
assert.equal(layout.version,3);
assert.equal(pageButtons(doc,'page1').length,8);
assert.equal(categoriesForPage(doc,'page1').length,2);
const cfg=configurationForButton(doc,doc.buttons[0],catalog);
assert.equal(cfg.groups.length,2);
assert.equal(cfg.menu.name,'Menu midi');
assert.equal(cfg.menu.choices[0].products.length,5);

const mods=[
  {groupId:'g1',groupName:'Cuisson',type:'cooking',station:'kitchen',options:[{name:'Saignant',priceDelta:0,station:'kitchen'}]},
  {groupId:'g2',groupName:'Sauce',type:'supplement',station:'bar',options:[{name:'Sauce maison',priceDelta:2.5,station:'bar'}]},
  {kind:'menu',menuId:'m1',menuName:'Menu midi',choices:[{name:'Accompagnement',products:[{productId:'p2',name:'Produit 2',station:'kitchen'}]}]}
];
assert.equal(modifierPriceDelta(mods),2.5);
assert.ok(modifierSummary(mods).includes('Sauce maison'));
assert.ok(productionModifierSummary(mods,'bar').includes('Sauce maison'));
assert.ok(productionModifierSummary(mods,'kitchen').includes('Saignant'));
assert.equal(modifierRoutesToStation(mods,'bar'),true);
assert.equal(modifierRoutesToStation(mods,'kitchen'),true);

console.log('ReMaPro POS layout issue #6 runtime checks passed');
