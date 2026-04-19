"use client";

import type { schemas } from "@bematist/api";
import Link from "next/link";
import { useMemo } from "react";
import { buildHref, type Filter } from "../_filter";

interface Props {
  filter: Filter;
  cohorts: schemas.CohortFiltersOutput;
  myEngineerHash: string;
}

const WINDOWS: Array<{ label: string; value: "7d" | "30d" | "90d" }> = [
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
  { label: "Last 90 days", value: "90d" },
];

export function FilterBar({ filter, cohorts, myEngineerHash }: Props) {
  const justMe = (filter.engineer_ids ?? []).length === 1;
  const activeRepo = filter.repo_ids?.[0];
  const updated = useMemo(() => new Date().toLocaleTimeString(), []);

  return (
    <div
      aria-label="Dashboard filters"
      className="newdash-filterbar"
      data-new-dashboard-filters="true"
    >
      {WINDOWS.map((w) => (
        <Link
          key={w.value}
          href={buildHref(filter, { window: w.value })}
          className="newdash-pill"
          data-active={filter.window === w.value}
        >
          {w.label}
        </Link>
      ))}
      <Link
        href={buildHref(filter, { justMe: !justMe, engineer_ids: justMe ? [] : undefined })}
        className="newdash-pill"
        data-active={justMe}
        data-role="just-me"
      >
        {justMe ? "Just me (on)" : "Just me"}
      </Link>
      <span aria-hidden style={{ width: 1, height: 20, background: "var(--mk-border)" }} />
      {cohorts.repos.slice(0, 6).map((r) => (
        <Link
          key={r.id}
          href={buildHref(filter, {
            repo_ids: activeRepo === r.id ? undefined : [r.id],
          })}
          className="newdash-pill"
          data-active={activeRepo === r.id}
        >
          {r.full_name}
        </Link>
      ))}
      <span className="newdash-filterbar-meta">
        Refreshed {updated}
        {myEngineerHash ? ` · you are #${myEngineerHash}` : ""}
      </span>
    </div>
  );
}
