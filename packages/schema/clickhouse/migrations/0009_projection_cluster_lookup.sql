-- D1-03: cluster_lookup projection on events. Covers cluster-drill queries
-- that filter by (org_id, prompt_cluster_id). Additive — does not change
-- the primary ORDER BY.
ALTER TABLE events ADD PROJECTION IF NOT EXISTS cluster_lookup (
  SELECT *
  ORDER BY (org_id, prompt_cluster_id, ts)
);
ALTER TABLE events MATERIALIZE PROJECTION cluster_lookup;
