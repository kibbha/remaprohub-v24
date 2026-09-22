# ReMaPro Hub V27.11.0 — Release Candidate

Candidate branch: `rebuild/remaprohub-clean`

## Functional state
V27.11.0 has reached the end of the planned functional sequence through lot 32:
- manager cockpit and proactive actions
- purchasing / supplier intelligence
- recipes and food cost
- planning, leave conflicts and replacement assistance
- HACCP and allergen consistency
- daily/weekly manager reporting
- maintenance, routines and closing assistance
- supplier due dates and one-click invoice payment
- reservation confirmation workflow
- rejected delivery follow-up

The Release Candidate phase must now prioritize stability and store readiness rather than adding secondary features.

## Gate 1 — source consistency
- [x] package version = 27.11.0
- [x] displayed app version derives from the package version
- [x] active release languages = FR / EN / DE / IT
- [x] Android final workflow is controlled and does not run on every push
- [x] Android artifact names identify V27.11.0
- [x] Play Store documentation targets V27.11.0
- [x] public privacy and account-deletion URLs are documented

## Gate 2 — automated validation
- [x] Run the complete `npm test` suite on the exact candidate commit.
- [x] Resolve any regression before Android build.
- [x] Keep the final Android build sentinel untouched until this gate is green.


Automated validation result: GitHub Actions `Test ReMaPro Hub V27.11.0` succeeded on commit `68b1025`.

## Gate 3 — backend / billing
- [ ] Verify migrations 001 through 006 are applied to the production Supabase project.
- [ ] Verify production Edge Functions are deployed.
- [ ] Verify RevenueCat products, offerings and entitlements match Google Play.
- [ ] Verify the RevenueCat webhook secret and OpenAI server secret are configured.
- [ ] Confirm Standard / Multi access from a real authenticated account.

## Gate 4 — physical Android validation
- [ ] Sign-in / sign-out / password reset.
- [ ] Biometric unlock and fallback authentication.
- [ ] Offline use followed by successful reconnection/sync.
- [ ] Photo / invoice capture permission and analysis.
- [ ] PDF export/share.
- [ ] Notification permission and optional manager alerts.
- [ ] Account deletion path.
- [ ] Standard vs Multi restrictions.

## Gate 5 — final Android artifacts
Only after Gates 1–4 are green:
- trigger the controlled Android final workflow;
- verify debug APK;
- verify signed release AAB;
- verify 16 KB zip alignment check;
- archive the exact candidate SHA and artifacts before Play upload.

Do not add unrelated product scope during this phase unless it fixes a launch blocker.
