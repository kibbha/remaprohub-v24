# Security

ReMaPro Hub treats the Supabase publishable key as public client configuration. Privileged database credentials, Supabase secret/service-role keys, provider tokens, signing keys and webhook secrets must never be committed to this repository or shipped in the web/Android client.

Production authentication is pinned to the runtime Supabase project configuration. Custom backend overrides are disabled unless an explicit development-only `REMAPRO_ALLOW_CUSTOM_BACKEND=true` flag is set before the app loads.

## Repository rules

- Keep production repositories private once the public website has been separated safely.
- Require two-factor authentication on maintainer accounts.
- Store CI/CD credentials only in GitHub Actions secrets or an approved secret manager.
- Never commit `.env` files, signing keystores, private keys, database passwords, recovery codes or customer data.
- Rotate any privileged credential immediately if it is ever exposed.
- Keep the `rebuild/remaprohub-clean` production branch protected from force-pushes and accidental deletion.
- Ownership-sensitive files are covered by `.github/CODEOWNERS`.

## Supabase rules

- RLS stays enabled on exposed tables.
- Client roles receive only the minimum grants required.
- Server-only data is accessed through authenticated Edge Functions.
- Secret/service-role credentials are server-side only.
- New `SECURITY DEFINER` functions must live outside exposed schemas, use a fixed `search_path`, and have explicit EXECUTE grants.

## Biometric unlock

Biometric unlock is an optional convenience layer for an already authenticated session, not a substitute for server-side authentication or authorisation.

The current Capacitor 7 native-biometric dependency is tracked as `review-required` in the IP register because the published security fix is on a later plugin major that targets Capacitor 8. Biometrics must remain disabled for a production release until the release gate is satisfied by a compatible fixed/replacement implementation.

## Responsible disclosure

Do not disclose a suspected vulnerability in a public issue before coordinated review.

Report it privately to the ReMaPro project owner through an established private business/support channel. If GitHub private vulnerability reporting is enabled for this repository, that channel may also be used. Do not include real customer data, production credentials, private keys or secrets in a report.

Security-sensitive areas include authentication/session handling, role and restaurant isolation, RLS, local/secure storage, biometric unlock, billing/entitlements, backups/imports, AI/document processing and Android signing/release pipelines.

## Release rule

A production release must satisfy the security tests required by the application and the IP/security release gate:

```bash
npm run ip:check
npm run ip:release
```

A failing release gate is a release blocker, not a warning to ignore.
