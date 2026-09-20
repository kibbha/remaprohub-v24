import { withSupabase } from "npm:@supabase/server@1.4.1";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
};
const ORG_ADMIN_ROLES=new Set(["network_admin","network_manager"]);
const RESTAURANT_ADMIN_ROLES=new Set(["restaurant_admin","director","manager"]);
const ALL_KEYS=["revenue","covers","expenses","recipeTarget","recipeWarning","sales","orders","products","loyalty","briefings","invoices","checklists","alerts","goals","training","leave","equipment","audits","cleaning","deliveries","allergens","recalls","financeHistory","stock","temps","haccpAudit","suppliers","purchases","team","shifts","incidents","waste","reservations","customers","recipes","maintenance","handover","categories","tasksDate","tasks","documentEntries"];
const READ_BY_PERMISSION={
  operations:["tasksDate","tasks"],
  haccp:["temps","haccpAudit"],
  stock:["stock"],
  deliveries:["deliveries","stock","suppliers"],
  checklists:["checklists"],
  planning:["shifts","team"],
  reservations:["reservations","customers"]
};
const WRITE_BY_PERMISSION={
  operations:["tasksDate","tasks"],
  haccp:["temps","haccpAudit"],
  stock:["stock"],
  deliveries:["deliveries"],
  checklists:["checklists"],
  planning:["shifts"],
  reservations:["reservations"]
};
const NUMERIC_KEYS=new Set(["revenue","covers","expenses","recipeTarget","recipeWarning"]);
const STRING_KEYS=new Set(["tasksDate"]);

function json(data:unknown,status=200){
  return new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json"}});
}
function permissionKeys(memberships:any[],map:Record<string,string[]>){
  const out=new Set<string>();
  for(const membership of memberships)for(const permission of membership.permissions||[])for(const key of map[permission]||[])out.add(key);
  return [...out];
}
function filterWorkspace(data:any,keys:string[]){
  const source=data&&typeof data==="object"&&!Array.isArray(data)?data:{};
  const out:Record<string,unknown>={};
  for(const key of keys)if(Object.prototype.hasOwnProperty.call(source,key))out[key]=source[key];
  return out;
}
function validWorkspaceValue(key:string,value:any){
  if(NUMERIC_KEYS.has(key))return typeof value==="number"&&Number.isFinite(value);
  if(STRING_KEYS.has(key))return typeof value==="string";
  return Array.isArray(value);
}
function sanitizeWorkspace(data:any,keys:string[]){
  if(!data||typeof data!=="object"||Array.isArray(data))return null;
  if(JSON.stringify(data).length>2_000_000)return null;
  const out:Record<string,unknown>={};
  for(const key of keys)if(Object.prototype.hasOwnProperty.call(data,key)){
    if(!validWorkspaceValue(key,data[key]))return null;
    out[key]=data[key];
  }
  return out;
}
async function conflict(ctx:any,restaurantId:string,readKeys:string[]){
  const {data}=await ctx.supabaseAdmin.from("restaurant_workspaces")
    .select("revision,data").eq("restaurant_id",restaurantId).maybeSingle();
  return json({error:"SYNC_CONFLICT",revision:Number(data?.revision||0),data:filterWorkspace(data?.data||{},readKeys)},409);
}

const authenticated=withSupabase({auth:"user"},async(req,ctx)=>{
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  try{
    const body=await req.json();
    const action=String(body.action||"");
    const restaurantId=String(body.restaurantId||"");
    const userId=String(ctx.userClaims?.id||"");
    if(!["pull","push"].includes(action)||!restaurantId||!userId)return json({error:"Invalid sync payload"},400);

    const {data:restaurant,error:restaurantError}=await ctx.supabase.from("restaurants")
      .select("id,organization_id").eq("id",restaurantId).eq("active",true).single();
    if(restaurantError||!restaurant)return json({error:"Restaurant access denied"},403);

    const {data:memberships,error:membershipError}=await ctx.supabase.from("memberships")
      .select("restaurant_id,organization_id,role,permissions,active")
      .eq("organization_id",restaurant.organization_id)
      .eq("user_id",userId)
      .eq("active",true);
    if(membershipError)return json({error:"Unable to verify membership"},403);

    const own=memberships||[];
    const orgAdmin=own.some((m:any)=>ORG_ADMIN_ROLES.has(String(m.role)));
    const restaurantAdmin=own.some((m:any)=>m.restaurant_id===restaurantId&&RESTAURANT_ADMIN_ROLES.has(String(m.role)));
    const scoped=own.filter((m:any)=>m.restaurant_id===restaurantId);
    if(!orgAdmin&&!restaurantAdmin&&!scoped.length)return json({error:"Restaurant access denied"},403);

    const manager=orgAdmin||restaurantAdmin;
    const readKeys=manager?[...ALL_KEYS]:permissionKeys(scoped,READ_BY_PERMISSION);
    const writeKeys=manager?[...ALL_KEYS]:permissionKeys(scoped,WRITE_BY_PERMISSION);
    if(!readKeys.length)return json({error:"No workspace permission"},403);

    const {data:current,error:currentError}=await ctx.supabaseAdmin.from("restaurant_workspaces")
      .select("restaurant_id,organization_id,data,revision,updated_at")
      .eq("restaurant_id",restaurantId).maybeSingle();
    if(currentError)return json({error:"Unable to read workspace"},500);

    if(action==="pull"){
      return json({
        ok:true,
        exists:!!current,
        revision:Number(current?.revision||0),
        updatedAt:current?.updated_at||null,
        data:filterWorkspace(current?.data||{},readKeys),
        readKeys,
        writeKeys
      });
    }

    if(!writeKeys.length)return json({error:"No workspace write permission"},403);
    const baseRevision=Number(body.baseRevision);
    if(!Number.isInteger(baseRevision)||baseRevision<0)return json({error:"Invalid base revision"},400);
    const patch=sanitizeWorkspace(body.workspace,writeKeys);
    if(!patch)return json({error:"Invalid workspace data"},400);

    if(current){
      if(Number(current.revision)!==baseRevision)return conflict(ctx,restaurantId,readKeys);
      const merged={...(current.data||{}),...patch};
      const nextRevision=baseRevision+1;
      const {data:updated,error:updateError}=await ctx.supabaseAdmin.from("restaurant_workspaces")
        .update({data:merged,revision:nextRevision,updated_by:userId,updated_at:new Date().toISOString()})
        .eq("restaurant_id",restaurantId)
        .eq("revision",baseRevision)
        .select("revision,data,updated_at")
        .maybeSingle();
      if(updateError)return json({error:"Unable to update workspace"},500);
      if(!updated)return conflict(ctx,restaurantId,readKeys);
      return json({ok:true,revision:Number(updated.revision),updatedAt:updated.updated_at,data:filterWorkspace(updated.data||{},readKeys)});
    }

    if(baseRevision!==0)return conflict(ctx,restaurantId,readKeys);
    const {data:inserted,error:insertError}=await ctx.supabaseAdmin.from("restaurant_workspaces")
      .insert({restaurant_id:restaurantId,organization_id:restaurant.organization_id,data:patch,revision:1,updated_by:userId})
      .select("revision,data,updated_at")
      .maybeSingle();
    if(insertError||!inserted){
      const {data:latest}=await ctx.supabaseAdmin.from("restaurant_workspaces")
        .select("revision").eq("restaurant_id",restaurantId).maybeSingle();
      if(latest)return conflict(ctx,restaurantId,readKeys);
      return json({error:"Unable to create workspace"},500);
    }
    return json({ok:true,revision:Number(inserted.revision),updatedAt:inserted.updated_at,data:filterWorkspace(inserted.data||{},readKeys)});
  }catch(error){
    return json({error:error instanceof Error?error.message:"Unexpected sync error"},500);
  }
});

export default {
  fetch:async(req:Request)=>{
    if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
    const response=await authenticated(req);
    const headers=new Headers(response.headers);
    for(const [key,value] of Object.entries(cors))headers.set(key,value);
    return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  }
};
