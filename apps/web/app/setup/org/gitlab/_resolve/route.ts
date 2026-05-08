import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

/**
 * Receives `?group=<path-or-id>` from the manual-entry form and bounces to the
 * GAT-paste page. We resolve path → numeric group id only on the next step
 * (during GAT validation), since we don't have credentials here.
 *
 * If the user typed a numeric id, pass it through. If they typed a path
 * (e.g. "pella-labs/team-a"), pass it through too — the connect page accepts
 * both. The /api/v4/groups/{id} endpoint accepts URL-encoded paths as well as
 * numeric ids, so the GAT validation step can resolve either.
 */
export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.redirect(new URL("/", req.url));

  const url = new URL(req.url);
  const raw = (url.searchParams.get("group") ?? "").trim();
  if (!raw) {
    return NextResponse.redirect(new URL("/setup/org/gitlab?manual=1", req.url));
  }

  // Strip any "https://gitlab.com/" prefix if user pasted a full URL.
  const cleaned = raw
    .replace(/^https?:\/\/[^/]+\/+/i, "")
    .replace(/^groups\//, "")
    .replace(/\/?$/, "")
    .replace(/^\/+/, "");

  // Path is what we send to the connect page. The connect-page server action
  // will treat the route param as either a numeric id or a URL-encoded path
  // when calling /api/v4/groups/{id} with the GAT.
  const isNumeric = /^\d+$/.test(cleaned);
  const groupParam = isNumeric ? cleaned : encodeURIComponent(cleaned);
  const pathParam = isNumeric ? "" : cleaned;

  const target = new URL(`/setup/org/gitlab/${groupParam}/connect`, req.url);
  if (pathParam) target.searchParams.set("path", pathParam);
  return NextResponse.redirect(target);
}
