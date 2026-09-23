# ReMaPro repository separation plan

## Objective
Keep the public marketing website independently deployable while moving proprietary Hub/POS source to private repositories or a private organisation without interrupting `remaprohub.com`.

## Target structure
- **Public website repository:** only files required to publish the marketing website.
- **Private Hub repository:** Hub source, tests, Supabase code, build workflows and compliance records.
- **Private POS repository:** POS source, tests, build workflows and compliance records.
- Shared backend contracts can move to a private shared repository later if needed.

## Controlled migration
1. Inventory exactly what GitHub Pages/the domain deploys from the current repository and branch.
2. Copy only required public-site files into a dedicated website repository.
3. Configure Pages/custom domain there and verify HTTPS/DNS/redirects.
4. Create private Hub/POS repositories under the final business-controlled GitHub owner.
5. Preserve useful Git history, tags and release evidence for provenance.
6. Recreate Actions secrets/environments with fresh secrets; never copy plaintext secrets into Git.
7. Update provider integrations that reference repository/workflow identities.
8. Validate private Hub/POS build/release pipelines.
9. Only after website and private builds are verified, archive or change visibility of the old repository.
10. Review pre-existing public forks/history: changing the original repository to private does not make already copied public history secret.

## Current state
Do **not** change repository visibility yet. The website/deployment dependency must be mapped first so the live site is not broken.
