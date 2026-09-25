import assert from 'node:assert/strict';
import {normalizePosSettings,paymentAllowed} from '../src/payment-policy.js';

const defaults=normalizePosSettings(null);
for(const method of ['cash','card','twint','voucher','invoice','other'])assert.equal(paymentAllowed(defaults,method),true);
const settings=normalizePosSettings({payments:{cash:false,twint:false},kdsWarningMinutes:8,kdsCriticalMinutes:16});
assert.equal(paymentAllowed(settings,'cash'),false);
assert.equal(paymentAllowed(settings,'card'),true);
assert.equal(settings.kdsWarningMinutes,8);
assert.equal(settings.kdsCriticalMinutes,16);
assert.equal(normalizePosSettings({kdsWarningMinutes:30,kdsCriticalMinutes:2}).kdsCriticalMinutes,31);
console.log('payment-policy.test.mjs: OK');
