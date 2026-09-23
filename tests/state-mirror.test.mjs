import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const store=readFileSync('src/store.js','utf8');
const mirror=readFileSync('src/workspace-storage.js','utf8');
const app=readFileSync('src/app.js','utf8');
const sw=readFileSync('app/sw.js','utf8');
const pack=readFileSync('scripts/package-web.mjs','utf8');

assert.match(mirror,/indexedDB\.open\(DB_NAME,DB_VERSION\)/,'Hub state mirror must use IndexedDB');
assert.match(mirror,/createObjectStore\(STORE,\{keyPath:'key'\}\)/,'mirror snapshots must be keyed by scoped storage key');
assert.match(store,/writeStateMirror\(key,state\)\.catch/,'every synchronous state save must schedule an IndexedDB mirror');
assert.match(store,/export async function restoreStateMirror/,'store must expose asynchronous mirror recovery');
assert.match(store,/deleteStateMirror\(key\)/,'reset must clear the persistent mirror');
assert.match(app,/storage\.mirror_recovered/,'mirror recovery must be observable');
assert.match(app,/await restoreStateMirror\(state\)/,'cloud-scoped state must recover after scope selection');
assert.match(sw,/["'](?:\.\/)?src\/workspace-storage\.js["']/,'mirror runtime must be available offline');
assert.match(pack,/readdir\(source/,'web package must discover runtime modules dynamically');
assert.match(pack,/moduleFiles\.map\(name=>'src\/'\+name\)/,'web package must include every runtime module');
console.log('Hub IndexedDB state mirror and recovery wiring OK');
