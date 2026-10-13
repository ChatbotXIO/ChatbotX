import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createPartition: vi.fn(),
  dropPartition: vi.fn(),
  listPartitions: vi.fn(),
  countDefaultRows: vi.fn(),
  findEarliestLiveStart: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  addUtcMonths: (date: Date, months: number) =>
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1)),
  createLeaderboardScoreEventPartition: mocks.createPartition,
  dropLeaderboardScoreEventPartition: mocks.dropPartition,
  listLeaderboardScoreEventPartitions: mocks.listPartitions,
  countLeaderboardScoreEventDefaultRows: mocks.countDefaultRows,
  leaderboardRepository: { findEarliestLiveStart: mocks.findEarliestLiveStart },
}))

vi.mock("../src/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}))

const { maintainLeaderboardPartitions } = await import(
  "../src/leaderboard/partitions"
)

const month = (year: number, monthIndex: number) => ({
  name: `LeaderboardScoreEvent_${year}_${String(monthIndex + 1).padStart(2, "0")}`,
  monthStart: new Date(Date.UTC(year, monthIndex, 1)),
})

const NOW = new Date("2026-10-12T08:00:00Z")

beforeEach(() => {
  vi.clearAllMocks()
  mocks.createPartition.mockResolvedValue(false)
  mocks.countDefaultRows.mockResolvedValue(0)
  mocks.findEarliestLiveStart.mockResolvedValue(null)
  mocks.listPartitions.mockResolvedValue([
    month(2025, 8),
    month(2025, 9),
    month(2025, 10),
    month(2026, 9),
  ])
})

describe("maintainLeaderboardPartitions", () => {
  test("creates the current month and two ahead", async () => {
    await maintainLeaderboardPartitions(NOW)
    const created = mocks.createPartition.mock.calls.map(([date]) =>
      (date as Date).toISOString().slice(0, 7),
    )
    expect(created).toEqual(["2026-10", "2026-11", "2026-12"])
  })

  test("drops only months entirely older than the 12-month retention", async () => {
    // Oct 2025 still holds events newer than 12 months (Oct 13-31), so it stays.
    const result = await maintainLeaderboardPartitions(NOW)
    expect(result.dropped).toEqual(["LeaderboardScoreEvent_2025_09"])
  })

  test("keeps months a live leaderboard started in", async () => {
    mocks.findEarliestLiveStart.mockResolvedValue(
      new Date("2025-09-20T00:00:00Z"),
    )
    const result = await maintainLeaderboardPartitions(NOW)
    expect(result.dropped).toEqual([])
  })

  test("reports rows that fell into the default partition", async () => {
    mocks.countDefaultRows.mockResolvedValue(7)
    const result = await maintainLeaderboardPartitions(NOW)
    expect(result.defaultRows).toBe(7)
  })
})
