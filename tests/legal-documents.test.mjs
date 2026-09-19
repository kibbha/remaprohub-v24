import assert from 'node:assert/strict';
import {LEGAL_COUNTRIES,LEGAL_REVIEW_DATE,legalCountryCode,legalPack,legalFieldsFor,isLegalHrDocument} from '../src/legal.js';
import {readFileSync} from 'node:fs';
assert.equal(LEGAL_REVIEW_DATE,'2026-09-19');
assert.equal(legalCountryCode('Switzerland'),'CH');
assert.equal(legalCountryCode('France'),'FR');
assert.equal(legalCountryCode('UK'),'GB');
assert.equal(LEGAL_COUNTRIES.length,8);
const markers={CH:'avsAiApg',FR:'netSocial',DE:'taxClass',IT:'ccnlCode',ES:'irpf',PT:'niss',NL:'minimumWage',GB:'nationalInsurance'};
for(const [code,marker] of Object.entries(markers)){
  const pack=legalPack(code),pay=legalFieldsFor('payslip',code),contract=legalFieldsFor('employmentContract',code),extra=legalFieldsFor('extraContract',code);
  assert.equal(pack.code,code);
  assert.ok(pack.source.length>8,code+' source missing');
  assert.ok(pack.note.length>20,code+' legal note missing');
  assert.ok(pay.length>=20,code+' payslip too shallow');
  assert.ok(contract.length>=18,code+' contract too shallow');
  assert.ok(extra.length>=12,code+' extra contract too shallow');
  assert.ok(pay.some(x=>x.key===marker),code+' jurisdiction field missing');
  assert.equal(new Set(pay.map(x=>x.key)).size,pay.length,code+' duplicate payslip fields');
}
assert.ok(isLegalHrDocument('payslip'));
assert.ok(!isLegalHrDocument('inventory'));
assert.match(legalPack('ES').note,/05\.10\.2026/);
const app=readFileSync('src/app.js','utf8');
assert.match(app,/documentLegalBanner/);
assert.match(app,/legalFieldsFor/);
assert.match(app,/name="legalCountry"/);
console.log('Country-specific HR legal document packs OK');
