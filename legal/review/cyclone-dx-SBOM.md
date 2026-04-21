# CycloneDX Software Bill of Materials — generation, validation, and release-gate plan

**SBOM specification:** CycloneDX 1.5 (ECMA-424); JSON encoding.
**Template version:** 1.0.0-draft
**Maintained by:** Bema Workstream I (Compliance), in coordination with Workstream F (release tooling — Sebastian).
**Audience:** release engineering; supply-chain auditors; procurement security teams (SIG Lite I.10 + STA-14; CAIQ STA-14).
**Cross-PRD reference:** Workstream I PRD §10.4 (SBOM CI gate; IW-3) — the M3 release gate.

> **Status — DRAFT.** This document specifies how Bema generates, validates, signs, and publishes a CycloneDX 1.5 SBOM with every release; it includes a runnable generation script, a JSON schema-validation step, and an example output. The CI integration into Sebastian's SLSA Level 3 release workflow is the IW-3 cross-workstream coordination point.

---

## 1. Why CycloneDX 1.5

| Driver | Reference |
|---|---|
| Customer procurement requires an SBOM | CAIQ STA-14; SIG Lite I.10; PRD §12 vendor-readiness |
| Executive Order 14028 (US, 2021) and OMB M-22-18 / M-23-16 | Federal-procurement-adjacent customers expect machine-readable SBOMs |
| EU CRA (Cyber Resilience Act, 2024 — phased application 2026 / 2027) | Manufacturer-of-products-with-digital-elements obligation to maintain an SBOM |
| Bema's own supply-chain risk management | Continuous Dependabot + diff against last-release SBOM detects malicious-update injection |
| CycloneDX vs. SPDX | Bema uses **CycloneDX 1.5** as the canonical format; SPDX-2.3 conversion is supplied on request via `cyclonedx-cli convert`. Rationale: CycloneDX has first-class support for VEX (vulnerability-exchange) attestations and is the Cloud Native Computing Foundation graduated standard for container SBOM. |

---

## 2. Scope per artifact

Bema ships several distinct artifacts; each gets its own SBOM:

| Artifact | Location | SBOM file |
|---|---|---|
| Bema collector binary (Bun-compiled, single binary, per-OS-per-arch) | GitHub Release asset `bema-<version>-<os>-<arch>` | `bema-<version>-<os>-<arch>.cdx.json` |
| `apps/web` container image | GHCR `ghcr.io/bema/web:<version>` | `web-<version>.cdx.json` |
| `apps/ingest` container image | GHCR `ghcr.io/bema/ingest:<version>` | `ingest-<version>.cdx.json` |
| `apps/worker` container image | GHCR `ghcr.io/bema/worker:<version>` | `worker-<version>.cdx.json` |
| `apps/ingest-sidecar` (Go side-car, per F15 Plan B) | GHCR `ghcr.io/bema/ingest-sidecar:<version>` | `ingest-sidecar-<version>.cdx.json` |
| Aggregate "release" SBOM (union of all of the above + cross-references) | GitHub Release asset `bema-<version>.cdx.json` | as listed |

The aggregate release SBOM is the canonical artifact cited in compliance questionnaires. Per-image SBOMs are kept available for fine-grained scanning by customer security tooling.

---

## 3. Required CycloneDX 1.5 fields

Per the CycloneDX specification, every Bema SBOM contains:

- `bomFormat` = `"CycloneDX"`.
- `specVersion` = `"1.5"`.
- `serialNumber` — RFC 4122 UUID v4 unique to the SBOM document.
- `version` — integer; bumped if the SBOM is regenerated for the same artifact.
- `metadata.timestamp` — ISO-8601 timestamp of generation.
- `metadata.tools.components[]` — the SBOM generators used (`cyclonedx-bom` for npm/Bun; `syft` for container layer extraction).
- `metadata.authors[]` — `Bema Release Engineering <release@bema.tools>`.
- `metadata.component` — the **subject** component being described (the released artifact).
- `metadata.licenses[]` — declared license of the subject component.
- `metadata.supplier` — Bema legal entity per release.
- `components[]` — each direct and transitive dependency: `bom-ref`, `type`, `name`, `version`, `purl`, `licenses[]`, `hashes[]`, optionally `supplier`, `evidence`.
- `dependencies[]` — directed graph of `bom-ref` to dependents (per CycloneDX 1.5 dependency-graph normalisation).
- `compositions[]` — completeness assertion (we assert `aggregate: complete` for first-party + npm/Bun graph; `aggregate: incomplete_first_party_only` if a sub-component graph cannot be exhaustively walked, with the reason annotated).
- `vulnerabilities[]` — VEX attestations where Bema has assessed a known CVE in a transitive dep and asserts not-affected (per CISA "Vulnerability Exploitability eXchange" guidance).
- `signature` — JOSE detached signature over the canonical-JSON-serialised document, signed with the Bema release Ed25519 key (cosign-equivalent; pinned in `SLSA_PROVENANCE_KEY`).

---

## 4. Generation pipeline

The pipeline lives in `.github/workflows/release.yml` (the Sebastian-owned SLSA L3 reusable workflow). The Compliance side of IW-3 supplies:

- `scripts/sbom/generate.sh` (this document, §4.1) — wraps `cyclonedx-bom` + `syft`.
- `scripts/sbom/validate.sh` (this document, §4.2) — schema-validate against the CycloneDX 1.5 JSON schema.
- `scripts/sbom/sign.sh` (this document, §4.3) — produce a detached signature using `cosign sign-blob`.
- `scripts/sbom/diff.sh` (this document, §4.4) — diff vs. previous release SBOM; fail on suspicious additions (license-unknown, license-incompatible, unverified supplier).

### 4.1 Generation script — `scripts/sbom/generate.sh`

```bash
#!/usr/bin/env bash
# generate.sh — produce per-artifact + aggregate CycloneDX 1.5 SBOMs.
# usage: ./generate.sh <version-tag>
set -euo pipefail

VERSION="${1:?version-tag required}"
OUT_DIR="${OUT_DIR:-dist/sbom}"
mkdir -p "$OUT_DIR"

# 1) Bun + npm graph for monorepo workspaces.
#    cyclonedx-bom understands Bun's lockfile layout (treats bun.lock as npm-equivalent).
bunx --bun @cyclonedx/cyclonedx-bom \
  --output-format JSON \
  --output-file "$OUT_DIR/bema-workspaces-${VERSION}.cdx.json" \
  --spec-version 1.5 \
  --package-lock-only

# 2) Per-image SBOMs via syft (covers OS layers + language packages inside the image).
for IMG in web ingest worker ingest-sidecar; do
  syft "ghcr.io/bema/${IMG}:${VERSION}" \
       -o cyclonedx-json \
       --file "$OUT_DIR/${IMG}-${VERSION}.cdx.json"
done

# 3) Collector binary SBOMs — bun-compiled single binary; we treat the binary as a
#    component whose dependencies are the workspace graph at compile time.
for OS_ARCH in linux-amd64 linux-arm64 darwin-amd64 darwin-arm64 windows-amd64; do
  cp "$OUT_DIR/bema-workspaces-${VERSION}.cdx.json" \
     "$OUT_DIR/bema-${VERSION}-${OS_ARCH}.cdx.json"
  # The wrapper rewrites metadata.component to point at the binary, sets a fresh serialNumber
  # and preserves the components[] graph from the workspace SBOM.
  bunx --bun ts-node scripts/sbom/rewrite-binary-meta.ts \
    "$OUT_DIR/bema-${VERSION}-${OS_ARCH}.cdx.json" \
    --binary-purl "pkg:generic/bema@${VERSION}?os=${OS_ARCH%-*}&arch=${OS_ARCH##*-}"
done

# 4) Aggregate release SBOM — merges all of the above.
bunx --bun ts-node scripts/sbom/aggregate.ts \
  --version "$VERSION" \
  --inputs "$OUT_DIR"/*.cdx.json \
  --output "$OUT_DIR/bema-${VERSION}.cdx.json"

echo "Generated SBOMs in $OUT_DIR:"
ls -la "$OUT_DIR"
```

### 4.2 Validation script — `scripts/sbom/validate.sh`

```bash
#!/usr/bin/env bash
# validate.sh — JSON-schema validation against CycloneDX 1.5.
# usage: ./validate.sh <sbom.cdx.json> [<sbom.cdx.json> ...]
set -euo pipefail

SCHEMA_URL="https://cyclonedx.org/schema/bom-1.5.schema.json"
SCHEMA_FILE="${SCHEMA_FILE:-/tmp/cdx-1.5.schema.json}"

# Cache the schema locally for hermetic CI.
if [[ ! -f "$SCHEMA_FILE" ]]; then
  curl --fail --silent --show-error --output "$SCHEMA_FILE" "$SCHEMA_URL"
fi

EXIT=0
for SBOM in "$@"; do
  # 1) JSON schema validation.
  if ! bunx --bun ajv-cli validate -s "$SCHEMA_FILE" -d "$SBOM" --strict=false --verbose; then
    echo "FAIL: schema validation failed: $SBOM"
    EXIT=1
    continue
  fi

  # 2) Field-completeness assertions Bema requires beyond the spec minimum.
  bunx --bun ts-node scripts/sbom/check-required-fields.ts "$SBOM" || EXIT=1

  # 3) Lint with cyclonedx-cli (catches duplicate refs, dangling deps, etc.).
  bunx --bun @cyclonedx/cyclonedx-cli validate \
    --input-file "$SBOM" --input-format json --fail-on-errors || EXIT=1
done

exit "$EXIT"
```

The required-field check (`scripts/sbom/check-required-fields.ts`) asserts:

- `metadata.component.name` is present.
- `metadata.component.version` matches the release tag.
- `metadata.component.licenses[].license.id` is in the project's allowed-license-list (Apache-2.0, MIT, BSD-2-Clause, BSD-3-Clause, ISC, MPL-2.0, BSL-1.1 for first-party gateway/admin per Decision D18; copyleft licenses GPL/LGPL/AGPL not allowed in dependency graph).
- `serialNumber` is a valid RFC-4122 UUID.
- `compositions[].aggregate` is one of `complete` or `incomplete_first_party_only` with a `notes` annotation.
- `signature` is present on the aggregate release SBOM.

### 4.3 Signing — `scripts/sbom/sign.sh`

```bash
#!/usr/bin/env bash
# sign.sh — sign each SBOM with cosign sign-blob using the Bema release key.
# usage: ./sign.sh <sbom.cdx.json> [<sbom.cdx.json> ...]
set -euo pipefail

for SBOM in "$@"; do
  cosign sign-blob \
    --key "$SLSA_PROVENANCE_KEY" \
    --output-signature "${SBOM}.sig" \
    --output-certificate "${SBOM}.pem" \
    --yes \
    "$SBOM"
done
```

### 4.4 Diff — `scripts/sbom/diff.sh`

Runs **after** validation. Compares the new aggregate SBOM against the previous release's aggregate SBOM (downloaded from the previous GitHub Release). Fails the build on:

- A new direct dependency added without a PR review trail (cross-checked against `package.json` diff).
- A new transitive dependency whose `licenses[].license.id` is not on the allowed list.
- A `supplier` change for an existing component (potential supply-chain attack indicator).
- Removal of `evidence` field where it was present in the previous SBOM (regression in metadata quality).

### 4.5 Release-workflow integration

In `.github/workflows/release.yml` (Sebastian-owned per F + IW-3), add a **`sbom`** job that runs:

```yaml
sbom:
  needs: [build, image]
  runs-on: ubuntu-latest
  permissions:
    contents: write   # release-asset upload
    id-token: write   # cosign keyless if used; not required because we use SLSA_PROVENANCE_KEY
  steps:
    - uses: actions/checkout@v4
    - uses: oven-sh/setup-bun@v2
      with:
        bun-version: 1.3.4
    - name: Install scanners
      run: |
        curl -sSfL https://raw.githubusercontent.com/anchore/syft/main/install.sh | sh -s -- -b /usr/local/bin
        bunx --bun @cyclonedx/cyclonedx-bom --version
        bunx --bun @cyclonedx/cyclonedx-cli --version
    - name: Generate SBOMs
      run: scripts/sbom/generate.sh "${GITHUB_REF_NAME}"
    - name: Validate SBOMs (CycloneDX 1.5 schema)
      run: scripts/sbom/validate.sh dist/sbom/*.cdx.json
    - name: Diff against previous release
      run: scripts/sbom/diff.sh dist/sbom/bema-${GITHUB_REF_NAME}.cdx.json
    - name: Sign SBOMs
      env:
        SLSA_PROVENANCE_KEY: ${{ secrets.SLSA_PROVENANCE_KEY }}
      run: scripts/sbom/sign.sh dist/sbom/*.cdx.json
    - name: Upload SBOM assets to release
      uses: softprops/action-gh-release@v2
      with:
        files: |
          dist/sbom/bema-${{ github.ref_name }}.cdx.json
          dist/sbom/bema-${{ github.ref_name }}.cdx.json.sig
          dist/sbom/bema-${{ github.ref_name }}.cdx.json.pem
          dist/sbom/*-${{ github.ref_name }}.cdx.json
          dist/sbom/*-${{ github.ref_name }}.cdx.json.sig
```

The `sbom` job is a **release-blocking** job: failure fails the release. This is the IW-3 / M3 release-gate enforcement point per Workstream I PRD §10.4.

---

## 5. Example output (truncated)

A representative aggregate release SBOM looks like:

```json
{
  "bomFormat": "CycloneDX",
  "specVersion": "1.5",
  "serialNumber": "urn:uuid:9c9b2f4e-2e5e-4a2f-9c1a-2f3a4b5c6d7e",
  "version": 1,
  "metadata": {
    "timestamp": "2026-04-17T10:42:00Z",
    "tools": {
      "components": [
        {
          "type": "application",
          "name": "@cyclonedx/cyclonedx-bom",
          "version": "5.0.0"
        },
        {
          "type": "application",
          "name": "syft",
          "version": "1.10.0"
        }
      ]
    },
    "authors": [
      {
        "name": "Bema Release Engineering",
        "email": "release@bema.tools"
      }
    ],
    "component": {
      "bom-ref": "pkg:generic/bema@0.0.0",
      "type": "application",
      "name": "bema",
      "version": "0.0.0",
      "description": "Bema — open-source AI-engineering analytics platform.",
      "supplier": {
        "name": "Bema",
        "url": ["https://bema.tools"]
      },
      "licenses": [
        { "license": { "id": "Apache-2.0" } }
      ],
      "purl": "pkg:generic/bema@0.0.0"
    }
  },
  "components": [
    {
      "bom-ref": "pkg:npm/drizzle-orm@0.36.4",
      "type": "library",
      "name": "drizzle-orm",
      "version": "0.36.4",
      "purl": "pkg:npm/drizzle-orm@0.36.4",
      "licenses": [{ "license": { "id": "Apache-2.0" } }],
      "hashes": [
        { "alg": "SHA-256", "content": "<placeholder-hash-filled-by-cyclonedx-bom>" }
      ]
    },
    {
      "bom-ref": "pkg:npm/zod@3.23.8",
      "type": "library",
      "name": "zod",
      "version": "3.23.8",
      "purl": "pkg:npm/zod@3.23.8",
      "licenses": [{ "license": { "id": "MIT" } }]
    },
    {
      "bom-ref": "pkg:npm/@clickhouse/client@<pinned-version>",
      "type": "library",
      "name": "@clickhouse/client",
      "version": "<pinned-version>",
      "purl": "pkg:npm/@clickhouse/client@<pinned-version>",
      "licenses": [{ "license": { "id": "Apache-2.0" } }]
    }
  ],
  "dependencies": [
    {
      "ref": "pkg:generic/bema@0.0.0",
      "dependsOn": [
        "pkg:npm/drizzle-orm@0.36.4",
        "pkg:npm/zod@3.23.8",
        "pkg:npm/@clickhouse/client@<pinned-version>"
      ]
    }
  ],
  "compositions": [
    {
      "aggregate": "complete",
      "assemblies": ["pkg:generic/bema@0.0.0"]
    }
  ],
  "vulnerabilities": []
}
```

> **Note on the example.** The `version` field on the subject component is filled from `package.json` at build time; the `0.0.0` shown is the current pre-release placeholder per `package.json`. Hashes, dependency-graph completeness, and the full transitive list are produced by the generators — not hand-curated. The example is intentionally trimmed; a real release SBOM contains hundreds of components.

---

## 6. VEX attestations (vulnerability exchange)

Per CycloneDX 1.5 §`vulnerabilities`, Bema publishes VEX statements as part of the SBOM where a known CVE applies to a transitive dependency that Bema has assessed not-exploitable in our usage profile. Format:

```json
{
  "vulnerabilities": [
    {
      "id": "CVE-XXXX-NNNNN",
      "source": { "name": "NVD", "url": "https://nvd.nist.gov/vuln/detail/CVE-XXXX-NNNNN" },
      "ratings": [{ "severity": "high" }],
      "affects": [{ "ref": "pkg:npm/<lib>@<ver>" }],
      "analysis": {
        "state": "not_affected",
        "justification": "code_not_reachable",
        "detail": "Bema does not invoke the vulnerable code path because <reason>."
      }
    }
  ]
}
```

VEX entries reduce noise in customer-side scanners. The `analysis.state` enumeration (`affected`, `exploitable`, `false_positive`, `not_affected`, `under_investigation`) follows the CISA VEX guidance.

---

## 7. Distribution

| Channel | Audience | Cadence |
|---|---|---|
| GitHub Release assets | All users | Every release |
| GHCR image annotations | Container scanners | Every image push |
| Customer trust portal (Phase 2+) | Procurement / TPRM | On request, latest + previous-3 |
| `sigstore-rekor` transparency log | Anyone | Each cosign signature is logged to Rekor for transparent verification |

---

## 8. Migration to SPDX where required

For customers requiring SPDX 2.3, conversion is supplied via:

```bash
bunx --bun @cyclonedx/cyclonedx-cli convert \
  --input-file dist/sbom/bema-${VERSION}.cdx.json \
  --input-format json \
  --output-file dist/sbom/bema-${VERSION}.spdx.json \
  --output-format spdxjson
```

The CycloneDX 1.5 → SPDX 2.3 conversion is lossy (CycloneDX-only fields like `compositions` and rich `evidence` are dropped). The CycloneDX format is canonical.

---

## 9. Self-host customer guidance

Self-host customers running Bema on their own infrastructure can:

1. Pull the corresponding GitHub Release SBOMs for their installed version.
2. Verify the cosign signature using the Bema public key documented in `SECURITY.md`.
3. Feed the SBOM into their own SCA / vulnerability scanner (e.g., Grype, Trivy, Anchore Enterprise).
4. Subscribe to the Bema SECURITY-advisories mailing list to receive VEX-update notifications between releases.

Self-host customers who need an SBOM for **their own modified build** of Bema (open-source modification per Apache 2.0) regenerate using the provided scripts; the supply-chain integrity claim then attaches to their build, not Bema's.

---

## 10. Operational responsibilities

| Owner | Responsibility |
|---|---|
| Workstream F (Sebastian) | CI integration; release-workflow ownership; SLSA Level 3 attestation |
| Workstream I (Compliance) | This document; license-allowlist policy; VEX statements for public CVEs |
| Workstream G-back (Walid) | Coordination on `redact` and `clio` package SBOM completeness |
| Customer security teams | Consume SBOM via their TPRM tooling |

The IW-3 cross-workstream coordination point (Workstream I PRD §8) is the agreement that this SBOM ships **schema-validated** as an M3 release gate: the `sbom` workflow job must exit 0 before any release is published.

---

## Changelog

- **2026-04-17 — v1.0.0-draft.** Initial CycloneDX 1.5 SBOM specification, generation pipeline, validation steps, signing flow, example output, and SPDX conversion path (Workstream I A13). Cross-link to F (Sebastian) for release-workflow integration; M3 gate per Workstream I PRD §10.4.

## Cross-references

- `dev-docs/PRD.md` §12 (Compliance — vendor-assessment readiness; CycloneDX SBOM per release).
- `dev-docs/workstreams/i-compliance-prd.md` §10.4 (SBOM CI gate IW-3).
- `CLAUDE.md` §"Tech Stack" (build provenance: Sigstore + cosign + SLSA Level 3); §"Compliance Rules".
- `legal/review/CAIQ-v4.0.3.md` STA-14 (SBOM evidence row).
- `legal/review/SIG-Lite-2024.md` I.10 (third-party components).
- `legal/review/SOC2-prep.md` CC8.1 (change management).
- `SECURITY.md` — public disclosure path; cosign public-key location.

**Not legal or audit advice.** This document specifies a process; release-engineering tooling implements it. Customer SCA tooling validates on consumption.
