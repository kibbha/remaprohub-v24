import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import { classifyRevenueCatEvent, revenueCatEventRecordId } from "./policy.mjs";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{
  status,headers:{...cors,"Content-Type":"application/json"}
});
const validUuid=(value:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  const expected=String(Deno.env.get("REVENUECAT_WEBHOOK_SECRET")||"");
  if(!expected||req.headers.get("authorization")!==`Bearer ${expected}`)return json({error:"Unauthorized"},401);

  try{
    const body=await req.json(),event=body?.event||body;
    const policy=classifyRevenueCatEvent(event);
    if(policy.action==="ignore")return json({ok:true,ignored:true,reason:policy.reason});

    const eventId=String(event?.id||"");
    const appUserId=String(event?.app_user_id||"");
    const [userId,organizationId,...rest]=appUserId.split(":");
    if(!eventId||eventId.length>256||rest.length||!validUuid(userId)||!validUuid(organizationId)){
      return json({error:"Invalid RevenueCat payload"},400);
    }

    const url=String(Deno.env.get("SUPABASE_URL")||"");
    const serviceKey=String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"");
    if(!url||!serviceKey)return json({error:"Supabase server credentials missing"},503);
    const admin=createClient(url,serviceKey,{auth:{persistSession:false}});
    const recordId=await revenueCatEventRecordId(eventId);

    // The database RPC holds an organization-scoped transaction lock and
    // atomically saves both the webhook event and subscription transition.
    // A separate select/upsert/insert sequence cannot provide this guarantee.
    const {data,error}=await admin.rpc("remapro_apply_revenuecat_event",{
      p_organization_id:organizationId,
      p_user_id:userId,
      p_event_record_id:recordId,
      p_event:event
    });
    if(error){
      console.error("RevenueCat atomic RPC failed",{code:error.code});
      if(error.code==="42501")return json({error:"RevenueCat user is not a current member"},403);
      if(error.code==="22023")return json({error:"Invalid RevenueCat payload"},400);
      return json({error:"RevenueCat event could not be committed"},503);
    }
    return json(data||{error:"Empty RevenueCat RPC result"},data?200:503);
  }catch(error){
    console.error("RevenueCat webhook processing error",{
      name:error instanceof Error?error.name:"UnexpectedError"
    });
    return json({error:"RevenueCat webhook processing failed"},503);
  }
});
