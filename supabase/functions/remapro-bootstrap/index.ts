import { withSupabase } from "npm:@supabase/server@1.4.1";

const json=(data:unknown,status=200)=>Response.json(data,{status});
const clean=(value:unknown,max=120)=>String(value||"").trim().slice(0,max);

export default {
  fetch: withSupabase({auth:"user"},async(req,ctx)=>{
    if(req.method!=="POST")return json({error:"Method not allowed"},405);
    try{
      const userId=String(ctx.userClaims?.id||"");
      if(!userId)return json({error:"Authenticated user required"},401);

      const {data:existing,error:existingError}=await ctx.supabaseAdmin.from("memberships")
        .select("id,organization_id,restaurant_id,role,active")
        .eq("user_id",userId).eq("active",true).limit(1);
      if(existingError)return json({error:"Unable to inspect memberships"},500);
      if(existing?.length)return json({ok:true,alreadyProvisioned:true,membership:existing[0]});

      const body=await req.json().catch(()=>({}));
      const email=clean(ctx.userClaims?.email||body.email,200).toLowerCase();
      const ownerName=clean(body.name||email.split("@")[0]||"Propriétaire",120)||"Propriétaire";
      const organizationName=clean(body.organizationName||body.restaurantName||"Mon établissement",120)||"Mon établissement";
      const restaurantName=clean(body.restaurantName||organizationName,120)||organizationName;
      const country=clean(body.country||"CH",2).toUpperCase()||"CH";
      const currency=clean(body.currency||"CHF",3).toUpperCase()||"CHF";

      const {data:organization,error:orgError}=await ctx.supabaseAdmin.from("organizations")
        .insert({name:organizationName,country_code:country,default_currency:currency})
        .select("id,name").single();
      if(orgError||!organization)return json({error:orgError?.message||"Unable to create organization"},500);

      let restaurant:any=null;
      try{
        const restaurantResult=await ctx.supabaseAdmin.from("restaurants")
          .insert({organization_id:organization.id,name:restaurantName,country_code:country,currency,active:true})
          .select("id,name,organization_id").single();
        if(restaurantResult.error||!restaurantResult.data)throw new Error(restaurantResult.error?.message||"Unable to create restaurant");
        restaurant=restaurantResult.data;

        const membershipResult=await ctx.supabaseAdmin.from("memberships").insert({
          user_id:userId,organization_id:organization.id,restaurant_id:null,role:"network_admin",active:true,permissions:[]
        });
        if(membershipResult.error)throw new Error(membershipResult.error.message);

        const {data:plan,error:planError}=await ctx.supabaseAdmin.from("subscription_plans")
          .select("id,trial_days").eq("code","standard").eq("active",true).single();
        if(planError||!plan)throw new Error(planError?.message||"Standard plan not found");
        const trialDays=Math.max(14,Number(plan.trial_days)||14);
        const trialEnds=new Date(Date.now()+trialDays*86400000).toISOString();
        const subResult=await ctx.supabaseAdmin.from("subscriptions").insert({
          organization_id:organization.id,plan_id:plan.id,status:"trialing",trial_ends_at:trialEnds
        });
        if(subResult.error)throw new Error(subResult.error.message);

        await ctx.supabaseAdmin.from("profiles").upsert({
          id:userId,first_name:ownerName,active:true,updated_at:new Date().toISOString()
        },{onConflict:"id"});

        await ctx.supabaseAdmin.from("audit_logs").insert({
          organization_id:organization.id,restaurant_id:restaurant.id,actor_user_id:userId,target_user_id:userId,
          action:"organization.bootstrap",details:{email,organizationName,restaurantName}
        });

        return json({ok:true,organization,restaurant,trialEndsAt:trialEnds});
      }catch(error){
        await ctx.supabaseAdmin.from("organizations").delete().eq("id",organization.id);
        return json({error:error instanceof Error?error.message:"Unable to provision account"},500);
      }
    }catch(error){
      return json({error:error instanceof Error?error.message:"Unexpected bootstrap error"},500);
    }
  })
};
