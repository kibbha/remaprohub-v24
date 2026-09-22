const uid=prefix=>prefix+'_'+Math.random().toString(36).slice(2,9);
const clone=value=>JSON.parse(JSON.stringify(value));
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function emptyPosLayout(){
  return {schemaVersion:1,pages:[],categories:[],buttons:[],modifierGroups:[],productModifiers:[],menus:[]};
}
export function normalizePosLayout(input){
  const src=input&&typeof input==='object'?clone(input):emptyPosLayout();
  const doc={...emptyPosLayout(),...src,schemaVersion:1};
  for(const key of ['pages','categories','buttons','modifierGroups','productModifiers','menus'])if(!Array.isArray(doc[key]))doc[key]=[];
  doc.pages=doc.pages.map((x,i)=>({id:String(x.id||uid('page')),name:String(x.name||'Page '+(i+1)),sortOrder:Number.isFinite(Number(x.sortOrder))?Number(x.sortOrder):i,color:String(x.color||'#efe5d7')}));
  doc.categories=doc.categories.map((x,i)=>({id:String(x.id||uid('cat')),name:String(x.name||'Catégorie'),parentId:String(x.parentId||''),sortOrder:Number.isFinite(Number(x.sortOrder))?Number(x.sortOrder):i,color:String(x.color||'#d9c4a7')}));
  doc.buttons=doc.buttons.map((x,i)=>({
    id:String(x.id||uid('btn')),pageId:String(x.pageId||doc.pages[0]?.id||''),categoryId:String(x.categoryId||''),
    productId:String(x.productId||''),label:String(x.label||''),sortOrder:Number.isFinite(Number(x.sortOrder))?Number(x.sortOrder):i,
    x:Number.isFinite(Number(x.x))?Number(x.x):i%4,y:Number.isFinite(Number(x.y))?Number(x.y):Math.floor(i/4),
    w:Math.max(1,Math.min(4,Number(x.w)||1)),h:Math.max(1,Math.min(4,Number(x.h)||1)),
    color:String(x.color||'#d6b98c'),hidden:!!x.hidden,unavailable:!!x.unavailable,favorite:!!x.favorite,
    station:['kitchen','bar','none'].includes(String(x.station))?String(x.station):'',modifierGroupIds:Array.isArray(x.modifierGroupIds)?x.modifierGroupIds.map(String):[]
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
    productId:String(item.id||''),label:String(item.name||''),sortOrder:i,x:i%4,y:Math.floor(i/4),w:1,h:1,
    color:'#d6b98c',hidden:false,unavailable:false,favorite:i<4,station:String(item.production_station||''),modifierGroupIds:[]
  }));
  return normalizePosLayout(doc);
}
export function layoutProduct(layout,catalog,id){return(catalog||[]).find(x=>String(x.id)===String(id))||null}
function move(list,id,delta){
  const sorted=[...list].sort((a,b)=>(Number(a.sortOrder)||0)-(Number(b.sortOrder)||0));
  const index=sorted.findIndex(x=>String(x.id)===String(id)),target=index+delta;
  if(index<0||target<0||target>=sorted.length)return list;
  const [item]=sorted.splice(index,1);sorted.splice(target,0,item);sorted.forEach((x,i)=>x.sortOrder=i);return sorted;
}
export function renderPosLayoutEditor({layout,catalog=[],published=null,selectedButtonId='',selectedPageId=''}) {
  const doc=normalizePosLayout(layout),selectedRaw=doc.buttons.find(b=>b.id===selectedButtonId)||null;
  const pages=[...doc.pages].sort((a,b)=>a.sortOrder-b.sortOrder);
  const page=pages.find(p=>p.id===selectedPageId)||pages.find(p=>p.id===selectedRaw?.pageId)||pages[0]||null;
  const buttons=doc.buttons.filter(b=>!page||b.pageId===page.id).sort((a,b)=>a.sortOrder-b.sortOrder);
  const selected=doc.buttons.find(b=>b.id===selectedButtonId)||buttons[0]||null;
  const productOptions=catalog.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+' · '+Number(p.price||0).toFixed(2)+'</option>').join('');
  const pageOptions=pages.map(p=>'<option value="'+esc(p.id)+'" '+(p.id===page?.id?'selected':'')+'>'+esc(p.name)+'</option>').join('');
  const categories=[...doc.categories].sort((a,b)=>a.sortOrder-b.sortOrder);
  const catOptions=categories.map(c=>'<option value="'+esc(c.id)+'">'+(c.parentId?'↳ ':'')+esc(c.name)+'</option>').join('');
  const modChecks=selected?doc.modifierGroups.map(g=>'<label class="pos-layout-check"><input type="checkbox" data-layout-button-mod="'+esc(g.id)+'" '+(selected.modifierGroupIds.includes(g.id)?'checked':'')+'> '+esc(g.name)+'</label>').join(''):'';
  const pageOrder=pages.map(p=>'<span><b>'+esc(p.name)+'</b><button type="button" data-layout-page-move="'+esc(p.id)+':-1">↑</button><button type="button" data-layout-page-move="'+esc(p.id)+':1">↓</button></span>').join('');
  const categoryOrder=categories.map(c=>'<span><b>'+(c.parentId?'↳ ':'')+esc(c.name)+'</b><button type="button" data-layout-category-move="'+esc(c.id)+':-1">↑</button><button type="button" data-layout-category-move="'+esc(c.id)+':1">↓</button></span>').join('');
  return '<section class="card pos-layout-editor">'
    +'<div class="pos-layout-head"><div><h2>Implantation caisse</h2><p class="muted">Brouillon manager · version publiée '+esc(published?.version||'—')+'</p></div><div class="actions"><button class="btn" id="posLayoutSeed">Générer depuis le catalogue</button><button class="btn" id="posLayoutSave">Enregistrer brouillon</button><button class="btn primary" id="posLayoutPublish">Publier vers les POS</button></div></div>'
    +'<div class="pos-layout-meta"><form id="posLayoutPageForm"><input name="name" required placeholder="Nouvelle page"><button class="btn compact">+ Page</button></form><form id="posLayoutCategoryForm"><input name="name" required placeholder="Catégorie / sous-catégorie"><select name="parentId"><option value="">Catégorie racine</option>'+catOptions+'</select><button class="btn compact">+ Catégorie</button></form><form id="posLayoutButtonForm"><select name="productId" required><option value="">Produit…</option>'+productOptions+'</select><select name="pageId">'+pageOptions+'</select><select name="categoryId"><option value="">Sans catégorie</option>'+catOptions+'</select><button class="btn compact">+ Touche</button></form></div>'
    +'<div class="pos-layout-order"><div><strong>Ordre pages</strong>'+pageOrder+'</div><div><strong>Ordre catégories</strong>'+categoryOrder+'</div></div>'
    +'<div class="pos-layout-workspace"><div class="pos-layout-preview"><div class="pos-layout-pages">'+pages.map(p=>'<button type="button" data-layout-page-select="'+esc(p.id)+'" class="'+(p.id===page?.id?'active':'')+'">'+esc(p.name)+'</button>').join('')+'</div><div class="pos-layout-grid" id="posLayoutGrid">'+buttons.map(b=>{const p=layoutProduct(doc,catalog,b.productId);return '<button type="button" class="pos-layout-tile '+(b.id===selected?.id?'selected ':'')+(b.hidden?'is-hidden ':'')+(b.unavailable?'is-unavailable ':'')+'" draggable="true" data-layout-button="'+esc(b.id)+'" style="--tile-color:'+esc(b.color)+';--tile-w:'+b.w+';--tile-h:'+b.h+'"><strong>'+esc(b.label||p?.name||'Produit')+'</strong><small>'+esc(p?.category||'')+(b.favorite?' · ★':'')+'</small></button>'}).join('')+'</div></div>'
    +(selected?'<aside class="pos-layout-inspector"><h3>Propriétés touche</h3><label>Libellé<input id="posLayoutLabel" value="'+esc(selected.label)+'"></label><label>Couleur<input id="posLayoutColor" type="color" value="'+esc(selected.color)+'"></label><div class="pos-layout-size"><label>Largeur<select id="posLayoutW">'+[1,2,3,4].map(n=>'<option '+(selected.w===n?'selected':'')+'>'+n+'</option>').join('')+'</select></label><label>Hauteur<select id="posLayoutH">'+[1,2,3,4].map(n=>'<option '+(selected.h===n?'selected':'')+'>'+n+'</option>').join('')+'</select></label></div><label>Routage<select id="posLayoutStation"><option value="">Produit</option><option value="kitchen" '+(selected.station==='kitchen'?'selected':'')+'>Cuisine</option><option value="bar" '+(selected.station==='bar'?'selected':'')+'>Bar</option><option value="none" '+(selected.station==='none'?'selected':'')+'>Aucun</option></select></label><label class="pos-layout-check"><input id="posLayoutFavorite" type="checkbox" '+(selected.favorite?'checked':'')+'> Favori</label><label class="pos-layout-check"><input id="posLayoutHidden" type="checkbox" '+(selected.hidden?'checked':'')+'> Masqué</label><label class="pos-layout-check"><input id="posLayoutUnavailable" type="checkbox" '+(selected.unavailable?'checked':'')+'> Temporairement indisponible</label><div><strong>Modificateurs</strong>'+modChecks+'</div><button class="btn danger" id="posLayoutDeleteButton">Supprimer la touche</button></aside>':'<aside class="pos-layout-inspector"><p class="muted">Sélectionnez une touche.</p></aside>')+'</div>'
    +'<div class="pos-layout-bottom"><section><h3>Groupes de modificateurs</h3><form id="posLayoutModifierForm" class="pos-layout-inline"><input name="name" required placeholder="Ex. Cuisson"><select name="type"><option value="cooking">Cuisson</option><option value="side">Accompagnement</option><option value="supplement">Supplément</option><option value="without">Sans ingrédient</option><option value="notes">Notes</option></select><select name="station"><option value="">Même routage que l’article</option><option value="kitchen">Cuisine</option><option value="bar">Bar</option><option value="none">Aucun</option></select><label><input type="checkbox" name="required"> Obligatoire</label><input type="number" name="min" min="0" value="0" title="Minimum"><input type="number" name="max" min="1" value="1" title="Maximum"><button class="btn compact">+ Groupe</button></form><div class="pos-layout-list">'+doc.modifierGroups.map(g=>'<article><strong>'+esc(g.name)+'</strong><small>'+esc(g.type)+' · '+(g.required?'obligatoire':'optionnel')+' · '+g.min+'–'+g.max+(g.station?' · '+esc(g.station):'')+'</small><button class="btn compact" data-layout-add-option="'+esc(g.id)+'">+ Option</button><span>'+g.options.map(o=>esc(o.name)+(o.priceDelta?' +'+o.priceDelta.toFixed(2):'')+(o.station?' ['+esc(o.station)+']':'')).join(' · ')+'</span></article>').join('')+'</div></section>'
    +'<section><h3>Menus / compositions</h3><form id="posLayoutMenuForm" class="pos-layout-inline"><input name="name" required placeholder="Ex. Menu midi"><select name="productId"><option value="">Produit maître optionnel</option>'+productOptions+'</select><input name="price" type="number" min="0" step="0.01" placeholder="Prix"><button class="btn compact">+ Menu</button></form><div class="pos-layout-list">'+doc.menus.map(m=>'<article><strong>'+esc(m.name)+'</strong><small>'+Number(m.price||0).toFixed(2)+'</small><button class="btn compact" data-layout-add-choice="'+esc(m.id)+'">+ Choix</button><span>'+m.choices.map(c=>{const cat=categories.find(x=>x.id===c.categoryId);return esc(c.name)+' ('+(c.required?'obligatoire':'optionnel')+(cat?' · '+esc(cat.name):c.productIds?.length?' · '+c.productIds.length+' produits':' · tout catalogue')+')'}).join(' · ')+'</span></article>').join('')+'</div></section></div>'
    +'</section>';
}
export function bindPosLayoutEditor(root,{getLayout,setLayout,getSelected,setSelected,getPage,setPage,catalog,onDirty,onSave,onPublish,onSeed,onRender}){
  if(!root)return;
  const mutate=fn=>{const doc=normalizePosLayout(getLayout());fn(doc);setLayout(doc);onDirty?.();};
  root.querySelector('#posLayoutSeed')?.addEventListener('click',()=>onSeed?.());
  root.querySelector('#posLayoutSave')?.addEventListener('click',()=>onSave?.());
  root.querySelector('#posLayoutPublish')?.addEventListener('click',()=>onPublish?.());
  root.querySelectorAll('[data-layout-page-select]').forEach(el=>el.addEventListener('click',()=>{setPage?.(el.dataset.layoutPageSelect);const doc=normalizePosLayout(getLayout()),first=doc.buttons.filter(b=>b.pageId===el.dataset.layoutPageSelect).sort((a,b)=>a.sortOrder-b.sortOrder)[0];setSelected(first?.id||'');onRender?.()}));
  root.querySelectorAll('[data-layout-page-move]').forEach(el=>el.addEventListener('click',()=>{const [id,d]=String(el.dataset.layoutPageMove).split(':');mutate(doc=>{doc.pages=move(doc.pages,id,Number(d));})}));
  root.querySelectorAll('[data-layout-category-move]').forEach(el=>el.addEventListener('click',()=>{const [id,d]=String(el.dataset.layoutCategoryMove).split(':');mutate(doc=>{doc.categories=move(doc.categories,id,Number(d));})}));
  root.querySelector('#posLayoutPageForm')?.addEventListener('submit',e=>{e.preventDefault();const d=new FormData(e.currentTarget);mutate(doc=>{const id=uid('page');doc.pages.push({id,name:String(d.get('name')||'Page'),sortOrder:doc.pages.length,color:'#efe5d7'});setPage?.(id);setSelected('')})});
  root.querySelector('#posLayoutCategoryForm')?.addEventListener('submit',e=>{e.preventDefault();const d=new FormData(e.currentTarget);mutate(doc=>doc.categories.push({id:uid('cat'),name:String(d.get('name')||'Catégorie'),parentId:String(d.get('parentId')||''),sortOrder:doc.categories.length,color:'#d9c4a7'}));});
  root.querySelector('#posLayoutButtonForm')?.addEventListener('submit',e=>{e.preventDefault();const d=new FormData(e.currentTarget),p=(catalog||[]).find(x=>String(x.id)===String(d.get('productId')));if(!p)return;mutate(doc=>{const i=doc.buttons.length,id=uid('btn'),pageId=String(d.get('pageId')||getPage?.()||doc.pages[0]?.id||'');doc.buttons.push({id,pageId,categoryId:String(d.get('categoryId')||''),productId:String(p.id),label:String(p.name||''),sortOrder:i,x:i%4,y:Math.floor(i/4),w:1,h:1,color:'#d6b98c',hidden:false,unavailable:false,favorite:false,station:String(p.production_station||''),modifierGroupIds:[]});setPage?.(pageId);setSelected(id)});});
  root.querySelectorAll('[data-layout-button]').forEach(el=>{
    el.addEventListener('click',()=>{setSelected(el.dataset.layoutButton);onRender?.()});
    el.addEventListener('dragstart',e=>e.dataTransfer?.setData('text/plain',el.dataset.layoutButton));
    el.addEventListener('dragover',e=>e.preventDefault());
    el.addEventListener('drop',e=>{e.preventDefault();const from=e.dataTransfer?.getData('text/plain'),to=el.dataset.layoutButton;if(!from||from===to)return;mutate(doc=>{const pageId=getPage?.()||doc.buttons.find(x=>x.id===to)?.pageId;const pageButtons=doc.buttons.filter(x=>x.pageId===pageId).sort((a,b)=>a.sortOrder-b.sortOrder),a=pageButtons.findIndex(x=>x.id===from),b=pageButtons.findIndex(x=>x.id===to);if(a<0||b<0)return;const [m]=pageButtons.splice(a,1);pageButtons.splice(b,0,m);pageButtons.forEach((x,i)=>{x.sortOrder=i;x.x=i%4;x.y=Math.floor(i/4)});const ids=new Set(pageButtons.map(x=>x.id));doc.buttons=[...doc.buttons.filter(x=>!ids.has(x.id)),...pageButtons]})});
  });
  const bindValue=(sel,key,parse=v=>v)=>root.querySelector(sel)?.addEventListener('change',e=>mutate(doc=>{const b=doc.buttons.find(x=>x.id===getSelected());if(b)b[key]=parse(e.target.type==='checkbox'?e.target.checked:e.target.value)}));
  bindValue('#posLayoutLabel','label',String);bindValue('#posLayoutColor','color',String);bindValue('#posLayoutW','w',Number);bindValue('#posLayoutH','h',Number);bindValue('#posLayoutStation','station',String);bindValue('#posLayoutFavorite','favorite',Boolean);bindValue('#posLayoutHidden','hidden',Boolean);bindValue('#posLayoutUnavailable','unavailable',Boolean);
  root.querySelectorAll('[data-layout-button-mod]').forEach(el=>el.addEventListener('change',()=>mutate(doc=>{const b=doc.buttons.find(x=>x.id===getSelected());if(!b)return;const id=el.dataset.layoutButtonMod;b.modifierGroupIds=el.checked?[...new Set([...b.modifierGroupIds,id])]:b.modifierGroupIds.filter(x=>x!==id)})));
  root.querySelector('#posLayoutDeleteButton')?.addEventListener('click',()=>mutate(doc=>{doc.buttons=doc.buttons.filter(x=>x.id!==getSelected());setSelected(doc.buttons.find(x=>x.pageId===getPage?.())?.id||'')}));
  root.querySelector('#posLayoutModifierForm')?.addEventListener('submit',e=>{e.preventDefault();const d=new FormData(e.currentTarget);mutate(doc=>doc.modifierGroups.push({id:uid('mod'),name:String(d.get('name')||'Modificateurs'),type:String(d.get('type')||'supplement'),required:d.get('required')==='on',min:Number(d.get('min'))||0,max:Math.max(1,Number(d.get('max'))||1),station:String(d.get('station')||''),options:[]}))});
  root.querySelectorAll('[data-layout-add-option]').forEach(el=>el.addEventListener('click',()=>{const name=prompt('Nom de l’option');if(!name?.trim())return;const raw=prompt('Supplément prix CHF','0');if(raw===null)return;const station=prompt('Routage : kitchen, bar, none ou vide','')??'';mutate(doc=>{const g=doc.modifierGroups.find(x=>x.id===el.dataset.layoutAddOption);if(g)g.options.push({id:uid('opt'),name:name.trim(),priceDelta:Number(String(raw).replace(',','.'))||0,station:['kitchen','bar','none'].includes(station)?station:'',ingredientId:'',omitIngredient:g.type==='without'})})}));
  root.querySelector('#posLayoutMenuForm')?.addEventListener('submit',e=>{e.preventDefault();const d=new FormData(e.currentTarget);mutate(doc=>doc.menus.push({id:uid('menu'),name:String(d.get('name')||'Menu'),productId:String(d.get('productId')||''),price:Number(d.get('price'))||0,choices:[]}))});
  root.querySelectorAll('[data-layout-add-choice]').forEach(el=>el.addEventListener('click',()=>{
    const name=prompt('Nom du choix');if(!name?.trim())return;
    const required=confirm('Ce choix est-il obligatoire ?');
    const minRaw=prompt('Minimum',required?'1':'0');if(minRaw===null)return;
    const maxRaw=prompt('Maximum','1');if(maxRaw===null)return;
    const current=normalizePosLayout(getLayout());
    const source=prompt('Catégorie source (nom exact), ou vide pour choisir des produits précis / tout le catalogue','')??'';
    const category=current.categories.find(c=>c.name.toLowerCase()===source.trim().toLowerCase());
    let productIds=[];
    if(!category){
      const productNames=prompt('Produits autorisés séparés par des virgules (vide = tout le catalogue)','')??'';
      const wanted=productNames.split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
      if(wanted.length)productIds=(catalog||[]).filter(p=>wanted.includes(String(p.name||'').trim().toLowerCase())).map(p=>String(p.id));
    }
    mutate(doc=>{const m=doc.menus.find(x=>x.id===el.dataset.layoutAddChoice);if(m)m.choices.push({id:uid('choice'),name:name.trim(),required,min:Math.max(0,Number(minRaw)||0),max:Math.max(1,Number(maxRaw)||1),categoryId:category?.id||'',productIds,modifierGroupIds:[]})});
  }));
}
