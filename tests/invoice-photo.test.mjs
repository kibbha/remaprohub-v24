import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {integrateInvoiceReceipt,stockAvailable} from '../src/store.js';

const state={
  suppliers:[],
  invoices:[],
  purchases:[],
  stock:[{id:'milk',name:'Milk',unit:'l',qty:2,price:1,min:1,preferredSupplier:'Legacy Dairy'}],
  deliveries:[],
  waste:[],
  financeHistory:[],
  revenue:0,covers:0,expenses:0
};

const result=integrateInvoiceReceipt(state,{
  supplier:'Metro',
  reference:'F-100',
  date:'2026-09-18',
  items:[
    {name:'Milk',quantity:3,unit:'l',unitPrice:1.2},
    {name:'Bread',quantity:5,unit:'piece',unitPrice:0.8}
  ]
});
assert.ok(result);
assert.equal(result.total,7.6);
assert.equal(state.suppliers.length,1);
assert.equal(state.suppliers[0].name,'Metro');
assert.equal(state.invoices.length,1);
assert.equal(state.invoices[0].reference,'F-100');
assert.equal(state.invoices[0].status,'pending');
assert.equal(state.invoices[0].amount,7.6);
assert.equal(state.purchases.length,1);
assert.equal(state.purchases[0].amount,7.6);
assert.equal(state.financeHistory[0].expenses,7.6);
assert.equal(state.deliveries.length,2);
assert.ok(state.deliveries.every(x=>x.status==='accepted'&&x.lot==='F-100'));

const milk=state.stock.find(x=>x.name==='Milk');
const bread=state.stock.find(x=>x.name==='Bread');
assert.equal(milk.price,1.2);
assert.equal(stockAvailable(state,milk),5);
assert.equal(bread.qty,0);
assert.equal(bread.price,0.8);
assert.equal(bread.preferredSupplier,'Metro');
assert.equal(milk.preferredSupplier,'Legacy Dairy','invoice import must not overwrite an explicit preferred supplier');
assert.equal(stockAvailable(state,bread),5);

const snapshot=JSON.stringify(state);
assert.equal(integrateInvoiceReceipt(state,{
  supplier:'Metro',reference:'F-100',date:'2026-09-18',
  items:[{name:'Milk',quantity:1,unit:'l',unitPrice:1.3}]
}),false);
assert.equal(JSON.stringify(state),snapshot,'duplicate invoice must not mutate state');

assert.equal(integrateInvoiceReceipt(state,{
  supplier:'Metro',reference:'F-101',date:'2026-09-18',
  items:[{name:'Milk',quantity:0,unit:'l',unitPrice:1.3}]
}),false);

const app=readFileSync('src/app.js','utf8');
assert.match(app,/id="invoicePhotoInput"/);
assert.match(app,/action:'invoice-photo'/);
assert.match(app,/id="invoiceReviewForm"/);
assert.match(app,/integrateInvoiceReceipt\(state,/);
assert.match(app,/item_use_/);
console.log('Invoice photo review and stock/purchasing integration OK');
