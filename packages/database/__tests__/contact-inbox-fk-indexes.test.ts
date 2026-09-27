import { readFileSync } from "node:fs"
import { join } from "node:path"
import { getTableConfig } from "drizzle-orm/pg-core"
import { describe, expect, test } from "vitest"
import { automationThrottleModel } from "../src/schema/automation-throttle"
import { contactsOnBroadcastsModel } from "../src/schema/contact-on-broadcast"
import { sequenceDispatchModel } from "../src/schema/sequence-dispatch"

const MIGRATION_PATH = join(
  import.meta.dirname,
  "../drizzle/20260924105732_add_contact_inbox_fk_indexes/migration.sql",
)

// Every `contactInboxId` FK whose ON DELETE CASCADE check was seq-scanning the
// child table: deleting a ContactInbox row runs
// `DELETE FROM <child> WHERE "contactInboxId" = $1` per row, and without a
// leading index on that column each check walks every HASH partition.
const TARGETS = [
  {
    model: contactsOnBroadcastsModel,
    table: "ContactOnBroadcast",
    index: "ContactOnBroadcast_contactInboxId_idx",
    partitions: 64,
  },
  {
    model: sequenceDispatchModel,
    table: "SequenceDispatch",
    index: "SequenceDispatch_contactInboxId_idx",
    partitions: 64,
  },
  {
    model: automationThrottleModel,
    table: "AutomationThrottle",
    index: "AutomationThrottle_contactInboxId_idx",
    partitions: 32,
  },
] as const

const readStatements = () =>
  readFileSync(MIGRATION_PATH, "utf8")
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean)

describe("contactInboxId FK cascade indexes", () => {
  test.each(
    TARGETS,
  )("$table schema declares a leading index on contactInboxId", ({
    model,
    index,
  }) => {
    const config = getTableConfig(model)
    const declared = config.indexes.find(
      (candidate) => candidate.config.name === index,
    )
    expect(declared).toBeDefined()
    const columns = declared?.config.columns.map((column) =>
      "name" in column ? column.name : String(column),
    )
    expect(columns).toEqual(["contactInboxId"])
  })

  test.each(
    TARGETS,
  )("$table index is built per partition then attached to an ON ONLY parent", ({
    table,
    index,
    partitions,
  }) => {
    const statements = readStatements()

    // Exactly one ON ONLY parent create, plain (Postgres rejects
    // CONCURRENTLY on a partitioned table), taking no partition locks.
    const parentCreates = statements.filter((statement) =>
      statement.includes(
        `CREATE INDEX IF NOT EXISTS "${index}" ON ONLY "${table}"`,
      ),
    )
    expect(parentCreates).toHaveLength(1)
    expect(parentCreates[0]).toContain('USING btree ("contactInboxId")')
    expect(parentCreates[0]).not.toContain("CONCURRENTLY")

    // One CONCURRENTLY create per partition 0..N-1, each a top-level
    // statement (CONCURRENTLY cannot run inside a DO block).
    const pattern = new RegExp(
      `^CREATE INDEX CONCURRENTLY IF NOT EXISTS "${table}_p(\\d+)_contactInboxId_idx" ON "${table}_p(\\d+)" USING btree \\("contactInboxId"\\);$`,
    )
    const partitionNumbers = statements
      .map((statement) => statement.match(pattern))
      .filter((match): match is RegExpMatchArray => match !== null)
      .map((match) => {
        expect(match[1]).toBe(match[2])
        return Number(match[1])
      })
      .sort((a, b) => a - b)
    expect(partitionNumbers).toEqual(
      Array.from({ length: partitions }, (_, i) => i),
    )

    // A guarded ATTACH loop over every partition, then a validity check.
    const attachBlocks = statements.filter(
      (statement) =>
        statement.includes(`ALTER INDEX "${index}" ATTACH PARTITION %I`) &&
        statement.includes(`FOR i IN 0..${partitions - 1} LOOP`),
    )
    expect(attachBlocks).toHaveLength(1)
    const verifyBlocks = statements.filter(
      (statement) =>
        statement.includes(`'"${index}"'::regclass`) &&
        statement.includes("RAISE EXCEPTION"),
    )
    expect(verifyBlocks).toHaveLength(1)

    // Restart-safe cleanup of an INVALID, unattached child from a prior
    // failed CONCURRENTLY build — and never a healthy one.
    const cleanupBlocks = statements.filter(
      (statement) =>
        statement.includes(`parent_oid oid := to_regclass('"${index}"')`) &&
        statement.includes("NOT indisvalid"),
    )
    expect(cleanupBlocks).toHaveLength(1)
  })

  test("nothing runs CONCURRENTLY against a partitioned parent table", () => {
    for (const statement of readStatements()) {
      if (!statement.includes("CONCURRENTLY")) {
        continue
      }
      for (const { table } of TARGETS) {
        expect(statement).not.toContain(`ON "${table}" `)
      }
    }
  })

  test("every statement is idempotent so the unwrapped migration can re-run", () => {
    for (const statement of readStatements()) {
      if (statement.startsWith("CREATE INDEX")) {
        expect(statement).toContain("IF NOT EXISTS")
      }
    }
  })
})
