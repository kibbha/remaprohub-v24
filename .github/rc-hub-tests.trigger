RC Hub validation trigger
Previous run confirmed offline assets exist but the package-hash test omitted the public order shell already included by the packager.
Retry base: 615938473ba125de06c5ebbbbda559a969474659
Fix: web-package cache hash now uses exactly the same order assets as package-web.mjs.
