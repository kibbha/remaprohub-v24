# ReMaPro — Commercial launch legal pack

Status: pre-launch working pack. Legal review recommended before commercial publication.

## 1. Operator and ownership

Current operator / rights-holder: **Romain Di Spigno, trading as ReMaPro**.

Public professional/domiciliation address: **[TO COMPLETE BEFORE PUBLICATION]**.

Operational/privacy contact: **admin@remaprohub.com**.

ReMaPro Hub, ReMaPro POS, their source code, product documentation, visual assets, domains and associated proprietary materials remain held by the current rights-holder unless and until a written assignment transfers specified rights to a future company. Any future incorporation must include an explicit IP/domain/trademark assignment schedule rather than relying on an implied transfer.

## 2. Commercial model to validate at release

Working offer: ReMaPro Hub + POS under one subscription; CHF 49.90/month for one establishment, up to 10 user accounts, no minimum commitment, 14-day free trial; additional establishment CHF 19.90/month. Final checkout/store copy and Terms must use the exact production billing configuration.

## 3. Privacy notice — required final content

The public privacy notice must identify the operator above and explain, against actual production flows:

- account/identity and authentication data;
- restaurant, staff and operational data;
- POS/orders/payments metadata (excluding payment-card data where handled directly by payment providers);
- uploaded invoices/images and AI/OCR processing;
- support/hotline data, including voice/transcript data if the AI hotline is activated;
- device/security/diagnostic data;
- subscription/billing metadata;
- purposes for each category;
- recipients and processors;
- retention/deletion periods or criteria;
- countries of processing and transfer safeguards;
- security measures at an appropriate descriptive level;
- access, correction, deletion and other applicable data-subject request routes;
- account deletion procedure;
- incident/contact route.

Do not publish the final notice until the production vendor/data-flow register below is complete.

## 4. Processor / transfer register

Maintain one row per production provider:

| Provider | Service | Data categories | Role | Processing countries | Transfer basis/safeguard | DPA | Retention/deletion | Verified |
|---|---|---|---|---|---|---|---|---|
| Supabase | Backend/database/auth/storage | TBD from production config | TBD | TBD | TBD | TBD | TBD | NO |
| OpenAI / AI provider(s) | AI features | TBD | TBD | TBD | TBD | TBD | TBD | NO |
| Twilio | AI hotline/telephony if enabled | TBD | TBD | TBD | TBD | TBD | TBD | NO |
| Billing/subscription provider | Subscription | TBD | TBD | TBD | TBD | TBD | TBD | NO |
| Payment-terminal/payment provider | POS payments | TBD | TBD | TBD | TBD | TBD | TBD | NO |
| Hosting/domain/email/support providers | Infrastructure/support | TBD | TBD | TBD | TBD | TBD | TBD | NO |

No provider may be marked verified from assumptions. Record contractual processor terms and subprocessors where applicable.

## 5. SaaS / subscription Terms — required clauses

Final Terms should cover at minimum: operator identity; service scope (Hub + POS); account roles and customer responsibility; trial; prices/taxes; billing cycle; additional establishments; cancellation and effective date; refunds/credits where applicable; acceptable use; customer data and licence necessary to provide the service; ReMaPro IP; third-party services/payment terminals; availability/maintenance/support; backups/export/deletion; security responsibilities; confidentiality; AI feature limitations and customer validation of generated output; liability/warranty provisions appropriate to Swiss law and B2B customers; suspension/termination; effects of termination; changes to service/terms/pricing; governing law/forum; contact details.

The Terms must not promise an SLA, backup level, refund right, data residency, payment compatibility or AI capability that engineering/operations does not actually provide.

## 6. DPA framework

Prepare a B2B DPA for cases where ReMaPro processes personal data on a restaurant customer's instructions. It should define subject matter/duration, processing nature/purpose, data types/categories, documented instructions, confidentiality, security, subprocessors, assistance with data-subject requests, breach cooperation, deletion/return at termination, audit/information obligations, and international-transfer mechanism where required.

Controller/processor roles must be mapped per feature; do not state that ReMaPro is always a processor.

## 7. Google Play Data Safety / account deletion

Before submission, reconcile the Data Safety form with the exact production APK/AAB and SDKs. Verify every collected/shared data category, purpose, optionality, encryption-in-transit representation, deletion practices and security statements.

If users can create accounts, release gate requires both:

1. an in-app account-deletion path; and
2. a functional public web resource through which deletion can be requested without reinstalling the app.

The web resource must identify ReMaPro/developer and clearly expose the deletion request path. Retained data and legitimate retention reasons must be described accurately.

## 8. Trademark gate

Before filing **ReMaPro**, **ReMaPro Hub** or **ReMaPro POS**:

- search Swissreg for identical and similar word marks and relevant pending/international rights designating Switzerland;
- search phonetic/spelling variants and relevant goods/services;
- determine Nice classes based on the actual software/SaaS/POS offering;
- consider a professional clearance search because database keyword searching alone does not rule out confusingly similar earlier rights;
- record search date, queries, candidate conflicts and decision;
- file only after holder name/address and mark version are final.

## 9. Release supply-chain gate

Before the commercial release tag:

- freeze dependency lockfiles used by the actual Hub and POS release builds;
- generate release-specific SBOM(s), not only a generic manifest-level inventory;
- retain third-party licence notices and asset provenance;
- archive build/version identifiers and commit SHAs;
- verify no production secrets are committed;
- run the existing IP/release compliance checks;
- keep release evidence with the release record.

## 10. Biometric gate

Biometric login is **not release-complete** until tested on the intended Android release build and supported devices. Verify enrollment/no-enrollment, success, cancel, failure/lockout, fallback authentication, logout/revocation, app reinstall/device-change behaviour, and that biometric secrets/templates are never stored by ReMaPro. Document the implementation and result in the RC evidence.

## 11. Final launch blockers

Commercial launch remains blocked until all are true:

- [ ] professional/domiciliation address inserted;
- [ ] production vendor/subprocessor register verified;
- [ ] final privacy notice matches production flows;
- [ ] SaaS/subscription Terms match production billing;
- [ ] DPA available where ReMaPro is a processor;
- [ ] trademark clearance decision recorded;
- [ ] Play Data Safety answers reconciled with release binary;
- [ ] account deletion works in-app and on web;
- [ ] release lockfiles + SBOM + licence evidence archived;
- [ ] biometric release tests pass or biometric feature is disabled for launch;
- [ ] final RC/release checks pass.
