import { sessionDetail } from "@bematist/api";
import { NextResponse } from "next/server";
import { getSessionCtx } from "@/lib/session";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await getSessionCtx();
  const detail = await sessionDetail(ctx, { session_id: id });
  return NextResponse.json(detail);
}
