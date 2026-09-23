import assert from 'node:assert/strict';
import fs from 'node:fs';
const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const academy=fs.readFileSync(new URL('../src/academy.js',import.meta.url),'utf8');
const pack=fs.readFileSync(new URL('../scripts/package-web.mjs',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../app/sw.js',import.meta.url),'utf8');
const packagedApp=fs.readFileSync(new URL('../app/src/app.js',import.meta.url),'utf8');
const packagedAcademy=fs.readFileSync(new URL('../app/src/academy.js',import.meta.url),'utf8');
for(const token of ['renderAcademyCenter','academyContextTopics','academyContextHelp','academyContextCopied','refreshAcademyProgress','remapro-academy','academy-manager-visibility','startAcademyTour','academy-copy-context'])assert.ok(app.includes(token),token);
assert.ok(app.includes("scope:'all'"),'cross-app scope');
assert.ok(app.includes('canManageVisibility:cloudOrgAdmin()'),'visibility admin guard');
assert.ok(app.includes('hubAcademyAutoRows'),'automatic onboarding progress');
assert.ok(academy.includes('academy-onboarding'),'first steps onboarding');
assert.ok(academy.includes('Guide mis à jour'),'stale content warning');
assert.match(pack,/readdir\(source/);assert.match(pack,/moduleFiles\.map\(name=>'\.\/src\/'\+name\)/);
assert.match(sw,/["'](?:\.\/)?src\/academy-content\.js["']/);assert.match(sw,/["'](?:\.\/)?src\/academy\.js["']/);
assert.equal(packagedApp,app,'packaged Hub app matches source');
assert.equal(packagedAcademy,academy,'packaged Academy matches source');
console.log('Hub Academy integration and packaged runtime checks passed');

const i18n=fs.readFileSync(new URL('../src/i18n.js',import.meta.url),'utf8');
for(const lang of ['fr','en','de','it'])assert.ok(i18n.includes('academyContextHelp:'),lang+' contextual help key');
assert.ok(app.includes("t('academyContextHelp')"));
assert.ok(app.includes("t('academyContextCopied')"));

assert.match(sw,/const CACHE='remaprohub-v27-shell-[^']+';/,'Hub service worker cache must be versioned');
