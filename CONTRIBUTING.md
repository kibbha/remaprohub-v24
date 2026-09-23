# Contributing to ReMaPro

ReMaPro Hub is proprietary software. Contributions are accepted only when the project owner can document a clear right to use, modify, sublicense and transfer the contribution.

## Before contributing

- Use an authorised branch and issue/task.
- Do not copy code, UI, documentation, images, icons, fonts, audio, video or templates from competitors or unknown sources.
- Disclose every third-party component or asset added by the contribution, including its source and licence.
- Do not commit secrets, API keys, private signing material, credentials or customer data.
- Keep changes scoped and reviewable.
- Add or update tests when behaviour changes.

## IP provenance

Every material contribution must be traceable to its creator and legal basis. Contractors, agencies and outside contributors must have an appropriate written agreement or assignment before their contribution is merged.

Where AI-assisted tools are used, the contributor remains responsible for review, provenance checks, security, licence compatibility and correctness.

## Sign-off

Commits from external contributors should include a Signed-off-by trailer:

```
Signed-off-by: Name <authorised-email@example.invalid>
```

The sign-off records traceability only; it does not replace any contract or IP assignment required by the project owner.

## Dependency and asset changes

If a dependency changes:
1. update `docs/ip-compliance/third-party-components.json`;
2. regenerate the SBOM;
3. verify the licence and security posture;
4. run `npm run ip:check`.

If an asset changes:
1. update `docs/ip-compliance/ASSET_REGISTER.csv`;
2. retain source/licence/assignment evidence outside Git if confidential;
3. never add an asset whose provenance is unclear.

## Release rule

A production release must not proceed unless `npm run ip:release` passes or every reported blocker has been formally resolved and the gate updated accordingly.
