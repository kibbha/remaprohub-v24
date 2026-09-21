import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync('supabase/functions/remapro-admin/index.ts','utf8');
const app=readFileSync('src/app.js','utf8');

assert.match(source,/withSupabase\(\{auth:"user"\}/);
assert.match(source,/ORG_ADMIN_ROLES/);
assert.match(source,/RESTAURANT_ADMIN_ROLES/);
assert.match(source,/MEMBER_PERMISSIONS/);
for(const permission of ['finance','hr','documents','recipes','ai'])assert.match(source,new RegExp(`"${permission}"`));
for(const action of ['list-members','list-audit','invite-member','update-member','set-member-active','revoke-member'])assert.match(source,new RegExp(`"${action}"`));
assert.match(source,/allowedScope=\(ids:string\[\]\)=>orgAdmin\|\|ids\.every/);
assert.match(source,/targetUserId===callerUserId/,'managers must not edit their own role');
assert.match(source,/ORG_ADMIN_ROLES\.has\(String\(m\.role\)\)/,'owner/admin memberships must be protected');
assert.match(source,/ctx\.supabaseAdmin\.auth\.admin\.inviteUserByEmail/);
assert.match(source,/audit_logs/);
assert.match(source,/member\.updated/);
assert.match(source,/member\.deactivated/);
assert.match(app,/cloudAccountPanel/);
assert.match(app,/memberAccessForm/);
assert.match(app,/data-cloud-member-toggle/);
assert.match(app,/refreshCloudAdminData/);
console.log('V27.10 manager delegation and account audit guards OK');
