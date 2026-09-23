import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../app/styles.css',import.meta.url),'utf8');
const i18n=fs.readFileSync(new URL('../src/i18n.js',import.meta.url),'utf8');

for(const token of [
  'modular-dashboard',
  "t('modularPilotage')",
  "t('modularExploitation')",
  "t('modularAdministration')",
  "posTile('layout','posLayout'",
  "posTile('history','posHistory'",
  "posTile('terminals','posTerminals'",
  "document.querySelectorAll('[data-pos-focus]')",
  'data-pos-section="catalog"',
  'data-pos-section="terminals"',
  "document.querySelector('.pos-layout-history')",
  "scrollIntoView?.({behavior:'smooth',block:'start'})"
]) assert.ok(app.includes(token),token);

assert.ok(app.includes("[['dashboard','dashboard','home'],['operations','operations','operations'],['posAdmin','posAdmin','modularPos'],['finance','finance','finance'],['more','more','more']]"));
assert.equal(app.includes("['documents','documents']"),false);

for(const token of ['.modular-block.pos','.modular-tiles','.nav button[data-page="posAdmin"]'])
  assert.ok(css.includes(token),token);

for(const key of ['home','modularPilotage','modularExploitation','modularPos','modularAdministration','posCatalog','posLayout','posHistory','posTerminals'])
  assert.ok(i18n.includes(key+':'),key+' translation key missing');

console.log('Hub modular home and direct POS navigation checks passed');
