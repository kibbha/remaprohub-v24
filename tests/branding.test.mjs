import assert from 'node:assert/strict';
import fs from 'node:fs';

const icon=fs.readFileSync(new URL('../assets/icon.svg',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
const manifest=JSON.parse(fs.readFileSync(new URL('../manifest.webmanifest',import.meta.url),'utf8'));
const workflow=fs.readFileSync(new URL('../.github/workflows/pos-android-validation.yml',import.meta.url),'utf8');
const foreground=fs.readFileSync(new URL('../android-native/remapropos_foreground.xml',import.meta.url),'utf8');
const legacy=fs.readFileSync(new URL('../android-native/ic_launcher_legacy.xml',import.meta.url),'utf8');
const colors=fs.readFileSync(new URL('../android-native/remapropos_colors.xml',import.meta.url),'utf8');

assert.match(icon,/#C75232/);
assert.match(icon,/M392 225/);
assert.doesNotMatch(icon,/<circle/);
assert.match(app,/function posBrandLockup/);
assert.match(app,/assets\/icon\.svg/);
assert.match(app,/brand-wordmark/);
assert.match(css,/\.brand-lockup/);
assert.match(css,/#C75232/);
assert.equal(manifest.theme_color,'#C75232');
assert.ok(manifest.icons.some(x=>x.purpose==='maskable'));
assert.match(workflow,/Apply ReMaPro POS Android branding/);
assert.match(workflow,/ic_launcher_legacy\.xml android\/app\/src\/main\/res\/mipmap-anydpi\/ic_launcher\.xml/);
assert.match(foreground,/M392,225/);
assert.doesNotMatch(foreground,/<inset\b/);
assert.match(legacy,/#C75232/);
assert.match(colors,/#C75232/);
console.log('ReMaPro POS selected initials branding checks passed');

assert.match(foreground,/<!-- POS -->/);
assert.match(foreground,/M250,690h25v120h-25z/);
assert.match(legacy,/<!-- POS -->/);
