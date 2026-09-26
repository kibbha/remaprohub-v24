import fs from 'node:fs';

const runtime=fs.readFileSync(new URL('../supabase/functions/remapro-agent-runtime/index.ts',import.meta.url),'utf8');
const core=fs.readFileSync(new URL('../supabase/migrations/20260926170057_remapro_ai_simulation_lab_core.sql',import.meta.url),'utf8');
const indexes=fs.readFileSync(new URL('../supabase/migrations/20260926170119_remapro_ai_simulation_lab_indexes.sql',import.meta.url),'utf8');

for(const token of [
  'ai_simulation_campaigns','ai_simulation_scenarios','ai_simulation_runs','ai_simulation_findings',
  'simulation_dashboard','simulation_create_campaign','simulation_generate_batch','simulation_run_batch',
  'simulation_promote_finding','simulation_dismiss_finding','SIMULATION ONLY — NEVER PERFORM REAL ACTIONS',
  'remapro_simulation_scenarios','remapro_simulation_eval','max_daily_cases','dedupe_key'
]) if(!runtime.includes(token)&&!core.includes(token)) throw new Error('Missing Simulation Lab token: '+token);

for(const token of [
  'ai_sim_campaign_created_by_idx','ai_sim_finding_run_idx','ai_sim_finding_scenario_idx'
]) if(!indexes.includes(token)) throw new Error('Missing Simulation Lab FK index: '+token);

if(runtime.includes('simulation_run_batch') && runtime.includes('merge_pull_request')) {
  throw new Error('Simulation runtime must not contain GitHub merge execution');
}
if(runtime.includes('simulation_run_batch') && runtime.includes('support_tickets').toString()) {
  // runtime currently has no customer ticket table access; keep this boundary explicit.
}
for(const forbidden of [
  '.from("support_tickets")',
  '.from("ai_engineering_jobs")',
  'github_pr_number',
  'merge_approved'
]) {
  const start=runtime.indexOf('async function runSimulationScenario');
  const end=runtime.indexOf('async function promoteSimulationFinding');
  const block=runtime.slice(start,end);
  if(block.includes(forbidden)) throw new Error('Simulation execution leaked into production action surface: '+forbidden);
}
console.log('ReMaPro Simulation Lab isolation and schema checks passed');

for(const token of [
  'auth:["user","none"]','simulation_worker_tick','validSimulationWorkerToken',
  'x-remapro-worker-token','ai_simulation_worker_auth','simulationWorkerTick'
])if(!runtime.includes(token))throw new Error('Missing server simulation worker token: '+token);
if(!runtime.includes('ctx.authMode!=="none"'))throw new Error('Simulation worker must require custom none-mode authentication');

const config=fs.readFileSync(new URL('../supabase/config.toml',import.meta.url),'utf8');
if(!config.includes('[functions.remapro-agent-runtime]\nverify_jwt = false'))throw new Error('Mixed user/custom-worker runtime must disable platform JWT precheck');
if(!runtime.includes('ctx.authMode!=="user"||!userId'))throw new Error('Normal Ops actions must still require user auth');

for(const token of ['claim_failed','.eq("id",scenario.id).in("status",["queued","error"])','if(!claimed)continue'])if(!runtime.includes(token))throw new Error('Missing atomic simulation claim token: '+token);

const concurrency=fs.readFileSync(new URL('../supabase/migrations/20260926191529_remapro_simulation_concurrency_lock.sql',import.meta.url),'utf8');
for(const token of ['ai_simulation_one_running_per_campaign_idx',"where status='running'"])if(!concurrency.includes(token))throw new Error('Missing Simulation Lab concurrency migration token: '+token);
for(const token of ['recoverStaleSimulationRuns','Recovered stale simulation run after 10 minutes','busy:true','recoveredStale'])if(!runtime.includes(token))throw new Error('Missing Simulation Lab concurrency runtime token: '+token);

for(const token of ['knowledge_indexed','pendingKnowledge','remapro_worker_embedding_failed','limit(5)'])if(!runtime.includes(token))throw new Error('Missing worker knowledge-indexing token: '+token);
const learning=fs.readFileSync(new URL('../supabase/migrations/20260926191656_remapro_ai_simulation_learning_round1.sql',import.meta.url),'utf8');
for(const token of ['sensitive-billing-handling-v1','business-object-repro-v1','product-offline-risk-checklist-v1','approval-vs-diagnostic-v1','requires_human=true uniquement'])if(!learning.includes(token))throw new Error('Missing simulation learning round 1 token: '+token);

const round2=fs.readFileSync(new URL('../supabase/migrations/20260926193041_remapro_ai_simulation_learning_round2.sql',import.meta.url),'utf8');
for(const token of ['pos-payment-state-vs-sensitive-billing-v1','least-privilege-multi-location-permissions-v1','diagnostic-operational-cautions-v1','requires_human=false','moindre privilège'])if(!round2.includes(token))throw new Error('Missing simulation learning round 2 token: '+token);

for(const token of ['nextSimulationRegression','regression_evaluated','regression_error','dailyLimitReached:true','Number(todayCount||0)>=10','.eq("category","simulation")'])if(!runtime.includes(token))throw new Error('Missing automatic simulation regression token: '+token);

for(const token of ['evaluation_scope','agent_role','roleResponsibilities','roleFocus','Never fail or criticize Dispatcher for missing Developer/QA artifacts'])if(!runtime.includes(token))throw new Error('Missing role-scoped evaluator token: '+token);
const roleScope=fs.readFileSync(new URL('../supabase/migrations/20260926193555_remapro_simulation_role_scoped_evaluator.sql',import.meta.url),'utf8');
for(const token of ['evaluation_scope','role_focus',"where category='simulation'"])if(!roleScope.includes(token))throw new Error('Missing role-scoped migration token: '+token);

for(const token of ['out-of-role omissions must not reduce the score','must not appear in failures','Evaluate only roleResponsibilities plus roleFocus'])if(!runtime.includes(token))throw new Error('Missing strict role-scoped evaluator token: '+token);

for(const token of ['roleFocusMode','defect_to_correct','historical defect that the candidate must avoid or correct','never an instruction to reproduce that defect'])if(!runtime.includes(token))throw new Error('Missing role-focus defect semantics token: '+token);
const round3=fs.readFileSync(new URL('../supabase/migrations/20260926221957_remapro_ai_simulation_learning_round3.sql',import.meta.url),'utf8');
for(const token of ['diagnostic-minimal-reproduction-v1','developer-hub-response-contract-v1','knowledge-route-contract-v1','dispatcher-sensitive-billing-route-v1',"version=5","version=4","version=3","role_focus_mode"])if(!round3.includes(token))throw new Error('Missing simulation learning round 3 token: '+token);
