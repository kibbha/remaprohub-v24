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
