import { withSupabase } from "npm:@supabase/server@1.4.1";

const MANAGER_ROLES = new Set(["network_admin","network_manager"]);
const RESTAURANT_ADMIN_ROLES = new Set(["restaurant_admin","director","manager"]);
const STAFF_PERMISSIONS = new Set(["operations","haccp","stock","deliveries","checklists","planning","reservations"]);

function fail(message:string,status=400){
  return Response.json({error:message},{status});
}
function validEmail(value:string){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default {
  fetch: withSupabase({ auth:"user" }, async (req, ctx) => {
    if(req.method !== "POST") return fail("Method not allowed",405);

    try{
      const body = await req.json();
      if(body.action !== "invite-member") return fail("Unsupported action",400);

      const userId = String(ctx.userClaims?.id || "");
      const organizationId = String(body.organizationId || "");
      const kind = body.kind === "manager" ? "manager" : body.kind === "staff" ? "staff" : "";
      const name = String(body.name || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const restaurantIds = [...new Set(Array.isArray(body.restaurantIds) ? body.restaurantIds.map(String) : [])];
      const permissions = [...new Set(Array.isArray(body.permissions) ? body.permissions.map(String) : [])]
        .filter((p) => STAFF_PERMISSIONS.has(p));

      if(!userId || !organizationId || !kind || !name || !validEmail(email) || !restaurantIds.length){
        return fail("Invalid invitation payload",400);
      }
      if(kind === "staff" && !permissions.length) return fail("Staff permissions are required",400);

      const {data: callerMemberships,error: membershipError} = await ctx.supabase
        .from("memberships")
        .select("organization_id,restaurant_id,role,active")
        .eq("organization_id",organizationId)
        .eq("user_id",userId)
        .eq("active",true);
      if(membershipError) return fail("Unable to verify caller membership",403);

      const memberships = callerMemberships || [];
      const orgAdmin = memberships.some((m:any) => MANAGER_ROLES.has(String(m.role)));
      const adminRestaurants = new Set(
        memberships
          .filter((m:any) => RESTAURANT_ADMIN_ROLES.has(String(m.role)) && m.restaurant_id)
          .map((m:any) => String(m.restaurant_id))
      );

      if(kind === "manager" && !orgAdmin) return fail("Organization admin required",403);
      if(kind === "staff" && !orgAdmin && restaurantIds.some((id) => !adminRestaurants.has(id))){
        return fail("Restaurant admin access required",403);
      }

      const {data: restaurants,error: restaurantError} = await ctx.supabase
        .from("restaurants")
        .select("id,organization_id")
        .eq("organization_id",organizationId)
        .in("id",restaurantIds);
      if(restaurantError || !restaurants || restaurants.length !== restaurantIds.length){
        return fail("Invalid restaurant assignment",403);
      }

      const {data: subscription,error: subscriptionError} = await ctx.supabase
        .from("subscriptions")
        .select("status,trial_ends_at,plan:subscription_plans(code)")
        .eq("organization_id",organizationId)
        .order("created_at",{ascending:false})
        .limit(1)
        .maybeSingle();
      if(subscriptionError) return fail("Unable to verify subscription",403);

      const status = String(subscription?.status || "trialing");
      const planCode = String((subscription as any)?.plan?.code || "standard");
      const trialActive = status === "trialing" && (!subscription?.trial_ends_at || new Date(subscription.trial_ends_at).getTime() > Date.now());
      const multiActive = status === "active" && planCode === "multi";
      if(kind === "staff" && !trialActive && !multiActive) return fail("Multi plan required",402);

      if(kind === "manager" && !trialActive && !multiActive){
        const {count,error: countError} = await ctx.supabaseAdmin
          .from("memberships")
          .select("user_id",{count:"exact",head:true})
          .eq("organization_id",organizationId)
          .in("role",["network_admin","network_manager","restaurant_admin","director","manager"])
          .eq("active",true);
        if(countError) return fail("Unable to verify manager limit",500);
        if((count || 0) >= 1) return fail("Multi plan required for additional managers",402);
      }

      const {data: invite,error: inviteError} = await ctx.supabaseAdmin.auth.admin.inviteUserByEmail(email,{
        data:{name,remapro_invite:true}
      });
      if(inviteError || !invite?.user?.id){
        return fail(inviteError?.message || "Unable to invite user",409);
      }

      const role = kind === "manager" ? "manager" : "employee";
      const rows = restaurantIds.map((restaurantId) => ({
        user_id:invite.user.id,
        organization_id:organizationId,
        restaurant_id:restaurantId,
        role,
        active:true,
        permissions:kind === "staff" ? permissions : []
      }));

      const {error: insertError} = await ctx.supabaseAdmin.from("memberships").insert(rows);
      if(insertError){
        return fail("User invited but membership creation failed. Review the account before retrying.",500);
      }

      return Response.json({
        ok:true,
        userId:invite.user.id,
        email,
        role,
        restaurantIds,
        permissions:kind === "staff" ? permissions : []
      });
    }catch(error){
      return fail(error instanceof Error ? error.message : "Unexpected server error",500);
    }
  })
};
