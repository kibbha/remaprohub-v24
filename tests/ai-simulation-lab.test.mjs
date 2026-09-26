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
