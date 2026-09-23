import { withSupabase } from "npm:@supabase/server@1.4.1";

const json=(data:unknown,status=200)=>Response.json(data,{status});
const clean=(value:unknown,max=160)=>String(value??"").trim().slice(0,max);
const validUuid=(value:unknown)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value||""));
const validDate=(value:unknown)=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||""));

async function patchDirectOrderFromPos(db:any,posOrderId:string,patch:any,eventType:string,actorUserId:string){
  const now=new Date().toISOString(),payload={...patch,updated_at:now};if(patch.status==="completed")payload.completed_at=now;
  const {data}=await db.from("direct_orders").update(payload).eq("pos_order_id",posOrderId).select("id").maybeSingle();
  if(data?.id)await db.from("direct_order_events").insert({direct_order_id:data.id,event_type:eventType,actor_user_id:actorUserId,details:{posOrderId,...patch}});
}
async function syncDirectProductionFromPos(db:any,posOrderId:string,actorUserId:string){
  const {data:items}=await db.from("pos_order_items").select("kitchen_status,station_snapshot").eq("order_id",posOrderId);
  const routed=(items||[]).filter((x:any)=>String(x.station_snapshot||"")!=="none"&&String(x.kitchen_status||"")!=="cancelled");if(!routed.length)return;
  const allDone=routed.every((x:any)=>["ready","served"].includes(String(x.kitchen_status))),status=allDone?"ready":"preparing";
  await patchDirectOrderFromPos(db,posOrderId,{status},"production_synced",actorUserId);
}
async function syncDirectPaymentFromPos(db:any,posOrderId:string,actorUserId:string){
  const {data:order}=await db.from("pos_orders").select("status").eq("id",posOrderId).maybeSingle();if(!order)return;
  if(["paid","refunded"].includes(String(order.status)))await patchDirectOrderFromPos(db,posOrderId,{status:"completed",payment_status:String(order.status)==="refunded"?"refunded":"paid"},"payment_synced",actorUserId);
}

async function attributeOrderTips(db:any,orderId:string,operatorContext:any){
  const operator=operatorContext?.operator;
  const operatorId=clean(operator?.id,64);
  if(!validUuid(operatorId))return;
  const operatorName=clean(operator?.display_name||operator?.displayName||"Opérateur",120)||"Opérateur";
  await db.from("pos_payments")
    .update({tip_operator_id:operatorId,tip_operator_name_snapshot:operatorName})
    .eq("order_id",orderId).gt("tip_amount",0).is("tip_operator_id",null);
}

async function tipsByOperatorForDate(db:any,restaurantId:string,businessDate:string){
  const {data:orders,error:orderError}=await db.from("pos_orders").select("id")
    .eq("restaurant_id",restaurantId).eq("business_date",businessDate);
  if(orderError||!orders?.length)return[];
  const ids=orders.map((x:any)=>x.id);
  const {data:payments,error}=await db.from("pos_payments")
    .select("tip_amount,tip_operator_id,tip_operator_name_snapshot")
    .in("order_id",ids).eq("status","captured").gt("tip_amount",0);
  if(error)return[];
  const map=new Map<string,{operatorId:string|null,name:string,amount:number,count:number}>();
  for(const p of payments||[]){
    const operatorId=validUuid(p.tip_operator_id)?String(p.tip_operator_id):null;
    const key=operatorId||"unattributed",name=clean(p.tip_operator_name_snapshot,120)||(operatorId?"Opérateur":"Non attribué");
    const row=map.get(key)||{operatorId,name,amount:0,count:0};
    row.amount+=Number(p.tip_amount)||0;row.count+=1;map.set(key,row);
  }
  return[...map.values()].map(x=>({...x,amount:Math.round(x.amount*100)/100})).sort((a,b)=>b.amount-a.amount);
}

const normalizeMatchName=(value:any)=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const availabilityConfig=(value:any)=>{
  const src=value&&typeof value==="object"?value:{},mode=["unlimited","manual","stock"].includes(String(src.mode))?String(src.mode):"unlimited";
  return{mode,manualQuantity:Math.max(0,Math.floor(Number(src.manualQuantity)||0)),lowThreshold:Math.max(0,Math.floor(Number(src.lowThreshold)||3))};
};
const exactCatalogMatch=(button:any,catalog:any[])=>{
  if(validUuid(button?.productId))return catalog.find((x:any)=>String(x.id)===String(button.productId))||null;
  const name=normalizeMatchName(button?.item?.name||button?.label);if(!name)return null;
  let candidates=(catalog||[]).filter((x:any)=>x?.active!==false&&normalizeMatchName(x?.name)===name);
  if(candidates.length>1&&Number.isFinite(Number(button?.item?.price))){
    const price=Number(button.item.price),priced=candidates.filter((x:any)=>Math.abs((Number(x?.price)||0)-price)<=0.01);
    if(priced.length===1)candidates=priced;
  }
  return candidates.length===1?candidates[0]:null;
};
const workspaceStockAvailable=(workspace:any,stockId:string)=>{
  const data=workspace&&typeof workspace==="object"?workspace:{},stocks=Array.isArray(data.stock)?data.stock:[],deliveries=Array.isArray(data.deliveries)?data.deliveries:[],waste=Array.isArray(data.waste)?data.waste:[],moves=Array.isArray(data.stockMoves)?data.stockMoves:[];
  const item=stocks.find((x:any)=>String(x?.id||"")===String(stockId||""));if(!item)return 0;
  const received=deliveries.reduce((sum:number,row:any)=>sum+(row?.status==="accepted"&&String(row?.stockId||"")===String(stockId)?Number(row?.qty)||0:0),0);
  const lost=waste.reduce((sum:number,row:any)=>sum+(String(row?.stockId||"")===String(stockId)?Number(row?.qty)||0:0),0);
  const moved=moves.reduce((sum:number,row:any)=>sum+(row?.affectsStock===true&&String(row?.stockId||"")===String(stockId)&&Number.isFinite(Number(row?.delta))?Number(row.delta):0),0);
  return Math.max(0,(Number(item?.qty)||0)+received-lost+moved);
};
async function posAvailabilitySnapshot(db:any,restaurantId:string,organizationId:string){
  const [catalogResult,layoutResult,workspaceResult,manualResult]=await Promise.all([
    db.from("pos_catalog_items").select("id,name,price,active,metadata").eq("restaurant_id",restaurantId).eq("active",true),
    db.from("pos_layout_versions").select("version,document,published_at").eq("restaurant_id",restaurantId).order("version",{ascending:false}).limit(1).maybeSingle(),
    db.from("restaurant_workspaces").select("revision,data,updated_at").eq("restaurant_id",restaurantId).maybeSingle(),
    db.from("pos_item_availability").select("availability_key,configured_quantity,remaining_quantity,low_threshold,version,updated_at").eq("restaurant_id",restaurantId)
  ]);
  if(catalogResult.error)return{error:catalogResult.error.message,rows:[]};
  if(layoutResult.error)return{error:layoutResult.error.message,rows:[]};
  if(workspaceResult.error)return{error:workspaceResult.error.message,rows:[]};
  if(manualResult.error)return{error:manualResult.error.message,rows:[]};

  const catalog=catalogResult.data||[],layout=layoutResult.data?.document||{},buttons=Array.isArray(layout?.buttons)?layout.buttons:[],workspace=workspaceResult.data?.data||{},manualMap=new Map((manualResult.data||[]).map((x:any)=>[String(x.availability_key),x]));
  const rows:any[]=[],represented=new Set<string>(),desiredManual:any[]=[];
  const add=(button:any,item:any|null)=>{
    const explicitCatalogId=validUuid(button?.productId)?String(button.productId):"",catalogItem=item||null;
    const key=explicitCatalogId?"catalog:"+explicitCatalogId:"layout:"+String(button?.id||"");
    represented.add(key);
    const buttonCfg=availabilityConfig(button?.availability),catalogCfg=availabilityConfig(catalogItem?.metadata?.availability);
    const cfg=buttonCfg.mode!=="unlimited"?buttonCfg:(catalogCfg.mode!=="unlimited"?catalogCfg:buttonCfg);
    let remaining:number|null=null,source="unlimited";
    if(cfg.mode==="manual"){
      const existing=manualMap.get(key);
      const quantityChanged=!existing||Number(existing.configured_quantity)!==Number(cfg.manualQuantity);
      const thresholdChanged=!existing||Number(existing.low_threshold)!==Number(cfg.lowThreshold);
      if(quantityChanged||thresholdChanged){
        const nextRemaining=quantityChanged?cfg.manualQuantity:Math.max(0,Number(existing?.remaining_quantity)||0);
        desiredManual.push({restaurant_id:restaurantId,organization_id:organizationId,availability_key:key,mode:"manual",configured_quantity:cfg.manualQuantity,remaining_quantity:nextRemaining,low_threshold:cfg.lowThreshold,version:Number(existing?.version||0)+1,updated_at:new Date().toISOString()});
        remaining=nextRemaining;
      }else remaining=Math.max(0,Number(existing.remaining_quantity)||0);
      source="manual";
    }else if(cfg.mode==="stock"&&catalogItem){
      const components=Array.isArray(catalogItem?.metadata?.stockComponents)?catalogItem.metadata.stockComponents:[];
      if(components.length){
        remaining=Math.max(0,Math.floor(Math.min(...components.map((row:any)=>{
          const per=Math.max(0,Number(row?.quantity)||0);return per>0?workspaceStockAvailable(workspace,String(row?.stockId||""))/per:0;
        }))));
        source="stock";
      }
    }
    rows.push({
      key,buttonId:String(button?.id||""),catalogItemId:catalogItem?.id||null,autoMatched:!explicitCatalogId&&!!catalogItem,
      mode:cfg.mode,remaining,lowThreshold:cfg.lowThreshold,soldOut:remaining!==null&&remaining<=0,source
    });
  };
  for(const button of buttons)add(button,exactCatalogMatch(button,catalog));
  for(const item of catalog){
    const key="catalog:"+String(item.id);if(represented.has(key))continue;
    const cfg=availabilityConfig(item?.metadata?.availability);if(cfg.mode==="unlimited")continue;
    add({id:"catalog-"+String(item.id),productId:String(item.id),availability:null},item);
  }
  if(desiredManual.length){
    const {error}=await db.from("pos_item_availability").upsert(desiredManual,{onConflict:"restaurant_id,availability_key"});
    if(error)return{error:error.message,rows:[]};
  }
  return{
    rows,layoutVersion:Number(layoutResult.data?.version)||0,workspaceRevision:Number(workspaceResult.data?.revision)||0,
    updatedAt:workspaceResult.data?.updated_at||layoutResult.data?.published_at||null
  };
}

export default {
  fetch: withSupabase({auth:"user"},async(req,ctx)=>{
    if(req.method!=="POST")return json({error:"Method not allowed"},405);
    try{
      const userId=String(ctx.userClaims?.id||"");
      if(!userId)return json({error:"Authenticated user required"},401);
      const body=await req.json().catch(()=>({}));
      const action=clean(body.action,40)||"bootstrap";
      const restaurantId=clean(body.restaurantId,64);
      if(!validUuid(restaurantId))return json({error:"Valid restaurantId required"},400);

      const {data:restaurant,error:restaurantError}=await ctx.supabaseAdmin.from("restaurants")
        .select("id,organization_id,name,currency,timezone,active")
        .eq("id",restaurantId).eq("active",true).single();
      if(restaurantError||!restaurant)return json({error:"Restaurant not found"},404);

      const {data:memberships,error:membershipError}=await ctx.supabaseAdmin.from("memberships")
        .select("restaurant_id,organization_id,role,active,permissions")
        .eq("user_id",userId).eq("active",true);
      if(membershipError)return json({error:"Unable to verify access"},500);
      const allowed=(memberships||[]).some((m:any)=>
        m.organization_id===restaurant.organization_id &&
        (m.restaurant_id===restaurantId || (!m.restaurant_id && ["network_admin","network_manager"].includes(m.role)))
      );
      if(!allowed)return json({error:"Restaurant access denied"},403);
      const manager=(memberships||[]).some((m:any)=>
        m.organization_id===restaurant.organization_id &&
        (
          (!m.restaurant_id && ["network_admin","network_manager"].includes(m.role)) ||
          (m.restaurant_id===restaurantId && ["restaurant_admin","director","manager"].includes(m.role))
        )
      );

      if(action==="list_operators"){
        const {data,error}=await ctx.supabaseAdmin.from("pos_operators")
          .select("id,user_id,employee_id,display_name,role,permissions,active,last_login_at")
          .eq("restaurant_id",restaurantId).eq("active",true).order("display_name");
        if(error)return json({error:error.message},500);
        return json({ok:true,rows:data||[],required:(data||[]).length>0});
      }

      if(action==="upsert_operator"){
        if(!manager)return json({error:"Manager access required"},403);
        const op=body.operator||{},operatorId=clean(op.id,64),userIdValue=clean(op.userId,64),employeeId=clean(op.employeeId,64);
        const {data,error}=await ctx.supabaseAdmin.rpc("pos_upsert_operator",{
          p_operator_id:validUuid(operatorId)?operatorId:null,
          p_restaurant_id:restaurantId,
          p_user_id:validUuid(userIdValue)?userIdValue:null,
          p_employee_id:validUuid(employeeId)?employeeId:null,
          p_display_name:clean(op.displayName,120),
          p_role:clean(op.role,30).toLowerCase(),
          p_pin:clean(op.pin,12),
          p_active:op.active!==false,
          p_permissions:op.permissions&&typeof op.permissions==="object"?op.permissions:{},
          p_actor_user_id:userId
        });
        if(error)return json({error:error.message},409);
        return json({ok:true,operator:data});
      }

      if(action==="operator_login"){
        const operatorId=clean(body.operatorId,64),deviceId=clean(body.deviceId,64),pin=clean(body.pin,12);
        if(!validUuid(operatorId)||!validUuid(deviceId)||!/^[0-9]{4,8}$/.test(pin))return json({error:"Valid operator, device and PIN required"},400);
        const {data,error}=await ctx.supabaseAdmin.rpc("pos_operator_login",{
          p_restaurant_id:restaurantId,p_operator_id:operatorId,p_pin:pin,p_device_id:deviceId,p_actor_user_id:userId
        });
        if(error)return json({error:error.message},403);
        return json({ok:true,session:data});
      }

      if(action==="operator_current"){
        const token=clean(body.operatorSessionToken,128);
        const {data,error}=await ctx.supabaseAdmin.rpc("pos_operator_authorize",{
          p_restaurant_id:restaurantId,p_token:token,p_permission:"",p_actor_user_id:userId
        });
        if(error)return json({error:error.message},403);
        return json({ok:true,authorization:data});
      }

      if(action==="operator_logout"){
        const token=clean(body.operatorSessionToken,128);
        const {data,error}=await ctx.supabaseAdmin.rpc("pos_operator_logout",{
          p_restaurant_id:restaurantId,p_token:token,p_actor_user_id:userId
        });
        if(error)return json({error:error.message},500);
        return json({ok:true,loggedOut:data===true});
      }

      const operatorExempt=new Set([
        "bootstrap","heartbeat","operator_login","operator_current","operator_logout",
        "list_operators","upsert_operator",
        "list_tables","sync_tables","sync_catalog",
        "list_terminals","upsert_terminal",
        "list_printers","upsert_printer",
        "inventory_movements","ack_inventory_movements","food_cost_report","accounting_export",
        "list_provider_connections","upsert_provider_connection",
        "configuration_head","availability_snapshot","layout_current","layout_admin","save_layout_draft","publish_layout","restore_layout_version"
      ]);
      const permissionMap:Record<string,string>={
        open_cash_session:"cash",close_cash_session:"cash",service_report:"cash",
        commit_order:"sale",save_open_order:"sale",append_order_items:"sale",settle_open_order:"sale",settle_open_order_split:"sale",list_direct_orders:"sale",claim_direct_order:"sale",link_direct_order:"sale",
        settle_open_order_allocated:"sale",pay_allocated_group:"sale",create_terminal_intent:"sale",
        refund_order:"refund",create_terminal_refund_intent:"refund",confirm_external_refund:"refund",
        cancel_open_order:"cancel",reject_direct_order:"cancel",transfer_open_order:"transfer",
        send_to_production:"production",update_production_item:"production",set_production_priority:"production",recall_production_order:"production",
        sync_catalog:"settings",sync_tables:"settings",upsert_terminal:"settings",set_terminal_connection:"settings",
        upsert_printer:"settings",set_printer_status:"settings"
      };
      let operatorContext:any=null;
      if(!operatorExempt.has(action)){
        const operatorToken=clean(body.operatorSessionToken,128);
        const {data:operatorAuth,error:operatorAuthError}=await ctx.supabaseAdmin.rpc("pos_operator_authorize",{
          p_restaurant_id:restaurantId,p_token:operatorToken,p_permission:permissionMap[action]||"",p_actor_user_id:userId
        });
        if(operatorAuthError)return json({error:operatorAuthError.message},403);
        operatorContext=operatorAuth;
        if(operatorAuth?.required===true&&operatorAuth?.authorized!==true){
          return json({error:operatorAuth?.error||"OPERATOR_REQUIRED",operatorRequired:true},403);
        }
        if(operatorAuth?.required===true&&operatorAuth?.operator?.id){
          const candidates=[body.orderId,body.refundId,body.itemId,body.sessionId,body.terminalId,body.printerId];
          const entityValue=candidates.find((x:any)=>validUuid(x));
          ctx.supabaseAdmin.rpc("pos_log_operator_action",{
            p_restaurant_id:restaurantId,p_token:operatorToken,p_actor_user_id:userId,
            p_action:action,p_entity_type:"request",p_entity_id:entityValue||null,
            p_metadata:{clientEventId:validUuid(body.clientEventId)?body.clientEventId:null}
          }).then(()=>{}).catch(()=>{});
        }
      }

      if(action==="availability_snapshot"){
        const snapshot=await posAvailabilitySnapshot(ctx.supabaseAdmin,restaurantId,restaurant.organization_id);
        if(snapshot.error)return json({error:snapshot.error},500);
        return json({ok:true,...snapshot});
      }

      if(action==="configuration_head"){
        const {data,error}=await ctx.supabaseAdmin.from("pos_configuration_revisions")
          .select("revision,updated_at").eq("restaurant_id",restaurantId).maybeSingle();
        if(error){
          if(String(error.message||"").toLowerCase().includes("pos_configuration_revisions"))return json({ok:true,revision:0,updatedAt:null,legacy:true});
          return json({error:error.message},500);
        }
        return json({ok:true,revision:Number(data?.revision)||0,updatedAt:data?.updated_at||null});
      }

      if(action==="bootstrap"){
        const deviceId=clean(body.deviceId,64);
        const requests:any[]=[
          ctx.supabaseAdmin.from("pos_catalog_items")
            .select("id,source_key,recipe_id,sku,name,category,item_type,price,tax_rate,production_station,active,sort_order,metadata,version,updated_at")
            .eq("restaurant_id",restaurantId).eq("active",true).order("sort_order").order("name"),
          ctx.supabaseAdmin.from("profiles").select("id,first_name,last_name,locale").eq("id",userId).maybeSingle(),
          ctx.supabaseAdmin.from("pos_event_log").select("sequence").eq("restaurant_id",restaurantId).order("sequence",{ascending:false}).limit(1).maybeSingle(),
          ctx.supabaseAdmin.from("pos_layout_versions")
            .select("version,schema_version,document,checksum,published_at")
            .eq("restaurant_id",restaurantId).order("version",{ascending:false}).limit(1).maybeSingle(),
          ctx.supabaseAdmin.from("pos_configuration_revisions")
            .select("revision,updated_at").eq("restaurant_id",restaurantId).maybeSingle()
        ];
        if(validUuid(deviceId)){
          requests.push(ctx.supabaseAdmin.from("pos_cash_sessions")
            .select("id,business_date,status,opening_cash,expected_cash,counted_cash,difference_cash,opened_at,closed_at")
            .eq("restaurant_id",restaurantId).eq("device_id",deviceId).eq("status","open").maybeSingle());
        }
        const results=await Promise.all(requests);
        const catalogResult=results[0],profileResult=results[1],eventResult=results[2],layoutResult=results[3],revisionResult=results[4],sessionResult=results[5];
        if(catalogResult.error)return json({error:"Unable to load POS catalog"},500);
        return json({
          ok:true,
          restaurant,
          profile:profileResult.data||null,
          catalog:catalogResult.data||[],
          layout:layoutResult?.data?{
            version:Number(layoutResult.data.version)||0,
            schemaVersion:Number(layoutResult.data.schema_version)||1,
            document:layoutResult.data.document||null,
            checksum:layoutResult.data.checksum||"",
            publishedAt:layoutResult.data.published_at||null
          }:null,
          openSession:sessionResult?.data||null,
          serverCursor:Number(eventResult.data?.sequence||0),
          configurationRevision:Number(revisionResult?.data?.revision)||0,
          configurationUpdatedAt:revisionResult?.data?.updated_at||null,
          capabilities:{
            offlineQueue:true,
            cashSessions:true,
            atomicCheckout:true,
            receiptNumbering:true,
            splitPayments:true,
            itemSplitPayments:true,
            progressiveSplitPayments:true,
            tips:true,
            tableTransfers:true,
            refunds:true,
            productionRouting:true,
            advancedKds:true,
            kitchen:true,
            serviceReports:true,
            accountingExports:true,
            swissAccountingAdapters:true,
            customerDisplay:true,
            hardwareAdapterRegistry:true,
            paymentTerminalProfiles:true,
            providerConnectionRegistry:true,
            terminalIntents:true,
            operatorPins:true,
            operatorPermissions:true,
            configurableLayout:true,
            layoutModifiers:true,
            layoutMenus:true,
            standaloneLayoutItems:true,
            itemAvailability:true,
            automaticCatalogMatching:true,
            paymentProviders:false
          }
        });
      }

      if(action==="heartbeat"){
        const device=body.device||{};
        const id=clean(device.id,64),installId=clean(device.installId,160);
        if(!validUuid(id)||!installId)return json({error:"Valid device.id and installId required"},400);
        const {data:existing}=await ctx.supabaseAdmin.from("pos_devices")
          .select("id,restaurant_id").eq("id",id).maybeSingle();
        if(existing&&existing.restaurant_id!==restaurantId)return json({error:"Device belongs to another restaurant"},409);
        const payload={
          id,
          organization_id:restaurant.organization_id,
          restaurant_id:restaurantId,
          install_id:installId,
          label:clean(device.label,120)||null,
          platform:clean(device.platform,40)||"android",
          app_version:clean(device.appVersion,40)||null,
          active:true,
          last_seen_at:new Date().toISOString(),
          created_by:userId
        };
        const {data,error}=await ctx.supabaseAdmin.from("pos_devices")
          .upsert(payload,{onConflict:"id"}).select("id,restaurant_id,label,last_seen_at").single();
        if(error)return json({error:error.message},500);
        return json({ok:true,device:data});
      }

      if(action==="open_cash_session"){
        const sessionId=clean(body.sessionId,64),deviceId=clean(body.deviceId,64),businessDate=clean(body.businessDate,10);
        if(!validUuid(sessionId)||!validUuid(deviceId)||!validDate(businessDate))return json({error:"Invalid cash-session payload"},400);
        const {data,error}=await ctx.supabaseAdmin.rpc("pos_open_cash_session",{
          p_session_id:sessionId,
          p_organization_id:restaurant.organization_id,
          p_restaurant_id:restaurantId,
          p_device_id:deviceId,
          p_business_date:businessDate,
          p_opening_cash:Number(body.openingCash)||0,
          p_actor_user_id:userId,
          p_notes:clean(body.notes,500)||null
        });
        if(error)return json({error:error.message},409);
        return json({ok:true,session:data});
      }

      if(action==="close_cash_session"){
        const sessionId=clean(body.sessionId,64);
        if(!validUuid(sessionId))return json({error:"Invalid sessionId"},400);
        const {data,error}=await ctx.supabaseAdmin.rpc("pos_close_cash_session",{
          p_session_id:sessionId,
          p_counted_cash:Number(body.countedCash)||0,
          p_actor_user_id:userId,
          p_notes:clean(body.notes,500)||null
        });
        if(error)return json({error:error.message},409);
        return json({ok:true,session:data});
      }

      if(action==="commit_order"){
        const order=body.order||{};
        const orderId=clean(order.id,64),eventId=clean(order.clientEventId,64),deviceId=clean(order.deviceId,64),sessionId=clean(order.cashSessionId,64);
        const businessDate=clean(order.businessDate,10);
        if(!validUuid(orderId)||!validUuid(eventId)||!validUuid(deviceId)||!validUuid(sessionId)||!validDate(businessDate)){
          return json({error:"Invalid order identity"},400);
        }
        if(!Array.isArray(order.lines)||!order.lines.length)return json({error:"Order lines required"},400);
        const {data,error}=await ctx.supabaseAdmin.rpc("pos_commit_order",{
          p_order_id:orderId,
          p_client_event_id:eventId,
          p_organization_id:restaurant.organization_id,
          p_restaurant_id:restaurantId,
          p_device_id:deviceId,
          p_cash_session_id:sessionId,
          p_business_date:businessDate,
          p_service_type:clean(order.serviceType,30)||"counter",
          p_table_label:clean(order.tableLabel,80)||null,
          p_covers:Math.max(0,Math.trunc(Number(order.covers)||0)),
          p_currency:clean(order.currency,3).toUpperCase()||restaurant.currency||"CHF",
          p_lines:order.lines,
          p_payment_method:clean(order.paymentMethod,30),
          p_payment_provider:clean(order.paymentProvider,80)||null,
          p_payment_reference:clean(order.paymentReference,180)||null,
          p_tip_amount:Math.max(0,Number(order.tipAmount)||0),
          p_actor_user_id:userId,
          p_occurred_at:order.occurredAt||new Date().toISOString()
        });
        if(error)return json({error:error.message},409);
        await attributeOrderTips(ctx.supabaseAdmin,orderId,operatorContext);
        return json({ok:true,receipt:data});
      }

      if(action==="layout_current"){
        const {data,error}=await ctx.supabaseAdmin.from("pos_layout_versions")
          .select("version,schema_version,document,checksum,published_at")
          .eq("restaurant_id",restaurantId).order("version",{ascending:false}).limit(1).maybeSingle();
        if(error)return json({error:error.message},500);
        return json({ok:true,layout:data?{
          version:Number(data.version)||0,schemaVersion:Number(data.schema_version)||1,
          document:data.document||null,checksum:data.checksum||"",publishedAt:data.published_at||null
        }:null});
      }

      if(action==="layout_admin"){
        if(!manager)return json({error:"Manager access required"},403);
        const [draftResult,publishedResult,historyResult]=await Promise.all([
          ctx.supabaseAdmin.from("pos_layout_drafts")
            .select("schema_version,document,draft_revision,updated_at")
            .eq("restaurant_id",restaurantId).maybeSingle(),
          ctx.supabaseAdmin.from("pos_layout_versions")
            .select("version,schema_version,document,checksum,published_at")
            .eq("restaurant_id",restaurantId).order("version",{ascending:false}).limit(1).maybeSingle(),
          ctx.supabaseAdmin.from("pos_layout_versions")
            .select("version,schema_version,checksum,published_at,published_by")
            .eq("restaurant_id",restaurantId).order("version",{ascending:false}).limit(12)
        ]);
        if(draftResult.error)return json({error:draftResult.error.message},500);
        if(publishedResult.error)return json({error:publishedResult.error.message},500);
        if(historyResult.error)return json({error:historyResult.error.message},500);
        return json({
          ok:true,
          draft:draftResult.data?{
            schemaVersion:Number(draftResult.data.schema_version)||1,
            document:draftResult.data.document||null,
            draftRevision:Number(draftResult.data.draft_revision)||1,
            updatedAt:draftResult.data.updated_at||null
          }:null,
          published:publishedResult.data?{
            version:Number(publishedResult.data.version)||0,
            schemaVersion:Number(publishedResult.data.schema_version)||1,
            document:publishedResult.data.document||null,
            checksum:publishedResult.data.checksum||"",
            publishedAt:publishedResult.data.published_at||null
          }:null,
          history:(historyResult.data||[]).map((row:any)=>({
            version:Number(row.version)||0,schemaVersion:Number(row.schema_version)||1,
            checksum:row.checksum||"",publishedAt:row.published_at||null,publishedBy:row.published_by||null
          }))
        });
      }

      if(action==="save_layout_draft"){
        if(!manager)return json({error:"Manager access required"},403);
        const document=body.document;
        if(!document||typeof document!=="object"||Array.isArray(document))return json({error:"Layout document required"},400);
        if(Number(document.schemaVersion)!==1)return json({error:"Unsupported layout schema"},400);
        for(const key of ["pages","categories","buttons","modifierGroups","productModifiers","menus"]){
          if(!Array.isArray(document[key]))return json({error:`Layout ${key} must be an array`},400);
        }
        if(document.pages.length>50||document.categories.length>200||document.buttons.length>1000||document.modifierGroups.length>200||document.menus.length>200){
          return json({error:"Layout limit exceeded"},400);
        }
        for(const button of document.buttons){
          const productId=clean(button?.productId,80);
          if(productId)continue;
          const item=button?.item;
          const name=clean(item?.name,120),price=Number(item?.price),taxRate=Number(item?.taxRate??item?.tax_rate);
          const type=clean(item?.type,20),station=clean(item?.station||button?.station,20);
          if(!name||!Number.isFinite(price)||price<0||!Number.isFinite(taxRate)||taxRate<0||taxRate>100){
            return json({error:"Standalone layout item requires name, price and valid tax rate"},400);
          }
          if(type&&!["dish","drink","other"].includes(type))return json({error:"Invalid standalone layout item type"},400);
          if(station&&!["kitchen","bar","none"].includes(station))return json({error:"Invalid standalone layout station"},400);
        }
        const {data:existing,error:existingError}=await ctx.supabaseAdmin.from("pos_layout_drafts")
          .select("draft_revision").eq("restaurant_id",restaurantId).maybeSingle();
        if(existingError)return json({error:existingError.message},500);
        const revision=Math.max(1,Number(existing?.draft_revision||0)+1);
        const {data,error}=await ctx.supabaseAdmin.from("pos_layout_drafts").upsert({
          restaurant_id:restaurantId,organization_id:restaurant.organization_id,schema_version:1,
          document,draft_revision:revision,updated_by:userId,updated_at:new Date().toISOString()
        },{onConflict:"restaurant_id"}).select("schema_version,document,draft_revision,updated_at").single();
        if(error)return json({error:error.message},500);
        return json({ok:true,draft:{
          schemaVersion:Number(data.schema_version)||1,document:data.document,
          draftRevision:Number(data.draft_revision)||1,updatedAt:data.updated_at
        }});
      }

      if(action==="publish_layout"){
        if(!manager)return json({error:"Manager access required"},403);
        const {data,error}=await ctx.supabaseAdmin.rpc("pos_publish_layout",{
          p_restaurant_id:restaurantId,p_actor_user_id:userId
        });
        if(error)return json({error:error.message},409);
        return json({ok:true,layout:data});
      }

      if(action==="restore_layout_version"){
        if(!manager)return json({error:"Manager access required"},403);
        const version=Math.trunc(Number(body.version));
        if(!Number.isInteger(version)||version<1)return json({error:"Valid layout version required"},400);
        const {data:source,error:sourceError}=await ctx.supabaseAdmin.from("pos_layout_versions")
          .select("version,schema_version,document,checksum,published_at")
          .eq("restaurant_id",restaurantId).eq("version",version).maybeSingle();
        if(sourceError)return json({error:sourceError.message},500);
        if(!source)return json({error:"LAYOUT_VERSION_NOT_FOUND"},404);
        const {data:existing,error:existingError}=await ctx.supabaseAdmin.from("pos_layout_drafts")
          .select("draft_revision").eq("restaurant_id",restaurantId).maybeSingle();
        if(existingError)return json({error:existingError.message},500);
        const revision=Math.max(1,Number(existing?.draft_revision||0)+1),now=new Date().toISOString();
        const {data,error}=await ctx.supabaseAdmin.from("pos_layout_drafts").upsert({
          restaurant_id:restaurantId,organization_id:restaurant.organization_id,
          schema_version:Number(source.schema_version)||1,document:source.document,
          draft_revision:revision,updated_by:userId,updated_at:now
        },{onConflict:"restaurant_id"}).select("schema_version,document,draft_revision,updated_at").single();
        if(error)return json({error:error.message},500);
        return json({ok:true,restoredFromVersion:version,draft:{
          schemaVersion:Number(data.schema_version)||1,document:data.document,
          draftRevision:Number(data.draft_revision)||1,updatedAt:data.updated_at
        }});
      }

      if(action==="sync_catalog"){
        if(!manager)return json({error:"Manager access required"},403);
        const raw=Array.isArray(body.items)?body.items:[];
        if(raw.length>1000)return json({error:"Catalog limit exceeded"},400);
        const rows:any[]=[];
        const sourceKeys:string[]=[];
        for(let i=0;i<raw.length;i++){
          const item=raw[i]||{};
          const sourceKey=clean(item.sourceKey,180);
          const name=clean(item.name,240);
          const price=Number(item.price);
          const taxRate=Number(item.taxRate??8.1);
          if(!sourceKey||!name||!Number.isFinite(price)||price<0||!Number.isFinite(taxRate)||taxRate<0||taxRate>100){
            return json({error:`Invalid catalog item at index ${i}`},400);
          }
          sourceKeys.push(sourceKey);
          const station=clean(item.productionStation||item.station||item?.metadata?.station,30).toLowerCase();
          const row:any={
            organization_id:restaurant.organization_id,
            restaurant_id:restaurantId,
            source_key:sourceKey,
            sku:clean(item.sku,120)||null,
            name,
            category:clean(item.category,120),
            item_type:["product","recipe","modifier","service"].includes(clean(item.itemType,30))?clean(item.itemType,30):"product",
            price:Math.round(price*100)/100,
            tax_rate:Math.round(taxRate*1000)/1000,
            production_station:["kitchen","bar","none"].includes(station)?station:"kitchen",
            active:item.active!==false,
            sort_order:Math.trunc(Number(item.sortOrder)||0),
            metadata:item.metadata&&typeof item.metadata==="object"?item.metadata:{},
            version:Math.max(1,Math.trunc(Number(item.version)||1)),
            updated_at:new Date().toISOString()
          };
          const recipeId=clean(item.recipeId,64);
          if(validUuid(recipeId))row.recipe_id=recipeId;
          rows.push(row);
        }

        if(rows.length){
          const {error}=await ctx.supabaseAdmin.from("pos_catalog_items")
            .upsert(rows,{onConflict:"restaurant_id,source_key"});
          if(error)return json({error:error.message},500);
        }

        if(body.replace===true){
          const {data:existing,error:existingError}=await ctx.supabaseAdmin.from("pos_catalog_items")
            .select("id,source_key").eq("restaurant_id",restaurantId);
          if(existingError)return json({error:existingError.message},500);
          const keep=new Set(sourceKeys);
          const deactivate=(existing||[]).filter((x:any)=>x.source_key&&!keep.has(x.source_key)).map((x:any)=>x.id);
          for(let i=0;i<deactivate.length;i+=200){
            const {error}=await ctx.supabaseAdmin.from("pos_catalog_items")
              .update({active:false,updated_at:new Date().toISOString()})
              .in("id",deactivate.slice(i,i+200));
            if(error)return json({error:error.message},500);
          }
        }

        const {data:catalog,error:catalogError}=await ctx.supabaseAdmin.from("pos_catalog_items")
          .select("id,source_key,recipe_id,sku,name,category,item_type,price,tax_rate,production_station,active,sort_order,metadata,version,updated_at")
          .eq("restaurant_id",restaurantId).eq("active",true).order("sort_order").order("name");
        if(catalogError)return json({error:catalogError.message},500);
        return json({ok:true,count:catalog?.length||0,catalog:catalog||[]});
      }

      if(action==="list_tables"){
        const {data,error}=await ctx.supabaseAdmin.from("pos_tables")
          .select("id,label,area,seats,sort_order,x,y,active,updated_at")
          .eq("restaurant_id",restaurantId).eq("active",true).order("area").order("sort_order").order("label");
        if(error)return json({error:error.message},500);
        return json({ok:true,rows:data||[]});
      }

      if(action==="sync_tables"){
        if(!manager)return json({error:"Manager access required"},403);
        const raw=Array.isArray(body.tables)?body.tables:[];
        if(raw.length>300)return json({error:"Table limit exceeded"},400);
        const rows:any[]=[];
        for(let i=0;i<raw.length;i++){
          const item=raw[i]||{};
          const label=clean(item.label,80);
          if(!label)return json({error:`Invalid table at index ${i}`},400);
          const row:any={
            organization_id:restaurant.organization_id,
            restaurant_id:restaurantId,
            label,
            area:clean(item.area,80)||"Salle",
            seats:Math.max(0,Math.min(99,Math.trunc(Number(item.seats)||2))),
            sort_order:Math.trunc(Number(item.sortOrder)||i),
            x:Number.isFinite(Number(item.x))?Number(item.x):null,
            y:Number.isFinite(Number(item.y))?Number(item.y):null,
            active:item.active!==false,
            updated_at:new Date().toISOString()
          };
          const id=clean(item.id,64);if(validUuid(id))row.id=id;
          rows.push(row);
        }
        if(rows.length){
          const {error}=await ctx.supabaseAdmin.from("pos_tables").upsert(rows,{onConflict:"restaurant_id,label"});
          if(error)return json({error:error.message},500);
        }
        if(body.replace===true){
          const keep=new Set(rows.map((x:any)=>x.label));
          const {data:existing,error:existingError}=await ctx.supabaseAdmin.from("pos_tables").select("id,label").eq("restaurant_id",restaurantId);
          if(existingError)return json({error:existingError.message},500);
          const deactivate=(existing||[]).filter((x:any)=>!keep.has(x.label)).map((x:any)=>x.id);
          if(deactivate.length){
            const {error}=await ctx.supabaseAdmin.from("pos_tables").update({active:false,updated_at:new Date().toISOString()}).in("id",deactivate);
            if(error)return json({error:error.message},500);
          }
        }
        const {data,error}=await ctx.supabaseAdmin.from("pos_tables")
          .select("id,label,area,seats,sort_order,x,y,active,updated_at")
          .eq("restaurant_id",restaurantId).eq("active",true).order("area").order("sort_order").order("label");
        if(error)return json({error:error.message},500);
        return json({ok:true,count:data?.length||0,rows:data||[]});
      }

      if(action==="save_open_order"){
        const order=body.order||{};
        const orderId=clean(order.id,64),eventId=clean(order.clientEventId,64),deviceId=clean(order.deviceId,64),sessionId=clean(order.cashSessionId,64);
        const businessDate=clean(order.businessDate,10),tableId=clean(order.tableId,64);
        if(!validUuid(orderId)||!validUuid(eventId)||!validUuid(deviceId)||!validUuid(sessionId)||!validDate(businessDate)){
          return json({error:"Invalid open-order identity"},400);
        }
        if(!Array.isArray(order.lines)||!order.lines.length)return json({error:"Order lines required"},400);
        const {data,error}=await ctx.supabaseAdmin.rpc("pos_save_open_order",{
          p_order_id:orderId,
          p_client_event_id:eventId,
          p_organization_id:restaurant.organization_id,
          p_restaurant_id:restaurantId,
          p_device_id:deviceId,
          p_cash_session_id:sessionId,
          p_business_date:businessDate,
          p_service_type:clean(order.serviceType,30)||"dine_in",
          p_table_id:validUuid(tableId)?tableId:null,
          p_table_label:clean(order.tableLabel,80)||null,
          p_covers:Math.max(0,Math.trunc(Number(order.covers)||0)),
          p_currency:clean(order.currency,3).toUpperCase()||restaurant.currency||"CHF",
          p_lines:order.lines,
          p_actor_user_id:userId,
          p_occurred_at:order.occurredAt||new Date().toISOString()
        });
        if(error)return json({error:error.message},409);
        return json({ok:true,order:data});
      }

      if(action==="settle_open_order"){
        const orderId=clean(body.orderId,64),eventId=clean(body.clientEventId,64),deviceId=clean(body.deviceId,64),sessionId=clean(body.cashSessionId,64);
        if(!validUuid(orderId)||!validUuid(eventId)||!validUuid(deviceId)||!validUuid(sessionId))return json({error:"Invalid settlement identity"},400);
        const {data,error}=await ctx.supabaseAdmin.rpc("pos_settle_open_order",{
          p_order_id:orderId,
          p_client_event_id:eventId,
          p_device_id:deviceId,
          p_cash_session_id:sessionId,
          p_payment_method:clean(body.paymentMethod,30),
          p_payment_provider:clean(body.paymentProvider,80)||null,
          p_payment_reference:clean(body.paymentReference,180)||null,
          p_tip_amount:Math.max(0,Number(body.tipAmount)||0),
          p_actor_user_id:userId,
          p_occurred_at:body.occurredAt||new Date().toISOString()
        });
        if(error)return json({error:error.message},409);
        await attributeOrderTips(ctx.supabaseAdmin,orderId,operatorContext);
        await syncDirectPaymentFromPos(ctx.supabaseAdmin,orderId,userId);
        return json({ok:true,receipt:data});
      }

      if(action==="settle_open_order_split"){
        const orderId=clean(body.orderId,64),eventId=clean(body.clientEventId,64),deviceId=clean(body.deviceId,64),sessionId=clean(body.cashSessionId,64);
        const payments=Array.isArray(body.payments)?body.payments:[];
        if(!validUuid(orderId)||!validUuid(eventId)||!validUuid(deviceId)||!validUuid(sessionId)||!payments.length){
          return json({error:"Invalid split-payment payload"},400);
        }
        const normalized=payments.map((p:any)=>({
          method:clean(p?.method,30),
          amount:Math.round((Number(p?.amount)||0)*100)/100,
          tipAmount:Math.max(0,Math.round((Number(p?.tipAmount)||0)*100)/100),
          provider:clean(p?.provider,80)||null,
          providerReference:clean(p?.providerReference,180)||null
        }));
        const {data,error}=await ctx.supabaseAdmin.rpc("pos_settle_open_order_split",{
          p_order_id:orderId,
          p_client_event_id:eventId,
          p_device_id:deviceId,
          p_cash_session_id:sessionId,
          p_payments:normalized,
          p_actor_user_id:userId,
          p_occurred_at:body.occurredAt||new Date().toISOString()
        });
        if(error)return json({error:error.message},409);
        await attributeOrderTips(ctx.supabaseAdmin,orderId,operatorContext);
        await syncDirectPaymentFromPos(ctx.supabaseAdmin,orderId,userId);
        return json({ok:true,receipt:data});
      }

      if(action==="settle_open_order_allocated"){
        const orderId=clean(body.orderId,64),eventId=clean(body.clientEventId,64),deviceId=clean(body.deviceId,64),sessionId=clean(body.cashSessionId,64);
        const rawGroups=Array.isArray(body.groups)?body.groups:[];
        if(!validUuid(orderId)||!validUuid(eventId)||!validUuid(deviceId)||!validUuid(sessionId)||!rawGroups.length||rawGroups.length>12){
          return json({error:"Invalid allocated-payment payload"},400);
        }
        const groups:any[]=[];
        for(let gi=0;gi<rawGroups.length;gi++){
          const g=rawGroups[gi]||{};
          const selections=Array.isArray(g.selections)?g.selections:[];
          if(!selections.length||selections.length>300)return json({error:`Invalid selections for group ${gi+1}`},400);
          const cleanSelections:any[]=[];
          for(let si=0;si<selections.length;si++){
            const s=selections[si]||{};
            const itemId=clean(s.itemId,64),quantity=Number(s.quantity);
            if(!validUuid(itemId)||!Number.isFinite(quantity)||quantity<=0)return json({error:`Invalid allocation in group ${gi+1}`},400);
            cleanSelections.push({itemId,quantity:Math.round(quantity*1000)/1000});
          }
          groups.push({
            label:clean(g.label,80)||`Personne ${gi+1}`,
            method:clean(g.method,30),
            tipAmount:Math.max(0,Math.round((Number(g.tipAmount)||0)*100)/100),
            provider:clean(g.provider,80)||null,
            providerReference:clean(g.providerReference,180)||null,
            selections:cleanSelections
          });
        }
        const {data,error}=await ctx.supabaseAdmin.rpc("pos_settle_open_order_allocated",{
          p_order_id:orderId,
          p_client_event_id:eventId,
          p_device_id:deviceId,
          p_cash_session_id:sessionId,
          p_groups:groups,
          p_actor_user_id:userId,
          p_occurred_at:body.occurredAt||new Date().toISOString()
        });
        if(error)return json({error:error.message},409);
        await attributeOrderTips(ctx.supabaseAdmin,orderId,operatorContext);
        await syncDirectPaymentFromPos(ctx.supabaseAdmin,orderId,userId);
        return json({ok:true,receipt:data});
      }

      if(action==="pay_allocated_group"){
        const orderId=clean(body.orderId,64),eventId=clean(body.clientEventId,64),deviceId=clean(body.deviceId,64),sessionId=clean(body.cashSessionId,64);
        const selections=Array.isArray(body.selections)?body.selections:[];
        if(!validUuid(orderId)||!validUuid(eventId)||!validUuid(deviceId)||!validUuid(sessionId)||!selections.length||selections.length>300){
          return json({error:"Invalid progressive payment payload"},400);
        }
        const cleanSelections:any[]=[];
        for(let i=0;i<selections.length;i++){
          const s=selections[i]||{},itemId=clean(s.itemId,64),quantity=Number(s.quantity);
          if(!validUuid(itemId)||!Number.isFinite(quantity)||quantity<=0)return json({error:`Invalid selection at index ${i}`},400);
          cleanSelections.push({itemId,quantity:Math.round(quantity*1000)/1000});
        }
        const {data,error}=await ctx.supabaseAdmin.rpc("pos_pay_allocated_group",{
          p_order_id:orderId,p_client_event_id:eventId,p_device_id:deviceId,p_cash_session_id:sessionId,
          p_label:clean(body.label,80)||"Part",p_method:clean(body.method,30),p_selections:cleanSelections,
          p_tip_amount:Math.max(0,Math.round((Number(body.tipAmount)||0)*100)/100),
          p_provider:clean(body.provider,80)||null,p_provider_reference:clean(body.providerReference,180)||null,
          p_actor_user_id:userId,p_occurred_at:body.occurredAt||new Date().toISOString()
        });
        if(error)return json({error:error.message},409);
        await attributeOrderTips(ctx.supabaseAdmin,orderId,operatorContext);
        await syncDirectPaymentFromPos(ctx.supabaseAdmin,orderId,userId);
        return json({ok:true,payment:data});
      }

      if(action==="order_payment_progress"){
        const orderId=clean(body.orderId,64);
        if(!validUuid(orderId))return json({error:"Valid orderId required"},400);
        const {data:order,error:orderError}=await ctx.supabaseAdmin.from("pos_orders")
          .select("id,restaurant_id,receipt_number,status,total,tip_total,table_id,table_label,service_type,covers,business_date")
          .eq("id",orderId).eq("restaurant_id",restaurantId).maybeSingle();
        if(orderError)return json({error:orderError.message},500);
        if(!order)return json({error:"Order not found"},404);

        const [itemResult,allocationResult,paymentResult]=await Promise.all([
          ctx.supabaseAdmin.from("pos_order_items")
            .select("id,name_snapshot,quantity,unit_price,line_total,tax_rate,tax_amount,kitchen_status,note,modifiers")
            .eq("order_id",orderId).neq("kitchen_status","cancelled").order("created_at"),
          ctx.supabaseAdmin.from("pos_payment_allocations")
            .select("order_item_id,payment_id,quantity,amount,tax_amount").eq("order_id",orderId),
          ctx.supabaseAdmin.from("pos_payments")
            .select("id,method,amount,tip_amount,tip_operator_id,tip_operator_name_snapshot,status,paid_at,metadata,receipt_number")
            .eq("order_id",orderId).eq("status","captured").order("paid_at")
        ]);
        if(itemResult.error||allocationResult.error||paymentResult.error){
          return json({error:itemResult.error?.message||allocationResult.error?.message||paymentResult.error?.message||"Unable to load payment progress"},500);
        }
        const payments=paymentResult.data||[],paidIds=new Set(payments.map((p:any)=>p.id));
        const paidByItem=new Map<string,number>();
        for(const a of allocationResult.data||[]){
          if(!paidIds.has(a.payment_id))continue;
          paidByItem.set(a.order_item_id,(paidByItem.get(a.order_item_id)||0)+Number(a.quantity||0));
        }
        let remainingAmount=0;
        const items=(itemResult.data||[]).map((i:any)=>{
          const paidQty=Math.round((paidByItem.get(i.id)||0)*1000)/1000;
          const remainingQty=Math.max(0,Math.round((Number(i.quantity||0)-paidQty)*1000)/1000);
          const qty=Number(i.quantity||0),lineTotal=Number(i.line_total||0);
          const remainingLine=qty?Math.round((lineTotal/qty)*remainingQty*100)/100:0;
          remainingAmount+=remainingLine;
          return {...i,paidQty,remainingQty,remainingAmount:remainingLine};
        });
        return json({ok:true,order,items,payments,remainingAmount:Math.max(0,Math.round(remainingAmount*100)/100)});
      }

      if(action==="transfer_open_order"){
        const orderId=clean(body.orderId,64),targetTableId=clean(body.targetTableId,64);
        if(!validUuid(orderId)||!validUuid(targetTableId))return json({error:"Valid orderId and targetTableId required"},400);
        const {data,error}=await ctx.supabaseAdmin.rpc("pos_transfer_open_order",{
          p_order_id:orderId,p_target_table_id:targetTableId,p_actor_user_id:userId
        });
        if(error)return json({error:error.message},409);
        return json({ok:true,order:data});
      }

      if(action==="cancel_open_order"){
        const orderId=clean(body.orderId,64),reason=clean(body.reason,500);
        if(!validUuid(orderId)||!reason)return json({error:"Order and cancellation reason required"},400);
        const {data,error}=await ctx.supabaseAdmin.rpc("pos_cancel_open_order",{
          p_order_id:orderId,p_reason:reason,p_actor_user_id:userId
        });
        if(error)return json({error:error.message},409);
        return json({ok:true,order:data});
      }

      if(action==="refund_order"){
        const orderId=clean(body.orderId,64),eventId=clean(body.clientEventId,64),sessionId=clean(body.cashSessionId,64),deviceId=clean(body.deviceId,64);
        const reason=clean(body.reason,500),method=clean(body.method,30);
        const amount=Math.round((Number(body.amount)||0)*100)/100;
        const tipAmount=Math.max(0,Math.round((Number(body.tipAmount)||0)*100)/100);
        if(!validUuid(orderId)||!validUuid(eventId)||!validUuid(sessionId)||!validUuid(deviceId)||!reason||amount<=0){
          return json({error:"Invalid refund payload"},400);
        }
        const {data,error}=await ctx.supabaseAdmin.rpc("pos_refund_order",{
          p_order_id:orderId,p_client_event_id:eventId,p_cash_session_id:sessionId,p_device_id:deviceId,
          p_method:method,p_amount:amount,p_tip_amount:tipAmount,p_reason:reason,
          p_provider:clean(body.provider,80)||null,p_provider_reference:clean(body.providerReference,180)||null,
          p_actor_user_id:userId,p_occurred_at:body.occurredAt||new Date().toISOString()
        });
        if(error)return json({error:error.message},409);
        return json({ok:true,refund:data});
      }

      if(action==="confirm_external_refund"){
        if(!manager)return json({error:"Manager access required"},403);
        const refundId=clean(body.refundId,64);
        if(!validUuid(refundId))return json({error:"Valid refundId required"},400);
        const {data,error}=await ctx.supabaseAdmin.rpc("pos_confirm_external_refund",{
          p_refund_id:refundId,p_success:body.success===true,
          p_provider_reference:clean(body.providerReference,180)||null,p_actor_user_id:userId
        });
        if(error)return json({error:error.message},409);
        return json({ok:true,refund:data});
      }

      if(action==="list_refunds"){
        let query=ctx.supabaseAdmin.from("pos_refunds")
          .select("id,order_id,method,amount,tip_amount,status,reason,provider,provider_reference,requested_at,completed_at")
          .eq("restaurant_id",restaurantId).order("requested_at",{ascending:false});
        const orderId=clean(body.orderId,64);
        if(validUuid(orderId))query=query.eq("order_id",orderId);
        const {data,error}=await query.limit(Math.max(1,Math.min(200,Math.trunc(Number(body.limit)||50))));
        if(error)return json({error:error.message},500);
        return json({ok:true,rows:data||[]});
      }

      if(action==="list_open_orders"){
        const {data:orders,error}=await ctx.supabaseAdmin.from("pos_orders")
          .select("id,business_date,table_id,table_label,service_type,status,currency,covers,subtotal,tax_total,total,opened_at,updated_at")
          .eq("restaurant_id",restaurantId).in("status",["open","sent","preparing","served","payment_pending"]).order("updated_at",{ascending:false}).limit(200);
        if(error)return json({error:error.message},500);
        const ids=(orders||[]).map((x:any)=>x.id);
        let items:any[]=[];
        if(ids.length){
          const itemResult=await ctx.supabaseAdmin.from("pos_order_items")
            .select("id,order_id,catalog_item_id,recipe_id,name_snapshot,sku_snapshot,quantity,unit_price,tax_rate,tax_amount,line_total,course,station_snapshot,kitchen_status,note,modifiers")
            .in("order_id",ids).order("created_at");
          if(itemResult.error)return json({error:itemResult.error.message},500);
          items=itemResult.data||[];
        }
        const byOrder=new Map<string,any[]>();
        for(const item of items){
          if(!byOrder.has(item.order_id))byOrder.set(item.order_id,[]);
          byOrder.get(item.order_id)!.push(item);
        }
        return json({ok:true,rows:(orders||[]).map((o:any)=>({...o,items:byOrder.get(o.id)||[]}))});
      }

      if(action==="append_order_items"){
        const orderId=clean(body.orderId,64),eventId=clean(body.clientEventId,64);
        const lines=Array.isArray(body.lines)?body.lines:[];
        if(!validUuid(orderId)||!validUuid(eventId)||!lines.length){
          return json({error:"Valid orderId, clientEventId and lines required"},400);
        }
        const {data,error}=await ctx.supabaseAdmin.rpc("pos_append_order_items",{
          p_order_id:orderId,
          p_client_event_id:eventId,
          p_lines:lines,
          p_actor_user_id:userId,
          p_occurred_at:body.occurredAt||new Date().toISOString()
        });
        if(error)return json({error:error.message},409);
        return json({ok:true,order:data});
      }

      if(action==="send_to_production"){
        const orderId=clean(body.orderId,64);
        if(!validUuid(orderId))return json({error:"Valid orderId required"},400);
        const {data,error}=await ctx.supabaseAdmin.rpc("pos_send_order_to_production",{
          p_order_id:orderId,p_actor_user_id:userId
        });
        if(error)return json({error:error.message},409);
        await patchDirectOrderFromPos(ctx.supabaseAdmin,orderId,{status:"preparing"},"production_started",userId);
        return json({ok:true,order:data});
      }

      if(action==="production_queue"){
        const station=clean(body.station,20).toLowerCase();
        const {data:orders,error}=await ctx.supabaseAdmin.from("pos_orders")
          .select("id,business_date,table_id,table_label,service_type,status,covers,production_priority,opened_at,updated_at")
          .eq("restaurant_id",restaurantId).in("status",["sent","preparing"]).order("updated_at");
        if(error)return json({error:error.message},500);
        const ids=(orders||[]).map((x:any)=>x.id);
        let items:any[]=[];
        if(ids.length){
          const itemQuery=ctx.supabaseAdmin.from("pos_order_items")
            .select("id,order_id,name_snapshot,quantity,course,station_snapshot,kitchen_status,note,modifiers,production_sent_at,production_started_at,production_ready_at,production_served_at,created_at")
            .in("order_id",ids).in("kitchen_status",["sent","preparing","ready"]).order("created_at");
          const itemResult=await itemQuery;
          if(itemResult.error)return json({error:itemResult.error.message},500);
          const routedTo=(item:any,target:string)=>{
            if(item.station_snapshot===target)return true;
            const mods=Array.isArray(item.modifiers)?item.modifiers:[];
            for(const entry of mods){
              for(const option of Array.isArray(entry?.options)?entry.options:[]){
                if(String(option?.station||entry?.station||"")===target)return true;
              }
              if(entry?.kind==="menu"){
                for(const choice of Array.isArray(entry?.choices)?entry.choices:[]){
                  for(const product of Array.isArray(choice?.products)?choice.products:[]){
                    if(String(product?.station||"")===target)return true;
                  }
                }
              }
            }
            return false;
          };
          const hasAnyProduction=(item:any)=>routedTo(item,"kitchen")||routedTo(item,"bar");
          items=(itemResult.data||[]).filter((item:any)=>
            ["kitchen","bar"].includes(station)?routedTo(item,station):hasAnyProduction(item)
          );
        }
        const byOrder=new Map<string,any[]>();
        for(const item of items){
          if(!byOrder.has(item.order_id))byOrder.set(item.order_id,[]);
          byOrder.get(item.order_id)!.push(item);
        }
        const {data:metrics}=await ctx.supabaseAdmin.rpc("pos_production_metrics",{
          p_restaurant_id:restaurantId,p_actor_user_id:userId
        });
        return json({ok:true,rows:(orders||[]).map((o:any)=>({...o,items:byOrder.get(o.id)||[]})).filter((o:any)=>o.items.length),metrics:metrics||{stations:[],products:[]}});
      }

      if(action==="set_production_priority"){
        const orderId=clean(body.orderId,64),priority=Math.max(0,Math.min(2,Math.trunc(Number(body.priority)||0)));
        if(!validUuid(orderId))return json({error:"Valid orderId required"},400);
        const {data,error}=await ctx.supabaseAdmin.rpc("pos_set_production_priority",{
          p_order_id:orderId,p_priority:priority,p_actor_user_id:userId
        });
        if(error)return json({error:error.message},409);
        return json({ok:true,order:data});
      }

      if(action==="recall_production_order"){
        const orderId=clean(body.orderId,64);
        if(!validUuid(orderId))return json({error:"Valid orderId required"},400);
        const {data,error}=await ctx.supabaseAdmin.rpc("pos_recall_production_order",{
          p_order_id:orderId,p_actor_user_id:userId
        });
        if(error)return json({error:error.message},409);
        return json({ok:true,order:data});
      }

      if(action==="update_production_item"){
        const itemId=clean(body.itemId,64),status=clean(body.status,20).toLowerCase();
        if(!validUuid(itemId)||!["sent","preparing","ready","served","cancelled"].includes(status)){
          return json({error:"Valid itemId and production status required"},400);
        }
        const {data,error}=await ctx.supabaseAdmin.rpc("pos_update_production_item",{
          p_item_id:itemId,p_status:status,p_actor_user_id:userId
        });
        if(error)return json({error:error.message},409);
        const posOrderId=clean((data as any)?.orderId,64);if(validUuid(posOrderId))await syncDirectProductionFromPos(ctx.supabaseAdmin,posOrderId,userId);
        return json({ok:true,item:data});
      }

      if(action==="recent_receipts"){
        const limit=Math.max(1,Math.min(100,Math.trunc(Number(body.limit)||30)));
        const {data,error}=await ctx.supabaseAdmin.from("pos_orders")
          .select("id,business_date,receipt_number,status,total,tip_total,currency,service_type,table_label,covers,closed_at,items:pos_order_items(id,name_snapshot,quantity,unit_price,tax_rate,tax_amount,line_total,note,modifiers),payments:pos_payments(id,method,amount,tip_amount,tip_operator_id,tip_operator_name_snapshot,status,provider,provider_reference,metadata,receipt_number),refunds:pos_refunds(id,method,amount,tip_amount,status,reason,provider_reference,requested_at,completed_at)")
          .eq("restaurant_id",restaurantId).in("status",["paid","refunded"]).order("closed_at",{ascending:false}).limit(limit);
        if(error)return json({error:error.message},500);
        return json({ok:true,rows:data||[]});
      }

      if(action==="pull_events"){
        const after=Math.max(0,Math.trunc(Number(body.after)||0));
        const limit=Math.max(1,Math.min(200,Math.trunc(Number(body.limit)||100)));
        const {data,error}=await ctx.supabaseAdmin.from("pos_event_log")
          .select("sequence,client_event_id,entity_type,entity_id,event_type,payload,occurred_at,received_at")
          .eq("restaurant_id",restaurantId).gt("sequence",after).order("sequence").limit(limit);
        if(error)return json({error:error.message},500);
        const events=data||[];
        return json({ok:true,events,nextCursor:events.length?Number(events[events.length-1].sequence):after});
      }

      if(action==="list_provider_connections"){
        if(!manager)return json({error:"Manager access required"},403);
        const {data,error}=await ctx.supabaseAdmin.from("pos_provider_connections")
          .select("id,provider,integration_mode,environment,status,merchant_reference,public_config,secret_version,notes,created_at,updated_at")
          .eq("restaurant_id",restaurantId).order("provider").order("environment");
        if(error)return json({error:error.message},500);
        return json({
          ok:true,
          rows:data||[],
          automaticTransactions:false,
          officialPaths:{
            worldline:["terminal_api_cloud","tim"],
            twint:["direct","terminal_psp"]
          }
        });
      }

      if(action==="upsert_provider_connection"){
        if(!manager)return json({error:"Manager access required"},403);
        const c=body.connection||{},connectionId=clean(c.id,64);
        const {data,error}=await ctx.supabaseAdmin.rpc("pos_upsert_provider_connection",{
          p_connection_id:validUuid(connectionId)?connectionId:null,
          p_restaurant_id:restaurantId,
          p_provider:clean(c.provider,30).toLowerCase(),
          p_integration_mode:clean(c.integrationMode,40).toLowerCase(),
          p_environment:clean(c.environment,20).toLowerCase()||"test",
          p_status:clean(c.status,40).toLowerCase()||"not_configured",
          p_merchant_reference:clean(c.merchantReference,180)||null,
          p_public_config:c.publicConfig&&typeof c.publicConfig==="object"?c.publicConfig:{},
          p_notes:clean(c.notes,1000)||null,
          p_actor_user_id:userId
        });
        if(error)return json({error:error.message},409);
        return json({ok:true,connection:data,automaticTransactions:false});
      }

      if(action==="inventory_movements"){
        if(!manager)return json({error:"Manager access required"},403);
        const after=Math.max(0,Math.trunc(Number(body.after)||0));
        const limit=Math.max(1,Math.min(1000,Math.trunc(Number(body.limit)||300)));
        let query=ctx.supabaseAdmin.from("pos_inventory_movements")
          .select("id,sequence,order_id,order_item_id,catalog_item_id,hub_stock_id,stock_source_key,stock_name,unit,kind,quantity_delta,unit_cost,total_cost,business_date,receipt_number,acknowledged_at,created_at")
          .eq("restaurant_id",restaurantId).gt("sequence",after).order("sequence").limit(limit);
        if(body.unacknowledged!==false)query=query.is("acknowledged_at",null);
        const {data,error}=await query;
        if(error)return json({error:error.message},500);
        return json({ok:true,rows:data||[],cursor:(data||[]).reduce((m:any,x:any)=>Math.max(m,Number(x.sequence)||0),after)});
      }

      if(action==="ack_inventory_movements"){
        if(!manager)return json({error:"Manager access required"},403);
        const ids=(Array.isArray(body.movementIds)?body.movementIds:[]).map((x:any)=>clean(x,64)).filter(validUuid).slice(0,1000);
        if(!ids.length)return json({ok:true,count:0});
        const {data,error}=await ctx.supabaseAdmin.rpc("pos_ack_inventory_movements",{
          p_restaurant_id:restaurantId,p_movement_ids:ids,p_actor_user_id:userId
        });
        if(error)return json({error:error.message},409);
        return json({ok:true,count:Number(data)||0});
      }

      if(action==="food_cost_report"){
        if(!manager)return json({error:"Manager access required"},403);
        const businessDate=clean(body.businessDate,10);
        if(!validDate(businessDate))return json({error:"Valid businessDate required"},400);
        const {data,error}=await ctx.supabaseAdmin.rpc("pos_food_cost_report",{
          p_restaurant_id:restaurantId,p_business_date:businessDate,p_actor_user_id:userId
        });
        if(error)return json({error:error.message},409);
        return json({ok:true,report:data});
      }

      if(action==="accounting_export"){
        if(!manager)return json({error:"Manager access required"},403);
        const from=clean(body.from,10),to=clean(body.to,10);
        if(!validDate(from)||!validDate(to)||from>to)return json({error:"Valid from/to business dates required"},400);
        const {data:orders,error:orderError}=await ctx.supabaseAdmin.from("pos_orders")
          .select("id,business_date,receipt_number,status,service_type,table_label,covers,subtotal,tax_total,total,tip_total,currency,closed_at")
          .eq("restaurant_id",restaurantId).gte("business_date",from).lte("business_date",to)
          .in("status",["paid","refunded"]).order("business_date").order("receipt_number");
        if(orderError)return json({error:orderError.message},500);
        const ids=(orders||[]).map((x:any)=>x.id);
        let items:any[]=[],payments:any[]=[],refunds:any[]=[];
        if(ids.length){
          const [itemResult,paymentResult,refundResult]=await Promise.all([
            ctx.supabaseAdmin.from("pos_order_items")
              .select("id,order_id,name_snapshot,quantity,unit_price,tax_rate,tax_amount,line_total")
              .in("order_id",ids).order("order_id"),
            ctx.supabaseAdmin.from("pos_payments")
              .select("id,order_id,method,amount,tip_amount,status,provider,provider_reference,receipt_number,created_at")
              .in("order_id",ids).order("created_at"),
            ctx.supabaseAdmin.from("pos_refunds")
              .select("id,order_id,method,amount,tip_amount,status,reason,provider_reference,requested_at,completed_at")
              .in("order_id",ids).order("requested_at")
          ]);
          if(itemResult.error)return json({error:itemResult.error.message},500);
          if(paymentResult.error)return json({error:paymentResult.error.message},500);
          if(refundResult.error)return json({error:refundResult.error.message},500);
          items=itemResult.data||[];payments=paymentResult.data||[];refunds=refundResult.data||[];
        }
        const taxMap=new Map<string,{taxRate:number,net:number,tax:number,gross:number}>();
        for(const item of items){
          const rate=Math.round((Number(item.tax_rate)||0)*1000)/1000,gross=Number(item.line_total)||0,tax=Number(item.tax_amount)||0,net=gross-tax,key=String(rate),row=taxMap.get(key)||{taxRate:rate,net:0,tax:0,gross:0};
          row.net+=net;row.tax+=tax;row.gross+=gross;taxMap.set(key,row);
        }
        const round2=(value:number)=>Math.round(value*100)/100;
        const taxSummary=[...taxMap.values()].map(x=>({taxRate:x.taxRate,net:round2(x.net),tax:round2(x.tax),gross:round2(x.gross)})).sort((a,b)=>a.taxRate-b.taxRate);
        const paymentMap=new Map<string,number>();
        for(const payment of payments){
          if(!["captured","completed","paid"].includes(String(payment.status||"").toLowerCase()))continue;
          const method=String(payment.method||"other"),amount=(Number(payment.amount)||0)+(Number(payment.tip_amount)||0);
          paymentMap.set(method,(paymentMap.get(method)||0)+amount);
        }
        for(const refund of refunds){
          if(String(refund.status||"").toLowerCase()!=="completed")continue;
          const method=String(refund.method||"other"),amount=(Number(refund.amount)||0)+(Number(refund.tip_amount)||0);
          paymentMap.set(method,(paymentMap.get(method)||0)-amount);
        }
        const paymentSummary=[...paymentMap.entries()].map(([method,amount])=>({method,amount:round2(amount)})).sort((a,b)=>a.method.localeCompare(b.method));
        return json({
          ok:true,restaurant:{id:restaurant.id,name:restaurant.name,currency:restaurant.currency,timezone:restaurant.timezone},
          range:{from,to},orders:orders||[],items,payments,refunds,taxSummary,paymentSummary,
          accountingNotes:{refundTaxAllocation:"Refunds are exported separately; review VAT allocation for partial refunds before posting."}
        });
      }

      if(action==="list_printers"){
        const {data,error}=await ctx.supabaseAdmin.from("pos_printers")
          .select("id,device_id,label,role,connection_type,address,chars_per_line,codepage,auto_print,cut_after_print,active,status,last_tested_at,public_config,created_at,updated_at")
          .eq("restaurant_id",restaurantId).order("role").order("label");
        if(error)return json({error:error.message},500);
        return json({ok:true,rows:data||[]});
      }

      if(action==="upsert_printer"){
        if(!manager)return json({error:"Manager access required"},403);
        const p=body.printer||{};
        const printerId=clean(p.id,64),deviceId=clean(p.deviceId,64);
        const {data,error}=await ctx.supabaseAdmin.rpc("pos_upsert_printer",{
          p_printer_id:validUuid(printerId)?printerId:null,
          p_restaurant_id:restaurantId,
          p_device_id:validUuid(deviceId)?deviceId:null,
          p_label:clean(p.label,120),
          p_role:clean(p.role,30).toLowerCase(),
          p_connection_type:clean(p.connectionType,30).toLowerCase(),
          p_address:clean(p.address,240)||null,
          p_chars_per_line:Math.max(24,Math.min(80,Math.trunc(Number(p.charsPerLine)||42))),
          p_codepage:clean(p.codepage,40)||"ascii",
          p_auto_print:p.autoPrint===true,
          p_cut_after_print:p.cutAfterPrint!==false,
          p_active:p.active!==false,
          p_public_config:p.publicConfig&&typeof p.publicConfig==="object"?p.publicConfig:{},
          p_actor_user_id:userId
        });
        if(error)return json({error:error.message},409);
        return json({ok:true,printer:data});
      }

      if(action==="set_printer_status"){
        const printerId=clean(body.printerId,64),status=clean(body.status,20).toLowerCase();
        if(!validUuid(printerId))return json({error:"Valid printerId required"},400);
        const {data,error}=await ctx.supabaseAdmin.rpc("pos_set_printer_status",{
          p_printer_id:printerId,p_status:status,p_actor_user_id:userId
        });
        if(error)return json({error:error.message},409);
        return json({ok:true,printer:data});
      }

      if(action==="list_terminals"){
        const {data,error}=await ctx.supabaseAdmin.from("pos_payment_terminals")
          .select("id,device_id,label,provider,integration_mode,external_terminal_id,currency,supports_card,supports_twint,supports_tips,supports_refunds,active,connection_status,last_seen_at,created_at,updated_at")
          .eq("restaurant_id",restaurantId).order("label");
        if(error)return json({error:error.message},500);
        return json({ok:true,rows:data||[],providerConnections:false});
      }

      if(action==="upsert_terminal"){
        if(!manager)return json({error:"Manager access required"},403);
        const terminal=body.terminal||{};
        const terminalId=clean(terminal.id,64);
        const deviceId=clean(terminal.deviceId,64);
        const provider=clean(terminal.provider,30).toLowerCase();
        const mode=clean(terminal.integrationMode,30).toLowerCase();
        const {data,error}=await ctx.supabaseAdmin.rpc("pos_upsert_payment_terminal",{
          p_terminal_id:validUuid(terminalId)?terminalId:null,
          p_restaurant_id:restaurantId,
          p_device_id:validUuid(deviceId)?deviceId:null,
          p_label:clean(terminal.label,120),
          p_provider:provider,
          p_integration_mode:mode||"cloud",
          p_external_terminal_id:clean(terminal.externalTerminalId,180)||null,
          p_currency:clean(terminal.currency,3).toUpperCase()||restaurant.currency||"CHF",
          p_supports_card:terminal.supportsCard!==false,
          p_supports_twint:terminal.supportsTwint===true,
          p_supports_tips:terminal.supportsTips!==false,
          p_supports_refunds:terminal.supportsRefunds!==false,
          p_active:terminal.active===true,
          p_public_config:terminal.publicConfig&&typeof terminal.publicConfig==="object"?terminal.publicConfig:{},
          p_actor_user_id:userId
        });
        if(error)return json({error:error.message},409);
        return json({ok:true,terminal:data});
      }

      if(action==="list_terminal_intents"){
        let query=ctx.supabaseAdmin.from("pos_payment_intents")
          .select("id,order_id,refund_id,payment_id,terminal_id,kind,method,amount,tip_amount,currency,status,provider,provider_reference,provider_status,error_code,error_message,created_at,completed_at")
          .eq("restaurant_id",restaurantId).order("created_at",{ascending:false});
        const orderId=clean(body.orderId,64),terminalId=clean(body.terminalId,64);
        if(validUuid(orderId))query=query.eq("order_id",orderId);
        if(validUuid(terminalId))query=query.eq("terminal_id",terminalId);
        const {data,error}=await query.limit(Math.max(1,Math.min(100,Math.trunc(Number(body.limit)||30))));
        if(error)return json({error:error.message},500);
        return json({ok:true,rows:data||[]});
      }

      if(action==="create_terminal_intent"){
        const orderId=clean(body.orderId,64),eventId=clean(body.clientEventId,64),terminalId=clean(body.terminalId,64),deviceId=clean(body.deviceId,64),sessionId=clean(body.cashSessionId,64);
        if(!validUuid(orderId)||!validUuid(eventId)||!validUuid(terminalId)||!validUuid(deviceId)||!validUuid(sessionId)){
          return json({error:"Invalid terminal-intent identity"},400);
        }
        const {data,error}=await ctx.supabaseAdmin.rpc("pos_create_payment_intent",{
          p_order_id:orderId,p_client_event_id:eventId,p_terminal_id:terminalId,p_device_id:deviceId,p_cash_session_id:sessionId,
          p_method:clean(body.method,20).toLowerCase(),p_amount:Math.round((Number(body.amount)||0)*100)/100,
          p_tip_amount:Math.max(0,Math.round((Number(body.tipAmount)||0)*100)/100),
          p_actor_user_id:userId,p_metadata:{...(body.metadata&&typeof body.metadata==="object"?body.metadata:{}),...(operatorContext?.operator?.id?{tipOperatorId:String(operatorContext.operator.id),tipOperatorName:clean(operatorContext.operator.display_name||operatorContext.operator.displayName,120)}:{})}
        });
        if(error)return json({error:error.message},409);
        return json({ok:true,intent:data});
      }

      if(action==="create_terminal_refund_intent"){
        const refundId=clean(body.refundId,64),eventId=clean(body.clientEventId,64),terminalId=clean(body.terminalId,64);
        if(!validUuid(refundId)||!validUuid(eventId)||!validUuid(terminalId))return json({error:"Invalid refund-intent identity"},400);
        const {data,error}=await ctx.supabaseAdmin.rpc("pos_create_refund_intent",{
          p_refund_id:refundId,p_client_event_id:eventId,p_terminal_id:terminalId,
          p_actor_user_id:userId,p_metadata:body.metadata&&typeof body.metadata==="object"?body.metadata:{}
        });
        if(error)return json({error:error.message},409);
        return json({ok:true,intent:data});
      }

      if(action==="cancel_terminal_intent"){
        const intentId=clean(body.intentId,64);
        if(!validUuid(intentId))return json({error:"Valid intentId required"},400);
        const {data,error}=await ctx.supabaseAdmin.rpc("pos_cancel_payment_intent",{
          p_intent_id:intentId,p_actor_user_id:userId
        });
        if(error)return json({error:error.message},409);
        return json({ok:true,intent:data});
      }

      if(action==="service_report"){
        const businessDate=clean(body.businessDate,10);
        if(!validDate(businessDate))return json({error:"Valid businessDate required"},400);
        const {data,error}=await ctx.supabaseAdmin.rpc("pos_service_report",{
          p_restaurant_id:restaurantId,
          p_business_date:businessDate,
          p_actor_user_id:userId
        });
        if(error)return json({error:error.message},409);
        const tipsByOperator=await tipsByOperatorForDate(ctx.supabaseAdmin,restaurantId,businessDate);
        return json({ok:true,report:{...(data&&typeof data==="object"?data:{}),tipsByOperator}});
      }

      if(action==="list_direct_orders"){
        const statuses=(Array.isArray(body.statuses)?body.statuses:["pending","accepted"]).map((x:any)=>clean(x,30)).filter((x:string)=>["pending","accepted","imported","preparing","ready"].includes(x)).slice(0,10);
        const {data,error}=await ctx.supabaseAdmin.from("direct_orders")
          .select("id,public_reference,service_type,status,payment_status,payment_method,customer_name,customer_phone,customer_email,marketing_consent,table_label,covers,requested_for,note,subtotal,tax_total,total,currency,created_at,accepted_at,pos_order_id,direct_order_items(id,catalog_item_id,name_snapshot,quantity,unit_price,tax_rate,tax_amount,line_total,station_snapshot,note,modifiers)")
          .eq("restaurant_id",restaurantId).in("status",statuses.length?statuses:["pending","accepted"]).order("created_at",{ascending:true}).limit(200);
        if(error)return json({error:error.message},500);
        return json({ok:true,rows:data||[]});
      }

      if(action==="claim_direct_order"){
        const orderId=clean(body.directOrderId,64);if(!validUuid(orderId))return json({error:"Valid directOrderId required"},400);
        const now=new Date().toISOString();
        const {data,error}=await ctx.supabaseAdmin.from("direct_orders").update({status:"accepted",accepted_by:userId,accepted_at:now,updated_at:now})
          .eq("id",orderId).eq("restaurant_id",restaurantId).eq("status","pending")
          .select("id,public_reference,status,accepted_at,total,currency").maybeSingle();
        if(error)return json({error:error.message},409);
        if(!data){
          const {data:existing}=await ctx.supabaseAdmin.from("direct_orders").select("id,public_reference,status,accepted_at,total,currency").eq("id",orderId).eq("restaurant_id",restaurantId).maybeSingle();
          if(existing&&["accepted","imported","preparing","ready"].includes(existing.status))return json({ok:true,replayed:true,order:existing});
          return json({error:"Direct order is no longer available"},409);
        }
        await ctx.supabaseAdmin.from("direct_order_events").insert({direct_order_id:orderId,event_type:"accepted",actor_user_id:userId,details:{}});
        return json({ok:true,order:data});
      }

      if(action==="link_direct_order"){
        const directOrderId=clean(body.directOrderId,64),posOrderId=clean(body.posOrderId,64);if(!validUuid(directOrderId)||!validUuid(posOrderId))return json({error:"Valid order ids required"},400);
        const {data:posOrder}=await ctx.supabaseAdmin.from("pos_orders").select("id,restaurant_id,status").eq("id",posOrderId).eq("restaurant_id",restaurantId).maybeSingle();
        if(!posOrder)return json({error:"POS order not found"},404);
        const now=new Date().toISOString(),{data,error}=await ctx.supabaseAdmin.from("direct_orders").update({status:"imported",pos_order_id:posOrderId,updated_at:now})
          .eq("id",directOrderId).eq("restaurant_id",restaurantId).in("status",["accepted","imported"]).select("id,public_reference,status,pos_order_id").maybeSingle();
        if(error||!data)return json({error:error?.message||"Direct order cannot be linked"},409);
        await ctx.supabaseAdmin.from("direct_order_events").insert({direct_order_id:directOrderId,event_type:"imported_to_pos",actor_user_id:userId,details:{posOrderId}});
        return json({ok:true,order:data});
      }

      if(action==="reject_direct_order"){
        const orderId=clean(body.directOrderId,64),reason=clean(body.reason,400);if(!validUuid(orderId)||!reason)return json({error:"Direct order and reason required"},400);
        const now=new Date().toISOString(),{data,error}=await ctx.supabaseAdmin.from("direct_orders").update({status:"rejected",updated_at:now})
          .eq("id",orderId).eq("restaurant_id",restaurantId).in("status",["pending","accepted"]).select("id,public_reference,status").maybeSingle();
        if(error||!data)return json({error:error?.message||"Direct order cannot be rejected"},409);
        await ctx.supabaseAdmin.from("direct_order_events").insert({direct_order_id:orderId,event_type:"rejected",actor_user_id:userId,details:{reason}});
        return json({ok:true,order:data});
      }

      if(action==="daily_summary"){
        let query=ctx.supabaseAdmin.from("pos_daily_sales_summary")
          .select("*").eq("restaurant_id",restaurantId).order("business_date",{ascending:false});
        const from=clean(body.from,10),to=clean(body.to,10);
        if(validDate(from))query=query.gte("business_date",from);
        if(validDate(to))query=query.lte("business_date",to);
        const {data,error}=await query.limit(370);
        if(error)return json({error:error.message},500);
        return json({ok:true,rows:data||[]});
      }

      return json({error:"Unsupported action"},400);
    }catch(error){
      return json({error:error instanceof Error?error.message:"Unexpected POS sync error"},500);
    }
  })
};
