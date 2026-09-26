# ReMaPro AI Operations — phase 1

Phase 1 introduces an authenticated support/triage layer shared by Hub and POS.

Flow:
1. A signed-in restaurant user opens a support ticket from the in-app Academy/Help area.
2. `remapro-support` verifies organization/restaurant membership server-side.
3. The Dispatcher agent classifies category, priority and routing.
4. The Support agent produces the first customer-facing answer.
5. Bug reports additionally run through the Diagnostic agent and receive an engineering-ready brief.
6. Every agent execution is journaled in `ai_agent_runs`.
7. Sensitive production actions remain outside automatic execution and are represented by `support_approvals`.

Security boundaries:
- Support tables are server-only; `anon` and `authenticated` have no direct table privileges.
- The Edge Function requires a valid user JWT.
- Platform-wide inbox/update endpoints require the JWT app metadata claim `remapro_platform_role`.
- OpenAI credentials remain in Supabase secrets and are never exposed to Hub/POS.
- GitHub merge/release/deployment is intentionally not automatic in phase 1.

Next phase:
- platform operator console;
- GitHub issue/branch/PR bridge with a least-privilege GitHub App;
- Developer Hub/POS agents consuming diagnosed tickets;
- QA agent and approval gate before merge/release.
