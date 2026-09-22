import { withSupabase } from "npm:@supabase/server@1.4.1";

const json=(data:unknown,status=200)=>Response.json(data,{status});
const clean=(value:unknown,max=160)=>String(value??"").trim().slice(0,max);
const validUuid=(value:unknown)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value||""));
const validDate=(value:unknown)=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||""));

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
        "list_printers","upsert_printer"
      ]);
      const permissionMap:Record<string,string>={
        open_cash_session:"cash",close_cash_session:"cash",service_report:"cash",
        commit_order:"sale",save_open_order:"sale",settle_open_order:"sale",settle_open_order_split:"sale",
        settle_open_order_allocated:"sale",pay_allocated_group:"sale",create_terminal_intent:"sale",
        refund_order:"refund",create_terminal_refund_intent:"refund",confirm_external_refund:"refund",
        cancel_open_order:"cancel",transfer_open_order:"transfer",
        send_to_production:"production",update_production_item:"production",
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

      if(action==="bootstrap"){
        const deviceId=clean(body.deviceId,64);
        const requests:any[]=[
          ctx.supabaseAdmin.from("pos_catalog_items")
            .select("id,source_key,recipe_id,sku,name,category,item_type,price,tax_rate,production_station,active,sort_order,metadata,version,updated_at")
            .eq("restaurant_id",restaurantId).eq("active",true).order("sort_order").order("name"),
          ctx.supabaseAdmin.from("profiles").select("id,first_name,last_name,locale").eq("id",userId).maybeSingle(),
          ctx.supabaseAdmin.from("pos_event_log").select("sequence").eq("restaurant_id",restaurantId).order("sequence",{ascending:false}).limit(1).maybeSingle()
        ];
        if(validUuid(deviceId)){
          requests.push(ctx.supabaseAdmin.from("pos_cash_sessions")
            .select("id,business_date,status,opening_cash,expected_cash,counted_cash,difference_cash,opened_at,closed_at")
            .eq("restaurant_id",restaurantId).eq("device_id",deviceId).eq("status","open").maybeSingle());
        }
        const results=await Promise.all(requests);
        const catalogResult=results[0],profileResult=results[1],eventResult=results[2],sessionResult=results[3];
        if(catalogResult.error)return json({error:"Unable to load POS catalog"},500);
        return json({
          ok:true,
          restaurant,
          profile:profileResult.data||null,
          catalog:catalogResult.data||[],
          openSession:sessionResult?.data||null,
          serverCursor:Number(eventResult.data?.sequence||0),
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
            kitchen:true,
            serviceReports:true,
            paymentTerminalProfiles:true,
            terminalIntents:true,
            operatorPins:true,
            operatorPermissions:true,
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
        return json({ok:true,receipt:data});
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
            .select("id,name_snapshot,quantity,unit_price,line_total,tax_rate,tax_amount,kitchen_status,note")
            .eq("order_id",orderId).neq("kitchen_status","cancelled").order("created_at"),
          ctx.supabaseAdmin.from("pos_payment_allocations")
            .select("order_item_id,payment_id,quantity,amount,tax_amount").eq("order_id",orderId),
          ctx.supabaseAdmin.from("pos_payments")
            .select("id,method,amount,tip_amount,status,paid_at,metadata,receipt_number")
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
            .select("id,order_id,catalog_item_id,recipe_id,name_snapshot,sku_snapshot,quantity,unit_price,tax_rate,tax_amount,line_total,course,station_snapshot,kitchen_status,note")
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
        return json({ok:true,order:data});
      }

      if(action==="production_queue"){
        const station=clean(body.station,20).toLowerCase();
        const {data:orders,error}=await ctx.supabaseAdmin.from("pos_orders")
          .select("id,business_date,table_id,table_label,service_type,status,covers,opened_at,updated_at")
          .eq("restaurant_id",restaurantId).in("status",["sent","preparing"]).order("updated_at");
        if(error)return json({error:error.message},500);
        const ids=(orders||[]).map((x:any)=>x.id);
        let items:any[]=[];
        if(ids.length){
          let itemQuery=ctx.supabaseAdmin.from("pos_order_items")
            .select("id,order_id,name_snapshot,quantity,course,station_snapshot,kitchen_status,note,created_at")
            .in("order_id",ids).in("kitchen_status",["sent","preparing","ready"]).neq("station_snapshot","none").order("created_at");
          if(["kitchen","bar"].includes(station))itemQuery=itemQuery.eq("station_snapshot",station);
          const itemResult=await itemQuery;
          if(itemResult.error)return json({error:itemResult.error.message},500);
          items=itemResult.data||[];
        }
        const byOrder=new Map<string,any[]>();
        for(const item of items){
          if(!byOrder.has(item.order_id))byOrder.set(item.order_id,[]);
          byOrder.get(item.order_id)!.push(item);
        }
        return json({ok:true,rows:(orders||[]).map((o:any)=>({...o,items:byOrder.get(o.id)||[]})).filter((o:any)=>o.items.length)});
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
        return json({ok:true,item:data});
      }

      if(action==="recent_receipts"){
        const limit=Math.max(1,Math.min(100,Math.trunc(Number(body.limit)||30)));
        const {data,error}=await ctx.supabaseAdmin.from("pos_orders")
          .select("id,business_date,receipt_number,status,total,tip_total,currency,service_type,table_label,covers,closed_at,items:pos_order_items(id,name_snapshot,quantity,unit_price,tax_rate,tax_amount,line_total,note),payments:pos_payments(id,method,amount,tip_amount,status,provider,provider_reference,metadata,receipt_number),refunds:pos_refunds(id,method,amount,tip_amount,status,reason,provider_reference,requested_at,completed_at)")
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
          p_actor_user_id:userId,p_metadata:body.metadata&&typeof body.metadata==="object"?body.metadata:{}
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
        return json({ok:true,report:data});
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
