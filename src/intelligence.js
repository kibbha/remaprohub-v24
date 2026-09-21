import{financeTotals,stockAvailable,calculateRecipeCost,haccpReadingStatus,localDate}from'./store.js';

const n=value=>Number.isFinite(+value)?+value:0;
const round=(value,digits=2)=>{const p=10**digits;return Math.round((n(value)+Number.EPSILON)*p)/p};
const dayMs=86400000;
function atMidnight(value){const d=value instanceof Date?new Date(value):new Date(value);d.setHours(0,0,0,0);return d}
function timeMinutes(value){const m=/^(\d{2}):(\d{2})$/.exec(String(value||''));if(!m)return null;const h=+m[1],min=+m[2];return h<=23&&min<=59?h*60+min:null}

export function shiftDurationHours(start,end){const from=timeMinutes(start),to=timeMinutes(end);if(from==null||to==null)return 0;let minutes=to-from;if(minutes<0)minutes+=1440;return round(minutes/60,2)}

export function plannedLabor(state,now=new Date(),days=7){
  const start=atMidnight(now),end=new Date(start.getTime()+Math.max(1,Math.trunc(days))*dayMs),members=new Map((state?.team||[]).map(x=>[String(x.name||'').trim().toLocaleLowerCase(),x]));
  let hours=0,cost=0;const missingRates=new Set(),rows=[];
  for(const shift of state?.shifts||[]){const when=atMidnight(String(shift.date||''));if(Number.isNaN(when.getTime())||when<start||when>=end)continue;const duration=shiftDurationHours(shift.start,shift.end),member=members.get(String(shift.employee||'').trim().toLocaleLowerCase()),rate=n(member?.hourlyRate||member?.hourlyCost);hours+=duration;if(rate>0)cost+=duration*rate;else if(duration>0)missingRates.add(String(shift.employee||'').trim());rows.push({employee:String(shift.employee||''),date:String(shift.date||''),hours:duration,rate,cost:round(duration*rate,2)})}
  return{days:Math.max(1,Math.trunc(days)),hours:round(hours,2),cost:round(cost,2),missingRates:[...missingRates].filter(Boolean),shifts:rows.length,rows};
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

export function openHaccpIssues(state){return(state?.temps||[]).map((reading,index)=>{if(reading?.conforming!==false)return null;const status=haccpReadingStatus(state,reading.id);if(status.cancelled||status.resolved)return null;return{index,id:String(reading.id||''),zone:String(reading.zone||''),equipment:String(reading.equipment||''),value:n(reading.value),min:reading.min,max:reading.max,action:String(reading.action||''),responsible:String(reading.responsible||''),recordedAt:String(reading.recordedAt||reading.date||'')}}).filter(Boolean)}

export function onboardingHealth(state){const checks=[{key:'restaurant',done:!!String(state?.preferences?.restaurant||'').trim()},{key:'team',done:(state?.team||[]).length>0},{key:'stock',done:(state?.stock||[]).length>0},{key:'recipes',done:(state?.recipes||[]).length>0},{key:'haccp',done:(state?.temps||[]).length>0},{key:'finance',done:(state?.financeHistory||[]).length>0}],done=checks.filter(x=>x.done).length;return{score:Math.round(done/checks.length*100),done,total:checks.length,missing:checks.filter(x=>!x.done).map(x=>x.key)}}

export function managerSnapshot(state,now=new Date()){
  const finance={day:financeTotals(state,'day',now),week:financeTotals(state,'week',now),month:financeTotals(state,'month',now)},reorder=reorderSuggestions(state),priceAlerts=supplierPriceAlerts(state),haccp=openHaccpIssues(state),labor=plannedLabor(state,now,7),recipes=recipePortfolio(state),setup=onboardingHealth(state),today=localDate(now),overdueInvoices=(state?.invoices||[]).filter(x=>x.status!=='paid'&&String(x.date||'')&&String(x.date)<localDate(now)),tasks=(state?.tasks||[]).filter(x=>!x[1]),managerTasks=(state?.managerTasks||[]).filter(x=>x.status!=='done'),priorities=[];
  if(haccp.length)priorities.push({code:'haccp',severity:'urgent',count:haccp.length});if(overdueInvoices.length)priorities.push({code:'overdueInvoices',severity:'warning',count:overdueInvoices.length});if(reorder.length)priorities.push({code:'stock',severity:'warning',count:reorder.length,value:round(reorder.reduce((sum,x)=>sum+x.estimatedCost,0),2)});const rising=priceAlerts.filter(x=>x.changePct>0);if(rising.length)priorities.push({code:'supplierPrice',severity:'warning',count:rising.length,value:rising[0]?.changePct||0});if(recipes.critical)priorities.push({code:'foodCost',severity:'warning',count:recipes.critical,value:recipes.averageFoodCost});const urgentManager=managerTasks.filter(x=>x.priority==='urgent').length;if(urgentManager)priorities.push({code:'managerTasks',severity:'urgent',count:urgentManager});if(tasks.length)priorities.push({code:'dailyTasks',severity:'info',count:tasks.length});if(labor.missingRates.length)priorities.push({code:'laborRate',severity:'info',count:labor.missingRates.length});if(setup.score<100)priorities.push({code:'setup',severity:'info',count:setup.score});
  return{generatedAt:now.toISOString(),finance,reorder,priceAlerts,haccp,labor,recipes,setup,overdueInvoices:overdueInvoices.length,openDailyTasks:tasks.length,openManagerTasks:managerTasks.length,priorities:priorities.slice(0,8)};
}
