import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LANGS,LEGACY_LANGS,t} from '../src/i18n.js';
assert.deepEqual(LANGS,['fr','en','de','it']);
assert.deepEqual(LEGACY_LANGS,['es','pt']);
const app=readFileSync('src/app.js','utf8'),restored=readFileSync('src/restored.js','utf8'),workflow=readFileSync('.github/workflows/android.yml','utf8');
assert.match(restored,/opts\(LANGS\.map/);
assert.doesNotMatch(restored,/\['fr','en','de','it','es','pt','nl','zh'\]/);
assert.match(workflow,/workflow_dispatch:/);
const controlledPushTrigger="  push:\n    branches: [rebuild/remaprohub-clean]\n    paths:\n      - '.github/final-build-trigger'\n";
assert.ok(workflow.includes(controlledPushTrigger),'Android build push trigger must stay restricted to the final-build sentinel');
assert.equal((workflow.match(/\n  push:/g)||[]).length,1,'Only one controlled push trigger is allowed');
for(const key of ['todayRevenue','hubCategoryHint','hubGroupSalesSub','hubGroupProductsSub','hubGroupCustomersSub','hubGroupStockSub','hubGroupTeamSub','hubGroupFinanceSub','hubGroupHaccpSub','hubGroupDocumentsSub','hubGroupSettingsSub','hubToolOrdersSub','hubToolPosAdminSub','hubToolHelpSub']) {
  for(const lang of ['fr','en','de','it']) assert.notEqual(t(key,lang),key,lang+' missing '+key);
}
console.log('Hub category taxonomy active-language coverage passed');
console.log('Active language gate FR/EN/DE/IT and controlled final-build trigger OK');
