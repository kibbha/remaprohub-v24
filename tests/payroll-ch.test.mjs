import assert from 'node:assert/strict';
import {calculateSwissPayroll,swissPayrollVerification,updatePayrollSettings,ccntMinimum} from '../src/store.js';

const state={payrollSettings:{reviewedAt:'2026-09-20',federalSource:'official',ccntSource:'official',avsEmployee:4.35,avsEmployer:4.35,aiEmployee:.7,aiEmployer:.7,apgEmployee:.25,apgEmployer:.25,acEmployee:1.1,acEmployer:1.1,acAnnualCeiling:148200,lppEmployee:0,lppEmployer:0,lppVerified:false,accidentEmployee:0,accidentEmployer:0,accidentVerified:false,ccnt:{Ia:3713,Ib:3943,II:4070,IIIa:4528,IIIb:4635,IV:5293,stagiaire:2390,weeklyHours:42,holidayPayPct:10.65,publicHolidayPct:2.27,thirteenthPct:8.33}}};

let verification=swissPayrollVerification(state);
assert.equal(verification.verified,false);
assert.deepEqual(verification.blockers,['TODO_VERIFIER_LPP','TODO_VERIFIER_ACCIDENT']);

let r=calculateSwissPayroll(state,{grossSalary:5000,ahvSubjectSalary:5000,acSubjectSalary:5000});
assert.equal(r.blocked,true);
assert.equal(r.netSalary,undefined);
assert.ok(r.blockers.includes('TODO_VERIFIER_LPP'));
assert.ok(r.blockers.includes('TODO_VERIFIER_ACCIDENT'));
assert.equal(ccntMinimum(state,'IV'),5293);

assert.ok(updatePayrollSettings(state,{lppEmployee:3.5,lppEmployer:3.5,lppVerified:true,accidentEmployee:1.2,accidentEmployer:.4,accidentVerified:true}));
verification=swissPayrollVerification(state);
assert.equal(verification.verified,true);

r=calculateSwissPayroll(state,{grossSalary:5000,ahvSubjectSalary:5000,acSubjectSalary:5000,lppInsuredSalary:3000,accidentSubjectSalary:5000});
assert.equal(r.blocked,false);
assert.equal(r.avsAiApg,265);
assert.equal(r.unemploymentInsurance,55);
assert.equal(r.pensionEmployee,105);
assert.equal(r.accidentEmployee,60);
assert.equal(r.netSalary,4515);
assert.equal(updatePayrollSettings(state,{acEmployee:-1}),false);

console.log('Swiss payroll verification hard-stop and calculations OK');
