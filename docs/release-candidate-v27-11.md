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
- [x] Verify migrations 001 through 007 are applied to the production Supabase project.
- [x] Verify production Edge Functions are deployed.
- [ ] Verify RevenueCat products, offerings and entitlements match Google Play.
- [ ] Verify the RevenueCat webhook secret and OpenAI server secret are configured.
- [ ] Confirm the unified ReMaPro subscription from a real authenticated account, including purchased establishment slots.

Backend verification: production project `gkbzawjlmwjweuqckuxm` is ACTIVE_HEALTHY. The commercial model is CHF 49.90/month for one establishment with a 14-day trial and up to 10 users; each additional establishment costs CHF 19.90/month, up to five establishments. Production migrations are aligned through `pos_terminal_authorized_cancel_guard`; `remapro-pos-sync` is deployed with the audited restaurant-scope guards. Server-only tables intentionally use RLS without client grants/policies.

## Release Candidate Android build

GitHub Actions run `35711717482` succeeded on commit `653204a`.
- full npm test suite: success
- Capacitor packaging: success
- target / compile API 36 hardening: success
- debug APK build: success
- 16 KB zip alignment verification: success
- APK artifact: `ReMaPro-Hub-V27.11.0-debug-apk`
- APK SHA-256 after extraction: `d727f00fbb279035bf8f56c69477a18ca3e469829ae205c6686518524c436514`
- RevenueCat Android SDK key was not present in GitHub Actions secrets, so billing is disabled in this RC APK.
- Android signing secrets were not present, so the signed release AAB was skipped.

## Remaining external launch blockers
- Configure `REVENUECAT_ANDROID_API_KEY` in GitHub Actions.
- Verify/create the Google Play + RevenueCat establishment-count products/offers `remapro_1` through `remapro_5`, using the unified `remapro` entitlement. Legacy `standard` / `multi` handling remains compatibility-only.
- Configure Android upload signing secrets before the production AAB build.
- Enable Supabase Auth leaked-password protection in the Supabase dashboard.

## Gate 4 — physical Android validation
- [ ] Sign-in / sign-out / password reset.
- [ ] Biometric unlock and fallback authentication.
- [ ] Offline use followed by successful reconnection/sync.
- [ ] Photo / invoice capture permission and analysis.
- [ ] PDF export/share.
- [ ] Notification permission and optional manager alerts.
- [ ] Account deletion path.
- [ ] Establishment-count entitlement (1–5 sites) and 10-user cap.

## Gate 5 — final Android artifacts
Only after Gates 1–4 are green:
- trigger the controlled Android final workflow;
- verify debug APK;
- verify signed release AAB;
- verify 16 KB zip alignment check;
- archive the exact candidate SHA and artifacts before Play upload.

Do not add unrelated product scope during this phase unless it fixes a launch blocker.
