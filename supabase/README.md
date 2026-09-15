
# ReMaPro Hub — Supabase Phase 1

## What this does

This migration creates the backend foundation for:

- network / organization
- multiple restaurants
- users and restaurant memberships
- role-based authorization
- 7-day trial + subscription model
- advice sheets
- HACCP temperature records
- ingredients and recipe costing
- daily sales
- employees and payroll records
- document metadata
- localStorage migration batches

## Security model

The mobile/web client uses the Supabase publishable key only.
Authorization is enforced in PostgreSQL with RLS.

Do NOT put a `service_role` or secret key into `app/index.html`, Capacitor,
Android resources, or any frontend JavaScript.

Roles are stored in `public.memberships`, not in user-editable metadata.

## First deployment

1. Open the ReMaPro Hub Supabase project.
2. SQL Editor.
3. Paste `supabase/migrations/001_initial_schema.sql`.
4. Run it.
5. Verify the tables and RLS policies.
6. Create a first test user with Supabase Auth.
7. Create one organization + one restaurant.
8. Add the first user's `memberships` row as `network_admin` or `restaurant_admin`.

## Required client values

The app will need:

- Supabase project URL:
  `https://ohhsytkcpiwcprerunry.supabase.co`
- Supabase publishable/anon key: NOT included in this package.

Send only the publishable/anon key for frontend integration.
Never send a service_role/secret key.

## Next implementation order

1. Auth screen + session persistence.
2. First-run organization/restaurant onboarding.
3. Membership/role-aware navigation.
4. Read/write one module at a time.
5. LocalStorage -> Supabase migration with verification and rollback.
6. Stripe Checkout + webhook/Edge Function.
7. Offline queue/sync for mobile.
8. Production hardening and Android/iOS release builds.
