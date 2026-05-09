"use client";

import Link from "next/link";
import { useState } from "react";
import { providers } from "@/lib/providers/ui-config";
import type { ProviderName } from "@/lib/providers/types";

export type OrgRow = {
  id: string;
  slug: string;
  name: string;
  role: string;
  provider: ProviderName;
};

export default function DashboardOrgList({ rows }: { rows: OrgRow[] }) {
  // Bucket by provider. Only show tabs for providers the user actually has orgs in.
  const byProvider: Record<ProviderName, OrgRow[]> = { github: [], gitlab: [] };
  for (const r of rows) byProvider[r.provider]?.push(r);
  const present: ProviderName[] = (["github", "gitlab"] as ProviderName[])
    .filter(p => byProvider[p].length > 0);

  // Default tab: whichever has more rows; tie → github.
  const [active, setActive] = useState<ProviderName>(
    present[0] ?? "github",
  );
  const showTabs = present.length > 1;
  const visible = showTabs ? byProvider[active] : (present[0] ? byProvider[present[0]] : []);

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="mk-eyebrow">your orgs</div>
        <Link
          href="/setup/org"
          className="mk-label border border-border px-3 py-2 hover:border-[color:var(--border-hover)] transition"
        >
          + connect another org
        </Link>
      </div>

      {showTabs && (
        <div className="flex gap-1 mb-3 border-b border-border overflow-x-auto">
          {present.map(p => {
            const cfg = providers[p];
            const count = byProvider[p].length;
            const isActive = p === active;
            return (
              <button
                key={p}
                type="button"
                onClick={() => setActive(p)}
                className={`px-4 py-2 text-xs uppercase tracking-wider border-b-2 transition flex items-center gap-2 ${
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <span style={{ color: cfg.accent }}>
                  <cfg.Icon width={12} height={12} />
                </span>
                <span>{cfg.name}</span>
                <span className="text-[10px] opacity-60">({count})</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="border border-border">
        {visible.map((org, i) => {
          const cfg = providers[org.provider];
          return (
            <Link
              key={org.id}
              href={`/org/${encodeURIComponent(org.slug)}`}
              className={`flex justify-between items-center gap-3 px-4 sm:px-5 py-4 sm:py-5 hover:bg-card transition ${i > 0 ? "border-t border-border" : ""}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  style={{ color: cfg.accent }}
                  aria-label={`${cfg.name} org`}
                  className="shrink-0"
                >
                  <cfg.Icon width={18} height={18} />
                </span>
                <div className="min-w-0">
                  <div className="mk-heading font-semibold truncate">{org.name}</div>
                  <div className="mk-label mt-1 truncate">
                    {cfg.name} · {org.slug} · {org.role}
                  </div>
                </div>
              </div>
              <span className="text-accent mk-label shrink-0">open →</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
