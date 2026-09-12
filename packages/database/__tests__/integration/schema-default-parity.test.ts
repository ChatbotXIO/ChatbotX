// @vitest-environment node

/**
 * Which drizzle column defaults are a lie, checked against the real database.
 *
 * `.default(...)` does two things: it flips the column to OPTIONAL in
 * `$inferInsert`, and it makes drizzle emit the bare SQL keyword `DEFAULT` for
 * an omitted key — it does NOT inline the value. So when the physical column
 * has no default, an omitted key is not "the default", it is an error: NOT NULL
 * violation on a `notNull()` column, a silent NULL on a nullable one.
 *
 * drizzle-kit produces exactly that mismatch for `jsonb().default(sql`[]`)`:
 * it serializes the default as `""` into the migration snapshot, so the
 * generated `migration.sql` creates the column with no `DEFAULT` clause. The
 * schema, the snapshot chain and the database then all agree — which is why
 * `pnpm db:check-drift` reports "in sync" and cannot see this — while the
 * TypeScript insert type keeps claiming the column is optional.
 *
 * This test pins the columns where that is true today. It is a tripwire, not a
 * clean bill of health: a NEW entry means someone added a `.default()` that the
 * database does not have, and every insert path for that column must write it
 * explicitly (see `insert-required-columns.test.ts`). An entry disappearing
 * means a real default was migrated — delete the line.
 *
 * Skipped unless `DATABASE_URL` points at a reachable database; run it with
 * `pnpm --filter @chatbotx.io/database test:db`.
 */

import { getTableColumns, getTableName, is } from "drizzle-orm"
import { PgTable } from "drizzle-orm/pg-core"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
// biome-ignore lint/performance/noNamespaceImport: every table in the schema is the point
import * as schema from "../../src/schema"

/** The `setup-env` sentinel: a real database never listens on port 1. */
const NON_ROUTABLE_PORT = "1"

function realDatabaseUrl(): string | null {
  const url = process.env.DATABASE_URL
  if (!url) {
    return null
  }
  try {
    return new URL(url).port === NON_ROUTABLE_PORT ? null : url
  } catch {
    return null
  }
}

const databaseUrl = realDatabaseUrl()

/**
 * Columns whose drizzle `.default()` does not exist in the database. Every one
 * of them is `jsonb().default(sql`[]`).notNull()` — the shape drizzle-kit drops.
 * Sorted `Table.column`.
 */
const DEFAULTS_MISSING_FROM_DATABASE = [
  "AIAgent.messages",
  "AIAgent.models",
  "AIAgent.tools",
  "AIMCPServer.selectedTools",
  "AutomatedResponse.keywords",
  "Folder.paths",
  "IntegrationInstagram.conversationStarters",
  "IntegrationInstagram.persistentMenus",
  "IntegrationMessenger.conversationStarters",
  "IntegrationMessenger.persistentMenus",
  "IntegrationMessenger.personas",
  "IntegrationWebchat.authorizedDomains",
  "IntegrationWebchat.conversationStarters",
  "IntegrationWebchat.persistentMenus",
  "Trigger.actions",
  "UserPersistentMenu.menus",
] as const

describe.skipIf(!databaseUrl)("drizzle defaults vs database defaults", () => {
  let client: Client
  const databaseDefaults = new Map<string, boolean>()

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl as string })
    await client.connect()
    const { rows } = await client.query<{
      table_name: string
      column_name: string
      column_default: string | null
    }>(
      `select table_name, column_name, column_default
         from information_schema.columns
        where table_schema = 'public'`,
    )
    for (const row of rows) {
      databaseDefaults.set(
        `${row.table_name}.${row.column_name}`,
        row.column_default !== null,
      )
    }
  })

  afterAll(async () => {
    await client?.end()
  })

  test("only the known columns declare a default the database does not have", () => {
    const phantom: string[] = []

    for (const value of Object.values(schema)) {
      if (!is(value, PgTable)) {
        continue
      }
      const tableName = getTableName(value)
      for (const column of Object.values(getTableColumns(value))) {
        const key = `${tableName}.${column.name}`
        // `$defaultFn` columns are filled in by drizzle before the statement is
        // built (e.g. every `id`), so they never reach the database as DEFAULT.
        // Columns absent from the database are not this test's business —
        // that is an unapplied migration, which `db:check-drift` reports.
        if (
          column.hasDefault &&
          column.defaultFn === undefined &&
          databaseDefaults.get(key) === false
        ) {
          phantom.push(key)
        }
      }
    }

    expect(phantom.sort()).toEqual([...DEFAULTS_MISSING_FROM_DATABASE])
  })
})
