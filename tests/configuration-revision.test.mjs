import assert from 'node:assert/strict';
import {assertConsistentConfigurationRevision as check} from '../src/configuration-revision.js';

assert.equal(check({revision:8},{configurationRevision:8},{revision:8}),8);
for(const [before,bootstrap,after] of [
  [{revision:8},{configurationRevision:9},{revision:9}],
  [{revision:8},{configurationRevision:8},{revision:9}],
  [{revision:9},{configurationRevision:8},{revision:9}],
  [{revision:0},{configurationRevision:0},{revision:0}],
  [{revision:8},{configurationRevision:8},{legacy:true}],
])assert.throws(()=>check(before,bootstrap,after),/CONFIGURATION_CHANGED_DURING_SYNC/);
console.log('configuration-revision.test.mjs: OK');
