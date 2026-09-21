import { withSupabase } from "npm:@supabase/server@1.4.1";

const ORG_ADMIN_ROLES=new Set(["network_admin","network_manager"]);
const RESTAURANT_ADMIN_ROLES=new Set(["restaurant_admin","director","manager"]);
const MANAGEABLE_ROLES=new Set(["manager","employee","floor","kitchen","hr","finance","readonly"]);
const MEMBER_PERMISSIONS=new Set([
  "operations","finance","stock","deliveries","haccp","checklists","planning","reservations",
  "recipes","documents","hr","team","orders","suppliers","purchases","invoices","customers",
  "loyalty","ai"
]);
const CURRENCIES=new Set(["CHF","EUR","USD","GBP"]);
const fail=(message:string,status=400)=>Response.json({error:message},{status});
const validEmail=(value:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const uniqueStrings=(value:any)=>[...new Set(Array.isArray(value)?value.map(String).filter(Boolean):[])];

async function hasMultiAccess(ctx:any,organizationId:string){
  const {data:subscription,error}=await ctx.supabase.from("subscriptions")
    .select("status,trial_ends_at,plan:subscription_plans(code)")
    .eq("organization_id",organizationId).order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(error)throw new Error("Unable to verify subscription");
  if(subscription){
    const status=String(subscription.status||""),planCode=String(subscription?.plan?.code||"standard");
    if(status==="active"&&planCode==="multi")return true;
    if(status==="trialing"&&subscription.trial_ends_at&&new Date(subscription.trial_ends_at).getTime()>Date.now())return true;
    return false;
  }
  const {data:organization,error:orgError}=await ctx.supabase.from("organizations")
    .select("created_at").eq("id",organizationId).single();
  if(orgError||!organization?.created_at)throw new Error("Unable to verify trial period");
  return new Date(organization.created_at).getTime()+7*86400000>Date.now();
}

async function writeAudit(ctx:any,{organizationId,restaurantIds=[],actorUserId,targetUserId=null,action,details={}}:any){
  const ids=uniqueStrings(restaurantIds);
  const rows=(ids.length?ids:[null]).map((restaurantId)=>({
    organization_id:organizationId,restaurant_id:restaurantId,actor_user_id:actorUserId,
    target_user_id:targetUserId,action,details
  }));
  const {error}=await ctx.supabaseAdmin.from("audit_logs").insert(rows);
  if(error)console.error("audit log failed",error.message);
}

export default {
  fetch: withSupabase({auth:"user"},async(req,ctx)=>{
    if(req.method!=="POST")return fail("Method not allowed",405);
    try{
      const body=await req.json(),action=String(body.action||"");
      const allowed=new Set(["list-members","list-audit","invite-member","update-member","set-member-active","revoke-member","create-restaurant","archive-restaurant"]);
      if(!allowed.has(action))return fail("Unsupported action",400);

      const callerUserId=String(ctx.userClaims?.id||""),organizationId=String(body.organizationId||"");
      if(!callerUserId||!organizationId)return fail("Invalid organization payload",400);

      const {data:callerMemberships,error:membershipError}=await ctx.supabase.from("memberships")
        .select("organization_id,restaurant_id,role,permissions,active")
        .eq("organization_id",organizationId).eq("user_id",callerUserId).eq("active",true);
      if(membershipError)return fail("Unable to verify caller membership",403);

      const memberships=callerMemberships||[];
      const orgAdmin=memberships.some((m:any)=>ORG_ADMIN_ROLES.has(String(m.role)));
      const adminRestaurants=new Set(memberships
        .filter((m:any)=>RESTAURANT_ADMIN_ROLES.has(String(m.role))&&m.restaurant_id)
        .map((m:any)=>String(m.restaurant_id)));
      if(!orgAdmin&&!adminRestaurants.size)return fail("Manager access required",403);

      const allowedScope=(ids:string[])=>orgAdmin||ids.every(id=>adminRestaurants.has(id));

      if(action==="list-members"){
        let query=ctx.supabaseAdmin.from("memberships")
          .select("id,user_id,organization_id,restaurant_id,role,permissions,active,created_at,updated_at")
          .eq("organization_id",organizationId);
        if(!orgAdmin)query=query.in("restaurant_id",[...adminRestaurants]);
        const {data:rows,error}=await query;
        if(error)return fail("Unable to load members",500);
        const visible=(rows||[]).filter((m:any)=>orgAdmin||!ORG_ADMIN_ROLES.has(String(m.role)));
        const userIds=[...new Set(visible.map((m:any)=>String(m.user_id)))];
        const {data:profiles}=userIds.length?await ctx.supabaseAdmin.from("profiles")
          .select("id,first_name,last_name,locale,active").in("id",userIds):{data:[]};
        const profileMap=new Map((profiles||[]).map((p:any)=>[String(p.id),p]));
        const {data:userPage}=await ctx.supabaseAdmin.auth.admin.listUsers({page:1,perPage:1000});
        const authMap=new Map((userPage?.users||[]).map((u:any)=>[String(u.id),u]));
        const grouped=new Map<string,any>();
        for(const m of visible){
          const uid=String((m as any).user_id),profile=profileMap.get(uid) as any,auth=authMap.get(uid) as any;
          if(!grouped.has(uid))grouped.set(uid,{
            userId:uid,email:String(auth?.email||""),name:[profile?.first_name,profile?.last_name].filter(Boolean).join(" ")||String(auth?.user_metadata?.name||auth?.email||""),
            lastSignInAt:auth?.last_sign_in_at||null,invitedAt:auth?.invited_at||null,memberships:[]
          });
          grouped.get(uid).memberships.push(m);
        }
        return Response.json({ok:true,members:[...grouped.values()]});
      }

      if(action==="list-audit"){
        let query=ctx.supabaseAdmin.from("audit_logs")
          .select("id,organization_id,restaurant_id,actor_user_id,target_user_id,action,details,created_at")
          .eq("organization_id",organizationId).order("created_at",{ascending:false}).limit(200);
        if(!orgAdmin)query=query.in("restaurant_id",[...adminRestaurants]);
        const {data,error}=await query;
        if(error)return fail("Unable to load audit log",500);
        return Response.json({ok:true,audit:data||[]});
      }

      if(action==="create-restaurant"){
        if(!orgAdmin)return fail("Organization admin required",403);
        if(!(await hasMultiAccess(ctx,organizationId)))return fail("Multi plan required",402);
        const name=String(body.name||"").trim(),country=String(body.country||"CH").trim().toUpperCase()||"CH";
        const region=String(body.region||"").trim(),currency=String(body.currency||"CHF").trim().toUpperCase();
        if(!name||!CURRENCIES.has(currency))return fail("Invalid restaurant payload",400);
        const {data:restaurant,error}=await ctx.supabaseAdmin.from("restaurants")
          .insert({organization_id:organizationId,name,country_code:country,canton:region,currency,active:true})
          .select("id,organization_id,name,city,canton,country_code,currency,active").single();
        if(error||!restaurant)return fail(error?.message||"Unable to create restaurant",409);
        await writeAudit(ctx,{organizationId,restaurantIds:[restaurant.id],actorUserId:callerUserId,action:"restaurant.created",details:{name}});
        return Response.json({ok:true,restaurant});
      }

      if(action==="archive-restaurant"){
        if(!orgAdmin)return fail("Organization admin required",403);
        const restaurantId=String(body.restaurantId||"");if(!restaurantId)return fail("Restaurant is required",400);
        const {count,error:countError}=await ctx.supabaseAdmin.from("restaurants")
          .select("id",{count:"exact",head:true}).eq("organization_id",organizationId).eq("active",true);
        if(countError)return fail("Unable to verify restaurant count",500);
        if((count||0)<=1)return fail("Last restaurant cannot be archived",409);
        const {data,error}=await ctx.supabaseAdmin.from("restaurants").update({active:false,updated_at:new Date().toISOString()})
          .eq("id",restaurantId).eq("organization_id",organizationId).select("id").maybeSingle();
        if(error||!data)return fail("Unable to archive restaurant",500);
        await writeAudit(ctx,{organizationId,restaurantIds:[restaurantId],actorUserId:callerUserId,action:"restaurant.archived"});
        return Response.json({ok:true,restaurantId});
      }

      const restaurantIds=uniqueStrings(body.restaurantIds);
      if(!restaurantIds.length||!allowedScope(restaurantIds))return fail("Restaurant admin scope required",403);
      const {data:restaurants,error:restaurantError}=await ctx.supabase.from("restaurants")
        .select("id,organization_id").eq("organization_id",organizationId).in("id",restaurantIds);
      if(restaurantError||!restaurants||restaurants.length!==restaurantIds.length)return fail("Invalid restaurant assignment",403);

      const targetUserId=String(body.userId||"");
      if(["update-member","set-member-active","revoke-member"].includes(action)){
        if(!targetUserId||targetUserId===callerUserId)return fail("Invalid membership target",400);
        const {data:targetMemberships,error:targetError}=await ctx.supabaseAdmin.from("memberships")
          .select("id,role,restaurant_id,permissions,active").eq("organization_id",organizationId).eq("user_id",targetUserId);
        if(targetError||!targetMemberships?.length)return fail("Membership target not found",404);
        if(targetMemberships.some((m:any)=>ORG_ADMIN_ROLES.has(String(m.role))))return fail("Owner/admin account is protected",403);
        const selected=targetMemberships.filter((m:any)=>restaurantIds.includes(String(m.restaurant_id)));
        if(!selected.length)return fail("Membership target not found in selected restaurants",404);
        if(!orgAdmin&&selected.some((m:any)=>!MANAGEABLE_ROLES.has(String(m.role))))return fail("Target role is above manager scope",403);

        if(action==="revoke-member"){
          const {error}=await ctx.supabaseAdmin.from("memberships").delete()
            .eq("organization_id",organizationId).eq("user_id",targetUserId).in("restaurant_id",restaurantIds);
          if(error)return fail("Unable to revoke memberships",500);
          await writeAudit(ctx,{organizationId,restaurantIds,actorUserId:callerUserId,targetUserId,action:"member.revoked"});
          return Response.json({ok:true,userId:targetUserId,restaurantIds});
        }

        if(action==="set-member-active"){
          const active=body.active===true;
          const {error}=await ctx.supabaseAdmin.from("memberships").update({active,updated_at:new Date().toISOString()})
            .eq("organization_id",organizationId).eq("user_id",targetUserId).in("restaurant_id",restaurantIds);
          if(error)return fail("Unable to update member status",500);
          await writeAudit(ctx,{organizationId,restaurantIds,actorUserId:callerUserId,targetUserId,action:active?"member.activated":"member.deactivated"});
          return Response.json({ok:true,userId:targetUserId,restaurantIds,active});
        }

        const role=body.role==="manager"?"manager":"employee";
        const permissions=uniqueStrings(body.permissions).filter(p=>MEMBER_PERMISSIONS.has(p));
        if(role==="employee"&&!permissions.length)return fail("Employee permissions are required",400);
        if(!(await hasMultiAccess(ctx,organizationId)))return fail("Multi plan required",402);
        const deleteScope=orgAdmin?targetMemberships.filter((m:any)=>m.restaurant_id).map((m:any)=>String(m.restaurant_id)):[...adminRestaurants];
        if(deleteScope.length){
          const {error}=await ctx.supabaseAdmin.from("memberships").delete().eq("organization_id",organizationId)
            .eq("user_id",targetUserId).in("restaurant_id",deleteScope);
          if(error)return fail("Unable to replace memberships",500);
        }
        const rows=restaurantIds.map(restaurantId=>({user_id:targetUserId,organization_id:organizationId,restaurant_id:restaurantId,role,active:true,permissions:role==="employee"?permissions:[]}));
        const {error}=await ctx.supabaseAdmin.from("memberships").insert(rows);
        if(error)return fail("Unable to update memberships",500);
        await writeAudit(ctx,{organizationId,restaurantIds,actorUserId:callerUserId,targetUserId,action:"member.updated",details:{role,permissions}});
        return Response.json({ok:true,userId:targetUserId,role,restaurantIds,permissions:role==="employee"?permissions:[]});
      }

      const kind=body.kind==="manager"?"manager":body.kind==="staff"?"staff":"";
      const name=String(body.name||"").trim(),email=String(body.email||"").trim().toLowerCase();
      const permissions=uniqueStrings(body.permissions).filter(p=>MEMBER_PERMISSIONS.has(p));
      if(!kind||!name||!validEmail(email))return fail("Invalid invitation payload",400);
      if(kind==="staff"&&!permissions.length)return fail("Staff permissions are required",400);
      if(!(await hasMultiAccess(ctx,organizationId)))return fail("Multi plan required",402);

      const {data:userPage}=await ctx.supabaseAdmin.auth.admin.listUsers({page:1,perPage:1000});
      let user=(userPage?.users||[]).find((u:any)=>String(u.email||"").toLowerCase()===email);
      let invited=false;
      if(!user){
        const {data:invite,error:inviteError}=await ctx.supabaseAdmin.auth.admin.inviteUserByEmail(email,{data:{name,remapro_invite:true}});
        if(inviteError||!invite?.user?.id)return fail(inviteError?.message||"Unable to invite user",409);
        user=invite.user;invited=true;
      }
      const role=kind==="manager"?"manager":"employee";
      const existing=await ctx.supabaseAdmin.from("memberships").select("id,role,restaurant_id")
        .eq("organization_id",organizationId).eq("user_id",user.id).in("restaurant_id",restaurantIds);
      if(existing.error)return fail("Unable to verify existing memberships",500);
      if((existing.data||[]).some((m:any)=>ORG_ADMIN_ROLES.has(String(m.role))))return fail("Owner/admin account is protected",403);
      if(existing.data?.length)return fail("User already has access to one of these restaurants",409);
      const rows=restaurantIds.map(restaurantId=>({user_id:user.id,organization_id:organizationId,restaurant_id:restaurantId,role,active:true,permissions:kind==="staff"?permissions:[]}));
      const {error:insertError}=await ctx.supabaseAdmin.from("memberships").insert(rows);
      if(insertError){
        if(invited)try{await ctx.supabaseAdmin.auth.admin.deleteUser(user.id)}catch{}
        return fail("Membership creation failed; invitation was rolled back.",500);
      }
      await ctx.supabaseAdmin.from("profiles").upsert({id:user.id,first_name:name,active:true,updated_at:new Date().toISOString()},{onConflict:"id"});
      await writeAudit(ctx,{organizationId,restaurantIds,actorUserId:callerUserId,targetUserId:user.id,action:"member.invited",details:{role,email,permissions:kind==="staff"?permissions:[]}});
      return Response.json({ok:true,userId:user.id,email,role,restaurantIds,permissions:kind==="staff"?permissions:[],invited});
    }catch(error){
      return fail(error instanceof Error?error.message:"Unexpected server error",500);
    }
  })
};
