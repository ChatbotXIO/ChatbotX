import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { getTableConfig } from "drizzle-orm/pg-core"
import { describe, expect, test } from "vitest"
import { contactInboxModel } from "../src/schema/contact-inbox"

const MIGRATION_SUFFIX = "_add_contact_inbox_source_identity_history"

const readMigration = () => {
  const migrationsDirectory = join(import.meta.dirname, "../drizzle")
  const matchingMigrations = readdirSync(migrationsDirectory).filter((entry) =>
    entry.endsWith(MIGRATION_SUFFIX),
  )

  expect(matchingMigrations).toHaveLength(1)
  const [matchingMigration] = matchingMigrations
  if (!matchingMigration) {
    throw new Error("ContactInbox sourceIdentityHistory migration not found")
  }

  return readFileSync(
    join(migrationsDirectory, matchingMigration, "migration.sql"),
    "utf8",
  )
}

describe("ContactInbox sourceIdentityHistory", () => {
  test("schema declares nullable jsonb history without a default", () => {
    const config = getTableConfig(contactInboxModel)
    const column = config.columns.find(
      (candidate) => candidate.name === "sourceIdentityHistory",
    )

    expect(column).toBeDefined()
    expect(column?.dataType).toBe("object json")
    expect(column?.notNull).toBe(false)
    expect(column?.hasDefault).toBe(false)
  })

  test("migration adds only the nullable history column restart-safely", () => {
    const sql = readMigration().trim()

    expect(sql).toBe(
      'ALTER TABLE "ContactInbox" ADD COLUMN IF NOT EXISTS "sourceIdentityHistory" jsonb;',
    )
    expect(sql).not.toContain("DEFAULT")
    expect(sql).not.toContain("INDEX")
    expect(sql).not.toContain("UPDATE")
  })
})
