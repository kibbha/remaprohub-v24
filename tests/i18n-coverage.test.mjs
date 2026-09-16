import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
const start = source.indexOf('const I18N=');
const end = source.indexOf(';\nconst ONBOARDING_T=', start);
assert.ok(start >= 0 && end > start, 'I18N catalogue must be declared');
const I18N = vm.runInNewContext(`(${source.slice(start + 11, end)})`);
const languages = ['fr', 'en', 'de', 'it', 'es', 'pt', 'nl', 'zh'];
const semanticKeys = ['dashboard', 'operations', 'stock', 'recipes', 'haccp', 'staff', 'hr', 'documents', 'compliance', 'purchases', 'traceability', 'waste', 'reservations', 'finance', 'settings', 'account', 'greeting', 'today', 'personal', 'general', 'language', 'notifications', 'updates', 'about'];
assert.deepEqual(Object.keys(I18N), languages);
for (const language of languages) {
  for (const key of semanticKeys) assert.equal(typeof I18N[language][key], 'string', `${language}.${key} must be translated`);
  assert.equal(Object.keys(I18N[language]).length, semanticKeys.length, `${language} semantic catalogue must be complete`);
}
for (const language of languages.slice(1)) {
  const localized = semanticKeys.filter(key => I18N[language][key] !== I18N.fr[key]);
  assert.ok(localized.length >= 20, `${language} must localize the semantic UI, got ${localized.length}/${semanticKeys.length}`);
}
console.log('I18N semantic coverage checks passed.');
