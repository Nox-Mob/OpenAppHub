# E-signatures with SignuDoc: plan

Status: **plan only, for the owner's decision** (2026-11-17). Nothing here is built. The only code is a
throwaway spike, kept out of `staging` and `main`: commit `a37b225` on the branch
`claude/great-brown-cwk5vo`, folder `docs/plans/esign-spike/`.

Owner request: "How easy would it be to implement SignuDoc into the OpenAppHub code base? Most
applicable in OpenBoardApp (signatures on documents, execution of bylaws), and later OpenCharterApp (a
national requiring a signature on an award recommendation, a legal attestation that it's true and
accurate)."

## In short

1. **How easy?** **Medium-hard. It can't be dropped in, but its hardest part can be reused.**
   - SignuDoc is a separate Next.js app for Vercel, made for **one organization per install**. We're a
     multi-organization suite on Cloudflare Workers and Supabase. Its pages, sign-in, database code and
     file storage can't be used as they are.
   - **Its signing engine can be reused**: building the signed PDF and its certificate, the chained
     audit trail, the "is this the real file?" check, and later, if wanted, a PDF seal (PAdES). A spike sealed a PDF on
     Cloudflare's own runtime in about 50 ms. The libraries add about 270 KB (gzipped) to a Worker.
   - The recommended path is to **port the engine into one suite service** (OpenAppHub Signatures)
     that every app uses, and build our own screens on our design system and security model.
   - Rough size: an **attestation-only** first release (sign a statement about a record) is small, a
     few weeks. **Full PDF signing** (place fields on a PDF, signing order, signed copy with its Certificate of Completion, verify page) is
     a large epic, roughly 2 to 3 months of focused work including tests and docs.
2. **Dependencies.** The suite foundations it needs are **already done**: email, signed links,
   confirm-it's-you, two-step sign-in, documents and storage, tasks, notifications, automations and
   exports. What's **not done** decides the order:
   - Board's **B-13** (minutes sign-off) and **B-14** (policies and annual forms) are the first users.
   - Charter's award signatures wait on **C-29** (form builder), **C-30/C-31** (award approvals) and
     **C-24** (the approval engine).
   - Owner decisions: legal wording and the Privacy Policy. The PDF seal is deferred (owner,
     2026-11-18): a Certificate of Completion goes on the end of each signed PDF instead.
3. **Do alongside it**, even as groundwork:
   - fingerprint (SHA-256) every stored document version now;
   - a versioned "consent to electronic records" document;
   - a chained, tamper-evident audit trail across the apps;
   - a record of how sure we are of each person's identity;
   - retention and legal-hold rules;
   - a "what e-signatures are and aren't for" page;
   - a size check on Worker bundles in CI;
   - an upstream conversation with SignuDoc about a separate engine package.

The details follow.

---

## 1. What SignuDoc is

Read from the repository (`NYLLON-SOFTWARE/signudoc`, commit `1df503d`, 2026-11-16).

|                  |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **What it does** | Upload one PDF, add up to 10 signers in order plus copy recipients, place fields (signature, initials, date, text, number, checkbox, dropdown, radio). Signers sign from an email link without an account. Deadlines, reminders and templates. When everyone has signed: a sealed PDF plus an audit certificate, and a public Verify page. Optional access code or emailed one-time code. Optional "Part 11 mode" (signers use accounts and re-enter their password). Optional advanced or qualified signatures through outside providers (eID Easy, CSC). |
| **Licence**      | **MIT** (bundled fonts are OFL, PDF.js is Apache-2.0). We may copy and change the code if we keep the copyright notice.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Age**          | **Very new.** v0.1.0 on 2026-11-14, v0.3.0 on 2026-11-16. It's changing daily.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Built with**   | Next.js 16 on Vercel Functions; Better Auth; raw Postgres (`pg`) on Neon; Vercel Blob; Resend; `pdf-lib`, `@signpdf/*`, `node-forge`, `harfbuzzjs` (WebAssembly), `pdfjs-dist`.                                                                                                                                                                                                                                                                                                                                                                            |
| **Size**         | About 35,000 lines in `src/lib`. The parts worth reusing are about 6,000: `services/pdf-finalize.ts` (1,542), `pdf-seal.ts` (540), `pdf-fonts.ts` (518), `pdf-incremental.ts` (679), `pdf-revision.ts` (425), `audit.ts` (379), `der.ts`, `utils/canonical-json.ts`, `utils/pdf-coords.ts`, `verify.ts`, and later `pdf-ltv.ts` (1,425) and `signer-cms.ts` (913).                                                                                                                                                                                         |
| **Tenancy**      | **One organization per install.** No table has an organization column. Settings, branding and the seal key are global (`seal_keys` allows one active key).                                                                                                                                                                                                                                                                                                                                                                                                 |
| **No API**       | "API and webhooks: not yet" (its README). Another system can't create envelopes or hear about signatures.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

## 2. How it fits our suite

|                | SignuDoc                                      | OpenAppHub suite                                                  | What it means                                                                               |
| -------------- | --------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Organizations  | One per install                               | Many in one database, kept apart by row-level security            | Every table needs `org_id` and RLS. Rewrite the data layer.                                 |
| Hosting        | Vercel Functions (Node.js 24)                 | Cloudflare Workers (`nodejs_compat`)                              | The engine runs on Workers (spike). Next.js routes and Vercel APIs don't.                   |
| Sign-in        | Better Auth, its own users                    | Supabase Auth, suite accounts, two-step sign-in, confirm-it's-you | Use ours. Signers who are members sign as themselves, which is stronger than an email link. |
| Database       | `pg`, raw SQL from the server                 | Supabase, RLS, definer functions, migrations per repo             | Port the SQL design, not the code.                                                          |
| Files          | Vercel Blob                                   | Supabase Storage, private buckets, per-org paths                  | Swap the storage driver (SignuDoc already has a driver interface).                          |
| Email          | Resend directly                               | Core outbox (S-16), Resend or SMTP, send limits                   | Use the outbox and our templates.                                                           |
| Scheduled jobs | Vercel cron                                   | The hub's Worker cron and the automation engine (S-25)            | Reminders and expiry become automations.                                                    |
| UI             | Its own shadcn screens                        | Our shared design system and `AppShell`                           | Rebuild the screens; reuse ideas, like the field-placing canvas.                            |
| Fonts          | Includes a 14 MB Japanese/Chinese/Korean font | Workers are limited to 10 MB compressed (paid plan)               | Leave CJK out at first, or load it from storage when needed.                                |

## 3. Options

| Option                                                      | What it is                                                                                                                                                                                                    | Verdict                                                                                                                                                                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Run SignuDoc beside the suite**                        | Deploy it on Vercel and link to it.                                                                                                                                                                           | **No** for hosted: one install per organization, separate accounts, data outside Supabase, nothing ties a signature to a Board document. It could be a "bring your own SignuDoc" link for self-hosters later. |
| **B. Connect to SignuDoc through an API**                   | Our apps create envelopes in SignuDoc and listen for "completed".                                                                                                                                             | **Not possible yet**: no API or webhooks. Still single-organization. Worth revisiting if it adds both.                                                                                                        |
| **C. Port its engine into a suite service** _(recommended)_ | Copy the PDF, seal, audit-chain and verify code (MIT, with notice) into a shared module. Build multi-organization tables in core and our own screens. Signing, sealing and verifying run in the hub's Worker. | **Yes.** It reuses the parts that are hard to get right (PDF incremental updates, PAdES, DER, the hash chain) and keeps our security model.                                                                   |
| **D. Build our own from scratch**                           | Same as C without SignuDoc's code.                                                                                                                                                                            | Only if the code turns out unsafe to reuse. C saves months on the PDF and crypto work.                                                                                                                        |

### The spike (option C's biggest risk)

The spike (commit `a37b225`, `docs/plans/esign-spike/`) builds a PDF with `pdf-lib`, adds a signature placeholder, and seals it
with `@signpdf` and `node-forge`, the same libraries and versions SignuDoc uses.

| Where it ran                                                        | Result                                                                                                 |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Node.js                                                             | Sealed PDF (`/ByteRange` present), seal step 66 ms                                                     |
| **Cloudflare's runtime (`wrangler dev`, workerd, `nodejs_compat`)** | **Sealed PDF, seal step 49 ms**, key generation 93 ms (a real install stores its key instead)          |
| Bundle size                                                         | About 270 KB gzipped for these libraries. HarfBuzz text shaping would add about 0.7 MB of WebAssembly. |

One thing to know: `node-forge` loads `crypto` by its old name. Wrangler's own bundling (which our apps
use through Vite) handles it; a plain esbuild bundle for the browser doesn't.

Not yet tried on Workers: HarfBuzz (WebAssembly text shaping), long-term validation (fetching
certificate status and timestamps), and very large PDFs (Worker CPU time).

## 4. Recommended design: OpenAppHub Signatures

One service for the whole suite, like email (S-16) and approvals (core `0014`). Apps ask for a
signature; the hub collects it, adds the certificate and keeps the evidence; apps hear back through events and
automations.

### Two kinds of signature

|                     | **Attestation**                                                                                                                                                 | **Document signing**                                                    |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| What's signed       | A statement about a record: "I attest this award recommendation is true and accurate", "I approve these minutes", "I have read the conflict-of-interest policy" | A PDF: bylaws, a resolution, a contract, a lease                        |
| How                 | One screen: the statement, the record's summary and fingerprint, typed name, confirm-it's-you, Sign                                                             | Fields placed on the PDF, signing order, each signer fills their fields |
| Result              | An attestation record (who, when, what, the record's fingerprint, how we checked who they were). A one-page certificate PDF                                     | A signed PDF with its Certificate of Completion on the end              |
| SignuDoc parts used | Audit chain, canonical JSON, certificate layout                                                                                                                 | Almost the whole engine                                                 |
| Size                | Small                                                                                                                                                           | Large                                                                   |

**Start with attestations.** They cover most of what Board and Charter need (minutes sign-off, annual
forms, award recommendations, officer oaths, reports) without the PDF field editor, the biggest UI
piece. Document signing builds on the same tables and evidence.

### Where things live

- **Core tables** (in `db/core`, so self-hosted installs get them too):
  - `sign_requests`: an attestation or an envelope. `org_id`, `app`, `subject_type`, `subject_id`, the
    statement or document, status, deadline.
  - `sign_signers`: order, person (`user_id`) or an outside email, status, identity method.
  - `sign_fields`: document signing only.
  - `sign_events`: **append-only and hash-chained**, like SignuDoc's `audit_events`.
  - `sign_files`: original, signed and certificate files, each with its SHA-256.
  - RLS: members of the organization read; only the hub's definer functions write. The apps call
    invoker functions (S-12 pattern).
- **The hub hosts**:
  - the signing page (`/sign/<id>` for members, `/sign/t/<token>` for outside signers via core
    `action_links`);
  - finishing the PDF and its certificate (it holds the service role, and the other apps don't, by
    design);
  - the public **Verify** page (`/verify`: drop a file, it says if it's exactly a file we produced; only
    the fingerprint is sent).
- **Shared module** (`shared/esign/`): the ported engine (PDF stamping, certificate, audit chain, verify),
  with SignuDoc's MIT notice. Synced to the apps like the rest of `shared/`, so self-hosted apps can
  produce signed copies too.
- **Storage**: a private `sign-files` bucket with per-organization paths and its own size and type
  limits (PDF only for documents).
- **Apps**: Board and Charter add a "Request signatures" action on their records and show the status.
  Completion is an automation trigger (`signature.completed`), so a workflow can, for example, mark
  bylaws "adopted".

### Who is signing (identity)

- **Members sign as themselves**: signed in, then confirm-it's-you (core `0019`), plus a two-step code
  when the organization requires two-step sign-in. This is stronger than SignuDoc's default email link,
  close to its Part 11 mode.
- **Outside signers** (a vendor, an auditor): a signed link (core `0014` `action_links`) plus an
  emailed one-time code. Optional access code.
- The method is stored on each signature and printed on the certificate.

### Evidence: a Certificate of Completion (owner direction, 2026-11-18)

When the last person signs, we **add a Certificate of Completion to the end of the signed PDF**, like
DocuSign's. It's the page people actually read when a signature is questioned. It shows:

- the document's title, the request's ID, who sent it and when;
- each signer: name, email, how we checked who they were (signed in with two-step sign-in and
  confirm-it's-you, or an emailed code), when they viewed, consented and signed, their IP address
  and browser, and their signature as drawn or typed;
- the signed document's SHA-256 fingerprint (the pages before the certificate);
- the version of the consent-to-electronic-records text each signer accepted;
- the full event history (created, sent, viewed, consented, signed, declined, completed);
- a link to our Verify page.

The certificate is also available as its own download, and an attestation (section 4, "Two kinds")
gets a one-page certificate on its own.

Behind it:

- Consent to electronic records, versioned, before the first signature.
- Hash-chained events in the database (SignuDoc's design), so an edited or deleted event shows.
- **The finished file's SHA-256 stored with the request.** The Verify page answers "is this exactly
  the file we produced?" for anyone holding a copy. Only the fingerprint is sent, never the file.
- Included in each app's "Export everything" (S-06) and Board's record export (B-08).

### The seal (PAdES): not now

**Recommendation: certificate and Verify page first, no PAdES seal.**

- **What the seal would add:** a PDF reader could show "unchanged since signing" without visiting our
  site.
- **What a self-signed seal costs:** Adobe Acrobat shows a yellow "signature validity is unknown"
  banner on every document, because it doesn't know our certificate. To a board member that reads as
  "something is wrong with this file". We'd also look after a private key (encryption, rotation, theft
  risk).
- **Tamper evidence without it:** the stored fingerprint, the Verify page and the chained events
  catch any change to the file. The certificate prints the fingerprint, so anyone can check.
- **Legally:** ESIGN and UETA look for consent, intent, who signed and a kept record. The
  certificate and the audit trail provide those; neither law needs a cryptographic seal.
- **Later, if wanted:** if a customer needs reader-checkable signatures, add the seal on top
  (S-33). It goes on the finished file, certificate included, and is worth doing with a certificate
  Adobe trusts (AATL), which removes the warning but costs money every year. A self-signed seal
  stays the fallback if you'd rather have one from the start; the spike shows it works.

This also makes S-29 to S-31 smaller: no seal keys, no `node-forge` or `@signpdf`, and no long-term
validation code.

## 5. New epics, and where they go

| ID       | Epic                                         | Needs                                            | Notes                                                                                                                                                                                                                                                                          |
| -------- | -------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **S-29** | **Signatures core**                          | S-16 ✅, core `0014` ✅, core `0019` ✅, S-12 ✅ | Core tables and RLS, hash chain, `shared/esign/` (ported engine, MIT notice), storage bucket, email templates, `signature.*` automation triggers, tasks ("Sign this" on the hub dashboard, S-15/S-19), notifications (H-02). DB tests, including cross-organization isolation. |
| **S-30** | **Attestations**                             | S-29                                             | Statement plus record fingerprint, confirm-it's-you, certificate PDF. The first thing Board and Charter use.                                                                                                                                                                   |
| **S-31** | **Document signing**                         | S-29                                             | Upload or pick a PDF; place fields (PDF.js canvas, keyboard alternative); signing order; copy recipients; deadlines; reminders as S-25 automations; decline and void; signed PDF with its certificate. Works on phones (the screens review sizes).                             |
| **S-32** | **Verify page and certificates**             | S-29                                             | The Certificate of Completion added to the end of each signed PDF (and as its own download); the public `/verify` page; certificate layout with letterhead from Board (B-04).                                                                                                  |
| **S-33** | **Later**                                    | S-31                                             | A PDF seal (PAdES) on the finished file, best with a trusted (AATL) certificate; long-term validation and timestamps, templates, CJK fonts, outside providers for advanced or qualified signatures (eIDAS), several documents in one envelope.                                 |
| **B-16** | **Board: sign documents and execute bylaws** | S-31, B-04 ✅                                    | "Request signatures" on a document version; signed copy stored as the next version; bylaws and resolutions marked executed; signed copies in the board packet.                                                                                                                 |
| **B-13** | Consent agenda and sign-off _(exists)_       | S-30                                             | The secretary's (and chair's) sign-off on approved minutes becomes an attestation.                                                                                                                                                                                             |
| **B-14** | Policies and annual forms _(exists)_         | S-30                                             | Yearly conflict-of-interest disclosure and policy acknowledgement as attestations, with tasks and reminders.                                                                                                                                                                   |
| **C-44** | **Charter: required signatures**             | S-30; C-29 for forms                             | A national (or region) sets which forms or records need an attestation and from whom ("the chapter commander attests the award recommendation is true and accurate"). Chapters see it as a required step. Uses the chain of command and H-09 roles.                            |
| C-31     | Award submission and approvals _(exists)_    | C-30, C-24, **C-44**                             | The recommendation can't be submitted without the attestation; each approver's decision can be an attestation too.                                                                                                                                                             |
| C-43     | Annual chapter reports _(exists)_            | C-29, **C-44**                                   | The national can require the chapter's officers to attest the report.                                                                                                                                                                                                          |

### Order

1. **Now (groundwork, small):** the items in section 7.
2. **S-29 + S-30**, then **B-13** and **B-14**: first real use in Board, attestations only.
3. **S-31 + S-32**, then **B-16**: full document signing and executed bylaws.
4. **C-44** when Charter's **C-29** form builder exists. Award attestations then come for free in C-31.
5. **S-33** as needed.

## 6. Dependencies

**Done, and used as is:**

- S-16 email (core outbox, send limits);
- core `0014` signed action links and approvals;
- core `0019` confirm-it's-you;
- two-step sign-in with organization requirements;
- H-09 named roles and app permissions;
- S-25/S-28 automations (triggers, reminders);
- S-15/S-19 tasks on the dashboard;
- H-02 notifications;
- S-12 data between apps;
- B-04 documents, letterhead and storage;
- S-06/B-08 exports;
- the security headers and CSP. The signing page needs PDF.js's worker. Our CSP has no `worker-src`,
  so workers fall back to the script rules: serve the worker file from our own site, not as a `blob:`
  worker.

**Not done, and they set the order:**

- **B-13, B-14** (Board): the first users of S-30.
- **C-29** form builder, **C-30/C-31** awards, **C-24** approval engine (Charter): award attestations
  wait for them.
- **C-26** Charter document repository: only for signing Charter documents as PDFs. Attestations on
  records don't need it.
- **Legal and owner items** (into [`../manual-steps.md`](../manual-steps.md) if approved):
  - the consent-to-electronic-records wording;
  - the Privacy Policy covering signing evidence (IP address, browser);
  - Terms of Service saying what e-signatures may and may not be used for;
  - which plans include signatures (billing).

## 7. Do alongside it (groundwork, even before S-29)

1. **Fingerprint every stored file.** Add `sha256` to `board.document_versions` and Charter's branding
   and receipt files, computed on upload. A signature can then say exactly which version was signed,
   and old files can be checked. Small; Board migration plus an upload change.
2. **A versioned "consent to electronic records" document.** The hub already records legal
   acceptances (H-07, `hub.legal_acceptances`). Add this document type, so people can accept it once
   per version.
3. **Tamper-evident audit logs across the apps.** Use SignuDoc's hash chain for Board, Charter and
   Ledger's append-only audit logs. It strengthens the evidence for SOC 2 (CC7) and for signatures.
4. **Record identity assurance.** Store how sure we were of who did an action (password, two-step,
   confirm-it's-you, emailed code) alongside sensitive actions. Signatures need it, and approvals and
   votes benefit.
5. **Retention and legal hold.** Rules for how long signed records are kept, and a hold that stops
   deletion (including organization deletion's grace period) while a dispute is open.
6. **A "what e-signatures are and aren't for" page** on the docs site, like SignuDoc's
   `/electronic-signatures`. Ordinary agreements, minutes, attestations: yes. Wills, court documents,
   notarised and real-estate documents: no.
7. **A Worker bundle size check in CI.** Fail the build if a Worker nears Cloudflare's limit. The PDF
   engine, PDF.js and fonts are big.
8. **Talk to SignuDoc upstream.** Ask whether they'd publish the engine (PDF finalize, certificate, seal, audit
   chain, verify) as its own package with no Next.js or Vercel code. Then we depend on it instead of
   copying it, and fixes flow both ways. Until then, copy a pinned version with its MIT notice, and
   note which upstream commit each file came from.
9. **Reuse one signature component.** Typed and drawn signatures in the shared UI, accessible and
   sized for phones (per the devices review), so attestations and documents look the same.

## 8. Risks

| Risk                                                   | How we handle it                                                                                                                                                                                                                |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SignuDoc is days old and changing fast                 | Copy a pinned commit; our own tests (certificate, chain, verify, tampering) decide, not theirs; re-sync on purpose.                                                                                                             |
| Legal weight                                           | We provide the features ESIGN/UETA look for (consent, intent, attribution, record keeping). We don't promise a signature is valid for a purpose, and say what it isn't for (section 7.6). Owner to check wording with a lawyer. |
| Worker CPU and size limits                             | Cap PDF size and pages; leave CJK out at first; measure big PDFs before S-31 ships; move finishing to a queue if needed.                                                                                                        |
| Seal key theft (only if the seal is added later, S-33) | The key is encrypted with a Worker secret and used only in the hub's Worker. Rotation keeps old seals verifiable (SignuDoc's `retired_at` design). Covered in SECRETS.md and the security review.                               |
| Signing evidence is personal data                      | IP and browser kept only as long as the record; in the Privacy Policy and the export; erasure rules match retention.                                                                                                            |
| Scope creep toward DocuSign                            | Keep to attestations and everyday documents. Bulk send, payments and integrations are out of scope.                                                                                                                             |

## 9. Decisions for the owner

1. **Approve option C** (port the engine into a suite service) and the order in section 5.
2. **Attestations first** (S-30 before S-31)?
3. **The seal:** decided (2026-11-18): a Certificate of Completion on the end of each signed PDF,
   with the Verify page; no PAdES seal for now. A self-signed seal is the fallback if wanted.
4. **Plans:** is signing in every plan, or a paid feature?
5. **Groundwork now:** approve items 1–4 of section 7 (small, useful on their own).
6. **Upstream:** OK to contact SignuDoc's maintainers about a separate engine package?
