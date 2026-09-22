# ReMaPro Hub — Play Store release checklist (V27.11.0)

## État de la release candidate
- Version applicative: 27.11.0.
- Application ID Android: com.remaprohub.app.
- Langues actives: fr, en, de, it.
- Target / compile SDK préparés: API 36.
- Build Android final: à déclencher uniquement après validation légère de la Release Candidate.
- Le workflow final produit un APK debug et, si les secrets de signature sont présents, un AAB release signé.

## Required GitHub secrets
- REVENUECAT_ANDROID_API_KEY: RevenueCat Android public SDK key.
- SUPABASE_URL.
- SUPABASE_PUBLISHABLE_KEY.
- ANDROID_KEYSTORE_BASE64: base64-encoded Play upload keystore.
- ANDROID_KEYSTORE_PASSWORD.
- ANDROID_KEY_ALIAS.
- ANDROID_KEY_PASSWORD.
- SUPABASE_ACCESS_TOKEN and SUPABASE_DB_PASSWORD are needed only for the deployment workflow.

## RevenueCat
Create Android app `com.remaprohub.app`.
Create entitlements named `standard` and `multi`.
Create offerings named `standard` and `multi`.
Each offering must contain monthly and annual packages linked to the corresponding Google Play subscriptions.
Configure a RevenueCat webhook pointing to the deployed `remapro-revenuecat-webhook` Edge Function.
Send `Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>`.

## Supabase
Apply migrations through `006_v27_10_private_auth_helpers.sql`.
Deploy the production Edge Functions used by the app:
- remapro-admin
- remapro-sync
- remapro-account
- remapro-ai
- remapro-bootstrap
- remapro-revenuecat-webhook

Keep JWT verification enabled for authenticated functions and disabled only for the RevenueCat webhook as defined in `supabase/config.toml`.
Set `REVENUECAT_WEBHOOK_SECRET` and `OPENAI_API_KEY` on the Supabase project.
Keep `SUPABASE_SERVICE_ROLE_KEY` server-side only.

## Google Play
The Android workflow targets API 36.
Upload the signed AAB from the controlled final Android workflow.
Configure the subscription products imported by RevenueCat.
Complete Data Safety using `docs/data-safety.md` as the working sheet.
Privacy policy URL: https://remaprohub.com/privacy-policy.html
Account deletion URL: https://remaprohub.com/account-deletion.html
Use the required testing track for the account before production.

## Final checks before upload
- Run the full `npm test` suite on the exact candidate commit.
- Confirm runtime configuration contains no secret server key.
- Confirm RevenueCat returns the expected Standard / Multi entitlements.
- Test sign-in, sign-out, password reset, account deletion and biometric unlock on a physical Android device.
- Test one offline edit followed by reconnection/synchronization.
- Test one invoice scan / AI request with the production Supabase function.
- Verify the generated AAB is signed and the debug APK passes 16 KB zip alignment verification.
- Reconcile the Play Console Data Safety form with the exact production behavior.
