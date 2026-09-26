import fs from 'node:fs';
const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const cfg=fs.readFileSync(new URL('../supabase/config.toml',import.meta.url),'utf8');
const fn=fs.readFileSync(new URL('../supabase/functions/remapro-support/index.ts',import.meta.url),'utf8');
for(const token of ['supportTicketForm','remapro-support','supportState','platformOpsPanel','platform_review_approval','isPlatformOperator'])if(!app.includes(token))throw new Error('Missing Hub support token: '+token);
if(!cfg.includes('[functions.remapro-support]')||!cfg.includes('verify_jwt = true'))throw new Error('Support Edge Function must require JWT');
for(const token of ['support_tickets','support_messages','ai_agent_runs','support_approvals','platform_inbox','OPENAI_API_KEY','developer_hub','developer_pos','agentRole:"qa"','specialistRole==="product"','platform_review_approval','approvalsResult','runsResult'])if(!fn.includes(token))throw new Error('Missing support backend token: '+token);
console.log('AI Operations support wiring OK');
