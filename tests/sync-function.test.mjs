import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration=readFileSync('supabase/migrations/002_v27_permissions_and_plans.sql','utf8');
const granularMigration=readFileSync('supabase/migrations/035_workspace_key_revisions.sql','utf8');
const edge=readFileSync('supabase/functions/remapro-sync/index.ts','utf8');
const config=readFileSync('supabase/config.toml','utf8');
const cloud=readFileSync('src/cloud.js','utf8');
const app=readFileSync('src/app.js','utf8');

assert.match(migration,/create table if not exists public\.restaurant_workspaces/);
assert.match(migration,/alter table public\.restaurant_workspaces enable row level security/);
assert.match(migration,/revoke all on table public\.restaurant_workspaces from public, anon, authenticated/);
assert.doesNotMatch(migration,/grant [^;]*restaurant_workspaces[^;]*authenticated/i,'workspace must not be exposed directly through Data API');

assert.match(edge,/npm:@supabase\/server@1\.4\.1/);
assert.match(edge,/withSupabase\(\{auth:"user"\}/);
assert.match(edge,/READ_BY_PERMISSION/);
assert.match(edge,/WRITE_BY_PERMISSION/);
assert.match(edge,/SYNC_CONFLICT/);
assert.match(edge,/baseRevision/);
assert.match(edge,/currentRevision!==baseRevision/,'stale pushes must enter conflict evaluation');
assert.match(edge,/conflictingKeys/,'stale pushes must identify per-key conflicts');
assert.match(edge,/\.eq\("revision",currentRevision\)/,'final update must use optimistic locking against the revision that was actually read');
assert.match(edge,/ctx\.supabaseAdmin\.from\("restaurant_workspaces"\)/);
assert.match(edge,/filterWorkspace/);
assert.match(edge,/sanitizeWorkspace/);
assert.match(granularMigration,/key_revisions jsonb not null default/);
assert.match(granularMigration,/jsonb_object_agg/,'existing workspaces must be backfilled conservatively');
assert.match(edge,/conflictingKeys/,'sync must detect conflicts per changed key');
assert.match(edge,/nextKeyRevisions/,'sync must track per-key revisions');
assert.match(edge,/changedKeys:touchedKeys/,'sync must report changed keys');
assert.match(config,/\[functions\.remapro-sync\][\s\S]*?verify_jwt\s*=\s*true/);

assert.match(cloud,/cloudWorkspaceReadKeys/);
assert.match(cloud,/cloudWorkspaceWriteKeys/);
assert.match(cloud,/WORKSPACE_READ_BY_PERMISSION/);
assert.match(cloud,/error\.status=response\.status/);
assert.match(cloud,/error\.payload=data/);
assert.doesNotMatch(cloud,/service_role|sb_secret_|SUPABASE_SECRET/i);

assert.match(app,/function scheduleCloudSync\(\)/);
assert.match(app,/markCloudWorkspaceDirty/,'local mutations must accumulate dirty workspace keys');
assert.match(app,/cloudDirtyKeys/,'workspace dirty keys must persist across restarts');
assert.match(app,/sendKeys=knownDirty\.length\?knownDirty:writeKeys/,'legacy dirty workspaces must fall back to a full writable seed');
assert.match(app,/workspace\}\);/,'push must send a granular workspace patch');
assert.match(app,/function pullCloudWorkspace\(/);
assert.match(app,/function pushCloudWorkspace\(/);
assert.match(app,/baseRevision:Math\.max/);
assert.match(app,/cloudSyncState==='conflict'/);
assert.match(app,/id="cloudPull"/);
assert.match(app,/id="cloudPush"/);
const pullBody=app.match(/async function pullCloudWorkspace\([\s\S]*?(?=\nasync function pushCloudWorkspace)/)?.[0]||'';
const pushBody=app.match(/async function pushCloudWorkspace\([\s\S]*?(?=\nfunction syncCurrentWorkspaceOnOpen)/)?.[0]||'';
assert.match(pullBody,/else\{seed=true;current\.cloudDirty=true\}current\.cloudRevision[\s\S]*?save\(state\)/,'a missing remote workspace must stay dirty until its deferred seed push succeeds');
assert.doesNotMatch(pullBody,/current\.cloudRevision[^;]*;current\.cloudDirty=false;save\(state\)/,'pull must not clear a pending seed before it is pushed');
assert.match(pushBody,/current\.cloudRevision[^;]*;current\.cloudDirty=false;save\(state\)/,'successful push must clear the persisted dirty marker');

console.log('JWT workspace sync, permission filtering and conflict guards OK');
