import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const storage=new Map();
globalThis.localStorage={
  getItem:key=>storage.get(key)??null,
  setItem:(key,value)=>storage.set(key,value),
  removeItem:key=>storage.delete(key)
};

const security=await import('../src/security.js');
assert.equal(security.securitySettings().biometricEnabled,false);
assert.equal(security.securitySettings().lockMinutes,5);
assert.equal(security.shouldRelock(Date.now()-6*60_000,Date.now(),{lockOnBackground:true,lockMinutes:5}),true);
assert.equal(security.shouldRelock(Date.now()-30_000,Date.now(),{lockOnBackground:true,lockMinutes:5}),false);
security.updateSecuritySettings({biometricEnabled:true,lockMinutes:15,lockOnBackground:true});
assert.equal(security.securitySettings().biometricEnabled,true);
assert.equal(security.securitySettings().lockMinutes,15);
security.rememberSecurityEmail(' Manager@Example.com ');
assert.equal(security.rememberedSecurityEmail(),'manager@example.com');

const app=readFileSync('src/app.js','utf8');
const cloud=readFileSync('src/cloud.js','utf8');
const harden=readFileSync('scripts/harden-android.mjs','utf8');
const admin=readFileSync('supabase/functions/remapro-admin/index.ts','utf8');
const bootstrap=readFileSync('supabase/functions/remapro-bootstrap/index.ts','utf8');
const alignment=readFileSync('supabase/migrations/005_v27_10_permission_alignment.sql','utf8');
const privateHelpers=readFileSync('supabase/migrations/006_v27_10_private_auth_helpers.sql','utf8');
const runtime=readFileSync('app/runtime-config.js','utf8');
const migration=readFileSync('supabase/migrations/004_v27_10_security_accounts_audit.sql','utf8');
const pkg=JSON.parse(readFileSync('package.json','utf8'));
const workflow=readFileSync('.github/workflows/android.yml','utf8');

assert.equal(pkg.version,'27.11.0');
assert.match(pkg.dependencies['@capgo/capacitor-native-biometric'],/^\^?7\./);
assert.match(app,/APP_VERSION='27\.11\.0'/);
assert.match(app,/function securityGate\(\)/);
assert.match(app,/id="securityLoginForm"/);
assert.match(app,/id="securitySignupForm"/);
assert.match(app,/signUpCloud/);
assert.match(app,/remapro-bootstrap/);
assert.match(app,/id="securityBiometric"/);
assert.match(app,/id="securitySettingsForm"/);
assert.match(app,/shouldRelock\(backgroundAt\)/);
assert.match(app,/requestPasswordReset/);
assert.match(app,/memberAccessForm/);
assert.match(app,/data-cloud-member-toggle/);
assert.match(app,/data-cloud-member-revoke/);
assert.match(app,/refreshCloudAdminData/);
assert.match(app,/cloudAccountPanel/);
assert.match(cloud,/loadCachedCloudIdentity/);
assert.match(cloud,/requestPasswordReset/);
assert.match(cloud,/export async function signUpCloud/);
assert.match(cloud,/remapro_signup:true/);
assert.match(cloud,/await removeStoredSession\(\)/);
assert.match(harden,/android\.permission\.USE_BIOMETRIC/);
assert.match(workflow,/android\.permission\.USE_BIOMETRIC/);
assert.match(workflow,/app\/src\/security\.js/);
assert.match(admin,/update-member/);
assert.match(admin,/set-member-active/);
assert.match(admin,/list-members/);
assert.match(admin,/list-audit/);
assert.match(admin,/Owner\/admin account is protected/);
assert.match(migration,/create table if not exists public\.audit_logs/);
assert.match(migration,/revoke insert, update, delete on public\.memberships from authenticated/);

const securitySource=readFileSync('src/security.js','utf8');
assert.doesNotMatch(securitySource,/setCredentials|password\s*:/,'biometric layer must not store the account password');
assert.match(securitySource,/verifyIdentity/);
console.log('V27.10.1 individual auth, biometric lock, manager delegation and audit guards OK');
