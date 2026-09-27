import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {mergePosFinance,todayTicketCount} from '../src/service-overview.js';
const state={financeHistory:[{date:'2026-09-25',revenue:100,covers:2,expenses:30}],orders:[{date:'2026-09-24',status:'paid'},{date:'2026-09-25',status:'paid'},{date:'2026-09-25',status:'open'}]};
const snapshot={restaurantId:'a',rows:[{business_date:'2026-09-25',net_sales:240,covers:6,paid_orders:3}]};
const merged=mergePosFinance(state,snapshot,'a');
assert.equal(merged.financeHistory[0].revenue,340);
assert.equal(merged.financeHistory[0].covers,8);
assert.equal(merged.financeHistory[0].expenses,30);
assert.equal(state.financeHistory[0].revenue,100,'reading must not alter the local ledger');
assert.equal(mergePosFinance(state,snapshot,'a').financeHistory[0].revenue,340,'repeated render must not double count');
assert.equal(mergePosFinance(state,snapshot,'b').financeHistory[0].revenue,100,'restaurant switch must not leak sales');
assert.equal(todayTicketCount(state,snapshot,'a','2026-09-25'),4);
assert.equal(todayTicketCount(state,snapshot,'b','2026-09-25'),1);
assert.equal(mergePosFinance(state,{restaurantId:'a',rows:[{business_date:'2026-09-25',net_sales:-20}]},'a').financeHistory[0].revenue,80,'refund-adjusted negative net must not be clamped');

const refundDateMigration=readFileSync('supabase/migrations/20260927072500_pos_daily_summary_refund_service_date.sql','utf8');
assert.match(refundDateMigration,/join public\.pos_cash_sessions s[\s\S]*s\.business_date/,'Hub daily summary refunds must follow refund cash-session business date');
assert.match(refundDateMigration,/select organization_id,restaurant_id,business_date from refunds/,'refund-only service days must remain visible in Hub daily finance');
assert.match(refundDateMigration,/coalesce\(sa\.gross_sales,0\)-coalesce\(rf\.refund_total,0\)/,'daily net sales must subtract same-day completed refunds');

const closeMigration=readFileSync('supabase/migrations/20260927083000_pos_close_cash_refunds_and_intents.sql','utf8');
assert.match(closeMigration,/v_cash_sales[\s\S]*v_cash_refunds[\s\S]*v_expected:=round\(coalesce\(v_session\.opening_cash,0\)\+coalesce\(v_cash_sales,0\)-coalesce\(v_cash_refunds,0\),2\)/,'cash close must subtract completed cash refunds');
assert.match(closeMigration,/status in \('created','pending','authorized'\)[\s\S]*OPEN_PAYMENT_INTENTS_EXIST/,'cash close must reject unresolved terminal intents');
assert.match(closeMigration,/status='pending_external'[\s\S]*PENDING_REFUNDS_EXIST/,'cash close must reject unresolved external refunds');
assert.match(closeMigration,/'cashRefunds',v_cash_refunds/,'cash close audit event must expose refund cash outflow');

const terminalCancelMigration=readFileSync('supabase/migrations/20260927084500_pos_terminal_authorized_cancel_guard.sql','utf8');
assert.match(terminalCancelMigration,/v_intent\.status='authorized'[\s\S]*AUTHORIZED_INTENT_REQUIRES_PROVIDER_VOID/,'authorized terminal intents must require a provider-confirmed void');
assert.match(terminalCancelMigration,/status not in \('created','pending'\)/,'only pre-authorization terminal intents may be locally cancelled');

console.log('Service dashboard: POS totals, dates, refunds, isolation and non-mutation passed');
