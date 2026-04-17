import { NextResponse, type NextRequest } from "next/server";

/**
 * Langfuse/PostHog-style hybrid routing:
 * - Self-host (default): `/` serves the dashboard; marketing pages live under `/home`.
 * - Cloud (`NEXT_PUBLIC_IS_CLOUD=1`): `/` is rewritten to `/home` so first-visit visitors
 *   land on marketing; the dashboard lives at `/app` via an authed redirect (Phase 4).
 */
export function middleware(request: NextRequest) {
  const isCloud = process.env.NEXT_PUBLIC_IS_CLOUD === "1";
  if (isCloud && request.nextUrl.pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/home";
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/"],
};
