import type { schemas } from "@bematist/api";
import "../new-dashboard.css";

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const INT = new Intl.NumberFormat("en-US");
const PCT = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });

interface Props {
  data: schemas.CodeDeliveryOutput;
}

export function DeliverySection({ data }: Props) {
  const { pr_kpis, merge_latency, weekly_throughput, size_distribution, pr_by_repo } = data;
  const totalSizes =
    size_distribution.xs +
    size_distribution.s +
    size_distribution.m +
    size_distribution.l +
    size_distribution.xl;

  return (
    <section className="newdash-section" data-newdash-section="delivery">
      <h2>Code delivery</h2>
      <p className="newdash-section-sub">How PRs are moving through GitHub in this window.</p>

      <div className="newdash-kpi-row">
        <div className="newdash-card">
          <span className="newdash-card-label">Opened</span>
          <span className="newdash-card-value">{INT.format(pr_kpis.opened)}</span>
        </div>
        <div className="newdash-card">
          <span className="newdash-card-label">Merged</span>
          <span className="newdash-card-value">{INT.format(pr_kpis.merged)}</span>
        </div>
        <div className="newdash-card">
          <span className="newdash-card-label">Open now</span>
          <span className="newdash-card-value">{INT.format(pr_kpis.open_now)}</span>
        </div>
        <div className="newdash-card">
          <span className="newdash-card-label">Revert rate</span>
          <span className="newdash-card-value">
            {pr_kpis.revert_pct == null ? "—" : PCT.format(pr_kpis.revert_pct)}
          </span>
        </div>
      </div>

      <div className="newdash-kpi-row">
        <div className="newdash-card">
          <span className="newdash-card-label">Median time to merge</span>
          <span className="newdash-card-value">
            {merge_latency.median_hours == null ? "—" : formatHours(merge_latency.median_hours)}
          </span>
          <span className="newdash-card-hint">
            p90 {merge_latency.p90 == null ? "—" : formatHours(merge_latency.p90)}
          </span>
        </div>
        <div className="newdash-card">
          <span className="newdash-card-label">First-try rate</span>
          <span className="newdash-card-value">
            {pr_kpis.first_try_pct == null ? "—" : PCT.format(pr_kpis.first_try_pct)}
          </span>
        </div>
        <div className="newdash-card">
          <span className="newdash-card-label">Commits without a PR</span>
          <span className="newdash-card-value">{INT.format(data.commits_without_pr)}</span>
        </div>
      </div>

      <div className="newdash-cost-card">
        <span className="newdash-card-label">Cost per merged PR</span>
        {data.cost_per_merged_pr == null ? (
          <>
            <span className="newdash-cost-value">—</span>
            <span className="newdash-card-hint">
              Waiting for the linker to connect sessions to PRs. Once a handful of merged PRs have a
              matching session, this number shows up.
            </span>
          </>
        ) : (
          <>
            <span className="newdash-cost-value">{USD.format(data.cost_per_merged_pr)}</span>
            <span className="newdash-card-hint">
              Only counts PRs where a Claude Code session touched the same repo inside the merge
              window.
            </span>
          </>
        )}
      </div>

      <div className="newdash-grid-2">
        <div className="newdash-card">
          <span className="newdash-card-label">Weekly throughput</span>
          {weekly_throughput.length === 0 ? (
            <div className="newdash-empty">No PR activity in this window yet.</div>
          ) : (
            <WeeklyThroughputBars data={weekly_throughput} />
          )}
        </div>
        <div className="newdash-card">
          <span className="newdash-card-label">PR size mix</span>
          {totalSizes === 0 ? (
            <div className="newdash-empty">Add a teammate or broaden the window.</div>
          ) : (
            <SizeDistribution dist={size_distribution} total={totalSizes} />
          )}
        </div>
      </div>

      <div className="newdash-card">
        <span className="newdash-card-label">PRs by repo</span>
        {pr_by_repo.length === 0 ? (
          <div className="newdash-empty">No PRs from any tracked repo in this window.</div>
        ) : (
          <table className="newdash-table">
            <thead>
              <tr>
                <th>Repo</th>
                <th style={{ textAlign: "right" }}>Opened</th>
                <th style={{ textAlign: "right" }}>Merged</th>
                <th style={{ textAlign: "right" }}>Open now</th>
                <th style={{ textAlign: "right" }}>Median time to merge</th>
              </tr>
            </thead>
            <tbody>
              {pr_by_repo.slice(0, 12).map((r) => (
                <tr key={r.full_name}>
                  <td>{r.full_name}</td>
                  <td style={{ textAlign: "right" }}>{INT.format(r.opened)}</td>
                  <td style={{ textAlign: "right" }}>{INT.format(r.merged)}</td>
                  <td style={{ textAlign: "right" }}>{INT.format(r.open_now)}</td>
                  <td style={{ textAlign: "right" }}>
                    {r.median_ttm_hours == null ? "—" : formatHours(r.median_ttm_hours)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="newdash-card">
        <span className="newdash-card-label">Contributors</span>
        {data.cohort_gated ? (
          <div className="newdash-note">
            Your team is small. We&rsquo;ll unlock per-teammate breakdowns once at least 5 of your
            teammates are actively shipping events. Use &ldquo;Just me&rdquo; in the filter bar to
            see your own numbers any time.
          </div>
        ) : data.pr_by_author.length === 0 ? (
          <div className="newdash-empty">No PR authors in this window.</div>
        ) : (
          <table className="newdash-table">
            <thead>
              <tr>
                <th>Teammate</th>
                <th style={{ textAlign: "right" }}>Opened</th>
                <th style={{ textAlign: "right" }}>Merged</th>
                <th style={{ textAlign: "right" }}>Reverts</th>
              </tr>
            </thead>
            <tbody>
              {data.pr_by_author.map((a) => (
                <tr key={a.author_hash}>
                  <td>#{a.author_hash}</td>
                  <td style={{ textAlign: "right" }}>{INT.format(a.opened)}</td>
                  <td style={{ textAlign: "right" }}>{INT.format(a.merged)}</td>
                  <td style={{ textAlign: "right" }}>{INT.format(a.revert_count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 48) return `${hours.toFixed(1)}h`;
  return `${Math.round(hours / 24)}d`;
}

function WeeklyThroughputBars({ data }: { data: schemas.WeeklyThroughputPoint[] }) {
  const maxVal = Math.max(1, ...data.map((w) => w.opened + w.merged));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", marginTop: "0.5rem" }}>
      {data.map((w) => (
        <div
          key={w.week}
          style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.78rem" }}
        >
          <span style={{ width: "4.5rem", color: "var(--mk-ink-muted)" }}>{w.week}</span>
          <div style={{ flex: 1, display: "flex", gap: 2 }}>
            <div
              className="newdash-bar"
              style={{ width: `${(w.merged / maxVal) * 100}%`, background: "var(--mk-accent)" }}
              title={`${w.merged} merged`}
            />
            <div
              className="newdash-bar"
              style={{
                width: `${(Math.max(0, w.opened - w.merged) / maxVal) * 100}%`,
                background: "var(--mk-warm)",
                opacity: 0.7,
              }}
              title={`${Math.max(0, w.opened - w.merged)} still open or closed without merge`}
            />
          </div>
          <span style={{ width: "3rem", textAlign: "right" }}>
            {INT.format(w.merged)}/{INT.format(w.opened)}
          </span>
        </div>
      ))}
    </div>
  );
}

function SizeDistribution({ dist, total }: { dist: schemas.SizeDistribution; total: number }) {
  const rows: Array<[string, number, string]> = [
    ["XS (<10)", dist.xs, "Tiny touch-ups"],
    ["S (10–100)", dist.s, "Small diffs"],
    ["M (100–500)", dist.m, "Real features"],
    ["L (500–1000)", dist.l, "Big changes"],
    ["XL (>1000)", dist.xl, "Refactors / drops"],
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", marginTop: "0.5rem" }}>
      {rows.map(([label, v, hint]) => (
        <div
          key={label}
          style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.78rem" }}
        >
          <span style={{ width: "7rem" }}>{label}</span>
          <div style={{ flex: 1 }}>
            <div className="newdash-bar" style={{ width: `${(v / total) * 100}%` }} title={hint} />
          </div>
          <span style={{ width: "2.5rem", textAlign: "right" }}>{INT.format(v)}</span>
        </div>
      ))}
    </div>
  );
}
