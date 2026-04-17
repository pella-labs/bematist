import { sql } from "drizzle-orm";
import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const orgs = pgTable("orgs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  org_id: uuid("org_id")
    .notNull()
    .references(() => orgs.id),
  sso_subject: text("sso_subject").notNull().unique(),
  email: text("email").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const developers = pgTable("developers", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  org_id: uuid("org_id")
    .notNull()
    .references(() => orgs.id),
  user_id: uuid("user_id")
    .notNull()
    .references(() => users.id),
  stable_hash: text("stable_hash").notNull().unique(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * GDPR erasure request queue. D's partition-drop worker watches `status='pending'`.
 * Schema per contract 09 §Per-table contracts.
 */
export const erasure_requests = pgTable("erasure_requests", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  requester_user_id: uuid("requester_user_id")
    .notNull()
    .references(() => users.id),
  target_engineer_id: text("target_engineer_id").notNull(),
  target_org_id: uuid("target_org_id")
    .notNull()
    .references(() => orgs.id),
  // pending | in_progress | completed | failed
  status: text("status").notNull().default("pending"),
  completed_at: timestamp("completed_at", { withTimezone: true }),
  partition_dropped: text("partition_dropped").notNull().default("false"),
});

/**
 * Append-only audit trail. Contract 09 invariant 6: NEVER UPDATE, NEVER DELETE.
 * DB-level trigger enforces this in a separate migration (D1-05 or later).
 * Schema: (id, ts, actor_user_id, action, target_type, target_id, reason, metadata_json).
 */
export const audit_log = pgTable("audit_log", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  actor_user_id: uuid("actor_user_id")
    .notNull()
    .references(() => users.id),
  action: text("action").notNull(),
  target_type: text("target_type").notNull(),
  target_id: text("target_id").notNull(),
  reason: text("reason"),
  metadata_json: jsonb("metadata_json").notNull().default(sql`'{}'::jsonb`),
});
