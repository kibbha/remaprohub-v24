# ReMaPro Hub — production release IP/security checklist

Run this checklist for every signed production release.

## Automated gates
- [ ] `npm run ip:check` passes.
- [ ] `npm run ip:release` passes.
- [ ] Exact dependency graph is locked by a committed lockfile.
- [ ] Release SBOM is generated from the resolved dependency graph.
- [ ] No dependency is marked `review-required`, `blocked` or equivalent.
- [ ] Required security and release tests pass.

## Ownership and provenance
- [ ] New contributors have documented rights/assignments where required.
- [ ] New third-party code is present in the component register.
- [ ] New visual/media assets are present in `ASSET_REGISTER.csv`.
- [ ] Required upstream notices are retained.
- [ ] No customer data, passwords, private keys or production secrets are committed.

## Release evidence
Record outside Git where confidential:
- release tag and exact commit SHA;
- APK/AAB checksum and signing provenance;
- final release SBOM and dependency lockfile;
- Google Play release identifier;
- database schema/migration version;
- backup/restore verification date.

## First commercial launch
- [ ] public marketing website is separated from proprietary application source;
- [ ] repository visibility is appropriate for production;
- [ ] final legal rights-holder/entity is known and documented;
- [ ] ReMaPro trade-mark clearance/filing decision is completed;
- [ ] final privacy policy identifies the actual controller and support route;
- [ ] customer/subscription documents are finalised;
- [ ] subprocessor/data-processing inventory is complete;
- [ ] production provider accounts use business-controlled ownership, 2FA and recovery;
- [ ] biometric release blocker is resolved or biometrics remain disabled in production.
