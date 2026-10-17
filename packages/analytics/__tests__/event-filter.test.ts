import { describe, expect, test, vi } from "vitest"
import { renderSql } from "./helpers/fake-sql"

vi.mock("@chatbotx.io/database/client", async () => ({
  sql: (await import("./helpers/fake-sql")).fakeSql,
}))

const { buildEventFilter } = await import("../src/lib/event-filter")
const {
  analyticsFilterCacheKey,
  hasAnalyticsFilter,
  normalizeAnalyticsFilters,
  timeRangeQueryWithFilterSchema,
} = await import("../src/schemas/common")
const { contactsByDimensionQuerySchema } = await import(
  "../src/schemas/contact-stats"
)
const { shouldUseCagg } = await import("../src/lib/time-series")

const renderFilter = (filter: Parameters<typeof buildEventFilter>[0]) =>
  renderSql(buildEventFilter(filter))

describe("buildEventFilter", () => {
  test.each([
    ["undefined", undefined],
    ["empty arrays", { channels: [], inboxIds: [] }],
  ])("emits nothing for %s so unfiltered SQL is unchanged", (_name, filter) => {
    expect(renderFilter(filter)).toEqual({ text: "", params: [] })
  })

  test("binds channels as parameters, never inlines them", () => {
    const { text, params } = renderFilter({
      channels: ["whatsapp", "messenger"],
    })
    expect(text).toBe('AND "channel" IN (?, ?)')
    expect(params).toEqual(["messenger", "whatsapp"])
  })

  test("binds inbox ids as parameters", () => {
    const { text, params } = renderFilter({ inboxIds: ["9", "3"] })
    expect(text).toBe('AND "inboxId" IN (?, ?)')
    expect(params).toEqual(["3", "9"])
  })

  test("ANDs channels with inboxes and neutralizes injection payloads as data", () => {
    const { text, params } = renderFilter({
      channels: ["x'; DROP TABLE t;--" as "messenger"],
      inboxIds: ["1"],
    })
    expect(text).toBe('AND "channel" IN (?) AND "inboxId" IN (?)')
    expect(params).toEqual(["x'; DROP TABLE t;--", "1"])
  })
})

describe("analytics filter normalization", () => {
  test("dedupes and sorts without mutating the input", () => {
    const channels = ["whatsapp", "messenger", "whatsapp"]
    expect(normalizeAnalyticsFilters({ channels })).toEqual({
      channels: ["messenger", "whatsapp"],
      inboxIds: [],
    })
    expect(channels).toEqual(["whatsapp", "messenger", "whatsapp"])
  })

  test("absent and empty filters share one cache key", () => {
    expect(analyticsFilterCacheKey(undefined)).toBe(
      analyticsFilterCacheKey({ channels: [], inboxIds: [] }),
    )
    expect(analyticsFilterCacheKey({ channels: ["messenger"] })).not.toBe(
      analyticsFilterCacheKey({ inboxIds: ["messenger"] }),
    )
  })

  test("hasAnalyticsFilter is false for All", () => {
    expect(hasAnalyticsFilter(undefined)).toBe(false)
    expect(hasAnalyticsFilter({ channels: [], inboxIds: [] })).toBe(false)
    expect(hasAnalyticsFilter({ inboxIds: ["1"] })).toBe(true)
  })
})

describe("filter schemas", () => {
  const base = {
    from: "2026-10-01T00:00:00.000Z",
    to: "2026-10-07T00:00:00.000Z",
    workspaceId: "1",
  }

  test("filters are optional", () => {
    expect(timeRangeQueryWithFilterSchema.safeParse(base).success).toBe(true)
  })

  test("accepts known channels and rejects unknown ones", () => {
    expect(
      timeRangeQueryWithFilterSchema.safeParse({
        ...base,
        channels: ["messenger"],
        inboxIds: ["12"],
      }).success,
    ).toBe(true)
    expect(
      timeRangeQueryWithFilterSchema.safeParse({
        ...base,
        channels: ["not-a-channel"],
      }).success,
    ).toBe(false)
  })

  test("rejects inbox ids that overflow bigint", () => {
    expect(
      timeRangeQueryWithFilterSchema.safeParse({
        ...base,
        inboxIds: ["99999999999999999999"],
      }).success,
    ).toBe(false)
  })

  test("caps filter cardinality", () => {
    const atLimit = Array.from({ length: 200 }, (_, i) => String(i + 1))
    expect(
      timeRangeQueryWithFilterSchema.safeParse({ ...base, inboxIds: atLimit })
        .success,
    ).toBe(true)
    const inboxIds = Array.from({ length: 201 }, (_, i) => String(i + 1))
    expect(
      timeRangeQueryWithFilterSchema.safeParse({ ...base, inboxIds }).success,
    ).toBe(false)
  })

  test("contacts-by-dimension accepts language (new) and filters, still rejects total for language", () => {
    expect(
      contactsByDimensionQuerySchema.safeParse({
        ...base,
        dimension: "language",
        channels: ["messenger"],
      }).success,
    ).toBe(true)
    expect(
      contactsByDimensionQuerySchema.safeParse({
        ...base,
        dimension: "language",
        metric: "total",
      }).success,
    ).toBe(false)
  })
})

describe("contacts-by-dimension total with an inbox filter", () => {
  const wire = {
    from: "2026-10-01T00:00:00.000Z",
    to: "2026-10-07T00:00:00.000Z",
    workspaceId: "1",
    metric: "total",
    inboxIds: ["7"],
  }

  test("is supported for the channel dimension", () => {
    expect(
      contactsByDimensionQuerySchema.safeParse({
        ...wire,
        dimension: "channel",
      }).success,
    ).toBe(true)
  })

  test.each([
    "source",
    "country",
    "language",
  ])("is rejected for the %s dimension", (dimension) => {
    expect(
      contactsByDimensionQuerySchema.safeParse({ ...wire, dimension }).success,
    ).toBe(false)
  })

  test("source totals stay supported without an inbox filter", () => {
    expect(
      contactsByDimensionQuerySchema.safeParse({
        ...wire,
        inboxIds: undefined,
        dimension: "source",
      }).success,
    ).toBe(true)
  })
})

describe("shouldUseCagg", () => {
  const recent = {
    workspaceId: "1",
    from: new Date(Date.now() - 24 * 3600 * 1000),
    to: new Date(),
    timezone: "UTC",
  }

  test("uses the cagg for recent unfiltered ranges", () => {
    expect(shouldUseCagg(recent)).toBe(true)
  })

  test("falls back to the raw table when filtered", () => {
    expect(shouldUseCagg({ ...recent, channels: ["messenger"] })).toBe(false)
    expect(shouldUseCagg({ ...recent, inboxIds: ["1"] })).toBe(false)
  })

  test("empty filters keep the cagg", () => {
    expect(shouldUseCagg({ ...recent, channels: [], inboxIds: [] })).toBe(true)
  })
})
