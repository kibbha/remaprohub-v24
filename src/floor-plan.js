const uid=prefix=>prefix+'_'+crypto.randomUUID();
const clone=value=>JSON.parse(JSON.stringify(value));
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp=(v,min,max)=>Math.max(min,Math.min(max,Number(v)||0));
const allowedTypes=new Set(['table','bar','wall','door','kitchen','toilet','banquette','label']);
const allowedShapes=new Set(['round','square','rect','high','oval']);

export function emptyFloorPlan(name='Service habituel'){
  return {
    schemaVersion:1,
    name,
    canvas:{width:1000,height:700,gridSize:20,background:'#f7f3ed'},
    zones:[{id:uid('zone'),name:'Salle principale',x:20,y:20,w:960,h:660,color:'#f3eadf'}],
    elements:[]
  };
}
export function normalizeFloorPlan(input){
  const src=input&&typeof input==='object'?clone(input):emptyFloorPlan();
  const canvasSrc=src.canvas&&typeof src.canvas==='object'?src.canvas:{};
  const doc={
    schemaVersion:1,
    name:String(src.name||'Plan de salle').slice(0,120),
    canvas:{
      width:clamp(canvasSrc.width||1000,600,2400),
      height:clamp(canvasSrc.height||700,400,1800),
      gridSize:clamp(canvasSrc.gridSize||20,5,100),
      background:String(canvasSrc.background||'#f7f3ed').slice(0,32)
    },
    zones:Array.isArray(src.zones)?src.zones:[],
    elements:Array.isArray(src.elements)?src.elements:[]
  };
  doc.zones=doc.zones.slice(0,30).map((z,i)=>({
    id:String(z.id||uid('zone')),name:String(z.name||('Zone '+(i+1))).slice(0,80),
    x:clamp(z.x,0,doc.canvas.width-80),y:clamp(z.y,0,doc.canvas.height-80),
    w:clamp(z.w||400,80,doc.canvas.width),h:clamp(z.h||300,80,doc.canvas.height),
    color:String(z.color||'#f3eadf').slice(0,32)
  }));
  if(!doc.zones.length)doc.zones=emptyFloorPlan().zones;
  const zoneIds=new Set(doc.zones.map(z=>z.id));
  doc.elements=doc.elements.slice(0,400).map((e,i)=>{
    const type=allowedTypes.has(String(e.type))?String(e.type):'label';
    const table=type==='table';
    const shape=allowedShapes.has(String(e.shape))?String(e.shape):(table?'round':'rect');
    return{
      id:String(e.id||uid('element')),
      type,tableId:table?String(e.tableId||crypto.randomUUID()):'',
      label:String(e.label||(table?'Table '+(i+1):type)).slice(0,80),
      seats:table?clamp(Math.round(e.seats||2),0,99):0,
      zoneId:zoneIds.has(String(e.zoneId))?String(e.zoneId):doc.zones[0].id,
      x:clamp(e.x,0,doc.canvas.width-30),y:clamp(e.y,0,doc.canvas.height-30),
      w:clamp(e.w||(table?110:160),30,doc.canvas.width),
      h:clamp(e.h||(table?80:70),30,doc.canvas.height),
      rotation:clamp(e.rotation,-180,180),shape,
      color:String(e.color||(table?'#fffaf5':'#dfd2c5')).slice(0,32),
      active:e.active!==false
    };
  });
  return doc;
}
export function seedFloorPlanFromTables(tables=[]){
  const doc=emptyFloorPlan('Service habituel'),zone=doc.zones[0];
  doc.elements=(tables||[]).filter(x=>x?.active!==false).map((t,i)=>({
    id:uid('element'),type:'table',tableId:String(t.id||crypto.randomUUID()),label:String(t.label||('Table '+(i+1))),
    seats:Number(t.seats)||2,zoneId:zone.id,x:Number.isFinite(Number(t.x))?Number(t.x):80+(i%6)*140,
    y:Number.isFinite(Number(t.y))?Number(t.y):90+Math.floor(i/6)*120,w:110,h:82,rotation:0,shape:'round',color:'#fffaf5',active:true
  }));
  return normalizeFloorPlan(doc);
}
const typeLabel=type=>({table:'Table',bar:'Bar',wall:'Mur / cloison',door:'Porte',kitchen:'Cuisine',toilet:'Toilettes',banquette:'Banquette',label:'Texte'})[type]||type;
const elementGlyph=type=>({table:'●',bar:'▰',wall:'━',door:'↔',kitchen:'♨',toilet:'WC',banquette:'▤',label:'T'})[type]||'•';

export function renderFloorPlanEditor({plans=[],selectedPlanId='',selectedElementId=''}) {
  const list=Array.isArray(plans)?plans:[],selected=list.find(x=>String(x.id)===String(selectedPlanId))||list.find(x=>x.active)||list[0]||null;
  const doc=normalizeFloorPlan(selected?.draft_document||selected?.published_document||emptyFloorPlan());
  const selectedElement=doc.elements.find(x=>x.id===selectedElementId)||null;
  const zoneOptions=doc.zones.map(z=>'<option value="'+esc(z.id)+'" '+(selectedElement?.zoneId===z.id?'selected':'')+'>'+esc(z.name)+'</option>').join('');
  const planTabs=list.map(p=>'<button type="button" class="floor-plan-tab '+(selected?.id===p.id?'active':'')+'" data-floor-plan-select="'+esc(p.id)+'"><span>'+esc(p.name)+'</span>'+(p.active?'<b>Actif POS</b>':'')+'</button>').join('');
  const zones=doc.zones.map(z=>'<div class="floor-zone" data-floor-zone-id="'+esc(z.id)+'" style="left:'+(z.x/doc.canvas.width*100)+'%;top:'+(z.y/doc.canvas.height*100)+'%;width:'+(z.w/doc.canvas.width*100)+'%;height:'+(z.h/doc.canvas.height*100)+'%;--zone-color:'+esc(z.color)+'"><span>'+esc(z.name)+'</span></div>').join('');
  const elements=doc.elements.filter(x=>x.active!==false).map(e=>'<button type="button" class="floor-element floor-type-'+esc(e.type)+' floor-shape-'+esc(e.shape)+' '+(selectedElement?.id===e.id?'selected':'')+'" data-floor-element="'+esc(e.id)+'" style="left:'+(e.x/doc.canvas.width*100)+'%;top:'+(e.y/doc.canvas.height*100)+'%;width:'+(e.w/doc.canvas.width*100)+'%;height:'+(e.h/doc.canvas.height*100)+'%;transform:rotate('+e.rotation+'deg);--floor-color:'+esc(e.color)+'"><span class="floor-glyph">'+esc(elementGlyph(e.type))+'</span><strong>'+esc(e.label)+'</strong>'+(e.type==='table'?'<small>'+e.seats+' pl.</small>':'')+'</button>').join('');
  const history=(Array.isArray(selected?.history)?selected.history:[]).slice(0,10).map(v=>'<div class="floor-history-row"><span><strong>Version '+esc(v.version)+'</strong><small>'+esc(v.published_at?new Date(v.published_at).toLocaleString('fr-CH'):'')+'</small></span><button type="button" class="btn compact" data-floor-restore="'+esc(v.version)+'">Restaurer</button></div>').join('');
  const inspector=selectedElement?'<aside class="floor-inspector"><div class="floor-inspector-head"><div><small>'+esc(typeLabel(selectedElement.type))+'</small><h3>'+esc(selectedElement.label)+'</h3></div><button type="button" class="btn danger compact" data-floor-delete="'+esc(selectedElement.id)+'">Supprimer</button></div>'
    +'<label>Nom<input data-floor-prop="label" value="'+esc(selectedElement.label)+'"></label>'
    +(selectedElement.type==='table'?'<label>Places<input data-floor-prop="seats" type="number" min="0" max="99" value="'+selectedElement.seats+'"></label><label>Forme<select data-floor-prop="shape"><option value="round" '+(selectedElement.shape==='round'?'selected':'')+'>Ronde</option><option value="square" '+(selectedElement.shape==='square'?'selected':'')+'>Carrée</option><option value="rect" '+(selectedElement.shape==='rect'?'selected':'')+'>Rectangulaire</option><option value="oval" '+(selectedElement.shape==='oval'?'selected':'')+'>Ovale</option><option value="high" '+(selectedElement.shape==='high'?'selected':'')+'>Haute</option></select></label>':'')
    +'<label>Zone<select data-floor-prop="zoneId">'+zoneOptions+'</select></label>'
    +'<div class="floor-inspector-grid"><label>Largeur<input data-floor-prop="w" type="number" min="30" max="1000" value="'+Math.round(selectedElement.w)+'"></label><label>Hauteur<input data-floor-prop="h" type="number" min="30" max="1000" value="'+Math.round(selectedElement.h)+'"></label></div>'
    +'<label>Rotation<input data-floor-prop="rotation" type="range" min="-180" max="180" step="5" value="'+selectedElement.rotation+'"><span class="floor-range-value">'+selectedElement.rotation+'°</span></label>'
    +'<label>Couleur<input data-floor-prop="color" type="color" value="'+esc(selectedElement.color)+'"></label></aside>'
    :'<aside class="floor-inspector floor-inspector-empty"><span>↖</span><strong>Sélectionnez un élément</strong><p>Déplacez, redimensionnez et paramétrez chaque élément de la salle.</p></aside>';
  return '<section class="card floor-plan-editor" data-floor-plan-editor><div class="floor-plan-head"><div><span class="artisan-eyebrow">Salle & service</span><h2>Plan de salle fidèle</h2><p class="muted">Dessinez la salle dans Hub. Le plan publié devient immédiatement exploitable dans POS.</p></div><div class="actions"><button type="button" class="btn" id="floorPlanNew">+ Nouveau plan</button><button type="button" class="btn" id="floorPlanDuplicate" '+(!selected?'disabled':'')+'>Dupliquer</button><button type="button" class="btn" id="floorPlanSave" '+(!selected?'disabled':'')+'>Enregistrer</button><button type="button" class="btn primary" id="floorPlanPublish" '+(!selected?'disabled':'')+'>Publier & activer</button></div></div>'
    +'<div class="floor-plan-tabs">'+(planTabs||'<div class="muted">Aucun plan : créez votre premier plan de salle.</div>')+'</div>'
    +(selected?'<div class="floor-plan-tools"><div class="floor-palette"><strong>Ajouter</strong><button type="button" data-floor-add="table">● Table</button><button type="button" data-floor-add="bar">▰ Bar</button><button type="button" data-floor-add="wall">━ Mur</button><button type="button" data-floor-add="door">↔ Porte</button><button type="button" data-floor-add="kitchen">♨ Cuisine</button><button type="button" data-floor-add="toilet">WC Toilettes</button><button type="button" data-floor-add="banquette">▤ Banquette</button><button type="button" data-floor-add="label">T Texte</button></div><form id="floorZoneForm" class="floor-zone-form"><input name="name" maxlength="80" placeholder="Nouvelle zone (Terrasse…)"><button class="btn compact">+ Zone</button></form></div>'
      +'<div class="floor-plan-workspace"><div class="floor-canvas-wrap"><div class="floor-canvas" id="floorPlanCanvas" style="aspect-ratio:'+doc.canvas.width+'/'+doc.canvas.height+';--floor-bg:'+esc(doc.canvas.background)+'">'+zones+elements+'</div><small class="muted">Astuce : faites glisser les éléments directement sur le plan. Les positions sont enregistrées précisément.</small></div>'+inspector+'</div>'
      +(history?'<details class="floor-history"><summary>Historique des publications</summary>'+history+'</details>':''):'')
    +'</section>';
}

export function bindFloorPlanEditor(root,{getPlans,setPlans,getPlanId,setPlanId,getElementId,setElementId,onDirty,onSave,onPublish,onRestore,onNew,onDuplicate,onRender}={}){
  if(!root)return;
  const plans=()=>getPlans?.()||[];
  const current=()=>plans().find(x=>String(x.id)===String(getPlanId?.()))||plans().find(x=>x.active)||plans()[0]||null;
  const updateDoc=mutator=>{
    const plan=current();if(!plan)return;
    const doc=normalizeFloorPlan(plan.draft_document||plan.published_document||emptyFloorPlan());
    mutator(doc);
    const next=plans().map(x=>x.id===plan.id?{...x,draft_document:normalizeFloorPlan(doc)}:x);
    setPlans?.(next);onDirty?.();onRender?.();
  };
  root.querySelectorAll('[data-floor-plan-select]').forEach(b=>b.addEventListener('click',()=>{setPlanId?.(b.dataset.floorPlanSelect);setElementId?.('');onRender?.()}));
  root.querySelector('#floorPlanNew')?.addEventListener('click',()=>onNew?.());
  root.querySelector('#floorPlanDuplicate')?.addEventListener('click',()=>onDuplicate?.());
  root.querySelector('#floorPlanSave')?.addEventListener('click',()=>onSave?.());
  root.querySelector('#floorPlanPublish')?.addEventListener('click',()=>onPublish?.());
  root.querySelectorAll('[data-floor-restore]').forEach(b=>b.addEventListener('click',()=>onRestore?.(Number(b.dataset.floorRestore))));
  root.querySelector('#floorZoneForm')?.addEventListener('submit',e=>{e.preventDefault();const d=new FormData(e.currentTarget),name=String(d.get('name')||'').trim();if(!name)return;updateDoc(doc=>doc.zones.push({id:uid('zone'),name,x:40+doc.zones.length*25,y:40+doc.zones.length*25,w:Math.min(500,doc.canvas.width-80),h:Math.min(360,doc.canvas.height-80),color:'#f3eadf'}))});
  root.querySelectorAll('[data-floor-add]').forEach(b=>b.addEventListener('click',()=>updateDoc(doc=>{
    const type=b.dataset.floorAdd,zone=doc.zones[0],table=type==='table';
    const count=doc.elements.filter(x=>x.type===type).length+1;
    doc.elements.push({id:uid('element'),type,tableId:table?crypto.randomUUID():'',label:table?'Table '+(doc.elements.filter(x=>x.type==='table').length+1):typeLabel(type),seats:table?2:0,zoneId:zone.id,x:90+(count%6)*55,y:90+(count%5)*55,w:table?110:type==='wall'?220:160,h:table?82:type==='wall'?34:70,rotation:0,shape:table?'round':'rect',color:table?'#fffaf5':'#dfd2c5',active:true});
    setElementId?.(doc.elements.at(-1).id);
  })));
  root.querySelectorAll('[data-floor-element]').forEach(el=>{
    el.addEventListener('click',()=>{setElementId?.(el.dataset.floorElement);onRender?.()});
    el.addEventListener('pointerdown',event=>{
      if(event.button!==0)return;
      const id=el.dataset.floorElement,plan=current();if(!plan)return;
      const doc=normalizeFloorPlan(plan.draft_document||plan.published_document),target=doc.elements.find(x=>x.id===id),canvas=root.querySelector('#floorPlanCanvas');
      if(!target||!canvas)return;event.preventDefault();el.setPointerCapture?.(event.pointerId);setElementId?.(id);
      const rect=canvas.getBoundingClientRect(),startX=event.clientX,startY=event.clientY,origX=target.x,origY=target.y;
      const move=e=>{
        const dx=(e.clientX-startX)/rect.width*doc.canvas.width,dy=(e.clientY-startY)/rect.height*doc.canvas.height;
        target.x=clamp(origX+dx,0,doc.canvas.width-target.w);target.y=clamp(origY+dy,0,doc.canvas.height-target.h);
        el.style.left=(target.x/doc.canvas.width*100)+'%';el.style.top=(target.y/doc.canvas.height*100)+'%';
      };
      const up=()=>{
        el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',up);el.removeEventListener('pointercancel',up);
        setPlans?.(plans().map(x=>x.id===plan.id?{...x,draft_document:normalizeFloorPlan(doc)}:x));onDirty?.();onRender?.();
      };
      el.addEventListener('pointermove',move);el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);
    });
  });
  root.querySelectorAll('[data-floor-prop]').forEach(input=>input.addEventListener('change',()=>updateDoc(doc=>{
    const el=doc.elements.find(x=>x.id===getElementId?.());if(!el)return;
    const key=input.dataset.floorProp,value=input.value;
    if(['seats','w','h','rotation'].includes(key))el[key]=Number(value)||0;else el[key]=value;
  })));
  root.querySelectorAll('[data-floor-delete]').forEach(b=>b.addEventListener('click',()=>{updateDoc(doc=>{doc.elements=doc.elements.filter(x=>x.id!==b.dataset.floorDelete)});setElementId?.('')}));
}
