# ReMaPro Hub — Play Store release checklist (V27.7.0)

## Required GitHub secrets
- REVENUECAT_ANDROID_API_KEY: RevenueCat Android public SDK key.
- ANDROID_KEYSTORE_BASE64: base64-encoded Play upload keystore.
- ANDROID_KEYSTORE_PASSWORD.
- ANDROID_KEY_ALIAS.
- ANDROID_KEY_PASSWORD.

## RevenueCat
Create Android app com.remaprohub.app.
Create entitlements named standard and multi.
Create offerings named standard and multi.
Each offering must contain monthly and annual packages linked to the corresponding Google Play subscriptions.
Configure a RevenueCat webhook pointing to the deployed remapro-revenuecat-webhook Edge Function.
Send Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>.

## Supabase
Apply migrations through 003_v27_7_play_security_billing.sql.
Deploy remapro-account with JWT verification enabled.
Deploy remapro-revenuecat-webhook with JWT verification disabled.
Set REVENUECAT_WEBHOOK_SECRET on the Supabase project.
Keep SUPABASE_SERVICE_ROLE_KEY server-side only.

## Google Play
The Android workflow targets API 36.
Upload the signed AAB from the manual workflow.
Configure the subscription products imported by RevenueCat.
Complete Data Safety using docs/data-safety.md as the working sheet.
Provide a hosted URL for app/privacy-policy.html.
Provide a hosted URL for app/account-deletion.html.
Use a closed testing track before production.
