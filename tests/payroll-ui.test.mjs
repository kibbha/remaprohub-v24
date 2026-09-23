import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync('src/app.js','utf8');
const restored=readFileSync('src/restored.js','utf8');
const legal=readFileSync('src/legal.js','utf8');
const css=readFileSync('app/styles.css','utf8');

assert.match(app,/swissPayrollVerification\(state\)/);
assert.match(app,/payroll\.save_blocked/);
assert.match(app,/payroll\.export_blocked/);
assert.match(app,/payroll-verification-banner/);
assert.match(app,/payrollExportBlocked/);
assert.match(app,/applyPayrollTotals/);
assert.match(restored,/swissPayrollVerification\(s\)/);
assert.match(restored,/r\.blocked/);
assert.match(restored,/payroll-verification-banner blocked/);
assert.match(legal,/ccntCategory/);
assert.match(legal,/ccntMinimumSalary/);
assert.match(css,/\.payroll-verification-banner\.blocked/);

console.log('Swiss payroll UI and payslip blocking integration OK');
