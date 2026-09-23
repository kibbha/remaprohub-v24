import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../app/styles.css',import.meta.url),'utf8');
const i18n=fs.readFileSync(new URL('../src/i18n.js',import.meta.url),'utf8');

assert.ok(app.includes('modular-dashboard'));
assert.ok(app.includes("t('modularPilotage')"));
assert.ok(app.includes("t('modularExploitation')"));
assert.ok(app.includes("t('modularAdministration')"));
assert.ok(app.includes("posTile('layout','posLayout'"));
assert.ok(app.includes("posTile('history','posHistory'"));
assert.ok(app.includes("posTile('terminals','posTerminals'"));
assert.ok(app.includes("[['dashboard','dashboard','home'],['operations','operations','operations'],['posAdmin','posAdmin','modularPos'],['finance','finance','finance'],['more','more','more']]"));
assert.equal(app.includes("['documents','documents']"),false);
assert.ok(app.includes("document.querySelectorAll('[data-pos-focus]')"));
assert.ok(app.includes("data-pos-section="catalog""));
assert.ok(app.includes("data-pos-section="terminals""));
assert.ok(app.includes("document.querySelector('.pos-layout-history')"));
assert.ok(app.includes("scrollIntoView?.({behavior:'smooth',block:'start'})"));
assert.ok(css.includes('.modular-block.pos'));
assert.ok(css.includes('.modular-tiles'));
assert.ok(css.includes('.nav button[data-page="posAdmin"]'));
for(const key of ['home','modularPilotage','modularExploitation','modularPos','modularAdministration','posCatalog','posLayout','posHistory','posTerminals']){
  assert.ok(i18n.includes(key+':'),key+' translation key missing');
}
console.log('Hub modular home and direct POS navigation checks passed');
