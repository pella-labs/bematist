// Integration — proves the scaffold runs and updates last_reconciled_at.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import postgres, { type Sql } from "postgres";
import { runReconcileScaffold } from "./reconcileScaffold";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/bematist";
const sql = postgres(DATABASE_URL, { prepare: false, max: 2, onnotice: () => {} });
let skip = false;

async function canConnect(sql: Sql): Promise<boolean> {
  try {
    await sql`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

let tenantId: string;
beforeAll(async () => {
  skip = !(await canConnect(sql));
});
afterAll(async () => {
  await sql.end();
});
beforeEach(async () => {
  if (skip) return;
  const rows = (await sql<Array<{ id: string }>>`
    INSERT INTO orgs (name, slug)
    VALUES ('reconcile-scaffold', ${`reconcile-scaffold-${Date.now()}-${Math.random()}`})
    RETURNING id`) as unknown as Array<{ id: string }>;
  tenantId = rows[0]!.id;
});

async function cleanup(): Promise<void> {
  await sql.unsafe(`DELETE FROM github_installations WHERE tenant_id = $1`, [tenantId]);
  await sql.unsafe(`DELETE FROM orgs WHERE id = $1`, [tenantId]);
}

const suite = skip ? describe.skip : describe;

suite("runReconcileScaffold — hourly 'is it running' scaffold", () => {
  test("updates last_reconciled_at for each active installation", async () => {
    const installId = BigInt(
      Math.floor(Date.now() % 1_000_000_000) + Math.floor(Math.random() * 1000),
    );
    await sql.unsafe(
      `INSERT INTO github_installations
         (tenant_id, installation_id, github_org_id, github_org_login, app_id,
          status, token_ref, webhook_secret_active_ref)
       VALUES ($1, $2, 1, 'fix', 1, 'active', 'tok', 'ws')`,
      [tenantId, installId.toString()],
    );

    const before = (await sql<Array<{ last_reconciled_at: Date | null }>>`
      SELECT last_reconciled_at FROM github_installations WHERE tenant_id = ${tenantId}`) as unknown as Array<{
      last_reconciled_at: Date | null;
    }>;
    expect(before[0]?.last_reconciled_at).toBeNull();

    const result = await runReconcileScaffold(sql);
    expect(result.installationsChecked).toBeGreaterThanOrEqual(1);
    expect(result.heartbeatsWritten).toBeGreaterThanOrEqual(1);

    const after = (await sql<Array<{ last_reconciled_at: Date | null }>>`
      SELECT last_reconciled_at FROM github_installations WHERE tenant_id = ${tenantId}`) as unknown as Array<{
      last_reconciled_at: Date | null;
    }>;
    expect(after[0]?.last_reconciled_at).not.toBeNull();
    await cleanup();
  });
});
