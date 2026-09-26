import { withSupabase } from "npm:@supabase/server@1.4.1";

const json=(data:unknown,status=200)=>Response.json(data,{status});
const clean=(v:unknown,max=2000)=>String(v??"").trim().slice(0,max);
const validUuid=(v:unknown)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v||""));
const ORG_MANAGER=new Set(["network_admin","network_manager"]);
const RESTAURANT_MANAGER=new Set(["restaurant_admin","director","manager"]);
const CATEGORY=new Set(["question","bug","feature","billing","account","other"]);
const PRIORITY=new Set(["low","normal","high","critical"]);
const STATUS=new Set(["open","triaged","in_progress","waiting_customer","waiting_approval","resolved","closed"]);
const AGENT=new Set(["dispatcher","support","diagnostic","developer_hub","developer_pos","qa","release","product","knowledge"]);
const PLATFORM_ROLES=new Set(["owner","support","developer","qa","release","product"]);

function safeContext(value:any){
  if(!value||typeof value!=="object"||Array.isArray(value))return{};
  const allowed=["screen","online","syncState","device","os","browser","network","cashSession","activeOrderId","restaurantName","locale","lastAction","errorCode","errorMessage"];
  const out:Record<string,unknown>={};
  for(const key of allowed)if(value[key]!==undefined)out[key]=value[key];
  return JSON.stringify(out).length<=12000?out:{};
}
function platformRole(ctx:any){
  const meta=ctx?.jwtClaims?.app_metadata||ctx?.userClaims?.app_metadata||{};
  const role=String(meta?.remapro_platform_role||"");
  return PLATFORM_ROLES.has(role)?role:"";
}
async function access(ctx:any,organizationId:string,restaurantId:string,userId:string){
  const {data,error}=await ctx.supabaseAdmin.from("memberships")
    .select("organization_id,restaurant_id,role,permissions,active")
    .eq("organization_id",organizationId).eq("user_id",userId).eq("active",true);
  if(error)throw new Error("Unable to verify support access");
  const rows=data||[];
  const orgManager=rows.some((m:any)=>!m.restaurant_id&&ORG_MANAGER.has(String(m.role)));
  const restaurantMember=!restaurantId||rows.some((m:any)=>m.restaurant_id===restaurantId)||orgManager;
  const manager=orgManager||rows.some((m:any)=>m.restaurant_id===restaurantId&&RESTAURANT_MANAGER.has(String(m.role)));
  return {ok:rows.length>0&&restaurantMember,manager};
}
function extractText(data:any){
  if(typeof data?.output_text==="string")return data.output_text;
  return (data?.output||[]).flatMap((x:any)=>x?.content||[]).map((x:any)=>x?.text||x?.value||"").filter(Boolean).join("\n");
}
async function structured(apiKey:string,model:string,instructions:string,input:string,name:string,schema:any){
  const response=await fetch("https://api.openai.com/v1/responses",{
    method:"POST",
    headers:{"Content-Type":"application/json","Authorization":"Bearer "+apiKey},
    body:JSON.stringify({model,instructions,input,store:false,text:{format:{type:"json_schema",name,strict:true,schema}}})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data?.error?.message||"OpenAI request failed");
  const text=extractText(data);
  if(!text)throw new Error("Empty OpenAI response");
  return JSON.parse(text);
}
const triageSchema={type:"object",additionalProperties:false,properties:{
  category:{type:"string",enum:["question","bug","feature","billing","account","other"]},
  priority:{type:"string",enum:["low","normal","high","critical"]},
  route:{type:"string",enum:["support","diagnostic","developer_hub","developer_pos","product","knowledge"]},
  summary:{type:"string"},requires_human:{type:"boolean"},requires_approval:{type:"boolean"}
},required:["category","priority","route","summary","requires_human","requires_approval"]};
const supportSchema={type:"object",additionalProperties:false,properties:{
  reply:{type:"string"},diagnostic_questions:{type:"array",items:{type:"string"}}
},required:["reply","diagnostic_questions"]};
const diagnosticSchema={type:"object",additionalProperties:false,properties:{
  engineering_summary:{type:"string"},reproduction_steps:{type:"array",items:{type:"string"}},
  suspected_components:{type:"array",items:{type:"string"}},severity_rationale:{type:"string"}
},required:["engineering_summary","reproduction_steps","suspected_components","severity_rationale"]};
const specialistSchema={type:"object",additionalProperties:false,properties:{
  work_summary:{type:"string"},recommended_actions:{type:"array",items:{type:"string"}},
  risks:{type:"array",items:{type:"string"}},acceptance_checks:{type:"array",items:{type:"string"}}
},required:["work_summary","recommended_actions","risks","acceptance_checks"]};

async function insertRun(ctx:any,{ticketId,organizationId,agentRole,status="completed",inputSummary="",outputSummary="",metadata={}}:any){
  await ctx.supabaseAdmin.from("ai_agent_runs").insert({
    ticket_id:ticketId,organization_id:organizationId,agent_role:agentRole,status,
    input_summary:clean(inputSummary,3000),output_summary:clean(outputSummary,6000),metadata,
    started_at:new Date().toISOString(),completed_at:status==="completed"?new Date().toISOString():null
  });
}
function fallbackTriage(application:string,subject:string,message:string){
  const text=(subject+" "+message).toLowerCase();
  let category="question",priority="normal",route="support";
  if(/bug|erreur|crash|bloqu|ne fonctionne|doesn.?t work|problem/.test(text)){category="bug";route=application==="pos"?"developer_pos":"developer_hub";}
  else if(/fonction|feature|ajout|amélior|suggest/.test(text)){category="feature";route="product";}
  else if(/factur|abonn|paiement|billing|subscription/.test(text)){category="billing";route="support";}
  if(/perte de données|data loss|paiement doubl|encaissement doubl|sécurité|security|crash total|impossible d'encaisser/.test(text))priority="critical";
  else if(/urgent|bloquant|bloqué|cannot pay|impossible/.test(text))priority="high";
  return {category,priority,route,summary:clean(subject||message,500),requires_human:priority==="critical"||category==="billing",requires_approval:false};
}
async function triageTicket(ctx:any,ticket:any,message:string,context:any){
  const apiKey=Deno.env.get("OPENAI_API_KEY")||"";
  const model=Deno.env.get("OPENAI_SUPPORT_MODEL")||Deno.env.get("OPENAI_MODEL")||"gpt-5.6-luna";
  let triage=fallbackTriage(ticket.application,ticket.subject,message);
  let support={reply:"Votre demande a bien été enregistrée. ReMaPro l'analyse et conserve son suivi dans ce ticket.",diagnostic_questions:[] as string[]};
  let diagnostic:any=null,specialist:any=null,qa:any=null;
  if(apiKey){
    try{
      triage=await structured(apiKey,model,
        "You are ReMaPro's dispatcher agent. Classify a restaurant SaaS support request. Be conservative with critical priority. Never invent facts. Route bugs to the relevant Hub or POS developer, feature requests to product, documentation/how-to requests to knowledge/support. Output only the requested JSON schema.",
        JSON.stringify({application:ticket.application,appVersion:ticket.app_version,subject:ticket.subject,message,context}),
        "remapro_support_triage",triageSchema);
      await insertRun(ctx,{ticketId:ticket.id,organizationId:ticket.organization_id,agentRole:"dispatcher",inputSummary:message,outputSummary:triage.summary,metadata:triage});
    }catch(error){
      await insertRun(ctx,{ticketId:ticket.id,organizationId:ticket.organization_id,agentRole:"dispatcher",status:"failed",inputSummary:message,outputSummary:error instanceof Error?error.message:String(error)});
    }
    try{
      support=await structured(apiKey,model,
        "You are ReMaPro Support. Reply in the user's language. Be concise, practical, calm and specific. Do not claim a fix has been deployed. If information is missing, ask no more than three targeted diagnostic questions. For billing/account/security/data-loss/critical incidents, acknowledge and say the case requires human review rather than inventing a resolution.",
        JSON.stringify({application:ticket.application,appVersion:ticket.app_version,subject:ticket.subject,message,triage,context}),
        "remapro_support_reply",supportSchema);
      await insertRun(ctx,{ticketId:ticket.id,organizationId:ticket.organization_id,agentRole:"support",inputSummary:message,outputSummary:support.reply,metadata:{questions:support.diagnostic_questions}});
    }catch(error){
      await insertRun(ctx,{ticketId:ticket.id,organizationId:ticket.organization_id,agentRole:"support",status:"failed",inputSummary:message,outputSummary:error instanceof Error?error.message:String(error)});
    }
    if(triage.category==="bug"){
      try{
        diagnostic=await structured(apiKey,model,
          "You are ReMaPro Diagnostic Agent. Convert the report into an engineering-ready bug brief. Do not guess root cause. Separate known reproduction facts from suspected components. Keep steps deterministic where possible.",
          JSON.stringify({application:ticket.application,appVersion:ticket.app_version,subject:ticket.subject,message,context}),
          "remapro_bug_diagnostic",diagnosticSchema);
        await insertRun(ctx,{ticketId:ticket.id,organizationId:ticket.organization_id,agentRole:"diagnostic",inputSummary:message,outputSummary:diagnostic.engineering_summary,metadata:diagnostic});
      }catch(error){
        await insertRun(ctx,{ticketId:ticket.id,organizationId:ticket.organization_id,agentRole:"diagnostic",status:"failed",inputSummary:message,outputSummary:error instanceof Error?error.message:String(error)});
      }
    }
    const specialistRole=triage.category==="bug"
      ?(ticket.application==="pos"?"developer_pos":"developer_hub")
      :triage.category==="feature"?"product"
      :triage.route==="knowledge"?"knowledge":"";
    if(specialistRole){
      try{
        const roleInstruction=specialistRole==="product"
          ?"You are ReMaPro Product Agent. Turn the request into a product brief: user problem, smallest useful change, risks and measurable acceptance checks. Do not rank customers or invent demand volume."
          :specialistRole==="knowledge"
            ?"You are ReMaPro Knowledge Agent. Identify the documentation or in-product guidance needed, with concrete steps and checks. Never invent features that do not exist."
            :`You are ReMaPro ${ticket.application==="pos"?"POS":"Hub"} Developer Agent. Produce an implementation-ready change plan from the report and diagnostic. Separate confirmed facts from hypotheses. Never claim code was changed, merged or deployed.`;
        specialist=await structured(apiKey,model,roleInstruction,
          JSON.stringify({application:ticket.application,appVersion:ticket.app_version,subject:ticket.subject,message,triage,diagnostic,context}),
          "remapro_specialist_work",specialistSchema);
        await insertRun(ctx,{ticketId:ticket.id,organizationId:ticket.organization_id,agentRole:specialistRole,inputSummary:triage.summary,outputSummary:specialist.work_summary,metadata:specialist});
      }catch(error){
        await insertRun(ctx,{ticketId:ticket.id,organizationId:ticket.organization_id,agentRole:specialistRole,status:"failed",inputSummary:triage.summary,outputSummary:error instanceof Error?error.message:String(error)});
      }
    }
    if(triage.category==="bug"){
      try{
        qa=await structured(apiKey,model,
          "You are ReMaPro QA Agent. Build a focused regression plan for the reported bug. Include reproduction verification, happy path, adjacent regression risks and acceptance checks. Never claim tests were executed.",
          JSON.stringify({application:ticket.application,appVersion:ticket.app_version,subject:ticket.subject,message,triage,diagnostic,specialist,context}),
          "remapro_qa_plan",specialistSchema);
        await insertRun(ctx,{ticketId:ticket.id,organizationId:ticket.organization_id,agentRole:"qa",inputSummary:triage.summary,outputSummary:qa.work_summary,metadata:qa});
      }catch(error){
        await insertRun(ctx,{ticketId:ticket.id,organizationId:ticket.organization_id,agentRole:"qa",status:"failed",inputSummary:triage.summary,outputSummary:error instanceof Error?error.message:String(error)});
      }
    }
  }
  if(triage.requires_approval){
    const {data:pending}=await ctx.supabaseAdmin.from("support_approvals").select("id").eq("ticket_id",ticket.id).eq("status","pending").limit(1);
    if(!pending?.length)await ctx.supabaseAdmin.from("support_approvals").insert({
      ticket_id:ticket.id,organization_id:ticket.organization_id,requested_by_agent:"dispatcher",
      action:"human_review",payload:{category:triage.category,priority:triage.priority,summary:triage.summary}
    });
  }
  const assigned=AGENT.has(String(triage.route))?triage.route:"support";
  const engineeringContext={...context,...(diagnostic||{}),specialist:specialist||null,qa:qa||null};
  await ctx.supabaseAdmin.from("support_tickets").update({
    category:CATEGORY.has(triage.category)?triage.category:"other",
    priority:PRIORITY.has(triage.priority)?triage.priority:"normal",
    status:triage.requires_approval?"waiting_approval":"triaged",
    summary:clean(triage.summary,2000),assigned_agent:assigned,
    ai_classification:triage,engineering_context:engineeringContext,updated_at:new Date().toISOString()
  }).eq("id",ticket.id);
  if(support.reply)await ctx.supabaseAdmin.from("support_messages").insert({
    ticket_id:ticket.id,organization_id:ticket.organization_id,sender_type:"ai",agent_role:"support",
    body:clean(support.reply,6000),metadata:{diagnostic_questions:support.diagnostic_questions||[]}
  });
  return {triage,support,diagnostic};
}

export default {
  fetch:withSupabase({auth:"user"},async(req,ctx)=>{
    if(req.method!=="POST")return json({error:"Method not allowed"},405);
    try{
      const body=await req.json().catch(()=>({}));
      const action=clean(body.action,50),userId=String(ctx.userClaims?.id||"");
      if(!userId)return json({error:"Authentication required"},401);
      if(action==="health")return json({ok:true,service:"remapro-support",aiConfigured:!!Deno.env.get("OPENAI_API_KEY")});

      if(action==="platform_inbox"){
        if(!platformRole(ctx))return json({error:"Platform operator required"},403);
        const {data,error}=await ctx.supabaseAdmin.from("support_tickets").select("*").order("updated_at",{ascending:false}).limit(Math.min(200,Math.max(1,Number(body.limit)||100)));
        if(error)return json({error:"Unable to load platform inbox"},500);
        return json({ok:true,tickets:data||[]});
      }
      if(action==="platform_update"){
        if(!platformRole(ctx))return json({error:"Platform operator required"},403);
        const ticketId=clean(body.ticketId,64);if(!validUuid(ticketId))return json({error:"Valid ticket required"},400);
        const patch:any={updated_at:new Date().toISOString()};
        if(STATUS.has(String(body.status)))patch.status=String(body.status);
        if(AGENT.has(String(body.assignedAgent)))patch.assigned_agent=String(body.assignedAgent);
        if(body.githubIssueNumber!=null)patch.github_issue_number=Math.max(0,Math.trunc(Number(body.githubIssueNumber)||0))||null;
        if(body.githubIssueUrl!=null)patch.github_issue_url=clean(body.githubIssueUrl,600)||null;
        const {data,error}=await ctx.supabaseAdmin.from("support_tickets").update(patch).eq("id",ticketId).select("*").maybeSingle();
        if(error||!data)return json({error:"Unable to update ticket"},500);
        return json({ok:true,ticket:data});
      }

      const organizationId=clean(body.organizationId,64),restaurantId=clean(body.restaurantId,64);
      if(!validUuid(organizationId))return json({error:"Valid organization required"},400);
      if(restaurantId&&!validUuid(restaurantId))return json({error:"Invalid restaurant"},400);
      const caller=await access(ctx,organizationId,restaurantId,userId);
      if(!caller.ok)return json({error:"Support access denied"},403);

      if(action==="open_ticket"){
        const application=["hub","pos"].includes(String(body.application))?String(body.application):"hub";
        const subject=clean(body.subject,180),message=clean(body.message,6000),appVersion=clean(body.appVersion,60),context=safeContext(body.context);
        if(!subject||!message)return json({error:"Subject and message are required"},400);
        const {data:ticket,error}=await ctx.supabaseAdmin.from("support_tickets").insert({
          organization_id:organizationId,restaurant_id:restaurantId||null,created_by:userId,application,app_version:appVersion,
          subject,latest_message:message,engineering_context:context
        }).select("*").single();
        if(error||!ticket)return json({error:"Unable to create support ticket"},500);
        await ctx.supabaseAdmin.from("support_messages").insert({
          ticket_id:ticket.id,organization_id:organizationId,sender_user_id:userId,sender_type:"customer",body:message,metadata:{context}
        });
        const agents=await triageTicket(ctx,ticket,message,context);
        const {data:finalTicket}=await ctx.supabaseAdmin.from("support_tickets").select("*").eq("id",ticket.id).single();
        return json({ok:true,ticket:finalTicket||ticket,assistantReply:agents.support.reply,questions:agents.support.diagnostic_questions||[]});
      }

      if(action==="list_tickets"){
        let q=ctx.supabaseAdmin.from("support_tickets").select("*").eq("organization_id",organizationId).order("updated_at",{ascending:false}).limit(100);
        if(restaurantId)q=q.eq("restaurant_id",restaurantId);
        if(!caller.manager)q=q.eq("created_by",userId);
        const {data,error}=await q;if(error)return json({error:"Unable to load support tickets"},500);
        return json({ok:true,tickets:data||[]});
      }

      const ticketId=clean(body.ticketId,64);if(!validUuid(ticketId))return json({error:"Valid ticket required"},400);
      const {data:ticket,error:ticketError}=await ctx.supabaseAdmin.from("support_tickets").select("*").eq("id",ticketId).eq("organization_id",organizationId).maybeSingle();
      if(ticketError||!ticket)return json({error:"Ticket not found"},404);
      const ticketAccess=await access(ctx,organizationId,String(ticket.restaurant_id||""),userId);
      if(String(ticket.created_by)!==userId&&!ticketAccess.manager)return json({error:"Ticket access denied"},403);

      if(action==="get_ticket"){
        const {data:messages,error}=await ctx.supabaseAdmin.from("support_messages").select("*").eq("ticket_id",ticketId).order("created_at",{ascending:true});
        if(error)return json({error:"Unable to load ticket messages"},500);
        return json({ok:true,ticket,messages:messages||[]});
      }
      if(action==="reply"){
        const message=clean(body.message,6000),context=safeContext(body.context);if(!message)return json({error:"Message required"},400);
        await ctx.supabaseAdmin.from("support_messages").insert({ticket_id:ticketId,organization_id:organizationId,sender_user_id:userId,sender_type:"customer",body:message,metadata:{context}});
        await ctx.supabaseAdmin.from("support_tickets").update({latest_message:message,status:"open",updated_at:new Date().toISOString()}).eq("id",ticketId);
        const agents=await triageTicket(ctx,{...ticket,status:"open"},message,{...ticket.engineering_context,...context});
        const {data:finalTicket}=await ctx.supabaseAdmin.from("support_tickets").select("*").eq("id",ticketId).single();
        return json({ok:true,ticket:finalTicket||ticket,assistantReply:agents.support.reply,questions:agents.support.diagnostic_questions||[]});
      }
      if(action==="resolve"){
        await ctx.supabaseAdmin.from("support_tickets").update({status:"resolved",resolved_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",ticketId);
        await ctx.supabaseAdmin.from("support_messages").insert({ticket_id:ticketId,organization_id:organizationId,sender_user_id:userId,sender_type:"system",body:"Ticket marked as resolved."});
        return json({ok:true,ticketId,status:"resolved"});
      }
      return json({error:"Unsupported support action"},400);
    }catch(error){
      return json({error:error instanceof Error?error.message:"Unexpected support error"},500);
    }
  })
};