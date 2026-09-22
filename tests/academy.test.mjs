import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ACADEMY_CONTENT_VERSION,ACADEMY_TOPICS,ACADEMY_PATHS,ACADEMY_TROUBLESHOOT,ACADEMY_TOURS} from '../src/academy-content.js';
import {academySearch,academyPathProgress,academyProgressMap,renderAcademyCenter} from '../src/academy.js';

assert.match(ACADEMY_CONTENT_VERSION,/^2026\./);
assert.ok(ACADEMY_TOPICS.length>=33,'commercial coverage topic count');
assert.ok(ACADEMY_TOPICS.filter(x=>x.application==='hub').length>=17);
assert.ok(ACADEMY_TOPICS.filter(x=>x.application==='pos').length>=16);
assert.ok(ACADEMY_PATHS.length>=6);
assert.ok(ACADEMY_TROUBLESHOOT.length>=6);

const required=[
'hub-account-security','hub-organization-users','hub-dashboard','hub-recipes','hub-stock','hub-delivery-ai',
'hub-suppliers-purchases','hub-haccp','hub-team-planning','hub-hr-documents','hub-finance','hub-ai',
'hub-pos-admin','hub-pos-layout','hub-reservations-customers','hub-compliance-ops','hub-settings-subscription',
'pos-first-use','pos-operator','pos-cash-session','pos-floor','pos-ordering','pos-modifiers-menus','pos-production',
'pos-payments','pos-split-payments','pos-tickets','pos-refunds','pos-offline-sync','pos-printers','pos-terminals','pos-reports','pos-training'
];
for(const id of required)assert.ok(ACADEMY_TOPICS.some(x=>x.id===id),id);

for(const topic of ACADEMY_TOPICS){
  assert.ok(topic.version===ACADEMY_CONTENT_VERSION,topic.id+' version');
  assert.ok(topic.media?.length,topic.id+' media architecture');
  for(const field of [topic.title,topic.summary,...topic.steps]){
    for(const lang of ['fr','en','de','it'])assert.ok(String(field?.[lang]||'').trim(),topic.id+' '+lang);
  }
  if(topic.tour)assert.ok(ACADEMY_TOURS[topic.tour]?.length,topic.id+' tour');
}
assert.ok(ACADEMY_TOPICS.filter(x=>x.offline).length>=20,'essential offline guides');
assert.ok(academySearch('paiement',{locale:'fr',application:'pos'}).some(x=>x.id==='pos-payments'));
assert.ok(academySearch('stock',{locale:'en',application:'hub'}).length>0);

const progress=academyProgressMap([{application:'pos',topic_id:'pos-ordering',status:'completed'}]);
const path=ACADEMY_PATHS.find(x=>x.id==='server');
const summary=academyPathProgress(path,progress);
assert.ok(summary.total>=6);assert.ok(summary.done>=1);
const html=renderAcademyCenter({application:'pos',locale:'fr',progressRows:[],manager:true});
assert.match(html,/Académie ReMaPro/);assert.match(html,/Dépannage guidé/);assert.match(html,/Mode entraînement POS/);

const source=fs.readFileSync(new URL('../src/academy.js',import.meta.url),'utf8');
assert.match(source,/@media\(max-width:900px\)/,'tablet breakpoint');
assert.match(source,/@media\(max-width:560px\)/,'phone breakpoint');
assert.match(source,/academy-tour-target/,'guided tours');
assert.match(source,/academy-media-slot/,'media slot');
console.log('Academy common coverage checks passed');
