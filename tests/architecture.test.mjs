import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{catalogue,LANGS}from'../src/i18n.js';import{recordFinance,financeTotals,updateRecord,removeRecord,saveDocument,recordOrder,updateOrder,removeOrder,recordPurchase,updatePurchase,removePurchase}from'../src/store.js';
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8'),store=readFileSync(new URL('../src/store.js',import.meta.url),'utf8');
const modules=['dashboard','operations','orders','products','haccp','finance','documents','stock','suppliers','purchases','invoices','team','planning','leave','training','briefing','recipes','reservations','customers','loyalty','incidents','waste','maintenance','equipment','handover','deliveries','allergens','recalls','cleaning','audits','checklists','alerts','goals','organization','ai','help','more','settings'];for(const name of modules)assert.match(app,new RegExp(`\\b${name}\\b`),`missing module ${name}`);
assert.doesNotMatch(app,/applyFullLanguage|MutationObserver|translateRenderedHTML|canonicalTranslation|location\.replace/);assert.match(app,/updateRecord/);assert.match(app,/removeRecord/);assert.match(app,/saveDocument/);assert.match(app,/id="customerForm"/);assert.match(app,/state\.customers\.unshift/);assert.match(store,/localStorage\.setItem/);assert.match(store,/financeHistory:/);assert.match(store,/export function recordFinance/);assert.match(store,/export function financeTotals/);
// Security + persistent CRUD guards: persisted free text must be escaped and edit/delete must save before rerender.
assert.match(app,/\besc=v=>String\(v\?\?''\)\.replace\(/,'missing HTML escaping boundary');assert.match(app,/replace\(\/\[&<>[\\\\]?"'\]\//,'escaping must cover HTML metacharacters');assert.match(app,/data-remove=/,'missing delete controls');assert.match(app,/data-edit=/,'missing edit controls');assert.match(app,/data-edit-form=/,'missing inline edit forms');assert.match(app,/data-cancel-edit/,'missing edit cancellation');assert.match(app,/removeRecord\(state,b\.dataset\.remove,\+b\.dataset\.index\)/,'delete must retain shared CRUD fallback');assert.match(app,/updateOrder\(state,index/);assert.match(app,/removeOrder\(state/);assert.match(app,/recordPurchase\(state/);for(const collection of ['customers','suppliers','team','temps','stock','shifts','recipes','reservations','incidents','waste','products','loyalty','briefings','invoices','checklists','alerts','training','leave','equipment','audits','cleaning','deliveries','allergens','recalls']){assert.match(app,new RegExp(`actions\\('${collection}',i\\)`),`missing edit/delete actions for ${collection}`);assert.match(app,new RegExp(`data-edit-form="${collection}"`),`missing edit form for ${collection}`);assert.match(app,new RegExp(`collection==='${collection}'`),`missing persistent edit handler for ${collection}`)}
const literal=[...app.matchAll(/\bt\('([^']+)'\)/g)].map(x=>x[1]),dynamic=['dashboard','operations','haccp','finance','documents','stock','suppliers','team','planning','recipes','reservations','customers','incidents','waste','more','settings','day','week','month','traceability','nonConformity','recipeSheet','purchaseOrder','inspectionPrep','inventory','openKitchen','temperatureCheck','diningSetup','cashCheck','closingCleaning','edit','delete','cancel'],keys=new Set([...literal,...dynamic]);for(const lang of LANGS){const cat=catalogue(lang);for(const key of keys){assert.ok(Object.prototype.hasOwnProperty.call(cat,key),`${lang}: missing translation key ${key}`);assert.notEqual(cat[key],key,`${lang}: untranslated raw key ${key}`)}}
for(const field of ['products','loyalty','briefings','invoices','checklists','alerts','documentEntries','sales','financeHistory','stock','temps','suppliers','purchases','team','shifts','incidents','waste','reservations','customers','recipes','maintenance','handover','restaurants','managers','staffAccess','products','loyalty','briefings','invoices','checklists','alerts','goals','training','leave','equipment','audits','cleaning','deliveries','allergens','recalls'])assert.match(store,new RegExp(`\\b${field}:`),`missing state field ${field}`);
const financeState={financeHistory:[],revenue:0,covers:0,expenses:0};recordFinance(financeState,{date:'2026-09-17',revenue:100,covers:10,expenses:20});recordFinance(financeState,{date:'2026-09-16',revenue:50,covers:5,expenses:10});recordFinance(financeState,{date:'2026-09-17',revenue:120,covers:12,expenses:25});assert.equal(financeState.financeHistory.length,2,'same-day finance entry must be replaced');const week=financeTotals(financeState,'week',new Date('2026-09-17T23:00:00'));assert.deepEqual({revenue:week.revenue,covers:week.covers,expenses:week.expenses},{revenue:170,covers:17,expenses:35});
console.log(`V27 architecture: ${keys.size} UI translation keys validated across ${LANGS.length} languages; secure CRUD and finance aggregation validated`);
const crud={stock:[{name:'A',qty:1,price:2,min:0}],documentEntries:[]};assert.equal(updateRecord(crud,'stock',0,{qty:3}),true);assert.equal(crud.stock[0].qty,3);assert.equal(removeRecord(crud,'stock',0),true);assert.equal(crud.stock.length,0);global.localStorage={setItem(){},getItem(){return null},removeItem(){}};assert.equal(saveDocument(crud,{type:'traceability',date:'2026-09-17',title:'Lot 1',details:'OK'}),true);assert.equal(crud.documentEntries.length,1);

// Transactional finance reconciliation guards.
const tx={orders:[],purchases:[],financeHistory:[],revenue:0,covers:0,expenses:0};recordOrder(tx,{reference:'T1',amount:100,status:'paid',date:'2026-09-18'});assert.equal(tx.financeHistory[0].revenue,100);updateOrder(tx,0,{amount:125,status:'paid',date:'2026-09-18'});assert.equal(tx.financeHistory[0].revenue,125);assert.equal(updateOrder(tx,0,{amount:125,status:'open',date:'2026-09-18'}),false);assert.equal(tx.financeHistory[0].revenue,125);removeOrder(tx,0);assert.equal(tx.financeHistory[0].revenue,0);recordPurchase(tx,{supplier:'S',date:'2026-09-18',amount:40,note:''});assert.equal(tx.financeHistory[0].expenses,40);updatePurchase(tx,0,{supplier:'S',date:'2026-09-18',amount:55,note:''});assert.equal(tx.financeHistory[0].expenses,55);removePurchase(tx,0);assert.equal(tx.financeHistory[0].expenses,0);

// Low-stock threshold must survive creation/edit wiring and drive dashboard signal.
assert.match(app,/form\('stockForm',f=>[\s\S]{0,420}min:f\.get\('min'\)/,'stock creation must persist minimum threshold');assert.match(app,/collection==='stock'[\s\S]{0,160}min:\+d\.get\('min'\)/,'stock edits must persist minimum threshold');assert.match(app,/filter\(x=>stockAvailable\(state,x\)<=\+\(x\.min\|\|0\)/,'dashboard must derive low-stock alerts from thresholds');

// Manual finance entry must not erase transactional order/purchase amounts.
const mixed={orders:[],purchases:[],financeHistory:[],revenue:0,covers:0,expenses:0};recordOrder(mixed,{reference:'M1',amount:75,status:'paid',date:'2026-09-18'});recordPurchase(mixed,{supplier:'S',amount:20,date:'2026-09-18',note:''});recordFinance(mixed,{date:'2026-09-18',revenue:100,covers:8,expenses:30});assert.equal(mixed.financeHistory[0].revenue,175);assert.equal(mixed.financeHistory[0].expenses,50);recordFinance(mixed,{date:'2026-09-18',revenue:120,covers:9,expenses:35});assert.equal(mixed.financeHistory[0].revenue,195);assert.equal(mixed.financeHistory[0].expenses,55);

// Dashboard is intentionally concise; every other operational screen stays reachable through More or fixed navigation.
for(const m of ['orders','stock','haccp','purchases','planning','reservations','ai','help'])
  assert.match(app,new RegExp(`const modules=\\[[^;]*['"]${m}['"]`),`dashboard quick access missing ${m}`);
const secondary=['products','categories','stock','haccp','recipes','customers','loyalty','incidents','waste','suppliers','invoices','team','recalls','allergens','deliveries','cleaning','audits','equipment','leave','training','goals','alerts','checklists','briefing','maintenance','handover','organization','ai','help','settings'];
for(const m of secondary)
  assert.match(app,new RegExp(`function more\\(\\)\\{[\\s\\S]*?['"]${m}['"]`),`More navigation missing ${m}`);

// Existing V27 finance rows must be migrated into source-separated fields without changing totals.
global.localStorage={setItem(){},getItem(){return JSON.stringify({financeHistory:[{date:'2026-09-10',revenue:90,covers:6,expenses:25}]})},removeItem(){}};const migrated=(await import('../src/store.js?migration-guard')).load();assert.equal(migrated.financeHistory[0].manualRevenue,90);assert.equal(migrated.financeHistory[0].manualExpenses,25);assert.equal(migrated.financeHistory[0].orderRevenue,0);assert.equal(migrated.financeHistory[0].purchaseExpenses,0);assert.equal(migrated.financeHistory[0].revenue,90);assert.equal(migrated.financeHistory[0].expenses,25);

// Every rendered data-entry form must have either the shared helper or an explicit dedicated listener.
const renderedForms=[...app.matchAll(/id="([A-Za-z]+Form)"/g)].map(x=>x[1]);
const helperBindings=new Set([...app.matchAll(/form\('([^']+)'/g)].map(x=>x[1]));
const dedicatedForms=new Set(['settingsForm','securitySettingsForm','securityLoginForm','securitySignupForm','memberAccessForm','billingPurchaseForm','cloudForm','cloudLoginForm','aiForm','visionStockForm','invoiceReviewForm','restaurantForm','managerForm','staffAccessForm']);
for(const id of renderedForms){
  if(dedicatedForms.has(id))
    assert.match(app,new RegExp(`getElementById\\('${id}'\\)\\?\\.addEventListener\\('submit'`),`missing dedicated submit binding for ${id}`);
  else
    assert.ok(helperBindings.has(id),`missing submit binding for ${id}`);
}

// Navigation targets must resolve to a screen and stock edits must retain alert thresholds.
const screenFns=new Set([...app.matchAll(/function ([A-Za-z]+)\(\)\{/g)].map(x=>x[1]));for(const m of ['dashboard','operations','finance','documents','more',...['orders','products','haccp','stock','suppliers','purchases','invoices','team','planning','leave','training','recipes','reservations','customers','loyalty','incidents','waste','maintenance','equipment','deliveries','allergens','recalls','cleaning','audits','checklists','alerts','goals','briefing','handover','organization','ai','help']])assert.ok(screenFns.has(m),`missing screen function ${m}`);assert.match(app,/collection==='stock'[^;]+min:\+d\.get\('min'\)/,'stock edit must preserve minimum threshold');

// High-risk create paths must use the store validator, not direct array mutation.
for(const formId of ['productForm','tempForm','stockForm','recipeForm','reservationForm','loyaltyForm','auditForm','goalForm']){
  assert.match(app,new RegExp(`form\\('${formId}',f=>\\{if\\(!recordValidated`),`${formId} must use recordValidated`);
}
assert.match(app,/visionStockForm[\s\S]{0,900}recordValidated\(state,'stock'/);
for(const collection of ['products','temps','stock','recipes','reservations','loyalty','audits','goals']){
  assert.doesNotMatch(app,new RegExp(`form\\('[^']+',f=>state\\.${collection}\\.unshift`),`${collection} create path must not mutate directly`);
}
assert.match(store,/export function recordValidated/);

// User-entered commercial quantities/prices must reject impossible negative values.
assert.match(app,/id="reservationForm"[\s\S]{0,500}name="covers"[^>]*min="1"[^>]*step="1"/);
for(const id of ['orderForm','purchaseForm','invoiceForm'])assert.match(app,new RegExp(`id="${id}"[\\s\\S]{0,700}name="amount"[^>]*min="0"`),`${id} must prevent negative amounts`);
assert.equal(updateRecord({reservations:[{covers:2}]},'reservations',0,{covers:0}),false);
assert.equal(updateRecord({products:[{cost:2,price:5}]},'products',0,{cost:-1}),false);
assert.equal(updateRecord({recipes:[{cost:2,price:5}]},'recipes',0,{price:-1}),false);
assert.equal(updateRecord({invoices:[{amount:10}]},'invoices',0,{amount:-1}),false);

// Documents must use the printable/PDF-ready path, never regress to plain-text downloads.
assert.equal(/\.download=`\$\{x\.type\}-\$\{x\.date\}\.txt`/.test(app),false,'documents must not export TXT');assert.match(app,/data-doc-download/);assert.match(app,/window\.open\('','_blank'\)/);assert.match(app,/window\.print\(\)/);assert.match(app,/t\('printPdf'\)/);

// Destructive UI actions require explicit confirmation before mutation.
assert.match(app,/\[data-remove\][\s\S]{0,320}confirm\(t\(b\.dataset\.remove==='financeHistory'\?'clearManualConfirm':'deleteConfirm'\)\)/,'record deletion must require confirmation');assert.match(app,/resetData[\s\S]{0,300}confirm\(t\('resetConfirm'\)\)/,'full data reset must require confirmation');

// Secondary navigation must retain every dashboard shortcut except those owned by fixed primary navigation.
const dashMatch=app.match(/const modules=\[([^\]]+)\]/),moreMatch=app.match(/function more\(\)\{[\s\S]*?\$\{\[([^\]]+)\](?:\.filter\(canPage\))?\.map/);assert.ok(dashMatch&&moreMatch,'navigation lists must be discoverable');const list=x=>[...x.matchAll(/'([^']+)'/g)].map(m=>m[1]),dashModules=list(dashMatch[1]),moreModules=list(moreMatch[1]),fixedPrimary=new Set(['operations','finance','documents']);for(const m of dashModules)if(!fixedPrimary.has(m))assert.ok(moreModules.includes(m),`More navigation missing ${m}`);for(const m of ['categories','settings','stock','haccp'])assert.ok(moreModules.includes(m),`More navigation missing utility ${m}`);

// Dashboard summaries must not bypass cloud page permissions.
assert.match(app,/financeAccess=canPage\('finance'\)/);
assert.match(app,/taskAccess=canPage\('operations'\)\|\|canPage\('checklists'\)/);
assert.match(app,/stockAccess=canPage\('stock'\)/);
assert.match(app,/invoiceAccess=canPage\('invoices'\)/);
assert.match(app,/orderAccess=canPage\('orders'\)/);
assert.match(app,/financeBlock=financeAccess\?/);
assert.match(app,/summaryCards=\[stockAccess\?/);

// Cloud-authenticated sessions must filter navigation and protect direct page access.
assert.match(app,/modules\.filter\(canPage\)/);
assert.match(app,/\.filter\(canPage\)\.map/);
assert.match(app,/if\(!canPage\(page\)\)page='dashboard'/);
assert.match(app,/id="cloudLoginForm"/);
assert.match(app,/signInCloud\(/);
assert.match(app,/loadCloudIdentity\(/);
assert.match(app,/cloudPageAllowed/);
assert.match(app,/allowedLocalRestaurants/);
assert.match(app,/cloudRestaurantAllowed/);
assert.match(app,/function cloudGate\(\)/);
assert.match(app,/mergeCloudRestaurants\(state,cloudIdentity\?\.restaurants\|\|\[\]\)/);
assert.match(app,/cloudMultiAccess\(cloudIdentity,cloudOrganizationId\(\)\)/);
assert.match(app,/billingPurchaseForm/);assert.match(app,/purchasePlan\(/);assert.doesNotMatch(app,/id="subscriptionForm"/);
assert.match(app,/cloudSub=\(cloudIdentity\?\.subscriptions\|\|\[\]\)\.find/);
assert.match(app,/session&&cloudIdentity\?/,'cloud session must show authoritative subscription instead of local selector');
assert.match(app,/visibleStaff=orgAdmin\?state\.staffAccess:state\.staffAccess\.filter/);

// Organization UI must use the isolated workspace/access store API.
assert.match(app,/id="restaurantSwitch"/);
assert.match(app,/function organization\(\)/);
assert.match(app,/recordRestaurant\(state,/);
assert.match(app,/recordManager\(state,/);
assert.match(app,/recordStaffAccess\(state,/);
assert.match(store,/export function switchRestaurant/);
assert.match(store,/const WORKSPACE_KEYS=/);
assert.match(store,/export const STAFF_PERMISSIONS=/);

// Sales summary must count paid orders only, matching finance semantics.
assert.match(app,/function orders\(\)\{const total=\(state\.orders\|\|\[\]\)\.filter\(x=>x\.status==='paid'\)\.reduce/);
// Delivery creation must use the guarded store path instead of direct array mutation.
assert.match(app,/form\('deliveryForm',f=>recordDelivery\(state,/);

// Supplier invoices must expose both aggregate and row-level overdue signals.
assert.match(app,/pendingRows\.filter\(x=>x\.date&&x\.date<today\(\)\)\.length/);assert.match(app,/x\.status!=='paid'&&x\.date&&x\.date<today\(\)/);assert.match(app,/t\('overdue'\)/);

// Supplier edits must remain tied to the supplier registry too.
assert.match(app,/data-edit-form="purchases"[\s\S]{0,500}<select name="supplier" required>[\s\S]{0,300}state\.suppliers\.map/);
assert.match(app,/data-edit-form="invoices"[\s\S]{0,500}<select name="supplier" required>[\s\S]{0,300}state\.suppliers\.map/);

// New purchases and supplier invoices must select from the supplier registry instead of free-text supplier names.
assert.match(app,/function purchases\(\)[\s\S]{0,7000}<select name="supplier" required>[\s\S]{0,250}state\.suppliers\.map/);assert.match(app,/function invoices\(\)[\s\S]{0,1200}<select name="supplier" required>[\s\S]{0,250}state\.suppliers\.map/);

// Customer-facing workflows must reuse CRM names while still allowing a new walk-in name.
assert.match(app,/function reservations\(\)[\s\S]{0,500}list="customerNames"[\s\S]{0,300}state\.customers\.map/);assert.match(app,/function loyalty\(\)[\s\S]{0,500}list="loyaltyCustomerNames"[\s\S]{0,300}state\.customers\.map/);

// Product category selection must stay registry-linked on both create and edit flows.
assert.match(app,/function products\(\)[\s\S]{0,650}<select name="category">[\s\S]{0,260}state\.categories\.map/);assert.match(app,/editingRow\('products',i\)[\s\S]{0,700}<select name="category">[\s\S]{0,320}k\.name===x\.category/);

// Every collection rendered with an inline edit UI must have a patch serializer.
const editableCollections=new Set([...app.matchAll(/editingRow\('([^']+)'/g)].map(x=>x[1]));const patchCollections=new Set([...app.matchAll(/collection==='([^']+)'/g)].map(x=>x[1]));for(const collection of editableCollections)assert.ok(patchCollections.has(collection),`missing patch serializer for ${collection}`);

// Any record collection exposing edit/delete actions must also render a real inline edit flow.
const actionCollections=new Set([...app.matchAll(/actions\('([^']+)'/g)].map(x=>x[1]));const inlineCollections=new Set([...app.matchAll(/editingRow\('([^']+)'/g)].map(x=>x[1]));for(const collection of actionCollections)assert.ok(inlineCollections.has(collection),`actions shown without edit UI for ${collection}`);

// Performance goals must support the same full edit/delete lifecycle as operational records.
assert.match(app,/editingRow\('goals',i\)/);assert.match(app,/collection==='goals'[^;]+metric:d\.get\('metric'\)[^;]+period:d\.get\('period'\)/);assert.match(app,/actions\('goals',i\)/);
