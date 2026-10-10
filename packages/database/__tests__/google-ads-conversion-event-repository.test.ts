import { sql } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, test, vi } from "vitest"
import { googleAdsConversionEventRepository } from "../src/repositories/google-ads-conversion-event/repository"

const dialect = new PgDialect()

type Captured = { set?: Record<string, unknown>; whereSql?: string }

const writeTx = (result: unknown[]) => {
  const captured: Captured = {}
  const returning = vi.fn().mockResolvedValue(result)
  const where = vi.fn((condition: Parameters<PgDialect["sqlToQuery"]>[0]) => {
    captured.whereSql = dialect.sqlToQuery(condition).sql
    return { returning }
  })
  const set = vi.fn((values: Record<string, unknown>) => {
    captured.set = values
    return { where }
  })
  const update = vi.fn(() => ({ set }))
  return { tx: { update } as never, captured, returning }
}

describe("googleAdsConversionEventRepository leases", () => {
  test("claimForSending only claims a pending row of the job's generation", async () => {
    const { tx, captured } = writeTx([{ id: "1" }])

    const claimed = await googleAdsConversionEventRepository.claimForSending(
      { id: "1", workspaceId: "ws", attempt: 3, claimToken: "token" },
      tx,
    )

    expect(claimed).toEqual({ id: "1" })
    expect(captured.set).toMatchObject({
      status: "sending",
      claimToken: "token",
    })
    expect(captured.whereSql).toContain('"workspaceId" = $')
    expect(captured.whereSql).toContain('"status" = $')
    expect(captured.whereSql).toContain('"attempt" = $')
  })

  test("claimForSending returns null when nothing matched (stale generation)", async () => {
    const { tx } = writeTx([])

    await expect(
      googleAdsConversionEventRepository.claimForSending(
        { id: "1", workspaceId: "ws", attempt: 0, claimToken: "token" },
        tx,
      ),
    ).resolves.toBeNull()
  })

  test("finishSending is fenced by the claim token and clears the lease", async () => {
    const { tx, captured } = writeTx([{ id: "1" }])

    await googleAdsConversionEventRepository.finishSending(
      {
        id: "1",
        workspaceId: "ws",
        claimToken: "token",
        to: "sent",
        requestId: "req",
        sentAt: new Date("2026-10-05T00:00:00Z"),
        processingStatus: "processing",
      },
      tx,
    )

    expect(captured.set).toMatchObject({
      status: "sent",
      claimToken: null,
      claimedAt: null,
      requestId: "req",
      processingStatus: "processing",
    })
    expect(captured.whereSql).toContain('"claimToken" = $')
    expect(captured.whereSql).toContain('"status" = $')
  })

  test("releaseClaim moves to the next generation under the same token", async () => {
    const { tx, captured } = writeTx([{ id: "1" }])

    await googleAdsConversionEventRepository.releaseClaim(
      { id: "1", workspaceId: "ws", claimToken: "token", nextAttempt: 4 },
      tx,
    )

    expect(captured.set).toMatchObject({
      status: "pending",
      attempt: 4,
      claimToken: null,
    })
    expect(captured.whereSql).toContain('"claimToken" = $')
  })

  test("touchStranded bumps updatedAt only for the row's id, workspace, status and generation", async () => {
    const { tx, captured } = writeTx([])

    await googleAdsConversionEventRepository.touchStranded(
      { id: "1", workspaceId: "ws", status: "pending", attempt: 4 },
      tx,
    )

    expect(captured.set).toEqual({ updatedAt: expect.any(Date) })
    expect(captured.whereSql).toContain('"id" = $')
    expect(captured.whereSql).toContain('"workspaceId" = $')
    expect(captured.whereSql).toContain('"status" = $')
    expect(captured.whereSql).toContain('"attempt" = $')
  })

  test("redrive increments the generation and only matches the expected one", async () => {
    const { tx, captured } = writeTx([{ id: "1", attempt: 2 }])

    await googleAdsConversionEventRepository.redrive(
      {
        id: "1",
        workspaceId: "ws",
        fromStatuses: ["failed"],
        expectedAttempt: 1,
      },
      tx,
    )

    expect(captured.set).toMatchObject({
      status: "pending",
      attempt: 2,
      claimToken: null,
      failureStage: null,
      error: null,
      processingStatus: null,
    })
    expect(captured.set).toMatchObject({
      requestId: null,
      sentAt: null,
      processingCheckedAt: null,
      processingAttempts: 0,
      nextProcessingCheckAt: null,
    })
    // Only the "an upload may have left" stamp outlives a redrive.
    const detail = dialect.sqlToQuery(
      captured.set?.processingDetail as Parameters<PgDialect["sqlToQuery"]>[0],
    ).sql
    expect(detail).toContain("sendAttemptedAt")
    expect(detail).toContain("ELSE NULL")
    // The transport is pinned at record time and never changed by a redrive.
    expect(captured.set).not.toHaveProperty("uploadMethod")
    expect(captured.whereSql).toContain('"status" in ($')
    expect(captured.whereSql).toContain('"attempt" = $')
  })

  test("applyProcessingResult only updates a still-sent event", async () => {
    const { tx, captured } = writeTx([{ id: "1" }])

    await googleAdsConversionEventRepository.applyProcessingResult(
      {
        id: "1",
        workspaceId: "ws",
        to: "processed",
        processingStatus: "success",
        nextProcessingCheckAt: null,
        processingAttempts: 2,
        expectedRequestId: "req-1",
        expectedAttempt: 3,
      },
      tx,
    )

    expect(captured.set).toMatchObject({
      status: "processed",
      processingStatus: "success",
      nextProcessingCheckAt: null,
      processingAttempts: 2,
    })
    expect(captured.whereSql).toContain('"status" = $')
    expect(captured.whereSql).toContain('"workspaceId" = $')
    expect(captured.whereSql).toContain('"attempt" = $')
    expect(captured.whereSql).toContain('"requestId" = $')
  })

  test("applyProcessingResult fences a request-less event with IS NULL", async () => {
    const { tx, captured } = writeTx([])

    await googleAdsConversionEventRepository.applyProcessingResult(
      {
        id: "1",
        workspaceId: "ws",
        to: "sent",
        processingStatus: "unknown",
        nextProcessingCheckAt: null,
        processingAttempts: 1,
        expectedRequestId: null,
        expectedAttempt: 0,
      },
      tx,
    )

    expect(captured.whereSql).toContain('"requestId" is null')
    expect(captured.whereSql).toContain('"attempt" = $')
  })

  test("redrive fences on the request id only when one is given", async () => {
    const withRequest = writeTx([])
    await googleAdsConversionEventRepository.redrive(
      {
        id: "1",
        workspaceId: "ws",
        fromStatuses: ["sent"],
        expectedAttempt: 1,
        expectedRequestId: "req-1",
      },
      withRequest.tx,
    )
    expect(withRequest.captured.whereSql).toContain('"requestId" = $')

    const without = writeTx([])
    await googleAdsConversionEventRepository.redrive(
      {
        id: "1",
        workspaceId: "ws",
        fromStatuses: ["failed"],
        expectedAttempt: 1,
      },
      without.tx,
    )
    expect(without.captured.whereSql).not.toContain('"requestId"')
  })
})

type ReadCapture = { whereSql?: string; orderSql?: string; limit?: number }

const readTx = (rows: unknown[]) => {
  const captured: ReadCapture = {}
  const offset = vi.fn().mockResolvedValue(rows)
  const limit = vi.fn((value: number) => {
    captured.limit = value
    return Object.assign(Promise.resolve(rows), { offset })
  })
  const orderBy = vi.fn(
    (...orders: Parameters<PgDialect["sqlToQuery"]>[0][]) => {
      captured.orderSql = orders.map((o) => dialect.sqlToQuery(o).sql).join(",")
      return { limit }
    },
  )
  const where = vi.fn((condition: Parameters<PgDialect["sqlToQuery"]>[0]) => {
    captured.whereSql = dialect.sqlToQuery(condition).sql
    return { orderBy, limit }
  })
  const from = vi.fn(() => ({ where }))
  const select = vi.fn(() => ({ from }))
  const $count = vi.fn().mockResolvedValue(rows.length)
  return { tx: { select, $count } as never, captured, offset }
}

describe("googleAdsConversionEventRepository reads", () => {
  test("listByWorkspace filters by workspace and clamps perPage", async () => {
    const { tx, captured, offset } = readTx([{ id: "1" }])

    const result = await googleAdsConversionEventRepository.listByWorkspace(
      {
        workspaceId: "ws",
        status: "failed",
        channel: "messenger",
        since: new Date("2026-10-01T00:00:00Z"),
        until: new Date("2026-10-02T00:00:00Z"),
        page: 3,
        perPage: 5000,
      },
      tx,
    )

    expect(result).toEqual({ rows: [{ id: "1" }], total: 1 })
    expect(captured.limit).toBe(100)
    expect(offset).toHaveBeenCalledWith(200)
    expect(captured.whereSql).toContain('"workspaceId" = $')
    expect(captured.whereSql).toContain('"status" = $')
    expect(captured.whereSql).toContain('"channel" = $')
    expect(captured.whereSql).toContain('"occurredAt" >= $')
    expect(captured.whereSql).toContain('"occurredAt" <= $')
  })

  test("listDueForProcessingCheck selects due sent events oldest first", async () => {
    const { tx, captured } = readTx([])

    await googleAdsConversionEventRepository.listDueForProcessingCheck(
      { now: new Date("2026-10-05T00:00:00Z"), limit: 50 },
      tx,
    )

    expect(captured.whereSql).toContain('"status" = $')
    expect(captured.whereSql).toContain('"nextProcessingCheckAt" <= $')
    expect(captured.whereSql).not.toContain('"nextProcessingCheckAt" > $')
    expect(captured.orderSql).toContain("nextProcessingCheckAt")
    expect(captured.limit).toBe(50)
  })

  test("listStranded runs separate, separately limited queries for sending and pending rows", async () => {
    const wheres: string[] = []
    const orders: string[] = []
    const limits: number[] = []
    const results = [[{ id: "s1" }], [{ id: "p1" }, { id: "p2" }]]
    const select = vi.fn(() => {
      const rows = results[wheres.length] ?? []
      return {
        from: () => ({
          where: (condition: Parameters<PgDialect["sqlToQuery"]>[0]) => {
            wheres.push(dialect.sqlToQuery(condition).sql)
            return {
              orderBy: (order: Parameters<PgDialect["sqlToQuery"]>[0]) => {
                orders.push(dialect.sqlToQuery(order).sql)
                return {
                  limit: (value: number) => {
                    limits.push(value)
                    return Promise.resolve(rows)
                  },
                }
              },
            }
          },
        }),
      }
    })

    const rows = await googleAdsConversionEventRepository.listStranded(
      {
        pendingOlderThan: new Date(),
        sixHourGateBefore: new Date(),
        sendingOlderThan: new Date(),
        limit: 10,
      },
      { select } as never,
    )

    expect(select).toHaveBeenCalledTimes(2)
    expect(limits).toEqual([10, 10])
    expect(wheres[0]).toContain('"status" = $')
    expect(wheres[0]).toContain('"claimedAt" < $')
    expect(wheres[0]).not.toContain('"googleClickReceivedAt"')
    expect(orders[0]).toContain("claimedAt")
    expect(wheres[1]).toContain('"updatedAt" < $')
    expect(wheres[1]).toContain('"googleClickReceivedAt" < $')
    expect(wheres[1]).not.toContain('"claimedAt"')
    expect(orders[1]).toContain("updatedAt")
    expect(rows.map((row) => row.id)).toEqual(["s1", "p1", "p2"])
  })
})

describe("googleAdsConversionEventRepository.insertIgnoreDuplicate", () => {
  test("targets the (workspaceId, transactionId) unique index and maps a conflict to null", async () => {
    const returning = vi.fn().mockResolvedValue([])
    const onConflictDoNothing = vi.fn(() => ({ returning }))
    const values = vi.fn(() => ({ onConflictDoNothing }))
    const tx = { insert: vi.fn(() => ({ values })) } as never

    const row = await googleAdsConversionEventRepository.insertIgnoreDuplicate(
      { transactionId: "t", options: { version: 1 } } as never,
      tx,
    )

    expect(row).toBeNull()
    const [{ target }] = onConflictDoNothing.mock.calls[0] as unknown as [
      { target: { name: string }[] },
    ]
    expect(target.map((column) => column.name)).toEqual([
      "workspaceId",
      "transactionId",
    ])
  })

  test("writes the options snapshot with the row", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "1" }])
    const values = vi.fn(() => ({
      onConflictDoNothing: vi.fn(() => ({ returning })),
    }))
    const tx = { insert: vi.fn(() => ({ values })) } as never
    const options = { version: 1, marker: "snapshot" }

    await googleAdsConversionEventRepository.insertIgnoreDuplicate(
      { transactionId: "t", options } as never,
      tx,
    )

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ transactionId: "t", options }),
    )
  })
})

describe("googleAdsConversionEventRepository direct completion (C6)", () => {
  const completion = {
    id: "1",
    workspaceId: "ws",
    claimToken: "token",
    attempt: 4,
    requestId: "legacy:42",
    sentAt: new Date("2026-10-07T00:00:00Z"),
    processingDetail: {
      requestStatus: "LEGACY_UPLOAD_COMPLETED",
      recordCount: 1,
      errorCounts: [],
      warningCounts: [],
    },
  }

  test("finishSendingProcessed writes the whole terminal state in one fenced update", async () => {
    const { tx, captured } = writeTx([{ id: "1" }])

    const done =
      await googleAdsConversionEventRepository.finishSendingProcessed(
        completion,
        tx,
      )

    expect(done).toEqual({ id: "1" })
    expect(captured.set).toMatchObject({
      status: "processed",
      processingStatus: "success",
      requestId: "legacy:42",
      sentAt: completion.sentAt,
      processingAttempts: 1,
      claimToken: null,
      claimedAt: null,
      error: null,
      failureStage: null,
      nextProcessingCheckAt: null,
    })
    expect(captured.set?.processingCheckedAt).toBeInstanceOf(Date)
    expect(captured.whereSql).toContain('"status" = $')
    expect(captured.whereSql).toContain('"claimToken" = $')
    expect(captured.whereSql).toContain('"attempt" = $')
    expect(captured.whereSql).toContain('"workspaceId" = $')
  })

  test("finishSendingProcessed returns null when the lease is gone", async () => {
    const { tx } = writeTx([])

    await expect(
      googleAdsConversionEventRepository.finishSendingProcessed(completion, tx),
    ).resolves.toBeNull()
  })

  test("markSendAttempted is fenced by lease and generation", async () => {
    const { tx, captured } = writeTx([{ id: "1" }])

    await googleAdsConversionEventRepository.markSendAttempted(
      {
        id: "1",
        workspaceId: "ws",
        claimToken: "token",
        attempt: 4,
        at: new Date(),
      },
      tx,
    )

    expect(captured.whereSql).toContain('"claimToken" = $')
    expect(captured.whereSql).toContain('"attempt" = $')
    expect(captured.whereSql).toContain('"status" = $')
  })
})

type SqlLike = Parameters<PgDialect["sqlToQuery"]>[0]

/** Renders a column or SQL chunk (group-by and order-by accept both). */
const render = (chunk: SqlLike): string => dialect.sqlToQuery(sql`${chunk}`).sql

type StatsCapture = {
  fields?: Record<string, SqlLike>
  whereSql?: string
  whereParams?: unknown[]
  groupBySql?: string[]
  orderSql?: string[]
  limit?: number
}

/** Fake `select().from().where().groupBy().orderBy().limit()` chain that records each stage. */
const statsTx = (rows: unknown[]) => {
  const captured: StatsCapture = {}
  const done = Object.assign(Promise.resolve(rows), {
    limit: (value: number) => {
      captured.limit = value
      return Promise.resolve(rows)
    },
  })
  const orderBy = vi.fn((...orders: SqlLike[]) => {
    captured.orderSql = orders.map(render)
    return done
  })
  const groupBy = vi.fn((...groups: SqlLike[]) => {
    captured.groupBySql = groups.map(render)
    return Object.assign(Promise.resolve(rows), { orderBy })
  })
  const where = vi.fn((condition: SqlLike) => {
    const query = dialect.sqlToQuery(condition)
    captured.whereSql = query.sql
    captured.whereParams = query.params
    return Object.assign(Promise.resolve(rows), { groupBy, limit: done.limit })
  })
  const from = vi.fn(() => ({ where }))
  const select = vi.fn((fields: Record<string, SqlLike>) => {
    captured.fields = fields
    return { from }
  })
  return { tx: { select } as never, captured }
}

const window = {
  workspaceId: "ws-1",
  since: new Date("2026-10-01T00:00:00Z"),
  until: new Date("2026-10-07T23:59:59.999Z"),
}

describe("googleAdsConversionEventRepository stats", () => {
  test("statsByDayAndChannel puts the date first, groups by ordinal and channel, counts every status and stage", async () => {
    const { tx, captured } = statsTx([])

    await googleAdsConversionEventRepository.statsByDayAndChannel(
      window,
      "Asia/Ho_Chi_Minh",
      tx,
    )

    const keys = Object.keys(captured.fields ?? {})
    expect(keys[0]).toBe("date")
    expect(keys).toEqual(
      expect.arrayContaining([
        "channel",
        "pending",
        "sending",
        "sent",
        "processed",
        "failed",
        "skipped_no_account",
        "skipped_expired",
        "failedDelivery",
        "failedProcessing",
        "failedTimeout",
        "failedUnknown",
      ]),
    )
    expect(captured.groupBySql?.[0]).toBe("1")
    expect(captured.groupBySql).toHaveLength(2)
    expect(captured.groupBySql?.[1]).toContain('"channel"')
    const failedUnknown = render(captured.fields?.failedUnknown as SqlLike)
    expect(failedUnknown).toContain("FILTER (WHERE")
    expect(failedUnknown).toContain('"failureStage" is null')
  })

  test("every stats read is workspace scoped and bounded by the window", async () => {
    const day = statsTx([])
    await googleAdsConversionEventRepository.statsByDayAndChannel(
      window,
      "UTC",
      day.tx,
    )
    const action = statsTx([])
    await googleAdsConversionEventRepository.statsByAction(
      window,
      50,
      action.tx,
    )
    const value = statsTx([])
    await googleAdsConversionEventRepository.confirmedValueByCurrency(
      window,
      value.tx,
    )

    for (const { captured } of [day, action, value]) {
      expect(captured.whereSql).toContain('"workspaceId" = $')
      expect(captured.whereSql).toContain('"occurredAt" >= $')
      expect(captured.whereSql).toContain('"occurredAt" <= $')
      expect(captured.whereParams).toContain("ws-1")
      expect(captured.whereSql).not.toContain('"channel" = $')
      expect(captured.whereSql).not.toContain('"conversionActionId" = $')
    }
  })

  test("optional channel and conversionActionId narrow the window", async () => {
    const { tx, captured } = statsTx([])

    await googleAdsConversionEventRepository.statsByDayAndChannel(
      { ...window, channel: "whatsapp", conversionActionId: "123" },
      "UTC",
      tx,
    )

    expect(captured.whereSql).toContain('"workspaceId" = $')
    expect(captured.whereSql).toContain('"channel" = $')
    expect(captured.whereSql).toContain('"conversionActionId" = $')
    expect(captured.whereParams).toEqual(
      expect.arrayContaining(["ws-1", "whatsapp", "123"]),
    )
  })

  test("statsByAction groups by action, orders by volume then id and asks for one extra row", async () => {
    const { tx, captured } = statsTx([{ conversionActionId: "1" }])

    const rows = await googleAdsConversionEventRepository.statsByAction(
      window,
      50,
      tx,
    )

    expect(rows).toEqual([{ conversionActionId: "1" }])
    expect(captured.groupBySql?.[0]).toContain('"conversionActionId"')
    expect(captured.orderSql?.[0]).toContain("count(*) DESC")
    expect(captured.orderSql?.[1]).toContain('"conversionActionId"')
    expect(captured.limit).toBe(51)
    const name = render(captured.fields?.name as SqlLike)
    expect(name).toContain("array_agg(")
    expect(name).toContain(
      'ORDER BY "GoogleAdsConversionEvent"."occurredAt" DESC',
    )
    expect(captured.fields).toHaveProperty("category")
  })

  test("confirmedValueByCurrency only sums processed events that carry a value", async () => {
    const { tx, captured } = statsTx([])

    await googleAdsConversionEventRepository.confirmedValueByCurrency(
      window,
      tx,
    )

    expect(captured.whereSql).toContain('"status" = $')
    expect(captured.whereSql).toContain('"value" is not null')
    expect(captured.groupBySql?.[0]).toContain('"currency"')
    const value = render(captured.fields?.value as SqlLike)
    expect(value).toContain("sum(")
    expect(value).toContain("::text")
  })

  test("existsForWorkspace is a workspace scoped LIMIT 1 probe", async () => {
    const { tx, captured } = statsTx([{ one: 1 }])

    await expect(
      googleAdsConversionEventRepository.existsForWorkspace("ws-1", tx),
    ).resolves.toBe(true)
    expect(captured.whereSql).toContain('"workspaceId" = $')
    expect(captured.limit).toBe(1)

    const empty = statsTx([])
    await expect(
      googleAdsConversionEventRepository.existsForWorkspace("ws-2", empty.tx),
    ).resolves.toBe(false)
  })

  test("listByWorkspace accepts a conversionActionId filter", async () => {
    const { tx, captured } = readTx([])

    await googleAdsConversionEventRepository.listByWorkspace(
      { workspaceId: "ws", conversionActionId: "123", page: 1, perPage: 10 },
      tx,
    )

    expect(captured.whereSql).toContain('"conversionActionId" = $')
  })
})
