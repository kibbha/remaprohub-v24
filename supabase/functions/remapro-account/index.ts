import { withSupabase } from "npm:@supabase/server@1.4.1";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json"}});

const authenticated=withSupabase({auth:"user"},async(req,ctx)=>{
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  try{
    const body=await req.json();
    if(String(body?.action||"")!=="delete-self"||String(body?.confirmation||"")!=="DELETE")return json({error:"Confirmation required"},400);
    const userId=String(ctx.userClaims?.id||"");
    if(!userId)return json({error:"Authenticated user required"},401);

    const {data:memberships,error:membershipError}=await ctx.supabaseAdmin.from("memberships")
      .select("organization_id").eq("user_id",userId);
    if(membershipError)return json({error:"Unable to inspect memberships"},500);
    const organizationIds=[...new Set((memberships||[]).map((x:any)=>String(x.organization_id||"")).filter(Boolean))];

    for(const organizationId of organizationIds){
      const {count,error:countError}=await ctx.supabaseAdmin.from("memberships")
        .select("id",{count:"exact",head:true})
        .eq("organization_id",organizationId)
        .eq("active",true)
        .neq("user_id",userId);
      if(countError)return json({error:"Unable to verify organization ownership"},500);

      if((count||0)===0){
        const {error}=await ctx.supabaseAdmin.from("organizations").delete().eq("id",organizationId);
        if(error)return json({error:"Unable to delete owned organization data"},500);
      }else{
        const {error}=await ctx.supabaseAdmin.from("memberships").delete()
          .eq("organization_id",organizationId).eq("user_id",userId);
        if(error)return json({error:"Unable to remove organization membership"},500);
      }
    }

    await ctx.supabaseAdmin.from("memberships").delete().eq("user_id",userId);
    await ctx.supabaseAdmin.from("profiles").delete().eq("id",userId);
    const {error:deleteError}=await ctx.supabaseAdmin.auth.admin.deleteUser(userId);
    if(deleteError)return json({error:"Unable to delete authentication account"},500);
    return json({ok:true,deleted:true});
  }catch(error){
    return json({error:error instanceof Error?error.message:"Unexpected account deletion error"},500);
  }
});

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  return authenticated(req);
});
