// @vitest-environment node

/**
 * Pins the shape `db.execute(sql`…`)` returns on drizzle-orm 1.0.0-rc against a
 * real Postgres. ~130 call sites read `result.rows` (raw SQL in repositories),
 * so a drizzle change to the `execute` result (array instead of
 * `{ rows, rowCount }`, different value coercion) must fail here first.
 *
 * Skipped unless `DATABASE_URL` points at a reachable database; run it with
 * `pnpm --filter @chatbotx.io/database test:db`.
 */

import { sql } from "drizzle-orm"
import { describe, expect, test } from "vitest"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()

describe.skipIf(!databaseUrl)("db.execute result shape", async () => {
  const { db } = await import("../../src/client")

  test("returns an object whose `rows` is an array of plain row objects", async () => {
    const result = await db.execute<{ id: number; label: string }>(
      sql`SELECT 1::int AS id, 'a'::text AS label UNION ALL SELECT 2, 'b' ORDER BY id`,
    )

    expect(Array.isArray(result)).toBe(false)
    expect(Array.isArray(result.rows)).toBe(true)
    expect(result.rows).toEqual([
      { id: 1, label: "a" },
      { id: 2, label: "b" },
    ])
    expect(Object.getPrototypeOf(result.rows[0])).toBe(Object.prototype)
  })

  test("`rows` is an empty array (not undefined) when nothing matches", async () => {
    const result = await db.execute(sql`SELECT 1 AS id WHERE false`)

    expect(result.rows).toEqual([])
    expect(result.rowCount).toBe(0)
  })

  test("keeps the pg value coercions repositories depend on", async () => {
    const { rows } = await db.execute<Record<string, unknown>>(sql`
      SELECT
        42::int AS int_value,
        9007199254740993::bigint AS bigint_value,
        count(*) OVER () AS count_value,
        1.5::numeric AS numeric_value,
        true AS bool_value,
        NULL::text AS null_value,
        '{"a":{"b":[1,2]}}'::jsonb AS jsonb_value,
        ARRAY['x','y']::text[] AS text_array,
        ARRAY[1,2]::int[] AS int_array,
        '2026-01-02T03:04:05.000Z'::timestamptz AS ts_value,
        '2026-01-02'::date AS date_value,
        '11111111-1111-4111-8111-111111111111'::uuid AS uuid_value
    `)
    const row = rows[0] as Record<string, unknown>

    expect(row.int_value).toBe(42)
    // int8 / count(*) stay strings: callers `Number(...)` them explicitly.
    expect(row.bigint_value).toBe("9007199254740993")
    expect(row.count_value).toBe("1")
    expect(row.numeric_value).toBe("1.5")
    expect(row.bool_value).toBe(true)
    expect(row.null_value).toBeNull()
    expect(row.jsonb_value).toEqual({ a: { b: [1, 2] } })
    expect(row.text_array).toEqual(["x", "y"])
    expect(row.int_array).toEqual([1, 2])
    // Raw execute does not run drizzle's column mappers: timestamptz comes
    // back as a pg `Date`, `date` as a Date at local midnight.
    expect(row.ts_value).toBeInstanceOf(Date)
    expect((row.ts_value as Date).toISOString()).toBe(
      "2026-01-02T03:04:05.000Z",
    )
    expect(row.date_value).toBeInstanceOf(Date)
    expect(row.uuid_value).toBe("11111111-1111-4111-8111-111111111111")
  })

  test("binds parameters and returns the matching rows", async () => {
    const ids = [3, 1, 2]
    const result = await db.execute<{ id: number }>(
      sql`SELECT id FROM generate_series(1, 5) AS t(id) WHERE id IN ${ids} AND id > ${1} ORDER BY id`,
    )

    expect(result.rows).toEqual([{ id: 2 }, { id: 3 }])
  })

  test("`transaction` callbacks get the same `{ rows }` shape", async () => {
    const rows = await db.transaction(async (tx) => {
      const result = await tx.execute<{ n: number }>(sql`SELECT 7::int AS n`)
      return result.rows
    })

    expect(rows).toEqual([{ n: 7 }])
  })

  test("DML with RETURNING exposes returned `rows` and `rowCount`", async () => {
    const result = await db.transaction(async (tx) => {
      await tx.execute(
        sql`CREATE TEMP TABLE execute_rows_probe (id int) ON COMMIT DROP`,
      )
      return tx.execute<{ id: number }>(
        sql`INSERT INTO execute_rows_probe (id) VALUES (1), (2) RETURNING id`,
      )
    })

    expect(result.rows).toEqual([{ id: 1 }, { id: 2 }])
    expect(result.rowCount).toBe(2)
  })

  test("DML without RETURNING reports `rowCount` with empty `rows`", async () => {
    const result = await db.transaction(async (tx) => {
      await tx.execute(
        sql`CREATE TEMP TABLE execute_rows_probe (id int) ON COMMIT DROP`,
      )
      await tx.execute(sql`INSERT INTO execute_rows_probe VALUES (1), (2), (3)`)
      return tx.execute(sql`DELETE FROM execute_rows_probe WHERE id > 1`)
    })

    expect(result.rows).toEqual([])
    expect(result.rowCount).toBe(2)
  })
})
