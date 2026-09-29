// @vitest-environment node

/**
 * `setLocalStatementTimeout` against a real Postgres: the unit test only
 * proves the rendered SQL text; this proves the server actually cancels a
 * statement that outlives the cap and that the cap dies with the transaction.
 *
 * Skipped unless `DATABASE_URL` points at a reachable database; run it with
 * `pnpm --filter @chatbotx.io/database test:db`.
 */

import { sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { setLocalStatementTimeout } from "../../src/statement-timeout"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()

/** PostgreSQL SQLSTATE for `canceling statement due to statement timeout`. */
const QUERY_CANCELED = "57014"

/** drizzle wraps driver errors; the SQLSTATE lives on the innermost `cause`. */
const sqlState = (error: unknown): string | undefined => {
  let current: unknown = error
  while (current instanceof Error) {
    if ("code" in current && typeof current.code === "string") {
      return current.code
    }
    current = current.cause
  }
  return
}

describe.skipIf(!databaseUrl)(
  "setLocalStatementTimeout against Postgres",
  () => {
    let client: Client

    beforeAll(async () => {
      client = new Client({ connectionString: databaseUrl as string })
      await client.connect()
    })

    afterAll(async () => {
      await client.end()
    })

    const showStatementTimeout = async () => {
      const { rows } = await client.query<{ statement_timeout: string }>(
        "show statement_timeout",
      )
      return rows[0]?.statement_timeout
    }

    test("cancels a statement that outlives the cap and aborts the transaction", async () => {
      const db = drizzle({ client })

      const run = db.transaction(async (tx) => {
        await setLocalStatementTimeout(tx, "100ms")
        await tx.execute(sql`select pg_sleep(1)`)
      })

      await expect(run).rejects.toSatisfy(
        (error) => sqlState(error) === QUERY_CANCELED,
      )
    })

    test("is scoped to the transaction: the session keeps its own setting", async () => {
      const db = drizzle({ client })
      const before = await showStatementTimeout()

      await db.transaction(async (tx) => {
        await setLocalStatementTimeout(tx, "100ms")
        await expect(
          tx.execute(sql`show statement_timeout`),
        ).resolves.toMatchObject({ rows: [{ statement_timeout: "100ms" }] })
      })

      await expect(showStatementTimeout()).resolves.toBe(before)
    })
  },
)
