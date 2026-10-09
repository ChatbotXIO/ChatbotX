import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const repository = vi.hoisted(() => ({
  listByWorkspace: vi.fn(),
  statsByDayAndChannel: vi.fn(),
  statsByAction: vi.fn(),
  confirmedValueByCurrency: vi.fn(),
  existsForWorkspace: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  googleAdsConversionEventRepository: repository,
}))
vi.mock("../src/google-ads/delivery", () => ({
  deliverGoogleAdsConversion: vi.fn(),
}))
vi.mock("../src/google-ads/housekeeping", () => ({
  pollGoogleAdsProcessingStatus: vi.fn(),
  sweepStrandedGoogleAdsEvents: vi.fn(),
  syncGoogleAdsSetups: vi.fn(),
}))
vi.mock("../src/google-ads/record-conversion", () => ({
  recordGoogleAdsConversion: vi.fn(),
}))
vi.mock("../src/google-ads/send-queue", () => ({ enqueueSend: vi.fn() }))

import { googleAdsConversionService } from "../src/google-ads/service"
import { googleAdsStatsResponse } from "../src/google-ads/stats-schema"

const zeroCounts = {
  pending: 0,
  sending: 0,
  sent: 0,
  processed: 0,
  failed: 0,
  skipped_no_account: 0,
  skipped_expired: 0,
}
const zeroFailures = {
  failedDelivery: 0,
  failedProcessing: 0,
  failedTimeout: 0,
  failedUnknown: 0,
}

const dayRow = (
  date: string,
  channel: string,
  overrides: Partial<typeof zeroCounts & typeof zeroFailures> = {},
) => ({ date, channel, ...zeroCounts, ...zeroFailures, ...overrides })

const actionRow = (
  conversionActionId: string,
  overrides: Partial<typeof zeroCounts> = {},
) => ({
  conversionActionId,
  name: `Action ${conversionActionId}`,
  category: "PURCHASE",
  ...zeroCounts,
  ...overrides,
})

const baseInput = {
  workspaceId: "ws-1",
  from: "2026-10-01",
  to: "2026-10-03",
  tz: "UTC",
}

const mockStats = (
  days: unknown[] = [],
  actions: unknown[] = [],
  values: unknown[] = [],
) => {
  repository.statsByDayAndChannel.mockResolvedValue(days)
  repository.statsByAction.mockResolvedValue(actions)
  repository.confirmedValueByCurrency.mockResolvedValue(values)
}

describe("googleAdsConversionService.getStats", () => {
  beforeEach(() => {
    for (const fn of Object.values(repository)) {
      fn.mockReset()
    }
    mockStats()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test("an empty workspace returns zeros, a null rate and one zero row per day", async () => {
    const stats = await googleAdsConversionService.getStats(baseInput)

    expect(stats.range).toEqual({
      from: "2026-10-01",
      to: "2026-10-03",
      tz: "UTC",
    })
    expect(stats.totals).toEqual({
      ...zeroCounts,
      total: 0,
      deliveryRate: null,
    })
    expect(stats.failuresByStage).toEqual({
      delivery: 0,
      processing: 0,
      timeout: 0,
      unknown: 0,
    })
    expect(stats.timeseries).toEqual([
      { date: "2026-10-01", counts: zeroCounts },
      { date: "2026-10-02", counts: zeroCounts },
      { date: "2026-10-03", counts: zeroCounts },
    ])
    expect(stats.byAction).toEqual([])
    expect(stats.byActionTruncated).toBe(false)
    expect(stats.byChannel).toEqual([])
    expect(stats.confirmedValue).toEqual([])
    expect(googleAdsStatsResponse.safeParse(stats).success).toBe(true)
  })

  test("a day with no events stays in the series with every status at 0", async () => {
    mockStats([dayRow("2026-10-02", "whatsapp", { processed: 4 })])

    const stats = await googleAdsConversionService.getStats(baseInput)

    expect(stats.timeseries.map((row) => row.date)).toEqual([
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
    ])
    expect(stats.timeseries[0].counts).toEqual(zeroCounts)
    expect(stats.timeseries[1].counts.processed).toBe(4)
    expect(stats.timeseries[2].counts).toEqual(zeroCounts)
  })

  test("totals, timeseries and byChannel are sums of the same day and channel rows", async () => {
    mockStats([
      dayRow("2026-10-01", "whatsapp", {
        processed: 5,
        failed: 2,
        failedDelivery: 1,
        failedUnknown: 1,
      }),
      dayRow("2026-10-01", "messenger", { processed: 1, pending: 3 }),
      dayRow("2026-10-03", "whatsapp", {
        sent: 2,
        skipped_expired: 4,
        failed: 1,
        failedTimeout: 1,
      }),
    ])

    const stats = await googleAdsConversionService.getStats(baseInput)

    const sum = (rows: { counts: Record<string, number> }[], key: string) =>
      rows.reduce((total, row) => total + row.counts[key], 0)
    for (const key of Object.keys(zeroCounts)) {
      const total = stats.totals[key as keyof typeof zeroCounts]
      expect(sum(stats.timeseries, key)).toBe(total)
      expect(sum(stats.byChannel, key)).toBe(total)
    }
    expect(stats.totals.total).toBe(5 + 2 + 1 + 3 + 2 + 4 + 1)
    expect(stats.byChannel.reduce((total, row) => total + row.total, 0)).toBe(
      stats.totals.total,
    )
    expect(stats.failuresByStage).toEqual({
      delivery: 1,
      processing: 0,
      timeout: 1,
      unknown: 1,
    })
    expect(
      Object.values(stats.failuresByStage).reduce((a, b) => a + b, 0),
    ).toBe(stats.totals.failed)
    expect(stats.byChannel.map((row) => row.channel)).toEqual([
      "whatsapp",
      "messenger",
    ])
  })

  test.each([
    { name: "no confirmed and no failed", counts: {}, expected: null },
    {
      name: "only skipped, queued and awaiting",
      counts: { skipped_expired: 3, pending: 2, sent: 1 },
      expected: null,
    },
    {
      name: "3 processed and 1 failed",
      counts: { processed: 3, failed: 1 },
      expected: 0.75,
    },
    { name: "only failed", counts: { failed: 2 }, expected: 0 },
    { name: "only processed", counts: { processed: 2 }, expected: 1 },
  ])("deliveryRate is $expected for $name", async ({ counts, expected }) => {
    mockStats([dayRow("2026-10-01", "whatsapp", counts)])

    const stats = await googleAdsConversionService.getStats(baseInput)

    expect(stats.totals.deliveryRate).toBe(expected)
  })

  test("confirmed value stays per currency and ignores events with no value", async () => {
    mockStats(
      [],
      [],
      [
        { currency: "USD", value: "1240.50", count: 96 },
        { currency: "VND", value: "3100000", count: 32 },
        { currency: null, value: "1", count: 1 },
      ],
    )

    const stats = await googleAdsConversionService.getStats(baseInput)

    expect(stats.confirmedValue).toEqual([
      { currency: "USD", value: "1240.50", count: 96 },
      { currency: "VND", value: "3100000", count: 32 },
    ])
  })

  test("filters reach all three queries and always carry the workspace", async () => {
    await googleAdsConversionService.getStats({
      ...baseInput,
      channel: "messenger",
      conversionActionId: "123",
    })

    expect(repository.statsByDayAndChannel).toHaveBeenCalledTimes(1)
    expect(repository.statsByAction).toHaveBeenCalledTimes(1)
    expect(repository.confirmedValueByCurrency).toHaveBeenCalledTimes(1)
    const expected = expect.objectContaining({
      workspaceId: "ws-1",
      channel: "messenger",
      conversionActionId: "123",
      since: new Date("2026-10-01T00:00:00.000Z"),
      until: new Date("2026-10-03T23:59:59.999Z"),
    })
    expect(repository.statsByDayAndChannel).toHaveBeenCalledWith(
      expected,
      "UTC",
    )
    expect(repository.statsByAction).toHaveBeenCalledWith(expected, 50)
    expect(repository.confirmedValueByCurrency).toHaveBeenCalledWith(expected)
  })

  test("the window and the day buckets use the resolved timezone", async () => {
    await googleAdsConversionService.getStats({
      ...baseInput,
      tz: "Asia/Ho_Chi_Minh",
    })

    const [filters, tz] = repository.statsByDayAndChannel.mock.calls[0]
    expect(tz).toBe("Asia/Ho_Chi_Minh")
    expect(filters.since).toEqual(new Date("2026-09-30T17:00:00.000Z"))
    expect(filters.until).toEqual(new Date("2026-10-03T16:59:59.999Z"))
  })

  test("empty from, to and tz resolve to the default UTC range", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-09T12:00:00.000Z"))

    const stats = await googleAdsConversionService.getStats({
      workspaceId: "ws-1",
      from: "",
      to: "",
      tz: "",
    })

    expect(stats.range).toEqual({
      from: "2026-10-03",
      to: "2026-10-09",
      tz: "UTC",
    })
    expect(stats.timeseries).toHaveLength(7)
  })

  test("omitted from, to and tz behave like empty ones", async () => {
    const stats = await googleAdsConversionService.getStats({
      workspaceId: "ws-1",
    })

    expect(stats.range.tz).toBe("UTC")
    expect(stats.timeseries).toHaveLength(7)
  })

  test("an unknown timezone falls back to UTC and is echoed", async () => {
    const stats = await googleAdsConversionService.getStats({
      ...baseInput,
      tz: "Mars/Olympus",
    })

    expect(stats.range.tz).toBe("UTC")
  })

  test("a lower-case timezone is canonicalised before the window and the SQL buckets use it", async () => {
    const stats = await googleAdsConversionService.getStats({
      ...baseInput,
      tz: "america/new_york",
    })

    expect(stats.range.tz).toBe("America/New_York")
    expect(repository.statsByDayAndChannel.mock.calls[0][1]).toBe(
      "America/New_York",
    )
  })

  test("an offset timezone is treated as UTC end to end", async () => {
    mockStats([dayRow("2026-10-01", "whatsapp", { processed: 2 })])

    const stats = await googleAdsConversionService.getStats({
      ...baseInput,
      tz: "+07:00",
    })

    expect(stats.range.tz).toBe("UTC")
    expect(repository.statsByDayAndChannel.mock.calls[0][1]).toBe("UTC")
    expect(stats.timeseries.map((row) => row.date)).toEqual([
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
    ])
    expect(stats.totals.processed).toBe(2)
  })

  test("a row outside the enumerated days is dropped from every block alike", async () => {
    mockStats([
      dayRow("2026-10-02", "whatsapp", { processed: 3 }),
      dayRow("2026-10-09", "messenger", { processed: 5, failed: 1 }),
    ])

    const stats = await googleAdsConversionService.getStats(baseInput)

    expect(stats.totals.processed).toBe(3)
    expect(stats.totals.failed).toBe(0)
    expect(
      stats.timeseries.reduce((total, row) => total + row.counts.processed, 0),
    ).toBe(3)
    expect(stats.byChannel.map((row) => row.channel)).toEqual(["whatsapp"])
    expect(stats.timeseries).toHaveLength(3)
  })

  test("an inverted range falls back and an oversized one is clamped to 366 days", async () => {
    const inverted = await googleAdsConversionService.getStats({
      ...baseInput,
      from: "2026-10-05",
      to: "2026-10-01",
    })
    expect(inverted.timeseries).toHaveLength(7)

    const oversized = await googleAdsConversionService.getStats({
      ...baseInput,
      from: "2020-01-01",
      to: "2026-10-03",
    })
    expect(oversized.range.to).toBe("2026-10-03")
    expect(oversized.timeseries).toHaveLength(366)
  })

  test("rejects an unknown channel and a non-numeric conversion action id", async () => {
    await expect(
      googleAdsConversionService.getStats({
        ...baseInput,
        channel: "telegram" as never,
      }),
    ).rejects.toThrow()
    await expect(
      googleAdsConversionService.getStats({
        ...baseInput,
        conversionActionId: "abc",
      }),
    ).rejects.toThrow()
    expect(repository.statsByDayAndChannel).not.toHaveBeenCalled()
  })

  test("a failing query fails the whole call and returns nothing partial", async () => {
    repository.statsByAction.mockRejectedValue(new Error("boom"))

    await expect(
      googleAdsConversionService.getStats(baseInput),
    ).rejects.toThrow("boom")
  })

  describe("byAction", () => {
    test("fewer than 50 actions is not truncated and keeps every status", async () => {
      mockStats(
        [],
        [
          actionRow("1", {
            processed: 3,
            failed: 1,
            sent: 2,
            skipped_expired: 1,
            pending: 1,
            sending: 1,
            skipped_no_account: 1,
          }),
          actionRow("2", { processed: 1 }),
        ],
      )

      const stats = await googleAdsConversionService.getStats(baseInput)

      expect(stats.byActionTruncated).toBe(false)
      expect(stats.byAction).toHaveLength(2)
      expect(stats.byAction[0]).toEqual({
        conversionActionId: "1",
        name: "Action 1",
        category: "PURCHASE",
        total: 10,
        counts: {
          pending: 1,
          sending: 1,
          sent: 2,
          processed: 3,
          failed: 1,
          skipped_no_account: 1,
          skipped_expired: 1,
        },
      })
    })

    test("exactly 50 actions is not truncated", async () => {
      mockStats(
        [],
        Array.from({ length: 50 }, (_, i) =>
          actionRow(String(i + 1), { processed: 1 }),
        ),
      )

      const stats = await googleAdsConversionService.getStats(baseInput)

      expect(stats.byAction).toHaveLength(50)
      expect(stats.byActionTruncated).toBe(false)
    })

    test("51 actions are cut to the first 50 in repository order and flagged", async () => {
      // The repository orders by volume then id, so equal volumes keep id order.
      const rows = Array.from({ length: 51 }, (_, i) =>
        actionRow(String(i + 1).padStart(3, "0"), { processed: 1 }),
      )
      mockStats([], rows)

      const stats = await googleAdsConversionService.getStats(baseInput)

      expect(stats.byActionTruncated).toBe(true)
      expect(stats.byAction).toHaveLength(50)
      expect(stats.byAction[0].conversionActionId).toBe("001")
      expect(stats.byAction[49].conversionActionId).toBe("050")
    })

    test("keeps a null name and category", async () => {
      mockStats(
        [],
        [{ ...actionRow("9", { processed: 1 }), name: null, category: null }],
      )

      const stats = await googleAdsConversionService.getStats(baseInput)

      expect(stats.byAction[0]).toMatchObject({ name: null, category: null })
    })
  })
})

describe("googleAdsConversionService.hasAnyEvent", () => {
  beforeEach(() => {
    repository.existsForWorkspace.mockReset()
  })

  test("wraps the workspace existence probe", async () => {
    repository.existsForWorkspace.mockResolvedValueOnce(true)
    await expect(googleAdsConversionService.hasAnyEvent("ws-1")).resolves.toBe(
      true,
    )
    expect(repository.existsForWorkspace).toHaveBeenCalledWith("ws-1")

    repository.existsForWorkspace.mockResolvedValueOnce(false)
    await expect(googleAdsConversionService.hasAnyEvent("ws-2")).resolves.toBe(
      false,
    )
  })
})
