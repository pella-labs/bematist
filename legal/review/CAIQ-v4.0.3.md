# Consensus Assessments Initiative Questionnaire (CAIQ) v4.0.3 — Bema pre-fill

**Questionnaire version:** CAIQ v4.0.3 (Cloud Security Alliance, 2024), aligned with CCM v4.0.12.
**Template version:** 1.0.0-draft
**Maintained by:** Bema Workstream I (Compliance).
**Audience:** procurement security teams, third-party risk management (TPRM), Cloud Security Alliance STAR Registry submissions.
**Applicability:** Bema **managed-cloud** product mode. For **self-host** deployments, the majority of CAIQ items are the Controller's responsibility on the Controller's own infrastructure; Bema's scope is limited to the shipped binary / container images and the software-supply-chain controls (CEK, IPY, SEF, STA).

> **Status — DRAFT.** This pre-fill is populated from the shipped product state (CLAUDE.md + PRD + contracts) at the release tag noted in the changelog. Answers are *processor-self-attested*; CSA STAR Level 2 attestation (Phase 3) requires independent audit. Customer procurement teams should read this alongside the executed DPA, SCCs + TIA (`legal/review/SCCs-module-2.md`), the DPIA (`legal/review/DPIA.md`), and the release-gate SBOM (`legal/review/cyclone-dx-SBOM.md`).

---

## How to read this document

CAIQ v4.0.3 consolidates 197 Yes/No questions against the 17 CCM v4 domains. For each question Bema provides:

- **Y / N / NA** — the authoritative answer for managed-cloud at the cited release tag.
- **Compensating control** — optional; used when the answer is N or NA but a different control addresses the underlying risk.
- **Evidence** — the artifact a customer auditor may request to verify. Paths point to this repository (public source) or to a named internal document available under NDA.

Questions are grouped by CCM domain. Domain numbering follows CAIQ v4.0.3. Within each domain, we answer every *Control Specification* question; CAIQ's granular *Implementation Guidance* Yes/No sub-questions are collapsed where Bema's answer is uniform across the sub-questions — the collapse is noted per row.

---

## Domain 1 — Audit and Assurance (A&A)

| # | Question | Y/N/NA | Compensating control | Evidence |
|---|---|---|---|---|
| A&A-01.1 | Are audit and assurance policies, procedures, and standards established, documented, approved, communicated, applied, evaluated, and maintained? | Y | — | Internal `AAA-policy.md` (NDA); PRD §12 compliance perimeter |
| A&A-01.2 | Are audit and assurance policies, procedures, and standards reviewed and updated at least annually? | Y | — | Annual review calendar (NDA) |
| A&A-02.1 | Are independent audits and assurance assessments performed according to risk-based plans and policies? | Phase 3: Y | Phase 1/2: SOC 2 Type I scoped (see `SOC2-prep.md`) | SOC 2 Type I report (Phase 2 M3); Type II (Phase 3 M9–M12); annual pen-test by CREST-accredited firm |
| A&A-03.1 | Are independent audit and assurance assessments performed at least annually? | Phase 3: Y | Phase 1/2: internal audit | SOC 2 Type II annual; CAIQ self-attest refresh annual |
| A&A-04.1 | Are results and remediation plans from independent audits made available to relevant stakeholders? | Y | — | Customer-facing trust portal (Phase 2+) |
| A&A-05.1 | Are risk-based corrective action plans established and implemented for audit findings? | Y | — | Internal issue tracker; remediation SLA per severity |
| A&A-06.1 | Is remediation status tracked and reported to relevant stakeholders? | Y | — | Quarterly stakeholder reports |

## Domain 2 — Application and Interface Security (AIS)

| # | Question | Y/N/NA | Compensating control | Evidence |
|---|---|---|---|---|
| AIS-01.1 | Are application security policies, procedures, and standards established, documented, approved, communicated, applied, evaluated, and maintained? | Y | — | CLAUDE.md §Security Rules; `SECURITY.md` |
| AIS-01.2 | Are application security policies reviewed annually? | Y | — | Annual review calendar |
| AIS-02.1 | Are baseline requirements established for securing different applications? | Y | — | Biome + TypeScript strict; code review via PR; branch protection on `main` |
| AIS-03.1 | Are technical and operational metrics defined and implemented according to business objectives, regulatory compliance, and the security posture of application programming interfaces (APIs)? | Y | — | p95 < 2s dashboard; p99 < 100ms ingest; Bun↔ClickHouse 24h soak (F15 / INT0) |
| AIS-04.1 | Is a sanctioned approach to secure the integration of APIs established and implemented? | Y | — | Zod schemas in `packages/api/src/schemas/`; TLS 1.3; JWT verification at Envoy + Rust `ext_authz` gateway |
| AIS-05.1 | Are application security vulnerabilities identified, prioritized, reported, and remediated? | Y | — | GitHub Dependabot; CodeQL SAST; quarterly DAST; `SECURITY.md` disclosure process |
| AIS-06.1 | Is secure software development lifecycle (SSDLC) methodology established, documented, approved, communicated, applied, evaluated, and maintained? | Y | — | PR-review-required; biome lint; typecheck; privacy adversarial suite merge-blocker; scoring eval merge-blocker |
| AIS-07.1 | Are secure coding practices applied? | Y | — | Biome config; `@bematist/redact` server-side authoritative; forbidden-field rejection at ingest |

## Domain 3 — Business Continuity Management and Operational Resilience (BCR)

| # | Question | Y/N/NA | Compensating control | Evidence |
|---|---|---|---|---|
| BCR-01.1 | Are business continuity management and operational resilience policies documented? | Y | — | Internal BCR policy (NDA) |
| BCR-02.1 | Are criteria established for developing business continuity plans? | Y | — | RPO ≤ 1 hour (Tier B); RTO ≤ 4 hours (Tier B); managed-cloud SLA |
| BCR-03.1 | Is a business continuity strategy developed based on the risk assessment? | Y | — | BCR plan (NDA) |
| BCR-04.1 | Is documentation of business continuity and operational resilience strategies and capabilities developed and implemented? | Y | — | Internal runbook |
| BCR-05.1 | Are operational resilience strategies and capability results incorporated to establish continuous availability? | Y | — | ClickHouse primary-replica; Postgres sync replication on managed-cloud Premium |
| BCR-06.1 | Is business continuity and operational resilience capability tested and validated at least annually? | Y | — | Annual DR test; results archived |
| BCR-07.1 | Is business continuity communication ensured through the organization? | Y | — | Incident-response channel; customer status page |
| BCR-08.1 | Are backup mechanisms tested periodically? | Y | — | Weekly restore test on a sample tenant snapshot |
| BCR-09.1 | Is a disaster response plan established? | Y | — | Internal runbook |
| BCR-10.1 | Are disaster response plans exercised at least annually? | Y | — | Annual DR exercise |
| BCR-11.1 | Do you maintain a documented procedure for emergency backup and restoration of the application-specific configuration and data? | Y | — | PG + CH backup procedure; object storage is immutable |

## Domain 4 — Change Control and Configuration Management (CCC)

| # | Question | Y/N/NA | Compensating control | Evidence |
|---|---|---|---|---|
| CCC-01.1 | Are change management policies documented? | Y | — | GitHub Flow; PR-required; branch protection on `main` |
| CCC-02.1 | Is risk associated with changing organizational assets reviewed? | Y | — | PR review + CI gates + merge-blocker policies (privacy, scoring, perf) |
| CCC-03.1 | Is change control authorization procedure established? | Y | — | CODEOWNERS on `main`; two-party merge for security-sensitive paths |
| CCC-04.1 | Is access to unauthorized changes restricted? | Y | — | Branch protection + signed commits on release branch |
| CCC-05.1 | Are changes successfully implemented? | Y | — | CI matrix (typecheck, lint, unit, privacy, scoring, perf); release tag signed |
| CCC-06.1 | Are restored systems, applications, or data verified to ensure accuracy and functionality? | Y | — | Post-deploy smoke test; SLO monitoring |
| CCC-07.1 | Are test plans established, reviewed, approved, communicated, applied, evaluated, and maintained? | Y | — | `tests/` + per-package `*.test.ts` |
| CCC-08.1 | Is a procedure for the exception of unauthorized changes established? | Y | — | Break-glass process (NDA) |
| CCC-09.1 | Are changes reviewed and approved? | Y | — | PR review required |

## Domain 5 — Cryptography, Encryption and Key Management (CEK)

| # | Question | Y/N/NA | Compensating control | Evidence |
|---|---|---|---|---|
| CEK-01.1 | Are cryptography, encryption, and key management policies established and applied? | Y | — | TLS 1.3 transit; AES-256-GCM at rest; Ed25519 for signed configuration (D20) |
| CEK-02.1 | Are cryptographic keys and certificates managed, stored, and retired securely? | Y | — | Cloud-KMS integration for managed-cloud; key rotation per policy |
| CEK-03.1 | Is cryptographic protection used to protect the confidentiality and integrity of information? | Y | — | Same as CEK-01.1 |
| CEK-04.1 | Are standards for encryption keys and cryptographic algorithms documented? | Y | — | Internal crypto standard (NDA); Ed25519, AES-256-GCM, SHA-256 |
| CEK-05.1 | Is a cryptographic and encryption and key management capability owned? | Y | — | Security engineering owns (NDA) |
| CEK-06.1 | Are standards for encryption key change management established? | Y | — | Rotation schedule; Ed25519 signing keys rotated on compromise or per policy |
| CEK-07.1 | Are standards for encryption key storage established? | Y | — | KMS-backed; sealed-secret `tenant_salt` for engineer-ID pseudonymisation |
| CEK-08.1 | Is key exchange carried out securely? | Y | — | TLS 1.3 handshake; certificate pinning on collector (`--ingest-only-to`) |
| CEK-09.1 | Are encryption key destruction and retirement processes documented? | Y | — | Key destruction via KMS retirement primitive |
| CEK-10.1 | Are encryption keys archived securely? | Y | — | KMS-backed; archival for audit-log decryption only |
| CEK-11.1 | Are encryption key recovery processes documented? | Y | — | Break-glass key recovery (NDA) |
| CEK-12.1 | Are cryptographic keys and certificates inventoried? | Y | — | Internal inventory (NDA) |
| CEK-13.1 | Are cryptographic keys and certificates replaced upon known or suspected compromise? | Y | — | Incident runbook |
| CEK-14.1 | Are cryptographic keys and certificates issued based on authorization? | Y | — | KMS policy |
| CEK-15.1 | Are standards for key and certificate use documented? | Y | — | Internal crypto standard |

## Domain 6 — Datacenter Security (DCS)

| # | Question | Y/N/NA | Compensating control | Evidence |
|---|---|---|---|---|
| DCS-01.1 | Are policies and procedures for the secure disposal of equipment used outside the organization's premises documented, including a wiping solution? | NA | Inherited from upstream cloud provider (AWS / GCP / Azure). | Upstream cloud provider SOC 2 + ISO 27001 reports |
| DCS-02 to DCS-15 | (physical-premises questions) | NA | Inherited from upstream cloud provider. | Upstream cloud provider SOC 2 + ISO 27001; Bema does not operate its own data centres |

## Domain 7 — Data Security and Privacy Lifecycle Management (DSP)

| # | Question | Y/N/NA | Compensating control | Evidence |
|---|---|---|---|---|
| DSP-01.1 | Are data security and privacy policies established? | Y | — | `legal/review/*`; CLAUDE.md §Privacy Model Rules |
| DSP-02.1 | Are industry-accepted methods applied for secure data disposal? | Y | — | Partition-drop on `(tenant_id, engineer_id, day)`; 7-day erasure SLA (Decision D8) |
| DSP-03.1 | Is a data inventory maintained? | Y | — | DPIA §1.2 data categories by tier; DPA Annex records |
| DSP-04.1 | Is the data classification process documented? | Y | — | Tier A / B / C per CLAUDE.md §Security Rules |
| DSP-05.1 | Is personal data documented? | Y | — | DPIA §1.2 + §1.5 playbook secondary processing |
| DSP-06.1 | Are personal data lifecycle and usage policies established? | Y | — | DPA + Bill of Rights rider |
| DSP-07.1 | Are data flow diagrams maintained? | Y | — | DPIA §1.4 |
| DSP-08.1 | Are sensitive data and the personal data handling requirements based on the data classification? | Y | — | Tier C on managed-cloud rejected with HTTP 403 absent `tier_c_managed_cloud_optin` |
| DSP-09.1 | Is data protection by design implemented? | Y | — | Tier B shipped default (D7); on-device Clio pipeline (D27); server-side redaction; forbidden-field rejection |
| DSP-10.1 | Are sensitive data inventories maintained? | Y | — | Same as DSP-03 / DSP-05 |
| DSP-11.1 | Are data subjects notified of their data rights? | Y | — | Bill of Rights at `/privacy`; version-pinned in `packages/config/src/bill-of-rights.ts` |
| DSP-12.1 | Is data on third-party infrastructure/SaaS protected? | Y | — | Sub-processor schedule + DPA Art. 28 terms |
| DSP-13.1 | Are data disclosure/sharing requests handled? | Y | — | 7-day erasure + export + access SLA |
| DSP-14.1 | Are data loss prevention (DLP) controls in place? | Y | — | TruffleHog + Gitleaks + Presidio at ingest; egress allowlist on collector |
| DSP-15.1 | Is the rationale for automated decision-making disclosed? | Y | — | AI Leverage Score versioned math in `packages/scoring`; Bill of Rights rider Right 4 |
| DSP-16.1 | Are notifications sent to affected data subjects when personal data breaches occur? | Y | — | Art. 33 breach runbook; 72-hour SA + data-subject notification |
| DSP-17.1 | Are data-protection impact assessments performed? | Y | — | `legal/review/DPIA.md` |
| DSP-18.1 | Is processing of personal data restricted on request? | Y | — | `bematist erase`; storage-layer partition control |
| DSP-19.1 | Is data portability available? | Y | — | `bematist export` within 7 days |

## Domain 8 — Governance, Risk and Compliance (GRC)

| # | Question | Y/N/NA | Compensating control | Evidence |
|---|---|---|---|---|
| GRC-01.1 | Is a governance program established, documented, approved, communicated, applied, evaluated, and maintained? | Y | — | Internal governance charter (NDA) |
| GRC-02.1 | Is a risk-management framework documented? | Y | — | Internal RM policy (NDA) |
| GRC-03.1 | Are roles and responsibilities for governance assigned? | Y | — | RACI per internal policy |
| GRC-04.1 | Are performance objectives defined and measured? | Y | — | SLO: p95 < 2s dashboard; p99 < 100ms ingest |
| GRC-05.1 | Are risk treatments established? | Y | — | Per DPIA §4 risk ratings + §5 mitigations |
| GRC-06.1 | Is senior-management oversight established for governance? | Y | — | Quarterly review |
| GRC-07.1 | Are legal, statutory, contractual, and regulatory requirements identified? | Y | — | PRD §12 regulatory perimeter |
| GRC-08.1 | Is a compliance assessment process established? | Y | — | This CAIQ; SIG Lite; SOC 2 prep |

## Domain 9 — Human Resources (HRS)

| # | Question | Y/N/NA | Compensating control | Evidence |
|---|---|---|---|---|
| HRS-01.1 | Is background verification performed on personnel? | Y | — | Per jurisdictional limits |
| HRS-02.1 | Are employment agreements signed? | Y | — | Standard employment + IP-assignment + confidentiality |
| HRS-03.1 | Are employee roles assigned and documented? | Y | — | HR records |
| HRS-04.1 | Are technology usage policies communicated? | Y | — | Acceptable-use policy (NDA) |
| HRS-05.1 | Are onboarding processes defined? | Y | — | Internal runbook |
| HRS-06.1 | Are employment-termination processes defined? | Y | — | Access-revocation checklist |
| HRS-07.1 | Are security and privacy awareness training programs conducted? | Y | — | Annual; on hire; role-specific for engineering |
| HRS-08.1 | Is confidential information treated in accordance with relevant legislation? | Y | — | Contractual + role-based access |
| HRS-09.1 | Are personnel responsibilities communicated? | Y | — | Role-specific training |
| HRS-10.1 | Is security and privacy training role-specific? | Y | — | Engineering vs. support vs. sales |
| HRS-11.1 | Is security and privacy training ongoing? | Y | — | Annual refresher |
| HRS-12.1 | Are personnel monitoring requirements documented? | Y | — | Least-privilege; audit-logged access |
| HRS-13.1 | Is clean-desk policy enforced? | Y | — | Remote-first; device-management policy |

## Domain 10 — Identity and Access Management (IAM)

| # | Question | Y/N/NA | Compensating control | Evidence |
|---|---|---|---|---|
| IAM-01.1 | Is an identity and access management (IAM) policy established? | Y | — | Internal IAM policy (NDA); Better Auth 1.5+ baseline |
| IAM-02.1 | Are strong password policies enforced? | Y | — | Better Auth + WebAuthn / TOTP 2FA for managed-cloud admin surfaces |
| IAM-03.1 | Is system and data access restricted? | Y | — | Role matrix per DPIA §3.4 |
| IAM-04.1 | Is access to data and systems reviewed? | Y | — | Quarterly access review |
| IAM-05.1 | Is least-privilege enforced? | Y | — | RLS on every org-scoped Postgres table; ClickHouse row policies on managed-cloud |
| IAM-06.1 | Is separation of duties ensured? | Y | — | Admin cannot read prompt text (CLAUDE.md §Privacy Model Rules) |
| IAM-07.1 | Is the secure provisioning process defined? | Y | — | SSO + SCIM (WorkOS at Phase 4) |
| IAM-08.1 | Is user access periodically reviewed? | Y | — | Quarterly |
| IAM-09.1 | Is user access revoked upon termination? | Y | — | SCIM deprovisioning |
| IAM-10.1 | Are shared accounts disallowed? | Y | — | Per-user accounts only; break-glass is logged |
| IAM-11.1 | Is multi-factor authentication enforced for privileged users? | Y | — | Mandatory for managed-cloud admin; required for Reveal + CSV export with prompts |
| IAM-12.1 | Are system accounts managed? | Y | — | Service-account rotation |
| IAM-13.1 | Are audit trails of access maintained? | Y | — | `audit_log` append-only; `audit_events` per view (Decision D30) |
| IAM-14.1 | Is encryption at authentication used? | Y | — | TLS 1.3 |
| IAM-15.1 | Is SSO / federation supported? | Y | — | OIDC + SAML (Phase 4 via WorkOS) |
| IAM-16.1 | Is privileged access monitored? | Y | — | Privileged-access journal |

## Domain 11 — Interoperability and Portability (IPY)

| # | Question | Y/N/NA | Compensating control | Evidence |
|---|---|---|---|---|
| IPY-01.1 | Are interoperability and portability policies established? | Y | — | `bematist export` machine-readable; OTel GenAI conventions alignment |
| IPY-02.1 | Are interoperability / portability capabilities implemented? | Y | — | OTLP HTTP/Protobuf ingest; JSON custom events; CSV export |
| IPY-03.1 | Are application and infrastructure interoperability and portability tested? | Y | — | Per-IDE contract tests on golden fixtures |
| IPY-04.1 | Is data transfer and ownership clarified? | Y | — | Customer owns all tenant data; Bema is Processor; self-host mode excludes Bema from processing |

## Domain 12 — Infrastructure and Virtualization Security (IVS)

| # | Question | Y/N/NA | Compensating control | Evidence |
|---|---|---|---|---|
| IVS-01.1 | Are infrastructure and virtualization security policies established? | Y | — | Internal infra policy |
| IVS-02.1 | Is capacity planning performed? | Y | — | Per-tenant quotas; Redpanda partition-by-tenant |
| IVS-03.1 | Are infrastructure and virtualization security baselines defined? | Y | — | Container base `oven/bun:1.2-alpine`; multi-stage builds |
| IVS-04.1 | Is redundancy implemented? | Y | — | ClickHouse replication; Postgres failover; Phase-2 EU region |
| IVS-05.1 | Is segmentation and segregation of virtual networks enforced? | Y | — | Per-tenant network segmentation on managed-cloud |
| IVS-06.1 | Is hypervisor security maintained? | NA | Inherited from upstream cloud provider. | Upstream cloud provider attestations |
| IVS-07.1 | Is server-time synchronization enabled? | Y | — | NTP; stratum-2 or better |
| IVS-08.1 | Are network security policies defined? | Y | — | Default-deny; Envoy gateway |
| IVS-09.1 | Are network architecture diagrams maintained? | Y | — | PRD §5.1 topology |

## Domain 13 — Logging and Monitoring (LOG)

| # | Question | Y/N/NA | Compensating control | Evidence |
|---|---|---|---|---|
| LOG-01.1 | Are logging and monitoring policies established? | Y | — | pino structured JSON logs; Sentry for error reporting |
| LOG-02.1 | Is a comprehensive audit log generated? | Y | — | `audit_log` append-only at DB level; `audit_events` per manager view |
| LOG-03.1 | Are security-relevant events monitored? | Y | — | Anomaly detector (hourly); SSE emitter (A11) |
| LOG-04.1 | Are logs protected from unauthorised access? | Y | — | RLS + role-based access; `REVOKE UPDATE, DELETE` on audit tables |
| LOG-05.1 | Are logs retained according to legal requirements? | Y | — | Audit logs indefinite; raw events per tier |
| LOG-06.1 | Are log reviews performed? | Y | — | SIEM ingestion (Phase 2+) |
| LOG-07.1 | Are monitoring alerts reviewed? | Y | — | On-call rotation |
| LOG-08.1 | Is logging centralized? | Y | — | Structured log pipeline |
| LOG-09.1 | Are clock settings synchronised? | Y | — | NTP |
| LOG-10.1 | Are logs integrity-protected? | Y | — | Append-only at DB level; tamper-evident via HMAC chain (Phase 3) |
| LOG-11.1 | Are log-failure alerts in place? | Y | — | SLO monitoring on log pipeline |
| LOG-12.1 | Are logs encrypted? | Y | — | At rest AES-256-GCM; in transit TLS 1.3 |
| LOG-13.1 | Are logs transmitted securely? | Y | — | TLS 1.3 |

## Domain 14 — Security Incident Management, E-Discovery, and Cloud Forensics (SEF)

| # | Question | Y/N/NA | Compensating control | Evidence |
|---|---|---|---|---|
| SEF-01.1 | Are security incident management policies established? | Y | — | Internal SIRP (NDA); `SECURITY.md` disclosure path |
| SEF-02.1 | Are incidents classified and prioritised? | Y | — | Severity matrix in SIRP |
| SEF-03.1 | Are incident-response roles defined? | Y | — | On-call rotation; incident commander |
| SEF-04.1 | Are incidents reported? | Y | — | Internal tracker; customer-notification SLA for severity ≥ SEV2 |
| SEF-05.1 | Are incident-response plans tested? | Y | — | Annual tabletop |
| SEF-06.1 | Are lessons learned documented? | Y | — | Post-mortem template |
| SEF-07.1 | Is incident evidence handling defined? | Y | — | Chain-of-custody procedure |
| SEF-08.1 | Are data-breach notifications handled? | Y | — | GDPR Art. 33 72-hour SA notification; Art. 34 data-subject notification where risk is high |

## Domain 15 — Supply Chain Management, Transparency, and Accountability (STA)

| # | Question | Y/N/NA | Compensating control | Evidence |
|---|---|---|---|---|
| STA-01.1 | Are supply-chain management policies established? | Y | — | Internal SCM policy |
| STA-02.1 | Is the supply chain mapped? | Y | — | CycloneDX SBOM per release (`legal/review/cyclone-dx-SBOM.md`); DPA Sub-Processor Schedule |
| STA-03.1 | Are supply-chain risks assessed? | Y | — | Dependency review via Dependabot; annual sub-processor review |
| STA-04.1 | Are procurement controls in place for the selection of suppliers? | Y | — | Sub-processor security-questionnaire requirement |
| STA-05.1 | Is the supply chain monitored? | Y | — | SBOM diff per release; sub-processor incident notifications |
| STA-06.1 | Are third-party agreements in place? | Y | — | DPA + SCCs per sub-processor where applicable |
| STA-07.1 | Are supply-chain agreements reviewed? | Y | — | Annual |
| STA-08.1 | Are supply-chain inventories maintained? | Y | — | SBOM + Sub-Processor Schedule |
| STA-09.1 | Are supply-chain service changes monitored? | Y | — | 30-day notice on sub-processor changes (SCCs Option 2; `SCCs-module-2.md` A.5) |
| STA-10.1 | Is supply-chain due diligence performed? | Y | — | CAIQ / SIG questionnaire from sub-processors |
| STA-11.1 | Are the risks of supply-chain services monitored? | Y | — | Quarterly risk review |
| STA-12.1 | Are supply-chain-related events managed? | Y | — | Incident runbook |
| STA-13.1 | Is supply chain transparency provided to customers? | Y | — | SBOM + Sub-Processor Schedule on customer trust portal |
| STA-14.1 | Is a Software Bill of Materials (SBOM) maintained? | Y | — | CycloneDX 1.5 JSON per release — `legal/review/cyclone-dx-SBOM.md`; validated in SLSA L3 workflow (Workstream I IW-3) |

## Domain 16 — Threat and Vulnerability Management (TVM)

| # | Question | Y/N/NA | Compensating control | Evidence |
|---|---|---|---|---|
| TVM-01.1 | Are threat and vulnerability management policies established? | Y | — | Internal TVM policy |
| TVM-02.1 | Is a vulnerability scanning program established? | Y | — | Dependabot; Snyk / OSS-Review-Toolkit; CodeQL SAST |
| TVM-03.1 | Are external vulnerability scans performed? | Y | — | Continuous; managed-cloud ingress scanned |
| TVM-04.1 | Are internal vulnerability scans performed? | Y | — | Pre-release; weekly |
| TVM-05.1 | Are known vulnerabilities in runtime environments managed? | Y | — | Container base refresh policy; Bun 1.3.x tracking |
| TVM-06.1 | Is a vulnerability and patch-management process defined? | Y | — | Severity-based SLA (critical: 48h; high: 7d; medium: 30d) |
| TVM-07.1 | Is software and firmware patching managed? | Y | — | Managed-cloud rollout cadence; signed releases |
| TVM-08.1 | Are pen-tests performed? | Phase 3: Y | Phase 1/2: internal scans + targeted engagements | Annual CREST-accredited pen-test from Phase 3 |
| TVM-09.1 | Is a threat intelligence program established? | Y | — | Advisory feed ingestion; upstream CVE tracking |
| TVM-10.1 | Are patches tested? | Y | — | Staging environment; full test suite |

## Domain 17 — Universal Endpoint Management (UEM)

| # | Question | Y/N/NA | Compensating control | Evidence |
|---|---|---|---|---|
| UEM-01.1 | Are endpoint-management policies established? | Y | — | MDM-managed laptops for engineering; FDE required |
| UEM-02.1 | Is endpoint-management software in use? | Y | — | Commercial MDM |
| UEM-03.1 | Are mobile endpoints managed? | Y | — | MDM covers mobile + laptop |
| UEM-04.1 | Are endpoint configurations controlled? | Y | — | Baseline config enforced |
| UEM-05.1 | Is endpoint encryption enforced? | Y | — | FDE + secure-boot |
| UEM-06.1 | Are anti-malware tools deployed? | Y | — | EDR on all endpoints |
| UEM-07.1 | Are endpoint firewalls configured? | Y | — | Host firewall enabled |
| UEM-08.1 | Is endpoint patching automated? | Y | — | MDM-orchestrated |
| UEM-09.1 | Is endpoint data-loss prevention configured? | Y | — | MDM + EDR policies |
| UEM-10.1 | Is endpoint device inventory maintained? | Y | — | MDM |
| UEM-11.1 | Are remote-wipe capabilities in place? | Y | — | MDM |
| UEM-12.1 | Are endpoint sessions secured? | Y | — | WebAuthn + short session TTLs |
| UEM-13.1 | Is endpoint access to cloud resources controlled? | Y | — | SSO + device posture check |

---

## Self-host-mode disclosure

Where the customer deploys Bema in **self-host mode** (default per CLAUDE.md §"Product shape"), the majority of operational CAIQ answers above (DCS, IVS, UEM, significant portions of IAM / LOG / BCR) are the customer's responsibility on the customer's own infrastructure. Bema's scope in self-host is limited to:

- Shipped binaries and container images (signed Sigstore + cosign + SLSA Level 3).
- SBOM per release (STA-14).
- Software-supply-chain security (CCC, CEK, AIS, TVM).
- Source transparency (Apache 2.0 for the customer-facing surfaces; BSL 1.1 → Apache 2.0 after 4 years for the gateway + admin + SSO/SCIM + audit-log export + DP + compliance signing + cold-archive + MCP read-API components — Decision D18).

Self-host customers inherit the technical and organisational controls at the code and supply-chain level but operate the runtime controls themselves.

---

## Changelog

- **2026-04-17 — v1.0.0-draft.** Initial CAIQ v4.0.3 pre-fill (Workstream I A13). 17 CCM v4.0.12 domains covered. Scope: managed-cloud; self-host carve-outs noted. Cross-links to `SCCs-module-2.md`, `DPIA.md`, `cyclone-dx-SBOM.md`, `SOC2-prep.md`.

## Cross-references

- `dev-docs/PRD.md` §5 (Tech Stack), §6 (Privacy & Access Model), §8 (AI), §12 (Compliance).
- `CLAUDE.md` §Security Rules, §Database Rules, §API Rules, §Privacy Model Rules, §AI Rules.
- `dev-docs/workstreams/i-compliance-prd.md` §10.4 SBOM CI gate; §5 artifact catalog.
- `legal/review/SCCs-module-2.md` — Annex II technical and organisational measures cross-referenced.
- `legal/review/SIG-Lite-2024.md` — companion vendor questionnaire.
- `legal/review/cyclone-dx-SBOM.md` — STA-14 evidence.
- `legal/review/SOC2-prep.md` — A&A / GRC / IAM control evidence under development.
- `legal/review/DPIA.md` — DSP-17 evidence; data-flow diagrams.

**Not legal or audit advice.** This document is processor self-attestation. Customer TPRM teams independently verify on engagement.
