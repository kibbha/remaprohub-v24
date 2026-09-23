# ReMaPro repository separation plan

The current repository also supports public-facing ReMaPro infrastructure. Before making application source private, separate the marketing website in a controlled migration.

## Target
- public repository: marketing website only;
- private repository: ReMaPro Hub;
- private repository: ReMaPro POS;
- optional private shared-contract/backend repository if later justified.

## POS migration sequence
1. Map current website/Pages deployment before changing visibility.
2. Establish and validate the standalone public website repository.
3. Create the business-controlled private POS repository.
4. Preserve relevant Git history/tags for provenance.
5. Recreate Actions secrets/environments with fresh credentials.
6. Validate POS tests, Android packaging, Hub configuration sync and release process.
7. Update provider/store references if repository identities change.
8. Only then archive/change visibility of the old source location.
9. Review any pre-existing public forks/history separately.

Do not change current visibility until the website dependency is verified.
