import fs from 'node:fs';

const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const fn=fs.readFileSync(new URL('../supabase/functions/remapro-support/index.ts',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../supabase/migrations/20260926140752_remapro_ai_engineering_jobs.sql',import.meta.url),'utf8');
const gate=fs.readFileSync(new URL('../supabase/migrations/20260926141218_remapro_ai_engineering_merge_gate.sql',import.meta.url),'utf8');

for(const token of ['ai_engineering_jobs','awaiting_execution','base_branch','execution_plan','qa_plan']) {
  if(!migration.includes(token)) throw new Error('Missing engineering queue token: '+token);
}
for(const token of ['platformJobs','platform_job_action','Travaux développeur','engineering queue']) {
  if(!app.includes(token)) throw new Error('Missing Hub engineering queue token: '+token);
}
for(const token of [
  'ai_engineering_jobs','platform_job_action','["execute_fix","human_review"].includes(String(approval.action))',
  'approval.action==="merge_pr"','merge_approved','awaiting_execution',
  'pos/remapro-pos','rebuild/remaprohub-clean'
]) {
  if(!fn.includes(token)) throw new Error('Missing engineering orchestration token: '+token);
}
for(const token of ['awaiting_merge_approval','merge_approved']) {
  if(!gate.includes(token)) throw new Error('Missing merge gate status: '+token);
}
if(fn.includes('merge_pull_request')) throw new Error('Backend must not merge GitHub pull requests directly');
console.log('AI engineering bridge and human merge gate OK');
