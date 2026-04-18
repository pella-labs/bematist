# Standard Contractual Clauses — Module Two (Controller to Processor) — Bematist managed-cloud

**Template version:** 1.0.0-draft
**Statutory basis:** Commission Implementing Decision (EU) 2021/914 of 4 June 2021 on standard contractual clauses for the transfer of personal data to third countries pursuant to Regulation (EU) 2016/679 of the European Parliament and of the Council. Module Two — Controller-to-Processor.
**Companion documents:** Transfer Impact Assessment (TIA) per *Schrems II* (CJEU C-311/18) and EDPB Recommendations 01/2020. EU-US Data Privacy Framework (DPF) self-certification plan (Phase-1 posture; Phase-2 EU-region migration plan).
**Maintained by:** Bematist Workstream I (Compliance).
**Audience:** customer Data Protection Officer, Data Importer (Bematist managed-cloud entity), enterprise legal counsel.

> **Status — TEMPLATE.** This file is a processor-supplied pre-fill of the Commission SCCs Module Two with a parallel TIA and DPF self-certification plan. It is **not** a substitute for the official text published in the Official Journal of the European Union (OJ L 199, 7.6.2021). The official text governs in the event of any conflict; this pre-fill records the **deal-specific selections** Bematist makes when concluding SCCs with a Controller customer. Customer counsel reviews and signs.

---

## Part A — Selections within the Commission SCCs (deal-specific pre-fill)

### A.1 Identification of the parties

> Annex I.A of the SCCs.

| Role | Pre-filled identity |
|---|---|
| **Data exporter (Controller)** | {{CONTROLLER_LEGAL_NAME}}, established at {{CONTROLLER_ADDRESS}}, represented by {{CONTROLLER_SIGNATORY}} ({{CONTROLLER_TITLE}}), Data Protection Officer {{DPO_NAME}} ({{DPO_EMAIL}}). Activities relevant to the transfer: engagement of Bematist managed-cloud for AI-engineering analytics over the Controller's developer workforce. |
| **Data importer (Processor)** | Bematist legal entity providing managed-cloud services as identified in the executed Master Services Agreement; Data Protection contact: {{IMPORTER_DPO_EMAIL}}; supervisory contact: {{IMPORTER_PRIVACY_CONTACT}}. Activities relevant to the transfer: hosted ingestion, processing, storage, and dashboard rendering of Bematist telemetry per Section 1 of the Bematist Data Processing Agreement (DPA) and per Annex I.B below. |

> **Self-host carve-out.** Where the Controller deploys Bematist as self-hosted infrastructure (the default mode per CLAUDE.md §"Product shape"), Bematist is **not** a data importer of any user telemetry — telemetry remains within the Controller's own infrastructure and no SCCs are required for that data flow. These SCCs apply only to the **managed-cloud** product mode.

### A.2 Description of the transfer

> Annex I.B of the SCCs.

- **Categories of data subjects.** Employees and contractors of the Controller who use Bematist-supported coding agents (Claude Code, Codex, Cursor, Continue.dev, GitHub Copilot, Cline/Roo/Kilo, OpenCode, post-Phase-2 Goose) on work machines.
- **Categories of personal data.** At Tier B (the shipped default): pseudonymized engineer identifier (`HMAC(SSO_subject, tenant_salt)`), hashed session identifier, redacted event envelope (event type, hashed file path, error class, duration, prompt length without content, diff line-count without body), redacted abstract from the on-device Clio pipeline (Decision D27), tokens, cost, model identifier, timestamps. At Tier C (where opted-in per the three named exceptions of the DPA): raw user-prompt text, raw tool-result text, file paths, diff bodies. Forbidden-field rejection at ingest enforces server-side that fields outside this enumeration are 400-rejected.
- **Special categories of personal data.** None by design. Secret-scanning + forbidden-field rejection block accidental capture. Where Art. 9 GDPR data is nonetheless captured (e.g., a developer pastes health data into a prompt), the Controller initiates Art. 33 breach response and the Importer cooperates per SCC Clause 8.6.
- **Frequency of the transfer.** Continuous (event-stream).
- **Nature of the processing.** Storage of telemetry events; computation of materialized aggregates and rollups; computation of the AI Leverage Score (`ai_leverage_v1`); rendering of dashboards; computation of cluster centroids and embeddings (per CLAUDE.md §"AI Rules"); execution of erasure on data-subject request.
- **Purposes of the transfer.** Internal cost attribution of LLM API spend, reliability analytics, team-aggregate workflow surfacing — exclusively for the purposes named in the executed DPA and in the relevant works-council / CSE / union instrument.
- **Retention.** Tier-A and Tier-B raw events: 90 days (Italian deployments: 21-day default per `union-agreement-IT.md` §9 c. 1). Tier-C raw events: 30 days. Aggregates: indefinite, pseudonymized via `HMAC(engineer_id, tenant_salt)`. Audit logs: indefinite, append-only.
- **Sub-processors.** As listed in the DPA Sub-Processor Schedule (a Phase-2 deliverable; current candidate list: model-LLM provider for Insight Engine outputs only on redacted inputs, embedding-model provider where BYO-key is not exercised, transit infrastructure, e-mail notification provider, error-tracking provider). Sub-processor changes follow Clause 9 below.

### A.3 Competent supervisory authority

> Annex I.C of the SCCs.

| Selection | Pre-filled |
|---|---|
| Selected supervisory authority | The supervisory authority of the EU/EEA Member State in which the Controller has its main establishment, or — where the Controller has multiple establishments and the transfer is to a single Bematist legal entity — the lead supervisory authority designated under GDPR Art. 56(1). |
| Identification | {{COMPETENT_SA}} (e.g., CNIL for FR-led; Datenschutzkonferenz / BfDI for DE-led; Garante for IT-led; Datatilsynet for DK-led; Datainspektionen for SE-led; ICO for UK-only deployments under UK Addendum). |

For UK-only Controller deployments, the **UK International Data Transfer Addendum** (issued by the ICO, in force from 21 March 2022) supplements these SCCs; the ICO is the competent authority.

### A.4 Technical and organisational measures

> Annex II of the SCCs. Module Two requires the importer to describe the technical and organisational security measures it applies. Bematist managed-cloud applies the measures enumerated below; these are descriptive of the shipped product per CLAUDE.md and PRD §5 / §6 / §8.

#### A.4.1 Pseudonymisation and encryption

- Engineer identity at rest is `HMAC(SSO_subject, tenant_salt)`; tenant salt is a sealed secret; cross-tenant joins are cryptographically excluded.
- Transport encryption: TLS 1.3 with modern cipher suites; HSTS; certificate pinning supported on the collector via `--ingest-only-to`.
- Storage encryption at rest: AES-256-GCM on object storage (managed-cloud spillover) and on disk volumes hosting PostgreSQL and ClickHouse.
- Crash dumps disabled (`ulimit -c 0`, `RLIMIT_CORE=0`); verified by `bematist doctor` per CLAUDE.md §"Security Rules".

#### A.4.2 Confidentiality

- Postgres Row-Level Security on every org-scoped table; INT9 cross-tenant probe is a merge-blocker and must return zero rows in CI.
- Tenant identifier, engineer identifier, and device identifier are **server-derived from the JWT** at ingest, never trusted from OTel resource attributes (per CLAUDE.md §"Architecture Rules" point 8).
- Role-based access matrix per CLAUDE.md §"Privacy Model Rules" — managers cannot read individual prompt text outside the three named exceptions.

#### A.4.3 Integrity

- Event idempotency via Redis `SETNX` with 7-day TTL keyed on `(tenant_id, session_id, event_seq)` (Decision D14). ClickHouse-side `ReplacingMergeTree(ts)` is the secondary dedup layer; Redis is authoritative.
- Append-only audit log: `audit_log` and `audit_events` tables are append-only at the database level via revocation of `UPDATE` and `DELETE` privileges.
- Server-side authoritative redaction at ingest (TruffleHog + Gitleaks + Presidio) on `prompt_text`, `tool_input`, `tool_output`, and `raw_attrs` — defense in depth against collector misconfiguration.
- Signed releases (Sigstore + cosign + SLSA Level 3) with per-dev binary SHA256 verification; alert on non-canonical binary in the manager dashboard.

#### A.4.4 Availability and resilience

- ClickHouse with primary-replica replication (per CLAUDE.md §"Tech Stack" baseline); PostgreSQL with synchronous replication where managed-cloud SLA tier dictates.
- Backup schedule: hourly incrementals to immutable storage; cross-region replication available for managed-cloud Premium tier; Phase-2 Frankfurt EU region planned.
- Disaster-recovery plan tested at least annually; RPO and RTO disclosed per managed-cloud SLA.

#### A.4.5 Restoration

- Restoration tested at least annually as part of the DR exercise; results recorded and made available on Controller request under SCC Clause 8.4.

#### A.4.6 Regular testing

- Continuous integration runs the privacy adversarial suite (`test:privacy`): ≥98% secret-recall on a 100-secret corpus; 100% rejection of forbidden fields by the ingest fuzzer; ≥95% Clio verifier recall on the 50-prompt identifying corpus; nightly invariant scan for zero raw secrets / forbidden fields in ClickHouse rows; RLS cross-tenant probe (INT9) returns zero rows; partition-drop completes within the 24-hour cutoff. All gates are merge-blocking.
- Annual penetration test by a CREST-accredited firm (PRD §12; Phase-3 deliverable).

#### A.4.7 Identification of access

- All access events written to `audit_log`. Access to a Controller employee's drill-down page additionally writes to `audit_events` (Decision D30); the affected engineer receives a daily digest by default and can opt in to immediate notification.

#### A.4.8 Data minimisation

- Tier B (counters + redacted envelopes) is the shipped default per Decision D7; managed-cloud rejects Tier C (`tier='C'`) at ingest with HTTP 403 unless `org.tier_c_managed_cloud_optin = true`.
- Tier-A `raw_attrs` allowlist enforced at write time (Challenge C10).
- Forbidden-field rejection (HTTP 400) on `rawPrompt`, `prompt_text`, `messages`, `toolArgs`, `toolOutputs`, `fileContents`, `diffs`, `filePaths`, `ticketIds`, `emails`, `realNames` from Tier A and Tier B sources.

#### A.4.9 Data quality

- Pricing data versioned and stamped at capture time per Decision D21; pricing-version shifts surface a dashboard banner with no silent recomputation.
- Metric versioning mandatory (Decision D13); `_v1`/`_v2`/`_v3` suffixes on every user-facing metric; never silently redefined.

#### A.4.10 Limited retention

- Per A.2 above: 90 days (A and B) / 30 days (C) / 21 days (Italian default per local instrument); aggregates indefinite under HMAC pseudonymisation. Erasure SLA: 7 days (Decision D8); execution via atomic `DROP PARTITION` keyed on `(tenant_id, engineer_id, day)`.

#### A.4.11 Accountability

- Records of processing per GDPR Art. 30 supplied on Controller request under SCC Clause 8.4; sub-processor schedule per Clause 9.

#### A.4.12 Allowing data portability

- `bematist export` returns engineer-scoped data in a machine-readable format within the 7-day SLA.

### A.5 Sub-processor authorization

> Annex III of the SCCs and Clause 9.

The Controller selects one of the two options under Clause 9(a):

- ☐ **Option 1 — Specific prior authorisation.** The Importer obtains the Controller's specific prior authorisation in writing for each sub-processor change.
- ☑ **Option 2 — General written authorisation.** The Controller authorises in advance the Importer's engagement of sub-processors from an agreed list. The Importer notifies the Controller of intended changes by written notice **at least 30 days in advance** of the change taking effect, providing sufficient information to enable the Controller to object on substantiated grounds. Where the Controller objects, the parties shall negotiate in good faith; failing resolution, the Controller may terminate the affected service component without additional liability.

The current sub-processor list is the DPA Sub-Processor Schedule (a Phase-2 deliverable; current candidates listed in A.2 above). Updates published at {{SUBPROCESSOR_NOTIFICATION_URL}} or by email to {{CONTROLLER_NOTIFICATION_EMAIL}}.

### A.6 Docking and accession of additional parties

> Clause 7. Additional Controllers or Processors may accede to these SCCs by signing the Docking Clause set out in the official text. The Importer shall not unreasonably withhold consent.

### A.7 Governing law and choice of forum

> Clauses 17 and 18.

- **Governing law:** the law of an EU/EEA Member State that allows for third-party beneficiary rights, namely {{GOVERNING_LAW_MEMBER_STATE}} (default: Ireland for managed-cloud entities incorporated under Irish law; otherwise the Controller's main-establishment Member State).
- **Choice of forum:** the courts of {{COURTS_MEMBER_STATE}}.
- **Data subject right:** without prejudice to Clause 18(c), data subjects may bring proceedings in the Member State where they have habitual residence.

### A.8 Order of precedence within the contractual stack

These SCCs are appended as Annex {{ANNEX_LETTER}} to the Bematist Data Processing Agreement and indirectly to the Master Services Agreement. In the event of conflict between these SCCs and the DPA / MSA, **these SCCs prevail** as to matters within their scope (Clause 5(b)).

---

## Part B — Transfer Impact Assessment (Schrems II + EDPB Recommendations 01/2020)

This TIA is supplied by the Importer to assist the Controller in discharging the assessment obligation under Clause 14 of the SCCs and the EDPB *Recommendations 01/2020 on measures that supplement transfer tools to ensure compliance with the EU level of protection of personal data* (adopted 18 June 2021).

The Controller remains responsible for the final TIA, including any decision to suspend transfers under Clause 14(f).

### B.1 Step 1 — Know the transfer

| Element | Description |
|---|---|
| Categories of data | Per A.2 above. Tier-B default minimises exposure; Tier-C only under three named exceptions. |
| Recipient | Bematist managed-cloud Importer per A.1; sub-processors per A.5. |
| Country of destination | {{IMPORTER_COUNTRY}} — Phase-1 posture: United States (under DPF, see Part C). Phase-2 posture: Frankfurt EU region available; Controller may select EU-region at provisioning time. |
| Transfer means | Continuous event-stream over TLS 1.3. |

### B.2 Step 2 — Identify the transfer tool

These SCCs (Module Two) constitute the transfer tool under Art. 46(2)(c) GDPR. For Phase-1 transfers to a US-based Importer or sub-processor, the EU-US DPF (Adequacy Decision of 10 July 2023, Implementing Decision (EU) 2023/1795) supplies an additional Art. 45 basis where the recipient is DPF-self-certified — see Part C.

### B.3 Step 3 — Assess the law and practice of the third country

This step focuses on whether the third country's law and practice impinge on the effectiveness of the transfer tool, with particular reference to surveillance powers.

#### Phase-1 posture — United States

The CJEU in *Schrems II* (judgment of 16 July 2020, Case C-311/18) found Section 702 of the Foreign Intelligence Surveillance Act (FISA 702) and Executive Order 12333 to be in conflict with Art. 47 of the Charter of Fundamental Rights of the EU as transposed via the GDPR Art. 45 adequacy mechanism. Following the Trans-Atlantic Data Privacy Framework Executive Order (EO 14086 of 7 October 2022), the Commission adopted the EU-US DPF Adequacy Decision on 10 July 2023, which established (i) signals-intelligence necessity-and-proportionality safeguards under EO 14086, (ii) the Data Protection Review Court (DPRC), and (iii) an annual joint review by the EU and US.

**Risk profile of US surveillance laws relevant to Bematist data:**

| Law / power | Bematist exposure | Mitigation |
|---|---|---|
| FISA 702 ("electronic communications service providers") | Bematist managed-cloud may, depending on the legal classification of its services, fall within the FISA 702 ECSP definition. | Tier-B default minimises content; on-device Clio pipeline ensures prompt text never leaves the endpoint absent a banner; redaction at ingest replaces secrets and PII before storage; strong encryption at rest reduces the value of any compelled access. |
| EO 12333 (signals intelligence outside the US) | Cross-border transit is in principle exposed. | TLS 1.3 transit; cert-pinning egress allowlist on the collector; Phase-2 Frankfurt EU region eliminates trans-Atlantic transit for opt-in customers. |
| US CLOUD Act (Stored Communications Act §2713) | A US-headquartered Importer is subject to extraterritorial production orders. | DPA contains a CLOUD Act resistance clause: the Importer commits to (i) challenge orders that conflict with EU law; (ii) notify the Controller of any compelled disclosure to the maximum extent legally permitted; (iii) provide the Controller with sufficient information to seek injunctive relief. |
| Section 215 PATRIOT Act ("business records") | Lapsed in 2020 (Section 215 expired 15 March 2020); no renewal. | No active exposure. |

#### Phase-2 posture — Frankfurt EU region

When the Controller selects the Phase-2 Frankfurt region at provisioning time, the data importer becomes the EU-region Bematist legal entity and processing infrastructure remains within the EU. Cross-border transfers under these SCCs cease to apply for that customer's tenant. Sub-processor sub-transfers (e.g., to a US-based LLM provider for the Insight Engine) remain subject to their own SCCs / DPF coverage.

#### Phase-1 posture — Other recipient jurisdictions

For non-US, non-EU/EEA Importers or sub-processors (where applicable), the Controller and Importer perform a country-specific assessment per EDPB Recommendations 01/2020 §29 et seq.

### B.4 Step 4 — Identify and adopt supplementary measures

Where Step 3 concludes that the third-country law impinges on the transfer tool's effectiveness, supplementary measures are adopted per EDPB Recommendations 01/2020 §52 et seq. Measures applied by Bematist managed-cloud (cumulative):

| Measure type | Concrete measure | Reference |
|---|---|---|
| **Technical — pseudonymisation** | `HMAC(engineer_id, tenant_salt)` at rollup; raw `engineer_id` never persisted. | A.4.1 |
| **Technical — encryption with customer-held keys (BYOK)** | Phase-2 deliverable: customer-managed KMS for storage encryption envelopes; Phase-1 uses Importer-managed keys. | A.4.1; PRD §5 |
| **Technical — split-processing** | Insight Engine LLM calls (Anthropic Haiku) receive only redacted, abstracted inputs from the on-device Clio pipeline; raw prompt content never reaches an LLM provider on Tier B. | CLAUDE.md §AI Rules; Clio §8.7 |
| **Technical — minimisation at source** | Tier B shipped default (Decision D7) + forbidden-field rejection at ingest (HTTP 400) + Tier-A `raw_attrs` allowlist (C10). | A.4.8 |
| **Technical — strong transport and storage encryption** | TLS 1.3 + AES-256-GCM. | A.4.1 |
| **Contractual — CLOUD Act resistance** | Importer commits to challenge, notify, and assist the Controller. | DPA |
| **Contractual — government-access transparency report** | Importer publishes an annual transparency report enumerating any received government-access requests in aggregate. | DPA |
| **Organisational — separation of duties** | Administrators cannot read prompt text (Privacy Model Rules); two-person rule for any tenant-level Tier flip via Ed25519 signed config + 7-day cooldown (D20). | CLAUDE.md §Security Rules; A.4.3 |
| **Organisational — strict purpose limitation in DPA** | DPA forbids use of data for performance-evaluation, ranking, or any §2.3 unlawful purpose enumerated in the DPIA. | DPIA §2.3 |

### B.5 Step 5 — Procedural steps

| Step | Procedure |
|---|---|
| Reassessment trigger | Material change to recipient law or practice (e.g., DPRC ruling adverse to a customer; enactment of a new surveillance law); change of recipient country; change of sub-processors; change of Bematist privacy tier default. |
| Reassessment cadence | At least annually; on each material change. |
| Documentation | TIA outcome documented and retained by the Controller for the duration of the transfer plus three years. |

### B.6 Step 6 — Re-evaluation

The Controller re-evaluates the TIA on the schedule above. Bematist supplies updated technical-and-organisational facts to support each re-evaluation.

### B.7 TIA conclusion (template)

> **Drafting note for the Controller DPO.** Customise per the Controller's specific deployment selections. The default text below assumes Phase-1 US Importer with Bematist managed-cloud applying the supplementary measures of Step 4.

The Controller, having considered (i) the categories of data transferred (Tier-B default; minimised by design); (ii) the recipient's location and applicable surveillance laws (US — FISA 702, EO 12333, CLOUD Act); (iii) the supplementary measures applied by the Importer (Step 4); and (iv) the EU-US DPF as a complementary basis to the extent the recipient is DPF-self-certified, concludes that the transfer ensures a level of protection essentially equivalent to that guaranteed within the EU. The Controller will reassess this conclusion on the schedule of B.5 and will suspend transfers under Clause 14(f) if a material adverse change occurs.

---

## Part C — EU-US Data Privacy Framework — Self-certification plan

For so long as the Importer or any sub-processor is established in the United States, the Importer commits to maintain valid self-certification under the EU-US Data Privacy Framework (Adequacy Decision (EU) 2023/1795) as a complementary basis to these SCCs.

### C.1 Self-certification scope

| Item | Pre-fill |
|---|---|
| Self-certifying entity | The US-incorporated Bematist legal entity that holds the managed-cloud Importer role. |
| Coverage | All personal data processed by the entity within the scope of the executed DPA, on behalf of the Controller. |
| HR data coverage | Bematist data is in-scope as HR-data under the DPF principles where the data subject is an employee of the Controller. The Importer self-certifies for HR data (additional principles apply). |
| Annual recertification | Within 12 months of each previous certification anniversary, per the Department of Commerce administrative procedure. |

### C.2 Self-certification checklist

- [ ] **C.2.1** — Confirm legal entity meets DPF eligibility (subject to FTC or DOT enforcement jurisdiction).
- [ ] **C.2.2** — Pay annual fee to the Department of Commerce.
- [ ] **C.2.3** — Designate a public contact for handling complaints (Controller-facing privacy contact: {{IMPORTER_PRIVACY_CONTACT}}).
- [ ] **C.2.4** — Designate an independent recourse mechanism for data subjects (panel options: ICDR-AAA / JAMS / TRUSTe / European DPAs).
- [ ] **C.2.5** — Publish a DPF-compliant privacy policy that addresses the seven core Principles (Notice; Choice; Accountability for Onward Transfer; Security; Data Integrity and Purpose Limitation; Access; Recourse, Enforcement and Liability) and the Supplemental Principles relevant to HR data and to processing on behalf of a Controller.
- [ ] **C.2.6** — Add the Importer to the Department of Commerce's *Data Privacy Framework List* with the activities and personal-data categories accurately enumerated (per Annex I.B above).
- [ ] **C.2.7** — Maintain procedure for handling complaints from Controllers, data subjects, and EU DPAs within the timelines published by the Department of Commerce (as of 2024: 45 days for individual complaints; cooperation with EU DPAs for HR data).
- [ ] **C.2.8** — Implement Data Protection Review Court (DPRC) cooperation procedures: (i) train relevant personnel; (ii) be prepared to provide information requested under EO 14086; (iii) document any EO 14086 requests received.
- [ ] **C.2.9** — Maintain records sufficient to support a Department of Commerce verification (as outlined in the Supplemental Principles); produce on request.
- [ ] **C.2.10** — Annually verify ongoing compliance via either self-assessment or outside-compliance review; document the choice and the result.

### C.3 Onward transfer (Accountability for Onward Transfer Principle)

Where the Importer engages a sub-processor for processing of personal data received under the DPF, the Importer (as Onward Transfer originator):

- Limits the onward transfer to specified, limited purposes consistent with the consent provided by, or on behalf of, the data subject;
- Enters into a written contract with the sub-processor providing the same level of protection as the relevant Principles;
- Takes reasonable and appropriate steps to ensure the sub-processor effectively processes the personal data in a manner consistent with the Importer's obligations under the Principles; and
- Stops and remediates any unauthorised processing on notice.

### C.4 Phase-2 EU-region migration plan

| Phase | Posture | Migration trigger |
|---|---|---|
| Phase-1 (M0 → M3) | US-based Importer + DPF self-cert + SCCs Module 2 + supplementary measures (Part B). | — |
| Phase-2 (M3+) | Frankfurt EU region available. Customer may select EU-region at provisioning or migrate existing tenant. SCCs cease to govern intra-EU processing for that tenant; cross-border SCCs continue to govern any sub-processor onward transfers (e.g., Anthropic LLM calls). | Customer election; or any material adverse change to DPF status. |
| Phase-3 (M9+) | EU-region default; US-region opt-in only for customers with US-only workforce. | Operational threshold and customer mix. |

### C.5 DPF dependency risk and contingency

The DPF Adequacy Decision is subject to ongoing legal challenge. The Importer and Controller acknowledge the dependency and adopt the following contingency: **regardless of DPF status, these SCCs Module 2 with the Part B supplementary measures shall continue to govern the transfer.** If the DPF Adequacy Decision is invalidated or suspended, the parties shall (i) immediately reassess the TIA per B.5; (ii) accelerate Phase-2 EU-region migration where applicable; (iii) suspend transfers per Clause 14(f) where the reassessment so requires.

---

## Part D — Operational appendices

### D.1 Mapping table — SCC clause to Bematist control

| SCC clause | Bematist control / commitment | Verification |
|---|---|---|
| Clause 1 (purpose) | DPA recital + Annex I.B above | DPA §1 |
| Clause 2 (third-party beneficiaries) | Acknowledged; Clause 3 enumerates the third-party-beneficiary clauses | SCC text |
| Clause 5 (hierarchy) | These SCCs prevail over DPA / MSA in scope | A.8 above |
| Clause 6 (description of transfer) | Annex I.B per A.2 above | A.2 |
| Clause 7 (docking) | A.6 above | A.6 |
| Clause 8.1 (instructions) | DPA §2 limits processing to Controller-documented instructions | DPA §2 |
| Clause 8.2 (purpose limitation) | DPIA §2.3 unlawful-purpose list reflected in DPA | DPIA |
| Clause 8.3 (transparency) | Bill of Rights at `/privacy`; egress journal via `bematist audit --tail`; `audit_events` per-view notification | CLAUDE.md §Bill of Rights, §Security Rules |
| Clause 8.4 (accuracy) | Pricing-version stamping (D21); metric versioning (D13) | CLAUDE.md §Scoring Rules |
| Clause 8.5 (duration of processing and erasure) | 7-day erasure SLA; partition-drop on `(tenant_id, engineer_id, day)` | CLAUDE.md §GDPR; Decision D8 |
| Clause 8.6 (security; breach notification) | A.4 above; Art. 33 breach runbook in DPA | A.4 |
| Clause 8.7 (sensitive data) | Forbidden-field rejection; on-device Clio pipeline | A.4.8; CLAUDE.md §AI Rules |
| Clause 8.8 (onward transfer) | Sub-processor schedule + Clause 9 | A.5; C.3 |
| Clause 8.9 (documentation and compliance) | Records of processing on Controller request | A.4.11 |
| Clause 9 (sub-processors) | Option 2 with 30-day notice | A.5 |
| Clause 10 (data-subject rights) | `bematist export`, `bematist erase`; 7-day SLA | CLAUDE.md §GDPR |
| Clause 11 (redress) | Independent recourse mechanism (DPF-listed); Controller-facing complaint contact | C.2.4 |
| Clause 12 (liability) | Per DPA liability schedule | DPA |
| Clause 13 (supervision) | A.3 above | A.3 |
| Clause 14 (local laws) | TIA Part B above; EDPB Recommendations 01/2020 conformity | Part B |
| Clause 15 (government access) | CLOUD Act resistance clause; transparency report; Part B Step 4 supplementary measures | DPA; B.4 |
| Clause 16 (non-compliance termination) | Importer notifies Controller; Controller may terminate transfer | SCC text |
| Clause 17 (governing law) | A.7 above | A.7 |
| Clause 18 (forum and jurisdiction) | A.7 above | A.7 |

### D.2 Reassessment triggers

The parties reassess these SCCs and the TIA on any of the following events:

- Material change to recipient-country law or practice affecting effectiveness of the transfer tool (per B.5).
- Invalidation or suspension of the EU-US DPF Adequacy Decision.
- Change of Importer or addition / removal of any sub-processor with cross-border processing.
- Change of Bematist privacy-tier default.
- Adoption by Bematist of a new technical or organisational measure relevant to Annex II.
- Any data breach involving cross-border data flows.

### D.3 Document retention

The Controller retains the executed SCCs, TIA, sub-processor schedule, and DPF self-certification confirmation for the duration of the transfer plus three years. The Importer retains for the same period and supplies on Controller request under SCC Clause 8.4.

---

## Customer DPO sign-off checklist (the 7 items)

- [ ] **1.** Annex I.A identities (Controller and Importer) populated and verified.
- [ ] **2.** Annex I.B description of the transfer matches the deployment (tier, IT-default 21d if applicable, sub-processor list).
- [ ] **3.** Annex I.C competent supervisory authority correct for the Controller's main establishment.
- [ ] **4.** Annex II technical-and-organisational measures verified against the shipped product release tag {{VERSION_LOGICIELLE}}.
- [ ] **5.** Sub-processor authorisation choice (Option 1 / Option 2) selected and notification email pre-configured.
- [ ] **6.** TIA Part B reviewed for the specific recipient country; supplementary measures verified.
- [ ] **7.** Where the Importer or a sub-processor is US-based, DPF self-certification status verified on the Department of Commerce list and Part C checklist completed.

---

## Changelog

- **2026-04-17 — v1.0.0-draft.** Initial SCC Module-2 pre-fill plus TIA plus DPF self-certification plan (Workstream I A13). Covers Commission SCCs 2021/914 Module 2 + Schrems II + EDPB Recommendations 01/2020 + EU-US DPF Adequacy Decision (EU) 2023/1795 + EO 14086 + DPRC + UK ICO Addendum reference. Phase-2 Frankfurt EU region migration plan included. Default sub-processor authorisation set to Option 2 (general written authorisation + 30-day notice).

## Cross-references

- `dev-docs/PRD.md` §12 (Compliance) — cross-border posture: SCCs 2021/914 Module 2 + TIA + DPF self-cert; Phase-2 EU-region Frankfurt.
- `CLAUDE.md` §Compliance Rules, §Security Rules, §Database Rules, §AI Rules.
- `dev-docs/workstreams/i-compliance-prd.md` §5 SCCs row + §10.4 SBOM CI gate.
- `legal/review/DPIA.md` — Section 1.6 sub-processors, Section 4 R6 cross-border transfer risk.
- `legal/review/works-agreement-DE.md` §7 Abs. 8 — references this file as the cross-border instrument.
- `legal/review/cse-consultation-FR.md` §10 c. 7 — references this file.
- `legal/review/union-agreement-IT.md` §10 c. 7 — references this file.
- `legal/review/bill-of-rights-rider.md` Right 1 — references the cert-pinned egress allowlist as a cross-border-relevant control.

**Not legal advice.** This document is a processor-supplied pre-fill. The Controller's Data Protection Officer and counsel are responsible for validating, amending, and signing the final SCCs, TIA, and DPF documentation in light of the Controller's specific deployment and recipient-country posture.
