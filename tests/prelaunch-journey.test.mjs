import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const store=read('src/store.js');
const cloud=read('src/cloud.js');
const app=read('src/app.js');
const bootstrap=read('supabase/functions/remapro-bootstrap/index.ts');
const android=read('.github/workflows/android.yml');

assert.match(store,/multi:\{monthly:49\.90,yearly:399,restaurants:5/,'Multi monthly price must be CHF 49.90');
assert.match(store,/trialDays:Math\.max\(1,[\s\S]*?:7\)/,'new local subscriptions default to 7 days without extending existing explicit trials');
assert.doesNotMatch(store,/Math\.max\(14,/,'local subscription logic must not force a 14-day minimum');
assert.match(cloud,/organization\.created_at\)\.getTime\(\)\+7\*86400000/,'cloud legacy fallback trial is seven days');
assert.match(app,/cloudOrg\.created_at\)\.getTime\(\)\+7\*86400000/,'settings display uses seven-day cloud fallback');
assert.match(bootstrap,/select\("id,trial_days"\)/,'bootstrap reads trial length from the active Standard plan');
assert.match(bootstrap,/Math\.max\(1,Number\(plan\.trial_days\)\|\|7\)/,'bootstrap has no fourteen-day floor');
for(const token of ['organizations','restaurants','memberships','subscriptions','network_admin']){
  assert.ok(bootstrap.includes(token),'bootstrap must provision '+token);
}
assert.match(app,/signUpCloud\(email,password,name,restaurantName\)/,'owner signup sends restaurant metadata');
assert.match(app,/cloudFunction\('remapro-bootstrap'/,'empty owner identity is provisioned automatically');
assert.match(android,/REQUIRE_REVENUECAT: '1'/,'production Android build must require RevenueCat');
assert.match(app,/\['dashboard','category','more','help','settings'\]/,'help/settings remain reachable for account recovery and billing');

console.log('Pre-launch owner signup, commercial config and recovery access checks passed');
