import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
const releaseLanguages = ['fr', 'en', 'es', 'de', 'it', 'pt'];

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must be declared`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`${name} body is not balanced`);
}

const selectors = { appLanguage: { value: '' }, profileLanguage: { value: '' } };
const writes = new Map();
const events = [];
let renders = 0;
const context = vm.createContext({
  I18N: Object.fromEntries(['fr', 'en', 'de', 'it', 'es', 'pt', 'nl', 'zh'].map(language => [language, {}])),
  state: { preferences: { language: 'fr' }, user: { name: 'Test' } },
  localStorage: { setItem: (key, value) => writes.set(key, value) },
  document: {
    documentElement: { lang: 'fr' },
    getElementById: id => id === 'onboarding' ? { classList: { contains: () => false } } : selectors[id] ?? null,
  },
  __translationCache: new Map([['stale', 'value']]),
  __translationReverse: new Map(),
  renderAll: () => { renders += 1; },
  renderOnboarding: () => { throw new Error('closed onboarding must not render'); },
  CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init.detail; } },
  window: { dispatchEvent: event => events.push(event) },
  console,
});
vm.runInContext(extractFunction('setAppLanguage'), context);

for (const language of releaseLanguages) {
  context.setAppLanguage(language);
  assert.equal(context.state.preferences.language, language);
  assert.equal(context.document.documentElement.lang, language);
  assert.equal(selectors.appLanguage.value, language);
  assert.equal(selectors.profileLanguage.value, language);
  assert.equal(JSON.parse(writes.get('remaprohub-data')).preferences.language, language);
  assert.equal(writes.get('remaprohub-language'), language, 'local language mirror must follow canonical preference');
  assert.equal(events.at(-1).detail.language, language);
}
assert.equal(renders, releaseLanguages.length, 'each release language change must render exactly once');
assert.equal(context.__translationCache.size, 0, 'translation cache must be invalidated');
for (const unsupported of ['nl', 'zh', 'unsupported']) {
  context.setAppLanguage(unsupported);
  assert.equal(context.state.preferences.language, 'fr', `${unsupported} must fall back to French in this release`);
  assert.equal(writes.get('remaprohub-language'), 'fr', 'fallback language must also be persisted');
}
console.log('I18N six-language runtime behavior checks passed.');
