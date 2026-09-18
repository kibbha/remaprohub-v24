import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync('app/styles.css','utf8');
assert.match(css,/html\[data-theme="dark"\] \.periods\{[^}]*background:#2a241f[^}]*border-color:#463c33/);
assert.match(css,/html\[data-theme="dark"\] \.periods button\.active\{[^}]*background:#514337[^}]*color:#fff/);
assert.match(css,/html\[data-theme="dark"\] \.document-preview\{[^}]*background:#2c2722[^}]*color:#f3eadf/);
assert.match(css,/html\[data-theme="dark"\] \.btn\.danger\{[^}]*color:#ffb4a8/);
for(const kind of ['info','warning','urgent'])assert.match(css,new RegExp(`html\\[data-theme="dark"\\] \\.status-${kind}\\{`));
console.log('Dark theme contrast guards OK');
