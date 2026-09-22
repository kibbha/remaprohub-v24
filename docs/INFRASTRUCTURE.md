# ReMaPro Hub — infrastructure

## Production topology

- Public website: GitHub Pages, branch `gh-pages`
- Custom domain: `remaprohub.com`
- GitHub Pages custom-domain source: `CNAME` = `remaprohub.com`
- DNS registrar/zone: Infomaniak
- Mail hosting: Infomaniak
- Application backend/data: Supabase
- Infomaniak API access: server-side only through Supabase Vault / `remapro_admin`

## DNS intent

The production website remains on GitHub Pages. The apex A records must therefore use the GitHub Pages addresses and `www` may point to `kibbha.github.io`.

Do not repoint the website to the Infomaniak Starter hosting unless a deliberate hosting migration is planned and validated.

Mail-related DNS records (MX, SPF, DKIM, DMARC, autoconfig/autodiscover) are managed independently and must not be removed as part of website changes.

## Infomaniak Starter hosting

The temporary FTP deployment path used during the migration experiment has been retired.

- GitHub workflow `.github/workflows/deploy-infomaniak.yml`: removed
- Dedicated FTP deployment user `gn9blb_remapro-deploy`: removed
- Do not restore an FTP deployment workflow unless Infomaniak becomes the chosen production web host.

## Security

The Infomaniak API token is stored in Supabase Vault and must never be committed to GitHub or exposed to the browser client.

Current intended token scopes:
- `dns:read`
- `dns:write`
- `domain:read`
- `web`
- `mail`

Any destructive infrastructure operation should be deliberate and auditable.
