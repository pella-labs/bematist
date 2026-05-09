import { sql } from "@/lib/db";

async function runBatch(table: "prompt_event" | "response_event", limit: number): Promise<number> {
  const q = `
    with doomed as (
      select id
      from ${table}
      where expires_at <= now()
      limit ${limit}
    )
    delete from ${table} t
    using doomed
    where t.id = doomed.id
    returning t.id
  `;
  const rows = await sql.unsafe(q);
  return rows.length;
}

async function main() {
  const limit = Math.max(100, Math.min(20000, Number(process.env.RETENTION_DELETE_LIMIT || 5000)));
  const promptDeleted = await runBatch("prompt_event", limit);
  const responseDeleted = await runBatch("response_event", limit);
  console.log(JSON.stringify({ ok: true, promptDeleted, responseDeleted, limit }));
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
});
