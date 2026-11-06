import {callRemaproAi} from './ai.js';
import {photosFromFiles,takeDeliveryPhoto,pickDeliveryPhotos,disposeDeliveryPhotos} from './delivery-ai.js';

export const MENU_SCAN_MAX_PHOTOS=4;
const uid=p=>p+'_'+(globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2));
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fold=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const clean=(v,n=120)=>String(v??'').replace(/[\x00-\x1f]+/g,' ').trim().slice(0,n);
const money=v=>{if(v==null||String(v).trim()==='')return null;const x=Number(String(v).replace(',','.'));return Number.isFinite(x)&&x>=0&&x<100000?Math.round(x*100)/100:null};
let scan={restaurantId:'',photos:[],items:[],busy:false,error:'',message:'',warnings:[]};
function reset(restaurantId=''){disposeDeliveryPhotos(scan.photos);scan={restaurantId,photos:[],items:[],busy:false,error:'',message:'',warnings:[]}}
function context(id){if(scan.restaurantId!==String(id||''))reset(String(id||''))}
export function normalizeMenuScanItems(raw){
  return(Array.isArray(raw)?raw:[]).slice(0,80).map(r=>{
    const name=clean(r?.name);if(!name)return null;
    return{id:uid('scan'),name,category:clean(r?.category,80)||'Plats',price:money(r?.price),
      type:['dish','drink','other'].includes(r?.type)?r.type:'dish',
      confidence:Math.min(1,Math.max(0,Number(r?.confidence)||0)),
      notes:clean(r?.notes,280),mode:'create'};
  }).filter(Boolean);
}
export function classifyMenuScanDuplicates(rows,doc){
  const existing=new Map((doc?.buttons||[]).map(b=>[fold(b.label||b.item?.name),b]).filter(x=>x[0]));
  const seen=new Set();
  return rows.map(row=>{
    const duplicate=existing.get(fold(row.name)),repeated=seen.has(fold(row.name));
    seen.add(fold(row.name));
    return{...row,mode:duplicate||repeated?'skip':'create',duplicateOf:duplicate?.id||'',linkedDuplicate:!!duplicate?.productId};
  });
}
export function applyMenuScanRows(doc,rows,{pageId='',taxRate=8.1}={}){
  if(!doc||!Array.isArray(doc.pages)||!Array.isArray(doc.categories)||!Array.isArray(doc.buttons))throw Error('BROUILLON_INVALIDE');
  const rate=Number(taxRate);if(!Number.isFinite(rate)||rate<0||rate>100)throw Error('TVA_INVALIDE');
  const existing=new Map(doc.buttons.map(b=>[fold(b.label||b.item?.name),b]).filter(x=>x[0]));
  const valid=rows.filter(r=>r.mode!=='skip'&&clean(r.name)&&money(r.price)!==null);
  if(!valid.length)return{created:0,updated:0,skipped:rows.length};
  let page=doc.pages.find(p=>p.id===pageId)||doc.pages[0];
  if(!page){page={id:uid('page'),name:'Caisse',sortOrder:doc.pages.length,color:'#efe5d7'};doc.pages.push(page)}
  let created=0,updated=0,skipped=0;
  for(const row of rows){
    const name=clean(row.name),price=money(row.price),key=fold(name);
    if(row.mode==='skip'||!key||price===null){skipped++;continue}
    const match=existing.get(key);
    if(match){
      if(row.mode==='update'&&!match.productId&&match.item){match.item.price=price;updated++}
      else skipped++;
      continue;
    }
    if(row.mode!=='create'){skipped++;continue}
    const categoryName=clean(row.category,80)||'Plats';
    let cat=doc.categories.find(c=>fold(c.name)===fold(categoryName));
    if(!cat){cat={id:uid('cat'),name:categoryName,parentId:'',sortOrder:doc.categories.length,color:'#d9c4a7'};doc.categories.push(cat)}
    const type=['dish','drink','other'].includes(row.type)?row.type:'dish',station=type==='drink'?'bar':type==='dish'?'kitchen':'none';
    const n=doc.buttons.filter(b=>b.pageId===page.id).length;
    const btn={id:uid('btn'),pageId:page.id,categoryId:cat.id,productId:'',
      item:{name,price,taxRate:rate,sku:'',type,station},label:name,sortOrder:n,x:n%4,y:Math.floor(n/4),w:1,h:1,
      color:type==='drink'?'#c9d9df':type==='dish'?'#d6b98c':'#ded6ca',
      hidden:false,unavailable:false,favorite:false,station,modifierGroupIds:[],
      availability:{mode:'unlimited',manualQuantity:0,lowThreshold:3,resetAt:''}};
    doc.buttons.push(btn);existing.set(key,btn);created++;
  }
  return{created,updated,skipped};
}
export function renderMenuScanPanel(restaurantId,doc){
  context(restaurantId);
  const photoNames=scan.photos.map(p=>'<span class="pos-menu-scan-photo">'+esc(p.name)+'</span>').join(' ');
  const pages=(doc?.pages||[]).map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join('');
  const rows=scan.items.map((r,i)=>'<div class="pos-menu-scan-row" data-menu-scan-row="'+i+'">'
    +'<label>Article<input data-menu-scan-field="name" maxlength="120" value="'+esc(r.name)+'"></label>'
    +'<label>Prix CHF<input data-menu-scan-field="price" type="number" step=".01" min="0" value="'+(r.price===null?'':esc(r.price))+'" placeholder="À compléter"></label>'
    +'<label>Catégorie<input data-menu-scan-field="category" maxlength="80" value="'+esc(r.category)+'"></label>'
    +'<label>Type<select data-menu-scan-field="type">'+['dish','drink','other'].map(t=>'<option value="'+t+'" '+(r.type===t?'selected':'')+'>'+({dish:'Plat',drink:'Boisson',other:'Autre'}[t])+'</option>').join('')+'</select></label>'
    +'<label>Action<select data-menu-scan-field="mode"><option value="create" '+(r.mode==='create'?'selected':'')+'>Créer</option><option value="update" '+(r.mode==='update'?'selected':'')+' '+(!r.duplicateOf||r.linkedDuplicate?'disabled':'')+'>Changer le prix</option><option value="skip" '+(r.mode==='skip'?'selected':'')+'>Ignorer</option></select></label>'
    +'<small class="muted">'+(r.price===null?'⚠ Prix à compléter · ':'')+(r.confidence<.85?'⚠ À vérifier · ':'')+Math.round(r.confidence*100)+' % · '+esc(r.linkedDuplicate?'Article lié Hub : modifier dans le catalogue':r.duplicateOf?'Doublon détecté':r.notes||'Vérifier avant import')+'</small></div>').join('');
  return '<details class="pos-menu-scan" '+(scan.photos.length||scan.items.length?'open':'')+'>'
    +'<summary>📷 Scan Menu IA — photographier sa carte pour créer les touches</summary>'
    +'<div class="pos-menu-scan-content"><p class="muted">Analyse de carte papier. Vérifiez les prix et la TVA. Rien n’est publié sans votre validation ultérieure.</p>'
    +'<div class="actions"><button type="button" class="btn" id="posMenuScanCamera" '+(scan.busy?'disabled':'')+'>📷 Photo</button><button type="button" class="btn" id="posMenuScanGallery" '+(scan.busy?'disabled':'')+'>Galerie</button><input type="file" id="posMenuScanFiles" accept="image/jpeg,image/png,image/webp" multiple hidden></div>'
    +'<p class="muted">'+(photoNames||'Sélectionnez jusqu’à '+MENU_SCAN_MAX_PHOTOS+' photos.')+'</p>'
    +'<div class="actions"><button type="button" id="posMenuScanAnalyze" class="btn primary" '+(!scan.photos.length||scan.busy?'disabled':'')+'>'+(scan.busy?'Analyse en cours…':'Analyser '+scan.photos.length+' photo(s)')+'</button><button type="button" id="posMenuScanReset" class="btn" '+(scan.busy?'disabled':'')+'>Effacer</button></div>'
    +(scan.error?'<p class="pos-menu-scan-error" role="alert">'+esc(scan.error)+'</p>':'')
    +(scan.message?'<p role="status" class="muted">'+esc(scan.message)+'</p>':'')
    +(scan.warnings.length?'<p class="muted">'+esc(scan.warnings.join(' · '))+'</p>':'')
    +(scan.items.length?'<form id="posMenuScanReview"><h3>Vérifier les articles ('+scan.items.length+')</h3><div class="pos-menu-scan-list">'+rows+'</div>'
      +'<div class="actions"><label>Page<select name="pageId"><option value="">Caisse / première page</option>'+pages+'</select></label><label>TVA<select name="taxRate"><option value="8.1">8,1 %</option><option value="2.6">2,6 %</option><option value="0">0 %</option></select></label></div>'
      +'<p class="muted">Suppléments, formules, cuissons et allergènes doivent être configurés ou vérifiés séparément.</p>'
      +'<button class="btn primary">Ajouter au brouillon POS</button></form>':'')
    +'</div></details>';
}
async function compressedImage(blob){
  if(blob.size>12_000_000)throw Error('PHOTO_TROP_VOLUMINEUSE');
  if(!['image/jpeg','image/png','image/webp'].includes(blob.type))throw Error('FORMAT_NON_SUPPORTE');
  const bmp=await createImageBitmap(blob);
  try{
    const scale=Math.min(1,1600/Math.max(bmp.width,bmp.height));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bmp.width*scale));canvas.height=Math.max(1,Math.round(bmp.height*scale));
    const ctx=canvas.getContext('2d');if(!ctx)throw Error('PHOTO_ILLISIBLE');
    ctx.drawImage(bmp,0,0,canvas.width,canvas.height);
    const data=canvas.toDataURL('image/jpeg',.78);
    if(data.length>3_500_000)throw Error('IMAGE_COMPRESSEE_TROP_VOLUMINEUSE');
    return data;
  }finally{bmp.close?.()}
}
export function bindMenuScanPanel(root,{restaurantId,getLayout,setLayout,onDirty,onRender}){
  if(!root)return;
  context(restaurantId);
  const refresh=()=>onRender?.();
  const add=photos=>{const accepted=(photos||[]).filter(p=>['image/jpeg','image/png','image/webp'].includes(p.type));const limit=MENU_SCAN_MAX_PHOTOS-scan.photos.length;scan.photos.push(...accepted.slice(0,limit));disposeDeliveryPhotos(accepted.slice(limit));scan.error='';refresh()};
  const picker=root.querySelector('#posMenuScanFiles');
  picker?.addEventListener('change',e=>{const files=e.currentTarget.files;e.currentTarget.value='';add(photosFromFiles(files))});
  root.querySelector('#posMenuScanCamera')?.addEventListener('click',async()=>{try{const photo=await takeDeliveryPhoto();if(photo)add([photo]);else if(picker){picker.setAttribute('capture','environment');picker.multiple=false;picker.click()}}catch(e){scan.error=String(e?.message||e);refresh()}});
  root.querySelector('#posMenuScanGallery')?.addEventListener('click',async()=>{try{const photos=await pickDeliveryPhotos();if(photos)add(photos);else if(picker){picker.removeAttribute('capture');picker.multiple=true;picker.click()}}catch(e){scan.error=String(e?.message||e);refresh()}});
  root.querySelector('#posMenuScanReset')?.addEventListener('click',()=>{reset(restaurantId);refresh()});
  root.querySelector('#posMenuScanAnalyze')?.addEventListener('click',async()=>{
    if(scan.busy||!scan.photos.length)return;
    if(!restaurantId){scan.error='Connectez-vous et sélectionnez un restaurant.';refresh();return}
    scan.busy=true;scan.error='';scan.message='Lecture de la carte…';refresh();
    const photos=[...scan.photos],newRows=[];
    try{
      for(let i=0;i<photos.length;i++){
        if(scan.restaurantId!==restaurantId)break;
        const image=await compressedImage(photos[i].blob);
        const result=await callRemaproAi({action:'menu-photo',restaurantId,image,language:'fr'});
        newRows.push(...normalizeMenuScanItems(result.items));
        scan.warnings.push(...(Array.isArray(result.warnings)?result.warnings.map(x=>clean(x,140)).filter(Boolean).slice(0,8):[]));
      }
      if(scan.restaurantId!==restaurantId)return;
      const seen=new Set(scan.items.map(x=>fold(x.name)));
      const distinct=newRows.filter(r=>{const key=fold(r.name);if(seen.has(key))return false;seen.add(key);return true});
      scan.items.push(...classifyMenuScanDuplicates(distinct,getLayout()));
      scan.message=distinct.length+' article(s) reconnus, '+scan.items.length+' à vérifier.';
      if(!distinct.length)scan.error='Aucun nouvel article détecté.';
    }catch(e){scan.error=String(e?.message||'Analyse indisponible')}
    finally{if(scan.restaurantId===restaurantId){scan.busy=false;disposeDeliveryPhotos(scan.photos);scan.photos=[];refresh()}}
  });
  root.querySelectorAll('[data-menu-scan-row]').forEach(el=>{
    const row=scan.items[Number(el.dataset.menuScanRow)];
    el.querySelectorAll('[data-menu-scan-field]').forEach(input=>input.addEventListener('change',()=>{
      if(!row)return;const k=input.dataset.menuScanField;
      if(k==='price')row.price=money(input.value);
      else if(k==='name'||k==='category')row[k]=clean(input.value,k==='name'?120:80);
      else if(k==='mode'||k==='type')row[k]=input.value;
    }));
  });
  root.querySelector('#posMenuScanReview')?.addEventListener('submit',e=>{
    e.preventDefault();if(scan.busy)return;
    const form=new FormData(e.currentTarget),doc=getLayout();
    const outcome=applyMenuScanRows(doc,scan.items,{pageId:String(form.get('pageId')||''),taxRate:Number(form.get('taxRate'))});
    if(!outcome.created&&!outcome.updated){scan.error='Aucun article prêt : vérifiez les prix et les actions.';refresh();return}
    setLayout(doc);onDirty?.(false);scan.items=[];scan.warnings=[];scan.error='';
    scan.message=outcome.created+' touche(s) créée(s), '+outcome.updated+' prix actualisé(s), '+outcome.skipped+' ignoré(s). Enregistrez le brouillon avant de publier.';
    refresh();
  });
}
