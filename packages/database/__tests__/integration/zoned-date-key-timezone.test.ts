// @vitest-environment node

/**
 * Proves `zonedDateKey` survives a timezone name PostgreSQL does not carry.
 *
 * The unit tests next to it only assert the SHAPE of the generated SQL, which
 * is exactly the gap that let the original bug ship: `resolveTimezone` validated
 * the `tz` URL param against Node's ICU database, then handed the name to
 * PostgreSQL, which keeps a separate one. A build packaged without the
 * `backward` tzdata file rejects the legacy spelling outright —
 *
 *     ERROR: time zone "Asia/Saigon" not recognized   (SQLSTATE 22023)
 *
 * — aborting the whole statement and, with nothing catching it between the
 * repository and the React error boundary, blanking the dashboard. Only a real
 * database can prove that is fixed.
 *
 * Reads nothing and writes nothing: every case runs against a literal
 * timestamp. Skipped unless `DATABASE_URL` points at a reachable database; run
 * it with `pnpm --filter @chatbotx.io/database test:db`.
 */

import { PgDialect } from "drizzle-orm/pg-core"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { resolvedTimezone } from "../../src/queries/date-bucket"

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

describe.skipIf(!databaseUrl)("zonedDateKey against a real PostgreSQL", () => {
  let client: Client

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl as string })
    await client.connect()
  })

  afterAll(async () => {
    await client?.end()
  })

  /** The day key PostgreSQL produces for `at` when asked for `timezone`. */
  const dayKeyFor = async (timezone: string, at: string): Promise<string> => {
    const zone = new PgDialect().sqlToQuery(resolvedTimezone(timezone))
    const { rows } = await client.query<{ day: string }>(
      `SELECT to_char($${zone.params.length + 1}::timestamptz AT TIME ZONE ${zone.sql}, 'YYYY-MM-DD') AS day`,
      [...zone.params, at],
    )
    return rows[0].day
  }

  // Every case uses an instant where UTC+7 and UTC land on DIFFERENT days
  // (17:30Z is 00:30 the next morning in Vietnam), so a test can only pass by
  // actually applying the requested zone — not by silently falling back.
  const AFTER_MIDNIGHT_IN_VIETNAM = "2026-09-08T17:30:00Z"

  // The reported crash, verbatim: a Vietnamese browser reports `Asia/Saigon`,
  // which reaches the query as-is.
  test("accepts a legacy timezone name instead of raising 22023", async () => {
    await expect(
      dayKeyFor("Asia/Saigon", AFTER_MIDNIGHT_IN_VIETNAM),
    ).resolves.toBe("2026-09-09")
  })

  test("accepts the canonical spelling of the same zone", async () => {
    await expect(
      dayKeyFor("Asia/Ho_Chi_Minh", AFTER_MIDNIGHT_IN_VIETNAM),
    ).resolves.toBe("2026-09-09")
  })

  // Whichever spelling this database happens to carry, both must bucket the
  // same instant onto the same day — otherwise the fallback silently shifts a
  // viewer's chart by the UTC offset.
  test("both spellings agree on the day boundary", async () => {
    const [legacy, canonical] = await Promise.all([
      dayKeyFor("Asia/Saigon", AFTER_MIDNIGHT_IN_VIETNAM),
      dayKeyFor("Asia/Ho_Chi_Minh", AFTER_MIDNIGHT_IN_VIETNAM),
    ])

    expect(legacy).toBe(canonical)
  })

  // The safety net: an unmapped name must degrade to UTC, never abort the
  // statement. `resolveTimezone` blocks this one today, but the SQL layer is
  // what has to hold if any future caller does not.
  test("falls back to UTC for a name the database does not know", async () => {
    await expect(
      dayKeyFor("Not/AZone", AFTER_MIDNIGHT_IN_VIETNAM),
    ).resolves.toBe("2026-09-08")
  })

  test("a zone the database does know is used, not the fallback", async () => {
    await expect(
      dayKeyFor("America/New_York", "2026-09-08T03:30:00Z"),
    ).resolves.toBe("2026-09-07")
  })
})
