-- packages/schema/clickhouse/0001_events.sql (draft per PRD §5.3)
CREATE TABLE IF NOT EXISTS events (
  -- Identity & dedup
  client_event_id      UUID,
  schema_version       UInt8,
  ts                   DateTime64(3, 'UTC'),

  -- Tenant / actor (server-derived; see 01-event-wire.md)
  org_id               LowCardinality(String),
  engineer_id          String,                       -- = stable_hash(SSO_subject)
  device_id            String,

  -- Source
  source               LowCardinality(String),       -- 'claude-code', 'cursor', etc.
  source_version       LowCardinality(String),
  fidelity             Enum8('full'=1, 'estimated'=2, 'aggregate-only'=3, 'post-migration'=4),
  cost_estimated       UInt8,

  -- Tier
  tier                 Enum8('A'=1, 'B'=2, 'C'=3),

  -- Session / sequencing
  session_id           String,                        -- hashed when tier='A'
  event_seq            UInt32,
  parent_session_id    Nullable(String),

  -- OTel gen_ai.*
  gen_ai_system        LowCardinality(String),
  gen_ai_request_model LowCardinality(String),
  gen_ai_response_model LowCardinality(String),
  input_tokens         UInt32,
  output_tokens        UInt32,
  cache_read_input_tokens   UInt32,
  cache_creation_input_tokens UInt32,

  -- dev_metrics.*
  event_kind           LowCardinality(String),
  cost_usd             Float64,
  pricing_version      LowCardinality(String),
  duration_ms          UInt32,
  tool_name            LowCardinality(String),
  tool_status          LowCardinality(String),
  hunk_sha256          Nullable(String),
  file_path_hash       Nullable(String),
  edit_decision        LowCardinality(String),
  revert_within_24h    Nullable(UInt8),
  first_try_failure    Nullable(UInt8),

  -- Tier-C content (server-redacted before insert)
  prompt_text          Nullable(String),
  tool_input           Nullable(String),
  tool_output          Nullable(String),

  -- Clio output for Tier B+
  prompt_abstract      Nullable(String),
  prompt_embedding     Array(Float32),
  prompt_index         UInt32,

  -- Redaction
  redaction_count      UInt32,

  -- Outcome attribution joins
  pr_number            Nullable(UInt32),
  commit_sha           Nullable(String),
  branch               LowCardinality(Nullable(String)),

  -- Catch-all for unknown attributes (D16)
  raw_attrs            String                          -- JSON blob
)
-- NOTE: contract 09 says ReplacingMergeTree(client_event_id), but CH rejects UUID as
-- a version column (code 169 BAD_TYPE_OF_FIELD). Use ts (DateTime64) as the version
-- column — keeps "latest by ORDER BY key" semantics. Dedup is still authoritative
-- via Redis SETNX at ingest (D14); this engine is a safety net only.
ENGINE = ReplacingMergeTree(ts)
PARTITION BY (toYYYYMM(ts), cityHash64(org_id) % 16)
ORDER BY (org_id, ts, engineer_id)
SETTINGS index_granularity = 8192;
