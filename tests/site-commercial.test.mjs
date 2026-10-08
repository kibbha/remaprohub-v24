import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const pages=['index.html','pricing.html','faq.html','features.html','terms.html'];
for(const page of pages){
  const html=read(page);
  assert.doesNotMatch(html,/7 jours|7 days|7 Tage|7 giorni/i,page+' still advertises a 7-day trial');
  assert.doesNotMatch(html,/199 CHF par an|399 CHF par an|499 CHF \/ an|ReMaPro Complete/i,page+' contains a retired offer');
}
for(const page of ['index.html','pricing.html']){
  const html=read(page);
  assert.match(html,/49\.90/,'one-establishment plan is CHF 49.90 per month');
  for(const key of ['userLimit','additionalSites','noCommitment'])
    assert.ok(html.includes('data-i18n="'+key+'"'),page+' missing '+key);
  assert.doesNotMatch(html,/data-i18n="unifiedPlanAnnual"/,page+' must not advertise retired annual plan');
}
assert.doesNotMatch(read('pricing.html'),/<th>Hub<\/th><th>Complete<\/th>/,'retired plan comparison must be removed');
const terms=read('terms.html');
assert.match(terms,/49,90 CHF/);
assert.match(terms,/19,90 CHF/);
assert.match(terms,/14 jours/);
const js=read('app.js');
const matched=js.match(/const commercialOffer20261008=(\{[^\n]+\});\nfor\(const lang/);
assert.ok(matched,'authoritative commercial copy block must exist');
const commercial=JSON.parse(matched[1]);
for(const lang of ['fr','en','de','it']){
  const c=commercial[lang];
  assert.ok(c,'missing locale '+lang);
  for(const k of ['trial14','pricingIntro','faqA1','faqA3','userLimit','additionalSites','noCommitment','featuresCta'])
    assert.ok(c[k],lang+' missing '+k);
  assert.ok(!('unifiedPlanAnnual' in c),lang+' has obsolete annual offer');
}
assert.ok(js.indexOf('commercialOffer20261008')>js.indexOf('const launchUpdates='));
assert.ok(js.indexOf('commercialOffer20261008')<js.indexOf('function applyLanguage'));
console.log('ReMaPro Hub + POS commercial pages and four translated offers are consistent');
