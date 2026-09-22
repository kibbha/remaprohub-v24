import { withSupabase } from "npm:@supabase/server@1.4.1";

const json=(data:unknown,status=200)=>Response.json(data,{status});
const clean=(value:unknown,max=160)=>String(value??"").trim().slice(0,max);
const validUuid=(value:unknown)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value||""));

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

      if(action==="bootstrap"){
        const [{data:catalog,error:catalogError},{data:profile},{data:lastEvent}] = await Promise.all([
          ctx.supabaseAdmin.from("pos_catalog_items")
            .select("id,recipe_id,sku,name,category,item_type,price,tax_rate,active,sort_order,metadata,version,updated_at")
            .eq("restaurant_id",restaurantId).eq("active",true).order("sort_order").order("name"),
          ctx.supabaseAdmin.from("profiles").select("id,first_name,last_name,locale").eq("id",userId).maybeSingle(),
          ctx.supabaseAdmin.from("pos_event_log").select("sequence").eq("restaurant_id",restaurantId).order("sequence",{ascending:false}).limit(1).maybeSingle()
        ]);
        if(catalogError)return json({error:"Unable to load POS catalog"},500);
        return json({
          ok:true,
          restaurant,
          profile:profile||null,
          catalog:catalog||[],
          serverCursor:Number(lastEvent?.sequence||0),
          capabilities:{
            offlineQueue:true,
            cashSessions:true,
            splitPayments:true,
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
        if(/^\d{4}-\d{2}-\d{2}$/.test(from))query=query.gte("business_date",from);
        if(/^\d{4}-\d{2}-\d{2}$/.test(to))query=query.lte("business_date",to);
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
