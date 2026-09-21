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

const PARTITION_INDEX_CREATE_PATTERN =
  /^CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p\d+_unsent_order_idx" ON "ContactOnBroadcast_p\d+"/
const PARTITION_INDEX_CREATE_NUMBERS_PATTERN =
  /CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_p(\d+)_unsent_order_idx" ON "ContactOnBroadcast_p(\d+)"/

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

  test("send-order-indexes migration builds the ContactOnBroadcast index per partition", () => {
    const sql = readFileSync(SEND_ORDER_INDEXES_MIGRATION_PATH, "utf8")
    const statements = sql
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean)

    const COLUMN_LIST = '("broadcastId","contactInboxId")'
    const PREDICATE = 'WHERE "sent" = false AND "failedAt" IS NULL'

    // ContactOnBroadcast is a HASH-partitioned table (64 partitions), so
    // Postgres refuses CREATE/DROP INDEX CONCURRENTLY directly on it or on
    // its partitioned index — only the ContactInbox pair (a regular table)
    // may use the plain drop-then-concurrently-create form.
    expect(statements[0]).toContain(
      'DROP INDEX CONCURRENTLY IF EXISTS "ContactInbox_inboxId_id_idx";',
    )
    expect(statements).toContain(
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactInbox_inboxId_id_idx" ON "ContactInbox" USING btree ("inboxId","id");',
    )

    // Exactly one ON ONLY parent-index create, taking no partition locks.
    const parentCreates = statements.filter((statement) =>
      statement.includes(
        `CREATE INDEX IF NOT EXISTS "ContactOnBroadcast_unsent_order_idx" ON ONLY "ContactOnBroadcast"`,
      ),
    )
    expect(parentCreates).toHaveLength(1)
    expect(parentCreates[0]).toContain(COLUMN_LIST)
    expect(parentCreates[0]).toContain(PREDICATE)
    // The parent create is not itself CONCURRENTLY (Postgres would reject that).
    expect(parentCreates[0]).not.toContain("CONCURRENTLY")

    // Exactly 64 per-partition CONCURRENTLY creates, one per partition 0..63,
    // with the same column list and predicate as the parent.
    const partitionCreates = statements.filter((statement) =>
      PARTITION_INDEX_CREATE_PATTERN.test(statement),
    )
    expect(partitionCreates).toHaveLength(64)
    const partitionNumbers = partitionCreates
      .map((statement) => {
        const match = statement.match(PARTITION_INDEX_CREATE_NUMBERS_PATTERN)
        expect(match).not.toBeNull()
        expect(match?.[1]).toBe(match?.[2])
        return Number(match?.[1])
      })
      .sort((a, b) => a - b)
    expect(partitionNumbers).toEqual(Array.from({ length: 64 }, (_, i) => i))
    for (const statement of partitionCreates) {
      expect(statement).toContain(COLUMN_LIST)
      expect(statement).toContain(PREDICATE)
    }

    // No statement runs CONCURRENTLY directly against the partitioned parent
    // table/index — only against ContactInbox or an individual partition.
    for (const statement of statements) {
      if (statement.includes("CONCURRENTLY")) {
        expect(statement).not.toContain('ON "ContactOnBroadcast"')
      }
    }

    // Nothing attempts DROP INDEX CONCURRENTLY on the partitioned ContactOnBroadcast index.
    for (const statement of statements) {
      expect(statement).not.toContain(
        'DROP INDEX CONCURRENTLY IF EXISTS "ContactOnBroadcast',
      )
    }

    // One DO block attaches all 64 partition indexes to the parent.
    const attachBlocks = statements.filter((statement) =>
      statement.includes("ATTACH PARTITION"),
    )
    expect(attachBlocks).toHaveLength(1)
    for (let i = 0; i < 64; i++) {
      expect(attachBlocks[0]).toContain(
        `ATTACH PARTITION "ContactOnBroadcast_p${i}_unsent_order_idx"`,
      )
    }

    // One DO block verifies the parent index is valid once all partitions attach.
    const verifyBlocks = statements.filter(
      (statement) =>
        statement.includes("indisvalid") &&
        statement.includes("RAISE EXCEPTION"),
    )
    expect(verifyBlocks).toHaveLength(1)

    // The final statement takes the brief ACCESS EXCLUSIVE lock (metadata-only
    // plain DROP), so it must run last, after every CONCURRENTLY build.
    expect(statements.at(-1)).toBe(
      'DROP INDEX IF EXISTS "ContactOnBroadcast_unsent_idx";',
    )
  })
})
