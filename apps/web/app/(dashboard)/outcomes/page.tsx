import { perCommitOutcomes, perPROutcomes, schemas } from "@bematist/api";
import { Badge, Card, CardHeader, CardTitle, CardValue } from "@bematist/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { getSessionCtx } from "@/lib/session";

export const metadata: Metadata = {
  title: "Outcomes",
};

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});
const USD0 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const TIME = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default async function OutcomesPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string; repo?: string }>;
}) {
  const params = await searchParams;
  const window = parseWindow(params.window);
  const repo = params.repo;

  const ctx = await getSessionCtx();
  const [prs, commits] = await Promise.all([
    perPROutcomes(ctx, { window, limit: 200, ...(repo ? { repo } : {}) }),
    perCommitOutcomes(ctx, { window, limit: 500, ...(repo ? { repo } : {}) }),
  ]);

  const aiAssistedShare =
    prs.totals.prs === 0 ? 0 : Math.round((prs.totals.ai_assisted_prs / prs.totals.prs) * 100);
  const revertShare =
    prs.totals.prs === 0 ? 0 : Math.round((prs.totals.reverted_prs / prs.totals.prs) * 100);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Outcomes</h1>
        <p className="text-sm text-muted-foreground">
          Cost per merged PR and per commit — joined via the code_edit_tool.accept anchor,
          AI-Assisted trailer (D29), and denormalized pr_number / commit_sha on events.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <Badge tone="neutral">{window} window</Badge>
        {repo ? <Badge tone="accent">{repo}</Badge> : null}
        <Badge tone="neutral">{prs.totals.prs} PRs</Badge>
        <Badge tone="neutral">{commits.rows.length} commits</Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>PR cost (window)</CardTitle>
          </CardHeader>
          <CardValue>{USD0.format(prs.totals.cost_usd)}</CardValue>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>AI-assisted PRs</CardTitle>
          </CardHeader>
          <CardValue>
            {prs.totals.ai_assisted_prs}{" "}
            <span className="text-base text-muted-foreground">/ {prs.totals.prs}</span>
            <span className="ml-2 text-sm text-muted-foreground">({aiAssistedShare}%)</span>
          </CardValue>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Reverted PRs</CardTitle>
          </CardHeader>
          <CardValue>
            {prs.totals.reverted_prs}{" "}
            <span className="text-base text-muted-foreground">/ {prs.totals.prs}</span>
            <span className="ml-2 text-sm text-muted-foreground">({revertShare}%)</span>
          </CardValue>
        </Card>
      </div>

      <section aria-labelledby="prs" className="flex flex-col gap-3">
        <h2 id="prs" className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Recent PRs
        </h2>
        <Card>
          <PROutcomesTable rows={prs.rows} />
        </Card>
      </section>

      <section aria-labelledby="commits" className="flex flex-col gap-3">
        <h2
          id="commits"
          className="text-sm font-medium uppercase tracking-wide text-muted-foreground"
        >
          Recent commits
        </h2>
        <Card>
          <CommitOutcomesTable rows={commits.rows} />
        </Card>
      </section>
    </div>
  );
}

function PROutcomesTable({ rows }: { rows: schemas.PerPROutcome[] }) {
  if (rows.length === 0) {
    return <p className="px-4 py-6 text-sm text-muted-foreground">No PRs in this window.</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-muted-foreground">
        <tr className="border-b border-border">
          <th className="px-4 py-2 font-medium">Merged</th>
          <th className="px-4 py-2 font-medium">Repo</th>
          <th className="px-4 py-2 font-medium">PR</th>
          <th className="px-4 py-2 text-right font-medium">Cost</th>
          <th className="px-4 py-2 text-right font-medium">Accepts</th>
          <th className="px-4 py-2 text-right font-medium">Flags</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={`${r.repo}:${r.pr_number}`} className="border-b border-border/50">
            <td className="px-4 py-2 text-xs text-muted-foreground">
              <time dateTime={r.merged_at}>{TIME.format(new Date(r.merged_at))}</time>
            </td>
            <td className="px-4 py-2 font-mono text-xs">{r.repo}</td>
            <td className="px-4 py-2">
              <Link
                href={`/outcomes?repo=${encodeURIComponent(r.repo)}`}
                className="cursor-pointer text-primary hover:underline"
              >
                #{r.pr_number}
              </Link>
            </td>
            <td className="px-4 py-2 text-right tabular-nums">
              {r.cost_usd === 0 ? "—" : USD.format(r.cost_usd)}
            </td>
            <td className="px-4 py-2 text-right tabular-nums">{r.accepted_edit_count}</td>
            <td className="px-4 py-2 text-right">
              <div className="flex items-center justify-end gap-1">
                {r.ai_assisted ? <Badge tone="accent">AI-assisted</Badge> : null}
                {r.reverted ? <Badge tone="warning">reverted</Badge> : null}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CommitOutcomesTable({ rows }: { rows: schemas.PerCommitOutcome[] }) {
  if (rows.length === 0) {
    return <p className="px-4 py-6 text-sm text-muted-foreground">No commits in this window.</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-muted-foreground">
        <tr className="border-b border-border">
          <th className="px-4 py-2 font-medium">When</th>
          <th className="px-4 py-2 font-medium">Repo</th>
          <th className="px-4 py-2 font-medium">Commit</th>
          <th className="px-4 py-2 font-medium">PR</th>
          <th className="px-4 py-2 font-medium">Author</th>
          <th className="px-4 py-2 text-right font-medium">Cost</th>
          <th className="px-4 py-2 text-right font-medium">Flags</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={`${r.repo}:${r.commit_sha}`} className="border-b border-border/50">
            <td className="px-4 py-2 text-xs text-muted-foreground">
              <time dateTime={r.ts}>{TIME.format(new Date(r.ts))}</time>
            </td>
            <td className="px-4 py-2 font-mono text-xs">{r.repo}</td>
            <td className="px-4 py-2 font-mono text-xs">{r.commit_sha.slice(0, 10)}</td>
            <td className="px-4 py-2 text-xs">{r.pr_number ? `#${r.pr_number}` : "—"}</td>
            <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
              {r.author_engineer_id_hash}
            </td>
            <td className="px-4 py-2 text-right tabular-nums">
              {r.cost_usd_attributed === 0 ? "—" : USD.format(r.cost_usd_attributed)}
            </td>
            <td className="px-4 py-2 text-right">
              <div className="flex items-center justify-end gap-1">
                {r.ai_assisted ? <Badge tone="accent">AI-assisted</Badge> : null}
                {r.reverted ? <Badge tone="warning">reverted</Badge> : null}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function parseWindow(v: string | undefined): schemas.Window {
  const parsed = schemas.Window.safeParse(v);
  return parsed.success ? parsed.data : "30d";
}
