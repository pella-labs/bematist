import { NextResponse } from "next/server";

const REPO_OWNER = "pella-labs";
const REPO_NAME = "bematist";

/**
 * Check whether a GitHub username has starred the bematist repo.
 * Uses GitHub's public unauthenticated endpoint:
 *   GET /users/{username}/starred/{owner}/{repo}
 *     204 -> starred
 *     404 -> not starred
 *
 * No Firebase auth required. Username is validated loosely; rate-limiting is
 * the responsibility of GitHub's anon quota (60/hr/IP).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const username = url.searchParams.get("username");

  if (!username || !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(username)) {
    return NextResponse.json({ error: "invalid username" }, { status: 400 });
  }

  const ghUrl = `https://api.github.com/users/${username}/starred/${REPO_OWNER}/${REPO_NAME}`;
  try {
    const res = await fetch(ghUrl, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (res.status === 204) return NextResponse.json({ starred: true });
    if (res.status === 404) return NextResponse.json({ starred: false });
    if (res.status === 403) {
      return NextResponse.json(
        { error: "github rate limit, please retry later" },
        { status: 429 },
      );
    }
    return NextResponse.json(
      { error: `github returned ${res.status}` },
      { status: 502 },
    );
  } catch {
    return NextResponse.json({ error: "github unreachable" }, { status: 502 });
  }
}
