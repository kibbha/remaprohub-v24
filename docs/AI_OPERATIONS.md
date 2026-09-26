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
