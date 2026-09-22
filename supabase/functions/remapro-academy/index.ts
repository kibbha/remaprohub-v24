import { withSupabase } from "npm:@supabase/server@1.4.1";

const ORG_ADMIN_ROLES=new Set(["network_admin","network_manager"]);
const RESTAURANT_ADMIN_ROLES=new Set(["restaurant_admin","director","manager"]);
const json=(data:unknown,status=200)=>Response.json(data,{status});
const clean=(v:unknown,max=180)=>String(v??"").trim().slice(0,max);
const validUuid=(v:unknown)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v||""));
const validApp=(v:unknown)=>["hub","pos","common"].includes(String(v||""));
const validStatus=(v:unknown)=>["not_started","in_progress","completed"].includes(String(v||""));
const safeMeta=(v:any)=>{
  if(!v||typeof v!=="object"||Array.isArray(v))return{};
  const raw=JSON.stringify(v);return raw.length<=5000?v:{};
};

export default {
  fetch:withSupabase({auth:"user"},async(req,ctx)=>{
    if(req.method!=="POST")return json({error:"Method not allowed"},405);
    try{
      const body=await req.json().catch(()=>({}));
      const action=clean(body.action,40),userId=String(ctx.userClaims?.id||"");
      const organizationId=clean(body.organizationId,64),restaurantId=clean(body.restaurantId,64);
      if(!userId||!validUuid(organizationId))return json({error:"Valid organization and authenticated user required"},400);
      const {data:memberships,error:membershipError}=await ctx.supabaseAdmin.from("memberships")
        .select("organization_id,restaurant_id,role,permissions,active")
        .eq("organization_id",organizationId).eq("user_id",userId).eq("active",true);
      if(membershipError)return json({error:"Unable to verify Academy access"},500);
      const own=memberships||[],orgAdmin=own.some((m:any)=>!m.restaurant_id&&ORG_ADMIN_ROLES.has(String(m.role)));
      const restaurantMember=!restaurantId||own.some((m:any)=>m.restaurant_id===restaurantId||(!m.restaurant_id&&ORG_ADMIN_ROLES.has(String(m.role))));
      const restaurantAdmin=restaurantId&&own.some((m:any)=>m.restaurant_id===restaurantId&&RESTAURANT_ADMIN_ROLES.has(String(m.role)));
      if(!own.length||!restaurantMember)return json({error:"Academy access denied"},403);
      const manager=orgAdmin||!!restaurantAdmin;

      if(action==="load"){
        const {data:progress,error}=await ctx.supabaseAdmin.from("academy_progress")
          .select("application,topic_id,content_version,status,step_index,score,metadata,started_at,completed_at,updated_at")
          .eq("organization_id",organizationId).eq("user_id",userId).order("updated_at",{ascending:false});
        if(error)return json({error:"Unable to load Academy progress"},500);
        const {data:settings}=await ctx.supabaseAdmin.from("academy_settings")
          .select("manager_visibility").eq("organization_id",organizationId).maybeSingle();
        return json({ok:true,progress:progress||[],managerVisibility:!!settings?.manager_visibility,manager});
      }

      if(action==="save"){
        const application=clean(body.application,20),topicId=clean(body.topicId,120),contentVersion=clean(body.contentVersion,80);
        const status=clean(body.status,30),stepIndex=Math.max(0,Math.trunc(Number(body.stepIndex)||0));
        const score=body.score==null?null:Math.max(0,Math.min(100,Math.trunc(Number(body.score)||0)));
        if(!validApp(application)||!topicId||!contentVersion||!validStatus(status))return json({error:"Invalid Academy progress payload"},400);
        const row={
          organization_id:organizationId,restaurant_id:validUuid(restaurantId)?restaurantId:null,user_id:userId,
          application,topic_id:topicId,content_version:contentVersion,status,step_index:stepIndex,score,metadata:safeMeta(body.metadata),
          started_at:status==="not_started"?null:new Date().toISOString(),
          completed_at:status==="completed"?new Date().toISOString():null,updated_at:new Date().toISOString()
        };
        const {data,error}=await ctx.supabaseAdmin.from("academy_progress").upsert(row,{onConflict:"user_id,application,topic_id"})
          .select("application,topic_id,content_version,status,step_index,score,metadata,started_at,completed_at,updated_at").single();
        if(error)return json({error:"Unable to save Academy progress"},500);
        return json({ok:true,progress:data});
      }

      if(action==="set_manager_visibility"){
        if(!orgAdmin)return json({error:"Organization admin required"},403);
        const enabled=body.enabled===true;
        const {data,error}=await ctx.supabaseAdmin.from("academy_settings")
          .upsert({organization_id:organizationId,manager_visibility:enabled,updated_by:userId,updated_at:new Date().toISOString()},{onConflict:"organization_id"})
          .select("manager_visibility").single();
        if(error)return json({error:"Unable to update Academy visibility"},500);
        return json({ok:true,managerVisibility:!!data.manager_visibility});
      }

      if(action==="manager_progress"){
        if(!manager)return json({error:"Manager access required"},403);
        const {data:settings}=await ctx.supabaseAdmin.from("academy_settings")
          .select("manager_visibility").eq("organization_id",organizationId).maybeSingle();
        if(!settings?.manager_visibility)return json({error:"Manager training visibility is disabled"},403);
        let query=ctx.supabaseAdmin.from("academy_progress")
          .select("user_id,restaurant_id,application,topic_id,content_version,status,step_index,score,updated_at,completed_at")
          .eq("organization_id",organizationId).order("updated_at",{ascending:false}).limit(1000);
        if(!orgAdmin&&restaurantId)query=query.eq("restaurant_id",restaurantId);
        const {data,error}=await query;
        if(error)return json({error:"Unable to load team Academy progress"},500);
        const ids=[...new Set((data||[]).map((x:any)=>String(x.user_id)))];
        const {data:profiles}=ids.length?await ctx.supabaseAdmin.from("profiles").select("id,first_name,last_name").in("id",ids):{data:[]};
        const names=new Map((profiles||[]).map((p:any)=>[String(p.id),[p.first_name,p.last_name].filter(Boolean).join(" ")]));
        return json({ok:true,rows:(data||[]).map((x:any)=>({...x,user_name:names.get(String(x.user_id))||"Utilisateur"}))});
      }

      return json({error:"Unsupported Academy action"},400);
    }catch(error){return json({error:error instanceof Error?error.message:"Unexpected Academy error"},500)}
  })
};