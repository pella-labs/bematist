/** Shared HTTP helper for cloud providers. Uses native `fetch` (Bun + Node 18+). */

export interface PostJsonOpts {
  url: string;
  body: unknown;
  headers?: Record<string, string>;
  /** Hard timeout in ms. Default 30s. */
  timeoutMs?: number;
}

export async function postJson<T>(opts: PostJsonOpts): Promise<T> {
  const { url, body, headers = {}, timeoutMs = 30_000 } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`POST ${url} → ${res.status} ${res.statusText}: ${text.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Returns now() in ms (monotonic-ish; Date.now() is fine for latency telemetry). */
export function now(): number {
  return Date.now();
}
