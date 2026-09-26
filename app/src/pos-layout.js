const uid=prefix=>prefix+'_'+Math.random().toString(36).slice(2,9);
const clone=value=>JSON.parse(JSON.stringify(value));
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const itemTypeLabel=type=>type==='drink'?'Boisson':type==='dish'?'Plat':'Autre';
const defaultStation=type=>type==='drink'?'bar':type==='dish'?'kitchen':'none';
const defaultCategory=type=>type==='drink'?'Boissons':type==='dish'?'Plats':'Autres';
const normalizeMatchName=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const normalizeAvailability=input=>{
  const src=input&&typeof input==='object'?input:{},mode=['unlimited','manual','stock'].includes(String(src.mode))?String(src.mode):'unlimited';
  return{mode,manualQuantity:Math.max(0,Math.floor(Number(src.manualQuantity)||0)),lowThreshold:Math.max(0,Math.floor(Number(src.lowThreshold)||3)),resetAt:String(src.resetAt||'')};
};

export function emptyPosLayout(){
  return {schemaVersion:1,pages:[],categories:[],buttons:[],modifierGroups:[],productModifiers:[],menus:[]};
}
function normalizeEmbeddedItem(item){
  if(!item||typeof item!=='object')return null;
  const name=String(item.name||'').trim(),price=Number(item.price),taxRate=Number(item.taxRate??item.tax_rate??8.1);
  if(!name||!Number.isFinite(price)||price<0||!Number.isFinite(taxRate)||taxRate<0||taxRate>100)return null;
  const type=['dish','drink','other'].includes(String(item.type))?String(item.type):'other';
  const station=['kitchen','bar','none'].includes(String(item.station))?String(item.station):defaultStation(type);
  return{name,price:Math.round(price*100)/100,taxRate,sku:String(item.sku||''),type,station,photo:String(item.photo||'')};
}
export function normalizePosLayout(input){
  const src=input&&typeof input==='object'?clone(input):emptyPosLayout();
  const doc={...emptyPosLayout(),...src,schemaVersion:1};
  for(const key of ['pages','categories','buttons','modifierGroups','productModifiers','menus'])if(!Array.isArray(doc[key]))doc[key]=[];
  doc.pages=doc.pages.map((x,i)=>({id:String(x.id||uid('page')),name:String(x.name||'Page '+(i+1)),sortOrder:Number.isFinite(Number(x.sortOrder))?Number(x.sortOrder):i,color:String(x.color||'#efe5d7')}));
  doc.categories=doc.categories.map((x,i)=>({id:String(x.id||uid('cat')),name:String(x.name||'Catégorie'),parentId:String(x.parentId||''),sortOrder:Number.isFinite(Number(x.sortOrder))?Number(x.sortOrder):i,color:String(x.color||'#d9c4a7')}));
  doc.buttons=doc.buttons.map((x,i)=>({
    id:String(x.id||uid('btn')),pageId:String(x.pageId||doc.pages[0]?.id||''),categoryId:String(x.categoryId||''),
    productId:String(x.productId||''),item:normalizeEmbeddedItem(x.item),availability:normalizeAvailability(x.availability),label:String(x.label||''),sortOrder:Number.isFinite(Number(x.sortOrder))?Number(x.sortOrder):i,
    x:Number.isFinite(Number(x.x))?Number(x.x):i%4,y:Number.isFinite(Number(x.y))?Number(x.y):Math.floor(i/4),
    w:Math.max(1,Math.min(4,Number(x.w)||1)),h:Math.max(1,Math.min(4,Number(x.h)||1)),
    color:String(x.color||'#d6b98c'),hidden:!!x.hidden,unavailable:!!x.unavailable,favorite:!!x.favorite,
    station:['kitchen','bar','none'].includes(String(x.station))?String(x.station):(normalizeEmbeddedItem(x.item)?.station||''),photo:String(x.photo||''),modifierGroupIds:Array.isArray(x.modifierGroupIds)?x.modifierGroupIds.map(String):[]
  }));
  doc.modifierGroups=doc.modifierGroups.map((g,i)=>({
    id:String(g.id||uid('mod')),name:String(g.name||'Modificateurs'),type:String(g.type||'supplement'),
    required:!!g.required,min:Math.max(0,Number(g.min)||0),max:Math.max(1,Number(g.max)||1),
    station:['kitchen','bar','none'].includes(String(g.station))?String(g.station):'',
    options:Array.isArray(g.options)?g.options.map(o=>({id:String(o.id||uid('opt')),name:String(o.name||'Option'),priceDelta:Number(o.priceDelta)||0,station:['kitchen','bar','none'].includes(String(o.station))?String(o.station):'',ingredientId:String(o.ingredientId||''),omitIngredient:!!o.omitIngredient})):[]}));
  doc.productModifiers=doc.productModifiers.filter(Boolean).map(x=>({productId:String(x.productId||''),groupIds:Array.isArray(x.groupIds)?x.groupIds.map(String):[]}));
  doc.menus=doc.menus.map(m=>({id:String(m.id||uid('menu')),name:String(m.name||'Menu'),productId:String(m.productId||''),price:Number(m.price)||0,choices:Array.isArray(m.choices)?m.choices.map(c=>({id:String(c.id||uid('choice')),name:String(c.name||'Choix'),required:c.required!==false,min:Math.max(0,Number(c.min)||0),max:Math.max(1,Number(c.max)||1),categoryId:String(c.categoryId||''),productIds:Array.isArray(c.productIds)?c.productIds.map(String):[],modifierGroupIds:Array.isArray(c.modifierGroupIds)?c.modifierGroupIds.map(String):[]})):[]}));
  return doc;
}
export function emptyAssignedModifierGroups(input){
  const doc=normalizePosLayout(input);
  const assigned=new Set(doc.buttons.flatMap(b=>b.modifierGroupIds));
  for(const link of doc.productModifiers)for(const id of link.groupIds)assigned.add(id);
  return doc.modifierGroups.filter(g=>assigned.has(g.id)&&g.type!=='notes'&&!g.options.length);
}
export function seedPosLayoutFromCatalog(catalog=[]){
  const doc=emptyPosLayout();
  doc.pages=[{id:'page_main',name:'Service',sortOrder:0,color:'#efe5d7'}];
  const groups=new Map();
  for(const item of catalog.filter(x=>x.active!==false)){
    const name=String(item.category||'Autres').trim()||'Autres';
    if(!groups.has(name))groups.set(name,{id:uid('cat'),name,parentId:'',sortOrder:groups.size,color:'#d9c4a7'});
  }
  doc.categories=[...groups.values()];
  doc.buttons=catalog.filter(x=>x.active!==false).map((item,i)=>({
    id:uid('btn'),pageId:'page_main',categoryId:groups.get(String(item.category||'Autres').trim()||'Autres')?.id||'',
    productId:String(item.id||''),item:null,label:String(item.name||''),sortOrder:i,x:i%4,y:Math.floor(i/4),w:1,h:1,
    color:'#d6b98c',hidden:false,unavailable:false,favorite:i<4,station:String(item.production_station||''),modifierGroupIds:[]
  }));
  return normalizePosLayout(doc);
}
export function removePosLayoutCategory(input,categoryId){
  const doc=normalizePosLayout(input),category=doc.categories.find(x=>String(x.id)===String(categoryId));
  if(!category)return{document:doc,category:null,parentId:''};
  const parentId=doc.categories.some(x=>String(x.id)===String(category.parentId))?String(category.parentId):'';
  doc.categories=doc.categories.filter(x=>String(x.id)!==String(category.id)).map(x=>String(x.parentId||'')===String(category.id)?{...x,parentId}:x);
  doc.buttons=doc.buttons.map(x=>String(x.categoryId||'')===String(category.id)?{...x,categoryId:parentId}:x);
  doc.menus=doc.menus.map(menu=>({...menu,choices:menu.choices.map(choice=>String(choice.categoryId||'')===String(category.id)?{...choice,categoryId:parentId}:choice)}));
  return{document:normalizePosLayout(doc),category,parentId};
}
export function setPosLayoutCategoryParent(input,categoryId,parentId){
  const doc=normalizePosLayout(input),category=doc.categories.find(c=>c.id===String(categoryId));
  if(!category)return doc;
  if(parentId&&doc.categories.some(c=>c.parentId===category.id))return doc;
  const parent=doc.categories.find(c=>c.id===String(parentId));
  if(parent&&(!parent.parentId)&&parent.id!==category.id){
    let ancestor=parent,guard=0;
    while(ancestor&&guard++<doc.categories.length){
      if(ancestor.id===category.id)return doc;
      ancestor=doc.categories.find(c=>c.id===ancestor.parentId);
    }
  }else if(parentId)return doc;
  category.parentId=parent?.id||'';
  return doc;
}
export function posLayoutCategoryTree(input){
  const categories=normalizePosLayout(input).categories,byId=new Map(categories.map(c=>[c.id,c]));
  const sorted=[...categories].sort((a,b)=>a.sortOrder-b.sortOrder),result=[],seen=new Set();
  const visit=(category,depth)=>{if(seen.has(category.id))return;seen.add(category.id);result.push({...category,depth});for(const child of sorted)if(child.parentId===category.id)visit(child,depth+1)};
  for(const category of sorted)if(!byId.has(category.parentId))visit(category,0);
  for(const category of sorted)visit(category,0);
  return result;
}
export function layoutProduct(layout,catalog,id){return(catalog||[]).find(x=>String(x.id)===String(id))||null}
export function autoMatchLayoutButton(button,catalog=[]){
  if(button?.productId)return null;
  const name=normalizeMatchName(button?.item?.name||button?.label);if(!name)return null;
  let candidates=(catalog||[]).filter(x=>x?.active!==false&&normalizeMatchName(x?.name)===name);
  if(candidates.length>1&&Number.isFinite(Number(button?.item?.price))){
    const price=Number(button.item.price),priced=candidates.filter(x=>Math.abs((Number(x?.price)||0)-price)<=0.01);
    if(priced.length===1)candidates=priced;
  }
  return candidates.length===1?candidates[0]:null;
}
export function layoutButtonItem(button,catalog=[]){
  const linked=button?.productId?layoutProduct(null,catalog,button.productId):null;
  if(linked)return{...linked,source:'hub',autoMatched:false};
  const matched=autoMatchLayoutButton(button,catalog);
  if(matched)return{...matched,source:'hub',autoMatched:true};
  const item=normalizeEmbeddedItem(button?.item);
  return item?{id:'layout:'+String(button?.id||''),name:item.name,price:item.price,tax_rate:item.taxRate,sku:item.sku,production_station:item.station,type:item.type,photo:String(button?.photo||item.photo||''),source:'layout',autoMatched:false}:null;
}
async function optimizeProductPhoto(file){
  if(!file||!String(file.type||'').startsWith('image/'))throw new Error('Choisissez une image.');
  if(file.size>20*1024*1024)throw new Error('La photo dépasse 20 Mo.');
  const bitmap=await createImageBitmap(file);
  try{
    const scale=Math.min(1,480/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Préparation de la photo impossible.');
    ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    for(const quality of [.76,.66,.56,.46]){
      const data=canvas.toDataURL('image/jpeg',quality);
      if(data.length<=260000)return data;
    }
    throw new Error('La photo reste trop volumineuse après compression.');
  }finally{bitmap.close?.()}
}
function move(list,id,delta){
  const sorted=[...list].sort((a,b)=>(Number(a.sortOrder)||0)-(Number(b.sortOrder)||0));
  const index=sorted.findIndex(x=>String(x.id)===String(id)),target=index+delta;
  if(index<0||target<0||target>=sorted.length)return list;
  const [item]=sorted.splice(index,1);sorted.splice(target,0,item);sorted.forEach((x,i)=>x.sortOrder=i);return sorted;
}
export function renderPosLayoutEditor({layout,catalog=[],published=null,history=[],selectedButtonId='',selectedPageId='',selectedCategoryId='all',sectionNav=''}) {
  const doc=normalizePosLayout(layout),selectedRaw=doc.buttons.find(b=>b.id===selectedButtonId)||null;
  const pages=[...doc.pages].sort((a,b)=>a.sortOrder-b.sortOrder);
  const page=pages.find(p=>p.id===selectedPageId)||pages.find(p=>p.id===selectedRaw?.pageId)||pages[0]||null;
  const buttons=doc.buttons.filter(b=>!page||b.pageId===page.id).sort((a,b)=>a.sortOrder-b.sortOrder);
  const selected=doc.buttons.find(b=>b.id===selectedButtonId)||buttons[0]||null;
  const selectedItem=selected?layoutButtonItem(selected,catalog):null;
  const productOptions=catalog.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+' · '+Number(p.price||0).toFixed(2)+'</option>').join('');
  const pageOptions=pages.map(p=>'<option value="'+esc(p.id)+'" '+(p.id===page?.id?'selected':'')+'>'+esc(p.name)+'</option>').join('');
  const categories=posLayoutCategoryTree(doc);
  const catOptions=categories.map(c=>'<option value="'+esc(c.id)+'">'+(c.parentId?esc(categories.find(p=>p.id===c.parentId)?.name||'')+' › ':'')+esc(c.name)+'</option>').join('');
  const categoryPath=c=>{const names=[c.name],seen=new Set([c.id]);let parent=categories.find(p=>p.id===c.parentId);while(parent&&!seen.has(parent.id)){names.unshift(parent.name);seen.add(parent.id);parent=categories.find(p=>p.id===parent.parentId)}return names.join(' › ')};
  const rootOptions=categories.filter(c=>!c.parentId).map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>').join('');
  const categoryById=new Map(categories.map(c=>[String(c.id),c])),pageCategoryIds=new Set();
  for(const button of buttons){let category=categoryById.get(String(button.categoryId||'')),guard=0;while(category&&guard++<=categories.length){pageCategoryIds.add(String(category.id));category=category.parentId?categoryById.get(String(category.parentId)):null}}
  const pageCategories=categories.filter(c=>pageCategoryIds.has(String(c.id))||!doc.buttons.some(b=>String(b.categoryId||'')===String(c.id)));
  const roots=pageCategories.filter(c=>!pageCategories.some(parent=>String(parent.id)===String(c.parentId)));
  const requested=pageCategories.find(c=>String(c.id)===String(selectedCategoryId))||roots[0];
  const activeCategory=requested&&!buttons.some(b=>String(b.categoryId)===String(requested.id)
    ||(String(requested.id)===String(roots[0]?.id)&&!pageCategories.some(c=>String(c.id)===String(b.categoryId||''))))
    ?pageCategories.find(c=>String(c.parentId)===String(requested.id))||requested:requested;
  const activePreviewCategory=String(activeCategory?.id||'');
  const previewButtons=buttons.filter(b=>!pageCategories.length||String(b.categoryId||'')===activePreviewCategory
    ||(activePreviewCategory===String(roots[0]?.id)&&!pageCategories.some(c=>String(c.id)===String(b.categoryId||''))));
  let previewRoot=activeCategory;
  while(previewRoot?.parentId&&pageCategories.some(c=>String(c.id)===String(previewRoot.parentId)))previewRoot=pageCategories.find(c=>String(c.id)===String(previewRoot.parentId));
  const subcategories=pageCategories.filter(c=>String(c.parentId)===String(activeCategory?.parentId||activeCategory?.id));
  const previewCategoryNav='<nav class="pos-layout-preview-categories" aria-label="Catégories caisse">'+roots.map(c=>
    '<button type="button" data-layout-preview-category="'+esc(c.id)+'" class="'+(String(previewRoot?.id)===String(c.id)?'active':'')+'">'+esc(c.name)+'</button>'
    +(String(previewRoot?.id)===String(c.id)?subcategories.map(child=>'<button type="button" data-layout-preview-category="'+esc(child.id)+'" class="subcategory '+(activePreviewCategory===String(child.id)?'active':'')+'">'+esc(child.name)+'</button>').join(''):''))
    .join('')+'</nav>';
  const photoSrc=value=>{const src=String(value||'').trim();return /^(https?:\/\/|data:image\/(?:jpeg|png|webp);base64,)/i.test(src)?src:''};
  const selectedPhoto=photoSrc(selected?.photo||selectedItem?.photo||selectedItem?.photo_url||selectedItem?.image_url||'');
  const modChecks=selected?doc.modifierGroups.map(g=>'<label class="pos-layout-check"><input type="checkbox" data-layout-button-mod="'+esc(g.id)+'" '+(selected.modifierGroupIds.includes(g.id)?'checked':'')+'> '+esc(g.name)+(g.type!=='notes'&&!g.options.length?' · Ajouter une option pour l’utiliser':'')+'</label>').join(''):'';
  const pageOrder=pages.map(p=>'<span><b>'+esc(p.name)+'</b><button type="button" data-layout-page-move="'+esc(p.id)+':-1">↑</button><button type="button" data-layout-page-move="'+esc(p.id)+':1">↓</button><button type="button" class="danger" data-layout-page-delete="'+esc(p.id)+'" aria-label="Supprimer « '+esc(p.name)+' »" title="Supprimer la page">×</button></span>').join('');
  const categoryOrder=categories.map(c=>'<span style="margin-left:'+Math.min(c.depth,3)*18+'px"><b>'+esc(categoryPath(c))+'</b><select aria-label="Catégorie parente de '+esc(c.name)+'" data-layout-category-parent="'+esc(c.id)+'" '+(categories.some(child=>child.parentId===c.id)?'disabled title="Déplacez d’abord les sous-catégories"':'')+'><option value="">Racine</option>'+(c.parentId&&categories.find(p=>p.id===c.parentId)?.parentId?'<option value="'+esc(c.parentId)+'" selected disabled>'+esc(categories.find(p=>p.id===c.parentId)?.name||'')+' (parent actuel)</option>':'')+categories.filter(p=>!p.parentId&&p.id!==c.id).map(p=>'<option value="'+esc(p.id)+'" '+(p.id===c.parentId?'selected':'')+'>'+esc(p.name)+'</option>').join('')+'</select><button type="button" data-layout-category-move="'+esc(c.id)+':-1">↑</button><button type="button" data-layout-category-move="'+esc(c.id)+':1">↓</button><button type="button" class="danger" data-layout-category-delete="'+esc(c.id)+'" aria-label="Supprimer « '+esc(c.name)+' »" title="Supprimer la catégorie">×</button></span>').join('');
  const versions=(Array.isArray(history)?history:[]).slice(0,12);
  const historyHtml=versions.length?'<details class="pos-layout-history"><summary>Historique des publications ('+versions.length+')</summary><div class="pos-layout-list">'+versions.map(v=>'<article><span><strong>Version '+esc(v.version)+'</strong><small>'+esc(v.publishedAt?new Date(v.publishedAt).toLocaleString('fr-CH'):'date inconnue')+' · '+esc(String(v.checksum||'').slice(0,8))+'</small></span>'+(Number(v.version)===Number(published?.version)?'<span class="pill good">Actuelle</span>':'<button type="button" class="btn compact" data-layout-restore-version="'+esc(v.version)+'">Restaurer en brouillon</button>')+'</article>').join('')+'</div><p class="muted">Une restauration ne modifie pas les caisses tant que vous ne republiez pas le brouillon.</p></details>':'';
  return '<section class="card pos-layout-editor" data-module-section-root="pos-layout-editor">'
    +'<div class="pos-layout-head"><div><h2>Configuration POS</h2><p class="muted">Créez ici toutes les touches de caisse. Un produit Hub est optionnel.</p></div><div class="actions"><button class="btn" id="posLayoutSeed">Importer le catalogue Hub</button><button class="btn" id="posLayoutSave">Enregistrer brouillon</button><button class="btn primary" id="posLayoutPublish">Publier vers les POS</button></div></div>'
    +historyHtml
    +sectionNav+'<div class="module-section-panes">'
    +'<div data-module-pane="touches"><details class="pos-layout-create"><summary>Créer une touche de caisse</summary>'
    +'<form id="posLayoutButtonForm" class="pos-layout-create-form"><label>Type<select name="itemType"><option value="dish">Plat</option><option value="drink">Boisson</option><option value="other">Autre</option></select></label><label>Nom<input name="name" required maxlength="120" placeholder="Ex. Burger maison"></label><label>Prix CHF<input name="price" required type="number" min="0" step="0.01" inputmode="decimal" placeholder="18.50"></label><label>TVA %<input name="taxRate" required type="number" min="0" max="100" step="0.1" value="8.1"></label><label>Destination<select name="station"><option value="">Auto</option><option value="kitchen">Cuisine</option><option value="bar">Bar</option><option value="none">Aucune</option></select></label><label>Disponibilité<select name="availabilityMode"><option value="unlimited">Illimitée</option><option value="manual">Quantité manuelle</option><option value="stock">Calculée par stock/recette</option></select></label><label>Qté manuelle<input name="manualQuantity" type="number" min="0" step="1" value="0"></label><label>Alerte basse<input name="lowThreshold" type="number" min="0" step="1" value="3"></label><label>Page<select name="pageId"><option value="">Auto : Caisse</option>'+pageOptions+'</select></label><label>Catégorie<select name="categoryId"><option value="">Auto selon le type</option>'+catOptions+'</select></label><label>Lien Hub facultatif<select name="productId"><option value="">Aucun — touche autonome</option>'+productOptions+'</select></label><button class="btn primary pos-layout-create-submit">+ Ajouter la touche</button></form>'
    +'<p class="muted pos-layout-create-note">Une touche autonome fonctionne en caisse, hors ligne, sur les tickets et en cuisine/bar. Sans lien Hub, elle ne décrémente simplement pas le stock et n’a pas de food cost associé.</p></details>'
    +'<div class="pos-layout-workspace"><div class="pos-layout-preview"><div class="pos-layout-pages">'+pages.map(p=>'<button type="button" data-layout-page-select="'+esc(p.id)+'" class="'+(p.id===page?.id?'active':'')+'">'+esc(p.name)+'</button>').join('')+'</div>'+previewCategoryNav+'<div class="pos-layout-grid" id="posLayoutGrid">'+previewButtons.map(b=>{const p=layoutButtonItem(b,catalog),cat=categories.find(c=>c.id===b.categoryId),photo=photoSrc(b.photo||p?.photo||p?.photo_url||p?.image_url||p?.image||'');return '<button type="button" class="pos-layout-tile '+(b.id===selected?.id?'selected ':'')+(b.hidden?'is-hidden ':'')+(b.unavailable?'is-unavailable ':'')+'" draggable="true" data-layout-button="'+esc(b.id)+'" style="--tile-color:'+esc(b.color)+';--tile-w:'+b.w+';--tile-h:'+b.h+'"><span class="pos-layout-tile-visual">'+(photo?'<img src="'+esc(photo)+'" alt="">':'<span class="pos-layout-photo-placeholder"></span>')+'</span><span class="pos-layout-tile-copy"><strong>'+esc(b.label||p?.name||'Article')+'</strong><small>'+esc(cat?.name||itemTypeLabel(b.item?.type||''))+(p?.price!=null?' · '+Number(p.price).toFixed(2)+' CHF':'')+(p?.autoMatched?' · Liée Hub auto':'')+'</small></span></button>'}).join('')+'</div></div>'
    +(selected?'<aside class="pos-layout-inspector"><h3>Propriétés touche</h3>'+(selectedPhoto?'<div class="pos-layout-photo-preview"><img src="'+esc(selectedPhoto)+'" alt="Photo actuelle de l’article"></div>':'')+'<label>Photo facultative<input id="posLayoutPhoto" type="file" accept="image/*"></label>'+(selected.photo?'<button type="button" class="btn compact" id="posLayoutPhotoClear">Retirer la photo</button>':'')+'<label>Libellé<input id="posLayoutLabel" value="'+esc(selected.label||selectedItem?.name||'')+'"></label>'+(selectedItem?.autoMatched?'<div class="pos-layout-linked-note"><strong>Liaison automatique Hub</strong><br>'+esc(selectedItem.name||'Produit')+' · '+Number(selectedItem.price||0).toFixed(2)+' CHF<br><small>Les ventes futures utilisent le produit Hub, son food cost et son stock. La position et le style de la touche restent inchangés.</small></div>':selected.item?'<label>Prix CHF<input id="posLayoutItemPrice" type="number" min="0" step="0.01" value="'+esc(selected.item.price)+'"></label><label>TVA %<input id="posLayoutItemTax" type="number" min="0" max="100" step="0.1" value="'+esc(selected.item.taxRate)+'"></label>':'<div class="pos-layout-linked-note">Liée au catalogue Hub · '+esc(selectedItem?.name||'produit')+'</div>')+'<label>Catégorie<select id="posLayoutCategory">'+categories.map(c=>'<option value="'+esc(c.id)+'" '+(String(selected.categoryId)===String(c.id)?'selected':'')+'>'+(c.parentId?'↳ ':'')+esc(c.name)+'</option>').join('')+'</select></label>'+'<label>Couleur<input id="posLayoutColor" type="color" value="'+esc(selected.color)+'"></label><div class="pos-layout-size"><label>Largeur<select id="posLayoutW">'+[1,2,3,4].map(n=>'<option '+(selected.w===n?'selected':'')+'>'+n+'</option>').join('')+'</select></label><label>Hauteur<select id="posLayoutH">'+[1,2,3,4].map(n=>'<option '+(selected.h===n?'selected':'')+'>'+n+'</option>').join('')+'</select></label></div><label>Disponibilité<select id="posLayoutAvailabilityMode"><option value="unlimited" '+(selected.availability.mode==='unlimited'?'selected':'')+'>Illimitée</option><option value="manual" '+(selected.availability.mode==='manual'?'selected':'')+'>Quantité manuelle</option><option value="stock" '+(selected.availability.mode==='stock'?'selected':'')+'>Stock / recette</option></select></label><label>Qté manuelle<input id="posLayoutAvailabilityQty" type="number" min="0" step="1" value="'+esc(selected.availability.manualQuantity)+'"></label><label>Alerte basse<input id="posLayoutAvailabilityLow" type="number" min="0" step="1" value="'+esc(selected.availability.lowThreshold)+'"></label>'+(selected.availability.mode==='manual'?'<button type="button" class="btn compact" id="posLayoutAvailabilityReset">↻ Remettre la quantité disponible à '+esc(selected.availability.manualQuantity)+'</button>':'')+'<label>Routage<select id="posLayoutStation"><option value="kitchen" '+(selected.station==='kitchen'?'selected':'')+'>Cuisine</option><option value="bar" '+(selected.station==='bar'?'selected':'')+'>Bar</option><option value="none" '+(selected.station==='none'?'selected':'')+'>Aucun</option></select></label><label class="pos-layout-check"><input id="posLayoutHidden" type="checkbox" '+(selected.hidden?'checked':'')+'> Masqué</label><label class="pos-layout-check"><input id="posLayoutUnavailable" type="checkbox" '+(selected.unavailable?'checked':'')+'> Temporairement indisponible</label><div><strong>Modificateurs</strong>'+modChecks+'</div><button class="btn danger" id="posLayoutDeleteButton">Supprimer la touche</button></aside>':'<aside class="pos-layout-inspector"><p class="muted">Créez une touche ou sélectionnez-en une pour la modifier.</p></aside>')+'</div>'
    +'</div>'
    +'<div data-module-pane="categories">'
    +'<div class="pos-layout-meta"><form id="posLayoutPageForm"><input name="name" required placeholder="Nouvelle page"><button class="btn compact">+ Page</button></form><form id="posLayoutCategoryForm"><input name="name" required placeholder="Catégorie / sous-catégorie"><select name="parentId"><option value="">Catégorie racine</option>'+rootOptions+'</select><button class="btn compact">+ Catégorie</button></form></div>'
    +'<div class="pos-layout-order"><div><strong>Ordre pages</strong>'+pageOrder+'</div><div><strong>Ordre catégories</strong>'+categoryOrder+'</div></div>'
    +'</div>'
    +'<div data-module-pane="menus">'
    +'<div class="pos-layout-bottom"><section><h3>Groupes de modificateurs</h3><p class="muted">Créez un groupe, ajoutez ses options, puis associez-le aux touches concernées.</p><form id="posLayoutModifierForm" class="pos-layout-inline"><input name="name" required placeholder="Ex. Cuisson"><select name="type"><option value="cooking">Cuisson</option><option value="side">Accompagnement</option><option value="supplement">Supplément</option><option value="without">Sans ingrédient</option><option value="notes">Notes</option></select><select name="station"><option value="">Même routage que l’article</option><option value="kitchen">Cuisine</option><option value="bar">Bar</option><option value="none">Aucun</option></select><label><input type="checkbox" name="required"> Obligatoire</label><input type="number" name="min" min="0" value="0" title="Minimum"><input type="number" name="max" min="1" value="1" title="Maximum"><button class="btn compact">+ Groupe</button></form><div class="pos-layout-list">'+doc.modifierGroups.map(g=>'<article><form class="pos-layout-inline pos-layout-modifier-edit" data-layout-modifier-edit="'+esc(g.id)+'"><input name="name" required maxlength="100" value="'+esc(g.name)+'"><select name="type">'+['cooking','side','supplement','without','notes'].map(v=>'<option value="'+v+'" '+(g.type===v?'selected':'')+'>'+({cooking:'Cuisson',side:'Accompagnement',supplement:'Supplément',without:'Sans ingrédient',notes:'Notes'}[v])+'</option>').join('')+'</select><select name="station"><option value="" '+(!g.station?'selected':'')+'>Routage article</option><option value="kitchen" '+(g.station==='kitchen'?'selected':'')+'>Cuisine</option><option value="bar" '+(g.station==='bar'?'selected':'')+'>Bar</option><option value="none" '+(g.station==='none'?'selected':'')+'>Aucun</option></select><label><input name="required" type="checkbox" '+(g.required?'checked':'')+'> Obligatoire</label><input name="min" type="number" min="0" value="'+g.min+'" title="Minimum"><input name="max" type="number" min="1" value="'+g.max+'" title="Maximum"><button class="btn compact">Enregistrer</button></form><form class="pos-layout-option-form pos-layout-inline" data-layout-option-form="'+esc(g.id)+'"><input name="name" required maxlength="100" placeholder="Nouvelle option"><input name="priceDelta" type="number" step="0.01" value="0" title="Supplément CHF"><select name="station"><option value="">Routage article</option><option value="kitchen">Cuisine</option><option value="bar">Bar</option><option value="none">Aucun</option></select><button class="btn compact">+ Option</button></form><div class="pos-layout-option-list">'+g.options.map(o=>'<span><b>'+esc(o.name)+'</b>'+(o.priceDelta?' +'+o.priceDelta.toFixed(2):'')+(o.station?' ['+esc(o.station)+']':'')+' <button type="button" class="btn danger compact" data-layout-delete-option="'+esc(g.id)+':'+esc(o.id)+'">×</button></span>').join('')+'</div><button type="button" class="btn danger compact" data-layout-delete-modifier="'+esc(g.id)+'">Supprimer le groupe</button></article>').join('')+'</div></section>'
    +'<section><h3>Menus / compositions</h3><form id="posLayoutMenuForm" class="pos-layout-inline"><input name="name" required placeholder="Ex. Menu midi"><select name="productId"><option value="">Produit maître optionnel</option>'+productOptions+'</select><input name="price" type="number" min="0" step="0.01" placeholder="Prix"><button class="btn compact">+ Menu</button></form><div class="pos-layout-list">'+doc.menus.map(m=>'<article><form class="pos-layout-inline pos-layout-menu-edit" data-layout-menu-edit="'+esc(m.id)+'"><input name="name" required maxlength="100" value="'+esc(m.name)+'"><select name="productId"><option value="">Produit maître optionnel</option>'+catalog.map(p=>'<option value="'+esc(p.id)+'" '+(m.productId===p.id?'selected':'')+'>'+esc(p.name)+'</option>').join('')+'</select><input name="price" type="number" min="0" step="0.01" value="'+Number(m.price||0).toFixed(2)+'"><button class="btn compact">Enregistrer</button></form><form class="pos-layout-choice-form pos-layout-inline" data-layout-choice-form="'+esc(m.id)+'"><input name="name" required maxlength="100" placeholder="Ex. Choix du plat"><select name="categoryId"><option value="">Tout le catalogue</option>'+catOptions+'</select><select name="productIds" multiple size="3" title="Produits précis (optionnel)">'+catalog.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join('')+'</select><input name="min" type="number" min="0" value="1" title="Minimum"><input name="max" type="number" min="1" value="1" title="Maximum"><label><input name="required" type="checkbox" checked> Obligatoire</label><button class="btn compact">+ Choix</button></form><div class="pos-layout-option-list">'+m.choices.map(choice=>{const cat=categories.find(x=>x.id===choice.categoryId);return '<span><b>'+esc(choice.name)+'</b> ('+(choice.required?'obligatoire':'optionnel')+(cat?' · '+esc(cat.name):choice.productIds?.length?' · '+choice.productIds.length+' produits':' · tout catalogue')+') <button type="button" class="btn danger compact" data-layout-delete-choice="'+esc(m.id)+':'+esc(choice.id)+'">×</button></span>'}).join('')+'</div><button type="button" class="btn danger compact" data-layout-delete-menu="'+esc(m.id)+'">Supprimer le menu</button></article>').join('')+'</div></section></div>'
    +'</div>'    +'</div></div>'
    +'</section>';
}
export function bindPosLayoutEditor(root,{getLayout,setLayout,getSelected,setSelected,getPage,setPage,setCategory,catalog,onDirty,onSave,onPublish,onRestore,onSeed,onRender}){
  if(!root)return;
  const mutate=fn=>{const doc=normalizePosLayout(getLayout());fn(doc);setLayout(doc);onDirty?.();};
  root.querySelector('#posLayoutSeed')?.addEventListener('click',()=>onSeed?.());
  root.querySelector('#posLayoutSave')?.addEventListener('click',()=>onSave?.());
  root.querySelectorAll('[data-layout-preview-category]').forEach(el=>el.addEventListener('click',()=>{setCategory?.(el.dataset.layoutPreviewCategory);onRender?.()}));
  root.querySelector('#posLayoutPublish')?.addEventListener('click',()=>onPublish?.());
  root.querySelectorAll('[data-layout-restore-version]').forEach(el=>el.addEventListener('click',()=>onRestore?.(Number(el.dataset.layoutRestoreVersion))));
  root.querySelectorAll('[data-layout-page-select]').forEach(el=>el.addEventListener('click',()=>{setPage?.(el.dataset.layoutPageSelect);setCategory?.('all');const doc=normalizePosLayout(getLayout()),first=doc.buttons.filter(b=>b.pageId===el.dataset.layoutPageSelect).sort((a,b)=>a.sortOrder-b.sortOrder)[0];setSelected(first?.id||'');onRender?.()}));
  root.querySelectorAll('[data-layout-page-move]').forEach(el=>el.addEventListener('click',()=>{const [id,d]=String(el.dataset.layoutPageMove).split(':');mutate(doc=>{doc.pages=move(doc.pages,id,Number(d));})}));
  root.querySelectorAll('[data-layout-page-delete]').forEach(el=>el.addEventListener('click',()=>{
    const id=String(el.dataset.layoutPageDelete||''),doc=normalizePosLayout(getLayout()),page=doc.pages.find(x=>String(x.id)===id);if(!page)return;
    const buttons=doc.buttons.filter(x=>String(x.pageId)===id),fallback=doc.pages.find(x=>String(x.id)!==id)||null;
    const message='Supprimer la page « '+page.name+' » ?'+(buttons.length?'\n\n'+buttons.length+' touche(s) seront '+(fallback?'déplacée(s) vers « '+fallback.name+' ».':'conservée(s) sur une nouvelle page « Caisse ».'):'');
    if(typeof globalThis.confirm==='function'&&!globalThis.confirm(message))return;
    mutate(current=>{current.pages=current.pages.filter(x=>String(x.id)!==id);let target=current.pages[0];if(!target&&buttons.length){target={id:uid('page'),name:'Caisse',sortOrder:0,color:'#efe5d7'};current.pages.push(target)}if(target)current.buttons=current.buttons.map(b=>String(b.pageId)===id?{...b,pageId:target.id}:b);current.pages.forEach((p,i)=>p.sortOrder=i);setPage?.(target?.id||'');setSelected(target?current.buttons.find(b=>b.pageId===target.id)?.id||'':'')});
  }));
  root.querySelectorAll('[data-layout-category-move]').forEach(el=>el.addEventListener('click',()=>{const [id,d]=String(el.dataset.layoutCategoryMove).split(':');mutate(doc=>{doc.categories=move(doc.categories,id,Number(d));})}));
  root.querySelectorAll('[data-layout-category-parent]').forEach(el=>el.addEventListener('change',()=>mutate(doc=>Object.assign(doc,setPosLayoutCategoryParent(doc,el.dataset.layoutCategoryParent,el.value)))));
  root.querySelectorAll('[data-layout-category-delete]').forEach(el=>el.addEventListener('click',()=>{
    const id=String(el.dataset.layoutCategoryDelete||''),doc=normalizePosLayout(getLayout()),category=doc.categories.find(x=>String(x.id)===id);
    if(!category)return;
    const childCount=doc.categories.filter(x=>String(x.parentId||'')===id).length;
    const buttonCount=doc.buttons.filter(x=>String(x.categoryId||'')===id).length;
    const parent=doc.categories.find(x=>String(x.id)===String(category.parentId||''));
    const destination=parent?parent.name:'aucune catégorie (toutes les touches restent dans la caisse)';
    const details=[];
    if(childCount)details.push(childCount+' sous-catégorie(s) seront rattachée(s) à « '+(parent?.name||'la racine')+' »');
    if(buttonCount)details.push(buttonCount+' touche(s) resteront dans la caisse et seront déplacées vers '+destination);
    const message='Supprimer la catégorie « '+category.name+' » ?'+(details.length?'\n\n'+details.join('. ')+'.':'');
    if(typeof globalThis.confirm==='function'&&!globalThis.confirm(message))return;
    const result=removePosLayoutCategory(doc,id);if(!result.category)return;
    setCategory?.(result.parentId||'all');
    mutate(current=>Object.assign(current,result.document));
  }));
  root.querySelector('#posLayoutPageForm')?.addEventListener('submit',e=>{e.preventDefault();const d=new FormData(e.currentTarget);mutate(doc=>{const id=uid('page');doc.pages.push({id,name:String(d.get('name')||'Page'),sortOrder:doc.pages.length,color:'#efe5d7'});setPage?.(id);setSelected('')})});
  root.querySelector('#posLayoutCategoryForm')?.addEventListener('submit',e=>{e.preventDefault();const d=new FormData(e.currentTarget);mutate(doc=>doc.categories.push({id:uid('cat'),name:String(d.get('name')||'Catégorie'),parentId:String(d.get('parentId')||''),sortOrder:doc.categories.length,color:'#d9c4a7'}));});
  root.querySelector('#posLayoutButtonForm')?.addEventListener('submit',e=>{
    e.preventDefault();const d=new FormData(e.currentTarget),type=['dish','drink','other'].includes(String(d.get('itemType')))?String(d.get('itemType')):'other',linked=(catalog||[]).find(x=>String(x.id)===String(d.get('productId')))||null;
    const name=String(d.get('name')||linked?.name||'').trim(),price=Number(d.get('price')),taxRate=Number(d.get('taxRate'));
    if(!name||!Number.isFinite(price)||price<0||!Number.isFinite(taxRate)||taxRate<0||taxRate>100)return;
    mutate(doc=>{
      let pageId=String(d.get('pageId')||getPage?.()||doc.pages[0]?.id||'');
      if(!pageId){const p={id:uid('page'),name:'Caisse',sortOrder:doc.pages.length,color:'#efe5d7'};doc.pages.push(p);pageId=p.id}
      let categoryId=String(d.get('categoryId')||'');
      if(!categoryId){
        const categoryName=defaultCategory(type),existing=doc.categories.find(c=>String(c.name).trim().toLowerCase()===categoryName.toLowerCase());
        if(existing)categoryId=existing.id;else{const c={id:uid('cat'),name:categoryName,parentId:'',sortOrder:doc.categories.length,color:'#d9c4a7'};doc.categories.push(c);categoryId=c.id}
      }
      const station=String(d.get('station')||'')||defaultStation(type),i=doc.buttons.length,id=uid('btn');
      doc.buttons.push({
        id,pageId,categoryId,productId:linked?String(linked.id):'',
        item:linked?null:{name,price:Math.round(price*100)/100,taxRate,sku:'',type,station},
        availability:normalizeAvailability({mode:String(d.get('availabilityMode')||'unlimited'),manualQuantity:Number(d.get('manualQuantity'))||0,lowThreshold:Number(d.get('lowThreshold'))||3,resetAt:String(d.get('availabilityMode'))==='manual'?new Date().toISOString():''}),
        label:name,sortOrder:i,x:i%4,y:Math.floor(i/4),w:1,h:1,color:type==='drink'?'#c9d9df':type==='dish'?'#d6b98c':'#ded6ca',
        hidden:false,unavailable:false,favorite:false,station:linked?String(linked.production_station||station):station,modifierGroupIds:[]
      });
      setPage?.(pageId);setSelected(id)
    });
  });
  root.querySelectorAll('[data-layout-button]').forEach(el=>{
    el.addEventListener('click',()=>{setSelected(el.dataset.layoutButton);onRender?.()});
    el.addEventListener('dragstart',e=>e.dataTransfer?.setData('text/plain',el.dataset.layoutButton));
    el.addEventListener('dragover',e=>e.preventDefault());
    el.addEventListener('drop',e=>{e.preventDefault();const from=e.dataTransfer?.getData('text/plain'),to=el.dataset.layoutButton;if(!from||from===to)return;mutate(doc=>{const pageId=getPage?.()||doc.buttons.find(x=>x.id===to)?.pageId;const pageButtons=doc.buttons.filter(x=>x.pageId===pageId).sort((a,b)=>a.sortOrder-b.sortOrder),a=pageButtons.findIndex(x=>x.id===from),b=pageButtons.findIndex(x=>x.id===to);if(a<0||b<0)return;const [m]=pageButtons.splice(a,1);pageButtons.splice(b,0,m);pageButtons.forEach((x,i)=>{x.sortOrder=i;x.x=i%4;x.y=Math.floor(i/4)});const ids=new Set(pageButtons.map(x=>x.id));doc.buttons=[...doc.buttons.filter(x=>!ids.has(x.id)),...pageButtons]})});
  });
  root.querySelector('#posLayoutPhoto')?.addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{const photo=await optimizeProductPhoto(file);mutate(doc=>{const b=doc.buttons.find(x=>x.id===getSelected());if(b)b.photo=photo})}catch(error){alert(error?.message||'Impossible de charger cette photo.');e.target.value=''}});
  root.querySelector('#posLayoutPhotoClear')?.addEventListener('click',()=>{mutate(doc=>{const b=doc.buttons.find(x=>x.id===getSelected());if(b)b.photo='' })});
  const bindValue=(sel,key,parse=v=>v)=>root.querySelector(sel)?.addEventListener('change',e=>mutate(doc=>{const b=doc.buttons.find(x=>x.id===getSelected());if(b)b[key]=parse(e.target.type==='checkbox'?e.target.checked:e.target.value)}));
  root.querySelector('#posLayoutLabel')?.addEventListener('change',e=>mutate(doc=>{const b=doc.buttons.find(x=>x.id===getSelected());if(!b)return;b.label=String(e.target.value||'');if(b.item)b.item.name=b.label.trim()||b.item.name}));
  bindValue('#posLayoutCategory','categoryId',String);bindValue('#posLayoutColor','color',String);bindValue('#posLayoutW','w',Number);bindValue('#posLayoutH','h',Number);bindValue('#posLayoutStation','station',String);bindValue('#posLayoutHidden','hidden',Boolean);bindValue('#posLayoutUnavailable','unavailable',Boolean);
  root.querySelector('#posLayoutItemPrice')?.addEventListener('change',e=>mutate(doc=>{const b=doc.buttons.find(x=>x.id===getSelected());if(b?.item)b.item.price=Math.max(0,Number(e.target.value)||0)}));
  root.querySelector('#posLayoutItemTax')?.addEventListener('change',e=>mutate(doc=>{const b=doc.buttons.find(x=>x.id===getSelected());if(b?.item)b.item.taxRate=Math.max(0,Math.min(100,Number(e.target.value)||0))}));
  root.querySelector('#posLayoutAvailabilityMode')?.addEventListener('change',e=>mutate(doc=>{const b=doc.buttons.find(x=>x.id===getSelected());if(b)b.availability=normalizeAvailability({...b.availability,mode:e.target.value,resetAt:e.target.value==='manual'?new Date().toISOString():b.availability?.resetAt})}));
  root.querySelector('#posLayoutAvailabilityQty')?.addEventListener('change',e=>mutate(doc=>{const b=doc.buttons.find(x=>x.id===getSelected());if(b)b.availability=normalizeAvailability({...b.availability,manualQuantity:e.target.value,resetAt:new Date().toISOString()})}));
  root.querySelector('#posLayoutAvailabilityLow')?.addEventListener('change',e=>mutate(doc=>{const b=doc.buttons.find(x=>x.id===getSelected());if(b)b.availability=normalizeAvailability({...b.availability,lowThreshold:e.target.value})}));
  root.querySelector('#posLayoutAvailabilityReset')?.addEventListener('click',()=>mutate(doc=>{const b=doc.buttons.find(x=>x.id===getSelected());if(b)b.availability=normalizeAvailability({...b.availability,resetAt:new Date().toISOString()})}));
  root.querySelectorAll('[data-layout-button-mod]').forEach(el=>el.addEventListener('change',()=>mutate(doc=>{const b=doc.buttons.find(x=>x.id===getSelected());if(!b)return;const id=el.dataset.layoutButtonMod;b.modifierGroupIds=el.checked?[...new Set([...b.modifierGroupIds,id])]:b.modifierGroupIds.filter(x=>x!==id)})));
  root.querySelector('#posLayoutDeleteButton')?.addEventListener('click',()=>mutate(doc=>{doc.buttons=doc.buttons.filter(x=>x.id!==getSelected());setSelected(doc.buttons.find(x=>x.pageId===getPage?.())?.id||'')}));
  root.querySelector('#posLayoutModifierForm')?.addEventListener('submit',e=>{e.preventDefault();const d=new FormData(e.currentTarget);mutate(doc=>doc.modifierGroups.push({id:uid('mod'),name:String(d.get('name')||'Modificateurs'),type:String(d.get('type')||'supplement'),required:d.get('required')==='on',min:Number(d.get('min'))||0,max:Math.max(1,Number(d.get('max'))||1),station:String(d.get('station')||''),options:[]}))});
  root.querySelectorAll('[data-layout-modifier-edit]').forEach(form=>form.addEventListener('submit',e=>{e.preventDefault();const d=new FormData(form),name=String(d.get('name')||'').trim(),min=Math.max(0,Number(d.get('min'))||0),max=Math.max(1,Number(d.get('max'))||1);if(!name||max<min)return;mutate(doc=>{const g=doc.modifierGroups.find(x=>x.id===form.dataset.layoutModifierEdit);if(!g)return;g.name=name;g.type=String(d.get('type')||'supplement');g.station=String(d.get('station')||'');g.required=d.get('required')==='on';g.min=min;g.max=max})}));
  root.querySelectorAll('[data-layout-option-form]').forEach(form=>form.addEventListener('submit',e=>{
    e.preventDefault();const d=new FormData(form),name=String(d.get('name')||'').trim();if(!name)return;
    mutate(doc=>{const g=doc.modifierGroups.find(x=>x.id===form.dataset.layoutOptionForm);if(g)g.options.push({id:uid('opt'),name,priceDelta:Number(d.get('priceDelta'))||0,station:['kitchen','bar','none'].includes(String(d.get('station')))?String(d.get('station')):'',ingredientId:'',omitIngredient:g.type==='without'})});
  }));
  root.querySelectorAll('[data-layout-delete-option]').forEach(el=>el.addEventListener('click',()=>{
    const [groupId,optionId]=String(el.dataset.layoutDeleteOption||'').split(':');
    mutate(doc=>{const g=doc.modifierGroups.find(x=>x.id===groupId);if(g)g.options=g.options.filter(x=>x.id!==optionId)});
  }));
  root.querySelectorAll('[data-layout-delete-modifier]').forEach(el=>el.addEventListener('click',()=>{
    const id=String(el.dataset.layoutDeleteModifier||'');if(!id)return;
    if(typeof globalThis.confirm==='function'&&!globalThis.confirm('Supprimer ce groupe de modificateurs et toutes ses associations ?'))return;
    mutate(doc=>{doc.modifierGroups=doc.modifierGroups.filter(x=>x.id!==id);doc.buttons=doc.buttons.map(b=>({...b,modifierGroupIds:b.modifierGroupIds.filter(x=>x!==id)}));doc.productModifiers=doc.productModifiers.map(p=>({...p,groupIds:p.groupIds.filter(x=>x!==id)}));doc.menus=doc.menus.map(m=>({...m,choices:m.choices.map(ch=>({...ch,modifierGroupIds:ch.modifierGroupIds.filter(x=>x!==id)}))}))});
  }));
  root.querySelector('#posLayoutMenuForm')?.addEventListener('submit',e=>{e.preventDefault();const d=new FormData(e.currentTarget);mutate(doc=>doc.menus.push({id:uid('menu'),name:String(d.get('name')||'Menu'),productId:String(d.get('productId')||''),price:Number(d.get('price'))||0,choices:[]}))});
  root.querySelectorAll('[data-layout-menu-edit]').forEach(form=>form.addEventListener('submit',e=>{e.preventDefault();const d=new FormData(form),name=String(d.get('name')||'').trim();if(!name)return;mutate(doc=>{const m=doc.menus.find(x=>x.id===form.dataset.layoutMenuEdit);if(!m)return;m.name=name;m.productId=String(d.get('productId')||'');m.price=Math.max(0,Number(d.get('price'))||0)})}));
  root.querySelectorAll('[data-layout-choice-form]').forEach(form=>form.addEventListener('submit',e=>{
    e.preventDefault();const d=new FormData(form),name=String(d.get('name')||'').trim(),min=Math.max(0,Number(d.get('min'))||0),max=Math.max(1,Number(d.get('max'))||1);if(!name||max<min)return;
    mutate(doc=>{const m=doc.menus.find(x=>x.id===form.dataset.layoutChoiceForm);if(m)m.choices.push({id:uid('choice'),name,required:d.get('required')==='on',min,max,categoryId:String(d.get('categoryId')||''),productIds:d.getAll('productIds').map(String).filter(Boolean),modifierGroupIds:[]})});
  }));
  root.querySelectorAll('[data-layout-delete-choice]').forEach(el=>el.addEventListener('click',()=>{
    const [menuId,choiceId]=String(el.dataset.layoutDeleteChoice||'').split(':');mutate(doc=>{const m=doc.menus.find(x=>x.id===menuId);if(m)m.choices=m.choices.filter(x=>x.id!==choiceId)});
  }));
  root.querySelectorAll('[data-layout-delete-menu]').forEach(el=>el.addEventListener('click',()=>{
    const id=String(el.dataset.layoutDeleteMenu||'');if(!id)return;if(typeof globalThis.confirm==='function'&&!globalThis.confirm('Supprimer ce menu ?'))return;
    mutate(doc=>{doc.menus=doc.menus.filter(x=>x.id!==id)});
  }));
}
