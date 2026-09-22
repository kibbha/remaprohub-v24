import { withSupabase } from "npm:@supabase/server@1.4.1";
import QRCode from "npm:qrcode@1.5.4";

const ORG_ADMIN=new Set(["network_admin","network_manager"]);
const REST_ADMIN=new Set(["restaurant_admin","director","manager"]);
const clean=(v:unknown,n=180)=>String(v??"").trim().slice(0,n);
const validUuid=(v:unknown)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v||""));
const json=(data:unknown,status=200)=>Response.json(data,{status});
async function sha(value:string){const bytes=new TextEncoder().encode(value),hash=await crypto.subtle.digest("SHA-256",bytes);return[...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,"0")).join("")}
function token(){const bytes=crypto.getRandomValues(new Uint8Array(32));return btoa(String.fromCharCode(...bytes)).replaceAll("+","-").replaceAll("/","_").replaceAll("=","")}
function slugify(value:string){return clean(value,60).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,55)}
const baseUrl=()=>clean(Deno.env.get("REMAPRO_PUBLIC_ORDER_BASE_URL")||"https://remaprohub.com/order.html",300);
function publicUrl(slug:string,plainToken:string){return baseUrl()+"?slug="+encodeURIComponent(slug)+"#token="+encodeURIComponent(plainToken)}
async function qrSvg(url:string){return QRCode.toString(url,{type:"svg",margin:1,width:320,errorCorrectionLevel:"M"})}

export default {
  fetch:withSupabase({auth:"user"},async(req,ctx)=>{
    if(req.method!=="POST")return json({error:"Method not allowed"},405);
    try{
      const userId=String(ctx.userClaims?.id||""),body=await req.json().catch(()=>({})),action=clean(body.action,40);
      const restaurantId=clean(body.restaurantId,64);if(!userId||!validUuid(restaurantId))return json({error:"Valid restaurant required"},400);
      const {data:restaurant,error:restaurantError}=await ctx.supabaseAdmin.from("restaurants").select("id,organization_id,name,active").eq("id",restaurantId).eq("active",true).single();
      if(restaurantError||!restaurant)return json({error:"Restaurant not found"},404);
      const {data:memberships,error:membershipError}=await ctx.supabaseAdmin.from("memberships").select("restaurant_id,organization_id,role,active").eq("user_id",userId).eq("organization_id",restaurant.organization_id).eq("active",true);
      if(membershipError)return json({error:"Unable to verify access"},500);
      const manager=(memberships||[]).some((m:any)=>(!m.restaurant_id&&ORG_ADMIN.has(String(m.role)))||(m.restaurant_id===restaurantId&&REST_ADMIN.has(String(m.role))));
      if(!manager)return json({error:"Manager access required"},403);

      if(action==="list_channels"){
        const {data,error}=await ctx.supabaseAdmin.from("direct_order_channels").select("id,slug,active,modes,public_config,created_at,updated_at").eq("restaurant_id",restaurantId).order("created_at",{ascending:false});
        if(error)return json({error:error.message},500);return json({ok:true,channels:data||[]});
      }
      if(action==="create_channel"){
        const plain=token(),tokenHash=await sha(plain),requested=slugify(body.slug||restaurant.name),slug=(requested||"restaurant")+"-"+crypto.randomUUID().slice(0,8),modes=Array.isArray(body.modes)?body.modes.map(String).filter((x:string)=>["dine_in","takeaway"].includes(x)):["dine_in","takeaway"];
        const publicConfig={title:clean(body.title||restaurant.name,100),accent:clean(body.accent,30),allowNotes:body.allowNotes!==false};
        const {data,error}=await ctx.supabaseAdmin.from("direct_order_channels").insert({organization_id:restaurant.organization_id,restaurant_id:restaurantId,slug,token_hash:tokenHash,modes:modes.length?modes:["dine_in","takeaway"],public_config:publicConfig,created_by:userId}).select("id,slug,active,modes,public_config,created_at").single();
        if(error)return json({error:error.message},409);const url=publicUrl(slug,plain);return json({ok:true,channel:data,token:plain,url,qrSvg:await qrSvg(url)});
      }
      if(action==="rotate_token"){
        const id=clean(body.channelId,64);if(!validUuid(id))return json({error:"Valid channel required"},400);
        const plain=token(),tokenHash=await sha(plain),{data,error}=await ctx.supabaseAdmin.from("direct_order_channels").update({token_hash:tokenHash,updated_at:new Date().toISOString()}).eq("id",id).eq("restaurant_id",restaurantId).select("id,slug,active,modes,public_config").single();
        if(error||!data)return json({error:error?.message||"Channel not found"},404);const url=publicUrl(data.slug,plain);return json({ok:true,channel:data,token:plain,url,qrSvg:await qrSvg(url)});
      }
      if(action==="set_channel"){
        const id=clean(body.channelId,64);if(!validUuid(id))return json({error:"Valid channel required"},400);
        const patch:any={updated_at:new Date().toISOString()};if(typeof body.active==="boolean")patch.active=body.active;if(Array.isArray(body.modes)){const modes=body.modes.map(String).filter((x:string)=>["dine_in","takeaway"].includes(x));if(modes.length)patch.modes=modes}
        const {data,error}=await ctx.supabaseAdmin.from("direct_order_channels").update(patch).eq("id",id).eq("restaurant_id",restaurantId).select("id,slug,active,modes,public_config,updated_at").single();
        if(error||!data)return json({error:error?.message||"Channel not found"},404);return json({ok:true,channel:data});
      }
      if(action==="list_orders"){
        const statuses=Array.isArray(body.statuses)?body.statuses.map(String).slice(0,10):["pending","accepted","imported","preparing","ready"];
        const {data,error}=await ctx.supabaseAdmin.from("direct_orders").select("id,public_reference,service_type,status,payment_status,payment_method,customer_name,customer_phone,customer_email,marketing_consent,table_label,covers,requested_for,note,subtotal,tax_total,total,currency,created_at,accepted_at,pos_order_id,direct_order_items(id,catalog_item_id,name_snapshot,quantity,unit_price,tax_rate,tax_amount,line_total,station_snapshot,note,modifiers)").eq("restaurant_id",restaurantId).in("status",statuses).order("created_at",{ascending:true}).limit(200);
        if(error)return json({error:error.message},500);return json({ok:true,orders:data||[]});
      }
      return json({error:"Unsupported action"},400);
    }catch(error){return json({error:error instanceof Error?error.message:"Unexpected direct-order admin error"},500)}
  })
};