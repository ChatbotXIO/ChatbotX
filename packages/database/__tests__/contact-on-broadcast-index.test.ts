import { readFileSync } from "node:fs"
import { join } from "node:path"
import { getTableConfig } from "drizzle-orm/pg-core"
import { describe, expect, test } from "vitest"
import { contactsOnBroadcastsModel } from "../src/schema/contact-on-broadcast"

const MIGRATION_PATH = join(
  import.meta.dirname,
  "../drizzle/20260902054310_add_broadcast_soft_delete_and_resume/migration.sql",
)

const SEND_ORDER_INDEXES_MIGRATION_PATH = join(
  import.meta.dirname,
  "../drizzle/20260920111706_broadcast_send_order_indexes/migration.sql",
)

describe("ContactOnBroadcast unsent-batch partial index", () => {
  test("schema declares the ordered partial index the batch scan depends on", () => {
    const config = getTableConfig(contactsOnBroadcastsModel)
    const index = config.indexes.find(
      (candidate) =>
        candidate.config.name === "ContactOnBroadcast_unsent_order_idx",
    )
    expect(index).toBeDefined()
    const columns = index?.config.columns.map((column) =>
      "name" in column ? column.name : String(column),
    )
    expect(columns).toEqual(["broadcastId", "contactInboxId"])
    expect(index?.config.where).toBeDefined()
  })

  test("migration creates the index idempotently with the matching predicate", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf8")
    expect(sql).toContain(
      'CREATE INDEX IF NOT EXISTS "ContactOnBroadcast_unsent_idx" ON "ContactOnBroadcast" ("broadcastId") WHERE "sent" = false AND "failedAt" IS NULL;',
    )
    // Every statement in this migration must stay idempotent — the large-table
    // rollout path runs it unwrapped (CREATE INDEX CONCURRENTLY), so a failed
    // index build must be safely re-runnable end to end.
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "deletedAt"')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "resumeCount"')
    expect(sql).toContain(
      'CREATE INDEX IF NOT EXISTS "Broadcast_deletedAt_idx"',
    )
  })

  test("send-order-indexes migration is every statement CONCURRENTLY and self-recovering", () => {
    const sql = readFileSync(SEND_ORDER_INDEXES_MIGRATION_PATH, "utf8")
    const statements = sql
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean)

    for (const statement of statements) {
      expect(statement).toContain("CONCURRENTLY")
      expect(
        statement.includes("IF NOT EXISTS") || statement.includes("IF EXISTS"),
      ).toBe(true)
    }

    // The leading DROP is the self-recovery line: on a re-run after a failed
    // build, Postgres may have left an INVALID index under the new name that
    // a bare `IF NOT EXISTS` CREATE would silently keep — this drops it first.
    expect(statements[0]).toBe(
      'DROP INDEX CONCURRENTLY IF EXISTS "ContactInbox_inboxId_id_idx";',
    )
  })
})
