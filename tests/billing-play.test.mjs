import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const billing=readFileSync('src/billing.js','utf8');
const app=readFileSync('src/app.js','utf8');
const migration=readFileSync('supabase/migrations/003_v27_7_play_security_billing.sql','utf8');
const serverOnly=readFileSync('supabase/migrations/007_v27_11_server_only_tables.sql','utf8');
const webhook=readFileSync('supabase/functions/remapro-revenuecat-webhook/index.ts','utf8');
const account=readFileSync('supabase/functions/remapro-account/index.ts','utf8');
const config=readFileSync('supabase/config.toml','utf8');

assert.match(billing,/Purchases/);
assert.match(billing,/purchasePackage/);
assert.match(billing,/restorePurchases/);
assert.match(billing,/entitlementPlan/);
assert.match(app,/billingPurchaseForm/);
assert.match(app,/subscribeWithGooglePlay/);
assert.doesNotMatch(app,/id="subscriptionForm"/);
assert.match(app,/remapro-account/);
assert.match(migration,/revoke update, delete on public\.temperature_logs from authenticated/);
assert.match(migration,/revoke insert, update, delete on public\.subscriptions from authenticated/);
assert.match(migration,/subscriptions_organization_unique/);
assert.match(serverOnly,/revoke all privileges on table public\.restaurant_workspaces from public, anon, authenticated/);
assert.match(serverOnly,/revoke all privileges on table public\.subscription_events from public, anon, authenticated/);
assert.match(webhook,/REVENUECAT_WEBHOOK_SECRET/);
assert.match(webhook,/revenuecat_event_id/);
assert.match(account,/delete-self/);
assert.match(account,/auth\.admin\.deleteUser/);
assert.match(config,/\[functions\.remapro-revenuecat-webhook\][\s\S]*verify_jwt = false/);
assert.match(config,/\[functions\.remapro-account\][\s\S]*verify_jwt = true/);
console.log('RevenueCat billing, immutable HACCP RLS and account deletion wiring OK');

const injectSource=readFileSync('scripts/inject-runtime-config.mjs','utf8');
assert.match(injectSource,/REVENUECAT_ANDROID_API_KEY_REQUIRED/);
assert.match(injectSource,/REQUIRE_REVENUECAT/);
const androidWorkflow=readFileSync('.github/workflows/android.yml','utf8');
assert.match(androidWorkflow,/REQUIRE_REVENUECAT: '1'/);
