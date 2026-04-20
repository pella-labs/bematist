import type { schemas } from "@bematist/api";
import { Fragment } from "react";
import "../new-dashboard.css";

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const INT = new Intl.NumberFormat("en-US");
const TOK = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface Props {
  data: schemas.ActivityOverviewOutput;
  window: "7d" | "30d" | "90d";
}

export function ActivitySection({ data, window }: Props) {
  const { kpis, daily, heatmap, top_tools, top_models } = data;
  const maxHeat = Math.max(1, ...heatmap.map((h) => h.sessions));

  return (
    <section className="newdash-section" data-newdash-section="activity">
      <h2>Activity</h2>
      <p className="newdash-section-sub">What happened in the last {windowLabel(window)}.</p>

      <div className="newdash-kpi-row">
        <div className="newdash-card">
          <span className="newdash-card-label">Sessions</span>
          <span className="newdash-card-value">{INT.format(kpis.sessions)}</span>
          <span className="newdash-card-hint">
            across {INT.format(kpis.active_days)} active days
          </span>
        </div>
        <div className="newdash-card">
          <span className="newdash-card-label">Spend</span>
          <span className="newdash-card-value">{USD.format(kpis.spend_usd)}</span>
          <span className="newdash-card-hint">
            avg {USD.format(kpis.avg_session_cost)} / session
          </span>
        </div>
        <div className="newdash-card">
          <span className="newdash-card-label">Input tokens</span>
          <span className="newdash-card-value">{TOK.format(kpis.input_tokens)}</span>
          <span className="newdash-card-hint">cache read {TOK.format(kpis.cache_read_tokens)}</span>
        </div>
        <div className="newdash-card">
          <span className="newdash-card-label">Output tokens</span>
          <span className="newdash-card-value">{TOK.format(kpis.output_tokens)}</span>
          <span className="newdash-card-hint">
            {kpis.sessions > 0 ? INT.format(Math.round(kpis.output_tokens / kpis.sessions)) : "0"} /
            session
          </span>
        </div>
      </div>

      <div className="newdash-grid-2">
        <div className="newdash-card">
          <span className="newdash-card-label">Daily spend</span>
          <DailyTrend daily={daily} />
        </div>
        <div className="newdash-card">
          <span className="newdash-card-label">When your team ships</span>
          <Heatmap heatmap={heatmap} max={maxHeat} />
        </div>
      </div>

      <div className="newdash-grid-2">
        <div className="newdash-card">
          <span className="newdash-card-label">Top tools</span>
          {top_tools.length === 0 ? (
            <div className="newdash-empty">No tool usage in this window yet.</div>
          ) : (
            <table className="newdash-table">
              <thead>
                <tr>
                  <th>Tool</th>
                  <th style={{ textAlign: "right" }}>Calls</th>
                  <th style={{ textAlign: "right" }}>Errors</th>
                </tr>
              </thead>
              <tbody>
                {top_tools.map((t) => (
                  <tr key={t.tool_name}>
                    <td>{t.tool_name}</td>
                    <td style={{ textAlign: "right" }}>{INT.format(t.calls)}</td>
                    <td style={{ textAlign: "right" }}>{INT.format(t.errors)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="newdash-card">
          <span className="newdash-card-label">Top models</span>
          {top_models.length === 0 ? (
            <div className="newdash-empty">
              No model attribution yet — this fills in as sessions ship.
            </div>
          ) : (
            <table className="newdash-table">
              <thead>
                <tr>
                  <th>Model</th>
                  <th style={{ textAlign: "right" }}>Sessions</th>
                  <th style={{ textAlign: "right" }}>Spend</th>
                </tr>
              </thead>
              <tbody>
                {top_models.map((m) => (
                  <tr key={m.model}>
                    <td>{m.model}</td>
                    <td style={{ textAlign: "right" }}>{INT.format(m.sessions)}</td>
                    <td style={{ textAlign: "right" }}>{USD.format(m.spend_usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}

function windowLabel(window: "7d" | "30d" | "90d"): string {
  if (window === "7d") return "7 days";
  if (window === "90d") return "90 days";
  return "30 days";
}

function DailyTrend({ daily }: { daily: schemas.ActivityDailyPoint[] }) {
  if (daily.length === 0) {
    return <div className="newdash-empty">No activity in this window yet.</div>;
  }
  const maxSpend = Math.max(1, ...daily.map((d) => d.spend_usd));
  const width = 100;
  const height = 80;
  const stepX = width / Math.max(1, daily.length - 1);
  const points = daily
    .map((d, i) => {
      const x = i * stepX;
      const y = height - (d.spend_usd / maxSpend) * height;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <div className="newdash-trend">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" width="100%" height="100%">
        <title>Daily spend ($) over the filter window</title>
        <polyline
          points={points}
          fill="none"
          stroke="var(--mk-accent)"
          strokeWidth={1.25}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "0.7rem",
          color: "var(--mk-ink-faint)",
        }}
      >
        <span>{daily[0]?.day}</span>
        <span>{USD.format(maxSpend)} peak</span>
        <span>{daily[daily.length - 1]?.day}</span>
      </div>
    </div>
  );
}

function Heatmap({ heatmap, max }: { heatmap: schemas.ActivityHeatmapCell[]; max: number }) {
  const byDow = new Map<number, Map<number, number>>();
  for (const c of heatmap) {
    const row = byDow.get(c.dow) ?? new Map();
    row.set(c.hour, c.sessions);
    byDow.set(c.dow, row);
  }
  return (
    <div>
      <div className="newdash-heatmap">
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} style={{ textAlign: "center" }}>
            {h % 6 === 0 ? h : ""}
          </span>
        ))}
        {DOW_LABELS.map((label, dow) => (
          <Fragment key={`dow-${dow}`}>
            <span>{label}</span>
            {Array.from({ length: 24 }, (_, h) => {
              const v = byDow.get(dow)?.get(h) ?? 0;
              const alpha = max > 0 ? v / max : 0;
              return (
                <span
                  key={`${dow}-${h}`}
                  className="newdash-heatmap-cell"
                  title={`${DOW_LABELS[dow]} ${h}:00 — ${v} sessions`}
                  style={{
                    backgroundColor: `rgba(110, 138, 111, ${0.08 + alpha * 0.9})`,
                  }}
                />
              );
            })}
          </Fragment>
        ))}
      </div>
      <div style={{ fontSize: "0.7rem", color: "var(--mk-ink-faint)", marginTop: "0.25rem" }}>
        Each cell is an hour of the week; deeper sage = more sessions.
      </div>
    </div>
  );
}
