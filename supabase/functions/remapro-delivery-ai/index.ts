import { withSupabase } from "npm:@supabase/server@1.4.1";

const BUCKET="delivery-ai-temp";
const ORG_ADMIN_ROLES=new Set(["network_admin","network_manager"]);
const RESTAURANT_ADMIN_ROLES=new Set(["restaurant_admin","director","manager"]);
const json=(data:unknown,status=200)=>Response.json(data,{status});
const clean=(value:unknown,max=180)=>String(value??"").trim().slice(0,max);
const validUuid=(value:unknown)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value||""));
const clamp=(value:unknown,min=0,max=1)=>Math.min(max,Math.max(min,Number(value)||0));
const unitValue=(value:unknown)=>{
  const raw=clean(value,40).toLowerCase();
  const map:Record<string,string>={"pcs":"pièce","pc":"pièce","piece":"pièce","pieces":"pièce","unite":"unité","unit":"unité","units":"unité","litre":"l","liter":"l","liters":"l","kg":"kg","g":"g","l":"l","cl":"cl","ml":"ml"};
  return map[raw]||raw||"unité";
};
const normalize=(value:unknown)=>clean(value,260).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const barcodeValue=(value:unknown)=>clean(value,64).replace(/[^0-9A-Za-z]/g,"");
const tokenSet=(value:unknown)=>new Set(normalize(value).split(/\s+/).filter(x=>x.length>1));
function tokenScore(a:unknown,b:unknown){
  const aa=tokenSet(a),bb=tokenSet(b);if(!aa.size||!bb.size)return 0;
  let both=0;for(const x of aa)if(bb.has(x))both++;
  return both/Math.max(aa.size,bb.size);
}
function shaHex(bytes:ArrayBuffer){
  return crypto.subtle.digest("SHA-256",bytes).then(buf=>[...new Uint8Array(buf)].map(x=>x.toString(16).padStart(2,"0")).join(""));
}
function bytesToBase64(bytes:Uint8Array){
  let binary="";const chunk=0x8000;
  for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+chunk,bytes.length)));
  return btoa(binary);
}
function parseJsonText(text:string){
  const value=String(text||"").trim().replace(/^\`\`\`json\s*/i,"").replace(/\`\`\`$/,"").trim();
  return JSON.parse(value);
}
function dedupeItems(raw:any[]){
  const map=new Map<string,any>();
  for(const source of raw.slice(0,120)){
    const item={
      name:clean(source?.name,180),brand:clean(source?.brand,120),packaging:clean(source?.packaging,160),
      quantity:Math.max(0,Number(source?.quantity)||0),unit:unitValue(source?.unit),
      barcode:barcodeValue(source?.barcode),confidence:clamp(source?.confidence),
      photoIndexes:[...new Set((Array.isArray(source?.photoIndexes)?source.photoIndexes:[]).map((x:any)=>Math.trunc(Number(x))).filter((x:number)=>x>=1&&x<=12))],
      evidence:{
        visual:(Array.isArray(source?.evidence?.visual)?source.evidence.visual:[]).map((x:any)=>clean(x,180)).filter(Boolean).slice(0,8),
        ocr:(Array.isArray(source?.evidence?.ocr)?source.evidence.ocr:[]).map((x:any)=>clean(x,180)).filter(Boolean).slice(0,12),
        barcode:clean(source?.evidence?.barcode,80)
      }
    };
    if(!item.name)continue;
    const key=item.barcode?("barcode:"+item.barcode):("sku:"+normalize([item.brand,item.name,item.packaging].join(" ")));
    const existing=map.get(key);
    if(!existing){map.set(key,item);continue}
    existing.quantity=Math.max(existing.quantity,item.quantity);
    existing.confidence=Math.max(existing.confidence,item.confidence);
    existing.photoIndexes=[...new Set([...existing.photoIndexes,...item.photoIndexes])].sort((a,b)=>a-b);
    existing.evidence.visual=[...new Set([...existing.evidence.visual,...item.evidence.visual])].slice(0,8);
    existing.evidence.ocr=[...new Set([...existing.evidence.ocr,...item.evidence.ocr])].slice(0,12);
    if(!existing.brand&&item.brand)existing.brand=item.brand;
    if(!existing.packaging&&item.packaging)existing.packaging=item.packaging;
  }
  return [...map.values()];
}
function matchCatalog(item:any,catalog:any[]){
  const barcode=barcodeValue(item.barcode);
  if(barcode){
    const exact=catalog.find(c=>barcodeValue(c.barcode)===barcode);
    if(exact)return{stockId:String(exact.id),name:clean(exact.name,180),score:1,reason:"barcode"};
  }
  const query=normalize([item.brand,item.name,item.packaging].join(" "));
  let best:any=null;
  for(const c of catalog){
    const name=clean(c.name,180),candidate=normalize([c.brand,name,c.packaging].join(" "));
    let score=0;
    if(query&&candidate&&query===candidate)score=.98;
    else if(normalize(item.name)===normalize(name))score=.95;
    else if(query&&candidate&&(query.includes(candidate)||candidate.includes(query)))score=.88;
    else score=.72*tokenScore(query,candidate)+.18*tokenScore(item.name,name);
    if(item.brand&&c.brand&&normalize(item.brand)===normalize(c.brand))score+=.06;
    if(item.packaging&&c.packaging&&normalize(item.packaging)===normalize(c.packaging))score+=.04;
    score=Math.min(1,score);
    if(!best||score>best.score)best={stockId:String(c.id),name,score:Number(score.toFixed(3)),reason:"catalog_text"};
  }
  return best&&best.score>=.68?best:null;
}
async function writeEvent(ctx:any,analysis:any,eventType:string,details:any={}){
  const {error}=await ctx.supabaseAdmin.from("delivery_ai_analysis_events").insert({
    analysis_id:analysis.id,organization_id:analysis.organization_id,restaurant_id:analysis.restaurant_id,
    actor_user_id:analysis.actor_user_id,event_type:eventType,details
  });
  if(error)console.error("delivery ai event log failed",error.message);
}
async function deleteImages(ctx:any,paths:string[],analysis:any){
  if(!paths.length)return;
  const {error}=await ctx.supabaseAdmin.storage.from(BUCKET).remove(paths);
  await writeEvent(ctx,analysis,"images_deleted",{count:paths.length,ok:!error});
  if(error)console.error("delivery ai temp delete failed",error.message);
}
function outputText(data:any){
  return data?.output_text || (data?.output||[]).flatMap((x:any)=>x?.content||[]).map((x:any)=>x?.text||"").filter(Boolean).join("\n");
}

export default {
  fetch:withSupabase({auth:"user"},async(req,ctx)=>{
    if(req.method!=="POST")return json({error:"Method not allowed"},405);
    const started=Date.now();
    let cleanupPaths:string[]=[];
    let analysisContext:any=null;
    try{
      const body=await req.json().catch(()=>({}));
      const action=clean(body.action,40)||"analyze";
      const restaurantId=clean(body.restaurantId,64);
      const userId=String(ctx.userClaims?.id||"");
      if(!validUuid(restaurantId)||!userId)return json({error:"Valid restaurant and authenticated user required"},400);

      const {data:restaurant,error:restaurantError}=await ctx.supabaseAdmin.from("restaurants")
        .select("id,organization_id,name,active").eq("id",restaurantId).eq("active",true).single();
      if(restaurantError||!restaurant)return json({error:"Restaurant not found"},404);

      const {data:memberships,error:membershipError}=await ctx.supabaseAdmin.from("memberships")
        .select("restaurant_id,organization_id,role,permissions,active").eq("user_id",userId).eq("active",true);
      if(membershipError)return json({error:"Unable to verify access"},500);
      const allowed=(memberships||[]).some((m:any)=>{
        if(m.organization_id!==restaurant.organization_id)return false;
        if(!m.restaurant_id&&ORG_ADMIN_ROLES.has(String(m.role)))return true;
        if(m.restaurant_id!==restaurantId)return false;
        if(RESTAURANT_ADMIN_ROLES.has(String(m.role)))return true;
        const permissions=Array.isArray(m.permissions)?m.permissions.map(String):[];
        return permissions.includes("stock")||permissions.includes("deliveries");
      });
      if(!allowed)return json({error:"Stock or delivery access required"},403);

      if(action==="history"){
        const {data,error}=await ctx.supabaseAdmin.from("delivery_ai_analyses")
          .select("id,status,photo_count,model,original_result,corrected_result,error,created_at,analyzed_at,validated_at")
          .eq("restaurant_id",restaurantId).order("created_at",{ascending:false}).limit(20);
        if(error)return json({error:"Unable to load analysis history"},500);
        return json({ok:true,rows:data||[]});
      }

      const analysisId=clean(body.analysisId,64);
      if(!validUuid(analysisId))return json({error:"Valid analysisId required"},400);

      const {data:existing}=await ctx.supabaseAdmin.from("delivery_ai_analyses")
        .select("*").eq("id",analysisId).maybeSingle();

      if(action==="finalize"){
        if(!existing||existing.restaurant_id!==restaurantId)return json({error:"Analysis not found"},404);
        if(existing.status!=="review")return json({error:"Analysis is not awaiting validation"},409);
        const corrected=body.corrected&&typeof body.corrected==="object"?body.corrected:{};
        const items=Array.isArray(corrected.items)?corrected.items.slice(0,200):[];
        if(!items.length)return json({error:"At least one delivery item is required"},400);
        const workspace=(await ctx.supabaseAdmin.from("restaurant_workspaces").select("data").eq("restaurant_id",restaurantId).maybeSingle()).data?.data||{};
        const catalog=Array.isArray(workspace.stock)?workspace.stock:[];
        const catalogIds=new Set(catalog.map((x:any)=>String(x?.id||"")).filter(Boolean));
        const normalized:any[]=[];
        for(let i=0;i<items.length;i++){
          const x=items[i]||{},name=clean(x.name,180),stockId=clean(x.stockId,64),quantity=Number(x.quantity);
          if(!name||!Number.isFinite(quantity)||quantity<=0)return json({error:`Invalid delivery item at index ${i}`},400);
          if(stockId&&!catalogIds.has(stockId))return json({error:`Stock reference no longer exists at index ${i}`},409);
          normalized.push({
            sourceIndex:i,stockId:stockId||null,createNew:!stockId,
            name,brand:clean(x.brand,120),packaging:clean(x.packaging,160),unit:unitValue(x.unit),
            quantity:Math.round(quantity*1000)/1000,barcode:barcodeValue(x.barcode),
            confidence:clamp(x.confidence),matchConfidence:clamp(x.matchConfidence)
          });
        }
        const correctedResult={
          supplier:clean(corrected.supplier,180),date:clean(corrected.date,10),items:normalized
        };
        const {data:updated,error}=await ctx.supabaseAdmin.from("delivery_ai_analyses")
          .update({status:"validated",corrected_result:correctedResult,validated_at:new Date().toISOString(),updated_at:new Date().toISOString()})
          .eq("id",analysisId).eq("restaurant_id",restaurantId).select("*").single();
        if(error||!updated)return json({error:"Unable to validate delivery analysis"},500);
        await writeEvent(ctx,updated,"validated",{itemCount:normalized.length,newProducts:normalized.filter(x=>x.createNew).length});
        return json({ok:true,analysisId,status:"validated",corrected:correctedResult});
      }

      if(action==="cancel"){
        if(!existing||existing.restaurant_id!==restaurantId)return json({error:"Analysis not found"},404);
        const paths=(Array.isArray(body.imagePaths)?body.imagePaths:[]).map((x:any)=>clean(x,500)).filter(Boolean);
        const prefix=restaurantId+"/"+analysisId+"/";
        cleanupPaths=paths.filter((p:string)=>p.startsWith(prefix)).slice(0,12);
        const {data:updated,error}=await ctx.supabaseAdmin.from("delivery_ai_analyses")
          .update({status:"cancelled",updated_at:new Date().toISOString()})
          .eq("id",analysisId).eq("restaurant_id",restaurantId).select("*").single();
        if(error||!updated)return json({error:"Unable to cancel analysis"},500);
        analysisContext=updated;
        await writeEvent(ctx,updated,"cancelled",{});
        return json({ok:true,analysisId,status:"cancelled"});
      }

      if(action!=="analyze")return json({error:"Unsupported action"},400);
      const paths=(Array.isArray(body.imagePaths)?body.imagePaths:[]).map((x:any)=>clean(x,500)).filter(Boolean);
      if(paths.length<1||paths.length>8)return json({error:"Provide between 1 and 8 delivery photos"},400);
      const prefix=restaurantId+"/"+analysisId+"/";
      if(paths.some((p:string)=>!p.startsWith(prefix)))return json({error:"Invalid temporary image path"},400);
      cleanupPaths=[...new Set(paths)];

      const analysisBase={
        id:analysisId,organization_id:restaurant.organization_id,restaurant_id:restaurantId,
        actor_user_id:userId,status:"analyzing",photo_count:cleanupPaths.length,updated_at:new Date().toISOString()
      };
      const {data:analysis,error:analysisError}=await ctx.supabaseAdmin.from("delivery_ai_analyses")
        .upsert(analysisBase,{onConflict:"id"}).select("*").single();
      if(analysisError||!analysis)return json({error:"Unable to create delivery analysis"},500);
      analysisContext=analysis;
      await writeEvent(ctx,analysis,existing?"analysis_started":"created",{photoCount:cleanupPaths.length});
      if(existing)await writeEvent(ctx,analysis,"analysis_started",{photoCount:cleanupPaths.length});

      const {data:workspaceRow,error:workspaceError}=await ctx.supabaseAdmin.from("restaurant_workspaces")
        .select("data").eq("restaurant_id",restaurantId).maybeSingle();
      if(workspaceError)return json({error:"Unable to load product catalog"},500);
      const workspace=workspaceRow?.data||{},catalog=Array.isArray(workspace.stock)?workspace.stock.slice(0,2000):[];

      const imageContent:any[]=[];const hashes:string[]=[];let totalBytes=0;
      for(let index=0;index<cleanupPaths.length;index++){
        const path=cleanupPaths[index];
        const {data:file,error}=await ctx.supabaseAdmin.storage.from(BUCKET).download(path);
        if(error||!file)throw new Error("TEMP_IMAGE_NOT_FOUND");
        const buffer=await file.arrayBuffer();totalBytes+=buffer.byteLength;
        if(buffer.byteLength>8_388_608||totalBytes>32_000_000)throw new Error("DELIVERY_IMAGES_TOO_LARGE");
        hashes.push(await shaHex(buffer));
        const mime=file.type&&file.type.startsWith("image/")?file.type:"image/jpeg";
        imageContent.push({type:"input_text",text:`Photo ${index+1} of ${cleanupPaths.length}`});
        imageContent.push({type:"input_image",image_url:`data:${mime};base64,${bytesToBase64(new Uint8Array(buffer))}`});
      }

      const apiKey=Deno.env.get("OPENAI_API_KEY")||"";
      if(!apiKey)throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");
      const model=Deno.env.get("OPENAI_DELIVERY_MODEL")||Deno.env.get("OPENAI_MODEL")||"gpt-5.6-luna";
      const lang=clean(body.language,8)||"fr";
      const instructions=`You are the server-side receiving assistant for a restaurant inventory system.
Analyze ALL delivery photos together. Combine visual recognition, OCR of labels/packaging, and visible barcode/GTIN/EAN digits.
Return one aggregate row per distinct SKU/product across all photos. Photos may overlap: NEVER count the same physical units twice just because they appear in multiple photos. Use photoIndexes to show where evidence appears.
Estimate quantity conservatively. Read brand, packaging (for example 6 x 1 L, carton 12 bottles, 5 kg sack), unit and barcode when visible.
Do not invent barcode digits. If a barcode cannot be read confidently, return an empty barcode.
Confidence is 0.0 to 1.0 and reflects product identification, label/OCR and quantity evidence.
If a product cannot be identified, use a useful generic description such as "Produit non identifié" and a low confidence.
Return ONLY valid JSON exactly matching:
{"items":[{"name":"string","brand":"string","packaging":"string","quantity":0,"unit":"kg|g|l|cl|ml|pièce|unité|carton|caisse|other","barcode":"string","confidence":0.0,"photoIndexes":[1],"evidence":{"visual":["string"],"ocr":["string"],"barcode":"string"}}],"notes":["string"]}
Do not include prices. Interface language: ${lang}.`;
      const response=await fetch("https://api.openai.com/v1/responses",{
        method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${apiKey}`},
        body:JSON.stringify({
          model,instructions,
          input:[{role:"user",content:[
            {type:"input_text",text:"Identify and count the unique products in this delivery across all supplied photos. Avoid cross-photo duplicates."},
            ...imageContent
          ]}],
          store:false
        })
      });
      const aiData=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(clean(aiData?.error?.message||"OpenAI delivery analysis failed",300));
      let parsed:any;
      try{parsed=parseJsonText(outputText(aiData))}catch{throw new Error("AI_RESPONSE_NOT_VALID_JSON")}
      const detected=dedupeItems(Array.isArray(parsed?.items)?parsed.items:[]);
      const enriched=detected.map((item:any,index:number)=>{
        const match=matchCatalog(item,catalog);
        return{
          id:"item_"+String(index+1).padStart(3,"0"),
          ...item,
          match:match?{stockId:match.stockId,name:match.name,confidence:match.score,reason:match.reason}:null,
          createSuggested:!match,
          uncertain:item.confidence<.9||!match||match.score<.85,
          confidenceBand:item.confidence>=.9?"recognized":item.confidence>=.7?"verify":"required"
        };
      });
      const result={
        analysisId,restaurantId,
        items:enriched,
        notes:(Array.isArray(parsed?.notes)?parsed.notes:[]).map((x:any)=>clean(x,220)).filter(Boolean).slice(0,10),
        summary:{
          photos:cleanupPaths.length,items:enriched.length,
          matched:enriched.filter((x:any)=>x.match).length,
          uncertain:enriched.filter((x:any)=>x.uncertain).length,
          newProducts:enriched.filter((x:any)=>x.createSuggested).length
        }
      };
      const {data:updated,error:updateError}=await ctx.supabaseAdmin.from("delivery_ai_analyses")
        .update({
          status:"review",photo_hashes:hashes,model,original_result:result,error:null,
          analyzed_at:new Date().toISOString(),updated_at:new Date().toISOString()
        })
        .eq("id",analysisId).eq("restaurant_id",restaurantId).select("*").single();
      if(updateError||!updated)throw new Error("ANALYSIS_LOG_UPDATE_FAILED");
      analysisContext=updated;
      await writeEvent(ctx,updated,"analysis_completed",{
        photoCount:cleanupPaths.length,itemCount:enriched.length,matched:result.summary.matched,
        uncertain:result.summary.uncertain,newProducts:result.summary.newProducts,
        model,durationMs:Date.now()-started
      });
      return json({ok:true,...result});
    }catch(error){
      const message=error instanceof Error?error.message:"Unexpected delivery analysis error";
      if(analysisContext?.id){
        const {data:failed}=await ctx.supabaseAdmin.from("delivery_ai_analyses")
          .update({status:"failed",error:clean(message,600),updated_at:new Date().toISOString()})
          .eq("id",analysisContext.id).select("*").maybeSingle();
        if(failed)await writeEvent(ctx,failed,"analysis_failed",{error:clean(message,240),durationMs:Date.now()-started});
      }
      return json({error:message},message==="TEMP_IMAGE_NOT_FOUND"?404:message==="DELIVERY_IMAGES_TOO_LARGE"?413:500);
    }finally{
      if(cleanupPaths.length&&analysisContext)await deleteImages(ctx,cleanupPaths,analysisContext);
    }
  })
};