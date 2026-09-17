import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
function body(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const open = source.indexOf('{', start); let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`${name} is unbalanced`);
}
const applyLanguage = body('applyLanguage');
assert.match(applyLanguage, /\[data-nav\]/, 'desktop navigation must be localized semantically');
assert.match(applyLanguage, /\[data-mnav\]/, 'mobile navigation must be localized semantically');
assert.match(applyLanguage, /pageTitle/, 'page title must follow the active language');
assert.match(applyLanguage, /pageSub/, 'page subtitle must follow the active language');
const dynamic = body('observeDynamicTranslations');
assert.match(dynamic, /MutationObserver/, 'dynamic DOM insertions must be observed');
assert.match(dynamic, /childList:true,subtree:true/, 'nested innerHTML content must be covered');
assert.match(body('openModal'), /translateDynamicContent\(modal\)/, 'innerHTML modal content must be translated immediately');
assert.match(body('enterApp'), /renderAll\(\)/, 'reopening the app must render the persisted language');
assert.match(body('loadState'), /preferences\.language/, 'language must load from persisted preferences');
console.log('I18N DOM integration checks passed.');
