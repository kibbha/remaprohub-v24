import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {csv,accountingIntegrationProfiles,posAccountingSheets,hubPurchaseSheet,accountingCsv} from '../src/accounting.js';

const edge=readFileSync('supabase/functions/remapro-pos-sync/index.ts','utf8');
const pos=readFileSync('src/pos.js','utf8');
const app=readFileSync('src/app.js','utf8');
const pack=readFileSync('scripts/package-web.mjs','utf8');
assert.ok(edge.includes('action==="accounting_export"'),'POS accounting export action missing');
assert.ok(edge.includes('taxSummary'),'VAT summary missing');
assert.ok(edge.includes('paymentSummary'),'payment method summary missing');
assert.ok(edge.includes('refundTaxAllocation'),'partial refund VAT review note missing');
assert.ok(edge.includes('"accounting_export"'),'accounting export must bypass operator PIN and require manager itself');
assert.ok(pos.includes('loadPosAccountingExport'),'Hub POS accounting bridge missing');
assert.ok(app.includes('accountingExportForm'),'Hub accounting export UI missing');
assert.ok(app.includes('data-accounting-export'),'Accounting download actions missing');
assert.ok(pack.includes("'accounting.js'"),'accounting.js must ship in packaged runtime');

const data={restaurant:{currency:'CHF'},range:{from:'2026-09-01',to:'2026-09-30'},orders:[{id:'o1',business_date:'2026-09-10',receipt_number:'R-1',status:'paid',service_type:'table',covers:2,subtotal:100,tax_total:8.1,total:108.1,tip_total:5,currency:'CHF'}],taxSummary:[{taxRate:8.1,net:100,tax:8.1,gross:108.1}],paymentSummary:[{method:'twint',amount:113.1}],refunds:[]};
const sheets=posAccountingSheets(data);assert.equal(sheets.sales.length,1);assert.equal(sheets.vat[0].tax,8.1);assert.equal(sheets.payments[0].method,'twint');
const state={purchases:[{date:'2026-09-02',supplier:'S',amount:10,note:'A'}],invoices:[{date:'2026-09-03',supplier:'I',reference:'INV',amount:20,status:'paid'}]};assert.equal(hubPurchaseSheet(state,'2026-09-01','2026-09-30').length,2);
assert.ok(accountingCsv('sales',{pos:data}).startsWith('\uFEFFdate;receipt'));
assert.ok(csv([{a:'x;y'}],['a']).includes('"x;y"'));
const profiles=accountingIntegrationProfiles();assert.ok(profiles.some(x=>x.id==='bexio'&&x.status==='prepared'));assert.ok(profiles.some(x=>x.id==='abacus'));
console.log('Swiss accounting export and adapter preparation checks passed');
