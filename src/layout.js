const clone=v=>JSON.parse(JSON.stringify(v));
export function normalizeLayout(input){
  const src=input&&typeof input==='object'?clone(input):{};
  const doc={
    schemaVersion:1,
    pages:Array.isArray(src.pages)?src.pages:[],
    categories:Array.isArray(src.categories)?src.categories:[],
    buttons:Array.isArray(src.buttons)?src.buttons:[],
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
  const linked=d.productModifiers.find(x=>String(x.productId)===String(button?.productId))?.groupIds||[];
  const ids=[...new Set([...direct,...linked.map(String)])];
  return ids.map(id=>d.modifierGroups.find(g=>String(g.id)===id)).filter(Boolean);
}
export function menuForButton(doc,button){
  const d=normalizeLayout(doc);
  return d.menus.find(m=>String(m.productId||'')===String(button?.productId||''))||null;
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
