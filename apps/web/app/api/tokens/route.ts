// POST /api/tokens   -> issue collector token (once, value shown once)
// GET  /api/tokens   -> list user's tokens (without plaintext)

import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireSession } from "@/lib/route-helpers";
import { logAudit, extractRequestMeta } from "@/lib/audit";

export async function GET() {
  const sess = await requireSession();
  if (sess instanceof Response) return sess;

  const rows = await db.select({
    id: schema.apiToken.id, name: schema.apiToken.name,
    createdAt: schema.apiToken.createdAt, lastUsedAt: schema.apiToken.lastUsedAt,
    revokedAt: schema.apiToken.revokedAt,
  }).from(schema.apiToken).where(eq(schema.apiToken.userId, sess.user.id));
  return NextResponse.json({ tokens: rows });
}

export async function POST(req: Request) {
  const sess = await requireSession();
  if (sess instanceof Response) return sess;

  const body = await req.json().catch(() => ({}));
  const name = (body?.name as string) || "collector";
  const plain = "pm_" + crypto.randomBytes(24).toString("base64url");
  const hash = crypto.createHash("sha256").update(plain).digest("hex");
  const [row] = await db.insert(schema.apiToken).values({
    userId: sess.user.id, name, tokenHash: hash,
  }).returning();

  const meta = extractRequestMeta(req);
  await logAudit({
    orgId: null,
    actorUserId: sess.user.id,
    action: "token.create",
    targetType: "api_token",
    targetId: row.id,
    metadata: { tokenName: row.name },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return NextResponse.json({ id: row.id, token: plain, createdAt: row.createdAt });
}
