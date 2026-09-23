import assert from 'node:assert/strict';
import fs from 'node:fs';

const layout=fs.readFileSync(new URL('../src/layout.js',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');

assert.ok(layout.includes('export function itemForButton'));
assert.ok(layout.includes('layoutStandalone:true'));
assert.ok(app.includes('itemForButton(button,catalog)'));
assert.ok(app.includes('catalog_item_id:product.layoutStandalone?null:product.id'));
assert.ok(app.includes('quick:!!product.layoutStandalone'));
assert.ok(app.includes("p.layoutStandalone?' · POS':''"));
assert.ok(app.includes("Cette touche POS est incomplète"));
console.log('Standalone POS button sale path checks passed');
