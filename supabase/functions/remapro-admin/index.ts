import { withSupabase } from "npm:@supabase/server@1.4.1";

const ORG_ADMIN_ROLES = new Set(["network_admin","network_manager"]);
const RESTAURANT_ADMIN_ROLES = new Set(["restaurant_admin","director","manager"]);
const STAFF_PERMISSIONS = new Set(["operations","haccp","stock","deliveries","checklists","planning","reservations"]);
const CURRENCIES = new Set(["CHF","EUR","USD","GBP"]);

function fail(message:string,status=400){
  return Response.json({error:message},{status});
}
function validEmail(value:string){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
async function hasMultiAccess(ctx:any,organizationId:string){
  const {data: subscription,error} = await ctx.supabase
    .from("subscriptions")
    .select("status,trial_ends_at,plan:subscription_plans(code)")
    .eq("organization_id",organizationId)
    .order("created_at",{ascending:false})
    .limit(1)
    .maybeSingle();
  if(error) throw new Error("Unable to verify subscription");

  if(subscription){
    const status=String(subscription.status||"");
    const planCode=String(subscription?.plan?.code||"standard");
    if(status==="active"&&planCode==="multi")return true;
    if(status==="trialing"&&subscription.trial_ends_at&&new Date(subscription.trial_ends_at).getTime()>Date.now())return true;
    return false;
  }

  const {data: organization,error: orgError}=await ctx.supabase
    .from("organizations").select("created_at").eq("id",organizationId).single();
  if(orgError||!organization?.created_at)throw new Error("Unable to verify trial period");
  return new Date(organization.created_at).getTime()+7*86400000>Date.now();
}

export default {
  fetch: withSupabase({ auth:"user" }, async (req, ctx) => {
    if(req.method !== "POST") return fail("Method not allowed",405);

    try{
      const body=await req.json();
      const action=String(body.action||"");
      if(!["invite-member","revoke-member","create-restaurant","archive-restaurant"].includes(action)){
        return fail("Unsupported action",400);
      }

      const callerUserId=String(ctx.userClaims?.id||"");
      const organizationId=String(body.organizationId||"");
      if(!callerUserId||!organizationId)return fail("Invalid organization payload",400);

      const {data: callerMemberships,error: membershipError}=await ctx.supabase
        .from("memberships")
        .select("organization_id,restaurant_id,role,active")
        .eq("organization_id",organizationId)
        .eq("user_id",callerUserId)
        .eq("active",true);
      if(membershipError)return fail("Unable to verify caller membership",403);

      const memberships=callerMemberships||[];
      const orgAdmin=memberships.some((m:any)=>ORG_ADMIN_ROLES.has(String(m.role)));
      const adminRestaurants=new Set(
        memberships
          .filter((m:any)=>RESTAURANT_ADMIN_ROLES.has(String(m.role))&&m.restaurant_id)
          .map((m:any)=>String(m.restaurant_id))
      );

      if(action==="create-restaurant"){
        if(!orgAdmin)return fail("Organization admin required",403);
        if(!(await hasMultiAccess(ctx,organizationId)))return fail("Multi plan required",402);
        const name=String(body.name||"").trim();
        const country=String(body.country||"CH").trim().toUpperCase()||"CH";
        const region=String(body.region||"").trim();
        const currency=String(body.currency||"CHF").trim().toUpperCase();
        if(!name||!CURRENCIES.has(currency))return fail("Invalid restaurant payload",400);

        const {data: restaurant,error}=await ctx.supabaseAdmin.from("restaurants")
          .insert({organization_id:organizationId,name,country_code:country,canton:region,currency,active:true})
          .select("id,organization_id,name,city,canton,country_code,currency,active")
          .single();
        if(error||!restaurant)return fail(error?.message||"Unable to create restaurant",409);
        return Response.json({ok:true,restaurant});
      }

      if(action==="archive-restaurant"){
        if(!orgAdmin)return fail("Organization admin required",403);
        const restaurantId=String(body.restaurantId||"");
        if(!restaurantId)return fail("Restaurant is required",400);
        const {count,error:countError}=await ctx.supabaseAdmin.from("restaurants")
          .select("id",{count:"exact",head:true})
          .eq("organization_id",organizationId).eq("active",true);
        if(countError)return fail("Unable to verify restaurant count",500);
        if((count||0)<=1)return fail("Last restaurant cannot be archived",409);
        const {data,error}=await ctx.supabaseAdmin.from("restaurants")
          .update({active:false,updated_at:new Date().toISOString()})
          .eq("id",restaurantId).eq("organization_id",organizationId)
          .select("id").maybeSingle();
        if(error||!data)return fail("Unable to archive restaurant",500);
        return Response.json({ok:true,restaurantId});
      }

      const kind=body.kind==="manager"?"manager":body.kind==="staff"?"staff":"";
      const restaurantIds=[...new Set(Array.isArray(body.restaurantIds)?body.restaurantIds.map(String):[])];
      if(!kind||!restaurantIds.length)return fail("Invalid membership payload",400);

      if(kind==="manager"&&!orgAdmin)return fail("Organization admin required",403);
      if(kind==="staff"&&!orgAdmin&&restaurantIds.some((id)=>!adminRestaurants.has(id))){
        return fail("Restaurant admin access required",403);
      }

      const {data: restaurants,error: restaurantError}=await ctx.supabase
        .from("restaurants")
        .select("id,organization_id")
        .eq("organization_id",organizationId)
        .in("id",restaurantIds);
      if(restaurantError||!restaurants||restaurants.length!==restaurantIds.length){
        return fail("Invalid restaurant assignment",403);
      }

      if(action==="revoke-member"){
        const targetUserId=String(body.userId||"");
        if(!targetUserId||targetUserId===callerUserId)return fail("Invalid revocation target",400);
        const {data: targetMemberships,error: targetError}=await ctx.supabaseAdmin.from("memberships")
          .select("id,role,restaurant_id")
          .eq("organization_id",organizationId)
          .eq("user_id",targetUserId)
          .in("restaurant_id",restaurantIds);
        if(targetError||!targetMemberships?.length)return fail("Membership target not found",404);
        const targetHasManagerRole=targetMemberships.some((m:any)=>ORG_ADMIN_ROLES.has(String(m.role))||RESTAURANT_ADMIN_ROLES.has(String(m.role)));
        if(kind==="staff"&&targetHasManagerRole)return fail("Organization admin required",403);
        if(kind==="manager"&&!targetHasManagerRole)return fail("Invalid manager target",400);
        const {error: revokeError}=await ctx.supabaseAdmin.from("memberships")
          .delete()
          .eq("organization_id",organizationId)
          .eq("user_id",targetUserId)
          .in("restaurant_id",restaurantIds);
        if(revokeError)return fail("Unable to revoke memberships",500);
        return Response.json({ok:true,userId:targetUserId,restaurantIds});
      }

      const name=String(body.name||"").trim();
      const email=String(body.email||"").trim().toLowerCase();
      const permissions=[...new Set(Array.isArray(body.permissions)?body.permissions.map(String):[])]
        .filter((p)=>STAFF_PERMISSIONS.has(p));
      if(!name||!validEmail(email))return fail("Invalid invitation payload",400);
      if(kind==="staff"&&!permissions.length)return fail("Staff permissions are required",400);

      const multiAccess=await hasMultiAccess(ctx,organizationId);
      if(kind==="staff"&&!multiAccess)return fail("Multi plan required",402);
      if(kind==="manager"&&!multiAccess){
        const {count,error:countError}=await ctx.supabaseAdmin.from("memberships")
          .select("user_id",{count:"exact",head:true})
          .eq("organization_id",organizationId)
          .in("role",["network_admin","network_manager","restaurant_admin","director","manager"])
          .eq("active",true);
        if(countError)return fail("Unable to verify manager limit",500);
        if((count||0)>=1)return fail("Multi plan required for additional managers",402);
      }

      const {data: invite,error: inviteError}=await ctx.supabaseAdmin.auth.admin.inviteUserByEmail(email,{
        data:{name,remapro_invite:true}
      });
      if(inviteError||!invite?.user?.id)return fail(inviteError?.message||"Unable to invite user",409);

      const role=kind==="manager"?"manager":"employee";
      const rows=restaurantIds.map((restaurantId)=>({
        user_id:invite.user.id,
        organization_id:organizationId,
        restaurant_id:restaurantId,
        role,
        active:true,
        permissions:kind==="staff"?permissions:[]
      }));
      const {error:insertError}=await ctx.supabaseAdmin.from("memberships").insert(rows);
      if(insertError){
        try{await ctx.supabaseAdmin.auth.admin.deleteUser(invite.user.id)}catch{}
        return fail("Membership creation failed; invitation was rolled back.",500);
      }

      return Response.json({ok:true,userId:invite.user.id,email,role,restaurantIds,permissions:kind==="staff"?permissions:[]});
    }catch(error){
      return fail(error instanceof Error?error.message:"Unexpected server error",500);
    }
  })
};
