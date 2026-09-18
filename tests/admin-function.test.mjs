import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const admin=readFileSync('supabase/functions/remapro-admin/index.ts','utf8');
const config=readFileSync('supabase/config.toml','utf8');
const app=readFileSync('src/app.js','utf8');

assert.match(admin,/npm:@supabase\/server@1\.4\.1/,'server SDK must be pinned');
assert.match(admin,/withSupabase\(\{ auth:"user" \}/);
assert.match(admin,/ctx\.userClaims\?\.id/);
assert.match(admin,/ctx\.supabase[\s\S]*?from\("memberships"\)/,'caller membership must be checked through the user-scoped client');
assert.match(admin,/ORG_ADMIN_ROLES/);
assert.match(admin,/RESTAURANT_ADMIN_ROLES/);
assert.match(admin,/STAFF_PERMISSIONS/);
assert.match(admin,/7\s*\*\s*86400000/,'fallback trial must remain bounded to seven days');
assert.match(admin,/status\s*===\s*"active"\s*&&\s*planCode\s*===\s*"multi"/);
assert.match(admin,/ctx\.supabaseAdmin\.auth\.admin\.inviteUserByEmail/);
assert.match(admin,/ctx\.supabaseAdmin\.from\("memberships"\)\.insert/);
assert.match(admin,/ctx\.supabaseAdmin\.auth\.admin\.deleteUser/,'failed membership creation must roll back invited auth user');
assert.match(admin,/action===\"create-restaurant\"/);
assert.match(admin,/action===\"archive-restaurant\"/);
assert.match(admin,/action===\"revoke-member\"/);
assert.match(admin,/\.update\(\{active:false/,'restaurant removal must archive cloud data instead of deleting it');
assert.match(admin,/\.delete\(\)[\s\S]*?\.eq\(\"organization_id\",organizationId\)[\s\S]*?\.eq\(\"user_id\",targetUserId\)/,'membership revocation must be scoped to organization and target user');
assert.ok(admin.indexOf('from("memberships")') < admin.indexOf('inviteUserByEmail'),'authorization must happen before privileged invite');

assert.match(config,/\[functions\.remapro-admin\][\s\S]*?verify_jwt\s*=\s*true/);
assert.match(config,/\[functions\.remapro-ai\][\s\S]*?verify_jwt\s*=\s*true/);

assert.match(app,/cloudFunction\('remapro-admin'/);
assert.match(app,/kind:'manager'/);
assert.match(app,/kind:'staff'/);
assert.match(app,/removeManager\(state,entry\.id\)/);
assert.match(app,/removeStaffAccess\(state,entry\.id\)/);
assert.match(app,/action:'create-restaurant'/);
assert.match(app,/action:'archive-restaurant'/);
assert.match(app,/action:'revoke-member'/);

console.log('Authenticated invitation function and rollback security guards OK');
