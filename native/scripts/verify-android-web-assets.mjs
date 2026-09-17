import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const nativeDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configSource = readFileSync(resolve(nativeDir, 'capacitor.config.ts'), 'utf8');
const webDirMatch = configSource.match(/\bwebDir\s*:\s*['"]([^'"]+)['"]/);
assert.ok(webDirMatch, 'capacitor.config.ts must declare webDir');
const sourceDir = resolve(nativeDir, webDirMatch[1]);
const sourceIndex = resolve(sourceDir, 'index.html');
const bundledDir = resolve(nativeDir, 'android/app/src/main/assets/public');
const bundledIndex = resolve(bundledDir, 'index.html');
assert.ok(existsSync(sourceIndex), `Capacitor webDir index is missing: ${sourceIndex}`);
assert.ok(existsSync(bundledIndex), `Android bundled index is missing: ${bundledIndex}; run npx cap sync android first`);
const source = readFileSync(sourceIndex);
const bundled = readFileSync(bundledIndex);
const sha256 = value => createHash('sha256').update(value).digest('hex');
assert.equal(sha256(bundled), sha256(source), 'Android index.html differs from the canonical webDir index.html');
const sourceWorker = readFileSync(resolve(sourceDir, 'sw.js'));
const bundledWorker = readFileSync(resolve(bundledDir, 'sw.js'));
assert.equal(sha256(bundledWorker), sha256(sourceWorker), 'Android sw.js differs from the canonical webDir service worker');
const html = bundled.toString('utf8');
for (const marker of ['function isNativeRuntime()', 'registration.unregister()', "key.startsWith('remaprohub-')", 'function setAppLanguage(lang)', 'function translateString(raw,lang)', 'function applyFullLanguage()', 'function applyLanguage()', 'function observeDynamicTranslations()', "state.preferences.language=lang", "const supported=['fr','en','de','it','es','pt','nl','zh']"]) {
  assert.ok(html.includes(marker), `Android index.html is missing i18n runtime marker: ${marker}`);
}
assert.doesNotMatch(html, /location\.(?:replace|href|reload)[^(]*\([^)]*(?:lang|rmp_lang)|[?&](?:lang|rmp_lang)=/, 'Android runtime must not use reload/URL language switching');
assert.equal((html.match(/function\s+setAppLanguage\s*\(/g) || []).length, 1, 'Android bundle must contain exactly one setAppLanguage implementation');
console.log(`Android web assets match ${webDirMatch[1]} (index.html sha256 ${sha256(source)}, sw.js sha256 ${sha256(sourceWorker)}).`);
