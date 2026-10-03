// @vitest-environment node

/**
 * `bulkEligibilityConditions` against a real Postgres. The unit test only reads
 * the rendered SQL; whether `NULL` states, expired standby and the activity
 * windows select the right threads is three-valued logic that proves itself
 * only here.
 *
 * It runs on a TEMP table shadowing `"ContactInbox"` inside a transaction that
 * is always rolled back, so no real row is read or written.
 *
 * Skipped unless `DATABASE_URL` points at a reachable database; run it with
 * `pnpm --filter @chatbotx.io/database test:db`.
 */

import { and } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { bulkEligibilityConditions } from "../../src/queries/ai-handover-bulk-eligibility"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()
const SCHEMA_QUERY_PARAM = /\?schema=.*$/

const NOW = new Date("2026-10-02T12:00:00.000Z")
const REQUESTED_AT = new Date("2026-10-02T11:00:00.000Z")
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * HOUR_MS)

type Thread = {
  id: string
  state: string | null
  role: string | null
  expiresAt: Date | null
  updatedAt: Date | null
  lastIncomingAt: Date | null
}

const thread = (id: string, overrides: Partial<Thread>): Thread => ({
  id,
  state: null,
  role: null,
  expiresAt: null,
  updatedAt: null,
  lastIncomingAt: hoursAgo(1),
  ...overrides,
})

const THREADS: Thread[] = [
  thread("never-observed-active", {}),
  thread("never-observed-dormant", { lastIncomingAt: hoursAgo(24 * 40) }),
  thread("owned", { state: "owned", updatedAt: hoursAgo(3) }),
  thread("idle", { state: "idle", updatedAt: hoursAgo(30) }),
  thread("ai-held", {
    state: "standby",
    role: "ai_agent",
    updatedAt: hoursAgo(2),
  }),
  thread("ai-held-by-channel-expiry", {
    state: "standby",
    role: "ai_agent",
    expiresAt: new Date(NOW.getTime() + HOUR_MS),
    updatedAt: hoursAgo(50),
    lastIncomingAt: hoursAgo(60),
  }),
  thread("ai-standby-past-channel-expiry", {
    state: "standby",
    role: "ai_agent",
    expiresAt: hoursAgo(1),
    updatedAt: hoursAgo(2),
  }),
  thread("ai-standby-idle-after-24h", {
    state: "standby",
    role: "ai_agent",
    updatedAt: hoursAgo(30),
    lastIncomingAt: hoursAgo(30),
  }),
  thread("partner-held", {
    state: "standby",
    role: "escalation",
    updatedAt: hoursAgo(2),
  }),
  thread("ai-held-silent-for-8-days", {
    state: "standby",
    role: "ai_agent",
    expiresAt: new Date(NOW.getTime() + 99 * HOUR_MS),
    updatedAt: hoursAgo(2),
    lastIncomingAt: hoursAgo(8 * 24),
  }),
  thread("changed-after-the-request", {
    state: "owned",
    updatedAt: new Date(REQUESTED_AT.getTime() + 60_000),
  }),
]

describe.skipIf(!databaseUrl)("bulkEligibilityConditions on Postgres", () => {
  let client: Client

  beforeAll(async () => {
    client = new Client({
      connectionString: databaseUrl?.replace(SCHEMA_QUERY_PARAM, ""),
    })
    await client.connect()
    await client.query("BEGIN")
    await client.query(`
      CREATE TEMP TABLE "ContactInbox" (
        id text,
        "sourceId" text,
        "threadControlState" text,
        "threadOwnerRole" text,
        "threadOwnerExpiresAt" timestamptz,
        "threadControlUpdatedAt" timestamptz,
        "lastIncomingMessageAt" timestamptz
      ) ON COMMIT DROP`)
    for (const row of THREADS) {
      await client.query(
        `INSERT INTO "ContactInbox" VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          row.id,
          `psid-${row.id}`,
          row.state,
          row.role,
          row.expiresAt,
          row.updatedAt,
          row.lastIncomingAt,
        ],
      )
    }
  })

  afterAll(async () => {
    await client.query("ROLLBACK")
    await client.end()
  })

  const eligible = async (action: "enable" | "disable", windowMs: number) => {
    const where = and(
      ...bulkEligibilityConditions({
        action,
        requestedAt: REQUESTED_AT,
        now: NOW,
        lastIncomingSince: new Date(NOW.getTime() - windowMs),
      }),
    )
    if (!where) {
      throw new Error("no conditions")
    }
    const { sql, params } = new PgDialect().sqlToQuery(where)
    const result = await client.query<{ id: string }>(
      `SELECT id FROM "ContactInbox" WHERE ${sql} ORDER BY id`,
      params,
    )
    return result.rows.map((row) => row.id)
  }

  test("enable reaches never-observed, owned, idle and lapsed-standby threads, never a held one", async () => {
    expect(await eligible("enable", 30 * DAY_MS)).toEqual([
      "ai-standby-idle-after-24h",
      "ai-standby-past-channel-expiry",
      "idle",
      "never-observed-active",
      "owned",
    ])
  })

  test("disable reaches only threads the AI agent holds right now, inside the 7-day window", async () => {
    expect(await eligible("disable", 7 * DAY_MS)).toEqual([
      "ai-held",
      "ai-held-by-channel-expiry",
    ])
  })
})
