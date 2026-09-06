import { PgDialect } from "drizzle-orm/pg-core"
import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// mac-partitions repository — DDL helpers for the schedule:maintain-mac-
// partitions cron. Mocks only db.execute (real `sql`/`sql.identifier`/`sql.raw`
// from drizzle-orm/pg-core via importOriginal), asserting the rendered SQL
// with `PgDialect().sqlToQuery` the same way broadcast-purge.test.ts does.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
}))

vi.mock("../src/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/client")>()
  return {
    ...actual,
    db: { execute: mocks.execute },
  }
})

const {
  partitionExists,
  createContactActiveMonthlyPartition,
  createContactActiveHourlyPartition,
  addUtcMonths,
  formatMonthlyPartitionName,
  formatUtcDate,
} = await import("../src/repositories/mac-partitions")

const dialect = new PgDialect()

function renderQuery(sqlArg: unknown): { text: string; params: unknown[] } {
  const { sql: text, params } = dialect.sqlToQuery(sqlArg as never)
  return { text: text.replace(/\s+/g, " ").trim(), params }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("partitionExists", () => {
  test("probes pg_class by relname, bound as a param", async () => {
    mocks.execute.mockResolvedValue({ rows: [{ exists: true }] })

    const result = await partitionExists("ContactActiveMonthly_2026")

    expect(result).toBe(true)
    const { text, params } = renderQuery(mocks.execute.mock.calls[0]?.[0])
    expect(text).toBe(
      'SELECT EXISTS (SELECT 1 FROM pg_class WHERE relname = $1) AS "exists"',
    )
    expect(params).toEqual(["ContactActiveMonthly_2026"])
  })

  test("returns false when the row is absent", async () => {
    mocks.execute.mockResolvedValue({ rows: [] })
    await expect(partitionExists("missing")).resolves.toBe(false)
  })
})

describe("createContactActiveMonthlyPartition", () => {
  test("skips creation when the partition already exists", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [{ exists: true }] })

    const result = await createContactActiveMonthlyPartition(2026)

    expect(result).toBe(false)
    expect(mocks.execute).toHaveBeenCalledTimes(1)
  })

  test("creates the yearly partition with FROM/TO date literals when absent", async () => {
    mocks.execute
      .mockResolvedValueOnce({ rows: [{ exists: false }] })
      .mockResolvedValueOnce({ rows: [] })

    const result = await createContactActiveMonthlyPartition(2026)

    expect(result).toBe(true)
    const { text } = renderQuery(mocks.execute.mock.calls[1]?.[0])
    expect(text).toBe(
      "CREATE TABLE IF NOT EXISTS \"ContactActiveMonthly_2026\" PARTITION OF \"ContactActiveMonthly\" FOR VALUES FROM ('2026-01-01') TO ('2027-01-01')",
    )
  })
})

describe("createContactActiveHourlyPartition", () => {
  test("skips creation when the monthly partition already exists", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [{ exists: true }] })

    const result = await createContactActiveHourlyPartition(
      new Date(Date.UTC(2026, 5, 1)),
    )

    expect(result).toBe(false)
    expect(mocks.execute).toHaveBeenCalledTimes(1)
  })

  test("creates the monthly partition spanning exactly one UTC month", async () => {
    mocks.execute
      .mockResolvedValueOnce({ rows: [{ exists: false }] })
      .mockResolvedValueOnce({ rows: [] })

    const result = await createContactActiveHourlyPartition(
      new Date(Date.UTC(2026, 5, 1)),
    )

    expect(result).toBe(true)
    const { text } = renderQuery(mocks.execute.mock.calls[1]?.[0])
    expect(text).toBe(
      "CREATE TABLE IF NOT EXISTS \"ContactActiveHourly_2026_06\" PARTITION OF \"ContactActiveHourly\" FOR VALUES FROM ('2026-06-01') TO ('2026-07-01')",
    )
  })
})

describe("date/name helpers", () => {
  test("addUtcMonths advances by whole UTC months, normalized to day 1", () => {
    const result = addUtcMonths(new Date(Date.UTC(2026, 11, 15)), 2)
    expect(result.toISOString()).toBe("2027-02-01T00:00:00.000Z")
  })

  test("formatMonthlyPartitionName zero-pads the month", () => {
    expect(formatMonthlyPartitionName(new Date(Date.UTC(2026, 0, 1)))).toBe(
      "ContactActiveHourly_2026_01",
    )
  })

  test("formatUtcDate renders YYYY-MM-01", () => {
    expect(formatUtcDate(new Date(Date.UTC(2026, 8, 20)))).toBe("2026-09-01")
  })
})
