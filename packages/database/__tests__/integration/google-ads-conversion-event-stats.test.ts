// @vitest-environment node

/**
 * The stats reads against a real PostgreSQL: the date bucketing (ordinal
 * group-by, DST zones), the FILTER counts, the latest-snapshot aggregates and
 * the decimal sum cannot be proven by asserting the generated SQL text.
 *
 * Every case runs in a transaction that is rolled back. Skipped unless
 * `DATABASE_URL` points at a reachable database; run it with
 * `pnpm --filter @chatbotx.io/database test:db`.
 */

import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { DatabaseClient } from "../../src/client"
import type { GoogleAdsFailureStage } from "../../src/partials/google-ads"
import { relations } from "../../src/relations"
import { googleAdsConversionEventRepository as repository } from "../../src/repositories/google-ads-conversion-event/repository"
// biome-ignore lint/performance/noNamespaceImport: mirrors how src/client.ts builds the db
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()

class RollbackSignal extends Error {}

const withRolledBackTransaction = async (
  db: DatabaseClient,
  fn: (tx: DatabaseClient) => Promise<void>,
): Promise<void> => {
  try {
    await db.transaction(async (tx) => {
      await fn(tx)
      throw new RollbackSignal()
    })
  } catch (error) {
    if (!(error instanceof RollbackSignal)) {
      throw error
    }
  }
}

const seedWorkspace = async (tx: DatabaseClient) => {
  const suffix = `${Date.now()}-${Math.random()}`
  const [owner] = await tx
    .insert(schema.userModel)
    .values({ email: `google-ads-stats-${suffix}@example.test` })
    .returning({ id: schema.userModel.id })
  const [workspace] = await tx
    .insert(schema.workspaceModel)
    .values({ name: `google-ads-stats-${suffix}`, ownerId: owner.id })
    .returning({ id: schema.workspaceModel.id })
  return workspace.id
}

const options = {
  version: 1 as const,
  identity: {
    version: 1 as const,
    configuredPolicy: "click" as const,
    effectivePolicy: "click" as const,
    keySource: "click" as const,
    id: null,
  },
  timeSource: "recorded" as const,
  consent: {
    adUserData: { status: null, source: "notProvided" as const },
    adPersonalization: { status: null, source: "notProvided" as const },
  },
}

type EventOverrides = Partial<
  typeof schema.googleAdsConversionEventModel.$inferInsert
>

let sequence = 0

/** Inserts one event; `sent`/`processed` rows get the request the CHECK demands. */
const insertEvent = async (
  tx: DatabaseClient,
  workspaceId: string,
  overrides: EventOverrides = {},
) => {
  sequence += 1
  const status = overrides.status ?? "processed"
  const sentLike = status === "sent" || status === "processed"
  await tx.insert(schema.googleAdsConversionEventModel).values({
    workspaceId,
    customerId: "1234567890",
    conversionCustomerId: "1234567890",
    conversionActionId: "111",
    conversionActionName: "Purchase",
    conversionActionCategory: "PURCHASE",
    channel: "whatsapp",
    source: "flowStep",
    scopeId: "step-1",
    clickIdType: "gclid",
    clickId: "ABCDEFGHIJKLMNOP",
    googleClickReceivedAt: new Date("2026-10-01T00:00:00Z"),
    occurredAt: new Date("2026-10-02T12:00:00Z"),
    transactionId: `stats-${sequence}-${Math.random()}`,
    options,
    uploadMethod: "dataManager",
    status,
    attempt: 0,
    processingAttempts: 0,
    requestId: sentLike ? `req-${sequence}` : null,
    sentAt: sentLike ? new Date("2026-10-02T12:00:00Z") : null,
    ...overrides,
  })
}

const window = {
  since: new Date("2026-10-01T00:00:00Z"),
  until: new Date("2026-10-07T23:59:59.999Z"),
}

describe.skipIf(!databaseUrl)("GoogleAdsConversionEvent stats", () => {
  let client: Client
  let db: DatabaseClient

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl ?? undefined })
    await client.connect()
    db = drizzle({ client, schema, relations })
  })

  afterAll(async () => {
    await client.end()
  })

  test("the date is the first selected column and rows are grouped per day and channel", () =>
    withRolledBackTransaction(db, async (tx) => {
      const workspaceId = await seedWorkspace(tx)
      await insertEvent(tx, workspaceId)
      await insertEvent(tx, workspaceId, { channel: "messenger" })
      await insertEvent(tx, workspaceId, {
        occurredAt: new Date("2026-10-03T12:00:00Z"),
      })

      const rows = await repository.statsByDayAndChannel(
        { workspaceId, ...window },
        "UTC",
        tx,
      )

      expect(Object.keys(rows[0])[0]).toBe("date")
      expect(
        rows.map((row) => `${row.date}/${row.channel}/${row.processed}`).sort(),
      ).toEqual([
        "2026-10-02/messenger/1",
        "2026-10-02/whatsapp/1",
        "2026-10-03/whatsapp/1",
      ])
    }))

  test("a back-dated event outside the window is excluded and the bounds are inclusive", () =>
    withRolledBackTransaction(db, async (tx) => {
      const workspaceId = await seedWorkspace(tx)
      await insertEvent(tx, workspaceId, {
        occurredAt: new Date("2026-09-30T23:59:59.999Z"),
      })
      await insertEvent(tx, workspaceId, { occurredAt: window.since })
      await insertEvent(tx, workspaceId, { occurredAt: window.until })
      await insertEvent(tx, workspaceId, {
        occurredAt: new Date("2026-10-08T00:00:00Z"),
      })

      const rows = await repository.statsByDayAndChannel(
        { workspaceId, ...window },
        "UTC",
        tx,
      )

      expect(rows.reduce((total, row) => total + row.processed, 0)).toBe(2)
      expect(rows.map((row) => row.date).sort()).toEqual([
        "2026-10-01",
        "2026-10-07",
      ])
    }))

  test("counts every status and each failure stage, and the stages add up to failed", () =>
    withRolledBackTransaction(db, async (tx) => {
      const workspaceId = await seedWorkspace(tx)
      const failed = (failureStage: GoogleAdsFailureStage | null) =>
        insertEvent(tx, workspaceId, { status: "failed", failureStage })
      await failed("delivery")
      await failed("delivery")
      await failed("processing")
      await failed("timeout")
      await failed(null)
      await insertEvent(tx, workspaceId, { status: "pending" })
      await insertEvent(tx, workspaceId, {
        status: "sending",
        claimToken: "token",
        claimedAt: new Date(),
      })
      await insertEvent(tx, workspaceId, { status: "sent" })
      await insertEvent(tx, workspaceId, { status: "skipped_no_account" })
      await insertEvent(tx, workspaceId, { status: "skipped_expired" })

      const [row] = await repository.statsByDayAndChannel(
        { workspaceId, ...window },
        "UTC",
        tx,
      )

      expect(row).toMatchObject({
        pending: 1,
        sending: 1,
        sent: 1,
        processed: 0,
        failed: 5,
        skipped_no_account: 1,
        skipped_expired: 1,
        failedDelivery: 2,
        failedProcessing: 1,
        failedTimeout: 1,
        failedUnknown: 1,
      })
      expect(
        row.failedDelivery +
          row.failedProcessing +
          row.failedTimeout +
          row.failedUnknown,
      ).toBe(row.failed)
    }))

  test("a day boundary follows the timezone, including Ho Chi Minh and a DST zone", () =>
    withRolledBackTransaction(db, async (tx) => {
      const workspaceId = await seedWorkspace(tx)
      // 17:30Z on the 2nd is already the 3rd at UTC+7.
      await insertEvent(tx, workspaceId, {
        occurredAt: new Date("2026-10-02T17:30:00Z"),
      })
      const filters = { workspaceId, ...window }

      const utc = await repository.statsByDayAndChannel(filters, "UTC", tx)
      const saigon = await repository.statsByDayAndChannel(
        filters,
        "Asia/Ho_Chi_Minh",
        tx,
      )
      // The legacy spelling a browser can still report.
      const legacy = await repository.statsByDayAndChannel(
        filters,
        "Asia/Saigon",
        tx,
      )

      expect(utc.map((row) => row.date)).toEqual(["2026-10-02"])
      expect(saigon.map((row) => row.date)).toEqual(["2026-10-03"])
      expect(legacy.map((row) => row.date)).toEqual(["2026-10-03"])
    }))

  test("the DST day in New York is bucketed by local midnight", () =>
    withRolledBackTransaction(db, async (tx) => {
      const workspaceId = await seedWorkspace(tx)
      // Spring forward 2026-03-08: EST until 07:00Z, EDT after.
      const instants = [
        "2026-03-08T04:59:59Z", // 23:59:59 EST on the 7th
        "2026-03-08T05:00:00Z", // 00:00:00 EST on the 8th
        "2026-03-09T03:59:59Z", // 23:59:59 EDT on the 8th (a 23-hour day)
        "2026-03-09T04:00:00Z", // 00:00:00 EDT on the 9th
      ]
      for (const instant of instants) {
        await insertEvent(tx, workspaceId, { occurredAt: new Date(instant) })
      }

      const rows = await repository.statsByDayAndChannel(
        {
          workspaceId,
          since: new Date("2026-03-01T00:00:00Z"),
          until: new Date("2026-03-20T00:00:00Z"),
        },
        "America/New_York",
        tx,
      )

      expect(
        Object.fromEntries(rows.map((row) => [row.date, row.processed])),
      ).toEqual({ "2026-03-07": 1, "2026-03-08": 2, "2026-03-09": 1 })
    }))

  test("another workspace's events are never counted", () =>
    withRolledBackTransaction(db, async (tx) => {
      const workspaceA = await seedWorkspace(tx)
      const workspaceB = await seedWorkspace(tx)
      await insertEvent(tx, workspaceA, { value: "10", currency: "USD" })
      await insertEvent(tx, workspaceB, { value: "99", currency: "USD" })
      await insertEvent(tx, workspaceB, { conversionActionId: "222" })

      const filters = { workspaceId: workspaceA, ...window }
      const days = await repository.statsByDayAndChannel(filters, "UTC", tx)
      const actions = await repository.statsByAction(filters, 50, tx)
      const values = await repository.confirmedValueByCurrency(filters, tx)

      expect(days.reduce((total, row) => total + row.processed, 0)).toBe(1)
      expect(actions.map((row) => row.conversionActionId)).toEqual(["111"])
      expect(values).toEqual([{ currency: "USD", value: "10", count: 1 }])
    }))

  test("a renamed conversion action shows its latest name and category", () =>
    withRolledBackTransaction(db, async (tx) => {
      const workspaceId = await seedWorkspace(tx)
      await insertEvent(tx, workspaceId, {
        conversionActionName: "Old name",
        conversionActionCategory: "PURCHASE",
        occurredAt: new Date("2026-10-02T10:00:00Z"),
      })
      await insertEvent(tx, workspaceId, {
        conversionActionName: "New name",
        conversionActionCategory: "QUALIFIED_LEAD",
        occurredAt: new Date("2026-10-04T10:00:00Z"),
      })

      const [row] = await repository.statsByAction(
        { workspaceId, ...window },
        50,
        tx,
      )

      expect(row).toMatchObject({
        conversionActionId: "111",
        name: "New name",
        category: "QUALIFIED_LEAD",
        processed: 2,
      })
    }))

  test("actions are ordered by volume then id, and limit + 1 rows are returned", () =>
    withRolledBackTransaction(db, async (tx) => {
      const workspaceId = await seedWorkspace(tx)
      await insertEvent(tx, workspaceId, { conversionActionId: "300" })
      await insertEvent(tx, workspaceId, { conversionActionId: "200" })
      await insertEvent(tx, workspaceId, { conversionActionId: "100" })
      await insertEvent(tx, workspaceId, { conversionActionId: "300" })

      const rows = await repository.statsByAction(
        { workspaceId, ...window },
        2,
        tx,
      )

      expect(rows.map((row) => row.conversionActionId)).toEqual([
        "300",
        "100",
        "200",
      ])
    }))

  test("channel and conversion action filters narrow every read", () =>
    withRolledBackTransaction(db, async (tx) => {
      const workspaceId = await seedWorkspace(tx)
      await insertEvent(tx, workspaceId)
      await insertEvent(tx, workspaceId, { channel: "messenger" })
      await insertEvent(tx, workspaceId, { conversionActionId: "222" })

      const rows = await repository.statsByDayAndChannel(
        {
          workspaceId,
          ...window,
          channel: "whatsapp",
          conversionActionId: "111",
        },
        "UTC",
        tx,
      )

      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ channel: "whatsapp", processed: 1 })
    }))

  test("confirmed value is an exact decimal sum per currency over processed events only", () =>
    withRolledBackTransaction(db, async (tx) => {
      const workspaceId = await seedWorkspace(tx)
      await insertEvent(tx, workspaceId, { value: "0.1", currency: "USD" })
      await insertEvent(tx, workspaceId, { value: "0.2", currency: "USD" })
      await insertEvent(tx, workspaceId, { value: "1000.505", currency: "VND" })
      // Not confirmed, or no value: neither adds anything.
      await insertEvent(tx, workspaceId, {
        status: "failed",
        value: "500",
        currency: "USD",
      })
      await insertEvent(tx, workspaceId, {
        status: "sent",
        value: "7",
        currency: "USD",
      })
      await insertEvent(tx, workspaceId)

      const rows = await repository.confirmedValueByCurrency(
        { workspaceId, ...window },
        tx,
      )

      expect(rows).toEqual([
        { currency: "USD", value: "0.3", count: 2 },
        { currency: "VND", value: "1000.505", count: 1 },
      ])
    }))

  test("existsForWorkspace is true only for a workspace with events, whatever their date", () =>
    withRolledBackTransaction(db, async (tx) => {
      const withEvents = await seedWorkspace(tx)
      const empty = await seedWorkspace(tx)
      await insertEvent(tx, withEvents, {
        occurredAt: new Date("2020-01-01T00:00:00Z"),
      })

      await expect(repository.existsForWorkspace(withEvents, tx)).resolves.toBe(
        true,
      )
      await expect(repository.existsForWorkspace(empty, tx)).resolves.toBe(
        false,
      )
    }))

  test("listByWorkspace filters by conversion action", () =>
    withRolledBackTransaction(db, async (tx) => {
      const workspaceId = await seedWorkspace(tx)
      await insertEvent(tx, workspaceId)
      await insertEvent(tx, workspaceId, { conversionActionId: "222" })

      const { rows, total } = await repository.listByWorkspace(
        { workspaceId, conversionActionId: "222", page: 1, perPage: 10 },
        tx,
      )

      expect(total).toBe(1)
      expect(rows[0]?.conversionActionId).toBe("222")
    }))
})
