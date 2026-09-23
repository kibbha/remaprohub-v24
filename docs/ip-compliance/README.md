# ReMaPro Hub — IP & acquisition-readiness register

**Product:** ReMaPro Hub  
**Branch:** `rebuild/remaprohub-clean`  
**Recorded project owner for ReMaPro-specific material:** Romain Di-spigno, unless and until rights are assigned in writing to a legal entity.  
**Purpose:** keep the ownership, licensing, asset provenance and transfer evidence needed for commercialisation, investment or an acquisition due diligence.

> This is an internal compliance record, not a substitute for advice from a qualified lawyer in the relevant transaction jurisdiction.

## 1. Ownership perimeter

ReMaPro-specific application code, product logic, database/Edge Function code, tests, documentation, specifications, workflows and product-specific visual assets are treated as proprietary project material unless a file or the third-party register says otherwise.

The root `LICENSE` is the proprietary notice for ReMaPro-specific material. It does **not** relicense third-party components.

AI-assisted code is accepted into the project only after human review and project-level direction. Keep prompts/specifications, issue history, commits and release history as evidence of the development process. Do not represent AI-only material as necessarily copyrightable where applicable law says otherwise.

## 2. Third-party component register

Machine-readable source of truth: `docs/ip-compliance/third-party-components.json`.

Rules:
- every direct dependency in `package.json` must have a matching registry entry;
- new dependencies require licence review before merge;
- copyleft/network-copyleft or source-available licences require explicit approval before adoption;
- upstream copyright/licence notices must be preserved where the applicable licence requires it;
- release due diligence must include transitive dependencies from a resolved lockfile/build environment, not only the manifest-level SBOM committed here.

### Current exception / release blocker

`@capgo/capacitor-native-biometric` is declared as `^7.1.13`. That range can resolve across a licence transition (MIT before 7.5.3; MPL-2.0 from 7.5.3) and must be pinned/replaced/upgraded only after compatibility and security review. Until resolved, its registry status is `review-required`.

## 3. SBOM

`docs/ip-compliance/sbom.cdx.json` is a deterministic CycloneDX 1.5 **manifest-level** SBOM covering the application's direct npm dependencies.

Run:

```bash
node scripts/generate-ip-sbom.mjs
node scripts/generate-ip-sbom.mjs --check
```

The first command refreshes the committed SBOM. The second fails if:
- a direct dependency is missing from the registry;
- the registry contains a stale direct dependency;
- the committed SBOM differs from the current manifest/register;
- required IP-compliance files are missing.

A release-grade SBOM should additionally be generated from the exact resolved dependency graph used for the signed release.

## 4. Asset provenance register

| Asset / family | Location | Provenance | Rights / licence | Evidence to retain |
|---|---|---|---|---|
| Tabler icon subset | `app/icons.svg` | Tabler Icons, incorporated locally for offline use | MIT | upstream licence/version reference and this repository history |
| ReMaPro Hub wordmark/logo and product-specific graphics | `app/` and product UI | Created/commissioned for the ReMaPro project under project direction | Proprietary project asset, subject to any underlying third-party element | original source/export, generation/design brief, date, creator/tool, approval commit |
| UI screenshots / store graphics produced from ReMaPro Hub | release/marketing material | Derived from the ReMaPro application | ReMaPro-specific composition; underlying third-party elements retain their licences | source screenshot, release version, editor/source file |
| System font stack / Georgia | CSS references only | Device/OS fonts; not bundled as ReMaPro font files | governed by platform/font provider | no font binaries should be committed unless separately licensed |

**Asset rule:** no image, icon set, font, illustration, audio, video, template or stock asset may be added without recording its source, licence/assignment, date, and evidence location. Never copy an asset from a search engine or competitor product without a documented right to use it.

## 5. Future contributor rules

Before merging work from an employee, contractor, agency or outside contributor:

1. identify the natural person/company that created the contribution;
2. keep a signed employment/contractor agreement or IP assignment giving ReMaPro the economic rights needed to use, modify, sublicense and transfer the contribution;
3. require the contributor to disclose third-party code/assets and their licences;
4. require commit sign-off (`Signed-off-by:`) for traceability;
5. prohibit copy/paste from unknown or incompatible sources;
6. record material AI-assisted contributions and require human review;
7. update the third-party register and asset provenance when applicable;
8. do not merge an external contribution while ownership is unclear.

A future company that acquires the project should receive written assignments from the current owner and relevant contributors; GitHub access alone is not an IP assignment.

## 6. Infrastructure transfer runbook

Maintain business-controlled ownership wherever the provider permits it. Never store passwords, recovery codes, private keys or signing secrets in this document or in Git.

### Inventory to include in a transaction
- GitHub repository, branches, releases, issues and Actions configuration;
- Supabase projects: database schema/migrations, Edge Functions, Storage, Auth configuration and organisation ownership;
- ReMaPro domains, DNS and website hosting;
- Google Play Console application, package IDs and store listing;
- Android signing/upload keys and their recovery/rotation procedure;
- RevenueCat project/products/entitlements;
- email/support identities and transactional-email provider;
- payment/billing provider accounts;
- analytics, crash reporting and monitoring;
- AI/API provider projects used by production;
- secrets/environment variables, with names and ownership recorded but secret values stored only in the approved secret manager;
- customer/vendor contracts and data-processing agreements where applicable.

### Pre-closing
1. freeze a tagged release and record commit SHAs;
2. export/backup database, storage metadata, DNS configuration and provider configuration where permitted;
3. confirm which accounts are transferable and which must be recreated;
4. create buyer/business administrator accounts before removing the seller;
5. inventory secrets and signing material without exposing them in the data room;
6. prepare a data-transfer plan for personal/customer data under applicable privacy law;
7. produce current SBOM, dependency notices, contributor agreements and asset evidence.

### Closing
1. execute the written IP/business transfer agreement;
2. transfer organisation/repository ownership or grant buyer admins as agreed;
3. transfer/recreate Supabase, domain/DNS, store, billing and RevenueCat ownership;
4. hand over encrypted signing material through an agreed secure channel;
5. rotate API keys, service-role keys, OAuth secrets and recovery credentials;
6. confirm buyer-controlled billing and recovery email/phone;
7. record acceptance of the transferred inventory.

### Post-closing
1. revoke seller/contractor access not retained by agreement;
2. rotate remaining credentials;
3. verify production, store signing, payments and backups;
4. retain transaction evidence and final hashes/commit SHAs;
5. document any non-transferable vendor service that was recreated rather than assigned.

## 7. Evidence folder checklist

Keep, outside Git where confidential:
- signed IP assignments/employment/contractor agreements;
- invoices and purchase/licence receipts for assets;
- trademark/domain records;
- original logo/design source files and briefs;
- release SBOMs and third-party notices;
- store-account ownership and signing-key custody records;
- acquisition/financing documents and board/shareholder approvals if a company later owns ReMaPro.

## 8. Repository visibility

Repository visibility is an operational/security setting, not an IP licence. Before commercial launch, review whether the source repository should remain public; changing visibility must be coordinated with the deployment/website workflow so production hosting is not accidentally broken.
