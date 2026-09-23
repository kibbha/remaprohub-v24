import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {catalogue} from '../src/i18n.js';

const storage=new Map();
globalThis.localStorage={
  getItem:key=>storage.get(key)??null,
  setItem:(key,value)=>storage.set(key,String(value)),
  removeItem:key=>storage.delete(key)
};

const security=await import('../src/security.js');
assert.equal(security.validDeveloperAlias('romain-dev'),true);
assert.equal(security.validDeveloperAlias('ab'),false);
assert.equal(security.validDeveloperAlias('romain dev'),false);

const saved=await security.saveDeveloperAccess({alias:'Romain-DEV',email:'Owner@Example.com',enabled:true});
assert.deepEqual(saved,{enabled:true,alias:'romain-dev',email:'owner@example.com'});
const raw=storage.get('rmp.security.developer');
assert.ok(raw);
assert.doesNotMatch(raw,/password|secret/i,'developer shortcut must never store a password');
const loaded=await security.loadDeveloperAccess();
assert.deepEqual(loaded,saved);
assert.equal(security.developerAliasMatches('ROMAIN-dev',loaded),true);
assert.equal(security.developerAliasMatches('other-dev',loaded),false);
await security.clearDeveloperAccess();
assert.equal(await security.loadDeveloperAccess(),null);

const app=readFileSync('src/app.js','utf8');
const securitySource=readFileSync('src/security.js','utf8');
const pkg=JSON.parse(readFileSync('package.json','utf8'));
assert.equal(pkg.version,'27.11.0');
assert.match(app,/APP_VERSION='27\.11\.0'/);
assert.match(app,/id="developerLoginForm"/);
assert.match(app,/id="developerAccessForm"/);
assert.match(app,/developerAliasMatches\(developerId,developerAccess\)/);
assert.match(app,/saveDeveloperAccess\(\{alias,email,enabled:true\}\)/);
assert.match(app,/Promise\.all\(\[initializeCloudSessionStorage\(\),loadDeveloperAccess\(\),restoreStateMirror\(state\)\]\)/);
assert.match(app,/orgAdmin&&session\?card\(t\('developerAccess'\),developerForm\)/);
assert.doesNotMatch(securitySource,/password\s*[:=]/i,'security module must not persist a developer password');

for(const lang of ['fr','en','de','it']){
  const c=catalogue(lang);
  for(const key of ['developerAccess','enableDeveloperAccess','developerId','developerSignIn','developerAccessDeviceOnly'])assert.ok(c[key],`${lang}/${key} missing`);
}
console.log('V27.10.1 device-local developer alias login guards OK');
