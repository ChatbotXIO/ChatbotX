import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { getTableConfig } from "drizzle-orm/pg-core"
import { describe, expect, test } from "vitest"
import { CONTACT_INBOX_SOURCE_PARENT_USER_ID_KEY } from "../src/schema"
import { contactInboxModel } from "../src/schema/contact-inbox"

const MIGRATION_SUFFIX = "_add_contact_inbox_source_parent_user_id"

const readMigration = () => {
  const migrationsDirectory = join(import.meta.dirname, "../drizzle")
  const matchingMigrations = readdirSync(migrationsDirectory).filter((entry) =>
    entry.endsWith(MIGRATION_SUFFIX),
  )

  expect(matchingMigrations).toHaveLength(1)
  const [matchingMigration] = matchingMigrations
  if (!matchingMigration) {
    throw new Error("ContactInbox sourceParentUserId migration not found")
  }

  return readFileSync(
    join(migrationsDirectory, matchingMigration, "migration.sql"),
    "utf8",
  )
}

describe("ContactInbox sourceParentUserId", () => {
  test("schema declares a nullable matching-only identity with a partial unique index", () => {
    const config = getTableConfig(contactInboxModel)
    const column = config.columns.find(
      (candidate) => candidate.name === "sourceParentUserId",
    )
    const index = config.indexes.find(
      (candidate) =>
        candidate.config.name === CONTACT_INBOX_SOURCE_PARENT_USER_ID_KEY,
    )

    expect(column).toBeDefined()
    expect(column?.notNull).toBe(false)
    expect(index?.config.unique).toBe(true)
    expect(
      index?.config.columns.map((candidate) =>
        "name" in candidate ? candidate.name : String(candidate),
      ),
    ).toEqual(["inboxId", "sourceParentUserId"])
    expect(index?.config.where).toBeDefined()
  })

  test("migration adds the column and creates the partial index restart-safely", () => {
    const sql = readMigration()
    const statements = sql
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean)

    expect(statements).toContain(
      'ALTER TABLE "ContactInbox" ADD COLUMN IF NOT EXISTS "sourceParentUserId" text;',
    )
    expect(statements).toContain(
      'CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "ContactInbox_inboxId_sourceParentUserId_key"\n  ON "ContactInbox" USING btree ("inboxId", "sourceParentUserId")\n  WHERE "sourceParentUserId" IS NOT NULL;',
    )

    const cleanupBlocks = statements.filter(
      (statement) =>
        statement.includes(
          `to_regclass('"${CONTACT_INBOX_SOURCE_PARENT_USER_ID_KEY}"')`,
        ) &&
        statement.includes("NOT indisvalid") &&
        statement.includes(
          `DROP INDEX IF EXISTS "${CONTACT_INBOX_SOURCE_PARENT_USER_ID_KEY}"`,
        ),
    )
    expect(cleanupBlocks).toHaveLength(1)
    expect(sql).not.toContain("lock_timeout")
  })
})
