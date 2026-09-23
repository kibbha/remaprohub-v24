import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {customerDisplaySnapshot,hardwareExtensionProfiles} from '../src/customer-display.js';

const snap=customerDisplaySnapshot({restaurant:{name:'Demo'},currency:'CHF',cart:[{id:'1',name:'Bao',qty:2,price:8.5},{id:'2',name:'Tea',qty:1,price:4}],tableLabel:'T4',covers:2});
assert.equal(snap.restaurantName,'Demo');assert.equal(snap.items.length,2);assert.equal(snap.total,21);assert.equal(snap.tableLabel,'T4');
const profiles=hardwareExtensionProfiles();assert.ok(profiles.some(x=>x.id==='customer_display'&&x.status==='ready'));assert.ok(profiles.some(x=>x.id==='scale'&&x.status==='prepared'));
const app=readFileSync('src/app.js','utf8'),prepare=readFileSync('scripts/prepare-web.mjs','utf8');
assert.ok(app.includes('publishCustomerDisplay(customerDisplaySnapshot'),'POS must publish cart snapshots');
assert.ok(app.includes('customer-display.html'),'POS must open customer display');
assert.ok(app.includes('hardwareExtensionProfiles'),'hardware registry UI missing');
assert.ok(prepare.includes('customer-display.html'),'customer display page must ship in web runtime');
console.log('Customer display and hardware extension preparation checks passed');
