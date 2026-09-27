import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration=readFileSync('supabase/migrations/20260927092000_ai_monthly_budget_per_restaurant.sql','utf8');
const ai=readFileSync('supabase/functions/remapro-ai/index.ts','utf8');
const delivery=readFileSync('supabase/functions/remapro-delivery-ai/index.ts','utf8');
const support=readFileSync('supabase/functions/remapro-support/index.ts','utf8');
const runtime=readFileSync('supabase/functions/remapro-agent-runtime/index.ts','utf8');
const app=readFileSync('src/app.js','utf8');
const i18n=readFileSync('src/i18n.js','utf8');

for(const token of [
  'budget_micros bigint not null default 15000000',
  'spent_micros + reserved_micros <= budget_micros',
  'ai_budget_reserve','ai_budget_commit','ai_budget_release','ai_budget_status',
  'for update','AI_COST_EXCEEDED_RESERVATION',
  'revoke all on public.ai_usage_months, public.ai_usage_events from public, anon, authenticated',
  'aiMonthlyBudgetChfPerRestaurant'
]) assert.ok(migration.includes(token),'Missing AI budget migration token: '+token);

for(const token of [
  'withSupabase({auth:"user"}','AI_MONTHLY_BUDGET_EXHAUSTED','ai_budget_reserve',
  'ai_budget_commit','max_output_tokens','restaurantId','remainingChf'
]) assert.ok(ai.includes(token),'Hub AI budget enforcement missing: '+token);

for(const token of [
  'p_source:"delivery_scan"','deliveryReserveMicros','ai_budget_reserve',
  'ai_budget_commit','max_output_tokens:2500','AI_MONTHLY_BUDGET_EXHAUSTED'
]) assert.ok(delivery.includes(token),'Delivery AI budget enforcement missing: '+token);

for(const token of [
  'p_source:"support_ai"','reserveSupportBudget','commitSupportBudget',
  'budgetExhausted','ticket reste disponible pour traitement','max_output_tokens:1500'
]) assert.ok(support.includes(token),'Support AI budget enforcement missing: '+token);

assert.doesNotMatch(runtime,/ai_budget_reserve/,'Internal training/simulation agents must not consume a restaurant customer quota');

for(const token of [
  "restaurantId:cloudRestaurantId()","aiMonthlyBudget","aiBudgetRemaining",
  "action:'usage'","aiBudgetExhausted"
]) assert.ok(app.includes(token),'Hub AI budget UI missing: '+token);

for(const token of ['aiMonthlyBudget','aiBudgetUsed','aiBudgetRemaining','aiBudgetLimitHint','aiBudgetExhausted'])
  assert.ok(i18n.includes(token),'AI budget translation key missing: '+token);

console.log('AI monthly CHF 15 per-establishment budget guards OK');
