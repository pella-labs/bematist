// /me/[provider]/[slug] dev overview — personal session → PR lineage hero.
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { and, eq, desc, gte } from "drizzle-orm";
import { requireMembership } from "@/lib/auth-middleware";
import { SourceChip } from "@/components/data/source-chip";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ provider: string; slug: string }>;
}) {
  const { provider, slug } = await params;
  const memb = await requireMembership(slug, { provider });
  if (memb instanceof Response) {
    return <div className="p-8 mk-table-cell">Access denied.</div>;
  }
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  if (!userId) {
    return <div className="p-8 mk-table-cell">Not signed in.</div>;
  }

  const since = new Date(Date.now() - 30 * 86_400_000);
  const sessions = await db
    .select()
    .from(schema.sessionEvent)
    .where(
      and(
        eq(schema.sessionEvent.userId, userId),
        eq(schema.sessionEvent.orgId, memb.org.id),
        gte(schema.sessionEvent.startedAt, since),
      ),
    )
    .orderBy(desc(schema.sessionEvent.startedAt))
    .limit(40);

  // Aggregate: sessions per source.
  const bySource = new Map<string, { sessions: number; tokensOut: number }>();
  for (const s of sessions) {
    const k = s.source;
    if (!bySource.has(k)) bySource.set(k, { sessions: 0, tokensOut: 0 });
    const b = bySource.get(k)!;
    b.sessions++;
    b.tokensOut += s.tokensOut;
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-medium">My sessions · last 30 days</h1>
      <p className="mk-table-cell text-(--muted-foreground)">
        {sessions.length} sessions across {bySource.size} source(s)
      </p>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[...bySource].map(([source, b]) => (
          <div key={source} className="border border-(--border) bg-(--card) p-4">
            <div className="mk-table-cell text-(--muted-foreground) uppercase tracking-wide flex items-center gap-2">
              <SourceChip kind={source as "claude" | "codex" | "cursor"} /> {source}
            </div>
            <div className="mk-stat-numeric mt-2">{b.sessions}</div>
            <div className="mk-table-cell text-(--muted-foreground) mt-1">
              {(b.tokensOut / 1000).toFixed(1)}K tokens out
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="mk-table-cell text-(--muted-foreground) uppercase tracking-wide">
          Recent sessions
        </h2>
        <div className="border border-(--border) bg-(--card) overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-(--border)">
              <tr>
                <th className="mk-table-cell px-3 py-2 text-left text-(--muted-foreground)">when</th>
                <th className="mk-table-cell px-3 py-2 text-left text-(--muted-foreground)">src</th>
                <th className="mk-table-cell px-3 py-2 text-left text-(--muted-foreground)">repo</th>
                <th className="mk-table-cell px-3 py-2 text-right text-(--muted-foreground)">tokens out</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(s => (
                <tr key={s.id} className="border-b border-(--border) hover:bg-(--secondary)">
                  <td className="mk-table-cell px-3 py-2">
                    <a href={`/me/${provider}/${slug}/sessions/${s.id}`} className="text-(--primary) hover:underline">
                      {s.startedAt.toISOString().slice(0, 16).replace("T", " ")}
                    </a>
                  </td>
                  <td className="mk-table-cell px-3 py-2">
                    <SourceChip kind={s.source as "claude" | "codex" | "cursor"} />
                  </td>
                  <td className="mk-table-cell px-3 py-2">{s.repo}</td>
                  <td className="mk-table-cell px-3 py-2 text-right">{s.tokensOut.toLocaleString()}</td>
                </tr>
              ))}
              {sessions.length === 0 && (
                <tr>
                  <td colSpan={4} className="mk-table-cell text-center p-6 text-(--muted-foreground)">
                    No sessions in the last 30 days.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
