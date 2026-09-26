import fs from 'node:fs';

const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const fn=fs.readFileSync(new URL('../supabase/functions/remapro-support/index.ts',import.meta.url),'utf8');

for(const token of [
  'execute_feature',
  'needsFeatureApproval',
  'engineeringCategory=["bug","feature"]',
  'approvesFeature',
  'requested_by_agent:needsFixApproval?(ticket.application==="pos"?"developer_pos":"developer_hub"):needsFeatureApproval?"product":"dispatcher"',
  'qaInstruction=triage.category==="bug"',
  'You are ReMaPro QA Agent. Build a focused validation and regression plan for the proposed product improvement',
  'execution_plan:context.specialist||{}',
  'qa_plan:context.qa||{}'
]) {
  if(!fn.includes(token)) throw new Error('Missing product execution backend token: '+token);
}

for(const token of [
  "featureApproval:'Autoriser cette évolution'",
  "featureApproval:'Authorize this improvement'",
  "a.action==='execute_feature'?u.featureApproval"
]) {
  if(!app.includes(token)) throw new Error('Missing product execution UI token: '+token);
}

if(fn.includes('merge_pull_request')) throw new Error('Product execution backend must not merge GitHub PRs directly');
console.log('AI product execution approval and engineering handoff OK');
