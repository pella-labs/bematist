# `legal/review/` — Compliance artifact drafts (pending counsel review)

**Owner:** Sandesh (Workstream I — Compliance)
**Status:** scaffold (Sprint 1 Day 1) — all files in this directory are DRAFTS
**Scope:** Sprint 1 → M3 PoC ship

> **Promotion flow.** Files in `legal/review/` are AI-drafted templates awaiting qualified-counsel review. Once a file passes jurisdictional counsel review (DE / FR / IT / EU) **and** a real works-council review (where applicable), it is promoted to `legal/templates/` in a follow-up PR that removes it from this directory. **Do not ship a file from this directory to a customer.** See `legal/templates/README.md` for the promotion criteria per file.

This directory holds drafts of the customer-facing compliance artifacts Bema needs to sell into
EU mid-market and pass works-council review. Every file here has a corresponding regulatory
citation and a load-bearing place in the sales cycle. Scope, ship order, and per-file draft
sources are pinned in `dev-docs/workstreams/i-compliance-prd.md` §5.

Nothing in this directory is code. Rendering the Bill of Rights on `/privacy` is Sebastian's
(Workstream E / G-frontend) responsibility — he imports the canonical text from
`packages/config/src/bill-of-rights.ts`, which is the single source of truth.

## Artifact catalog (per i-compliance-prd §5)

| File | Purpose | Sales-cycle placement | Regulatory basis | Sprint |
|---|---|---|---|---|
| `README.md` (this file) | Index + usage guide | Internal reference | — | S1 |
| `works-agreement-DE.md` | Betriebsvereinbarung template for German works-council review | Pre-contract with any DE customer with a Betriebsrat | BetrVG §87(1) Nr. 6; §75 | S1 draft · S2 complete |
| `cse-consultation-FR.md` | CSE consultation dossier + projet d'accord de méthode (Groupe Alpha 15 déc. 2025 model) + L1222-4 individual notice | Pre-contract with any FR customer with a CSE | Code du travail Art. L1222-4, L2312-38, L2312-8 4°; RGPD Art. 88; TJ Nanterre 29 jan. 2026 (pilot-not-exempt); TJ Paris 2 sept. 2025 | S1 W2 draft · S2 complete |
| `union-agreement-IT.md` | Accordo sindacale template (modello GSK–ViiV 28 lug. 2025) for remote-monitoring-capable systems; 21d retention default per Garante Provv. 364/2024 | Pre-contract with any IT customer | Statuto dei Lavoratori Art. 4 c. 1 + c. 2 + c. 3 + Art. 8 + Art. 15 + Art. 28; GDPR Art. 88; Garante Provv. 364/2024; Cass. 28365/2025 | S1 W2 draft · S2 complete |
| `DPIA.md` | GDPR Art. 35 DPIA outline — customer DPO fills it | Attached to any EU customer's onboarding | GDPR Art. 35; ICO "Monitoring Workers" guidance | S1 outline · S2 complete |
| `SCCs-module-2.md` | SCCs 2021/914 Module 2 pre-fill + Transfer Impact Assessment (TIA) + DPF self-cert plan + Phase-2 Frankfurt EU-region migration | Signed with any EU→US data-transfer customer on Day 1; superseded by EU-region Frankfurt at Phase 2 | GDPR Chapter V; Commission Decision 2021/914; DPF Adequacy Decision (EU) 2023/1795; EO 14086 | S1 W2 draft · S3 complete |
| `CAIQ-v4.0.3.md` | Cloud Security Alliance CAIQ v4.0.3 pre-filled vendor questionnaire (17 CCM v4.0.12 domains) | Procurement security review; CSA STAR Registry submissions (Phase 3) | CSA CCM v4.0.12; SOC 2 TSP 100 cross-mapping | S1 W2 draft · Phase-3 deliverable polish |
| `SIG-Lite-2024.md` | Shared Assessments SIG Lite 2024 pre-filled vendor questionnaire (18 control domains) | Procurement TPRM reviews | Shared Assessments SIG Lite 2024 | S1 W2 draft · Phase-3 deliverable polish |
| `cyclone-dx-SBOM.md` | CycloneDX 1.5 JSON SBOM generation, validation, signing, release-gate plan | M3 release gate (IW-3); customer SCA tooling consumption | CycloneDX 1.5 (ECMA-424); SLSA Level 3 attestation; Sigstore + cosign | S1 W2 draft · S3 CI integrated |
| `SOC2-prep.md` | SOC 2 Type I (Phase 2) + Type II (Phase 3) readiness roadmap; control catalogue (CC1–CC9 + A1 + C1 + P1–P8) | Procurement SOC 2 readiness disclosure; auditor engagement | AICPA TSP 100 (2017 + 2022/2023/2024 updates); ISO 27001 / 27701 alignment | S1 W2 draft · Phase-2 Type I · Phase-3 Type II |
| `bill-of-rights-rider.md` | Formal contract rider mapping each of the six Bill of Rights items to statutory citation + product control + verification path | Included in enterprise MSA / DPA exhibits; load-bearing for works-council review | GDPR Art. 5, 13, 15, 17, 20, 25, 30; BetrVG §75, §87(1) Nr. 6; L2312-38; Art. 4 SdL | S1 draft · S2 legal-review-ready · S3 finalize |

## Bill of Rights — two-artifact strategy

1. **Friendly list** — rendered by Sebastian on `/privacy`, sourced from
   `packages/config/src/bill-of-rights.ts` (version-pinned). This is the warm,
   first-person-voice promise users see.
2. **Formal rider** — `bill-of-rights-rider.md` (in this directory). Third-person
   contract language, one paragraph per right, each paragraph citing the statute,
   naming the technical control, and describing the customer-verification path.

The two artifacts always carry the same six items in the same order. Version is
pinned in `packages/config/src/bill-of-rights.ts` via `BILL_OF_RIGHTS_VERSION`; the
rider must be bumped in lockstep whenever that version advances.

## Cross-references

- `dev-docs/workstreams/i-compliance-prd.md` — authoritative PRD for this workstream
- `dev-docs/PRD.md` §6.5 — the six Bill of Rights items, verbatim (locked)
- `dev-docs/PRD.md` §12 — full regulatory perimeter
- `CLAUDE.md` §"Compliance Rules", §"Privacy Model Rules", §"Security Rules"
- `packages/config/src/bill-of-rights.ts` — canonical Bill of Rights text + version
- `contracts/09-storage-schema.md` — `audit_events` and `audit_log` table locations
  (Bill of Rights items #5 and #6 reference these)

## Out of scope for Sprint 1 → M3

Deferred to later PRDs (per `i-compliance-prd.md` §2):

- Customer-facing DPA template → Phase 2 PRD
- Sub-processor list → Phase 2 PRD
- Annual pen-test plan → Phase 3 PRD

> Note: per the M2-gate brief, drafts of `CAIQ-v4.0.3.md`, `SIG-Lite-2024.md`,
> `cyclone-dx-SBOM.md`, and `SOC2-prep.md` were written in Sprint 1 Week 2 to
> get the structure ahead of the Phase-2 / Phase-3 deliverables. These remain
> drafts pending counsel + auditor review on the relevant phase milestones.
