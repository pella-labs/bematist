// /me/[provider]/[slug]/sessions/[id] — session detail with server-decrypted prompts.
// P18: decryption happens server-side via the route handler we call from this page.
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { requireMembership } from "@/lib/auth-middleware";
import { getOrCreateUserDek, decryptPrompt } from "@/lib/crypto/prompts";
import { SourceChip } from "@/components/data/source-chip";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ provider: string; slug: string; id: string }>;
}) {
  const { provider, slug, id } = await params;
  const memb = await requireMembership(slug, { provider });
  if (memb instanceof Response) {
    return <div className="p-8 mk-table-cell">Access denied.</div>;
  }
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  if (!userId) return <div className="p-8 mk-table-cell">Not signed in.</div>;

  const sessRow = await db.query.sessionEvent.findFirst({
    where: and(eq(schema.sessionEvent.id, id), eq(schema.sessionEvent.userId, userId)),
  });
  if (!sessRow) notFound();

  // Server-side decrypt (P18). Owner-only; manager view never reaches this code path.
  const prompts = await db
    .select()
    .from(schema.promptEvent)
    .where(
      and(
        eq(schema.promptEvent.userId, userId),
        eq(schema.promptEvent.source, sessRow.source),
        eq(schema.promptEvent.externalSessionId, sessRow.externalSessionId),
      ),
    );
  let plaintext: Array<{ tsPrompt: Date; text: string; wordCount: number }> = [];
  try {
    const dek = await getOrCreateUserDek(userId);
    plaintext = prompts.map(p => ({
      tsPrompt: p.tsPrompt,
      wordCount: p.wordCount,
      text: decryptPrompt(dek, { iv: p.iv, tag: p.tag, ciphertext: p.ciphertext }),
    }));
  } catch {
    plaintext = [];
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <a
          href={`/me/${provider}/${slug}`}
          className="mk-table-cell text-(--muted-foreground) hover:text-(--foreground)"
        >
          ← back to overview
        </a>
        <h1 className="text-xl font-medium mt-2">
          Session {sessRow.externalSessionId.slice(0, 12)}…
        </h1>
        <p className="mk-table-cell text-(--muted-foreground) flex items-center gap-3 mt-1">
          <SourceChip kind={sessRow.source as "claude" | "codex" | "cursor"} showLabel />
          <span>{sessRow.repo}</span>
          <span>{sessRow.startedAt.toISOString().slice(0, 16).replace("T", " ")} → {sessRow.endedAt.toISOString().slice(11, 16)}</span>
        </p>
      </div>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="Tokens in" value={sessRow.tokensIn.toLocaleString()} />
        <Tile label="Tokens out" value={sessRow.tokensOut.toLocaleString()} />
        <Tile label="Messages" value={sessRow.messages} />
        <Tile label="Errors" value={sessRow.errors} />
      </section>

      <section className="space-y-2">
        <h2 className="mk-table-cell text-(--muted-foreground) uppercase tracking-wide">
          Prompts ({plaintext.length})
        </h2>
        <div className="space-y-3">
          {plaintext.map((p, i) => (
            <div key={i} className="border border-(--border) bg-(--card) p-3">
              <div className="mk-table-cell text-(--muted-foreground)">
                {p.tsPrompt.toISOString().slice(11, 19)} · {p.wordCount} words
              </div>
              <pre className="whitespace-pre-wrap mt-2 text-sm leading-relaxed">
                {p.text}
              </pre>
            </div>
          ))}
          {plaintext.length === 0 && (
            <div className="mk-table-cell text-(--muted-foreground) p-6 text-center">
              No prompt content captured for this session (or retention expired).
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-(--border) bg-(--card) p-4">
      <div className="mk-table-cell text-(--muted-foreground) uppercase tracking-wide">{label}</div>
      <div className="mk-stat-numeric mt-2">{value}</div>
    </div>
  );
}
