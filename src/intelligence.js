import{financeTotals,stockAvailable,calculateRecipeCost,haccpReadingStatus,localDate,dailyRoutineStatus}from'./store.js';

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

function clockWorkedHours(row,now=new Date()){
  const clockIn=new Date(row?.clockIn||''),stop=row?.clockOut?new Date(row.clockOut):new Date(now);
  if(Number.isNaN(clockIn.getTime())||Number.isNaN(stop.getTime())||stop<=clockIn)return 0;
  let breakMinutes=0;for(const pause of row?.breaks||[]){const pa=new Date(pause?.start||''),pb=pause?.end?new Date(pause.end):new Date(now);if(!Number.isNaN(pa.getTime())&&!Number.isNaN(pb.getTime())&&pb>pa)breakMinutes+=(pb-pa)/60000}
  return Math.max(0,(stop-clockIn)/3600000-breakMinutes/60);
}
function shiftBounds(shift){
  const start=new Date(String(shift?.date||'')+'T'+String(shift?.start||'00:00')+':00'),end=new Date(String(shift?.date||'')+'T'+String(shift?.end||'00:00')+':00');
  if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime()))return null;if(end<=start)end.setDate(end.getDate()+1);return{start,end};
}
export function actualLabor(state,now=new Date(),days=7){
  const end=new Date(now),start=new Date(end);start.setDate(start.getDate()-Math.max(1,Math.trunc(days))+1);start.setHours(0,0,0,0);
  const members=new Map((state?.team||[]).map(x=>[String(x.name||'').trim().toLocaleLowerCase(),x]));let hours=0,cost=0;const rows=[];
  for(const row of state?.timeClock||[]){const clockIn=new Date(row?.clockIn||'');if(Number.isNaN(clockIn.getTime())||clockIn<start||clockIn>end)continue;
    const worked=clockWorkedHours(row,end),grossWithoutBreak=clockWorkedHours({...row,breaks:[]},end),member=members.get(String(row.employee||'').trim().toLocaleLowerCase()),rate=n(member?.hourlyRate||member?.hourlyCost),amount=worked*rate;
    hours+=worked;cost+=amount;rows.push({employee:String(row.employee||''),clockIn:clockIn.toISOString(),clockOut:row.clockOut||'',hours:round(worked,2),breakHours:round(Math.max(0,grossWithoutBreak-worked),2),rate,cost:round(amount,2),open:row.status==='open'});
  }
  return{days:Math.max(1,Math.trunc(days)),hours:round(hours,2),cost:round(cost,2),rows:rows.sort((x,y)=>y.clockIn.localeCompare(x.clockIn)),open:rows.filter(x=>x.open).length}
}

export function workforceVariance(state,now=new Date(),days=7){
  const end=new Date(now),start=new Date(end);start.setDate(start.getDate()-Math.max(1,Math.trunc(days))+1);start.setHours(0,0,0,0);
  const members=new Map((state?.team||[]).map(x=>[String(x.name||'').trim().toLocaleLowerCase(),x])),groups=new Map();
  const keyOf=(employee,date)=>String(employee||'').trim().toLocaleLowerCase()+'|'+date;
  for(const shift of state?.shifts||[]){const bounds=shiftBounds(shift);if(!bounds||bounds.start<start||bounds.start>end)continue;const employee=String(shift.employee||'').trim(),date=String(shift.date||''),key=keyOf(employee,date),group=groups.get(key)||{employee,date,shifts:[],clocks:[]};group.shifts.push({...shift,bounds});groups.set(key,group)}
  for(const clock of state?.timeClock||[]){const clockIn=new Date(clock?.clockIn||'');if(Number.isNaN(clockIn.getTime())||clockIn<start||clockIn>end)continue;const employee=String(clock.employee||'').trim(),date=localDate(clockIn),key=keyOf(employee,date),group=groups.get(key)||{employee,date,shifts:[],clocks:[]};group.clocks.push(clock);groups.set(key,group)}
  const rows=[];for(const group of groups.values()){
    group.shifts.sort((x,y)=>x.bounds.start-y.bounds.start);group.clocks.sort((x,y)=>new Date(x.clockIn)-new Date(y.clockIn));
    const plannedHours=group.shifts.reduce((sum,x)=>sum+shiftDurationHours(x.start,x.end),0),actualHours=group.clocks.reduce((sum,x)=>sum+clockWorkedHours(x,end),0),member=members.get(group.employee.toLocaleLowerCase()),rate=n(member?.hourlyRate||member?.hourlyCost),startedShifts=group.shifts.filter(x=>x.bounds.start<=end),firstShift=startedShifts[0],firstClock=group.clocks[0],lateMinutes=firstShift&&firstClock?Math.max(0,Math.round((new Date(firstClock.clockIn)-firstShift.bounds.start)/60000)):0,missingClockIn=!!firstShift&&!firstClock&&end-firstShift.bounds.start>15*60000;
    rows.push({employee:group.employee,date:group.date,plannedHours:round(plannedHours,2),actualHours:round(actualHours,2),varianceHours:round(actualHours-plannedHours,2),extraVsPlanHours:round(Math.max(0,actualHours-plannedHours),2),lateMinutes,missingClockIn,plannedCost:round(plannedHours*rate,2),actualCost:round(actualHours*rate,2),rate});
  }
  rows.sort((x,y)=>y.date.localeCompare(x.date)||x.employee.localeCompare(y.employee));
  const weeklyLimit=Math.max(1,n(state?.payrollSettings?.ccnt?.weeklyHours)||42),employeeActual=new Map();
  for(const row of rows)employeeActual.set(row.employee,round((employeeActual.get(row.employee)||0)+row.actualHours,2));
  const weeklyOvertime=[...employeeActual].map(([employee,hours])=>({employee,hours,overtimeHours:round(Math.max(0,hours-weeklyLimit),2)})).filter(x=>x.overtimeHours>0).sort((x,y)=>y.overtimeHours-x.overtimeHours);
  const sum=key=>round(rows.reduce((total,row)=>total+n(row[key]),0),2);
  return{days:Math.max(1,Math.trunc(days)),weeklyLimit,rows,plannedHours:sum('plannedHours'),actualHours:sum('actualHours'),varianceHours:sum('varianceHours'),extraVsPlanHours:sum('extraVsPlanHours'),plannedCost:sum('plannedCost'),actualCost:sum('actualCost'),lateArrivals:rows.filter(x=>x.lateMinutes>=5).length,missingClockIns:rows.filter(x=>x.missingClockIn).length,weeklyOvertimeHours:round(weeklyOvertime.reduce((s,x)=>s+x.overtimeHours,0),2),weeklyOvertime}
}

export function laborForecast(state,now=new Date(),days=7){
  const history=(state?.financeHistory||[]).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(String(x?.date||''))).sort((x,y)=>String(x.date).localeCompare(String(y.date))),byDow=new Map(),byMonth=new Map();
  let allCovers=0,allRevenue=0,allCount=0;
  for(const row of history){const d=new Date(String(row.date)+'T12:00:00');if(Number.isNaN(d.getTime()))continue;const sample={covers:n(row.covers),revenue:n(row.revenue),date:String(row.date)},dow=d.getDay(),month=d.getMonth(),dowBucket=byDow.get(dow)||[],monthBucket=byMonth.get(month)||[];dowBucket.push(sample);monthBucket.push(sample);byDow.set(dow,dowBucket);byMonth.set(month,monthBucket);allCovers+=sample.covers;allRevenue+=sample.revenue;allCount++}
  const overallCovers=allCount?allCovers/allCount:0,signals=Array.isArray(state?.forecastSignals)?state.forecastSignals:[];
  const rows=[];for(let i=0;i<Math.max(1,Math.trunc(days));i++){
    const day=new Date(now);day.setHours(12,0,0,0);day.setDate(day.getDate()+i);const date=localDate(day),hist=(byDow.get(day.getDay())||[]).slice(-12),monthHist=byMonth.get(day.getMonth())||[],histCovers=hist.length?hist.reduce((sum,x)=>sum+x.covers,0)/hist.length:0,histRevenue=hist.length?hist.reduce((sum,x)=>sum+x.revenue,0)/hist.length:0,monthCovers=monthHist.length?monthHist.reduce((sum,x)=>sum+x.covers,0)/monthHist.length:0,seasonFactor=monthHist.length>=3&&overallCovers>0?Math.max(.75,Math.min(1.35,monthCovers/overallCovers)):1,reservations=(state?.reservations||[]).filter(x=>String(x.time||'').slice(0,10)===date&&!['cancelled','noShow'].includes(x.status)),reservedCovers=reservations.reduce((sum,x)=>sum+n(x.covers),0),daySignals=signals.filter(x=>x.date===date),signalFactor=Math.max(.5,Math.min(1.75,daySignals.reduce((factor,x)=>factor*(1+n(x.impactPct)/100),1))),adjustedHistorical=Math.max(0,histCovers*seasonFactor*signalFactor),forecastCovers=Math.max(Math.round(adjustedHistorical),reservedCovers),avgSpend=histCovers>0?histRevenue/histCovers:(allCovers>0?allRevenue/allCovers:0),forecastRevenue=round(forecastCovers*avgSpend,2),recommendedHours=round(Math.max(forecastCovers?4:0,forecastCovers*.22),1),recommendedStaff=forecastCovers?Math.max(1,Math.ceil(recommendedHours/6)):0,scheduled=(state?.shifts||[]).filter(x=>x.date===date).reduce((sum,x)=>sum+shiftDurationHours(x.start,x.end),0),gap=round(recommendedHours-scheduled,1);
    rows.push({date,forecastCovers,forecastRevenue,reservedCovers,recommendedHours,recommendedStaff,scheduledHours:round(scheduled,1),gap,historySamples:hist.length,seasonFactor:round(seasonFactor,2),signalFactor:round(signalFactor,2),signals:daySignals.map(x=>({type:String(x.type||'manual'),impactPct:n(x.impactPct),note:String(x.note||'')})),confidence:hist.length>=6?'high':hist.length>=3?'medium':'low'})
  }
  return{rows,understaffed:rows.filter(x=>x.gap>1).length,overstaffed:rows.filter(x=>x.gap<-2).length}
}

export function availabilityConflicts(state,now=new Date(),days=14){
  const start=localDate(now),endDate=new Date(now);endDate.setDate(endDate.getDate()+Math.max(1,Math.trunc(days)));const end=localDate(endDate),rows=[];
  for(let index=0;index<(state?.shifts||[]).length;index++){const shift=state.shifts[index];if(String(shift.date||'')<start||String(shift.date||'')>=end)continue;const blocks=(state?.availability||[]).filter(x=>x.employee===shift.employee&&x.date===shift.date&&x.status==='unavailable');if(blocks.length)rows.push({index,shift,blocks})}
  return{rows,count:rows.length}
}

export function recipePortfolio(state){
  const target=Math.max(0,n(state?.recipeTarget)||30),warning=Math.max(target,n(state?.recipeWarning)||35),items=[];
  for(const recipe of state?.recipes||[]){const metrics=calculateRecipeCost(state,recipe)||null,costPerPortion=metrics?metrics.costPerPortion:n(recipe?.costPerPortion??recipe?.cost),netPrice=metrics?metrics.netPrice:n(recipe?.price),foodCostPercent=metrics?metrics.foodCostPercent:(netPrice?costPerPortion/netPrice*100:0),margin=metrics?metrics.margin:netPrice-costPerPortion,vatRate=n(recipe?.vatRate),suggestedNet=target>0?costPerPortion/(target/100):0,suggestedPrice=suggestedNet*(1+vatRate/100);items.push({name:String(recipe?.name||''),foodCostPercent:round(foodCostPercent,1),costPerPortion:round(costPerPortion,2),netPrice:round(netPrice,2),margin:round(margin,2),suggestedPrice:round(suggestedPrice,2),status:foodCostPercent<=target?'good':foodCostPercent<=warning?'warning':'bad'})}
  const average=items.length?items.reduce((sum,x)=>sum+x.foodCostPercent,0)/items.length:0;return{target,warning,averageFoodCost:round(average,1),aboveTarget:items.filter(x=>x.foodCostPercent>target).length,critical:items.filter(x=>x.foodCostPercent>warning).length,items};
}

export function stockConsumptionRate(state,stockId,now=new Date(),days=28){
  const id=String(stockId||''),span=Math.max(1,Math.trunc(days)),start=new Date(now);start.setDate(start.getDate()-span);let consumed=0,samples=0;
  for(const move of state?.stockMoves||[]){if(String(move?.stockId||'')!==id)continue;const raw=move?.at||move?.createdAt||move?.created_at||move?.date,when=raw?new Date(raw):null;if(!when||Number.isNaN(when.getTime())||when<start||when>now)continue;const delta=n(move?.delta);if(delta<0){consumed+=Math.abs(delta);samples++}else if(String(move?.type||move?.kind||'')==='exit'){const q=n(move?.quantity||move?.quantity_delta);if(q>0){consumed+=q;samples++}}}
  return{days:span,consumed:round(consumed,3),avgDaily:round(consumed/span,4),samples}
}
export function reorderSuggestions(state,now=new Date()){return(state?.stock||[]).map(item=>{const available=n(stockAvailable(state,item)),minimum=Math.max(0,n(item?.min)),consumption=stockConsumptionRate(state,item?.id,now,28),supplierName=latestSupplierForStock(state,item?.id),supplier=(state?.suppliers||[]).find(x=>String(x.name||'')===supplierName),leadTimeDays=Math.max(0,Math.min(90,n(supplier?.leadTimeDays)||3)),safetyDays=Math.max(0,Math.min(60,n(item?.safetyDays)||2)),dynamicPoint=consumption.avgDaily*(leadTimeDays+safetyDays),reorderPoint=Math.max(minimum,dynamicPoint);if(reorderPoint<=0||available>reorderPoint)return null;const cycleDays=7,target=Math.max(n(item?.reorderTarget),minimum*2,reorderPoint+consumption.avgDaily*cycleDays),quantity=Math.max(0,target-available),daysCover=consumption.avgDaily>0?available/consumption.avgDaily:null;return{stockId:String(item?.id||''),name:String(item?.name||''),unit:String(item?.unit||''),available:round(available,3),minimum:round(minimum,3),reorderPoint:round(reorderPoint,3),target:round(target,3),quantity:round(quantity,3),estimatedCost:round(quantity*n(item?.price),2),avgDaily:consumption.avgDaily,consumption28d:consumption.consumed,consumptionSamples:consumption.samples,leadTimeDays,safetyDays,daysCover:daysCover==null?null:round(daysCover,1)}}).filter(Boolean).sort((a,b)=>(a.daysCover??9999)-(b.daysCover??9999)||(a.available-a.reorderPoint)-(b.available-b.reorderPoint))}

export function supplierPriceAlerts(state,threshold=.08){
  const grouped=new Map();for(const point of state?.priceHistory||[]){const key=String(point?.stockId||point?.product||'').trim();if(!key)continue;const list=grouped.get(key)||[];list.push(point);grouped.set(key,list)}
  const alerts=[];for(const list of grouped.values()){list.sort((a,b)=>String(b?.recordedAt||b?.date||'').localeCompare(String(a?.recordedAt||a?.date||'')));const latest=list[0],previous=list[1],before=n(previous?.unitPrice)||n(latest?.previousPrice),after=n(latest?.unitPrice);if(before<=0||after<=0)continue;const change=(after-before)/before;if(Math.abs(change)<Math.max(0,threshold))continue;alerts.push({stockId:String(latest.stockId||''),product:String(latest.product||''),supplier:String(latest.supplier||''),unit:String(latest.unit||''),before:round(before,4),after:round(after,4),changePct:round(change*100,1),date:String(latest.date||''),reference:String(latest.reference||'')})}
  return alerts.sort((a,b)=>Math.abs(b.changePct)-Math.abs(a.changePct));
}

function latestSupplierForStock(state,stockId){
  const id=String(stockId||''),item=(state?.stock||[]).find(x=>String(x?.id||'')===id),preferred=String(item?.preferredSupplier||'').trim();
  if(preferred)return preferred;
  const prices=(state?.priceHistory||[]).filter(x=>String(x?.stockId||'')===id&&String(x?.supplier||'').trim()).sort((a,b)=>String(b?.recordedAt||b?.date||'').localeCompare(String(a?.recordedAt||a?.date||'')));
  if(prices[0])return String(prices[0].supplier).trim();
  const deliveries=(state?.deliveries||[]).filter(x=>String(x?.stockId||'')===id&&String(x?.supplier||'').trim()).sort((a,b)=>String(b?.date||'').localeCompare(String(a?.date||'')));
  return deliveries[0]?String(deliveries[0].supplier).trim():'';
}

export function suggestedSupplierForStock(state,stockId){return latestSupplierForStock(state,stockId)}

export function purchasePlan(state){
  const groups=new Map(),items=reorderSuggestions(state);
  for(const item of items){
    const supplier=latestSupplierForStock(state,item.stockId),stockItem=(state?.stock||[]).find(x=>String(x?.id||'')===String(item.stockId)),preferred=String(stockItem?.preferredSupplier||'').trim(),key=supplier||'__unassigned__',row={...item,supplier,supplierSource:preferred?'preferred':supplier?'history':'unassigned'};
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
    const all=[...bucket.values()].sort((a,b)=>String(b?.recordedAt||b?.date||'').localeCompare(String(a?.recordedAt||a?.date||''))),current=all[0];
    if(!current)continue;
    const currentUnit=String(current.unit||'').trim().toLocaleLowerCase(),offers=[...bucket.values()].map(x=>({supplier:String(x.supplier),price:n(x.unitPrice),date:String(x.date||''),recordedAt:String(x.recordedAt||''),unit:String(x.unit||'')})).filter(x=>String(x.unit||'').trim().toLocaleLowerCase()===currentUnit).sort((a,b)=>a.price-b.price);
    if(offers.length<2)continue;
    const best=offers[0];
    if(!best||String(current.supplier)===best.supplier||n(current.unitPrice)<=best.price)continue;
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


function financeRangeTotals(state,startDate,endDate){
  const start=localDate(startDate),end=localDate(endDate),rows=(state?.financeHistory||[]).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(String(x?.date||''))&&x.date>=start&&x.date<=end);
  return rows.reduce((out,row)=>(out.revenue+=n(row.revenue),out.expenses+=n(row.expenses),out.covers+=n(row.covers),out),{revenue:0,expenses:0,covers:0,rows});
}
function pctDelta(current,previous){if(previous===0)return current===0?0:null;return round((current-previous)/Math.abs(previous)*100,1)}
export function financeTrend(state,now=new Date()){
  const currentEnd=atMidnight(now),currentStart=new Date(currentEnd);currentStart.setDate(currentStart.getDate()-(currentStart.getDay()+6)%7);
  const previousStart=new Date(currentStart);previousStart.setDate(previousStart.getDate()-7);
  const previousEnd=new Date(currentEnd);previousEnd.setDate(previousEnd.getDate()-7);
  const current=financeRangeTotals(state,currentStart,currentEnd),previous=financeRangeTotals(state,previousStart,previousEnd);
  const currentAvg=current.covers?current.revenue/current.covers:0,previousAvg=previous.covers?previous.revenue/previous.covers:0,currentExpenseRatio=current.revenue?current.expenses/current.revenue*100:0,previousExpenseRatio=previous.revenue?previous.expenses/previous.revenue*100:0;
  return{
    current:{revenue:round(current.revenue,2),expenses:round(current.expenses,2),covers:round(current.covers,0),result:round(current.revenue-current.expenses,2),avgTicket:round(currentAvg,2),expenseRatio:round(currentExpenseRatio,1)},
    previous:{revenue:round(previous.revenue,2),expenses:round(previous.expenses,2),covers:round(previous.covers,0),result:round(previous.revenue-previous.expenses,2),avgTicket:round(previousAvg,2),expenseRatio:round(previousExpenseRatio,1)},
    delta:{revenuePct:pctDelta(current.revenue,previous.revenue),expensesPct:pctDelta(current.expenses,previous.expenses),coversPct:pctDelta(current.covers,previous.covers),avgTicketPct:pctDelta(currentAvg,previousAvg),resultPct:pctDelta(current.revenue-current.expenses,previous.revenue-previous.expenses)},
    comparable:previous.rows.length>0,currentDays:current.rows.length,previousDays:previous.rows.length,
    currentRange:[localDate(currentStart),localDate(currentEnd)],previousRange:[localDate(previousStart),localDate(previousEnd)]
  };
}

export function trendSignals(state,now=new Date()){
  const trend=financeTrend(state,now),signals=[];
  if(!trend.comparable)return signals;
  const revenue=trend.delta.revenuePct,avg=trend.delta.avgTicketPct,expenses=trend.delta.expensesPct,covers=trend.delta.coversPct;
  if(revenue!=null&&Math.abs(revenue)>=5)signals.push({code:'revenueTrend',direction:revenue>0?'up':'down',value:revenue,severity:revenue<0?'warning':'good'});
  if(avg!=null&&Math.abs(avg)>=5)signals.push({code:'avgTicketTrend',direction:avg>0?'up':'down',value:avg,severity:avg<0?'warning':'good'});
  if(expenses!=null&&expenses>=10)signals.push({code:'expenseTrend',direction:'up',value:expenses,severity:'warning'});
  if(covers!=null&&Math.abs(covers)>=8)signals.push({code:'coversTrend',direction:covers>0?'up':'down',value:covers,severity:covers<0?'warning':'good'});
  return signals;
}

export function planningConflicts(state,now=new Date(),days=14){
  const start=localDate(now),endDate=new Date(now);endDate.setDate(endDate.getDate()+Math.max(1,Math.trunc(days)));const end=localDate(endDate),approved=(state?.leave||[]).filter(x=>x?.status==='approved'),rows=[];
  for(let index=0;index<(state?.shifts||[]).length;index++){const shift=state.shifts[index],date=String(shift?.date||''),employee=String(shift?.employee||'').trim();if(!employee||date<start||date>=end)continue;const leave=approved.find(x=>String(x?.employee||'').trim().toLocaleLowerCase()===employee.toLocaleLowerCase()&&String(x?.start||'')<=date&&String(x?.end||'')>=date);if(leave)rows.push({index,employee,date,start:String(shift?.start||''),end:String(shift?.end||''),leaveStart:String(leave.start||''),leaveEnd:String(leave.end||'')})}
  return{days:Math.max(1,Math.trunc(days)),rows,count:rows.length};
}

function allergenTokens(value){return[...new Set(String(value||'').split(/[,;\/|]+/).map(x=>x.trim().toLocaleLowerCase()).filter(Boolean))].sort()}
export function allergenCoverage(state){
  const matrix=new Map((state?.allergens||[]).map((x,index)=>[String(x?.dish||'').trim().toLocaleLowerCase(),{index,dish:String(x?.dish||''),allergens:String(x?.allergens||''),note:String(x?.note||'')}]).filter(([key])=>key)),missing=[],mismatched=[],covered=[];
  for(let index=0;index<(state?.recipes||[]).length;index++){const recipe=state.recipes[index],name=String(recipe?.name||'').trim();if(!name)continue;const entry=matrix.get(name.toLocaleLowerCase()),recipeTokens=allergenTokens(recipe?.allergens);if(!entry){missing.push({recipeIndex:index,name,recipeAllergens:String(recipe?.allergens||''),canPrefill:recipeTokens.length>0});continue}const matrixTokens=allergenTokens(entry.allergens),same=recipeTokens.length===matrixTokens.length&&recipeTokens.every((x,i)=>x===matrixTokens[i]);if(!same)mismatched.push({recipeIndex:index,matrixIndex:entry.index,name,recipeAllergens:String(recipe?.allergens||''),matrixAllergens:entry.allergens});else covered.push({recipeIndex:index,matrixIndex:entry.index,name})}
  return{recipes:(state?.recipes||[]).length,matrixEntries:(state?.allergens||[]).length,covered:covered.length,missing,mismatched,issues:missing.length+mismatched.length,complete:(state?.recipes||[]).length>0&&missing.length===0&&mismatched.length===0};
}

export function trainingRenewalAlerts(state,now=new Date(),windowDays=30){
  const today=atMidnight(now),limit=Math.max(0,Math.trunc(windowDays)),rows=[];
  for(let index=0;index<(state?.training||[]).length;index++){const item=state.training[index],validUntil=String(item?.validUntil||'');if(item?.status!=='completed'||!/^\d{4}-\d{2}-\d{2}$/.test(validUntil))continue;const expiry=atMidnight(validUntil);if(Number.isNaN(expiry.getTime()))continue;const days=Math.ceil((expiry-today)/dayMs);if(days>limit)continue;rows.push({index,employee:String(item?.employee||''),topic:String(item?.topic||''),validUntil,days,severity:days<0?'urgent':days<=7?'warning':'info',expired:days<0,sourceId:[item?.employee,item?.topic,validUntil].map(routineToken=>String(routineToken||'').trim().toLocaleLowerCase()).join('|')})}
  const rank={urgent:0,warning:1,info:2};return rows.sort((a,b)=>(rank[a.severity]-rank[b.severity])||a.days-b.days||a.employee.localeCompare(b.employee));
}
export function trainingRenewalTaskDrafts(state,now=new Date()){
  const existing=new Set((state?.managerTasks||[]).filter(x=>x?.source==='training'&&x?.sourceId).map(x=>String(x.sourceId)));
  return trainingRenewalAlerts(state,now).filter(x=>!existing.has(x.sourceId)).map(x=>({title:'Formation · '+x.employee+' · '+x.topic,priority:x.expired?'urgent':x.days<=7?'high':'normal',due:x.validUntil,owner:x.employee,status:'todo',note:x.expired?'Formation expirée':'Renouvellement à prévoir',source:'training',sourceId:x.sourceId}));
}

export function planningReplacementCandidates(state,conflict){
  const date=String(conflict?.date||''),start=String(conflict?.start||''),end=String(conflict?.end||''),absent=String(conflict?.employee||'').trim(),members=state?.team||[],absentMember=members.find(x=>String(x?.name||'').trim().toLocaleLowerCase()===absent.toLocaleLowerCase()),role=String(absentMember?.role||'').trim().toLocaleLowerCase();
  if(!date||!start||!end)return[];
  const from=timeMinutes(start),to=timeMinutes(end);if(from==null||to==null)return[];
  const overlaps=(aStart,aEnd)=>{const a=timeMinutes(aStart),b=timeMinutes(aEnd);if(a==null||b==null)return false;const spans=x=>x[1]>=x[0]?[x]:[[x[0],1440],[0,x[1]]],target=spans([from,to]),other=spans([a,b]);return target.some(x=>other.some(y=>Math.max(x[0],y[0])<Math.min(x[1],y[1])))};
  const approved=(state?.leave||[]).filter(x=>x?.status==='approved'),hours=new Map(plannedLabor(state,new Date(date+'T12:00:00'),7).byEmployee.map(x=>[String(x.employee||'').toLocaleLowerCase(),x.hours]));
  return members.map(member=>{const name=String(member?.name||'').trim(),key=name.toLocaleLowerCase();if(!name||key===absent.toLocaleLowerCase())return null;const onLeave=approved.some(x=>String(x?.employee||'').trim().toLocaleLowerCase()===key&&String(x?.start||'')<=date&&String(x?.end||'')>=date);if(onLeave)return null;const busy=(state?.shifts||[]).some(x=>String(x?.date||'')===date&&String(x?.employee||'').trim().toLocaleLowerCase()===key&&overlaps(String(x?.start||''),String(x?.end||'')));if(busy)return null;const memberRole=String(member?.role||'').trim();return{name,role:memberRole,sameRole:!!role&&memberRole.toLocaleLowerCase()===role,plannedHours:n(hours.get(key))}}).filter(Boolean).sort((a,b)=>Number(b.sameRole)-Number(a.sameRole)||a.plannedHours-b.plannedHours||a.name.localeCompare(b.name));
}

export function rejectedDeliveryAttention(state){
  const existing=new Set((state?.managerTasks||[]).filter(x=>x?.source==='delivery'&&x?.sourceId).map(x=>String(x.sourceId))),rows=[];
  for(let index=0;index<(state?.deliveries||[]).length;index++){const item=state.deliveries[index];if(String(item?.status||'accepted')!=='rejected')continue;const sourceId=[String(item?.supplier||''),String(item?.stockId||item?.product||''),String(item?.date||''),String(item?.lot||''),String(item?.qty||'')].join('|').toLocaleLowerCase();rows.push({index,sourceId,supplier:String(item?.supplier||''),product:String(item?.product||''),date:String(item?.date||''),lot:String(item?.lot||''),qty:n(item?.qty),temperature:String(item?.temperature??''),taskExists:existing.has(sourceId)})}
  return{rows,count:rows.length,withoutTask:rows.filter(x=>!x.taskExists).length};
}
export function rejectedDeliveryTaskDrafts(state,now=new Date()){
  return rejectedDeliveryAttention(state).rows.filter(x=>!x.taskExists).map(x=>({title:'Livraison refusée · '+(x.product||x.supplier||'Fournisseur'),priority:'high',due:localDate(now),owner:'',status:'todo',note:[x.supplier,x.date,x.lot?('Lot '+x.lot):'',x.temperature!==''?(x.temperature+' °C'):''].filter(Boolean).join(' · '),source:'delivery',sourceId:x.sourceId}));
}

export function reservationAttention(state,now=new Date(),hours=24){
  const configured=Math.max(1,n(state?.reservationSettings?.reminderHours)||n(hours)||24),start=now.getTime(),end=start+configured*3600000,rows=[];
  for(let index=0;index<(state?.reservations||[]).length;index++){const item=state.reservations[index],status=String(item?.status||'booked');if(status!=='booked')continue;const when=new Date(String(item?.time||''));if(Number.isNaN(when.getTime())||when.getTime()<start||when.getTime()>end)continue;rows.push({index,id:String(item?.id||''),name:String(item?.name||''),time:String(item?.time||''),covers:n(item?.covers),hoursUntil:round((when.getTime()-start)/3600000,1),status,reminderSentAt:String(item?.reminderSentAt||''),needsReminder:!item?.reminderSentAt})}
  return{hours:configured,rows,count:rows.length,needsReminder:rows.filter(x=>x.needsReminder).length,covers:round(rows.reduce((sum,x)=>sum+x.covers,0),0)};
}

export function serviceReadiness(state,now=new Date(),days=7){
  const start=atMidnight(now),span=Math.max(1,Math.trunc(days)),rows=[];
  for(let offset=0;offset<span;offset++){const d=new Date(start.getTime()+offset*dayMs),date=localDate(d),reservations=(state?.reservations||[]).filter(x=>String(x?.time||'').slice(0,10)===date&&!['cancelled','noShow'].includes(String(x?.status||'booked'))),covers=reservations.reduce((sum,x)=>sum+n(x?.covers),0),shifts=(state?.shifts||[]).filter(x=>String(x?.date||'')===date),employees=[...new Set(shifts.map(x=>String(x?.employee||'').trim()).filter(Boolean))];if(!reservations.length&&!shifts.length)continue;rows.push({date,reservations:reservations.length,covers:round(covers,0),shifts:shifts.length,employees,staffCount:employees.length,uncovered:covers>0&&employees.length===0})}
  const uncovered=rows.filter(x=>x.uncovered);return{days:span,rows,uncovered,count:rows.length,uncoveredCount:uncovered.length,next:rows.find(x=>x.reservations>0)||null};
}

export function managementOutlook(state,now=new Date()){
  const finance=financeTotals(state,'week',now),labor=plannedLabor(state,now,7),purchases=purchasePlan(state),payables=invoicePayables(state,now,7),currentResult=finance.revenue-finance.expenses,plannedCommitments=labor.cost+purchases.estimatedCost,supplierNeeds7d=payables.overdueAmount+payables.dueSoonAmount+purchases.estimatedCost;
  return{weekRevenue:round(finance.revenue,2),weekExpenses:round(finance.expenses,2),currentResult:round(currentResult,2),plannedLaborCost:round(labor.cost,2),reorderBudget:round(purchases.estimatedCost,2),plannedCommitments:round(plannedCommitments,2),commitmentsToRevenuePct:finance.revenue?round(plannedCommitments/finance.revenue*100,1):0,supplierInvoicesDue7d:round(payables.overdueAmount+payables.dueSoonAmount,2),supplierNeeds7d:round(supplierNeeds7d,2),supplierNeedsToRevenuePct:finance.revenue?round(supplierNeeds7d/finance.revenue*100,1):0};
}

export function haccpRoutinePresets(state,limit=8){
  const rows=[...(state?.temps||[])].sort((a,b)=>String(b?.recordedAt||b?.date||'').localeCompare(String(a?.recordedAt||a?.date||''))),seen=new Set(),out=[];
  for(const row of rows){const equipment=String(row?.equipment||'').trim(),zone=String(row?.zone||'').trim(),key=(zone+'|'+equipment).toLocaleLowerCase();if(!equipment||seen.has(key))continue;seen.add(key);out.push({zone,equipment,min:row?.min??'',max:row?.max??'',responsible:String(row?.responsible||''),lastValue:n(row?.value),lastRecordedAt:String(row?.recordedAt||row?.date||'')});if(out.length>=Math.max(1,Math.trunc(limit)))break}
  return out;
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

export function closingControl(state,now=new Date()){
  const day=localDate(now),routines=dailyRoutineStatus(state,now),haccpIssues=openHaccpIssues(state).length,openOrders=(state?.orders||[]).filter(x=>String(x?.date||x?.dateTime||'').slice(0,10)===day&&!['paid','cancelled'].includes(String(x?.status||''))).length,blockers=routines.closing.pending+haccpIssues,ready=routines.closing.total>0&&blockers===0;
  return{day,ready,blockers,closingTotal:routines.closing.total,closingDone:routines.closing.done,closingPending:routines.closing.pending,haccpIssues,openOrders,warnings:openOrders};
}

export function serviceBriefingData(state,now=new Date()){
  const day=localDate(now),shifts=(state?.shifts||[]).filter(x=>String(x?.date||'')===day).map(x=>({employee:String(x.employee||''),start:String(x.start||''),end:String(x.end||'')})),reservations=(state?.reservations||[]).filter(x=>String(x?.time||'').slice(0,10)===day&&!['cancelled','noShow'].includes(String(x?.status||'booked'))),covers=reservations.reduce((sum,x)=>sum+n(x?.covers),0),haccpIssues=openHaccpIssues(state).length,lowStock=reorderSuggestions(state).length,routines=dailyRoutineStatus(state,now),openTasks=routines.pending,urgentTasks=(state?.managerTasks||[]).filter(x=>x?.status!=='done'&&x?.priority==='urgent').length;
  return{day,shifts,reservations:reservations.length,covers:round(covers,0),haccpIssues,lowStock,openTasks,urgentTasks,routines,meaningful:!!(shifts.length||reservations.length||haccpIssues||lowStock||openTasks||urgentTasks)};
}

export function equipmentAttention(state,now=new Date(),windowDays=30){
  const today=atMidnight(now),out=[];
  for(let index=0;index<(state?.equipment||[]).length;index++){
    const item=state.equipment[index],name=String(item?.name||'').trim();if(!name)continue;
    const status=String(item?.status||'operational'),rawDate=String(item?.serviceDate||''),serviceDate=/^\d{4}-\d{2}-\d{2}$/.test(rawDate)?atMidnight(rawDate):null,days=serviceDate&&!Number.isNaN(serviceDate.getTime())?Math.ceil((serviceDate-today)/dayMs):null;
    let severity='',reason='';
    if(status==='outOfService'){severity='urgent';reason='outOfService'}
    else if(status==='serviceDue'){severity='warning';reason='serviceDue'}
    else if(days!=null&&days<0){severity='warning';reason='overdue'}
    else if(days!=null&&days<=Math.max(0,Math.trunc(windowDays))){severity='info';reason='upcoming'}
    if(!severity)continue;
    out.push({index,name,location:String(item?.location||''),status,serviceDate:rawDate,days,severity,reason,sourceId:[name,String(item?.location||'')].join('|').toLocaleLowerCase()});
  }
  const rank={urgent:0,warning:1,info:2};return out.sort((a,b)=>(rank[a.severity]-rank[b.severity])||((a.days??9999)-(b.days??9999))||a.name.localeCompare(b.name));
}

export function maintenanceTaskDrafts(state,now=new Date()){
  const existing=new Set((state?.managerTasks||[]).filter(x=>x?.source==='equipment'&&x?.sourceId).map(x=>String(x.sourceId)));
  return equipmentAttention(state,now).filter(item=>!existing.has(item.sourceId)).map(item=>({title:'Maintenance · '+item.name,priority:item.severity==='urgent'?'urgent':item.severity==='warning'?'high':'normal',due:item.serviceDate&&item.days!=null&&item.days>=0?item.serviceDate:localDate(now),owner:'',status:'todo',note:[item.location,item.reason,item.serviceDate].filter(Boolean).join(' · '),source:'equipment',sourceId:item.sourceId}));
}

export function wasteInsights(state,now=new Date(),days=7){
  const span=Math.max(1,Math.trunc(days)),end=new Date(atMidnight(now).getTime()+dayMs),start=new Date(end.getTime()-span*dayMs),previousStart=new Date(start.getTime()-span*dayMs),stock=new Map((state?.stock||[]).map(x=>[String(x.id||''),x]));
  const value=row=>{const qty=Math.max(0,n(row?.qty)),item=stock.get(String(row?.stockId||'')),unitPrice=Math.max(0,n(row?.unitPrice||item?.price));return round(qty*unitPrice,2)};
  const dated=(state?.waste||[]).map(row=>{const raw=String(row?.date||row?.recordedAt||'').slice(0,10),when=/^\d{4}-\d{2}-\d{2}$/.test(raw)?atMidnight(raw):null;return{row,when,cost:value(row)}}).filter(x=>x.when&&!Number.isNaN(x.when.getTime()));
  const current=dated.filter(x=>x.when>=start&&x.when<end),previous=dated.filter(x=>x.when>=previousStart&&x.when<start),totalCost=round(current.reduce((sum,x)=>sum+x.cost,0),2),previousCost=round(previous.reduce((sum,x)=>sum+x.cost,0),2),groups=new Map();
  for(const x of current){const row=x.row,key=String(row?.stockId||row?.product||''),item=stock.get(String(row?.stockId||'')),group=groups.get(key)||{stockId:String(row?.stockId||''),product:String(row?.product||item?.name||''),unit:String(item?.unit||''),qty:0,cost:0,count:0};group.qty+=Math.max(0,n(row?.qty));group.cost+=x.cost;group.count++;groups.set(key,group)}
  const products=[...groups.values()].map(x=>({...x,qty:round(x.qty,3),cost:round(x.cost,2)})).sort((a,b)=>b.cost-a.cost),changePct=previousCost>0?round((totalCost-previousCost)/previousCost*100,1):null;
  return{days:span,count:current.length,totalCost,previousCost,changePct,top:products.slice(0,5),meaningful:current.length>0};
}

export function invoicePayables(state,now=new Date(),days=7){
  const today=localDate(now),limit=new Date(now);limit.setDate(limit.getDate()+Math.max(0,Math.trunc(days)));const limitKey=localDate(limit),rows=(state?.invoices||[]).filter(x=>x?.status!=='paid').map(x=>{const dueDate=String(x?.dueDate||x?.date||''),amount=n(x?.amount);return{supplier:String(x?.supplier||''),reference:String(x?.reference||''),date:String(x?.date||''),dueDate,amount:round(amount,2),overdue:!!dueDate&&dueDate<today,dueSoon:!!dueDate&&dueDate>=today&&dueDate<=limitKey}}),overdue=rows.filter(x=>x.overdue),dueSoon=rows.filter(x=>x.dueSoon);
  return{rows,total:round(rows.reduce((s,x)=>s+x.amount,0),2),overdueCount:overdue.length,overdueAmount:round(overdue.reduce((s,x)=>s+x.amount,0),2),dueSoonCount:dueSoon.length,dueSoonAmount:round(dueSoon.reduce((s,x)=>s+x.amount,0),2),windowDays:Math.max(0,Math.trunc(days))};
}

export function weeklyManagerReviewData(state,now=new Date()){
  const trend=financeTrend(state,now),finance=financeTotals(state,'week',now),recipes=recipePortfolio(state),labor=plannedLabor(state,now,7),waste=wasteInsights(state,now,7),payables=invoicePayables(state,now,7),readiness=serviceReadiness(state,now,7),equipment=equipmentAttention(state,now),haccp=openHaccpIssues(state),result=finance.revenue-finance.expenses;
  const signals=[];for(const signal of trendSignals(state,now))signals.push(signal);if(recipes.critical)signals.push({code:'foodCost',severity:'warning',count:recipes.critical,value:recipes.averageFoodCost});if(waste.meaningful&&waste.changePct!=null&&waste.changePct>10)signals.push({code:'wasteTrend',severity:'warning',value:waste.changePct});if(readiness.uncoveredCount)signals.push({code:'serviceCoverage',severity:'warning',count:readiness.uncoveredCount});if(haccp.length)signals.push({code:'haccp',severity:'urgent',count:haccp.length});if(equipment.some(x=>x.severity==='urgent'))signals.push({code:'equipment',severity:'urgent',count:equipment.filter(x=>x.severity==='urgent').length});
  return{weekRevenue:round(finance.revenue,2),weekExpenses:round(finance.expenses,2),weekResult:round(result,2),covers:round(finance.covers,0),avgTicket:round(finance.covers?finance.revenue/finance.covers:0,2),trend,foodCostAverage:recipes.averageFoodCost,recipesAboveTarget:recipes.aboveTarget,plannedLaborCost:round(labor.cost,2),plannedLaborHours:round(labor.hours,2),wasteCost7d:waste.totalCost,wasteChangePct:waste.changePct,supplierInvoicesDue7d:round(payables.overdueAmount+payables.dueSoonAmount,2),uncoveredServices:readiness.uncoveredCount,haccpIssues:haccp.length,equipmentAttention:equipment.length,signals,meaningful:!!(finance.revenue||finance.expenses||finance.covers||waste.meaningful||payables.rows.length||readiness.rows.length||haccp.length||equipment.length)};
}

export function dailyManagerReportData(state,now=new Date()){
  const day=localDate(now),finance=(state?.financeHistory||[]).find(x=>String(x?.date||'')===day)||{},service=serviceBriefingData(state,now),trend=financeTrend(state,now),supplierSavings=supplierPriceOpportunities(state),waste=wasteInsights(state,now,7),recipes=recipePortfolio(state),payables=invoicePayables(state,now,7),openOrders=(state?.orders||[]).filter(x=>String(x?.date||x?.dateTime||'').slice(0,10)===day&&!['paid','cancelled'].includes(String(x?.status||''))).length,pendingInvoices=payables.rows.length,revenue=n(finance.revenue),expenses=n(finance.expenses),covers=n(finance.covers),result=revenue-expenses;
  const equipment=equipmentAttention(state,now),routines=dailyRoutineStatus(state,now),closing=closingControl(state,now);return{day,revenue:round(revenue,2),expenses:round(expenses,2),result:round(result,2),covers:round(covers,0),avgTicket:round(covers?revenue/covers:0,2),service,trend,routines,closing,payables,openOrders,pendingInvoices,haccpIssues:openHaccpIssues(state).length,lowStock:reorderSuggestions(state).length,urgentTasks:(state?.managerTasks||[]).filter(x=>x?.status!=='done'&&x?.priority==='urgent').length,supplierSavings:supplierSavings.length,waste7dCost:waste.totalCost,wasteItems:waste.count,equipmentAttention:equipment.length,outOfService:equipment.filter(x=>x.reason==='outOfService').length,foodCostAverage:recipes.averageFoodCost,meaningful:!!(revenue||expenses||covers||service.meaningful||openOrders||pendingInvoices||equipment.length||waste.meaningful)};
}

export function managerReadyActions(state,now=new Date()){
  const purchases=purchasePlan(state),haccpTasks=haccpCorrectiveTaskDrafts(state,now),maintenanceTasks=maintenanceTaskDrafts(state,now),trainingTasks=trainingRenewalTaskDrafts(state,now),deliveryTasks=rejectedDeliveryTaskDrafts(state,now),recipes=recipePortfolio(state),supplierSavings=supplierPriceOpportunities(state),payables=invoicePayables(state,now,7),supplierPayments={count:payables.overdueCount+payables.dueSoonCount,amount:round(payables.overdueAmount+payables.dueSoonAmount,2),overdueCount:payables.overdueCount,overdueAmount:payables.overdueAmount,dueSoonCount:payables.dueSoonCount,dueSoonAmount:payables.dueSoonAmount},briefing=serviceBriefingData(state,now),report=dailyManagerReportData(state,now),briefingNeeded=briefing.meaningful&&!(state?.briefings||[]).some(x=>String(x?.date||'')===briefing.day),dailyReportNeeded=report.meaningful&&now.getHours()>=17&&String(state?.preferences?.lastManagementReportDate||'')!==report.day;
  return{
    purchaseOrders:purchases.groups.filter(x=>x.supplier).map(x=>({supplier:x.supplier,items:x.items.length,estimatedCost:x.estimatedCost})),
    haccpTasks,
    maintenanceTasks,
    supplierPayments,
    supplierSavings,
    briefingNeeded,
    dailyReportNeeded,
    recipePriceUpdates:recipes.items.filter(x=>x.status==='bad'&&x.suggestedPrice>0).map(x=>({name:x.name,suggestedPrice:x.suggestedPrice,foodCostPercent:x.foodCostPercent}))
  };
}

export function onboardingHealth(state){const checks=[{key:'restaurant',done:!!String(state?.preferences?.restaurant||'').trim()},{key:'team',done:(state?.team||[]).length>0},{key:'stock',done:(state?.stock||[]).length>0},{key:'recipes',done:(state?.recipes||[]).length>0},{key:'haccp',done:(state?.temps||[]).length>0},{key:'finance',done:(state?.financeHistory||[]).some(x=>n(x?.revenue)>0||n(x?.covers)>0)}],done=checks.filter(x=>x.done).length;return{score:Math.round(done/checks.length*100),done,total:checks.length,missing:checks.filter(x=>!x.done).map(x=>x.key)}}
export function onboardingNextSteps(state){const health=onboardingHealth(state),routes={restaurant:'settings',stock:'purchases',team:'team',finance:'finance',haccp:'haccp',recipes:'recipes'},order=['restaurant','stock','team','finance','haccp','recipes'];return order.filter(key=>health.missing.includes(key)).map(key=>({key,page:routes[key]}))}

export function profitLeakCockpit(state,now=new Date()){
  const revenue=Math.max(0,n(financeTotals(state,'month',now).revenue)),menu=menuEngineering(state,now),labor=workforceVariance(state,now,30),waste=wasteInsights(state,now,30),suppliers=supplierPriceOpportunities(state),forecast=laborForecast(state,now,7);
  const target=Math.max(0,n(state?.recipeTarget)||30),foodCostExposure=round(menu.items.reduce((sum,item)=>{
    if(item.quantity<=0||item.netPrice<=0||item.foodCostPercent<=target)return sum;
    const targetCost=item.netPrice*(target/100),actualCost=Math.max(0,n(item.costPerPortion));return sum+Math.max(0,actualCost-targetCost)*item.quantity;
  },0),2);
  const laborOverrun=round(Math.max(0,labor.actualCost-labor.plannedCost),2);
  const inventoryVariance=round((state?.inventoryCounts||[]).filter(x=>x?.status==='closed'&&String(x.closedAt||'')>=new Date(now.getTime()-30*86400000).toISOString()).reduce((sum,x)=>sum+Math.max(0,n(x.absoluteVarianceValue)),0),2);
  const supplierOpportunity=round(suppliers.reduce((sum,x)=>sum+Math.max(0,n(x.potentialSaving)),0),2);
  const avgRate=(state?.team||[]).map(x=>n(x.hourlyRate||x.hourlyCost)).filter(x=>x>0),rate=avgRate.length?avgRate.reduce((a,b)=>a+b,0)/avgRate.length:0;
  const forecastStaffGap=round(forecast.rows.reduce((sum,x)=>sum+Math.max(0,n(x.gap))*rate,0),2);
  const signals=[
    {code:'foodCost',amount:foodCostExposure,count:menu.items.filter(x=>x.foodCostPercent>target&&x.quantity>0).length},
    {code:'laborOverrun',amount:laborOverrun,count:labor.rows.filter(x=>x.extraVsPlanHours>0).length},
    {code:'inventoryVariance',amount:inventoryVariance,count:(state?.inventoryCounts||[]).filter(x=>x?.status==='closed'&&n(x.absoluteVarianceValue)>0).length},
    {code:'supplierOpportunity',amount:supplierOpportunity,count:suppliers.length},
    {code:'waste',amount:round(waste.totalCost,2),count:waste.count},
    {code:'forecastStaffGap',amount:forecastStaffGap,count:forecast.rows.filter(x=>x.gap>1).length}
  ].map(x=>({...x,shareOfRevenue:revenue>0?round(x.amount/revenue*100,1):0,severity:x.amount<=0?'good':x.shareOfRevenue>=5?'urgent':x.shareOfRevenue>=2?'warning':'info'}));
  const totalExposure=round(signals.reduce((sum,x)=>sum+x.amount,0),2);
  return{windowDays:30,revenue,totalExposure,exposurePct:revenue>0?round(totalExposure/revenue*100,1):0,signals:signals.sort((a,b)=>b.amount-a.amount),components:{foodCostExposure,laborOverrun,inventoryVariance,supplierOpportunity,wasteCost:waste.totalCost,forecastStaffGap}};
}

function benchmarkWorkspaceState(root,restaurant){
  const workspace=restaurant?.id===root?.activeRestaurantId?root:(restaurant?.workspace&&typeof restaurant.workspace==='object'?restaurant.workspace:{});
  const arrays=['financeHistory','waste','stock','team','shifts','recipes','sales','orders','priceHistory','inventoryCounts','reservations','forecastSignals'];const normalized={...workspace};for(const key of arrays)if(!Array.isArray(normalized[key]))normalized[key]=[];return{...normalized,payrollSettings:normalized.payrollSettings||root?.payrollSettings||{},recipeTarget:normalized.recipeTarget??root?.recipeTarget,recipeWarning:normalized.recipeWarning??root?.recipeWarning};
}
export function multiRestaurantBenchmark(state,now=new Date()){
  const restaurants=Array.isArray(state?.restaurants)?state.restaurants:[],rows=[];
  for(const restaurant of restaurants){
    const site=benchmarkWorkspaceState(state,restaurant),finance=financeTotals(site,'week',now),waste=wasteInsights(site,now,7),labor=plannedLabor(site,now,7),recipes=recipePortfolio(site),result=finance.revenue-finance.expenses,avgTicket=finance.covers?finance.revenue/finance.covers:0;
    rows.push({id:String(restaurant.id||''),name:String(restaurant.name||'Restaurant'),revenue:round(finance.revenue,2),expenses:round(finance.expenses,2),result:round(result,2),covers:round(finance.covers,0),avgTicket:round(avgTicket,2),expenseRatio:finance.revenue?round(finance.expenses/finance.revenue*100,1):0,waste:round(waste.totalCost,2),plannedLaborCost:round(labor.cost,2),foodCost:round(recipes.averageFoodCost,1)});
  }
  const avg=key=>rows.length?round(rows.reduce((sum,x)=>sum+n(x[key]),0)/rows.length,key==='covers'?0:2):0,network={restaurants:rows.length,revenue:avg('revenue'),result:avg('result'),covers:avg('covers'),avgTicket:avg('avgTicket'),expenseRatio:avg('expenseRatio'),waste:avg('waste'),plannedLaborCost:avg('plannedLaborCost'),foodCost:avg('foodCost')};
  return{network,rows:rows.map(x=>({...x,revenueVsNetwork:network.revenue?round((x.revenue-network.revenue)/network.revenue*100,1):0,resultVsNetwork:network.result?round((x.result-network.result)/Math.abs(network.result)*100,1):0})).sort((a,b)=>b.revenue-a.revenue)};
}

export function managerSnapshot(state,now=new Date()){
  const supplierOpportunities=supplierPriceOpportunities(state),equipment=equipmentAttention(state,now),trainingRenewals=trainingRenewalAlerts(state,now),allergenStatus=allergenCoverage(state),reservationFollowUp=reservationAttention(state,now,24),rejectedDeliveries=rejectedDeliveryAttention(state),waste=wasteInsights(state,now,7),closing=closingControl(state,now),serviceReadiness7d=serviceReadiness(state,now,7),scheduleConflicts=planningConflicts(state,now,14),weeklyReview=weeklyManagerReviewData(state,now),readyActions=managerReadyActions(state,now),serviceBriefing=serviceBriefingData(state,now),trend=financeTrend(state,now),trendAlerts=trendSignals(state,now),finance={day:financeTotals(state,'day',now),week:financeTotals(state,'week',now),month:financeTotals(state,'month',now)},reorder=reorderSuggestions(state),priceAlerts=supplierPriceAlerts(state),purchases=purchasePlan(state),recipeImpacts=recipeSupplierImpacts(state),outlook=managementOutlook(state,now),haccp=openHaccpIssues(state),labor=plannedLabor(state,now,7),recipes=recipePortfolio(state),setup=onboardingHealth(state),setupSteps=onboardingNextSteps(state),today=localDate(now),payables=invoicePayables(state,now,7),overdueInvoices=payables.rows.filter(x=>x.overdue),tasks=(state?.tasks||[]).filter(x=>!x[1]),managerTasks=(state?.managerTasks||[]).filter(x=>x.status!=='done'),priorities=[];
  if(haccp.length)priorities.push({code:'haccp',severity:'urgent',count:haccp.length});if(rejectedDeliveries.count)priorities.push({code:'rejectedDelivery',severity:'warning',count:rejectedDeliveries.count});if(reservationFollowUp.count)priorities.push({code:'reservationConfirmation',severity:'info',count:reservationFollowUp.count});if(allergenStatus.issues)priorities.push({code:'allergenCoverage',severity:'warning',count:allergenStatus.issues});if(trainingRenewals.length)priorities.push({code:'trainingRenewal',severity:trainingRenewals.some(x=>x.expired)?'urgent':trainingRenewals.some(x=>x.days<=7)?'warning':'info',count:trainingRenewals.length});if(scheduleConflicts.count)priorities.push({code:'planningConflict',severity:'urgent',count:scheduleConflicts.count});if(serviceReadiness7d.uncoveredCount)priorities.push({code:'serviceCoverage',severity:'warning',count:serviceReadiness7d.uncoveredCount});if(equipment.length)priorities.push({code:'equipment',severity:equipment.some(x=>x.severity==='urgent')?'urgent':equipment.some(x=>x.severity==='warning')?'warning':'info',count:equipment.length});if(overdueInvoices.length)priorities.push({code:'overdueInvoices',severity:'warning',count:overdueInvoices.length});if(reorder.length)priorities.push({code:'stock',severity:'warning',count:reorder.length,value:round(reorder.reduce((sum,x)=>sum+x.estimatedCost,0),2)});const rising=priceAlerts.filter(x=>x.changePct>0);if(rising.length)priorities.push({code:'supplierPrice',severity:'warning',count:rising.length,value:rising[0]?.changePct||0});if(recipes.critical)priorities.push({code:'foodCost',severity:'warning',count:recipes.critical,value:recipes.averageFoodCost});const urgentManager=managerTasks.filter(x=>x.priority==='urgent').length;if(urgentManager)priorities.push({code:'managerTasks',severity:'urgent',count:urgentManager});if(tasks.length)priorities.push({code:'dailyTasks',severity:'info',count:tasks.length});if(labor.missingRates.length)priorities.push({code:'laborRate',severity:'info',count:labor.missingRates.length});if(setup.score<100)priorities.push({code:'setup',severity:'info',count:setup.score});
  return{generatedAt:now.toISOString(),readyActions,serviceBriefing,serviceReadiness:serviceReadiness7d,planningConflicts:scheduleConflicts,trainingRenewals,allergenCoverage:allergenStatus,reservationAttention:reservationFollowUp,rejectedDeliveries,weeklyReview,closing,equipment,waste,supplierOpportunities,trend,trendAlerts,finance,reorder,priceAlerts,purchases,recipeImpacts,outlook,haccp,labor,recipes,setup,setupSteps,payables,overdueInvoices:overdueInvoices.length,openDailyTasks:tasks.length,openManagerTasks:managerTasks.length,priorities:priorities.slice(0,8)};
}

export function menuEngineering(state,now=new Date()){
  const demand=new Map();
  const sources=[...(state?.sales||[]),...(state?.orders||[])];
  for(const sale of sources)for(const line of Array.isArray(sale?.items)?sale.items:[]){const key=String(line.recipeId||line.name||line.name_snapshot||'').trim().toLocaleLowerCase();if(!key)continue;const row=demand.get(key)||{quantity:0,revenue:0};row.quantity+=Math.max(0,n(line.quantity||line.qty)||1);row.revenue+=Math.max(0,n(line.lineTotal||line.total||line.amount));demand.set(key,row)}
  const wasteByStock=new Map(),since=new Date(now);since.setDate(since.getDate()-30);
  for(const row of state?.waste||[]){const when=new Date(String(row?.date||row?.recordedAt||''));if(Number.isNaN(when.getTime())||when<since||when>now)continue;const id=String(row?.stockId||''),item=(state?.stock||[]).find(x=>String(x.id)===id),cost=Math.max(0,n(row?.qty))*Math.max(0,n(row?.unitPrice)||n(item?.price));if(id)wasteByStock.set(id,(wasteByStock.get(id)||0)+cost)}
  const portfolio=recipePortfolio(state),items=portfolio.items.map((item,index)=>{const recipe=state?.recipes?.[index]||{},keys=[String(recipe.id||'').toLocaleLowerCase(),String(recipe.name||'').trim().toLocaleLowerCase()].filter(Boolean),sales=keys.map(k=>demand.get(k)).find(Boolean)||{quantity:0,revenue:0},contribution=round(item.margin*sales.quantity,2),wasteCost=round((recipe.ingredients||[]).reduce((sum,line)=>sum+(wasteByStock.get(String(line.stockId||''))||0),0),2);return{...item,index,quantity:round(sales.quantity,2),revenue:round(sales.revenue,2),contribution,wasteCost,status:sales.quantity===0?'no_data':item.foodCostPercent>portfolio.warning?'cost_risk':item.margin<=0?'negative':item.foodCostPercent>portfolio.target?'watch':'healthy'}}),sold=items.filter(x=>x.quantity>0),avgQty=sold.length?sold.reduce((sum,x)=>sum+x.quantity,0)/sold.length:0,avgMargin=sold.length?sold.reduce((sum,x)=>sum+x.margin,0)/sold.length:0;
  for(const item of items){item.popularity=item.quantity===0?'unknown':item.quantity>=avgQty?'high':'low';item.marginBand=item.quantity===0?'unknown':item.margin>=avgMargin?'high':'low';item.classification=item.quantity===0?'no_data':item.popularity==='high'&&item.marginBand==='high'?'star':item.popularity==='high'?'plowhorse':item.marginBand==='high'?'puzzle':'dog';const wasteRisk=item.wasteCost>Math.max(5,item.contribution*.08);item.action=wasteRisk?'reduce_waste':item.status==='cost_risk'?'review_cost':item.status==='negative'?'raise_price':item.classification==='star'?'protect_star':item.classification==='puzzle'?'promote':item.classification==='dog'?'retire':'monitor'}
  return{target:portfolio.target,warning:portfolio.warning,avgQuantity:round(avgQty,1),avgMargin:round(avgMargin,2),items:items.sort((a,b)=>b.contribution-a.contribution||b.quantity-a.quantity)}
}
export function inventoryVariance(state,countId){
  const count=(state?.inventoryCounts||[]).find(x=>x.id===countId);if(!count)return{count:null,rows:[],absoluteValue:0};
  const rows=(count.lines||[]).map(line=>{const item=state.stock?.find(x=>x.id===line.stockId),theoretical=item?stockAvailable(state,item):0,counted=n(line.quantity),delta=round(counted-theoretical,3),unitCost=n(item?.price),value=round(delta*unitCost,2);return{stockId:line.stockId,product:line.product||item?.name||'',unit:line.unit||item?.unit||'',theoretical:round(theoretical,3),counted:round(counted,3),delta,value}}).sort((a,b)=>Math.abs(b.value)-Math.abs(a.value));return{count,rows,absoluteValue:round(rows.reduce((sum,x)=>sum+Math.abs(x.value),0),2)}
}
export function purchaseOrderSummary(state){
  const rows=state?.purchaseOrders||[],open=rows.filter(x=>!['received','cancelled'].includes(x.status)),committed=open.reduce((sum,po)=>sum+(po.items||[]).reduce((s,x)=>s+Math.max(0,(n(x.quantity)-n(x.receivedQty))*n(x.unitPrice)),0),0);return{open:open.length,disputed:open.filter(x=>x.status==='disputed').length,partial:open.filter(x=>x.status==='partial').length,committed:round(committed,2),rows:open}
}

export function customerInsights(state,now=new Date()){
  const rows=[];for(const customer of state?.customers||[]){const name=String(customer?.name||'').trim(),key=name.toLocaleLowerCase(),reservations=(state?.reservations||[]).filter(x=>String(x.name||'').trim().toLocaleLowerCase()===key),orders=(state?.orders||[]).filter(x=>String(x.customer||'').trim().toLocaleLowerCase()===key&&x.status==='paid'),completed=reservations.filter(x=>['completed','seated'].includes(x.status)),visits=completed.length+orders.length,revenue=orders.reduce((sum,x)=>sum+n(x.amount),0),dates=[...reservations.map(x=>String(x.time||'').slice(0,10)),...orders.map(x=>String(x.date||''))].filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x)).sort(),lastVisit=dates.at(-1)||'',daysSince=lastVisit?Math.floor((atMidnight(now)-atMidnight(lastVisit))/dayMs):null,segment=visits>=5?'vip':daysSince!=null&&daysSince>60?'lapsed':visits<=1?'new':'regular',loyalty=(state?.loyalty||[]).find(x=>String(x.name||'').trim().toLocaleLowerCase()===key),points=n(loyalty?.points),tiers=Array.isArray(state?.loyaltySettings?.tiers)?state.loyaltySettings.tiers:[],loyaltyTier=[...tiers].filter(x=>points>=n(x.minPoints)).sort((a,b)=>n(b.minPoints)-n(a.minPoints))[0]?.code||'member';rows.push({name,phone:String(customer?.phone||''),email:String(customer?.email||''),visits,revenue:round(revenue,2),avgSpend:orders.length?round(revenue/orders.length,2):0,lastVisit,daysSince,segment,points,loyaltyTier,marketingConsent:!!customer?.consent?.marketing,profilingConsent:!!customer?.consent?.profiling})}
  return{rows:rows.sort((a,b)=>b.revenue-a.revenue||b.visits-a.visits),vip:rows.filter(x=>x.segment==='vip').length,lapsed:rows.filter(x=>x.segment==='lapsed').length,consented:rows.filter(x=>x.marketingConsent).length}
}
export function reservationLoad(state,now=new Date(),days=7){
  const rows=[];for(let i=0;i<Math.max(1,Math.trunc(days));i++){const d=new Date(now);d.setHours(12,0,0,0);d.setDate(d.getDate()+i);const date=localDate(d),bookings=(state?.reservations||[]).filter(x=>String(x.time||'').slice(0,10)===date&&!['cancelled','noShow'].includes(x.status)),covers=bookings.reduce((sum,x)=>sum+n(x.covers),0),deposits=bookings.reduce((sum,x)=>sum+(x.depositStatus==='paid'?n(x.depositAmount):0),0);rows.push({date,bookings:bookings.length,covers,waitlist:bookings.filter(x=>x.status==='waitlist').length,deposits:round(deposits,2)})}return rows
}
