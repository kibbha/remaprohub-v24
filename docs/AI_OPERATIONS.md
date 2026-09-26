# ReMaPro AI Operations — phase 1

Phase 1 introduces an authenticated support/triage layer shared by Hub and POS.

Flow:
1. A signed-in restaurant user opens a support ticket from the in-app Academy/Help area.
2. `remapro-support` verifies organization/restaurant membership server-side.
3. The Dispatcher agent classifies category, priority and routing.
4. The Support agent produces the first customer-facing answer.
5. Bug reports run through the Diagnostic agent, then the Hub/POS Developer agent prepares an implementation plan and the QA agent prepares regression/acceptance checks.
6. Feature requests are routed to the Product agent; documentation gaps can be routed to the Knowledge agent.
7. Every agent execution is journaled in `ai_agent_runs`.
8. Sensitive cases create a human-review approval request in `support_approvals`; production changes remain outside automatic execution.

Security boundaries:
- Support tables are server-only; `anon` and `authenticated` have no direct table privileges.
- The Edge Function requires a valid user JWT.
- Platform-wide inbox/update endpoints require the JWT app metadata claim `remapro_platform_role`.
- OpenAI credentials remain in Supabase secrets and are never exposed to Hub/POS.
- GitHub merge/release/deployment is intentionally not automatic in phase 1.

Next phase:
- platform operator console;
- GitHub issue/branch/PR bridge with a least-privilege GitHub App;
- GitHub issue/branch/PR execution bridge using a least-privilege GitHub App;
- automated execution of approved development plans;
- approval gate before merge/release.


## Platform supervision

Users with an Auth app-metadata claim `remapro_platform_role` set to one of
`owner`, `support`, `developer`, `qa`, `release`, or `product` see a protected
**ReMaPro AI Operations** panel in Hub Help/Academy.

The panel reads the global support inbox, recent agent runs and pending human-review
approvals through `remapro-support`. Restaurant accounts cannot call these platform
actions. Approval decisions update the approval record and move the ticket back into
the controlled workflow; they do not merge or deploy code automatically.


## Engineering execution queue

Approved bug tickets now create one row in `ai_engineering_jobs`.

Routing is deterministic:
- Hub -> `rebuild/remaprohub-clean`
- POS -> `pos/remapro-pos`

The job carries the Developer Agent execution plan and QA acceptance plan. The
platform console shows the engineering queue and permits retry/cancel operations.

A pull request is not merge-authorized by the initial bug approval. After the
engineering worker creates a PR and QA succeeds, a separate
`support_approvals.action = merge_pr` approval must be created. Only an explicit
platform-owner approval may move the job to `merge_approved`.

The backend itself has no GitHub merge capability. Execution and merge are performed
by the authorized worker through the GitHub connector, which keeps GitHub credentials
out of Supabase.


## Platform operator authorization

Global AI Operations access is controlled by the server-only
`public.platform_operators` allowlist. Restaurant organization roles such as
`network_admin` do not grant platform access.

The Hub asks `remapro-support` for `platform_context` after authentication and
binds the returned role to the current authenticated user ID. This prevents role
state from leaking across account changes.

The allowlist has RLS enabled, no direct `anon`/`authenticated` privileges, and is
read only by service-role server code. Operator bootstrap records are operational
data and are intentionally not committed to this public repository.


## Bug execution approval

Every diagnosed bug now creates exactly one pending `execute_fix` approval. This is
the human gate that authorizes the engineering worker to prepare code on an isolated
branch. Criticality does not bypass the gate.

The second gate remains independent: after the worker creates a PR and QA succeeds,
the system creates `merge_pr`. Approval of `execute_fix` never authorizes merge.


## Customer support conversations

Hub and POS support surfaces now use the existing authenticated ticket API for a
complete conversation lifecycle. A restaurant user can open one of their authorized
tickets, read the chronological message history, reply with fresh application context,
and mark the ticket resolved.

Replies are re-triaged by the Support/Dispatcher chain so new technical details can
update diagnosis, engineering context and approval state without opening a duplicate
ticket.


### Conversation updates while engineering is active

If a customer adds new details to a bug that already has an active engineering job,
the ticket is re-triaged and its diagnostic context is refreshed, but ReMaPro does not
create a second `execute_fix` approval. The ticket follows the existing engineering
job until completion, cancellation or failure.


## Product improvement execution

Feature requests are routed to the Product Agent, which creates a structured product
brief with the user problem, smallest useful change, risks and measurable acceptance
checks. The QA Agent creates a validation/regression plan for the proposed improvement.

A feature request does not enter engineering automatically. ReMaPro creates one
pending `execute_feature` approval. The platform console displays this as
**Autoriser cette évolution**.

When explicitly approved, the request is queued in `ai_engineering_jobs` on the
application's exact active branch:
- Hub -> `rebuild/remaprohub-clean`
- POS -> `pos/remapro-pos`

The engineering worker receives the Product plan as `execution_plan` and the QA plan
as `qa_plan`. It may prepare a branch and pull request, but the existing independent
`merge_pr` approval remains mandatory before merge. Rejecting `execute_feature`
does not create an engineering job.


## Three-application separation

ReMaPro now has three distinct application surfaces:

- **ReMaPro Hub** — customer restaurant management and in-app support.
- **ReMaPro POS** — customer point of sale and in-app support.
- **ReMaPro Ops** — internal-only platform supervision for ReMaPro operators.

The Hub no longer renders the AI Operations platform console. Its customer-facing
Academy and Support remain available. Global tickets, agent runs, engineering jobs,
approvals and operator replies are handled from ReMaPro Ops.

All three applications continue to use the same authenticated Supabase backend.


## Agent training runtime

ReMaPro keeps agent training data and evaluation history in its own Supabase project instead of coupling production quality gates to an external eval dashboard.

### Versioned profiles

`ai_agent_profiles` stores the current role instructions, candidate model, reasoning effort, knowledge scopes and explicit tool policy for:
- Dispatcher
- Support
- Diagnostic
- Developer Hub
- Developer POS
- QA
- Release
- Product
- Knowledge

Production support reads the active instructions and verified knowledge. The production model remains controlled by the existing support runtime configuration until a candidate model is intentionally promoted after evaluation.

### Knowledge

`ai_knowledge_documents` contains verified ReMaPro architecture, product, support, engineering, QA, release and safety facts. Knowledge can be indexed with 1536-dimensional embeddings; semantic retrieval uses pgvector HNSW and falls back to scoped text knowledge if embeddings are not yet present.

All knowledge tables are server-only. Client APKs never receive service-role credentials.

### Training and evaluation

`ai_training_cases` contains regression scenarios for all nine roles. `ai_evaluation_runs` records the profile version, model, generated answer, rubric result, latency and token usage.

The managed `remapro-agent-runtime` Edge Function exposes platform-operator-only actions:
- training dashboard
- manual agent run
- single training case
- bounded training suite
- knowledge embedding
- owner profile update
- owner/product knowledge maintenance

A training case passes only when the evaluator gives a score of at least 0.80 and reports no safety failure.

### Managed sessions

Training/manual runs use OpenAI Agents API durable sessions with environment `none`. ReMaPro injects only the role instructions, explicit tool policy and verified knowledge. The managed training runtime currently exposes no external execution tools to the model itself.

Real GitHub engineering remains in the separate approval-gated ReMaPro engineering worker:
`execute_fix/execute_feature -> engineering job -> PR/tests -> merge_pr -> merge`.

This separation means training an agent never grants it additional production permissions.


### Evaluation-driven tuning v2

The first full 18-case suite produced four failures. Tuning v2 changes only the affected roles:
- Dispatcher: canonical routing fields and explicit POS/Hub developer routes.
- Developer POS: mandatory payment + offline regression coverage for payment/table/order changes.
- QA: concrete reproduction scenario required before happy-path/regression planning.
- Support: use exact verified UI procedures when documented; otherwise state uncertainty instead of inventing UI.

Verified knowledge was added for the Hub Support UI, POS regression matrix, QA reproduction structure and Dispatcher routing contract. The training runtime now merges semantic retrieval with recent scoped knowledge so newly updated verified documents are immediately available before their embeddings are refreshed.


## Simulation Lab

ReMaPro Ops includes a pre-production simulation environment for training the agent team on realistic restaurant situations before market launch.

### Simulation boundaries

Synthetic scenarios are stored separately from real customer support data:
- `ai_simulation_campaigns`
- `ai_simulation_scenarios`
- `ai_simulation_runs`
- `ai_simulation_findings`

All tables are server-only with RLS enabled and direct `anon` / `authenticated` access revoked.

Simulation execution never writes to:
- `support_tickets`
- `support_messages`
- `ai_engineering_jobs`
- GitHub branches or pull requests
- production deployment/release surfaces

Managed agent sessions run with `environment: none` and no execution tools.

### Scenario generation

A campaign defines:
- target case count (1–5000)
- maximum executed cases per UTC day
- generation batch size
- Hub/POS coverage
- FR/EN/DE/IT
- easy/normal/hard/critical difficulty
- standard/difficult/edge/multilingual/chaos modes

The generator uses verified ReMaPro knowledge and recent campaign scenarios to produce materially different synthetic restaurant tickets without real personal data, passwords, API keys or payment-card data. A SHA-256 fingerprint prevents exact duplicates.

### Agent chain and scoring

Every simulation starts with Dispatcher. The chain then follows the case:
- question → Support or Knowledge
- bug → Diagnostic → Developer Hub/POS → QA
- feature → Product → QA
- billing/account/other → Support
- Release/Knowledge/Product/QA can be explicitly added by the expected route

A knowledge-aware evaluator scores every participating role. Overall pass requires:
- overall score >= 0.80
- no safety failure
- every essential participating role >= 0.80

Failures create `ai_simulation_findings` with role, severity, category and suggested improvement. Findings can be explicitly promoted into permanent `ai_training_cases`; they are never auto-promoted.

### Cost and pacing controls

Each campaign has a daily execution cap and a batch size. ReMaPro Ops can run an **Auto** loop while the Ops app remains open. Auto mode generates more scenarios when needed and executes one scenario at a time. It stops for the current app session when the daily cap is reached.

This preserves cost control and avoids long mobile/Edge Function batches. Server-side unattended scheduling can be added later without changing the simulation data model.


### Unattended server worker

Simulation campaigns can continue without ReMaPro Ops remaining open.

The production project runs a Supabase Cron tick every 20 minutes. The cron invokes
`remapro-agent-runtime` with a dedicated random worker token stored only in
Supabase Vault. The runtime stores only the SHA-256 token hash in the server-only
`ai_simulation_worker_auth` table and refuses the worker action unless the
custom header matches.

The runtime accepts two authentication paths:
- normal Ops requests: verified user JWT + platform-operator authorization;
- `simulation_worker_tick`: custom worker token, no user privileges.

The Edge Function platform JWT precheck is disabled for this mixed-auth endpoint,
while `@supabase/server` continues to validate normal user JWT calls internally.

Each server tick handles at most one campaign. It generates a batch when the queue
is empty or executes one queued simulation. The campaign daily execution cap is
still enforced by `runSimulationBatch`, so the cron cannot bypass cost pacing.

No worker credential is committed to GitHub or shipped in an APK.


### Simulation learning loop

Simulation findings are triaged by severity:
- high and medium findings can be promoted into permanent `ai_training_cases`;
- low findings stay observational until repeated or manually promoted;
- technical errors are resolved separately from model-quality findings.

Learning round 1 generalized the first simulation findings into versioned agent guidance:
- Dispatcher separates diagnosis/routing from true human-review and approval requirements.
- Support handles sensitive billing with data minimization and no refund promises before human verification.
- Diagnostic and Developer Hub request non-sensitive business-object identifiers and distinguish persistence, derived calculation and stale display.
- Product includes offline/stale-data, sync-conflict and role-permission risks when relevant.

Verified learning documents are added to `ai_knowledge_documents`. The unattended worker indexes up to five newly unembedded documents before resuming simulation work, so new knowledge becomes semantic-searchable without a manual Ops indexing step.

Round 1 profile versions after promotion: Dispatcher v3, Support v3, Diagnostic v2, Developer Hub v2, Product v2.


### Simulation learning round 2

Round 2 targets two repeated pre-launch weaknesses plus the permissions scenario:
- Dispatcher distinguishes POS payment-state incidents from account/subscription billing disputes. A technical payment-state bug may remain `requires_human=false` while still warning against a second charge; human review becomes mandatory only for an actual financial decision or protected action.
- Diagnostic does not prescribe undocumented printer, terminal, kitchen, order-state or synchronization workarounds. Unverified operational cautions are explicitly marked as hypotheses to confirm.
- Knowledge applies least privilege to multi-restaurant permissions, never infers undocumented role scope, requests role/organization/locations, and falls back to verified documentation or authorized human review before any permission change.

Round 2 profile versions: Dispatcher v4, Diagnostic v3, Knowledge v2.
New verified knowledge: POS payment-state vs sensitive billing, multi-location least privilege, and diagnostic operational cautions.


#### Automatic promoted-case regression

Before generating or executing another synthetic ticket, the server worker checks active training cases with `category=simulation`. If a promoted case has no completed evaluation for the current agent profile version, the worker evaluates exactly one such case and returns `regression_evaluated`.

The worker caps these automatic regression evaluations at 10 per UTC day. A case is considered current only when it has a passed or failed evaluation matching the active profile version. This closes the loop between a simulation finding, profile/knowledge improvement and a measurable regression retest without allowing unbounded API consumption.


#### Role-scoped promoted regressions

A promoted Simulation Lab finding is evaluated against the responsibilities of the target role rather than the entire multi-agent scenario. The full scenario remains context, but chain-wide requirements belonging to other agents are not scored against the target role. For example, Dispatcher is scored on classification/routing/flags/safe intake, while detailed reproduction and regression plans belong to Diagnostic, Developer and QA.

Existing promoted simulation training cases are migrated to `evaluation_scope=agent_role` with an explicit `role_focus`. Future promotions write these fields automatically.

Out-of-role omissions are excluded from the score and from the evaluator failure list for role-scoped promoted regressions; universal safety rules still apply.


### Simulation learning round 3

Round 3 is based on promoted regression results:
- Dispatcher v5 makes sensitive account/subscription billing route `human`, explicitly refuses refund promises before authorized verification, keeps permission semantics on `knowledge`, and preserves POS payment-state bugs as technical issues when no financial action is requested.
- Diagnostic v4 adds a minimal safe reproduction plan after triage: preconditions, numbered steps, observed/expected result and evidence, with explicit POS coverage for double-charge prevention, order/table state, offline/resync and peripherals when relevant.
- Developer Hub v3 responds as a developer rather than only asking diagnostic questions: reproducible case, technical hypotheses, smallest safe change, branch constraints, targeted tests and validation criteria.
- Knowledge v3 keeps documentation/permission-semantics questions on `route=knowledge` while using verified documentation or authorized human review as a fallback before real permission changes.

The evaluator now treats `role_focus` as the historical defect to correct (`role_focus_mode=defect_to_correct`), never as an instruction to reproduce the old defect.

Round 3 profile versions: Dispatcher v5, Diagnostic v4, Developer Hub v3, Knowledge v3.
