import fs from 'node:fs';

const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const fn=fs.readFileSync(new URL('../supabase/functions/remapro-support/index.ts',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../supabase/migrations/20260926141827_remapro_platform_operators.sql',import.meta.url),'utf8');

for(const token of ['platform_operators','platform_operators_server_only','revoke all on public.platform_operators from anon, authenticated']) {
  if(!migration.includes(token)) throw new Error('Missing platform operator security token: '+token);
}
for(const token of ['platform_context','from("platform_operators")','await platformRole(ctx,userId)']) {
  if(!fn.includes(token)) throw new Error('Missing server platform authorization token: '+token);
}
for(const token of ['refreshPlatformContext','platformRoleChecked','platformUserId','currentPlatformUserId','action:\'platform_context\'']) {
  if(!app.includes(token)) throw new Error('Missing Hub platform-context token: '+token);
}
if(app.includes("app_metadata?.remapro_platform_role")) throw new Error('Hub must not trust local JWT app_metadata for platform console visibility');
console.log('Server-side platform operator allowlist OK');
