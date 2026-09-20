# ReMaPro Hub — Google Play Data Safety working sheet

Version target: 27.7.0
Review date: 2026-09-20

## Data collected or processed
- Account data: email, Supabase user ID, organization and restaurant memberships.
- Restaurant operational data: stock, suppliers, purchases, orders, reservations, HACCP, tasks, planning, finance, documents and settings entered by the user.
- HR data: employee records and payroll/document fields when the organization chooses to use those modules.
- Photos/images: only when the user explicitly starts stock-photo or invoice-photo analysis.
- Purchase/subscription metadata: Google Play / RevenueCat product, entitlement and subscription status. Full payment card data is not received by ReMaPro Hub.

## Purpose
- App functionality and cloud synchronization.
- Account authentication and authorization.
- Subscription entitlement management.
- Optional AI features initiated by the user.
- Security, fraud prevention and service diagnostics as provided by the underlying platforms.

## Sharing / processors
- Supabase: authentication, database and Edge Functions.
- Google Play: Android app distribution and subscription billing.
- RevenueCat: subscription entitlement and purchase-state synchronization.
- OpenAI: only for user-initiated AI requests/images routed through the Supabase server.

## Security controls
- Supabase session tokens use Android secure storage on the installed app.
- RLS and Edge Functions enforce organization/restaurant permissions.
- Validated HACCP database records are append-only.
- Android backups are disabled.
- Cleartext Android traffic is disabled.
- CSP limits web content execution and network access.

## Deletion
- In-app path: Settings -> Privacy and account -> Delete my account.
- Public instructions: app/account-deletion.html.
- Authentication profile and memberships are deleted.
- An organization is deleted when the deleting user is its only active member.
- Shared professional organization data may remain when other active members still belong to the organization.

## Play Console review
Before production submission, reconcile this worksheet against the exact Play Console Data Safety questions and the deployed production configuration. Do not claim encryption, collection, sharing or deletion behavior that differs from the production build.
