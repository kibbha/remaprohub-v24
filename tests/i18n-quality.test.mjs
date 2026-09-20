import assert from 'node:assert/strict';
import {catalogue,LANGS} from '../src/i18n.js';
assert.deepEqual(LANGS,['fr','en','de','it']);
const en=catalogue('en'),de=catalogue('de'),it=catalogue('it');
const critical=['recipeUnlimitedHint','haccpImmutableHint','notificationsNativeOnly','payslip','employmentContract','payrollCalculationHint','swissPayrollSettings','swissPayrollCalculator','verifyLpp','verifyAccident','ccntMinimumWarning','paymentBreakdownHint','workingDays','publicHolidays','exportPdf','forecastRisk'];
for(const key of critical){assert.ok(de[key]&&it[key],key+' missing');assert.notEqual(de[key],en[key],key+' German still English');assert.notEqual(it[key],en[key],key+' Italian still English')}
assert.match(de.swissPayrollSettings,/Schweiz|Schweizer/);
assert.match(it.swissPayrollSettings,/Svizzera/);
console.log('DE/IT advanced screens no longer fall back to English OK');
