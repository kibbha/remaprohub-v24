import{financeTotals,stockAvailable,calculateRecipeCost,haccpReadingStatus,localDate}from'./store.js';

const n=value=>Number.isFinite(+value)?+value:0;
const round=(value,digits=2)=>{const p=10**digits;return Math.round((n(value)+Number.EPSILON)*p)/p};
const dayMs=86400000;
function atMidnight(value){const d=value instanceof Date?new Date(value):new Date(value);d.setHours(0,0,0,0);return d}
function timeMinutes(value){const m=/^(\d{2}):(\d{2})$/.exec(String(value||''));if(!m)return null;const h=+m[1],min=+m[2];return h<=23&&min<=59?h*60+min:null}

export function shiftDurationHours(start,end){const from=timeMinutes(start),to=timeMinutes(end);if(from==null||to==null)return 0;let minutes=to-from;if(minutes<0)minutes+=1440;return round(minutes/60,2)}

export function plannedLabor(state,now=new Date(),days=7){
  const start=atMidnight(now),end=new Date(start.getTime()+Math.max(1,Math.trunc(days))*dayMs),members=new Map((state?.team||[]).map(x=>[String(x.name||'').trim().toLocaleLowerCase(),x]));
  let hours=0,cost=0;const missingRates=new Set(),rows=[],employeeHours=new Map();
  for(const shift of state?.shifts||[]){const when=atMidnight(String(shift.date||''));if(Number.isNaN(when.getTime())||when<start||when>=end)continue;const employee=String(shift.employee||'').trim(),duration=shiftDurationHours(shift.start,shift.end),member=members.get(employee.toLocaleLowerCase()),rate=n(member?.hourlyRate||member?.hourlyCost);hours+=duration;employeeHours.set(employee,round((employeeHours.get(employee)||0)+duration,2));if(rate>0)cost+=duration*rate;else if(duration>0)missingRates.add(employee);rows.push({employee,date:String(shift.date||''),hours:duration,rate,cost:round(duration*rate,2)})}
  const weeklyLimit=Math.max(1,n(state?.payrollSettings?.ccnt?.weeklyHours)||42),byEmployee=[...employeeHours].map(([employee,value])=>({employee,hours:value})).sort((a,b)=>b.hours-a.hours),overWeeklyHours=byEmployee.filter(x=>x.hours>weeklyLimit);
  return{days:Math.max(1,Math.trunc(days)),hours:round(hours,2),cost:round(cost,2),weeklyLimit,byEmployee,overWeeklyHours,missingRates:[...missingRates].filter(Boolean),shifts:rows.length,rows};
}

export function recipePortfolio(state){
  const target=Math.max(0,n(state?.recipeTarget)||30),warning=Math.max(target,n(state?.recipeWarning)||35),items=[];
  for(const recipe of state?.recipes||[]){const metrics=calculateRecipeCost(state,recipe)||null,costPerPortion=metrics?metrics.costPerPortion:n(recipe?.costPerPortion??recipe?.cost),netPrice=metrics?metrics.netPrice:n(recipe?.price),foodCostPercent=metrics?metrics.foodCostPercent:(netPrice?costPerPortion/netPrice*100:0),margin=metrics?metrics.margin:netPrice-costPerPortion,vatRate=n(recipe?.vatRate),suggestedNet=target>0?costPerPortion/(target/100):0,suggestedPrice=suggestedNet*(1+vatRate/100);items.push({name:String(recipe?.name||''),foodCostPercent:round(foodCostPercent,1),costPerPortion:round(costPerPortion,2),netPrice:round(netPrice,2),margin:round(margin,2),suggestedPrice:round(suggestedPrice,2),status:foodCostPercent<=target?'good':foodCostPercent<=warning?'warning':'bad'})}
  const average=items.length?items.reduce((sum,x)=>sum+x.foodCostPercent,0)/items.length:0;return{target,warning,averageFoodCost:round(average,1),aboveTarget:items.filter(x=>x.foodCostPercent>target).length,critical:items.filter(x=>x.foodCostPercent>warning).length,items};
}

export function reorderSuggestions(state){return(state?.stock||[]).map(item=>{const available=n(stockAvailable(state,item)),minimum=Math.max(0,n(item?.min));if(minimum<=0||available>minimum)return null;const target=Math.max(minimum*2,n(item?.reorderTarget)||0),quantity=Math.max(0,target-available);return{stockId:String(item?.id||''),name:String(item?.name||''),unit:String(item?.unit||''),available:round(available,3),minimum:round(minimum,3),target:round(target,3),quantity:round(quantity,3),estimatedCost:round(quantity*n(item?.price),2)}}).filter(Boolean).sort((a,b)=>(a.available-a.minimum)-(b.available-b.minimum))}

export function supplierPriceAlerts(state,threshold=.08){
  const grouped=new Map();for(const point of state?.priceHistory||[]){const key=String(point?.stockId||point?.product||'').trim();if(!key)continue;const list=grouped.get(key)||[];list.push(point);grouped.set(key,list)}
  const alerts=[];for(const list of grouped.values()){list.sort((a,b)=>String(b?.recordedAt||b?.date||'').localeCompare(String(a?.recordedAt||a?.date||'')));const latest=list[0],previous=list[1],before=n(previous?.unitPrice)||n(latest?.previousPrice),after=n(latest?.unitPrice);if(before<=0||after<=0)continue;const change=(after-before)/before;if(Math.abs(change)<Math.max(0,threshold))continue;alerts.push({stockId:String(latest.stockId||''),product:String(latest.product||''),supplier:String(latest.supplier||''),unit:String(latest.unit||''),before:round(before,4),after:round(after,4),changePct:round(change*100,1),date:String(latest.date||''),reference:String(latest.reference||'')})}
  return alerts.sort((a,b)=>Math.abs(b.changePct)-Math.abs(a.changePct));
}

function latestSupplierForStock(state,stockId){
  const id=String(stockId||'');
  const prices=(state?.priceHistory||[]).filter(x=>String(x?.stockId||'')===id&&String(x?.supplier||'').trim()).sort((a,b)=>String(b?.recordedAt||b?.date||'').localeCompare(String(a?.recordedAt||a?.date||'')));
  if(prices[0])return String(prices[0].supplier).trim();
  const deliveries=(state?.deliveries||[]).filter(x=>String(x?.stockId||'')===id&&String(x?.supplier||'').trim()).sort((a,b)=>String(b?.date||'').localeCompare(String(a?.date||'')));
  return deliveries[0]?String(deliveries[0].supplier).trim():'';
}

export function purchasePlan(state){
  const groups=new Map(),items=reorderSuggestions(state);
  for(const item of items){
    const supplier=latestSupplierForStock(state,item.stockId),key=supplier||'__unassigned__',row={...item,supplier};
    const group=groups.get(key)||{supplier,unassigned:!supplier,items:[],estimatedCost:0};
    group.items.push(row);group.estimatedCost+=n(item.estimatedCost);groups.set(key,group);
  }
  const list=[...groups.values()].map(group=>({...group,estimatedCost:round(group.estimatedCost,2)})).sort((a,b)=>Number(a.unassigned)-Number(b.unassigned)||b.estimatedCost-a.estimatedCost);
  return{items,totalItems:items.length,estimatedCost:round(items.reduce((sum,x)=>sum+n(x.estimatedCost),0),2),unassignedItems:items.filter(x=>!latestSupplierForStock(state,x.stockId)).length,groups:list};
}

export function supplierPriceOpportunities(state){
  const byStock=new Map(),reorders=new Map(reorderSuggestions(state).map(x=>[String(x.stockId),x]));
  for(const point of state?.priceHistory||[]){
    const stockId=String(point?.stockId||'').trim(),supplier=String(point?.supplier||'').trim(),price=n(point?.unitPrice);
    if(!stockId||!supplier||price<=0)continue;
    const bucket=byStock.get(stockId)||new Map(),previous=bucket.get(supplier);
    if(!previous||String(point?.recordedAt||point?.date||'')>String(previous?.recordedAt||previous?.date||''))bucket.set(supplier,point);
    byStock.set(stockId,bucket);
  }
  const out=[];
  for(const [stockId,bucket] of byStock){
    const offers=[...bucket.values()].map(x=>({supplier:String(x.supplier),price:n(x.unitPrice),date:String(x.date||''),recordedAt:String(x.recordedAt||''),unit:String(x.unit||'')})).sort((a,b)=>a.price-b.price);
    if(offers.length<2)continue;
    const all=[...bucket.values()].sort((a,b)=>String(b?.recordedAt||b?.date||'').localeCompare(String(a?.recordedAt||a?.date||''))),current=all[0],best=offers[0];
    if(!current||!best||String(current.supplier)===best.supplier||n(current.unitPrice)<=best.price)continue;
    const item=(state?.stock||[]).find(x=>String(x.id)===stockId),currentPrice=n(current.unitPrice),savingPct=(currentPrice-best.price)/currentPrice*100,reorder=reorders.get(stockId),quantity=n(reorder?.quantity),potentialSaving=quantity>0?quantity*(currentPrice-best.price):0;
    out.push({stockId,product:String(item?.name||current.product||''),unit:String(current.unit||best.unit||item?.unit||''),currentSupplier:String(current.supplier||''),currentPrice:round(currentPrice,4),bestSupplier:best.supplier,bestPrice:round(best.price,4),savingPct:round(savingPct,1),reorderQuantity:round(quantity,3),potentialSaving:round(potentialSaving,2),offers:offers.length});
  }
  return out.sort((a,b)=>b.potentialSaving-a.potentialSaving||b.savingPct-a.savingPct);
}

export function recipeSupplierImpacts(state){
  const alerts=supplierPriceAlerts(state),byStock=new Map(alerts.map(x=>[String(x.stockId||''),x])),out=[];
  for(const recipe of state?.recipes||[]){
    const ingredients=Array.isArray(recipe?.ingredients)?recipe.ingredients:[],matches=ingredients.map(x=>byStock.get(String(x?.stockId||''))).filter(Boolean);
    if(!matches.length)continue;
    const rises=matches.filter(x=>x.changePct>0),maxChange=matches.reduce((max,x)=>Math.max(max,Math.abs(n(x.changePct))),0),metrics=calculateRecipeCost(state,recipe);
    out.push({recipe:String(recipe?.name||''),affectedIngredients:matches.length,risingIngredients:rises.length,maxChangePct:round(maxChange,1),foodCostPercent:round(metrics?.foodCostPercent||0,1),suppliers:[...new Set(matches.map(x=>x.supplier).filter(Boolean))]});
  }
  return out.sort((a,b)=>b.maxChangePct-a.maxChangePct);
}

export function managementOutlook(state,now=new Date()){
  const finance=financeTotals(state,'week',now),labor=plannedLabor(state,now,7),purchases=purchasePlan(state),currentResult=finance.revenue-finance.expenses,plannedCommitments=labor.cost+purchases.estimatedCost;
  return{weekRevenue:round(finance.revenue,2),weekExpenses:round(finance.expenses,2),currentResult:round(currentResult,2),plannedLaborCost:round(labor.cost,2),reorderBudget:round(purchases.estimatedCost,2),plannedCommitments:round(plannedCommitments,2),commitmentsToRevenuePct:finance.revenue?round(plannedCommitments/finance.revenue*100,1):0};
}

export function openHaccpIssues(state){return(state?.temps||[]).map((reading,index)=>{if(reading?.conforming!==false)return null;const status=haccpReadingStatus(state,reading.id);if(status.cancelled||status.resolved)return null;return{index,id:String(reading.id||''),zone:String(reading.zone||''),equipment:String(reading.equipment||''),value:n(reading.value),min:reading.min,max:reading.max,action:String(reading.action||''),responsible:String(reading.responsible||''),recordedAt:String(reading.recordedAt||reading.date||'')}}).filter(Boolean)}

export function haccpCorrectiveTaskDrafts(state,now=new Date()){
  const existing=new Set((state?.managerTasks||[]).filter(x=>x?.source==='haccp'&&x?.sourceId).map(x=>String(x.sourceId)));
  return openHaccpIssues(state).filter(issue=>!existing.has(String(issue.id))).map(issue=>({
    title:[issue.equipment,issue.zone].filter(Boolean).join(' · ')||'HACCP',
    priority:'urgent',
    due:localDate(now),
    owner:issue.responsible||'',
    status:'todo',
    note:[issue.value+' °C',issue.min!=null||issue.max!=null?('['+(issue.min??'−∞')+'…'+(issue.max??'+∞')+']'):'',issue.action].filter(Boolean).join(' · '),
    source:'haccp',
    sourceId:String(issue.id||'')
  }));
}

export function managerReadyActions(state,now=new Date()){
  const purchases=purchasePlan(state),haccpTasks=haccpCorrectiveTaskDrafts(state,now),recipes=recipePortfolio(state);
  return{
    purchaseOrders:purchases.groups.filter(x=>x.supplier).map(x=>({supplier:x.supplier,items:x.items.length,estimatedCost:x.estimatedCost})),
    haccpTasks,
    recipePriceUpdates:recipes.items.filter(x=>x.status==='bad'&&x.suggestedPrice>0).map(x=>({name:x.name,suggestedPrice:x.suggestedPrice,foodCostPercent:x.foodCostPercent}))
  };
}

export function onboardingHealth(state){const checks=[{key:'restaurant',done:!!String(state?.preferences?.restaurant||'').trim()},{key:'team',done:(state?.team||[]).length>0},{key:'stock',done:(state?.stock||[]).length>0},{key:'recipes',done:(state?.recipes||[]).length>0},{key:'haccp',done:(state?.temps||[]).length>0},{key:'finance',done:(state?.financeHistory||[]).length>0}],done=checks.filter(x=>x.done).length;return{score:Math.round(done/checks.length*100),done,total:checks.length,missing:checks.filter(x=>!x.done).map(x=>x.key)}}

export function managerSnapshot(state,now=new Date()){
  const supplierOpportunities=supplierPriceOpportunities(state),readyActions=managerReadyActions(state,now),finance={day:financeTotals(state,'day',now),week:financeTotals(state,'week',now),month:financeTotals(state,'month',now)},reorder=reorderSuggestions(state),priceAlerts=supplierPriceAlerts(state),purchases=purchasePlan(state),recipeImpacts=recipeSupplierImpacts(state),outlook=managementOutlook(state,now),haccp=openHaccpIssues(state),labor=plannedLabor(state,now,7),recipes=recipePortfolio(state),setup=onboardingHealth(state),today=localDate(now),overdueInvoices=(state?.invoices||[]).filter(x=>x.status!=='paid'&&String(x.date||'')&&String(x.date)<localDate(now)),tasks=(state?.tasks||[]).filter(x=>!x[1]),managerTasks=(state?.managerTasks||[]).filter(x=>x.status!=='done'),priorities=[];
  if(haccp.length)priorities.push({code:'haccp',severity:'urgent',count:haccp.length});if(overdueInvoices.length)priorities.push({code:'overdueInvoices',severity:'warning',count:overdueInvoices.length});if(reorder.length)priorities.push({code:'stock',severity:'warning',count:reorder.length,value:round(reorder.reduce((sum,x)=>sum+x.estimatedCost,0),2)});const rising=priceAlerts.filter(x=>x.changePct>0);if(rising.length)priorities.push({code:'supplierPrice',severity:'warning',count:rising.length,value:rising[0]?.changePct||0});if(recipes.critical)priorities.push({code:'foodCost',severity:'warning',count:recipes.critical,value:recipes.averageFoodCost});const urgentManager=managerTasks.filter(x=>x.priority==='urgent').length;if(urgentManager)priorities.push({code:'managerTasks',severity:'urgent',count:urgentManager});if(tasks.length)priorities.push({code:'dailyTasks',severity:'info',count:tasks.length});if(labor.missingRates.length)priorities.push({code:'laborRate',severity:'info',count:labor.missingRates.length});if(setup.score<100)priorities.push({code:'setup',severity:'info',count:setup.score});
  return{generatedAt:now.toISOString(),readyActions,supplierOpportunities,finance,reorder,priceAlerts,purchases,recipeImpacts,outlook,haccp,labor,recipes,setup,overdueInvoices:overdueInvoices.length,openDailyTasks:tasks.length,openManagerTasks:managerTasks.length,priorities:priorities.slice(0,8)};
}
