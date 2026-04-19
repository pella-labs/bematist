import { sessionsFeed } from "@bematist/api";
import { NextResponse } from "next/server";
import { getSessionCtx } from "@/lib/session";

export const dynamic = "force-dynamic";

function multi(v: string | null): string[] | undefined {
  if (!v) return undefined;
  const parts = v.split(",").filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

function windowFrom(v: string | null): "7d" | "30d" | "90d" {
  return v === "7d" || v === "90d" ? v : "30d";
}

export async function GET(req: Request) {
  const ctx = await getSessionCtx();
  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor");
  const page_size = Math.min(500, Math.max(1, Number(url.searchParams.get("page_size") ?? "50")));

  const payload = await sessionsFeed(ctx, {
    window: windowFrom(url.searchParams.get("window")),
    engineer_ids: multi(url.searchParams.get("eng")),
    repo_ids: multi(url.searchParams.get("repo")),
    cursor: cursor ?? null,
    page_size,
  });
  return NextResponse.json(payload);
}
