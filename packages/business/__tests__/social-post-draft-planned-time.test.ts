import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findWorkspaceTimezone: vi.fn(async () => "UTC"),
  requestPublishNow: vi.fn(),
  setPlannedTime: vi.fn(async () => 1),
  setTargetSchedule: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({ db: {} }))
vi.mock("@chatbotx.io/database/repositories", () => ({
  socialPostPublishRepository: { requestPublishNow: mocks.requestPublishNow },
  socialPostRepository: {},
  socialPostSchedulingRepository: {
    findWorkspaceTimezone: mocks.findWorkspaceTimezone,
    setPlannedTime: mocks.setPlannedTime,
    setTargetSchedule: mocks.setTargetSchedule,
  },
}))
vi.mock("../src/social-post/service", () => ({ socialPostService: {} }))
vi.mock("../src/social-post/publish.service", () => ({
  socialPostPublishService: {},
}))

const { socialPostScheduleService } = await import(
  "../src/social-post/schedule.service"
)

describe("saving a draft with a planned time", () => {
  beforeEach(() => vi.clearAllMocks())

  test("only remembers the time: nothing is scheduled or published", async () => {
    const planned = new Date("2026-12-01T02:00:00Z")
    const tx = {} as never

    const hook = await socialPostScheduleService.prepareDraftTime({
      plannedAt: planned,
      timezone: "Asia/Ho_Chi_Minh",
      workspaceId: "w1",
    })
    await hook(tx, "p1")

    expect(mocks.setPlannedTime).toHaveBeenCalledWith(
      {
        plannedAt: planned,
        socialPostId: "p1",
        timezone: "Asia/Ho_Chi_Minh",
        workspaceId: "w1",
      },
      tx,
    )
    expect(mocks.setTargetSchedule).not.toHaveBeenCalled()
    expect(mocks.requestPublishNow).not.toHaveBeenCalled()
  })

  test("accepts a time in the past (no lead-time window for a draft)", async () => {
    const hook = await socialPostScheduleService.prepareDraftTime({
      plannedAt: new Date("2020-01-01T00:00:00Z"),
      workspaceId: "w1",
    })

    await expect(hook({} as never, "p1")).resolves.toBeUndefined()
  })

  test("null forgets the planned time", async () => {
    const hook = await socialPostScheduleService.prepareDraftTime({
      plannedAt: null,
      workspaceId: "w1",
    })
    await hook({} as never, "p1")

    expect(mocks.setPlannedTime).toHaveBeenCalledWith(
      expect.objectContaining({ plannedAt: null }),
      expect.anything(),
    )
  })
})
