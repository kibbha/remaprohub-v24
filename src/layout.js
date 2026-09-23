const clone=v=>JSON.parse(JSON.stringify(v));
const normalizeMatchName=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const normalizeAvailability=input=>{
  const src=input&&typeof input==='object'?input:{},mode=['unlimited','manual','stock'].includes(String(src.mode))?String(src.mode):'unlimited';
  return{mode,manualQuantity:Math.max(0,Math.floor(Number(src.manualQuantity)||0)),lowThreshold:Math.max(0,Math.floor(Number(src.lowThreshold)||3)),resetAt:String(src.resetAt||'')};
};
function normalizeStandaloneItem(item){
  if(!item||typeof item!=='object')return null;
  const name=String(item.name||'').trim(),price=Number(item.price),taxRate=Number(item.taxRate??item.tax_rate??8.1);
  if(!name||!Number.isFinite(price)||price<0||!Number.isFinite(taxRate)||taxRate<0||taxRate>100)return null;
  const type=['dish','drink','other'].includes(String(item.type))?String(item.type):'other';
  const station=['kitchen','bar','none'].includes(String(item.station))?String(item.station):(type==='drink'?'bar':type==='dish'?'kitchen':'none');
  return{name,price:Math.round(price*100)/100,taxRate,sku:String(item.sku||''),type,station};
}
export function normalizeLayout(input){
  const src=input&&typeof input==='object'?clone(input):{};
  const doc={
    schemaVersion:1,
    pages:Array.isArray(src.pages)?src.pages:[],
    categories:Array.isArray(src.categories)?src.categories:[],
    buttons:Array.isArray(src.buttons)?src.buttons.map(button=>({...button,productId:String(button?.productId||''),item:normalizeStandaloneItem(button?.item),availability:normalizeAvailability(button?.availability)})):[],
    modifierGroups:Array.isArray(src.modifierGroups)?src.modifierGroups:[],
    productModifiers:Array.isArray(src.productModifiers)?src.productModifiers:[],
    menus:Array.isArray(src.menus)?src.menus:[]
  };
  return doc;
}
export function publishedLayout(bootstrap){
  const layout=bootstrap?.layout;
  if(!layout?.document||Number(layout.schemaVersion||layout.document.schemaVersion)!==1)return null;
  return {version:Number(layout.version)||0,checksum:String(layout.checksum||''),publishedAt:layout.publishedAt||null,document:normalizeLayout(layout.document)};
}
export function productById(catalog,id){return(catalog||[]).find(x=>String(x.id)===String(id))||null}
export function autoMatchButtonProduct(button,catalog=[]){
  if(button?.productId)return null;
  const name=normalizeMatchName(button?.item?.name||button?.label);if(!name)return null;
  let candidates=(catalog||[]).filter(x=>x?.active!==false&&normalizeMatchName(x?.name)===name);
  if(candidates.length>1&&Number.isFinite(Number(button?.item?.price))){
    const price=Number(button.item.price),priced=candidates.filter(x=>Math.abs((Number(x?.price)||0)-price)<=0.01);
    if(priced.length===1)candidates=priced;
  }
  return candidates.length===1?candidates[0]:null;
}
export function itemForButton(button,catalog=[]){
  const linked=button?.productId?productById(catalog,button.productId):null;
  if(linked)return{...linked,layoutStandalone:false,autoMatched:false};
  const matched=autoMatchButtonProduct(button,catalog);
  if(matched)return{...matched,layoutStandalone:false,autoMatched:true};
  const item=normalizeStandaloneItem(button?.item);
  return item?{id:'layout:'+String(button?.id||''),name:item.name,price:item.price,tax_rate:item.taxRate,sku:item.sku,production_station:item.station,type:item.type,layoutStandalone:true,autoMatched:false}:null;
}
export function availabilityKeyForButton(button,catalog=[]){
  const explicit=button?.productId?productById(catalog,button.productId):null;
  return explicit?.id?'catalog:'+String(explicit.id):'layout:'+String(button?.id||'');
}
export function availabilityConfigForButton(button,catalog=[]){
  const item=itemForButton(button,catalog),buttonCfg=normalizeAvailability(button?.availability),catalogCfg=normalizeAvailability(item?.metadata?.availability);
  const explicit=button?.availability&&typeof button.availability==='object';
  const cfg=explicit&&buttonCfg.mode!=='unlimited'?buttonCfg:catalogCfg.mode!=='unlimited'?catalogCfg:buttonCfg;
  return{...cfg,key:availabilityKeyForButton(button,catalog),catalogItemId:item&&!item.layoutStandalone?String(item.id):'',autoMatched:!!item?.autoMatched};
}
export function buttonById(doc,id){return normalizeLayout(doc).buttons.find(x=>String(x.id)===String(id))||null}
export function pageButtons(doc,pageId){
  return normalizeLayout(doc).buttons.filter(x=>String(x.pageId||'')===String(pageId||'')).sort((a,b)=>(Number(a.sortOrder)||0)-(Number(b.sortOrder)||0));
}
export function categoriesForPage(doc,pageId){
  const d=normalizeLayout(doc),ids=new Set(pageButtons(d,pageId).map(x=>String(x.categoryId||'')).filter(Boolean));
  return d.categories.filter(x=>ids.has(String(x.id))).sort((a,b)=>(Number(a.sortOrder)||0)-(Number(b.sortOrder)||0));
}
export function modifierGroupsForButton(doc,button){
  const d=normalizeLayout(doc);
  const direct=Array.isArray(button?.modifierGroupIds)?button.modifierGroupIds.map(String):[];
  const linked=button?.productId?d.productModifiers.find(x=>String(x.productId)===String(button.productId))?.groupIds||[]:[];
  const ids=[...new Set([...direct,...linked.map(String)])];
  return ids.map(id=>d.modifierGroups.find(g=>String(g.id)===id)).filter(Boolean);
}
export function menuForButton(doc,button){
  const d=normalizeLayout(doc);
  const productId=String(button?.productId||'');if(!productId)return null;
  return d.menus.find(m=>String(m.productId||'')===productId)||null;
}
export function menuChoiceProducts(doc,choice,catalog){
  const d=normalizeLayout(doc),list=Array.isArray(catalog)?catalog:[];
  if(Array.isArray(choice?.productIds)&&choice.productIds.length){
    const ids=new Set(choice.productIds.map(String));
    return list.filter(x=>ids.has(String(x.id)));
  }
  if(choice?.categoryId){
    const ids=new Set(d.buttons.filter(b=>String(b.categoryId)===String(choice.categoryId)).map(b=>String(b.productId)));
    return list.filter(x=>ids.has(String(x.id)));
  }
  return list;
}
export function modifierPriceDelta(modifiers=[]){
  let total=0;
  for(const entry of modifiers||[]){
    for(const option of entry.options||[])total+=Number(option.priceDelta)||0;
  }
  return Math.round(total*100)/100;
}
export function modifierSummary(modifiers=[]){
  const parts=[];
  for(const entry of modifiers||[]){
    if(entry.type==='notes'&&entry.note)parts.push(String(entry.note));
    for(const option of entry.options||[])parts.push(String(option.name||''));
    if(entry.kind==='menu'){
      for(const choice of entry.choices||[])for(const product of choice.products||[])parts.push(String(choice.name||'Choix')+': '+String(product.name||''));
    }
  }
  return parts.filter(Boolean).join(' · ');
}
export function productionModifierSummary(modifiers=[],station=''){
  const parts=[];
  for(const entry of modifiers||[]){
    if(entry.type==='notes'&&entry.note)parts.push('Note: '+entry.note);
    for(const option of entry.options||[]){
      const route=String(option.station||entry.station||'');
      if(!station||!route||route===station)parts.push(option.name+(route?' ['+route+']':''));
    }
    if(entry.kind==='menu'){
      for(const choice of entry.choices||[]){
        for(const product of choice.products||[]){
          const route=String(product.station||'');
          if(!station||!route||route===station)parts.push(choice.name+': '+product.name+(route?' ['+route+']':''));
        }
      }
    }
  }
  return parts.filter(Boolean).join(' · ');
}
export function configurationForButton(doc,button,catalog){
  const groups=modifierGroupsForButton(doc,button);
  const menu=menuForButton(doc,button);
  const menuChoices=(menu?.choices||[]).map(choice=>({...choice,products:menuChoiceProducts(doc,choice,catalog)}));
  return{groups,menu:menu?{...menu,choices:menuChoices}:null};
}

export function modifierRoutesToStation(modifiers=[],station=''){
  if(!station||station==='all')return true;
  for(const entry of modifiers||[]){
    for(const option of entry.options||[])if(String(option.station||entry.station||'')===station)return true;
    if(entry.kind==='menu'){
      for(const choice of entry.choices||[])for(const product of choice.products||[])if(String(product.station||'')===station)return true;
    }
  }
  return false;
}
