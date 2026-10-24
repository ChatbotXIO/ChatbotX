// @vitest-environment node

/** Real-SQL boundaries of the shared capped count (`LIMIT cap + 1` wrapper). */

import { sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { countQueryCapped } from "../../src/client"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()
const CAP = 5

describe.skipIf(!databaseUrl)("countQueryCapped (real SQL)", () => {
  let pool: Pool
  const client = () => drizzle({ client: pool })

  beforeAll(() => {
    pool = new Pool({ connectionString: databaseUrl as string })
  })

  afterAll(async () => {
    await pool?.end()
  })

  const rows = (count: number) =>
    sql`SELECT 1 FROM generate_series(1, ${count}::int)`

  test.each([
    { rows: 0, total: 0, capped: false },
    { rows: CAP - 1, total: CAP - 1, capped: false },
    { rows: CAP, total: CAP, capped: false },
    { rows: CAP + 1, total: CAP, capped: true },
    { rows: CAP * 10, total: CAP, capped: true },
  ])("$rows matching rows -> total $total, capped $capped", async (c) => {
    const result = await countQueryCapped({
      cap: CAP,
      client: client() as never,
      query: rows(c.rows),
    })

    expect(result).toEqual({ total: c.total, capped: c.capped, cap: CAP })
  })

  test("accepts a joined select such as the broadcast DM-join branch", async () => {
    const result = await countQueryCapped({
      cap: CAP,
      client: client() as never,
      query: sql`
        SELECT 1
        FROM generate_series(1, 8) AS ci(id)
        INNER JOIN generate_series(1, 8) AS conv(id) ON conv.id = ci.id
        WHERE ci.id % 2 = 0`,
    })

    expect(result).toEqual({ total: 4, capped: false, cap: CAP })
  })
})
