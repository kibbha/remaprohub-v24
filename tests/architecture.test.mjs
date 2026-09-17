import assert from'node:assert/strict';import{readFileSync}from'node:fs';
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');const i18n=readFileSync(new URL('../src/i18n.js',import.meta.url),'utf8');const store=readFileSync(new URL('../src/store.js',import.meta.url),'utf8');
assert.match(app,/\bt\('dashboard'\)/);assert.match(app,/\bt\('finance'\)/);assert.match(app,/\bt\('haccp'\)/);assert.match(app,/\bt\('documents'\)/);
assert.doesNotMatch(app,/applyFullLanguage|MutationObserver|translateRenderedHTML|canonicalTranslation|location\.replace/);
assert.match(app,/import\{load,save\}from'\.\/store\.js'/);assert.match(store,/localStorage\.setItem/);
for(const lang of ['fr','en','de','it','es','pt'])assert.match(i18n,new RegExp(`\\b${lang}\\b`));
console.log('V27 clean architecture checks passed');