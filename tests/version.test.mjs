import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const pkg=JSON.parse(readFileSync('package.json','utf8'));
const app=readFileSync('src/app.js','utf8');
assert.match(app,new RegExp(`const APP_VERSION='${pkg.version.replaceAll('.','\\.')}'`));
assert.match(app,/versionLabel.*APP_VERSION/);
const dir=mkdtempSync(join(tmpdir(),'remapro-version-')),file=join(dir,'build.gradle');
try{writeFileSync(file,'android { defaultConfig {\n  versionCode 1\n  versionName "1.0"\n}}');execFileSync(process.execPath,['scripts/stamp-android-version.mjs',file],{env:{...process.env,GITHUB_RUN_NUMBER:'42'}});const gradle=readFileSync(file,'utf8');assert.match(gradle,/versionCode 270042/);assert.match(gradle,/versionName "27\\.2\\.0"/)}finally{rmSync(dir,{recursive:true,force:true})}
const workflow=readFileSync('.github/workflows/android.yml','utf8');assert.ok(workflow.indexOf('Stamp Android version')<workflow.indexOf('npx cap sync android'));
console.log('Displayed and Android package versions agree OK');
