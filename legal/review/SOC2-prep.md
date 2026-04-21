# SOC 2 Type I → Type II readiness — Bema managed-cloud

**Audit framework:** AICPA Trust Services Criteria (TSP 100, 2017 revision with 2022 / 2023 / 2024 points-of-focus updates).
**Trust service categories in scope:** Security (Common Criteria CC1–CC9) plus Confidentiality (C1) plus Privacy (P1–P8) plus Availability (A1). Processing Integrity (PI1) deferred to Phase 4 if customer demand emerges.
**Template version:** 1.0.0-draft
**Maintained by:** Bema Workstream I (Compliance), in coordination with Workstream F (release tooling), Workstream D (storage), and Workstream G-back (server).
**Audience:** internal security and engineering leads; future SOC 2 audit firm; procurement-security teams reviewing SOC 2 readiness.

> **Status — DRAFT roadmap.** Type I (point-in-time design-only) is a Phase 2 deliverable (target M3 of Phase 2 calendar; ≈ 6 months post-PoC ship). Type II (period-of-time operating-effectiveness) is a Phase 3 deliverable (target M9–M12; ≈ 12 months post-PoC ship). This document specifies the scope, control catalogue, evidence-collection matrix, and milestone plan; it is not an attestation. Read alongside `CAIQ-v4.0.3.md` (CCM mapping) and `SIG-Lite-2024.md` (SIG mapping).

---

## 1. Audit objectives and scope

### 1.1 Objectives

- **Phase 2 — SOC 2 Type I.** Confirm the design of controls as of a point-in-time. Customers can read the report to assess whether Bema's described controls are designed appropriately to meet the Trust Services Criteria.
- **Phase 3 — SOC 2 Type II.** Confirm both design **and** operating effectiveness over a period (typically 6 to 12 months of observation). This is the report most enterprise procurement teams require.

### 1.2 In-scope service / system

- The Bema managed-cloud product offering — ingest, ClickHouse analytics, Postgres control plane, Next.js dashboard, worker, gateway.
- The customer-data lifecycle from collector → ingest → storage → dashboard → erasure.
- Supporting infrastructure: cloud-provider services (computing, storage, networking, KMS), CI/CD release pipeline, monitoring + alerting.

### 1.3 Out of scope

- Self-host deployments (customer infrastructure; Bema's role is product supplier, not service operator).
- Solo / embedded mode (no service relationship).
- Sub-processors (their own SOC 2 reports inherited).

### 1.4 In-scope Trust Services Criteria

| Category | Criteria | Inclusion rationale |
|---|---|---|
| **Security** | CC1–CC9 (Common Criteria) | Mandatory baseline |
| **Availability** | A1.1, A1.2, A1.3 | Customer-SLA-relevant |
| **Confidentiality** | C1.1, C1.2 | Personal-data and customer-IP confidentiality is core to Bema's value proposition |
| **Privacy** | P1.1–P8.1 | GDPR / CCPA / EU AI Act overlap; works-council-instrument cross-reference |
| **Processing Integrity** | PI1.1–PI1.5 | Deferred to Phase 4 unless customer demand surfaces; not required for typical TPRM uses |

---

## 2. Control catalogue

The following catalogue maps Trust Services Criteria → Bema controls → evidence sources. Controls are described per the AICPA TSP 100 numbering. Each row also lists the existing evidence in this repository / shipped product that the auditor will examine.

### 2.1 Common Criteria — CC1 Control Environment

| Criterion | Bema control | Evidence |
|---|---|---|
| CC1.1 — Demonstrates commitment to integrity and ethical values | Code of Conduct; whistleblower channel; signed confidentiality + IP-assignment | Internal HR documents (NDA) |
| CC1.2 — Board oversight of internal control | Quarterly security-and-compliance review at executive level | Board minutes (NDA) |
| CC1.3 — Establishes structures, reporting lines, authorities, responsibilities | RACI for security, engineering, support, sales | Internal RACI (NDA) |
| CC1.4 — Demonstrates commitment to attract, develop, retain competent individuals | Hiring competency matrix; annual performance review; technical-training stipends | HR records |
| CC1.5 — Holds individuals accountable for internal-control responsibilities | Annual performance review includes security-and-compliance objectives | HR records |

### 2.2 CC2 Communication and Information

| Criterion | Bema control | Evidence |
|---|---|---|
| CC2.1 — Obtains or generates relevant, quality information to support internal control | Continuous metrics (privacy gates, scoring eval, perf gates); SLO dashboards; incident telemetry | CI artifacts; SLO dashboards |
| CC2.2 — Internally communicates information to support internal control | All-hands; team-channel announcements; CHANGELOG per release; security-advisory mailing list | Internal channels |
| CC2.3 — Communicates with external parties | `SECURITY.md`; trust portal (Phase 2+); customer-status page | Public artifacts |

### 2.3 CC3 Risk Assessment

| Criterion | Bema control | Evidence |
|---|---|---|
| CC3.1 — Specifies suitable objectives | PRD §10 milestones; per-workstream PRDs; SLO definitions | PRD; workstream PRDs |
| CC3.2 — Identifies risks to objectives | DPIA §4 risk register; per-PRD challenger review | DPIA; PRD challenger sections |
| CC3.3 — Considers potential for fraud | Insider-threat policy; separation-of-duties; least-privilege | Internal policy (NDA) |
| CC3.4 — Identifies and assesses changes that could significantly affect internal control | Quarterly compliance review; per-release impact assessment | Internal review records |

### 2.4 CC4 Monitoring Activities

| Criterion | Bema control | Evidence |
|---|---|---|
| CC4.1 — Selects, develops, and performs ongoing and/or separate evaluations | Continuous CI gates; SOC 2 Type II observation; annual pen-test from Phase 3; quarterly internal review | CI artifacts; pen-test reports |
| CC4.2 — Evaluates and communicates internal-control deficiencies | Internal tracker with severity-based SLAs; customer-notification SLA for SEV1/SEV2; audit-finding remediation plans | Internal tracker; customer notifications |

### 2.5 CC5 Control Activities

| Criterion | Bema control | Evidence |
|---|---|---|
| CC5.1 — Selects and develops control activities to mitigate risks | Per CLAUDE.md §Security Rules + §Database Rules + §Privacy Model Rules; DPIA §5 measures | CLAUDE.md; DPIA |
| CC5.2 — Selects and develops general controls over technology | Tech-stack pinning; container hardening; secret-management; KMS | CLAUDE.md §Tech Stack; infra IaC (NDA) |
| CC5.3 — Deploys control activities through policies and procedures | Internal policy library (NDA); public CLAUDE.md + SECURITY.md | Internal + public docs |

### 2.6 CC6 Logical and Physical Access Controls

| Criterion | Bema control | Evidence |
|---|---|---|
| CC6.1 — Implements logical access security software, infrastructure, and architectures | Better Auth; SSO + WebAuthn / TOTP 2FA; Postgres RLS; ClickHouse row policies; JWT-derived identity (CLAUDE.md §Architecture Rules point 8) | `apps/web`; `apps/ingest`; `packages/schema` migrations |
| CC6.2 — Authorizes prior to issuing system credentials | SSO + SCIM (Phase 4); manual provisioning before SCIM; CRO approval for privileged access | HR onboarding; SSO audit log |
| CC6.3 — Authorizes, modifies, removes access in a timely manner | Quarterly access review; same-day deprovision-on-termination | SCIM logs; access-review records |
| CC6.4 — Restricts physical access to facilities and protected information assets | Inherited from upstream cloud provider for data centres; office badges; visitor log | Upstream attestations; office records |
| CC6.5 — Discontinues logical and physical protections over physical assets | Asset-decommissioning procedure; KMS key destruction | Internal runbook |
| CC6.6 — Implements logical-access security measures to protect against threats from sources outside its system boundaries | TLS 1.3; WAF; DDoS protection; Envoy gateway; cert-pinning on collector | Cloud-provider config; gateway config |
| CC6.7 — Restricts the transmission, movement, and removal of information | Forbidden-field rejection (HTTP 400); egress allowlist (`--ingest-only-to`); CLOUD Act resistance clause; SCCs Module 2 | `apps/ingest`; collector code; `legal/review/SCCs-module-2.md` |
| CC6.8 — Implements controls to prevent or detect and act upon the introduction of unauthorized or malicious software | Container image scanning; per-dev binary SHA256 in dashboard with non-canonical-binary alert; signed releases (Sigstore + cosign + SLSA L3) | Release workflow; dashboard alerts |

### 2.7 CC7 System Operations

| Criterion | Bema control | Evidence |
|---|---|---|
| CC7.1 — Detects and monitors changes (including unauthorized changes) | Append-only `audit_log`; SIEM ingestion (Phase 2+); anomaly detector (hourly) | `audit_log`; anomaly detector |
| CC7.2 — Monitors the system and the operation of those controls | SLO dashboards; on-call rotation; pino structured logs to central pipeline | Internal dashboards |
| CC7.3 — Evaluates security events to determine response | Severity matrix in SIRP; incident commander | SIRP (NDA) |
| CC7.4 — Responds to identified security incidents | Incident runbook; customer-notification SLA for SEV1/SEV2 | SIRP |
| CC7.5 — Implements activities to recover from identified incidents | Post-mortem template; remediation tracker | Internal tracker |

### 2.8 CC8 Change Management

| Criterion | Bema control | Evidence |
|---|---|---|
| CC8.1 — Authorizes, designs, develops, configures, documents, tests, approves, implements changes | GitHub PR; CODEOWNERS; branch protection on `main`; CI matrix (typecheck, lint, unit, privacy, scoring, perf); merge-blocking gates | `.github/workflows/`; PR history |

### 2.9 CC9 Risk Mitigation

| Criterion | Bema control | Evidence |
|---|---|---|
| CC9.1 — Identifies, selects, and develops risk-mitigation activities | DPIA §5 measures; per-PRD challenger review | DPIA; PRD challengers |
| CC9.2 — Assesses and manages risks associated with vendors and business partners | Sub-processor questionnaires; DPA + SCCs per sub-processor; quarterly sub-processor review | DPA Sub-Processor Schedule |

### 2.10 Availability — A1

| Criterion | Bema control | Evidence |
|---|---|---|
| A1.1 — Manages capacity demand to enable availability commitments | Per-tenant quotas; Redpanda partition-by-tenant; capacity-planning monthly | Internal capacity reports |
| A1.2 — Authorizes, designs, develops, implements, operates, approves, maintains environmental protections | Inherited from upstream cloud provider | Upstream attestations |
| A1.3 — Tests recovery plan procedures | Annual DR exercise; weekly restore test on sample tenant | DR-exercise reports |

### 2.11 Confidentiality — C1

| Criterion | Bema control | Evidence |
|---|---|---|
| C1.1 — Identifies and maintains confidential information | Tier classification A / B / C; data-flow diagrams in DPIA | DPIA §1 |
| C1.2 — Disposes of confidential information | Partition-drop on `(tenant_id, engineer_id, day)`; KMS key destruction; 7-day erasure SLA | `apps/worker/src/jobs/partition_drop.ts`; CLAUDE.md §GDPR |

### 2.12 Privacy — P1 to P8

The Privacy criteria require an extensive treatment because Bema's product centre-of-gravity is workplace privacy. Cross-references to the DPIA and the Bill of Rights rider supply most of the depth; this section enumerates the SOC 2 control rows.

| Criterion | Bema control | Evidence |
|---|---|---|
| P1.1 — Notice — provides notice to data subjects about its privacy practices | Bill of Rights at `/privacy`; version-pinned in `packages/config/src/bill-of-rights.ts`; works-council / CSE / union instruments where applicable | `packages/config/src/bill-of-rights.ts`; `legal/review/works-agreement-DE.md`; `legal/review/cse-consultation-FR.md`; `legal/review/union-agreement-IT.md` |
| P2.1 — Choice and consent | Tier C requires per-IC project opt-in or signed Ed25519 tenant flip with cooldown + banner (D20); maturity-ladder is private to IC | `legal/review/bill-of-rights-rider.md` Rights 4 + 6 |
| P3.1 — Collection — collects personal information consistent with criteria identified in its privacy notice | Forbidden-field rejection (HTTP 400); on-device Clio pipeline (D27); server-side redaction | `apps/ingest`; `packages/clio`; `packages/redact` |
| P4.1 — Use, retention, disposal — uses personal information consistent with criteria identified in its privacy notice | DPA §2 purpose limitation; DPIA §2.3 unlawful-purpose list; partition-based retention | DPA; DPIA |
| P5.1 — Access — provides individuals with access to their personal information for review and update | `bematist export` 7-day SLA; `bematist audit --tail`; `bematist audit --my-accesses` | CLAUDE.md §Commands |
| P6.1 — Disclosure to third parties | DPA Sub-Processor Schedule + 30-day notice (SCCs Option 2) | `legal/review/SCCs-module-2.md` A.5 |
| P7.1 — Quality — maintains accurate, complete, current personal information | Pricing-version stamping (D21); metric versioning (D13) | `packages/scoring/src/v1/`; CLAUDE.md §Scoring Rules |
| P8.1 — Monitoring and enforcement — monitors compliance with its privacy policies and procedures | `audit_log` append-only; `audit_events` per manager view (D30); IC daily digest by default | Decision D30; `contracts/09` |

---

## 3. Evidence-collection matrix

For Type II observation, the auditor needs **operating-effectiveness evidence** — not just policy documents. The following matrix lists, per control area, what evidence Bema commits to retain and the retention period.

| Evidence class | Retention | Source |
|---|---|---|
| Code-review history | Indefinite | GitHub PR + CODEOWNERS audit log |
| CI run history (unit, lint, typecheck, privacy, scoring, perf) | 12 months minimum | GitHub Actions retention |
| Release artifacts + signatures + SBOMs | Indefinite | GitHub Releases + Rekor transparency log |
| Access reviews (quarterly) | 12 months minimum | Internal review records |
| Incident tickets + post-mortems | Indefinite | Internal tracker |
| SLO violation tickets | 12 months minimum | Internal tracker |
| `audit_log` and `audit_events` rows | Indefinite (per Bill of Rights rider §5–§6) | Postgres tables |
| DR exercise + restore-test results | 3 years | Internal records |
| Vendor-security review records | 3 years | Internal vendor-management records |
| Customer breach notifications | 3 years | Internal records + customer e-mail archive |
| Sub-processor change notifications | Indefinite | Customer-notification archive |
| Pen-test reports (Phase 3+) | Indefinite | Internal records |
| Privacy adversarial gate failures | 12 months minimum | CI artifacts |
| Scoring eval failures | 12 months minimum | CI artifacts |

---

## 4. Phase-2 Type-I plan (≈ 6 months effort post-PoC ship)

### 4.1 Pre-engagement (M0–M2 of Phase 2)

- **Auditor selection.** Engage a CPA firm with SOC 2 + ISAE 3402 experience (target firms: short list of three; RFP cycle; reference checks).
- **Scoping memo.** Lock in the in-scope system, sub-services, sub-processors, and exclusion-of-self-host rationale.
- **Readiness assessment.** Run an internal mock audit using the control catalogue above; identify gaps.
- **Gap remediation.** Address gaps before formal observation begins.
- **Policy library finalisation.** All policies in §2 above need to be in writing, dated, approved, and version-controlled (consider a private `compliance/` repo for NDA-restricted policies).

### 4.2 Engagement (M3 of Phase 2)

- **Walkthrough sessions** with the auditor for each control area (typically 3–6 sessions).
- **Evidence delivery** per the matrix in §3 above.
- **Observations and management responses** for each control where a deficiency is identified.
- **Bridge letter** for the gap between the audit point-in-time and the next refresh.

### 4.3 Type-I deliverables

- **SOC 2 Type I report** — auditor's opinion that controls are suitably designed as of the point-in-time.
- **Customer-facing summary** — high-level summary suitable for sharing with prospects under NDA (the full report is normally NDA-restricted).
- **Trust portal listing** — the report becomes available on the customer trust portal (Phase 2 deliverable).

---

## 5. Phase-3 Type-II plan (≈ 12 months effort)

### 5.1 Observation period

- **Duration.** Six months minimum; twelve months recommended for the first Type II.
- **Continuity.** Operating-effectiveness evidence must be continuously available across the period — gaps in evidence translate into qualified opinions.
- **Sample-based testing.** Auditor selects samples from the period (typically per-quarter samples).

### 5.2 Operating-effectiveness considerations

- **Privacy adversarial gate** must run on every PR throughout the period; failures are tracked to closure.
- **Scoring eval** must run on every change to `packages/scoring`; failures are tracked.
- **Perf gates** must run on every release; threshold breaches gated.
- **`audit_log` + `audit_events`** must be append-only at the DB level for the entire period; any privilege change requires audit-trail evidence.
- **DR exercise** must occur at least once during the period; results documented.
- **Pen-test** must occur within the period; remediations tracked.
- **Sub-processor changes** must follow the 30-day notice protocol throughout the period.

### 5.3 Type-II deliverables

- **SOC 2 Type II report** — auditor's opinion on design and operating effectiveness across the period.
- **Customer-facing summary.**
- **Trust portal listing.**
- **Bridge letter** — coverage between the period end-date and the next refresh.

---

## 6. Alignment with other compliance programs

Where customers also require ISO 27001, the SOC 2 control mapping aligns roughly with ISO 27001 Annex A controls. Bema's Phase-3 roadmap includes an ISO 27001 readiness assessment in parallel with the SOC 2 Type II observation; many controls are dual-purpose:

| SOC 2 area | ISO 27001 Annex A equivalent |
|---|---|
| CC1 (Control environment) | A.5 (Information security policies) + A.6 (Organization) |
| CC6 (Logical and physical access) | A.9 (Access control) + A.11 (Physical and environmental) |
| CC7 (System operations) | A.12 (Operations security) |
| CC8 (Change management) | A.14 (System acquisition, development and maintenance) |
| C1 (Confidentiality) | A.13 (Communications) + A.18 (Compliance) |
| Privacy P1–P8 | ISO 27701 Privacy Information Management System |

ISO 27701 (the privacy extension to 27001) is the cleanest companion to the SOC 2 Privacy criteria; Bema plans 27701 inclusion in the Phase-3 27001 effort.

---

## 7. Operational responsibilities

| Owner | Responsibility |
|---|---|
| Compliance (Workstream I) | This document; control catalogue stewardship; auditor liaison |
| Security engineering | Operate the controls; supply evidence on demand |
| Workstream F (Sebastian) | Release-pipeline controls; SBOM; provenance |
| Workstream D (Jorge) | `audit_log` + `audit_events` tamper-evidence; storage controls |
| Workstream G-back (Walid) | `redact` + ingest controls; forbidden-field rejection enforcement |
| Workstream H (Insight Engine) | `packages/scoring` operating-effectiveness; eval gate |
| HR | Onboarding / offboarding; training |
| Legal | Customer DPA + sub-processor agreements; CLOUD Act resistance clause |

---

## 8. Risk register and mitigations specific to SOC 2 readiness

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| SR-1 | Append-only `audit_log` invariant violated during a schema migration — Type II qualified opinion | High | Migrations PR-required; INT9-style invariant scan in CI; auditor walkthrough at each migration |
| SR-2 | Privacy adversarial gate suite weakened to pass a release — operating-effectiveness gap | High | Two-party PR review for `tests/privacy/**`; dashboard on gate-pass rate over time; auditor walkthrough |
| SR-3 | Sub-processor change notified without the 30-day window during the period — Type II qualified opinion | Medium | Sub-processor change requires Compliance sign-off before customer notice; 30-day clock auto-tracked |
| SR-4 | DR exercise skipped during the period — Type II qualified opinion | Medium | Calendar-locked annual exercise; on-call manager owns |
| SR-5 | Pen-test postponed beyond the period — Type II qualified opinion | Low | Annual contract with CREST-accredited firm pre-booked for Phase 3 onward |
| SR-6 | NDA-restricted policy library scope creep — auditor cannot examine | Low | Auditor-NDA template ready; single-point-of-contact for evidence requests |
| SR-7 | Self-host customers expect Bema to be responsible for their operating-effectiveness — scope confusion | Low | `legal/review/CAIQ-v4.0.3.md` and `legal/review/SIG-Lite-2024.md` clearly disclose the self-host carve-out; SOC 2 report scope clearly delineates managed-cloud only |

---

## 9. Phase milestones

| Phase | Milestone | Owner | Date target |
|---|---|---|---|
| Phase 2 | Auditor RFP completed and firm engaged | Compliance | M0 (Phase 2 start) |
| Phase 2 | Internal mock audit complete | Compliance + Security | M1 |
| Phase 2 | Gap remediation complete | All workstreams | M2 |
| Phase 2 | Type I walkthrough sessions begin | Compliance + Auditor | M3 |
| Phase 2 | Type I report delivered | Auditor | M3 + 4 weeks |
| Phase 3 | Type II observation period begins | All | Phase 3 start (≈ Phase 2 + 1 month) |
| Phase 3 | DR exercise within the period | DRP owner | Period mid-point |
| Phase 3 | Pen-test within the period | Compliance | Period mid-point |
| Phase 3 | Type II observation period ends | All | Phase 3 + 12 months |
| Phase 3 | Type II report delivered | Auditor | Period end + 6 weeks |
| Phase 3 | ISO 27001 + 27701 readiness assessment | Compliance | Parallel with Type II |

---

## 10. Customer-facing communication

- **Pre-Phase-2:** "SOC 2 Type I in progress; expected Q{{N}}." Surface in trust portal; cite this readiness document under NDA on request.
- **Phase 2 mid:** "SOC 2 Type I report available under NDA from {{IMPORTER_PRIVACY_CONTACT}}."
- **Phase 3 mid:** "SOC 2 Type II observation period in progress; expected report Q{{N}}."
- **Phase 3 ship:** "SOC 2 Type II report available under NDA. Bridge letter on request."

---

## Changelog

- **2026-04-17 — v1.0.0-draft.** Initial SOC 2 readiness roadmap (Workstream I A13). Phase 2 Type I → Phase 3 Type II milestone plan; control catalogue against AICPA TSP 100 (CC1–CC9 + A1 + C1 + P1–P8); evidence-collection matrix; risk register; ISO 27001 / 27701 alignment notes.

## Cross-references

- `dev-docs/PRD.md` §12 (Compliance — SOC 2 Type I at M3 Phase 2; Type II M9–M12 Phase 3).
- `CLAUDE.md` §"Compliance Rules", §"Security Rules", §"Database Rules", §"Privacy Model Rules", §"AI Rules".
- `dev-docs/workstreams/i-compliance-prd.md` §2 (out-of-scope for Sprint 1 → M3; deferred to Phase 2 / 3 PRDs).
- `legal/review/CAIQ-v4.0.3.md` — overlapping Common Criteria evidence.
- `legal/review/SIG-Lite-2024.md` — overlapping evidence; SIG → SOC 2 mapping.
- `legal/review/cyclone-dx-SBOM.md` — CC8.1 evidence (change management, supply-chain).
- `legal/review/SCCs-module-2.md` — CC6.7 evidence (cross-border).
- `legal/review/DPIA.md` — Privacy P1–P8 backing.
- `legal/review/works-agreement-DE.md`, `legal/review/cse-consultation-FR.md`, `legal/review/union-agreement-IT.md` — works-council instruments backing P1.1.

**Not legal or audit advice.** This is an internal readiness roadmap. The eventual SOC 2 reports are issued by an independent CPA firm following AICPA professional standards.
