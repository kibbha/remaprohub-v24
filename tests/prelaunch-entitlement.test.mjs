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
assert.ok((app.match(/applySubscriptionEntitlement\(state,entitlement\)/g)||[]).length>=2,'online and cached-offline Hub identity paths must both hydrate the authoritative entitlement');

for(const token of ['organizationEntitled','action==="push"','SUBSCRIPTION_REQUIRED'])
  assert.ok(sync.includes(token),'Hub sync entitlement must include '+token);
assert.ok(sync.includes('if(action==="pull")'),'Hub pull remains available for recovery/read-only access');

for(const token of ['subscriptionAccess','readOnlyActions','list-members','list-audit','SUBSCRIPTION_REQUIRED'])
  assert.ok(admin.includes(token),'Admin entitlement must include '+token);

for(const token of ['organizationSubscriptionAccess','ENTITLEMENT_MUTATIONS','SUBSCRIPTION_REQUIRED','entitlement,'])
  assert.ok(pos.includes(token),'POS entitlement must include '+token);
for(const action of ['commit_order','settle_open_order','open_cash_session','bundle_publish','sync_catalog','upsert_operator'])
  assert.ok(pos.includes('"'+action+'"'),'POS mutation entitlement set must protect '+action);
for(const action of ['commit_order','save_open_order','append_order_items','send_to_production','update_production_item','close_cash_session','settle_open_order','settle_open_order_split','settle_open_order_allocated','pay_allocated_group','cancel_open_order','refund_order','confirm_external_refund'])
  assert.ok(pos.includes('"'+action+'"'),'expired-service recovery must cover '+action);
assert.ok(pos.includes('openRecoverySession'),'expiry recovery must be tied to an existing server-open cash session');
assert.ok(pos.includes('recoveryOrderSessionId'),'queued order operations must resolve back to the open cash session');
assert.ok(pos.includes('body?.order?.cashSessionId'),'pre-expiry queued save/checkout payloads must recover through their original cash session');
assert.ok(pos.includes('action==="confirm_external_refund"'),'external refund confirmation must remain recoverable as a financial finalization');
assert.ok(pos.includes('expiredServiceRecoveryAllowed'),'POS expiry gate must verify recovery eligibility');
assert.ok(pos.includes('.eq("status","open").maybeSingle()'),'expiry recovery must require an actually open cash session for service mutations');
assert.ok(pos.includes('if(!recoveryAllowed)return json({error:"SUBSCRIPTION_REQUIRED",entitlement},402)'),'new mutations outside recovery must remain blocked after expiry');
assert.ok(pos.includes('operatorBoundPermission'),'POS manager mutations must bind to the active operator PIN when one is present');
for(const action of ['upsert_operator','sync_tables','upsert_printer','upsert_terminal']){
  const start=pos.indexOf('if(action==="'+action+'")');
  assert.ok(start>=0,'missing manager action '+action);
  assert.ok(pos.slice(start,start+500).includes('operatorBoundPermission("settings")'),'shared-POS manager action must require settings permission: '+action);
}


console.log('Pre-launch subscription entitlement and recovery-access checks passed');
