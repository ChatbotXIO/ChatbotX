// @vitest-environment node

/**
 * Production snowflake ids are above Number.MAX_SAFE_INTEGER, local ones are
 * not — so a nested relational query that lets a bigint reach JSON uncast
 * (drizzle-orm 1.0.0-rc custom columns did) passes every local check while
 * rounding ids in production. This round-trips production-size ids, scalar and
 * array, through a nested `with:` against a real database.
 *
 * Uses connection-scoped temp tables, so it writes nothing persistent.
 * Skipped unless `DATABASE_URL` points at a reachable database; run it with
 * `pnpm --filter @chatbotx.io/database test:db`.
 */

import { defineRelations } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { pgTable } from "drizzle-orm/pg-core"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { bigintAsString } from "../../src/partials/shared"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()

// Odd values above 2^53: a float64 cannot represent them, so any rounding shows.
const PARENT_ID = "11779481638171873"
const CHILD_ID = "11779481638335495"
const PATH_ID = "11779481638335497"

const parent = pgTable("bigint_json_parent", {
  id: bigintAsString().primaryKey(),
})
const child = pgTable("bigint_json_child", {
  id: bigintAsString().primaryKey(),
  parentId: bigintAsString().notNull(),
  paths: bigintAsString().array().notNull(),
})
const testRelations = defineRelations({ parent, child }, (r) => ({
  parent: {
    children: r.many.child({ from: r.parent.id, to: r.child.parentId }),
  },
}))

describe.skipIf(!databaseUrl)(
  "bigintAsString through nested relational queries",
  () => {
    const client = new Client({ connectionString: databaseUrl ?? undefined })
    const db = drizzle({ client, relations: testRelations })

    beforeAll(async () => {
      await client.connect()
      await client.query(
        "create temp table bigint_json_parent (id bigint primary key)",
      )
      await client.query(
        'create temp table bigint_json_child (id bigint primary key, "parentId" bigint not null, paths bigint[] not null)',
      )
      await client.query("insert into bigint_json_parent values ($1)", [
        PARENT_ID,
      ])
      await client.query(
        "insert into bigint_json_child values ($1, $2, $3::bigint[])",
        [CHILD_ID, PARENT_ID, `{${PATH_ID}}`],
      )
    })

    afterAll(async () => {
      await client.end()
    })

    test("keeps nested ids and id arrays exact", async () => {
      const row = await db.query.parent.findFirst({
        with: { children: true },
      })

      expect(row).toEqual({
        id: PARENT_ID,
        children: [{ id: CHILD_ID, parentId: PARENT_ID, paths: [PATH_ID] }],
      })
    })
  },
)
