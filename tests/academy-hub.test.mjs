import assert from 'node:assert/strict';import fs from 'node:fs';
const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const pack=fs.readFileSync(new URL('../scripts/package-web.mjs',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../app/sw.js',import.meta.url),'utf8');
for(const token of ['renderAcademyCenter','academyContextHelp','refreshAcademyProgress','remapro-academy','academy-manager-visibility','startAcademyTour'])assert.ok(app.includes(token),token);
assert.ok(pack.includes("'academy-content.js'"));assert.ok(pack.includes("'academy.js'"));
assert.ok(sw.includes("./src/academy-content.js"));assert.ok(sw.includes("./src/academy.js"));
console.log('Hub Academy integration checks passed');