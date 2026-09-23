# Security Policy

ReMaPro POS handles transactional and operational restaurant data. Privileged credentials, signing keys, merchant/provider secrets and customer data must never be committed to the repository or bundled into public client configuration.

## Core rules
- Keep production application repositories private once the public website has been separated safely.
- Require 2FA on maintainer/business-owner accounts.
- Store release credentials in GitHub Actions secrets or an approved secret manager.
- Protect the POS production branch from force-push/deletion.
- Use least privilege for backend and provider credentials.
- Treat offline data stores, receipts, staff identities and payment metadata as security-sensitive.
- Ownership-sensitive files are covered by `.github/CODEOWNERS`.

## POS-specific controls
- Server-authoritative authentication/authorisation must not be replaced by local UI state.
- Offline mode must not bypass role or item-availability rules beyond explicitly designed offline behaviour.
- Payment-provider/terminal integrations must never expose merchant secrets to the client.
- Network printer input must be treated as untrusted external I/O.
- Sync conflicts must preserve tenant/restaurant isolation.
- Android signing/upload keys must stay outside Git.

## Responsible disclosure
Do not disclose suspected vulnerabilities in public issues before coordinated review. Report privately through an established ReMaPro business/support channel or GitHub private vulnerability reporting if enabled.

Do not include real customer data, production credentials, signing material or private keys in reports.

## Release rule
Run:
```bash
npm run ip:check
npm run ip:release
```
A failing release gate is a production blocker.
