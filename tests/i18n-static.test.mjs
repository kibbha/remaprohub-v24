import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../.github/workflows/install-v26-0-1.yml', import.meta.url), 'utf8');
const buildWorkflow = readFileSync(new URL('../.github/workflows/build-android-v26-0-1.yml', import.meta.url), 'utf8');

function count(pattern, text = source) {
  return [...text.matchAll(pattern)].length;
}

function functionBody(name) {
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

const setLanguage = functionBody('setAppLanguage');
for (const language of ['fr', 'en', 'de', 'it', 'es', 'pt', 'nl', 'zh']) {
  assert.match(source, new RegExp(`(?:const|let) I18N=\\{[^]*?\\b${language}:\\{`), `I18N must support ${language}`);
}
assert.equal(count(/function\s+setAppLanguage\s*\(/g), 1, 'there must be one setAppLanguage implementation');
for (const preservedFunction of ['logoutLocal', 'checkForUpdates', 'applyWebUpdate', 'saveCloudConfig', 'disconnectCloud', 'exportData', 'importData', 'ensureSubscriptionState']) {
  assert.equal(count(new RegExp(`function\\s+${preservedFunction}\\s*\\(`, 'g')), 1, `${preservedFunction} must remain available`);
}
assert.equal(count(/function\s+bindLanguageSelectors\s*\(/g), 0, 'legacy selector binders must be removed');
assert.equal(count(/addEventListener\(\s*['"]change['"]/g), 1, 'there must be one change listener');
assert.equal(count(/<select\b[^>]*(?:id=["'](?:appLanguage|profileLanguage)["'])[^>]*\bonchange\s*=/gi), 0, 'language selectors must not use inline onchange');
assert.doesNotMatch(setLanguage, /location\.(?:replace|href|reload)/, 'setAppLanguage must not navigate or reload');
assert.doesNotMatch(setLanguage, /state\.user\.language/, 'preferences.language is the only language source of truth');
assert.match(setLanguage, /state\.preferences\.language=lang/, 'setAppLanguage must persist the canonical preference');
assert.match(setLanguage, /renderAll\(\)/, 'setAppLanguage must rerender the application');
assert.match(source, /semanticI18NTable\(\)/, 'semantic I18N entries must feed translateString');
assert.match(source, /querySelectorAll\('\[data-mnav\]'\)/, 'mobile navigation must be updated explicitly');
assert.match(source, /function applyFullLanguage\(root=document\.body\)/, 'dynamic content must support scoped translation');
assert.doesNotMatch(source, /rmp_lang/, 'timestamp language URL workaround must be absent');
assert.doesNotMatch(source, /URLSearchParams\(location\.search\)\.get\(['"]lang['"]\)/, 'URL parameters must not override the canonical preference');
assert.doesNotMatch(workflow, /window\.location\.replace\(|searchParams\.set\(['"]rmp_lang|onchange="setAppLanguage\(this\.value\)"/, 'installer workflow must not restore reload-based i18n');
assert.doesNotMatch(buildWorkflow, /window\.location\.replace\(|searchParams\.set\(['"]rmp_lang|onchange="setAppLanguage\(this\.value\)"/, 'Android build workflow must not require reload-based i18n');
console.log('I18N static architecture checks passed.');
