// @vitest-environment node

/**
 * `cacheVersionRepository.read` against real Postgres, plus the keyword rule
 * the template-store cache relies on: `text ILIKE likeContains(kw)` equals
 * "lower(text) contains the unescaped lower(likeContains(kw))", with both
 * lowerings done by PostgreSQL. Skipped without a reachable database or
 * before the `CacheVersion` migration is applied.
 */

import { createId } from "@chatbotx.io/utils"
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { type DatabaseClient, inArray } from "../../src/client"
import { relations } from "../../src/relations"
import { cacheVersionRepository } from "../../src/repositories/cache-version"
// biome-ignore lint/performance/noNamespaceImport: mirrors how src/client.ts builds the db
import * as schema from "../../src/schema"
import { likeContains } from "../../src/utils"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()
const NAMESPACE = "template-store"
const MICROS_PER_MILLISECOND = 1000
const CLOCK_TOLERANCE_MS = 60_000
const INTEGRAL_PATTERN = /^\d+$/

async function migrationApplied(): Promise<boolean> {
  if (!databaseUrl) {
    return false
  }
  const pool = new Pool({ connectionString: databaseUrl, max: 1 })
  try {
    const result = await pool.query<{ present: string | null }>(
      `select to_regclass('"CacheVersion"')::text as present`,
    )
    return result.rows[0].present !== null
  } catch {
    return false
  } finally {
    await pool.end().catch(() => undefined)
  }
}

const ready = await migrationApplied()

/** What the business layer will do with a lowered pattern: drop the outer `%`, remove escapes. */
const unescapeLoweredContainsPattern = (lowered: string): string =>
  lowered.slice(1, -1).replace(/\\(.)/gs, "$1")

const TEXTS = [
  "ΣΑΣ",
  "ΑΣ",
  "ΑΣΑ",
  "ΑΣ ΑΣ",
  "Σ",
  "σας",
  "σασ",
  "ΣΑΣ.",
  "İ",
  "İstanbul",
  "i̇",
  "Iİi",
  "é",
  "É",
  "É",
  "100%",
  "a_b",
  "a\\b",
  "%_\\",
  "  spaced  ",
  "Phở Việt",
  "ǅ",
  "ß",
  "ẞ",
]
const KEYWORDS = [
  "ΣΑΣ",
  "ΑΣ",
  "Σ",
  "σ",
  "ς",
  "σας",
  "ΑΣ ",
  " ΑΣ",
  "İ",
  "i",
  "i̇",
  "I",
  "e",
  "́",
  "É",
  "%",
  "_",
  "\\",
  "\\%",
  "a_b",
  "a\\b",
  "%_\\",
  " ",
  "  spaced  ",
  "ở",
  "ǆ",
  "ß",
  "ss",
]

describe.skipIf(!ready)("cacheVersionRepository", () => {
  let pool: Pool
  let db: DatabaseClient
  const userIds: string[] = []
  const tenantIds: string[] = []

  beforeAll(() => {
    pool = new Pool({ connectionString: databaseUrl as string, max: 4 })
    db = drizzle({ client: pool, schema, relations })
  })

  afterAll(async () => {
    await db
      .delete(schema.tenantModel)
      .where(inArray(schema.tenantModel.id, tenantIds))
    await db
      .delete(schema.userModel)
      .where(inArray(schema.userModel.id, userIds))
    await pool.end()
  })

  const read = (scopeId: string, lowercase?: string) =>
    cacheVersionRepository.read(
      { namespace: NAMESPACE, scopeId, lowercase },
      db,
    )

  test("a scope with no row reads version 0 and still returns one row", async () => {
    const result = await read(`never-written-${createId()}`)
    expect(result.version).toBe("0")
    expect(result.lowercased).toBeNull()
  })

  test("bump creates the row at 1 and then increments, in the given transaction", async () => {
    const [owner] = await db
      .insert(schema.userModel)
      .values({ email: `cvr-${createId()}@example.test` })
      .returning({ id: schema.userModel.id })
    userIds.push(owner.id)
    const [tenant] = await db
      .insert(schema.tenantModel)
      .values({ ownerId: owner.id })
      .returning({ id: schema.tenantModel.id })
    tenantIds.push(tenant.id)
    expect((await read(tenant.id)).version).toBe("0")
    const key = { namespace: NAMESPACE, scopeId: tenant.id } as const
    await db.transaction((tx) => cacheVersionRepository.bump(key, tx))
    expect((await read(tenant.id)).version).toBe("1")
    await db.transaction((tx) => cacheVersionRepository.bump(key, tx))
    expect((await read(tenant.id)).version).toBe("2")
  })

  test("databaseNowMicros is an integral microsecond count close to the clock", async () => {
    const before = Date.now()
    const { databaseNowMicros } = await read("clock")
    const after = Date.now()
    expect(databaseNowMicros).toMatch(INTEGRAL_PATTERN)
    const millis = Number(
      BigInt(databaseNowMicros) / BigInt(MICROS_PER_MILLISECOND),
    )
    expect(millis).toBeGreaterThan(before - CLOCK_TOLERANCE_MS)
    expect(millis).toBeLessThan(after + CLOCK_TOLERANCE_MS)
  })

  test("databaseNowMicros is the statement start, later than the transaction's now()", async () => {
    const client = await pool.connect()
    try {
      await client.query("begin")
      await client.query("select pg_sleep(0.05)")
      const { rows } = await client.query<{ txMicros: string }>(
        `select floor(extract(epoch from now()) * 1000000)::bigint::text as "txMicros"`,
      )
      const txBegin = BigInt(rows[0].txMicros)
      const read = await cacheVersionRepository.read(
        { namespace: NAMESPACE, scopeId: "stmt" },
        drizzle({ client, schema, relations }),
      )
      await client.query("rollback")
      expect(BigInt(read.databaseNowMicros) - txBegin >= 50_000n).toBe(true)
    } finally {
      client.release()
    }
  })

  test("the epoch-microsecond expression is exact at the largest timestamptz(6) precision", async () => {
    const result = await pool.query<{ micros: string }>(
      `select floor(extract(epoch from timestamptz '2026-01-02 03:04:05.123457+00') * 1000000)::bigint::text as micros`,
    )
    const expected = BigInt(Date.UTC(2026, 0, 2, 3, 4, 5)) * 1000n + 123_457n
    expect(result.rows[0].micros).toBe(expected.toString())
  })

  test("lowercased is null without a pattern and lower(pattern) with one", async () => {
    expect((await read("p")).lowercased).toBeNull()
    expect((await read("p", undefined)).lowercased).toBeNull()
    expect((await read("p", likeContains("Phở VIỆT"))).lowercased).toBe(
      "%phở việt%",
    )
    // Context-sensitive: PostgreSQL lowers the final sigma to σ here, not ς.
    expect((await read("p", "%ΣΑΣ%")).lowercased).toBe("%σασ%")
    expect((await read("p", "%İ%")).lowercased).toBe(
      (await pool.query<{ l: string }>(`select lower('%İ%') as l`)).rows[0].l,
    )
    // Wildcards and the escape character are left unchanged.
    expect((await read("p", "%\\%\\_\\\\%")).lowercased).toBe("%\\%\\_\\\\%")
  })
})

describe.skipIf(!ready)(
  "keyword rule: ILIKE equals contains on lowered text",
  () => {
    let pool: Pool
    let icuAvailable = false

    beforeAll(async () => {
      pool = new Pool({ connectionString: databaseUrl as string, max: 2 })
      const icu = await pool.query<{ n: string }>(
        `select count(*)::text as n from pg_collation where collname = 'und-x-icu'`,
      )
      icuAvailable = icu.rows[0].n !== "0"
    })

    afterAll(async () => {
      await pool.end()
    })

    /** `collation` is a trusted literal from this file, never user input. */
    const compare = async (collation: string | null) => {
      const clause = collation ? ` COLLATE "${collation}"` : ""
      const mismatches: string[] = []
      for (const keyword of KEYWORDS) {
        const pattern = likeContains(keyword)
        const result = await pool.query<{
          text: string
          matched: boolean
          lowered: string
          loweredPattern: string
        }>(
          `select t as "text",
                (t${clause} ILIKE $1) as matched,
                lower(t${clause}) as lowered,
                lower($1::text${clause}) as "loweredPattern"
           from unnest($2::text[]) as t`,
          [pattern, TEXTS],
        )
        for (const row of result.rows) {
          const literal = unescapeLoweredContainsPattern(row.loweredPattern)
          if (row.lowered.includes(literal) !== row.matched) {
            mismatches.push(
              `${JSON.stringify(row.text)} ~ ${JSON.stringify(keyword)}: ilike=${row.matched}`,
            )
          }
        }
      }
      return mismatches
    }

    test("under the database default collation", async () => {
      expect(await compare(null)).toEqual([])
    })

    test("under an explicit ICU collation", async (context) => {
      if (!icuAvailable) {
        context.skip()
      }
      expect(await compare("und-x-icu")).toEqual([])
    })

    test("the unescape helper inverts likeContains for wildcard and backslash keywords", () => {
      for (const keyword of ["%", "_", "\\", "\\%", "a_b", "%_\\", " x "]) {
        expect(unescapeLoweredContainsPattern(likeContains(keyword))).toBe(
          keyword,
        )
      }
    })
  },
)
