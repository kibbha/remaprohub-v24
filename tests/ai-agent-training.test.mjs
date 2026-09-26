import fs from 'node:fs';
const runtime=fs.readFileSync(new URL('../supabase/functions/remapro-agent-runtime/index.ts',import.meta.url),'utf8');
const support=fs.readFileSync(new URL('../supabase/functions/remapro-support/index.ts',import.meta.url),'utf8');
const core=fs.readFileSync(new URL('../supabase/migrations/20260926152108_remapro_ai_agent_training_core.sql',import.meta.url),'utf8');
const indexes=fs.readFileSync(new URL('../supabase/migrations/20260926152206_remapro_ai_agent_training_indexes.sql',import.meta.url),'utf8');
const config=fs.readFileSync(new URL('../supabase/config.toml',import.meta.url),'utf8');

for(const token of ['ai_agent_profiles','ai_knowledge_documents','ai_training_cases','ai_evaluation_runs','ai_agent_sessions','match_ai_knowledge','vector(1536)'])if(!core.includes(token))throw new Error('Missing AI training schema token: '+token);
for(const token of ['ai_knowledge_embedding_hnsw','extensions.vector_cosine_ops'])if(!indexes.includes(token))throw new Error('Missing AI training index token: '+token);
for(const token of ['run_training_case','run_agent','embed_knowledge','training_dashboard','/v1/agents/sessions','OpenAI-Beta','agents=v1','score', 'OPENAI_API_KEY_NOT_CONFIGURED'])if(!runtime.includes(token))throw new Error('Missing agent runtime token: '+token);
for(const token of ['trainedAgent','ai_agent_profiles','ai_knowledge_documents','profileVersion','knowledgeIds'])if(!support.includes(token))throw new Error('Support is not grounded in trained profiles: '+token);
if(!config.includes('[functions.remapro-agent-runtime]'))throw new Error('Agent runtime config missing');
if(runtime.includes('service_role')&&runtime.includes('globalThis.'))throw new Error('Do not expose server role secrets to clients');
console.log('ReMaPro agent training runtime checks passed');
