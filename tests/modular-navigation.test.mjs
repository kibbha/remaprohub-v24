import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../app/styles.css',import.meta.url),'utf8');
const i18n=fs.readFileSync(new URL('../src/i18n.js',import.meta.url),'utf8');

for(const token of [
  'hub-classic-home',
  'hub-home-intro',
  'hub-ca-banner',
  'hub-home-section',
  'hub-category-grid',
  "t('hubCategoryHint')",
  "t('allTools')",
  'id="pos-layout-editor-root"',
  'id="floor-plan-editor-root"',
  "document.querySelectorAll('[data-pos-focus]')",
  'data-pos-section="catalog"',
  'data-pos-section="terminals"',
  "moduleSectionNav([['layout','Caisse'],['floor','Salle'],['catalog','Catalogue'],['devices','Équipe'],['connections','Intégrations']])",
  'data-module-pane="layout"',
  'data-module-pane="floor"',
  'data-module-pane="catalog"',
  'data-module-pane="devices"',
  'data-module-pane="connections"',
  "document.querySelector('.pos-layout-history')",
  "scrollIntoView?.({behavior:'smooth',block:'start'})"
]) assert.ok(app.includes(token),token+' missing');

for(const navEntry of [
  "['dashboard','dashboard','home']",
  "['operations','operations','operations']",
  "['posAdmin','posAdmin','modularPos']",
  "['finance','finance','financeNav']",
  "['more','more','more']"
]) assert.ok(app.includes(navEntry),navEntry+' navigation entry missing');
assert.equal(app.includes("['documents','documents']"),false);

assert.ok(css.includes('--hub-home-surface:#fff'),'neutral Hub palette missing');
assert.ok(css.includes('background:linear-gradient(125deg,#fff 0%,#f0f7f4 100%)'),'Hub revenue card palette missing');
assert.ok(css.includes('.pos-admin-page .module-section-nav'),'POS tabs styling missing');
for(const token of [
  '.modular-block.pos',
  '.modular-tiles',
  '.nav button[data-page="posAdmin"]',
  '.hub-kpi-grid',
  '.hub-quick-grid'
]) assert.ok(css.includes(token),token+' missing');

for(const key of [
  'home','modularPos','hubCategoryHint','allTools',
  'posCatalog','posLayout','posHistory','posTerminals'
]) assert.ok(i18n.includes(key+':'),key+' translation key missing');


for(const section of ['overview','analysis','accounting','entry','inventory','count','receiving','intelligence','shifts','workforce','conflicts','readiness','general','access','business','data']) assert.ok(app.includes(`data-module-pane="${section}"`),section+' section pane missing');
for(const id of ['profitLeakCockpit','accountingExportForm','financeForm','stockPhotoInput','stockPhotoAnalyze','visionStockForm','stockForm','copyPreviousWeek']) assert.ok(app.includes(id),id+' binding target missing');

console.log('Hub modular home and direct POS navigation checks passed');

assert.ok(css.includes('.shell{width:100vw;max-width:100vw;margin:0;padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right)}'),'edge-to-edge shell missing');
assert.ok(css.includes('.nav{left:env(safe-area-inset-left);right:env(safe-area-inset-right);bottom:0'),'edge-to-edge bottom navigation missing');
