import { beforeEach, describe, expect, test, vi } from "vitest"
import { buildDateOverridesForSchedule } from "../src/working-hours/date-overrides"

const mocks = vi.hoisted(() => ({
  addDateOverride: vi.fn(),
  updateDateOverride: vi.fn(),
  deleteDateOverride: vi.fn(),
  listDateOverridesInRange: vi.fn(),
  invalidateCacheByTags: vi.fn(async () => undefined),
  dispatchAuditRecord: vi.fn(),
  windowCache: { current: null as unknown },
  withCache: vi.fn(async (_key: string, fn: () => Promise<unknown>) => fn()),
}))

vi.mock("@chatbotx.io/database/client", () => ({ db: {} }))
vi.mock("@chatbotx.io/database/repositories", () => ({
  workingHoursRepository: {
    addDateOverride: mocks.addDateOverride,
    updateDateOverride: mocks.updateDateOverride,
    deleteDateOverride: mocks.deleteDateOverride,
    listDateOverridesInRange: mocks.listDateOverridesInRange,
  },
}))
vi.mock("@chatbotx.io/redis", () => ({
  withCache: mocks.withCache,
  invalidateCacheByTags: mocks.invalidateCacheByTags,
}))
vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: mocks.dispatchAuditRecord,
}))

const { workingHoursService } = await import("../src/working-hours/service")

const WS = "ws-1"
const holiday = { date: "2030-01-01", name: "New year", ranges: [] }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.withCache.mockImplementation(async (_key, fn) => fn())
})

describe("buildDateOverridesForSchedule", () => {
  const rows = [
    { workingHoursId: null, date: "2030-01-01", ranges: [] },
    { workingHoursId: null, date: "2030-01-02", ranges: [] },
    {
      workingHoursId: "wh-1",
      date: "2030-01-02",
      ranges: [{ startMinute: 0, endMinute: 60 }],
    },
    { workingHoursId: "wh-2", date: "2030-01-03", ranges: [] },
  ]

  test("the schedule's own row wins over the workspace holiday; other schedules' rows are ignored", () => {
    const merged = buildDateOverridesForSchedule(rows, "wh-1")

    expect([...merged.keys()]).toEqual(["2030-01-01", "2030-01-02"])
    expect(merged.get("2030-01-01")).toEqual([])
    expect(merged.get("2030-01-02")).toEqual([
      { startMinute: 0, endMinute: 60 },
    ])
  })
})

describe("holiday writes", () => {
  test("addHoliday stores a workspace-wide row and invalidates the cache", async () => {
    mocks.addDateOverride.mockResolvedValue({
      status: "ok",
      override: { id: "1", ...holiday },
    })

    await workingHoursService.addHoliday({ workspaceId: WS, data: holiday })

    expect(mocks.addDateOverride).toHaveBeenCalledWith({
      workspaceId: WS,
      workingHoursId: null,
      override: holiday,
    })
    expect(mocks.invalidateCacheByTags).toHaveBeenCalled()
  })

  test.each([
    ["limitReached", "At most 400 holidays"],
    ["duplicate", "already exists on 2030-01-01"],
  ])("addHoliday maps %s to a validation error and does not invalidate", async (status, message) => {
    mocks.addDateOverride.mockResolvedValue({ status })

    await expect(
      workingHoursService.addHoliday({ workspaceId: WS, data: holiday }),
    ).rejects.toThrow(message)
    expect(mocks.invalidateCacheByTags).not.toHaveBeenCalled()
  })

  test("addHoliday rejects invalid input before touching the repository", async () => {
    await expect(
      workingHoursService.addHoliday({
        workspaceId: WS,
        data: { date: "2030-02-31", ranges: [] },
      }),
    ).rejects.toThrow()
    await expect(
      workingHoursService.addHoliday({
        workspaceId: WS,
        data: {
          date: "2030-01-01",
          ranges: [
            { startMinute: 0, endMinute: 120 },
            { startMinute: 60, endMinute: 180 },
          ],
        },
      }),
    ).rejects.toThrow()
    expect(mocks.addDateOverride).not.toHaveBeenCalled()
  })

  test("updateHoliday and deleteHoliday report a missing holiday", async () => {
    mocks.updateDateOverride.mockResolvedValue({ status: "notFound" })
    mocks.deleteDateOverride.mockResolvedValue(false)

    await expect(
      workingHoursService.updateHoliday({
        workspaceId: WS,
        id: "9",
        data: { name: "x" },
      }),
    ).rejects.toThrow("Holiday not found")
    await expect(
      workingHoursService.deleteHoliday({ workspaceId: WS, id: "9" }),
    ).rejects.toThrow("Holiday not found")
    expect(mocks.invalidateCacheByTags).not.toHaveBeenCalled()
  })
})

describe("findDateOverridesFor window", () => {
  const todayKey = new Date().toISOString().slice(0, 10)
  const windowRows = [{ workingHoursId: null, date: todayKey, ranges: [] }]
  const cachedWindow = (from: string, to: string) =>
    mocks.withCache.mockImplementation(async () => ({
      from,
      to,
      rows: windowRows,
    }))
  const plusDays = (days: number) =>
    new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)

  test("a span inside the cached window never reads the database", async () => {
    cachedWindow(plusDays(-60), plusDays(60))

    const map = await workingHoursService.findDateOverridesFor({
      workspaceId: WS,
      workingHoursId: "wh-1",
      from: new Date(),
      to: new Date(),
    })

    expect(map.get(todayKey)).toEqual([])
    expect(mocks.listDateOverridesInRange).not.toHaveBeenCalled()
  })

  test.each([
    ["starts before the window", -90, 0],
    ["ends after the window", 0, 90],
  ])("a span that %s does one ranged read instead of using a truncated map", async (_label, fromDays, toDays) => {
    cachedWindow(plusDays(-60), plusDays(60))
    mocks.listDateOverridesInRange.mockResolvedValue([
      { workingHoursId: "wh-1", date: plusDays(fromDays), ranges: [] },
    ])

    const map = await workingHoursService.findDateOverridesFor({
      workspaceId: WS,
      workingHoursId: "wh-1",
      from: new Date(Date.now() + fromDays * 86_400_000),
      to: new Date(Date.now() + toDays * 86_400_000),
    })

    expect(mocks.listDateOverridesInRange).toHaveBeenCalledTimes(1)
    expect(map.get(plusDays(fromDays))).toEqual([])
  })
})
