import { cloudFunction } from './cloud.js';

export const POS_BRIDGE_VERSION='22';

const n=value=>Number.isFinite(Number(value))?Number(value):0;
const sourceKey=(kind,item,index)=>kind+':'+String(item?.id||item?.sku||item?.name||index).trim();
const stockById=(state,id)=>(state?.stock||[]).find(x=>String(x?.id||'')===String(id||''));
const stockAvailableLocal=(state,item)=>{
  if(!item)return 0;
  const received=(state?.deliveries||[]).reduce((sum,row)=>sum+(item.id&&row.status==='accepted'&&row.stockId===item.id?(+row.qty||0):0),0);
  const lost=(state?.waste||[]).reduce((sum,row)=>sum+(item.id&&row.stockId===item.id?(+row.qty||0):0),0);
  const movements=(state?.stockMoves||[]).reduce((sum,row)=>sum+(row?.affectsStock===true&&row.stockId===item.id&&Number.isFinite(+row.delta)?+row.delta:0),0);
  return Math.max(0,(+item.qty||0)+received-lost+movements);
};
const stockComponentsOf=(item,state)=>{
  const explicit=Array.isArray(item?.posStockComponents)?item.posStockComponents:[];
  const portions=Math.max(1,n(item?.portions)||1);
  const recipeRows=!explicit.length&&Array.isArray(item?.ingredients)
    ?item.ingredients.map(row=>({stockId:row?.stockId,quantity:Math.max(0,n(row?.quantity))/portions}))
    :[];
  const rows=explicit.length?explicit:recipeRows;
  return rows.map(row=>{
    const stock=stockById(state,row?.stockId);
    const quantity=Math.max(0,n(row?.quantity));
    if(!stock||quantity<=0)return null;
    return {
      stockId:String(stock.id),
      sourceKey:'stock:'+String(stock.id),
      name:String(stock.name||'Stock'),
      unit:String(stock.unit||'unit'),
      quantity,
      unitCost:Math.max(0,n(stock.price))
    };
  }).filter(Boolean);
};
const availabilityOf=(item,state,components)=>{
  const configured=['unlimited','manual','stock'].includes(String(item?.posAvailabilityMode))?String(item.posAvailabilityMode):'';
  const mode=configured||(components.length?'stock':'unlimited');
  const manualQuantity=Math.max(0,Math.floor(n(item?.posManualAvailability)));
  const lowThreshold=Math.max(0,Math.floor(n(item?.posLowStockThreshold)||3));
  let availablePortions=null;
  if(mode==='manual')availablePortions=manualQuantity;
  if(mode==='stock'&&components.length){
    availablePortions=Math.max(0,Math.floor(Math.min(...components.map(row=>stockAvailableLocal(state,stockById(state,row.stockId))/row.quantity))));
  }
  return{mode,manualQuantity,lowThreshold,availablePortions,resetAt:String(item?.posAvailabilityResetAt||'')};
};
const itemUnitCost=(item,state)=>{
  const direct=Math.max(0,n(item?.cost));
  if(direct>0)return direct;
  return stockComponentsOf(item,state).reduce((sum,row)=>sum+row.quantity*row.unitCost,0);
};
const stationOf=item=>{const s=String(item?.productionStation||item?.posStation||item?.station||item?.metadata?.station||'kitchen').toLowerCase();return['kitchen','bar','none'].includes(s)?s:'kitchen'};

export function buildPosCatalogFromHubState(state){
  const products=Array.isArray(state?.products)?state.products:[];
  const recipes=Array.isArray(state?.recipes)?state.recipes:[];
  const out=[];
  products.forEach((item,index)=>{
    const name=String(item?.name||'').trim();
    if(!name)return;
    const components=stockComponentsOf(item,state),availability=availabilityOf(item,state,components);
    out.push({
      sourceKey:sourceKey('product',item,index),
      sku:String(item?.sku||item?.code||'').trim(),
      name,
      category:String(item?.category||'Produits').trim(),
      itemType:'product',
      price:Math.max(0,n(item?.price)),
      taxRate:Math.max(0,n(item?.taxRate??item?.vatRate??8.1)),
      productionStation:stationOf(item),
      active:item?.active!==false,
      sortOrder:index,
      metadata:{hubSource:'products',unitCost:itemUnitCost(item,state),stockComponents:components,availability}
    });
  });
  recipes.forEach((item,index)=>{
    const name=String(item?.name||'').trim();
    if(!name)return;
    const id=String(item?.id||''),components=stockComponentsOf(item,state),availability=availabilityOf(item,state,components);
    out.push({
      sourceKey:sourceKey('recipe',item,index),
      recipeId:/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)?id:undefined,
      sku:String(item?.sku||item?.code||'').trim(),
      name,
      category:String(item?.category||'Recettes').trim(),
      itemType:'recipe',
      price:Math.max(0,n(item?.price??item?.sellingPrice)),
      taxRate:Math.max(0,n(item?.taxRate??item?.vatRate??8.1)),
      productionStation:stationOf(item),
      active:item?.active!==false,
      sortOrder:10000+index,
      metadata:{hubSource:'recipes',unitCost:itemUnitCost(item,state),stockComponents:components,availability}
    });
  });
  return out;
}

export async function publishPosCatalog(restaurantId,state,{replace=true}={}){
  const items=buildPosCatalogFromHubState(state);
  return cloudFunction('remapro-pos-sync',{action:'sync_catalog',restaurantId,items,replace});
}
export async function loadPosBootstrap(restaurantId,deviceId=''){
  return cloudFunction('remapro-pos-sync',{action:'bootstrap',restaurantId,deviceId});
}
export async function registerPosDevice(restaurantId,device){
  return cloudFunction('remapro-pos-sync',{action:'heartbeat',restaurantId,device});
}
export async function openPosCashSession(restaurantId,payload){
  return cloudFunction('remapro-pos-sync',{action:'open_cash_session',restaurantId,...payload});
}
export async function closePosCashSession(restaurantId,payload){
  return cloudFunction('remapro-pos-sync',{action:'close_cash_session',restaurantId,...payload});
}
export async function commitPosOrder(restaurantId,order){
  return cloudFunction('remapro-pos-sync',{action:'commit_order',restaurantId,order});
}
export async function loadRecentPosReceipts(restaurantId,limit=30){
  return cloudFunction('remapro-pos-sync',{action:'recent_receipts',restaurantId,limit});
}
export async function pullPosEvents(restaurantId,after=0,limit=100){
  return cloudFunction('remapro-pos-sync',{action:'pull_events',restaurantId,after,limit});
}
export async function loadPosDailySummary(restaurantId,{from='',to=''}={}){
  return cloudFunction('remapro-pos-sync',{action:'daily_summary',restaurantId,from,to});
}

export async function loadPosTables(restaurantId){
  return cloudFunction('remapro-pos-sync',{action:'list_tables',restaurantId});
}
export async function syncPosTables(restaurantId,tables,{replace=true}={}){
  return cloudFunction('remapro-pos-sync',{action:'sync_tables',restaurantId,tables,replace});
}
export async function savePosOpenOrder(restaurantId,order){
  return cloudFunction('remapro-pos-sync',{action:'save_open_order',restaurantId,order});
}
export async function settlePosOpenOrder(restaurantId,payload){
  return cloudFunction('remapro-pos-sync',{action:'settle_open_order',restaurantId,...payload});
}
export async function loadPosOpenOrders(restaurantId){
  return cloudFunction('remapro-pos-sync',{action:'list_open_orders',restaurantId});
}

export async function settlePosOpenOrderSplit(restaurantId,payload){
  return cloudFunction('remapro-pos-sync',{action:'settle_open_order_split',restaurantId,...payload});
}
export async function transferPosOpenOrder(restaurantId,orderId,targetTableId){
  return cloudFunction('remapro-pos-sync',{action:'transfer_open_order',restaurantId,orderId,targetTableId});
}
export async function cancelPosOpenOrder(restaurantId,orderId,reason){
  return cloudFunction('remapro-pos-sync',{action:'cancel_open_order',restaurantId,orderId,reason});
}
export async function refundPosOrder(restaurantId,payload){
  return cloudFunction('remapro-pos-sync',{action:'refund_order',restaurantId,...payload});
}
export async function confirmPosExternalRefund(restaurantId,refundId,success,providerReference=''){
  return cloudFunction('remapro-pos-sync',{action:'confirm_external_refund',restaurantId,refundId,success,providerReference});
}
export async function loadPosRefunds(restaurantId,{orderId='',limit=50}={}){
  return cloudFunction('remapro-pos-sync',{action:'list_refunds',restaurantId,orderId,limit});
}

export async function sendPosOrderToProduction(restaurantId,orderId){
  return cloudFunction('remapro-pos-sync',{action:'send_to_production',restaurantId,orderId});
}
export async function loadPosProductionQueue(restaurantId,station=''){
  return cloudFunction('remapro-pos-sync',{action:'production_queue',restaurantId,station});
}
export async function updatePosProductionItem(restaurantId,itemId,status){
  return cloudFunction('remapro-pos-sync',{action:'update_production_item',restaurantId,itemId,status});
}

export async function appendPosOrderItems(restaurantId,payload){
  return cloudFunction('remapro-pos-sync',{action:'append_order_items',restaurantId,...payload});
}

export async function settlePosOpenOrderAllocated(restaurantId,payload){
  return cloudFunction('remapro-pos-sync',{action:'settle_open_order_allocated',restaurantId,...payload});
}

export async function loadPosServiceReport(restaurantId,businessDate){
  return cloudFunction('remapro-pos-sync',{action:'service_report',restaurantId,businessDate});
}

export async function payPosAllocatedGroup(restaurantId,payload){
  return cloudFunction('remapro-pos-sync',{action:'pay_allocated_group',restaurantId,...payload});
}
export async function loadPosPaymentProgress(restaurantId,orderId){
  return cloudFunction('remapro-pos-sync',{action:'order_payment_progress',restaurantId,orderId});
}

export async function loadPosPaymentTerminals(restaurantId){
  return cloudFunction('remapro-pos-sync',{action:'list_terminals',restaurantId});
}
export async function savePosPaymentTerminal(restaurantId,terminal){
  return cloudFunction('remapro-pos-sync',{action:'upsert_terminal',restaurantId,terminal});
}
export async function loadPosTerminalIntents(restaurantId,{orderId='',terminalId='',limit=30}={}){
  return cloudFunction('remapro-pos-sync',{action:'list_terminal_intents',restaurantId,orderId,terminalId,limit});
}
export async function createPosTerminalIntent(restaurantId,payload){
  return cloudFunction('remapro-pos-sync',{action:'create_terminal_intent',restaurantId,...payload});
}
export async function createPosTerminalRefundIntent(restaurantId,payload){
  return cloudFunction('remapro-pos-sync',{action:'create_terminal_refund_intent',restaurantId,...payload});
}
export async function cancelPosTerminalIntent(restaurantId,intentId){
  return cloudFunction('remapro-pos-sync',{action:'cancel_terminal_intent',restaurantId,intentId});
}

export async function loadPosPrinters(restaurantId){
  return cloudFunction('remapro-pos-sync',{action:'list_printers',restaurantId});
}
export async function savePosPrinter(restaurantId,printer){
  return cloudFunction('remapro-pos-sync',{action:'upsert_printer',restaurantId,printer});
}
export async function setPosPrinterStatus(restaurantId,printerId,status){
  return cloudFunction('remapro-pos-sync',{action:'set_printer_status',restaurantId,printerId,status});
}

export async function loadPosOperators(restaurantId){
  return cloudFunction('remapro-pos-sync',{action:'list_operators',restaurantId});
}
export async function savePosOperator(restaurantId,operator){
  return cloudFunction('remapro-pos-sync',{action:'upsert_operator',restaurantId,operator});
}
export async function loadPosAdminSnapshot(restaurantId,businessDate=''){
  const date=businessDate||new Date().toISOString().slice(0,10);
  const [bootstrap,tables,operators,printers,terminals,movements,foodCost,providers,layoutAdmin,floorPlanAdmin]=await Promise.all([
    loadPosBootstrap(restaurantId),
    loadPosTables(restaurantId),
    loadPosOperators(restaurantId),
    loadPosPrinters(restaurantId),
    loadPosPaymentTerminals(restaurantId),
    loadPosInventoryMovements(restaurantId,{unacknowledged:true,limit:500}),
    loadPosFoodCostReport(restaurantId,date),
    loadPosProviderConnections(restaurantId),
    loadPosLayoutAdmin(restaurantId),
    loadPosFloorPlanAdmin(restaurantId)
  ]);
  return {
    bootstrap,
    catalog:bootstrap?.catalog||[],
    tables:tables?.rows||[],
    operators:operators?.rows||[],
    printers:printers?.rows||[],
    terminals:terminals?.rows||[],
    inventoryMovements:movements?.rows||[],
    inventoryCursor:Number(movements?.cursor)||0,
    foodCost:foodCost?.report||null,
    providerConnections:providers?.rows||[],
    paymentOfficialPaths:providers?.officialPaths||{},
    automaticTransactions:providers?.automaticTransactions===true,
    layoutDraft:layoutAdmin?.draft||null,
    layoutPublished:layoutAdmin?.published||null,
    layoutHistory:Array.isArray(layoutAdmin?.history)?layoutAdmin.history:[],
    floorPlans:Array.isArray(floorPlanAdmin?.plans)?floorPlanAdmin.plans:[]
  };
}

export async function loadPosInventoryMovements(restaurantId,{after=0,unacknowledged=true,limit=300}={}){
  return cloudFunction('remapro-pos-sync',{action:'inventory_movements',restaurantId,after,unacknowledged,limit});
}
export async function ackPosInventoryMovements(restaurantId,movementIds){
  return cloudFunction('remapro-pos-sync',{action:'ack_inventory_movements',restaurantId,movementIds});
}
export async function loadPosFoodCostReport(restaurantId,businessDate){
  return cloudFunction('remapro-pos-sync',{action:'food_cost_report',restaurantId,businessDate});
}
export async function loadPosAccountingExport(restaurantId,{from,to}={}){
  return cloudFunction('remapro-pos-sync',{action:'accounting_export',restaurantId,from,to});
}

export async function loadPosProviderConnections(restaurantId){
  return cloudFunction('remapro-pos-sync',{action:'list_provider_connections',restaurantId});
}
export async function savePosProviderConnection(restaurantId,connection){
  return cloudFunction('remapro-pos-sync',{action:'upsert_provider_connection',restaurantId,connection});
}

export async function loadPosLayoutAdmin(restaurantId){
  return cloudFunction('remapro-pos-sync',{action:'layout_admin',restaurantId});
}
export async function loadPosFloorPlanAdmin(restaurantId){
  return cloudFunction('remapro-pos-sync',{action:'floor_plan_admin',restaurantId});
}
export async function savePosFloorPlan(restaurantId,plan){
  return cloudFunction('remapro-pos-sync',{action:'save_floor_plan',restaurantId,plan});
}
export async function publishPosFloorPlan(restaurantId,planId,{activate=true}={}){
  return cloudFunction('remapro-pos-sync',{action:'publish_floor_plan',restaurantId,planId,activate});
}
export async function activatePosFloorPlan(restaurantId,planId){
  return cloudFunction('remapro-pos-sync',{action:'activate_floor_plan',restaurantId,planId});
}
export async function restorePosFloorPlanVersion(restaurantId,planId,version){
  return cloudFunction('remapro-pos-sync',{action:'restore_floor_plan_version',restaurantId,planId,version:Number(version)});
}

export async function savePosLayoutDraft(restaurantId,document){
  return cloudFunction('remapro-pos-sync',{action:'save_layout_draft',restaurantId,document});
}
export async function publishPosLayout(restaurantId){
  return cloudFunction('remapro-pos-sync',{action:'publish_layout',restaurantId});
}
export async function restorePosLayoutVersionToDraft(restaurantId,version){
  return cloudFunction('remapro-pos-sync',{action:'restore_layout_version',restaurantId,version:Number(version)});
}
export async function loadPosCurrentLayout(restaurantId){
  return cloudFunction('remapro-pos-sync',{action:'layout_current',restaurantId});
}
