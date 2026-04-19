"use client";

import type { schemas } from "@bematist/api";
import { useEffect, useState } from "react";
import "../new-dashboard.css";

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const INT = new Intl.NumberFormat("en-US");

interface Props {
  sessionId: string;
  onClose: () => void;
}

export function SessionDrawer({ sessionId, onClose }: Props) {
  const [data, setData] = useState<schemas.SessionDetailOutput | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    fetch(`/api/new-dashboard/session/${encodeURIComponent(sessionId)}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j) => {
        if (!cancelled) setData(j as schemas.SessionDetailOutput);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <button
        type="button"
        className="newdash-drawer-backdrop"
        aria-label="Close session detail"
        onClick={onClose}
      />
      <aside className="newdash-drawer" role="dialog" aria-label="Session detail">
        <button type="button" className="newdash-drawer-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        {error ? (
          <div className="newdash-note">Couldn&rsquo;t load this session: {error}</div>
        ) : !data ? (
          <div className="newdash-note">Loading session…</div>
        ) : (
          <>
            <div className="newdash-drawer-header">
              <h3>Session {data.header.session_id.slice(0, 8)}…</h3>
              <p>
                Started {new Date(data.header.started_at).toLocaleString()} · teammate #
                {data.header.engineer_id_hash} · {data.header.repo_full_name ?? "no repo linked"} ·{" "}
                {data.header.branch ?? "no branch"} · {data.header.model ?? "no model"}
              </p>
              <p>
                {INT.format(data.header.total_events)} events · {USD.format(data.header.spend_usd)}
              </p>
            </div>

            <div className="newdash-card" style={{ padding: "0.75rem 1rem" }}>
              <span className="newdash-card-label">Tool breakdown</span>
              {data.tool_breakdown.length === 0 ? (
                <div className="newdash-empty">No tool calls in this session.</div>
              ) : (
                <table className="newdash-table">
                  <thead>
                    <tr>
                      <th>Tool</th>
                      <th style={{ textAlign: "right" }}>Calls</th>
                      <th style={{ textAlign: "right" }}>Errors</th>
                      <th style={{ textAlign: "right" }}>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.tool_breakdown.map((t) => (
                      <tr key={t.tool_name} style={{ cursor: "default" }}>
                        <td>{t.tool_name}</td>
                        <td style={{ textAlign: "right" }}>{INT.format(t.calls)}</td>
                        <td style={{ textAlign: "right" }}>{INT.format(t.errors)}</td>
                        <td style={{ textAlign: "right" }}>
                          {INT.format(Math.round(t.total_ms / 1000))}s
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="newdash-card" style={{ padding: "0.75rem 1rem" }}>
              <span className="newdash-card-label">Linked PRs</span>
              {data.linked_prs.length === 0 ? (
                <div className="newdash-empty">
                  Waiting for the linker to connect this session to a PR.
                </div>
              ) : (
                <ul
                  style={{
                    listStyle: "none",
                    padding: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.35rem",
                  }}
                >
                  {data.linked_prs.map((p) => (
                    <li
                      key={`${p.repo}-${p.pr_number}`}
                      style={{ fontSize: "0.85rem", color: "var(--mk-ink)" }}
                    >
                      <strong>
                        {p.repo}#{p.pr_number}
                      </strong>{" "}
                      <span style={{ color: "var(--mk-ink-muted)" }}>
                        {p.state} · +{INT.format(p.additions)} / −{INT.format(p.deletions)}
                        {p.merged_at
                          ? ` · merged ${new Date(p.merged_at).toLocaleDateString()}`
                          : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="newdash-card" style={{ padding: "0.75rem 1rem" }}>
              <span className="newdash-card-label">Timeline</span>
              {data.timeline.length === 0 ? (
                <div className="newdash-empty">No events recorded.</div>
              ) : (
                <div className="newdash-timeline">
                  {data.timeline.map((e, i) => (
                    <div key={`${e.ts}-${i}`} className="newdash-timeline-row">
                      <span>{new Date(e.ts).toLocaleTimeString()}</span>
                      <span>{e.event_kind}</span>
                      <span>{e.tool_name ?? ""}</span>
                      <span>
                        {e.cost_usd ? USD.format(e.cost_usd) : ""}
                        {e.duration_ms ? ` ${INT.format(e.duration_ms)}ms` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {data.timeline_truncated ? (
                <div className="newdash-note">
                  Showing the first 500 events. Open the raw session for the full trace.
                </div>
              ) : null}
            </div>
          </>
        )}
      </aside>
    </>
  );
}
