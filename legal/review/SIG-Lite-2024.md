# Shared Assessments SIG Lite 2024 — Bema pre-fill

**Questionnaire version:** Shared Assessments SIG Lite 2024 (Standardized Information Gathering, Lite tier, 2024 release).
**Template version:** 1.0.0-draft
**Maintained by:** Bema Workstream I (Compliance).
**Audience:** third-party risk management (TPRM) teams; procurement security reviews.
**Applicability:** Bema **managed-cloud** product mode. Self-host deployments: most SIG Lite items become the Controller's responsibility on Controller infrastructure; Bema's scope is the shipped binaries + supply-chain controls.

> **Status — DRAFT.** SIG Lite 2024 is a ~350-question subset of the full SIG (≈ 1,800 questions) organised across 18 control domains. Bema pre-fills each question with (answer, compensating control if any, evidence pointer). Answers are processor-self-attested; independent audit (SOC 2 Type II) is a Phase-3 deliverable. Read alongside `CAIQ-v4.0.3.md`, `SCCs-module-2.md`, `DPIA.md`, `cyclone-dx-SBOM.md`, and `SOC2-prep.md`.

> **Note on question numbering.** The 2024 release renumbered several controls compared with 2023. This pre-fill uses the 2024 scheme; where ambiguity is possible, the control intent is paraphrased in the question column.

---

## Part A — Summary

| Attribute | Value |
|---|---|
| Respondent | Bema — managed-cloud legal entity per executed MSA |
| Service offering | AI-engineering analytics — event ingest, ClickHouse analytics, Postgres control-plane, Next.js dashboard |
| Release tag at assessment | {{VERSION_LOGICIELLE}} |
| Data classification handled | Internal / Confidential / Personal (GDPR scope); not Regulated Special (PCI / HIPAA) without an addendum |
| Data subject types | Employees and contractors of the Controller |
| Deployment modes | Self-host (default); managed-cloud; solo/embedded (≤ 50 devs) |
| Geographic presence (managed-cloud) | Phase 1: US; Phase 2: Frankfurt (EU); Phase 3: EU default |
| Sub-processors | Per DPA Sub-Processor Schedule — Phase-2 deliverable |
| Compliance frameworks referenced | SOC 2 TSP 100 (Type I Phase 2; Type II Phase 3), ISO 27001 (Phase 3 roadmap), GDPR, UK-GDPR, CCPA/CPRA, EU AI Act Annex III, BetrVG §87(1)(6), Art. L2312-38, Statuto dei Lavoratori Art. 4, DPF |

---

## Part B — Domain-by-domain answers

### B.1 — Enterprise Risk Management (A)

| # | Question | Answer | Evidence |
|---|---|---|---|
| A.1.1 | Is a formal enterprise risk management (ERM) program documented and approved? | Y | Internal ERM policy (NDA); PRD §12 regulatory perimeter |
| A.1.2 | Is a risk-management framework (ISO 31000 / COSO / NIST RMF) referenced? | Y | Hybrid ISO 31000 + NIST RMF (NDA) |
| A.1.3 | Is the ERM program reviewed at least annually? | Y | Annual review calendar |
| A.2.1 | Is a risk register maintained? | Y | Internal RR (NDA) |
| A.2.2 | Are risks tiered? | Y | Four tiers: Critical / High / Medium / Low |
| A.2.3 | Are risk-treatment options documented per risk? | Y | Accept / Mitigate / Transfer / Avoid |
| A.3.1 | Are key risk indicators (KRIs) defined? | Y | p95/p99 SLOs; privacy gate recall; scoring eval MAE; adversarial judge threshold |
| A.3.2 | Is risk appetite documented? | Y | Internal risk-appetite statement (NDA) |
| A.4.1 | Is there a Chief Risk / Compliance Officer or equivalent? | Y | Head of Security doubles as CRO at Phase 1; dedicated CRO at Phase 3 |
| A.4.2 | Are audit / risk findings tracked to closure? | Y | Internal tracker; severity-based SLAs |

### B.2 — Security Policy (B)

| # | Question | Answer | Evidence |
|---|---|---|---|
| B.1.1 | Is an information-security policy documented and approved? | Y | `SECURITY.md` (public); internal infosec policy (NDA) |
| B.1.2 | Is the policy communicated to personnel and contractors? | Y | On-hire + annual refresh |
| B.1.3 | Is the policy reviewed annually? | Y | Annual review calendar |
| B.2.1 | Are security roles and responsibilities documented? | Y | Internal RACI (NDA); CODEOWNERS in repo for code ownership |
| B.2.2 | Is separation of duties enforced? | Y | Admin cannot read prompt text (CLAUDE.md §Privacy Model Rules); two-person rule for tenant Tier flip (Ed25519 + 7-day cooldown, Decision D20) |
| B.3.1 | Is acceptable-use policy documented? | Y | Internal AUP (NDA) |
| B.3.2 | Are penalties for policy violation documented? | Y | AUP + employment contract |
| B.4.1 | Is a security exception process defined? | Y | Exception-request workflow with CRO approval |

### B.3 — Organizational Security (C)

| # | Question | Answer | Evidence |
|---|---|---|---|
| C.1.1 | Is there an information security function? | Y | Security engineering team |
| C.1.2 | Does the infosec function report to executive management? | Y | To the CEO / CRO |
| C.1.3 | Is there a security steering committee? | Y | Quarterly |
| C.2.1 | Is an incident-response team identified? | Y | On-call rotation + incident commander |
| C.2.2 | Are security roles staffed by trained personnel? | Y | Role-specific training; annual certification |
| C.3.1 | Are vendors and sub-processors governed by contractual security requirements? | Y | DPA + SCCs per sub-processor |

### B.4 — Asset and Information Management (D)

| # | Question | Answer | Evidence |
|---|---|---|---|
| D.1.1 | Is an asset inventory maintained? | Y | CMDB + MDM |
| D.1.2 | Are information assets classified? | Y | Public / Internal / Confidential / Personal; plus Tier A / B / C for event data |
| D.1.3 | Are classification labels applied to data? | Y | Data classification at ingest via tier tagging; RLS + row policies enforce |
| D.2.1 | Is an information-handling procedure defined per classification? | Y | Per CLAUDE.md §Privacy Model Rules |
| D.3.1 | Is sensitive data inventoried? | Y | DPIA §1.2 |
| D.3.2 | Is data retention by classification documented? | Y | Tier A 90d / Tier B 90d / Tier C 30d / IT 21d / aggregates indefinite-pseudonymized; `audit_log` indefinite append-only |
| D.4.1 | Is media sanitisation documented? | Y | Partition-drop on storage; KMS-key destruction for encrypted archives; upstream cloud-provider inherited controls for physical media |
| D.5.1 | Is data-masking used where necessary? | Y | Server-side redaction (TruffleHog + Gitleaks + Presidio); `HMAC(engineer_id, tenant_salt)` pseudonymisation; on-device Clio abstraction (Decision D27) |

### B.5 — Human Resources Security (E)

| # | Question | Answer | Evidence |
|---|---|---|---|
| E.1.1 | Is background screening performed? | Y | Per jurisdictional limits |
| E.1.2 | Are employment agreements including security obligations signed? | Y | Standard IP + confidentiality |
| E.2.1 | Is security awareness training conducted on hire? | Y | Day-1 module |
| E.2.2 | Is annual refresher training conducted? | Y | Annual |
| E.2.3 | Is role-specific training conducted? | Y | Engineering / sales / support tracks |
| E.3.1 | Is a termination procedure defined? | Y | Access revocation checklist; badge / hardware return |
| E.3.2 | Is access revoked on the day of termination? | Y | SSO / SCIM deprovisioning |

### B.6 — Physical and Environmental Security (F)

| # | Question | Answer | Evidence |
|---|---|---|---|
| F.1.1 | Are data centres physically secured? | NA — inherited | Upstream cloud-provider SOC 2 + ISO 27001 |
| F.1.2 | Is physical access controlled? | NA — inherited | Upstream |
| F.1.3 | Is environmental monitoring in place? | NA — inherited | Upstream |
| F.2.1 | Are offices physically secured? | Y | Badge access; visitor log |
| F.2.2 | Are teleworkers supported securely? | Y | MDM + VPN-less zero-trust (device posture + SSO) |

### B.7 — Communications and Operations Management (G)

| # | Question | Answer | Evidence |
|---|---|---|---|
| G.1.1 | Are operating procedures documented? | Y | Internal runbooks |
| G.1.2 | Are change-management procedures followed? | Y | GitHub PR; branch protection; CODEOWNERS |
| G.2.1 | Are capacity-planning procedures in place? | Y | Per-tenant quotas; Redpanda partition-by-tenant |
| G.3.1 | Are development / test / production environments segregated? | Y | Separate AWS / GCP accounts (or equivalent) per environment |
| G.4.1 | Is malware protection deployed on production systems? | Y | EDR on endpoints; image scanning on containers |
| G.5.1 | Are backups performed? | Y | Hourly incremental; immutable object storage; weekly restore test |
| G.6.1 | Are backups tested? | Y | Weekly restore test on a sample tenant |
| G.6.2 | Is backup encryption in place? | Y | AES-256-GCM at rest |
| G.7.1 | Are network controls in place? | Y | Default-deny; Envoy + Rust `ext_authz`; TLS 1.3 termination at edge |
| G.8.1 | Are secure transmission mechanisms used? | Y | TLS 1.3; cert-pinning on collector |
| G.9.1 | Are exchanges of information with external parties formalised? | Y | DPA + SCCs; webhook HMAC; ingest key format `bm_<orgId>_<keyId>_<secret>` |
| G.10.1 | Are media handling and transportation controlled? | NA — inherited | Upstream cloud provider |
| G.11.1 | Is monitoring of system use performed? | Y | pino structured logs; Sentry; SIEM ingestion (Phase 2+) |
| G.11.2 | Are logs protected from tampering? | Y | Append-only at DB level; tamper-evident HMAC chain at Phase 3 |

### B.8 — Access Control (H)

| # | Question | Answer | Evidence |
|---|---|---|---|
| H.1.1 | Is a formal access-control policy defined? | Y | Internal (NDA) |
| H.1.2 | Is least-privilege enforced? | Y | Role matrix per DPIA §3.4; Postgres RLS on every org-scoped table; ClickHouse row policies |
| H.2.1 | Is user registration and deregistration formalised? | Y | SSO + SCIM via WorkOS (Phase 4) |
| H.2.2 | Are access rights reviewed periodically? | Y | Quarterly |
| H.3.1 | Are privileged access accounts controlled? | Y | Break-glass, logged |
| H.3.2 | Is MFA enforced for privileged access? | Y | Mandatory; also required for Reveal and CSV-export-with-prompts |
| H.4.1 | Are passwords required to meet complexity standards? | Y | WebAuthn preferred; TOTP where WebAuthn unavailable |
| H.4.2 | Is password history maintained? | Y | Via Better Auth |
| H.5.1 | Are systems configured for automatic session timeout? | Y | Configurable per tenant policy; default 12h |
| H.6.1 | Is network access controlled? | Y | Zero-trust: SSO + device posture |
| H.7.1 | Is access to source code controlled? | Y | GitHub org with branch protection; CODEOWNERS; 2FA required for all org members |
| H.8.1 | Is information access restricted? | Y | RLS on tenant data; JWT-derived tenant / engineer / device identity (per CLAUDE.md §Architecture Rules point 8) |
| H.9.1 | Is system utility access restricted? | Y | Break-glass process |

### B.9 — Application Security (I)

| # | Question | Answer | Evidence |
|---|---|---|---|
| I.1.1 | Is a secure-development process documented? | Y | PR review; CI gates (typecheck, lint, unit, privacy, scoring, perf) |
| I.1.2 | Are developer-training requirements documented? | Y | Annual secure-dev training |
| I.2.1 | Are application security requirements documented? | Y | CLAUDE.md §Security Rules, §Database Rules, §API Rules |
| I.3.1 | Is input validation performed? | Y | Zod schemas at API boundary; forbidden-field rejection at ingest (HTTP 400) |
| I.3.2 | Is output encoding performed? | Y | Next.js default encoding; React escaping |
| I.4.1 | Is authentication implemented securely? | Y | Better Auth; WebAuthn preferred; signed JWT |
| I.4.2 | Is session management secure? | Y | Short-TTL tokens; rotation on privilege change |
| I.5.1 | Is data validation performed on server-side? | Y | Source of truth is server-side zod schemas in `packages/api/src/schemas/` |
| I.6.1 | Is error handling documented not to leak sensitive information? | Y | Structured error codes; no stack traces to end-users |
| I.7.1 | Is logging and monitoring integrated into the application? | Y | pino structured |
| I.8.1 | Are application vulnerabilities tracked? | Y | Dependabot + CodeQL SAST + annual pen-test from Phase 3 |
| I.9.1 | Are security tests performed before release? | Y | Merge-blocking: privacy adversarial suite; 500-case scoring eval; perf gates |
| I.10.1 | Are third-party components managed? | Y | CycloneDX SBOM per release; Dependabot; quarterly dep review |

### B.10 — Information Security Incident Management (J)

| # | Question | Answer | Evidence |
|---|---|---|---|
| J.1.1 | Is an incident response (IR) plan documented? | Y | Internal SIRP (NDA); `SECURITY.md` disclosure path |
| J.1.2 | Is the IR plan tested annually? | Y | Annual tabletop |
| J.2.1 | Are incidents classified? | Y | Severity matrix SEV1..SEV4 |
| J.2.2 | Are incidents reported to customers? | Y | SEV1 / SEV2 customer-notification SLA |
| J.3.1 | Are data-breach notifications handled per GDPR Art. 33 / 34? | Y | 72-hour SA notification; data-subject notification where risk is high |
| J.4.1 | Are incident forensics preserved? | Y | Chain-of-custody procedure |
| J.5.1 | Are post-incident reviews conducted? | Y | Post-mortem template |

### B.11 — Business Resiliency (K)

| # | Question | Answer | Evidence |
|---|---|---|---|
| K.1.1 | Is a Business Continuity Plan (BCP) documented? | Y | Internal BCP (NDA) |
| K.1.2 | Is BCP tested annually? | Y | Annual DR exercise |
| K.2.1 | Is a Disaster Recovery Plan (DRP) documented? | Y | Internal DRP (NDA); RPO ≤ 1h (Tier B); RTO ≤ 4h (Tier B) |
| K.2.2 | Is DRP tested? | Y | Annual |
| K.3.1 | Are backup and restoration procedures documented? | Y | Hourly incremental; weekly restore test |

### B.12 — Compliance (L)

| # | Question | Answer | Evidence |
|---|---|---|---|
| L.1.1 | Is a compliance program documented? | Y | PRD §12; `legal/review/` |
| L.2.1 | Are applicable laws and regulations identified? | Y | PRD §12 regulatory perimeter |
| L.3.1 | Are intellectual-property rights protected? | Y | Open-source licensing: Apache 2.0 + BSL 1.1 → Apache 2.0 after 4 years (Decision D18); contributor IP assignment |
| L.4.1 | Is personal data processed in compliance with applicable laws? | Y | GDPR + UK-GDPR + CCPA / CPRA; DPIA; works-council / CSE / union instruments per jurisdiction; SCCs + TIA + DPF |
| L.5.1 | Are independent reviews of information security conducted? | Phase 3: Y | Phase 1 / 2: internal + targeted engagements | SOC 2 Type I Phase 2; Type II Phase 3; annual pen-test from Phase 3 |
| L.6.1 | Are technical compliance reviews performed? | Y | Continuous CI privacy gates; quarterly review |

### B.13 — End User Device Security (M)

| # | Question | Answer | Evidence |
|---|---|---|---|
| M.1.1 | Is an end-user-device policy documented? | Y | MDM policy; FDE mandatory |
| M.2.1 | Is mobile-device management (MDM) deployed? | Y | Commercial MDM |
| M.3.1 | Are laptops encrypted? | Y | FDE |
| M.4.1 | Are removable media controlled? | Y | MDM policy blocks unsanctioned USB by default |
| M.5.1 | Is endpoint detection and response (EDR) deployed? | Y | EDR on all endpoints |

### B.14 — Network Security (N)

| # | Question | Answer | Evidence |
|---|---|---|---|
| N.1.1 | Is a network-security policy documented? | Y | Default-deny; zero-trust posture |
| N.2.1 | Are firewall rules documented and reviewed? | Y | Managed IaC; PR review required |
| N.3.1 | Is network segmentation implemented? | Y | Per-tenant segmentation on managed-cloud |
| N.4.1 | Is wireless-network security documented? | Y | Office: WPA3 + 802.1X |
| N.5.1 | Is remote-access security documented? | Y | Zero-trust; SSO + device posture; no VPN |

### B.15 — Privacy (P)

| # | Question | Answer | Evidence |
|---|---|---|---|
| P.1.1 | Is a privacy policy documented? | Y | `/privacy` (customer deployments); DPA |
| P.1.2 | Is a Data Protection Officer appointed? | Y | {{DPO_NAME}} — customer-DPO for managed-cloud deployments; vendor-DPO contact at Bema |
| P.2.1 | Is a privacy-impact-assessment process in place? | Y | `legal/review/DPIA.md`; per-release re-review |
| P.3.1 | Are data-subject rights procedures documented? | Y | `bematist export` + `bematist erase`; 7-day SLA |
| P.4.1 | Are data-retention and disposal procedures documented? | Y | Per tier; partition-drop atomic |
| P.5.1 | Is cross-border data-transfer governed? | Y | SCCs 2021/914 Module 2 + TIA + DPF (Phase 1); Frankfurt EU (Phase 2) — `legal/review/SCCs-module-2.md` |
| P.6.1 | Is the use of data minimised? | Y | Tier B shipped default (D7); on-device Clio pipeline (D27); forbidden-field rejection |
| P.7.1 | Is data subject consent managed? | Y | For Tier C project-level opt-in (the only place consent is the primary basis); general processing rests on Art. 6(1)(f) legitimate interest per DPIA §2 |
| P.8.1 | Is a breach-notification process documented? | Y | GDPR Art. 33 / 34; 72-hour SA notification SLA |
| P.9.1 | Are works-council instruments provided where required? | Y | `works-agreement-DE.md`; `cse-consultation-FR.md`; `union-agreement-IT.md` |
| P.10.1 | Are transparency obligations met? | Y | Bill of Rights at `/privacy`; version-pinned in `packages/config/src/bill-of-rights.ts`; IC notification of manager views (Decision D30) |

### B.16 — Threat Management (R)

| # | Question | Answer | Evidence |
|---|---|---|---|
| R.1.1 | Is a threat-intelligence program documented? | Y | Advisory-feed ingestion |
| R.2.1 | Are threat models developed for critical systems? | Y | Per-workstream threat model in PRD challenger review |
| R.3.1 | Is anti-malware used on critical systems? | Y | EDR; container image scanning |
| R.4.1 | Are intrusion-detection / prevention systems in place? | Y | Cloud-native WAF + anomaly detection on ingest |
| R.5.1 | Is vulnerability management documented? | Y | Severity-based SLA (critical 48h / high 7d / medium 30d) |
| R.6.1 | Are penetration tests performed? | Phase 3: Y | Phase 1/2 internal + targeted | CREST-accredited annual from Phase 3 |

### B.17 — Server Security (S)

| # | Question | Answer | Evidence |
|---|---|---|---|
| S.1.1 | Are server-hardening standards documented? | Y | CIS-inspired baseline; container base `oven/bun:1.2-alpine` |
| S.2.1 | Is patching performed on a defined cadence? | Y | Critical 48h; high 7d; monthly for others |
| S.3.1 | Are unnecessary services disabled? | Y | Minimal container images; multi-stage builds |
| S.4.1 | Is anti-malware deployed on servers? | Y | Image scanning + runtime agent |
| S.5.1 | Is log-forwarding enabled? | Y | Central log pipeline |

### B.18 — Cloud Hosting (V)

| # | Question | Answer | Evidence |
|---|---|---|---|
| V.1.1 | Is the cloud-hosting provider identified? | Y | AWS / GCP / Azure per managed-cloud region |
| V.2.1 | Is the cloud-hosting provider SOC 2 / ISO 27001 certified? | Y | Upstream attestations |
| V.3.1 | Are cloud-configuration hardening standards applied? | Y | Infrastructure as code; policy-as-code (OPA) |
| V.4.1 | Is tenant segmentation ensured? | Y | Postgres RLS on every org-scoped table; ClickHouse row policies + partition-by-tenant; JWT-derived identity (CLAUDE.md §Architecture Rules point 8) |
| V.5.1 | Are cloud-native security services used? | Y | WAF + DDoS protection + KMS + GuardDuty/equivalent |
| V.6.1 | Is cloud-encryption documented? | Y | At-rest AES-256-GCM; in-transit TLS 1.3 |
| V.7.1 | Are cloud-access keys managed? | Y | KMS-backed; rotation per policy |
| V.8.1 | Are cloud-logs retained per policy? | Y | Per audit-log retention policy |

---

## Part C — Appendices

### C.1 — Control-mapping cheat-sheet (SIG Lite → CAIQ → CCM → SOC 2 CC)

| SIG Lite domain | CAIQ domain | CCM 4.0.12 domain | SOC 2 TSP 100 CC |
|---|---|---|---|
| A ERM | GRC | Governance, Risk and Compliance | CC3 (Risk) |
| B Security Policy | AIS, A&A | A&A, AIS | CC1 (CEO) |
| C Org Security | HRS | HRS | CC1 |
| D Asset & Info | DSP | DSP | CC5 (Data) |
| E HR | HRS | HRS | CC1 |
| F Physical | DCS | DCS | CC6 (Physical) |
| G Ops | LOG, BCR | LOG, BCR, CCC | CC7 (System Ops) |
| H Access | IAM | IAM | CC6 (Logical) |
| I App Security | AIS | AIS | CC8 (Change Mgmt) |
| J Incident | SEF | SEF | CC9 (Risk Mitigation) |
| K Resiliency | BCR | BCR | A1 (Availability) |
| L Compliance | A&A, GRC | GRC | CC4 (Monitoring) |
| M End User Device | UEM | UEM | CC6 |
| N Network | IVS | IVS | CC6 |
| P Privacy | DSP | DSP | P1–P8 (Privacy) |
| R Threat Mgmt | TVM | TVM | CC7 |
| S Server | IVS | IVS | CC7 |
| V Cloud | IVS, STA | IVS, STA | CC9 |

### C.2 — Evidence request portal (for customer auditors)

| Evidence class | How to request |
|---|---|
| Public artifacts | Directly readable: `CLAUDE.md`, `SECURITY.md`, `legal/review/*`, `contracts/*`, `packages/scoring`, `packages/redact`, `packages/config/src/bill-of-rights.ts` |
| NDA-gated internal policies | {{IMPORTER_PRIVACY_CONTACT}} — NDA first; then scoped document share |
| SBOM | `legal/review/cyclone-dx-SBOM.md` + release-attached CycloneDX JSON |
| SOC 2 report | {{IMPORTER_PRIVACY_CONTACT}} — Phase 2 Type I; Phase 3 Type II |
| Pen-test report | {{IMPORTER_PRIVACY_CONTACT}} — annual from Phase 3 |

### C.3 — Change-control for this questionnaire

- Updates on each material shipped-product change (new tier, new adapter with data-path change, new sub-processor, metric-version bump).
- Minor refresh every quarter; major refresh annually.
- Version history in the Changelog below.

---

## Changelog

- **2026-04-17 — v1.0.0-draft.** Initial SIG Lite 2024 pre-fill (Workstream I A13). 18 domains covered (A–V). Companion to `CAIQ-v4.0.3.md`. Release tag: {{VERSION_LOGICIELLE}}.

## Cross-references

- `legal/review/CAIQ-v4.0.3.md` — companion CCM-based questionnaire.
- `legal/review/SCCs-module-2.md` — cross-border transfer instrument.
- `legal/review/DPIA.md` — privacy-impact assessment.
- `legal/review/cyclone-dx-SBOM.md` — STA / I.10 evidence.
- `legal/review/SOC2-prep.md` — A&A / GRC / IAM evidence roadmap.
- `dev-docs/PRD.md` §12 regulatory perimeter.
- `CLAUDE.md` §Security Rules, §Privacy Model Rules, §Database Rules, §API Rules.

**Not legal or audit advice.** Processor self-attestation. Customer TPRM verifies on engagement.
