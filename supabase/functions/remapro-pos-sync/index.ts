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

      if(action==="bootstrap"){
        const deviceId=clean(body.deviceId,64);
        const requests:any[]=[
          ctx.supabaseAdmin.from("pos_catalog_items")
            .select("id,source_key,recipe_id,sku,name,category,item_type,price,tax_rate,active,sort_order,metadata,version,updated_at")
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
            splitPayments:false,
            paymentProviders:false,
            kitchen:false
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
          .select("id,source_key,recipe_id,sku,name,category,item_type,price,tax_rate,active,sort_order,metadata,version,updated_at")
          .eq("restaurant_id",restaurantId).eq("active",true).order("sort_order").order("name");
        if(catalogError)return json({error:catalogError.message},500);
        return json({ok:true,count:catalog?.length||0,catalog:catalog||[]});
      }

      if(action==="recent_receipts"){
        const limit=Math.max(1,Math.min(100,Math.trunc(Number(body.limit)||30)));
        const {data,error}=await ctx.supabaseAdmin.from("pos_orders")
          .select("id,business_date,receipt_number,status,total,tip_total,currency,service_type,table_label,covers,closed_at")
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
