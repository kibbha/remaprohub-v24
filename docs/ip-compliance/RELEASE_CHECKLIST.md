# ReMaPro POS — production release IP/security checklist

## Automated gates
- [ ] `npm run ip:check` passes.
- [ ] `npm run ip:release` passes.
- [ ] Exact dependency graph is locked by a committed lockfile.
- [ ] Release SBOM is generated from the resolved dependency graph.
- [ ] No dependency is marked `review-required` or `blocked`.
- [ ] Required POS security/resilience/payment tests pass.

## Ownership and provenance
- [ ] New contributors have documented rights/assignments where required.
- [ ] New dependencies are registered with licences.
- [ ] New visual/media assets are in `ASSET_REGISTER.csv`.
- [ ] Upstream notices are retained.
- [ ] No production secrets, merchant credentials or customer data are committed.

## Release evidence
Record:
- release tag + exact commit SHA;
- APK/AAB checksum and signing provenance;
- release SBOM + lockfile;
- Google Play release identifier;
- Hub/POS protocol/schema compatibility version;
- backend migration version;
- payment/printer integration validation date.

## First commercial launch
- [ ] proprietary POS source is in the intended private repository;
- [ ] final rights-holder/entity is documented;
- [ ] ReMaPro trade-mark filing decision is completed;
- [ ] final privacy/data notices cover POS data flows;
- [ ] customer/subscription/merchant-facing documents are finalised;
- [ ] provider/subprocessor inventory is complete;
- [ ] production accounts use business ownership, 2FA and recovery.
