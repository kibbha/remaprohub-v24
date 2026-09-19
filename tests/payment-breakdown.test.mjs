import assert from 'node:assert/strict';
import {PAYMENT_METHODS,EXPENSE_CATEGORIES,paymentTotal,recordDetailedFinance,recordExpenseEntry,removeExpenseEntry,recordOrder,removeOrder,recordPurchase,removePurchase} from '../src/store.js';
globalThis.localStorage={getItem(){return null},setItem(){},removeItem(){}};

for(const method of ['cash','visa','mastercard','amex','maestro','twint','applePay','googlePay','paypal','bankTransfer','mealVoucher','giftVoucher','deliveryPlatform','otherCard','other'])assert.ok(PAYMENT_METHODS.includes(method),method);
for(const category of ['purchases','payroll','rent','utilities','fees','maintenance','marketing','transport','taxes','insurance','staffMeals','tipsPaid','other'])assert.ok(EXPENSE_CATEGORIES.includes(category),category);
assert.equal(paymentTotal({cash:100,visa:50,mastercard:25}),175);
assert.equal(paymentTotal({card:20,vouchers:10}),30,'legacy payment buckets migrate');

const state={financeHistory:[],expenseEntries:[],orders:[],purchases:[],revenue:0,covers:0,expenses:0};
let day=recordDetailedFinance(state,{date:'2026-09-19',covers:10,payments:{cash:100,visa:50,mastercard:25}});
assert.equal(day.manualRevenue,175);
assert.equal(day.revenue,175);
assert.equal(state.financeHistory.length,1);

const sale=recordOrder(state,{reference:'T1',amount:40,status:'paid',date:'2026-09-19',paymentMethod:'twint'});
assert.equal(sale.paymentMethod,'twint');
assert.equal(state.financeHistory[0].orderRevenue,40);
assert.equal(state.financeHistory[0].manualRevenue,135,'closing residual must shrink when a paid order is added');
assert.equal(state.financeHistory[0].revenue,175,'paid order must not double-count an existing closing');

assert.ok(recordExpenseEntry(state,{date:'2026-09-19',category:'utilities',amount:20,method:'visa',note:'Electricity'}));
assert.equal(state.financeHistory[0].expenseEntryExpenses,20);
assert.equal(state.financeHistory[0].expenses,20);
recordPurchase(state,{supplier:'Supplier',date:'2026-09-19',amount:30,note:'Food'});
assert.equal(state.financeHistory[0].purchaseExpenses,30);
assert.equal(state.financeHistory[0].expenses,50);

day=recordDetailedFinance(state,{date:'2026-09-19',covers:12,payments:{cash:80,mastercard:70}});
assert.equal(state.financeHistory.length,1,'same day detailed closing must update');
assert.equal(day.manualRevenue,110);
assert.equal(day.orderRevenue,40,'paid orders must survive closing update');
assert.equal(day.revenue,150,'closing total is authoritative');
assert.equal(day.expenses,50,'expense sources must survive revenue update');
assert.equal(day.paymentDifference,0);

assert.ok(removeExpenseEntry(state,0));
assert.equal(state.financeHistory[0].expenseEntryExpenses,0);
assert.equal(state.financeHistory[0].expenses,30);
assert.ok(removeOrder(state,0));
assert.equal(state.financeHistory[0].orderRevenue,0);
assert.equal(state.financeHistory[0].revenue,150,'closing total must survive order deletion');
assert.ok(removePurchase(state,0));
assert.equal(state.financeHistory[0].purchaseExpenses,0);

console.log('Detailed payment and expense reconciliation OK');
