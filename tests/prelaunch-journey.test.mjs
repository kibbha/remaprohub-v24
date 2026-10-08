import assert from 'node:assert/strict';
// Operator permission audit validation
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const store=read('src/store.js');
const cloud=read('src/cloud.js');
const app=read('src/app.js');
const bootstrap=read('supabase/functions/remapro-bootstrap/index.ts');
const android=read('.github/workflows/android.yml');

assert.match(store,/standard:\{monthly:49\.90,yearly:null,restaurants:1,maxRestaurants:5,extraRestaurantMonthly:19\.90,users:10/,'Base offer must be CHF 49.90 with CHF 19.90 extra establishments and 10 users');
assert.match(store,/trialDays:Math\.max\(14,[\s\S]*?:14\)/,'local subscriptions must migrate to a minimum fourteen-day trial');
assert.match(cloud,/organization\.created_at\)\.getTime\(\)\+14\*86400000/,'cloud legacy fallback trial is fourteen days');
assert.match(app,/cloudOrg\.created_at\)\.getTime\(\)\+14\*86400000/,'settings display uses fourteen-day cloud fallback');
assert.match(bootstrap,/select\("id,trial_days"\)/,'bootstrap reads trial length from the active Standard plan');
assert.match(bootstrap,/Math\.max\(1,Number\(plan\.trial_days\)\|\|14\)/,'bootstrap defaults to the approved fourteen-day trial');
for(const token of ['organizations','restaurants','memberships','subscriptions','network_admin']){
  assert.ok(bootstrap.includes(token),'bootstrap must provision '+token);
}
assert.match(app,/signUpCloud\(email,password,name,restaurantName\)/,'owner signup sends restaurant metadata');
assert.match(app,/cloudFunction\('remapro-bootstrap'/,'empty owner identity is provisioned automatically');
assert.match(android,/REQUIRE_REVENUECAT: '1'/,'production Android build must require RevenueCat');
assert.match(app,/\['dashboard','category','more','help','settings'\]/,'help/settings remain reachable for account recovery and billing');
assert.match(app,/name="restaurantCount"/,'billing UI must price by establishment count');
assert.match(app,/extraRestaurantMonthly/,'billing UI must show additional-establishment pricing');
assert.match(app,/cloudActiveRestaurantCount/,'billing must know the organization-wide active establishment count');
assert.match(app,/n<Math\.max\(1,cloudActiveRestaurantCount\(\)\)\?'disabled'/,'billing UI must disable plans below the active establishment count');
assert.match(app,/requested<activeCount/,'billing submit must reject a downgrade below active establishments');
assert.match(app,/purchasePlan\(requested\)/,'billing must purchase the validated establishment count');
assert.doesNotMatch(app,/name="billing"/,'annual billing selector must be removed');
assert.doesNotMatch(app,/name="plan"/,'legacy Standard\/Multi selector must be removed');

console.log('Pre-launch owner signup, commercial config and recovery access checks passed');
