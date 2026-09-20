import { createClient } from "npm:@supabase/supabase-js@2";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json"}});

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  const expected=String(Deno.env.get("REVENUECAT_WEBHOOK_SECRET")||"");
  if(!expected||req.headers.get("authorization")!==`Bearer ${expected}`)return json({error:"Unauthorized"},401);

  try{
    const body=await req.json(),event=body?.event||body;
    const eventId=String(event?.id||"");
    const appUserId=String(event?.app_user_id||"");
    const [userId,organizationId]=appUserId.split(":");
    if(!eventId||!userId||!organizationId)return json({error:"Invalid RevenueCat payload"},400);

    const url=String(Deno.env.get("SUPABASE_URL")||"");
    const serviceKey=String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"");
    if(!url||!serviceKey)return json({error:"Supabase server credentials missing"},503);
    const admin=createClient(url,serviceKey,{auth:{persistSession:false}});

    const {data:membership}=await admin.from("memberships")
      .select("id").eq("user_id",userId).eq("organization_id",organizationId).limit(1).maybeSingle();
    if(!membership)return json({error:"RevenueCat user is not a member of the organization"},403);

    const {data:existingEvent}=await admin.from("subscription_events")
      .select("id").eq("revenuecat_event_id",eventId).maybeSingle();
    if(existingEvent)return json({ok:true,duplicate:true});

    const type=String(event?.type||"");
    const productId=String(event?.product_id||event?.product_identifier||"");
    const entitlementIds=Array.isArray(event?.entitlement_ids)?event.entitlement_ids.map(String):[];
    const planCode=entitlementIds.includes("multi")||/multi/i.test(productId)?"multi":"standard";
    const {data:plan,error:planError}=await admin.from("subscription_plans").select("id,code").eq("code",planCode).eq("active",true).single();
    if(planError||!plan)return json({error:"Subscription plan not found"},500);

    const expirationMs=Number(event?.expiration_at_ms||0);
    const expiration=expirationMs?new Date(expirationMs).toISOString():null;
    let status="active",cancelAtPeriodEnd=false;
    if(type==="EXPIRATION")status="expired";
    else if(type==="BILLING_ISSUE")status="past_due";
    else if(type==="SUBSCRIPTION_PAUSED")status="paused";
    else if(type==="CANCELLATION"){status=expirationMs>Date.now()?"active":"canceled";cancelAtPeriodEnd=true}
    else if(type==="UNCANCELLATION"){status="active";cancelAtPeriodEnd=false}

    const now=new Date().toISOString();
    const {error:subError}=await admin.from("subscriptions").upsert({
      organization_id:organizationId,
      plan_id:plan.id,
      status,
      current_period_end:expiration,
      cancel_at_period_end:cancelAtPeriodEnd,
      revenuecat_app_user_id:appUserId,
      revenuecat_product_id:productId,
      revenuecat_entitlement:planCode,
      store:String(event?.store||"PLAY_STORE").toLowerCase(),
      updated_at:now
    },{onConflict:"organization_id"});
    if(subError)return json({error:subError.message},500);

    const {error:eventError}=await admin.from("subscription_events").insert({
      organization_id:organizationId,
      event_type:type||"UNKNOWN",
      payload:event,
      revenuecat_event_id:eventId,
      app_user_id:appUserId
    });
    if(eventError)return json({error:eventError.message},500);

    return json({ok:true,organizationId,plan:planCode,status});
  }catch(error){
    return json({error:error instanceof Error?error.message:"Unexpected webhook error"},500);
  }
});
