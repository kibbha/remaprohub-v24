import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ACADEMY_CONTENT_VERSION,ACADEMY_TOPICS,ACADEMY_PATHS,ACADEMY_TROUBLESHOOT,ACADEMY_TOURS,ACADEMY_COVERAGE} from '../src/academy-content.js';
import {academySearch,academyPathProgress,academyProgressMap,academyContextTopics,renderAcademyCenter} from '../src/academy.js';

assert.match(ACADEMY_CONTENT_VERSION,/^2026\./);
assert.ok(ACADEMY_TOPICS.length>=33,'commercial coverage topic count');
assert.ok(ACADEMY_TOPICS.filter(x=>x.application==='hub').length>=17);
assert.ok(ACADEMY_TOPICS.filter(x=>x.application==='pos').length>=16);
assert.ok(ACADEMY_PATHS.length>=6);
assert.ok(ACADEMY_TROUBLESHOOT.length>=6);

const ids=new Set(ACADEMY_TOPICS.map(x=>x.id));
for(const [app,coverage] of Object.entries(ACADEMY_COVERAGE)){
  assert.ok(Object.keys(coverage).length>=60,app+' coverage breadth');
  for(const [feature,topicId] of Object.entries(coverage))assert.ok(ids.has(topicId),feature+' -> '+topicId);
}

for(const topic of ACADEMY_TOPICS){
  assert.equal(topic.version,ACADEMY_CONTENT_VERSION,topic.id+' version');
  assert.ok(topic.media?.length,topic.id+' media architecture');
  for(const field of [topic.title,topic.summary,...topic.steps]){
    for(const lang of ['fr','en','de','it'])assert.ok(String(field?.[lang]||'').trim(),topic.id+' '+lang);
  }
  if(topic.tour)assert.ok(ACADEMY_TOURS[topic.tour]?.length,topic.id+' tour');
}
assert.ok(ACADEMY_TOPICS.filter(x=>x.offline).length>=20,'essential offline guides');
assert.ok(academySearch('paiement',{locale:'fr',application:'pos'}).some(x=>x.id==='pos-payments'));
assert.ok(academySearch('stock',{locale:'en',application:'hub'}).length>0);

const hubContexts=['dashboard','operations','products','categories','orders','stock','stockMoves','waste','recipes','haccp','cleaning','audits','recalls','allergens','team','planning','leave','training','documents','finance','cashRegister','weeklyKpi','invoices','suppliers','purchases','deliveries','reservations','customers','loyalty','incidents','equipment','maintenance','taskManager','checklists','briefing','handover','goals','alerts','organization','integrations','posAdmin','ai','settings','more','help'];
for(const context of hubContexts)assert.ok(academyContextTopics('hub',context).length,'Hub contextual help: '+context);
const posContexts=['login','setup','picker','operator','session','sale','floor','production','tickets','report','terminals','printers','team','sync','academy','training'];
for(const context of posContexts)assert.ok(academyContextTopics('pos',context).length,'POS contextual help: '+context);

const progress=academyProgressMap([{application:'pos',topic_id:'pos-ordering',status:'completed',content_version:ACADEMY_CONTENT_VERSION}]);
const path=ACADEMY_PATHS.find(x=>x.id==='server'),summary=academyPathProgress(path,progress);
assert.ok(summary.total>=6);assert.ok(summary.done>=1);

for(const locale of ['fr','en','de','it']){
  const html=renderAcademyCenter({application:'pos',scope:'all',locale,progressRows:[],manager:true,canManageVisibility:false});
  assert.match(html,/academy-onboarding/,'onboarding '+locale);
  assert.match(html,/academy-search/,'search '+locale);
  assert.match(html,/academy-trouble-grid/,'troubleshoot '+locale);
  assert.match(html,/academy-training-start/,'training '+locale);
  assert.doesNotMatch(html,/undefined/,'no undefined '+locale);
}
const stale=renderAcademyCenter({application:'hub',locale:'fr',progressRows:[{application:'hub',topic_id:'hub-stock',status:'completed',content_version:'old',updated_at:new Date().toISOString()}]});
assert.match(stale,/Guide mis à jour/,'outdated content signaled');
const common=renderAcademyCenter({application:'hub',scope:'all',locale:'fr',progressRows:[]});
assert.match(common,/PIN oublié/,'cross-app troubleshooting visible from common center');

const source=fs.readFileSync(new URL('../src/academy.js',import.meta.url),'utf8');
assert.match(source,/@media\(max-width:900px\)/,'tablet breakpoint');
assert.match(source,/@media\(max-width:560px\)/,'phone breakpoint');
assert.match(source,/academy-onboarding/,'first steps onboarding');
assert.match(source,/academy-tour-target/,'guided tours');
assert.match(source,/academy-media-slot/,'media slot');
console.log('Academy commercial coverage, i18n and responsive checks passed');
