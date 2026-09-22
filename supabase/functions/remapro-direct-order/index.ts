import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type,x-remapro-order-token","Access-Control-Allow-Methods":"POST,OPTIONS","Cache-Control":"no-store"};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json"}});
const clean=(v:unknown,n=180)=>String(v??"").trim().slice(0,n);
const validUuid=(v:unknown)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v||""));
async function sha(value:string){const bytes=new TextEncoder().encode(value),hash=await crypto.subtle.digest("SHA-256",bytes);return[...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,"0")).join("")}
const service=()=>{const url=Deno.env.get("SUPABASE_URL")||"",key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";if(!url||!key)throw new Error("Server configuration unavailable");return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})}
function clientIp(req:Request){return clean(req.headers.get("cf-connecting-ip")||req.headers.get("x-forwarded-for")?.split(",")[0]||"unknown",80)}
function publicRef(){return "WEB-"+new Date().toISOString().slice(0,10).replaceAll("-","")+"-"+crypto.randomUUID().slice(0,8).toUpperCase()}
async function channelFor(db:any,slug:string,plain:string){
  if(!slug||plain.length<24)return null;const hash=await sha(plain),{data}=await db.from("direct_order_channels").select("id,organization_id,restaurant_id,slug,active,modes,public_config,restaurants(name,currency,timezone)").eq("slug",slug).eq("token_hash",hash).eq("active",true).maybeSingle();return data||null
}
function layoutConfig(doc:any,productId:string){
  if(!doc||typeof doc!=="object")return{groups:[],menu:null};
  const buttons=(Array.isArray(doc.buttons)?doc.buttons:[]).filter((x:any)=>String(x.productId)===productId),links=(Array.isArray(doc.productModifiers)?doc.productModifiers:[]).find((x:any)=>String(x.productId)===productId),ids=new Set([...(links?.groupIds||[]),...buttons.flatMap((x:any)=>x.modifierGroupIds||[])].map(String));
  const groups=(Array.isArray(doc.modifierGroups)?doc.modifierGroups:[]).filter((x:any)=>ids.has(String(x.id))).map((g:any)=>({id:clean(g.id,80),name:clean(g.name,100),min:Math.max(0,Math.trunc(Number(g.min)||0)),max:Math.max(1,Math.trunc(Number(g.max)||1)),required:g.required===true,options:(Array.isArray(g.options)?g.options:[]).map((o:any)=>({id:clean(o.id,80),name:clean(o.name,100),priceDelta:Math.round((Number(o.priceDelta)||0)*100)/100,station:clean(o.station,20)})).filter((o:any)=>o.id&&o.name)}));
  return{groups,menu:null}
}
function normalizeModifiers(input:any,config:any){
  const source=Array.isArray(input)?input:[],out:any[]=[];let delta=0;
  for(const group of config.groups||[]){const raw=source.find((x:any)=>String(x.groupId)===String(group.id)),ids=[...new Set((Array.isArray(raw?.optionIds)?raw.optionIds:[]).map(String))],chosen=(group.options||[]).filter((o:any)=>ids.includes(String(o.id)));if(chosen.length<(group.required?Math.max(1,group.min||0):group.min||0)||chosen.length>group.max)throw new Error("Invalid modifier selection");if(chosen.length){delta+=chosen.reduce((sum:number,o:any)=>sum+(Number(o.priceDelta)||0),0);out.push({groupId:group.id,name:group.name,options:chosen})}}
  return{modifiers:out,delta:Math.round(delta*100)/100}
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});if(req.method!=="POST")return json({error:"Method not allowed"},405);
  try{
    const db=service(),body=await req.json().catch(()=>({})),action=clean(body.action,30),slug=clean(body.slug,80),plain=clean(req.headers.get("x-remapro-order-token")||body.token,180),channel=await channelFor(db,slug,plain);
    if(!channel)return json({error:"Ordering link is invalid or inactive"},403);
    if(action==="menu"){
      const [{data:catalog,error:catalogError},{data:layout}]=await Promise.all([
        db.from("pos_catalog_items").select("id,name,category,price,tax_rate,production_station,metadata").eq("restaurant_id",channel.restaurant_id).eq("active",true).order("category").order("sort_order"),
        db.from("pos_layout_versions").select("version,document,published_at").eq("restaurant_id",channel.restaurant_id).order("version",{ascending:false}).limit(1).maybeSingle()
      ]);
      if(catalogError)return json({error:"Menu unavailable"},503);
      const items=(catalog||[]).map((x:any)=>({id:x.id,name:x.name,category:x.category,price:Number(x.price)||0,taxRate:Number(x.tax_rate)||0,station:x.production_station,config:layoutConfig(layout?.document,x.id)}));
      return json({ok:true,restaurant:{name:(channel as any).restaurants?.name||"",currency:(channel as any).restaurants?.currency||"CHF"},channel:{slug:channel.slug,modes:channel.modes,config:channel.public_config},layoutVersion:layout?.version||0,items});
    }
    if(action==="create_order"){
      const idem=clean(body.idempotencyKey,64);if(!validUuid(idem))return json({error:"Valid idempotency key required"},400);
      const mode=clean(body.serviceType,20);if(!Array.isArray(channel.modes)||!channel.modes.includes(mode))return json({error:"Service mode unavailable"},400);
      const requested=Array.isArray(body.items)?body.items.slice(0,60):[];if(!requested.length)return json({error:"Order is empty"},400);
      const ipHash=await sha(channel.id+"|"+clientIp(req));const hourAgo=new Date(Date.now()-3600000).toISOString(),{count}=await db.from("direct_orders").select("id",{count:"exact",head:true}).eq("channel_id",channel.id).eq("client_hash",ipHash).gte("created_at",hourAgo);if((count||0)>=20)return json({error:"Too many recent orders"},429);
      const ids=[...new Set(requested.map((x:any)=>clean(x.catalogItemId,64)).filter(validUuid))];if(ids.length!==requested.length)return json({error:"Invalid product"},400);
      const [{data:catalog,error:catalogError},{data:layout}]=await Promise.all([db.from("pos_catalog_items").select("id,name,price,tax_rate,production_station").eq("restaurant_id",channel.restaurant_id).eq("active",true).in("id",ids),db.from("pos_layout_versions").select("document").eq("restaurant_id",channel.restaurant_id).order("version",{ascending:false}).limit(1).maybeSingle()]);
      if(catalogError||!catalog||catalog.length!==ids.length)return json({error:"Product unavailable"},409);const byId=new Map(catalog.map((x:any)=>[String(x.id),x]));let total=0,taxTotal=0;const normalized:any[]=[];
      for(const input of requested){const item:any=byId.get(String(input.catalogItemId)),qty=Math.round((Number(input.quantity)||0)*1000)/1000;if(!item||qty<=0||qty>50)return json({error:"Invalid quantity"},400);const config=layoutConfig(layout?.document,item.id),mod=normalizeModifiers(input.modifiers,config),unit=Math.max(0,Number(item.price)||0)+mod.delta,line=Math.round(unit*qty*100)/100,taxRate=Math.max(0,Number(item.tax_rate)||0),tax=Math.round((line*(taxRate/(100+taxRate)))*100)/100;total+=line;taxTotal+=tax;normalized.push({catalog_item_id:item.id,name_snapshot:item.name,quantity:qty,unit_price:unit,tax_rate:taxRate,tax_amount:tax,line_total:line,station_snapshot:item.production_station||"kitchen",note:clean(input.note,300)||null,modifiers:mod.modifiers})}
      total=Math.round(total*100)/100;taxTotal=Math.round(taxTotal*100)/100;if(total<=0||total>25000)return json({error:"Order total out of range"},400);
      const existing=await db.from("direct_orders").select("id,public_reference,status,total,currency,created_at").eq("channel_id",channel.id).eq("idempotency_key",idem).maybeSingle();if(existing.data)return json({ok:true,replayed:true,order:existing.data});
      const ref=publicRef(),customer=body.customer&&typeof body.customer==="object"?body.customer:{},order={organization_id:channel.organization_id,restaurant_id:channel.restaurant_id,channel_id:channel.id,public_reference:ref,idempotency_key:idem,service_type:mode,status:"pending",payment_status:"unpaid",payment_method:"counter",customer_name:clean(customer.name,120)||null,customer_phone:clean(customer.phone,60)||null,customer_email:clean(customer.email,180)||null,marketing_consent:customer.marketingConsent===true,table_label:mode==="dine_in"?clean(body.tableLabel,80)||null:null,covers:mode==="dine_in"?Math.max(1,Math.min(100,Math.trunc(Number(body.covers)||1))):0,requested_for:body.requestedFor?clean(body.requestedFor,40):null,note:clean(body.note,600)||null,subtotal:Math.round((total-taxTotal)*100)/100,tax_total:taxTotal,total,currency:(channel as any).restaurants?.currency||"CHF",client_hash:ipHash};
      const {data:created,error:createError}=await db.from("direct_orders").insert(order).select("id,public_reference,status,total,currency,created_at").single();if(createError)return createError.code==="23505"?json({error:"Duplicate order submission"},409):json({error:"Unable to create order"},500);
      const rows=normalized.map(x=>({...x,direct_order_id:created.id})),{error:itemError}=await db.from("direct_order_items").insert(rows);if(itemError){await db.from("direct_orders").delete().eq("id",created.id);return json({error:"Unable to save order items"},500)}
      await db.from("direct_order_events").insert({direct_order_id:created.id,event_type:"submitted",details:{serviceType:mode,itemCount:rows.length}});
      return json({ok:true,order:created},201);
    }
    if(action==="status"){
      const id=clean(body.orderId,64),ref=clean(body.reference,40);if(!validUuid(id)||!ref)return json({error:"Order reference required"},400);const {data}=await db.from("direct_orders").select("id,public_reference,status,payment_status,total,currency,created_at,accepted_at,completed_at").eq("id",id).eq("channel_id",channel.id).eq("public_reference",ref).maybeSingle();return data?json({ok:true,order:data}):json({error:"Order not found"},404)
    }
    return json({error:"Unsupported action"},400);
  }catch(error){return json({error:error instanceof Error?error.message:"Unexpected ordering error"},500)}
});