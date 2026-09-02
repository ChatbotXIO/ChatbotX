import { readFileSync } from "node:fs"
import { join } from "node:path"
import { getTableConfig } from "drizzle-orm/pg-core"
import { describe, expect, test } from "vitest"
import { contactsOnBroadcastsModel } from "../src/schema/contact-on-broadcast"

const MIGRATION_PATH = join(
  import.meta.dirname,
  "../drizzle/20260902054310_add_broadcast_soft_delete_and_resume/migration.sql",
)

describe("ContactOnBroadcast unsent-batch partial index", () => {
  test("schema declares the partial index the batch scan depends on", () => {
    const config = getTableConfig(contactsOnBroadcastsModel)
    const index = config.indexes.find(
      (candidate) => candidate.config.name === "ContactOnBroadcast_unsent_idx",
    )
    expect(index).toBeDefined()
    const columns = index?.config.columns.map((column) =>
      "name" in column ? column.name : String(column),
    )
    expect(columns).toEqual(["broadcastId"])
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
})
