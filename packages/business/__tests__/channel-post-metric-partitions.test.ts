import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  countDefaultRows: vi.fn(),
  createPartition: vi.fn(),
  deleteDefaultRowsBefore: vi.fn(),
  listDefaultMonths: vi.fn(),
  dropPartition: vi.fn(),
  listPartitions: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  addUtcMonths: (date: Date, months: number) =>
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1)),
  channelPostMetricRepository: {
    countDefaultRows: mocks.countDefaultRows,
    createPartition: mocks.createPartition,
    deleteDefaultRowsBefore: mocks.deleteDefaultRowsBefore,
    listDefaultMonths: mocks.listDefaultMonths,
    dropPartition: mocks.dropPartition,
    listPartitions: mocks.listPartitions,
  },
}))
const log = vi.hoisted(() => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }))
vi.mock("../src/logger", () => ({ logger: log }))

const { maintainChannelPostMetricPartitions } = await import(
  "../src/post-analytics/partitions"
)

const month = (year: number, monthIndex: number) => ({
  monthStart: new Date(Date.UTC(year, monthIndex, 1)),
  name: `ChannelPostMetricDaily_${year}_${String(monthIndex + 1).padStart(2, "0")}`,
})

const NOW = new Date("2026-11-24T08:00:00Z")

beforeEach(() => {
  vi.clearAllMocks()
  mocks.createPartition.mockResolvedValue(false)
  mocks.countDefaultRows.mockResolvedValue(0)
  mocks.deleteDefaultRowsBefore.mockResolvedValue(0)
  mocks.listDefaultMonths.mockResolvedValue([])
  mocks.listPartitions.mockResolvedValue([
    month(2024, 8),
    month(2024, 9),
    month(2024, 10),
    month(2026, 10),
  ])
})

describe("maintainChannelPostMetricPartitions", () => {
  test("creates the previous month, the current month and two ahead", async () => {
    await maintainChannelPostMetricPartitions(NOW)
    expect(
      mocks.createPartition.mock.calls.map(([date]) =>
        (date as Date).toISOString().slice(0, 7),
      ),
    ).toEqual(["2026-10", "2026-11", "2026-12", "2027-01"])
  })

  test("drops only months entirely older than the 25-month retention", async () => {
    // Nov 2026 - 25 months = Oct 2024: October 2024 still holds days inside the
    // window, so only September 2024 and older go.
    const result = await maintainChannelPostMetricPartitions(NOW)
    expect(result.dropped).toEqual(["ChannelPostMetricDaily_2024_09"])
    expect(mocks.dropPartition).not.toHaveBeenCalledWith(
      "ChannelPostMetricDaily_2024_10",
    )
    expect(mocks.dropPartition).not.toHaveBeenCalledWith(
      "ChannelPostMetricDaily_2026_10",
    )
  })

  test("reports rows that fell into the default partition and warns every run", async () => {
    mocks.countDefaultRows.mockResolvedValue(3)
    const result = await maintainChannelPostMetricPartitions(NOW)
    expect(result.defaultRows).toBe(3)
    expect(log.warn).toHaveBeenCalledTimes(1)
    await maintainChannelPostMetricPartitions(NOW)
    expect(log.warn).toHaveBeenCalledTimes(2)
  })

  test("a month that fails to create does not stop the others or the retention", async () => {
    mocks.createPartition
      .mockRejectedValueOnce(new Error("lock timeout"))
      .mockResolvedValue(true)
    const result = await maintainChannelPostMetricPartitions(NOW)
    expect(result.failed).toEqual(["2026-10"])
    expect(result.created).toEqual(["2026-11", "2026-12", "2027-01"])
    expect(result.dropped).toEqual(["ChannelPostMetricDaily_2024_09"])
    expect(log.error).toHaveBeenCalled()
  })

  test("a failing drop does not abort the run", async () => {
    mocks.dropPartition.mockRejectedValueOnce(new Error("lock timeout"))
    const result = await maintainChannelPostMetricPartitions(NOW)
    expect(result.dropped).toEqual([])
    expect(mocks.countDefaultRows).toHaveBeenCalled()
  })

  test("heals an older month that still has rows in the DEFAULT partition", async () => {
    mocks.listDefaultMonths.mockResolvedValue([
      new Date(Date.UTC(2024, 5, 1)),
      new Date(Date.UTC(2025, 2, 1)),
      new Date(Date.UTC(2026, 10, 1)),
    ])
    mocks.createPartition.mockResolvedValue(true)
    const result = await maintainChannelPostMetricPartitions(NOW)
    // 2024-06 is past the retention (rows deleted, no partition); 2026-11 was
    // already handled by the main loop.
    expect(result.healed).toEqual(["2025-03"])
    const created = mocks.createPartition.mock.calls.map(([date]) =>
      (date as Date).toISOString().slice(0, 7),
    )
    expect(created.filter((m) => m === "2025-03")).toHaveLength(1)
    expect(created).not.toContain("2024-06")
  })

  test("deletes DEFAULT rows older than the retention horizon", async () => {
    mocks.deleteDefaultRowsBefore.mockResolvedValue(4)
    const result = await maintainChannelPostMetricPartitions(NOW)
    expect(result.purgedDefaultRows).toBe(4)
    expect(
      (mocks.deleteDefaultRowsBefore.mock.calls[0]?.[0] as Date)
        .toISOString()
        .slice(0, 10),
    ).toBe("2024-10-01")
  })

  test("a failing DEFAULT repair is logged and does not abort the run", async () => {
    mocks.listDefaultMonths.mockResolvedValue([new Date(Date.UTC(2025, 2, 1))])
    mocks.createPartition.mockImplementation((date: Date) =>
      date.getUTCFullYear() === 2025
        ? Promise.reject(new Error("statement timeout"))
        : Promise.resolve(false),
    )
    const result = await maintainChannelPostMetricPartitions(NOW)
    expect(result.failed).toContain("2025-03")
    expect(mocks.countDefaultRows).toHaveBeenCalled()
  })
})
