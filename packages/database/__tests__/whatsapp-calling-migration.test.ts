import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"

/**
 * DB-free pin on the consolidated WhatsApp-calling migration.
 *
 * `WhatsappCall` is CREATED by this same file, so everything the feature
 * needs — the `outcome` enum and column, the calls-page keyset index —
 * ships inside the CREATE. There is no pre-existing data, which is what
 * makes the backfill / `CONCURRENTLY` / drop-the-old-index dance the
 * earlier split migrations performed unnecessary. These tests keep it that
 * way: reintroducing any of it would mean someone had split a new table's
 * own definition across migrations again.
 */

const MIGRATION_SQL = readFileSync(
  join(
    import.meta.dirname,
    "../drizzle/20260917072620_whatsapp_calling_consolidated/migration.sql",
  ),
  "utf8",
)

const KEYSET_INDEX_NAME = '"WhatsappCall_workspaceId_createdAt_id_idx"'
const SUPERSEDED_INDEX_NAME = '"WhatsappCall_workspaceId_createdAt_idx"'
const ENUM_VALUES_RE = /CREATE TYPE "whatsappCallOutcome" AS ENUM\(([^)]+)\)/
const QUOTED_VALUE_RE = /^'|'$/g
const CONCURRENTLY_RE = /\bCONCURRENTLY\b/i
const BACKFILL_RE = /UPDATE "WhatsappCall"/i
const OUTCOME_ALTER_RE = /ALTER TABLE "WhatsappCall"\s+ADD COLUMN "outcome"/

describe("consolidated whatsapp calling migration", () => {
  test("declares the whatsappCallOutcome enum with exactly the four outcome values", () => {
    const match = ENUM_VALUES_RE.exec(MIGRATION_SQL)
    expect(match).not.toBeNull()

    const values = (match?.[1] ?? "")
      .split(",")
      .map((value) => value.trim().replace(QUOTED_VALUE_RE, ""))

    expect(values).toEqual(["completed", "failed", "rejected", "canceled"])
  })

  test("ships the outcome column inside CREATE TABLE, never as a later ALTER", () => {
    const createTable = MIGRATION_SQL.slice(
      MIGRATION_SQL.indexOf('CREATE TABLE "WhatsappCall" ('),
    )
    expect(createTable).toContain('"outcome" "whatsappCallOutcome"')
    expect(MIGRATION_SQL).not.toMatch(OUTCOME_ALTER_RE)
  })

  test("creates the calls-page keyset index in its final three-column shape", () => {
    expect(MIGRATION_SQL).toContain(
      `CREATE INDEX ${KEYSET_INDEX_NAME} ON "WhatsappCall" ("workspaceId","createdAt" DESC NULLS LAST,"id" DESC NULLS LAST)`,
    )
  })

  test("never creates the superseded two-column index, so nothing has to drop it later", () => {
    expect(MIGRATION_SQL).not.toContain(`CREATE INDEX ${SUPERSEDED_INDEX_NAME}`)
    expect(MIGRATION_SQL).not.toContain(`DROP INDEX ${SUPERSEDED_INDEX_NAME}`)
  })

  test("backfills nothing — the table is created empty in this same file", () => {
    expect(MIGRATION_SQL).not.toMatch(BACKFILL_RE)
  })

  test("stays fully transactional: no CONCURRENTLY statement anywhere", () => {
    expect(MIGRATION_SQL).not.toMatch(CONCURRENTLY_RE)
  })

  test("adds the presence column to the pre-existing WorkspaceMember table as a nullable ALTER", () => {
    expect(MIGRATION_SQL).toContain(
      'ALTER TABLE "WorkspaceMember" ADD COLUMN "onlineSince" timestamp(6) with time zone',
    )
    expect(MIGRATION_SQL).not.toContain(
      'ALTER TABLE "WorkspaceMember" ADD COLUMN "onlineSince" timestamp(6) with time zone NOT NULL',
    )
  })
})
