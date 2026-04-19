import Link from "next/link";
import type { WindowKey } from "@/lib/local-sources";

const OPTIONS: { key: WindowKey; label: string }[] = [
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
  { key: "90d", label: "90d" },
  { key: "all", label: "All" },
];

/**
 * Window picker mirroring `SourceFilterBar`'s shape — URL-driven so the full
 * page can re-render on the server without client JS. `extraParams` passes
 * through the source filter (and anything else) so the two bars compose.
 */
export function WindowFilterBar({
  basePath,
  current,
  extraParams = {},
}: {
  basePath: string;
  current: WindowKey;
  extraParams?: Record<string, string | undefined>;
}) {
  const mkHref = (w: WindowKey): string => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(extraParams)) {
      if (v) qs.set(k, v);
    }
    qs.set("window", w);
    const q = qs.toString();
    return q ? `${basePath}?${q}` : basePath;
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-muted-foreground">Window:</span>
      {OPTIONS.map((o) => (
        <Link
          key={o.key}
          href={mkHref(o.key)}
          className={`rounded px-2 py-0.5 border ${
            current === o.key
              ? "bg-primary/15 border-primary/30 text-foreground"
              : "border-transparent hover:border-border text-muted-foreground"
          }`}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}
