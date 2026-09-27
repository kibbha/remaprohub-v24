import assert from 'node:assert/strict';
import fs from 'node:fs';
import {cloudSubscriptionAccess} from '../src/cloud.js';

const now=new Date('2026-09-27T12:00:00Z');
const base={organizations:[{id:'org',created_at:'2026-09-25T00:00:00Z'}],subscriptions:[]};

assert.equal(cloudSubscriptionAccess({...base,subscriptions:[{organization_id:'org',status:'active',plan:{code:'standard'}}]},'org',now).allowed,true);
assert.equal(cloudSubscriptionAccess({...base,subscriptions:[{organization_id:'org',status:'trialing',trial_ends_at:'2026-09-28T00:00:00Z',plan:{code:'standard'}}]},'org',now).allowed,true);
assert.equal(cloudSubscriptionAccess({...base,subscriptions:[{organization_id:'org',status:'trialing',trial_ends_at:'2026-09-26T00:00:00Z',plan:{code:'standard'}}]},'org',now).allowed,false);
assert.equal(cloudSubscriptionAccess({...base,subscriptions:[{organization_id:'org',status:'past_due',current_period_end:'2026-09-28T00:00:00Z',plan:{code:'multi'}}]},'org',now).allowed,true,'billing issue must retain access');
assert.equal(cloudSubscriptionAccess({...base,subscriptions:[{organization_id:'org',status:'past_due',current_period_end:'2026-09-26T00:00:00Z',plan:{code:'multi'}}]},'org',now).allowed,true,'billing issue remains entitled until RevenueCat sends EXPIRATION');
assert.equal(cloudSubscriptionAccess({...base,subscriptions:[{organization_id:'org',status:'expired',current_period_end:'2026-09-26T00:00:00Z',plan:{code:'multi'}}]},'org',now).allowed,false,'EXPIRATION revokes access');
assert.equal(cloudSubscriptionAccess(base,'org',new Date('2026-10-08T00:00:00Z')).allowed,true,'legacy organization remains entitled inside fourteen-day fallback');
assert.equal(cloudSubscriptionAccess(base,'org',new Date('2026-10-09T00:00:01Z')).allowed,false,'legacy fallback expires after fourteen days');
assert.equal(cloudSubscriptionAccess({...base,subscriptions:[{organization_id:'org',status:'active',restaurant_limit:3,plan:{code:'standard'}}]},'org',now).restaurantLimit,3,'entitlement exposes purchased establishment slots');

const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const sync=fs.readFileSync(new URL('../supabase/functions/remapro-sync/index.ts',import.meta.url),'utf8');
const admin=fs.readFileSync(new URL('../supabase/functions/remapro-admin/index.ts',import.meta.url),'utf8');
const pos=fs.readFileSync(new URL('../supabase/functions/remapro-pos-sync/index.ts',import.meta.url),'utf8');

for(const token of [
  "cloudSubscriptionAccess(cloudIdentity,cloudOrganizationId()).allowed",
  "applySubscriptionEntitlement(state,entitlement)",
  "['dashboard','category','more','help','settings']"
])assert.ok(app.includes(token),'Hub entitlement/recovery gate must include '+token);

for(const token of ['organizationEntitled','action==="push"','SUBSCRIPTION_REQUIRED'])
  assert.ok(sync.includes(token),'Hub sync entitlement must include '+token);
assert.ok(sync.includes('if(action==="pull")'),'Hub pull remains available for recovery/read-only access');

for(const token of ['subscriptionAccess','readOnlyActions','list-members','list-audit','SUBSCRIPTION_REQUIRED'])
  assert.ok(admin.includes(token),'Admin entitlement must include '+token);

for(const token of ['organizationSubscriptionAccess','ENTITLEMENT_MUTATIONS','SUBSCRIPTION_REQUIRED','entitlement,'])
  assert.ok(pos.includes(token),'POS entitlement must include '+token);
for(const action of ['commit_order','settle_open_order','open_cash_session','bundle_publish','sync_catalog','upsert_operator'])
  assert.ok(pos.includes('"'+action+'"'),'POS mutation entitlement set must protect '+action);

console.log('Pre-launch subscription entitlement and recovery-access checks passed');
