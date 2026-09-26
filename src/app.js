import{initializeCloudSessionStorage,cloudSession,signInCloud,signOutCloud,cloudFunction}from'./cloud.js';

const VERSION='0.2.0';
const AGENTS=['dispatcher','support','diagnostic','developer_hub','developer_pos','qa','product','knowledge','release'];
const root=document.getElementById('app');
const state={session:null,operator:null,loading:false,error:'',tickets:[],approvals:[],runs:[],jobs:[],view:'dashboard',ticketFilter:'active',selected:null,ticketDetail:null,lastRefresh:null,trainingLoaded:false,trainingLoading:false,trainingHealth:null,trainingProfiles:[],trainingCases:[],trainingKnowledge:[],trainingEvaluations:[],trainingOutput:''};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate=v=>{if(!v)return'—';try{return new Intl.DateTimeFormat('fr-CH',{dateStyle:'short',timeStyle:'short'}).format(new Date(v))}catch{return String(v)}};
const statusLabel=v=>({open:'Ouvert',triaged:'Trié',in_progress:'En cours',waiting_customer:'Attente client',waiting_approval:'Validation',resolved:'Résolu',closed:'Fermé',awaiting_execution:'À exécuter',executing:'Développement',testing:'Tests',pr_open:'PR ouverte',awaiting_merge_approval:'Fusion à valider',merge_approved:'Fusion autorisée',failed:'Échec',completed:'Terminé',cancelled:'Annulé'}[v]||String(v||'—'));
const agentLabel=v=>({dispatcher:'Dispatcher',support:'Support',diagnostic:'Diagnostic',developer_hub:'Dev Hub',developer_pos:'Dev POS',qa:'QA',product:'Produit',knowledge:'Knowledge',release:'Release'}[v]||String(v||'Agent'));
const approvalLabel=v=>({execute_fix:'Autoriser la correction',execute_feature:'Autoriser cette évolution',merge_pr:'Autoriser la fusion',human_review:'Revue humaine'}[v]||String(v||'Validation'));
const short=v=>String(v||'').length>130?String(v).slice(0,127)+'…':String(v||'');
const activeTicket=t=>!['resolved','closed'].includes(t.status);
const render=()=>{root.innerHTML=!state.session?loginView():!state.operator?deniedView():shellView();bind()};
function loginView(){return `<main class="auth-shell"><section class="auth-card"><div class="brand-mark"><span>R</span><b>OPS</b></div><p class="eyebrow">REMAPRO INTERNAL</p><h1>ReMaPro Ops</h1><p class="muted">Console privée de supervision des agents IA, du support et des évolutions ReMaPro.</p>${state.error?`<div class="alert error">${esc(state.error)}</div>`:''}<form id="loginForm" class="form"><label>E-mail<input name="email" type="email" required autocomplete="username"></label><label>Mot de passe<input name="password" type="password" required autocomplete="current-password"></label><button class="primary" ${state.loading?'disabled':''}>${state.loading?'Connexion…':'Connexion propriétaire'}</button></form><small>Ops v${VERSION} · accès plateforme uniquement</small></section></main>`}
function deniedView(){return `<main class="auth-shell"><section class="auth-card"><div class="brand-mark"><span>R</span><b>OPS</b></div><h1>Accès refusé</h1><p class="muted">Ce compte est authentifié mais n’est pas autorisé comme opérateur plateforme ReMaPro.</p><button id="logoutBtn">Se déconnecter</button></section></main>`}
function navButton(id,label){return `<button class="nav-btn ${state.view===id?'active':''}" data-view="${id}">${label}</button>`}
function shellView(){return `<div class="ops-shell"><aside><div class="side-brand"><div class="brand-mark small"><span>R</span><b>OPS</b></div><div><strong>ReMaPro Ops</strong><small>${esc(state.operator.role||'operator')}</small></div></div><nav>${navButton('dashboard','Vue d’ensemble')}${navButton('tickets','Support')}${navButton('agents','Agents IA')}${navButton('training','Entraînement')}${navButton('jobs','Développement')}${navButton('approvals','Validations')}</nav><div class="side-foot"><small>Dernière synchro<br>${fmtDate(state.lastRefresh)}</small><button id="logoutBtn" class="ghost">Déconnexion</button></div></aside><main class="content"><header><div><p class="eyebrow">REMAPRO INTERNAL</p><h1>${viewTitle()}</h1></div><button id="refreshBtn" class="refresh" ${state.loading?'disabled':''}>${state.loading?'Actualisation…':'Actualiser'}</button></header>${state.error?`<div class="alert error">${esc(state.error)}</div>`:''}${state.selected&&state.ticketDetail?ticketDetailView():contentView()}</main></div>`}
function viewTitle(){return({dashboard:'AI Operations',tickets:'Support clients',agents:'Équipe IA',training:'Entraînement IA',jobs:'Travaux développeur',approvals:'Validations humaines'}[state.view]||'ReMaPro Ops')}
function contentView(){if(state.loading&&!state.lastRefresh)return'<section class="loading-card">Chargement de ReMaPro Ops…</section>';if(state.view==='tickets')return ticketsView();if(state.view==='agents')return agentsView();if(state.view==='training')return trainingView();if(state.view==='jobs')return jobsView();if(state.view==='approvals')return approvalsView();return dashboardView()}
function kpi(label,value,sub,kind=''){return `<article class="kpi ${kind}"><span>${label}</span><strong>${value}</strong><small>${sub}</small></article>`}
function dashboardView(){
 const active=state.tickets.filter(activeTicket),critical=active.filter(x=>x.priority==='critical'),auto=state.runs.filter(x=>x.status==='completed').length,openJobs=state.jobs.filter(x=>!['completed','cancelled'].includes(x.status));
 return `<section class="kpis">${kpi('Tickets actifs',active.length,critical.length+' critique(s)',critical.length?'danger':'')}${kpi('Validations',state.approvals.length,'action humaine requise',state.approvals.length?'warn':'')}${kpi('Travaux dev',openJobs.length,openJobs.filter(x=>x.status==='failed').length+' en échec')}${kpi('Runs agents',state.runs.length,auto+' terminés')}</section><section class="grid two"><article class="panel"><div class="panel-head"><h2>À valider</h2><button data-view="approvals">Tout voir</button></div>${approvalRows(state.approvals.slice(0,6))}</article><article class="panel"><div class="panel-head"><h2>Développement</h2><button data-view="jobs">Tout voir</button></div>${jobRows(state.jobs.slice(0,6))}</article></section><section class="grid two"><article class="panel"><div class="panel-head"><h2>Support récent</h2><button data-view="tickets">Tout voir</button></div>${ticketRows(state.tickets.slice(0,8))}</article><article class="panel"><div class="panel-head"><h2>Agents IA</h2><button data-view="agents">Détails</button></div>${agentMiniRows()}</article></section>`}
function ticketsView(){
 const filters=[['active','Actifs'],['all','Tous'],['hub','Hub'],['pos','POS'],['critical','Critiques']];
 let rows=state.tickets;
 if(state.ticketFilter==='active')rows=rows.filter(activeTicket);
 if(state.ticketFilter==='hub')rows=rows.filter(x=>x.application==='hub');
 if(state.ticketFilter==='pos')rows=rows.filter(x=>x.application==='pos');
 if(state.ticketFilter==='critical')rows=rows.filter(x=>x.priority==='critical'&&activeTicket(x));
 return `<div class="filters">${filters.map(([id,l])=>`<button class="${state.ticketFilter===id?'active':''}" data-filter="${id}">${l}</button>`).join('')}</div><section class="panel"><div class="panel-head"><h2>${rows.length} ticket(s)</h2><small>Clique sur un ticket pour ouvrir la conversation complète.</small></div>${ticketRows(rows)}</section>`}
function ticketRows(rows){return rows.length?rows.map(t=>`<button class="ticket-row" data-ticket="${esc(t.id)}"><span class="app-chip ${esc(t.application)}">${esc((t.application||'').toUpperCase())}</span><span class="grow"><strong>${esc(t.subject)}</strong><small>${esc(short(t.summary||t.latest_message))}</small></span><span class="meta"><b class="priority ${esc(t.priority)}">${esc(t.priority)}</b><small>${esc(statusLabel(t.status))}</small></span></button>`).join(''):'<p class="empty">Aucun ticket dans cette vue.</p>'}
function agentsView(){const latest=new Map();for(const r of state.runs)if(!latest.has(r.agent_role))latest.set(r.agent_role,r);return `<section class="agent-grid">${AGENTS.map(a=>{const r=latest.get(a);return `<article class="agent-card"><div class="agent-avatar">${esc(agentLabel(a).slice(0,2).toUpperCase())}</div><div><h2>${esc(agentLabel(a))}</h2><span class="status-dot ${r?.status||'idle'}"></span><b>${r?esc(statusLabel(r.status)):'En attente'}</b><p>${r?esc(short(r.output_summary||r.input_summary)):'Aucune exécution récente.'}</p><small>${r?fmtDate(r.created_at):'—'}</small></div></article>`}).join('')}</section><section class="panel"><div class="panel-head"><h2>Journal récent</h2><small>100 dernières exécutions</small></div>${state.runs.slice(0,30).map(r=>`<div class="line"><span><strong>${esc(agentLabel(r.agent_role))}</strong><small>${esc(short(r.output_summary||r.input_summary))}</small></span><span><b>${esc(statusLabel(r.status))}</b><small>${fmtDate(r.created_at)}</small></span></div>`).join('')||'<p class="empty">Aucune exécution.</p>'}</section>`}
function agentMiniRows(){const latest=new Map();for(const r of state.runs)if(!latest.has(r.agent_role))latest.set(r.agent_role,r);return AGENTS.slice(0,7).map(a=>{const r=latest.get(a);return `<div class="line"><span><strong>${esc(agentLabel(a))}</strong><small>${r?esc(short(r.output_summary||r.input_summary)):'En attente'}</small></span><span><b>${r?esc(statusLabel(r.status)):'Idle'}</b><small>${r?fmtDate(r.created_at):'—'}</small></span></div>`}).join('')}

function latestEvalByCase(){
 const map=new Map();for(const e of state.trainingEvaluations||[])if(e.training_case_id&&!map.has(e.training_case_id))map.set(e.training_case_id,e);return map
}
function trainingView(){
 if(!state.trainingLoaded&&!state.trainingLoading)setTimeout(()=>loadTraining(),0);
 if(state.trainingLoading&&!state.trainingLoaded)return '<section class="loading-card">Chargement du centre d’entraînement…</section>';
 const evals=(state.trainingEvaluations||[]).filter(x=>['passed','failed'].includes(x.status)),passed=evals.filter(x=>x.passed).length;
 const rate=evals.length?Math.round(passed/evals.length*100):0,latest=latestEvalByCase();
 return `<section class="kpis">${kpi('Agents',state.trainingProfiles.length,'profils versionnés')}${kpi('Connaissances',state.trainingKnowledge.length,state.trainingKnowledge.filter(x=>x.embedding_model).length+' indexée(s)')}${kpi('Cas de test',state.trainingCases.length,'scénarios actifs')}${kpi('Réussite',rate+'%',evals.length+' évaluation(s)',rate<80&&evals.length?'warn':'')}</section>
 <section class="grid two">
  <article class="panel"><div class="panel-head"><div><h2>Profils des agents</h2><small>Instructions, modèle et version actuellement utilisés en production.</small></div></div>
  ${state.trainingProfiles.map(p=>`<div class="line"><span><strong>${esc(agentLabel(p.role))} · v${esc(p.version)}</strong><small>${esc(p.purpose||'')}</small></span><span><b>${esc(p.model)}</b><small>${p.enabled?'Actif':'Désactivé'} · ${esc(p.reasoning_effort)}</small></span></div>`).join('')||'<p class="empty">Aucun profil.</p>'}</article>
  <article class="panel"><div class="panel-head"><div><h2>Base de connaissances</h2><small>Les agents utilisent ces éléments vérifiés comme contexte ReMaPro.</small></div><button id="embedKnowledgeBtn" class="primary small">Indexer</button></div>
  ${state.trainingKnowledge.slice(0,12).map(d=>`<div class="line"><span><strong>${esc(d.title)}</strong><small>${esc(d.scope)} · ${esc(d.source_type)}</small></span><span><b>${d.embedding_model?'Vectorisé':'Texte'}</b><small>v${esc(d.version)}</small></span></div>`).join('')||'<p class="empty">Aucune connaissance.</p>'}</article>
 </section>
 <section class="panel"><div class="panel-head"><div><h2>Cas d’entraînement</h2><small>Un score ≥ 80% sans échec de sécurité est requis pour réussir.</small></div><button id="runNextTrainingBtn" class="primary small">Tester le suivant</button></div>
 ${state.trainingCases.map(c=>{const e=latest.get(c.id);return `<div class="job-row"><span class="agent-avatar">${esc(agentLabel(c.agent_role).slice(0,2).toUpperCase())}</span><span class="grow"><strong>${esc(c.name)}</strong><small>${esc(agentLabel(c.agent_role))} · ${esc(c.category)} · ${esc(c.difficulty)}</small>${e?`<em class="${e.passed?'':'error-text'}">${e.passed?'Réussi':'À améliorer'} · ${Math.round(Number(e.score||0)*100)}% · ${fmtDate(e.created_at)}</em>`:'<em>Jamais testé</em>'}</span><span class="actions"><button class="small primary" data-training-case="${esc(c.id)}">Tester</button></span></div>`}).join('')||'<p class="empty">Aucun cas de test.</p>'}
 </section>
 <section class="grid two"><article class="panel"><h2>Test manuel</h2><form id="manualAgentForm" class="form"><label>Agent<select name="agentRole">${state.trainingProfiles.map(p=>`<option value="${esc(p.role)}">${esc(agentLabel(p.role))}</option>`).join('')}</select></label><label>Situation à tester<textarea name="input" rows="5" maxlength="12000" required placeholder="Ex. Un restaurateur signale que la table reste ouverte après paiement…"></textarea></label><button class="primary">Lancer l’agent</button></form></article>
 <article class="panel"><h2>Dernier résultat</h2><p class="training-output">${esc(state.trainingOutput||'Lance un cas ou un test manuel pour afficher le résultat ici.')}</p></article></section>`;
}
async function loadTraining(force=false){
 if(state.trainingLoading||(!force&&state.trainingLoaded))return;
 state.trainingLoading=true;render();
 try{
  const [health,data]=await Promise.all([
   cloudFunction('remapro-agent-runtime',{action:'health'},{attempts:1}),
   cloudFunction('remapro-agent-runtime',{action:'training_dashboard'},{attempts:1})
  ]);
  state.trainingHealth=health||null;state.trainingProfiles=Array.isArray(data?.profiles)?data.profiles:[];
  state.trainingCases=Array.isArray(data?.cases)?data.cases:[];state.trainingKnowledge=Array.isArray(data?.knowledge)?data.knowledge:[];
  state.trainingEvaluations=Array.isArray(data?.evaluations)?data.evaluations:[];state.trainingLoaded=true;
 }catch(e){state.error=e?.message||String(e)}
 finally{state.trainingLoading=false;render()}
}
async function runTrainingCase(caseId){
 state.trainingLoading=true;state.trainingOutput='';render();
 try{
  const data=await cloudFunction('remapro-agent-runtime',{action:'run_training_case',caseId},{attempts:1});
  state.trainingOutput=`Score ${Math.round(Number(data?.score||0)*100)}% — ${data?.passed?'RÉUSSI':'À AMÉLIORER'}\n\n${data?.output||''}\n\n${(data?.result?.failures||[]).length?'Points à corriger : '+data.result.failures.join(' · '):''}`;
  state.trainingLoaded=false;await loadTraining(true);
 }catch(e){state.error=e?.message||String(e);state.trainingLoading=false;render()}
}
async function runNextTraining(){
 const latest=latestEvalByCase();const next=state.trainingCases.find(c=>!latest.has(c.id)||!latest.get(c.id)?.passed)||state.trainingCases[0];
 if(next)await runTrainingCase(next.id);
}
async function embedKnowledge(){
 state.trainingLoading=true;render();
 try{
  const data=await cloudFunction('remapro-agent-runtime',{action:'embed_knowledge',limit:10},{attempts:1});
  const ok=(data?.results||[]).filter(x=>x.ok).length;state.trainingOutput=`${ok} connaissance(s) indexée(s) sémantiquement.`;
  state.trainingLoaded=false;await loadTraining(true);
 }catch(e){state.error=e?.message||String(e);state.trainingLoading=false;render()}
}
async function runManualAgent(form){
 const d=new FormData(form),agentRole=String(d.get('agentRole')||''),input=String(d.get('input')||'').trim();if(!input)return;
 state.trainingLoading=true;state.trainingOutput='';render();
 try{
  const data=await cloudFunction('remapro-agent-runtime',{action:'run_agent',agentRole,input},{attempts:1});
  state.trainingOutput=`${agentLabel(agentRole)} · ${data?.model||''} · profil v${data?.profileVersion||'?'}\n\n${data?.output||''}`;
 }catch(e){state.error=e?.message||String(e)}
 finally{state.trainingLoading=false;render()}
}
function jobsView(){return `<section class="panel"><div class="panel-head"><h2>File d’ingénierie</h2><small>Hub et POS · aucune fusion sans validation finale</small></div>${jobRows(state.jobs)}</section>`}
function jobRows(rows){return rows.length?rows.map(j=>`<div class="job-row"><span class="app-chip ${esc(j.application)}">${esc((j.application||'').toUpperCase())}</span><span class="grow"><strong>${esc(statusLabel(j.status))}</strong><small>${esc(j.base_branch||'')} ${j.work_branch?'→ '+esc(j.work_branch):''}</small>${j.github_pr_number?`<em>PR #${esc(j.github_pr_number)}</em>`:''}${j.last_error?`<em class="error-text">${esc(short(j.last_error))}</em>`:''}</span><span class="actions">${j.status==='failed'?`<button class="primary small" data-job="${esc(j.id)}" data-job-action="retry">Relancer</button>`:''}${!['completed','cancelled'].includes(j.status)?`<button class="small" data-job="${esc(j.id)}" data-job-action="cancel">Annuler</button>`:''}</span></div>`).join(''):'<p class="empty">Aucun travail développeur.</p>'}
function approvalsView(){return `<section class="panel"><div class="panel-head"><h2>Décisions en attente</h2><small>Les agents ne peuvent pas franchir ces étapes sans ton accord.</small></div>${approvalRows(state.approvals)}</section>`}
function approvalRows(rows){return rows.length?rows.map(a=>`<div class="approval-row"><span class="approval-icon">!</span><span class="grow"><strong>${esc(approvalLabel(a.action))}</strong><small>${esc(a.requested_by_agent||'agent')} · Ticket ${esc(String(a.ticket_id||'').slice(0,8))}${a.payload?.prNumber?' · PR #'+esc(a.payload.prNumber):''}</small><p>${esc(short(a.payload?.summary||''))}</p></span><span class="actions"><button class="primary small" data-approval="${esc(a.id)}" data-decision="approved">Approuver</button><button class="small danger-btn" data-approval="${esc(a.id)}" data-decision="rejected">Refuser</button></span></div>`).join(''):'<p class="empty">Aucune validation en attente.</p>'}
function ticketDetailView(){const d=state.ticketDetail,t=d.ticket,m=d.messages||[],runs=d.runs||[],jobs=d.jobs||[],approvals=d.approvals||[];return `<button class="back" id="ticketBack">← Retour au support</button><section class="ticket-hero"><div><span class="app-chip ${esc(t.application)}">${esc((t.application||'').toUpperCase())}</span><h2>${esc(t.subject)}</h2><p>${esc(t.summary||'')}</p></div><div class="ticket-facts"><span><b>${esc(t.priority)}</b><small>Priorité</small></span><span><b>${esc(statusLabel(t.status))}</b><small>Statut</small></span><span><b>${esc(agentLabel(t.assigned_agent))}</b><small>Agent</small></span><span><b>${esc(t.app_version||'—')}</b><small>Version</small></span></div></section><section class="grid detail-grid"><article class="panel conversation"><h2>Conversation</h2><div class="messages">${m.map(x=>`<div class="message ${esc(x.sender_type)}"><div><b>${x.sender_type==='customer'?'Restaurateur':x.sender_type==='operator'?'ReMaPro Ops':x.sender_type==='ai'?agentLabel(x.agent_role||'support'):'Système'}</b><small>${fmtDate(x.created_at)}</small></div><p>${esc(x.body)}</p></div>`).join('')||'<p class="empty">Aucun message.</p>'}</div><form id="operatorReplyForm" class="reply"><textarea name="message" rows="4" maxlength="6000" required placeholder="Répondre au restaurateur…"></textarea><button class="primary">Envoyer comme ReMaPro</button></form></article><aside><article class="panel"><h2>Travail IA</h2>${runs.slice(0,8).map(r=>`<div class="mini"><strong>${esc(agentLabel(r.agent_role))}</strong><small>${esc(statusLabel(r.status))} · ${fmtDate(r.created_at)}</small><p>${esc(short(r.output_summary||r.input_summary))}</p></div>`).join('')||'<p class="empty">Aucun run.</p>'}</article><article class="panel"><h2>Ingénierie</h2>${jobRows(jobs)}${approvals.length?'<h3>Validations</h3>'+approvalRows(approvals.filter(x=>x.status==='pending')):''}</article></aside></section>`}
async function loadPlatform(){
 state.loading=true;state.error='';render();
 try{
   const context=await cloudFunction('remapro-support',{action:'platform_context'},{attempts:1});
   if(!context?.isPlatformOperator){state.operator=null;return}
   state.operator={role:context.role||'operator'};
   const data=await cloudFunction('remapro-support',{action:'platform_inbox',limit:200},{attempts:1});
   state.tickets=Array.isArray(data?.tickets)?data.tickets:[];state.approvals=Array.isArray(data?.approvals)?data.approvals:[];state.runs=Array.isArray(data?.runs)?data.runs:[];state.jobs=Array.isArray(data?.jobs)?data.jobs:[];state.lastRefresh=new Date();
 }catch(e){state.error=e?.message||String(e)}
 finally{state.loading=false;render()}
}
async function openTicket(id){state.loading=true;state.error='';render();try{state.ticketDetail=await cloudFunction('remapro-support',{action:'platform_ticket',ticketId:id},{attempts:1});state.selected=id}catch(e){state.error=e?.message||String(e)}finally{state.loading=false;render()}}
async function reviewApproval(id,decision){state.loading=true;render();try{await cloudFunction('remapro-support',{action:'platform_review_approval',approvalId:id,decision},{attempts:1});state.ticketDetail=null;state.selected=null;await loadPlatform()}catch(e){state.error=e?.message||String(e);state.loading=false;render()}}
async function jobAction(id,jobAction){state.loading=true;render();try{await cloudFunction('remapro-support',{action:'platform_job_action',jobId:id,jobAction},{attempts:1});await loadPlatform()}catch(e){state.error=e?.message||String(e);state.loading=false;render()}}
async function operatorReply(form){const message=String(new FormData(form).get('message')||'').trim();if(!message||!state.selected)return;state.loading=true;render();try{await cloudFunction('remapro-support',{action:'platform_reply',ticketId:state.selected,message},{attempts:1});state.ticketDetail=await cloudFunction('remapro-support',{action:'platform_ticket',ticketId:state.selected},{attempts:1})}catch(e){state.error=e?.message||String(e)}finally{state.loading=false;render()}}
async function logout(){try{await signOutCloud()}catch{}state.session=null;state.operator=null;state.selected=null;state.ticketDetail=null;state.error='';render()}
function bind(){
 document.getElementById('loginForm')?.addEventListener('submit',async e=>{e.preventDefault();state.loading=true;state.error='';render();const d=new FormData(e.currentTarget);try{await signInCloud(String(d.get('email')||''),String(d.get('password')||''));state.session=cloudSession();await loadPlatform()}catch(err){state.error=err?.message||'Connexion impossible';state.loading=false;render()}});
 document.getElementById('logoutBtn')?.addEventListener('click',logout);
 document.getElementById('refreshBtn')?.addEventListener('click',loadPlatform);
 document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{state.view=b.dataset.view;state.selected=null;state.ticketDetail=null;if(state.view==='training'&&!state.trainingLoaded)setTimeout(()=>loadTraining(),0);render()}));
 document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{state.ticketFilter=b.dataset.filter;render()}));
 document.querySelectorAll('[data-ticket]').forEach(b=>b.addEventListener('click',()=>openTicket(b.dataset.ticket)));
 document.querySelectorAll('[data-approval]').forEach(b=>b.addEventListener('click',()=>reviewApproval(b.dataset.approval,b.dataset.decision)));
 document.querySelectorAll('[data-job]').forEach(b=>b.addEventListener('click',()=>jobAction(b.dataset.job,b.dataset.jobAction)));
 document.getElementById('ticketBack')?.addEventListener('click',()=>{state.selected=null;state.ticketDetail=null;state.view='tickets';render()});
 document.getElementById('operatorReplyForm')?.addEventListener('submit',e=>{e.preventDefault();operatorReply(e.currentTarget)});
 document.querySelectorAll('[data-training-case]').forEach(b=>b.addEventListener('click',()=>runTrainingCase(b.dataset.trainingCase)));
 document.getElementById('runNextTrainingBtn')?.addEventListener('click',runNextTraining);
 document.getElementById('embedKnowledgeBtn')?.addEventListener('click',embedKnowledge);
 document.getElementById('manualAgentForm')?.addEventListener('submit',e=>{e.preventDefault();runManualAgent(e.currentTarget)});
}
async function boot(){try{await initializeCloudSessionStorage();state.session=cloudSession();if(state.session)await loadPlatform();else render()}catch(e){state.error=e?.message||String(e);render()}}
boot();
