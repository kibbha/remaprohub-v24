import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{catalogue,LANGS}from'../src/i18n.js';
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');const store=readFileSync(new URL('../src/store.js',import.meta.url),'utf8');
for(const name of ['dashboard','operations','haccp','finance','documents','stock','suppliers','team','reservations','incidents','waste','more','settings'])assert.match(app,new RegExp(`\\b${name}\\b`),`missing module ${name}`);
assert.doesNotMatch(app,/applyFullLanguage|MutationObserver|translateRenderedHTML|canonicalTranslation|location\.replace/);assert.match(app,/import\{load,save\}from'\.\/store\.js'/);assert.match(store,/localStorage\.setItem/);
const keys=[...app.matchAll(/\bt\('([^']+)'\)/g)].map(x=>x[1]);for(const lang of LANGS){const cat=catalogue(lang);for(const key of new Set(keys))assert.ok(Object.prototype.hasOwnProperty.call(cat,key),`${lang}: missing translation key ${key}`)}
for(const field of ['sales','stock','temps','suppliers','purchases','team','shifts','incidents','waste','reservations','customers','recipes','maintenance','handover'])assert.match(store,new RegExp(`\\b${field}:`),`missing state field ${field}`);
console.log(`V27 architecture: ${new Set(keys).size} UI translation keys validated across ${LANGS.length} languages`);
