import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findDestinations: vi.fn(),
  findPace: vi.fn(),
  findPostingSchedule: vi.fn(),
  findWorkspaceTimezone: vi.fn(),
  get: vi.fn(),
  listForSchedule: vi.fn(),
  listOccupiedSlots: vi.fn(),
  listPublishedSince: vi.fn(),
  lockPost: vi.fn(),
  lockPostDestinations: vi.fn(),
  releaseQueueSlots: vi.fn(),
  setPostScheduleStatus: vi.fn(),
  setTargetSchedule: vi.fn(),
  storedIssues: vi.fn(),
}))

const tx = { kind: "tx" }

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: async (run: (client: typeof tx) => Promise<unknown>) =>
      await run(tx),
  },
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  socialPostPaceRepository: {
    findPace: mocks.findPace,
    listPublishedSince: mocks.listPublishedSince,
  },
  socialPostPublishRepository: { lockPost: mocks.lockPost },
  socialPostRepository: { findDestinations: mocks.findDestinations },
  socialPostSchedulingRepository: {
    findPostingSchedule: mocks.findPostingSchedule,
    findWorkspaceTimezone: mocks.findWorkspaceTimezone,
    listForSchedule: mocks.listForSchedule,
    listOccupiedSlots: mocks.listOccupiedSlots,
    lockPostDestinations: mocks.lockPostDestinations,
    releaseQueueSlots: mocks.releaseQueueSlots,
    setPostScheduleStatus: mocks.setPostScheduleStatus,
    setTargetSchedule: mocks.setTargetSchedule,
  },
}))
vi.mock("../src/social-post/publish.service", () => ({
  socialPostIssuesException: vi.fn(),
  socialPostPublishService: { storedIssues: mocks.storedIssues },
}))
vi.mock("../src/social-post/service", () => ({
  socialPostService: { get: mocks.get },
}))
vi.mock("../src/social-post/post-state", () => ({
  recomputePostInTx: vi.fn(),
}))
vi.mock("../src/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

const { socialPostScheduleService } = await import(
  "../src/social-post/schedule.service"
)

const MINUTE = 60_000

const writtenSlots = (): Date[] =>
  mocks.setTargetSchedule.mock.calls.map(
    (call) => call[0].values.queueSlotAt as Date,
  )

describe("queue placement for a destination with no posting schedule", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.findWorkspaceTimezone.mockResolvedValue("Asia/Ho_Chi_Minh")
    mocks.storedIssues.mockResolvedValue([])
    mocks.lockPost.mockResolvedValue({ status: "draft" })
    mocks.listForSchedule.mockResolvedValue([
      {
        attemptCount: 0,
        id: "t-1",
        nextAttemptAt: null,
        publishDestinationId: "d-1",
        queueSlotAt: null,
        scheduleMode: "custom",
        scheduledAt: null,
        status: "pending",
        timezone: null,
      },
    ])
    mocks.findPostingSchedule.mockResolvedValue(null)
    mocks.listOccupiedSlots.mockResolvedValue([])
    mocks.findDestinations.mockResolvedValue([
      { id: "d-1", provider: "instagram" },
    ])
    mocks.findPace.mockResolvedValue({
      lastPublishStartedAt: null,
      pausedUntil: null,
      pauseReason: null,
    })
    mocks.listPublishedSince.mockResolvedValue([])
    mocks.setTargetSchedule.mockResolvedValue(true)
    mocks.releaseQueueSlots.mockResolvedValue(undefined)
    mocks.get.mockResolvedValue({ id: "p-1" })
  })

  test("a person or agent asking for the queue is still refused, so they set posting times", async () => {
    await expect(
      socialPostScheduleService.schedule({
        id: "p-1",
        plan: { queue: "next" },
        workspaceId: "ws-1",
      }),
    ).rejects.toThrow("no posting schedule")
    expect(mocks.setTargetSchedule).not.toHaveBeenCalled()
  })

  test("with autoSpacing the target gets a queue slot instead of a refusal", async () => {
    await socialPostScheduleService.schedule({
      id: "p-1",
      plan: { autoSpacing: true, queue: "next" },
      workspaceId: "ws-1",
    })

    expect(mocks.setTargetSchedule).toHaveBeenCalledTimes(1)
    expect(mocks.setTargetSchedule.mock.calls[0]?.[0].values).toMatchObject({
      queueSlotAt: expect.any(Date),
      scheduleMode: "queue",
      timezone: "Asia/Ho_Chi_Minh",
    })
  })

  test("a slot queued a few ms BEFORE the earliest time still counts, so a burst of items gets slots a full gap apart", async () => {
    const queuedJustBefore = new Date(Date.now() + 2 * MINUTE - 100)
    mocks.listOccupiedSlots.mockImplementation(
      async (input: { after: Date }) =>
        queuedJustBefore.getTime() > input.after.getTime()
          ? [queuedJustBefore]
          : [],
    )

    await socialPostScheduleService.schedule({
      id: "p-1",
      plan: { autoSpacing: true, queue: "next" },
      workspaceId: "ws-1",
    })

    const [slot] = writtenSlots()
    expect(slot).toBeDefined()
    // Facebook-less default provider in this fixture is Instagram: the gap is 10 minutes.
    expect(
      (slot as Date).getTime() - queuedJustBefore.getTime(),
    ).toBeGreaterThanOrEqual(10 * MINUTE)
  })

  test("a workspace whose time zone is stored as Etc/UTC (the settings form's UTC) can still queue", async () => {
    mocks.findWorkspaceTimezone.mockResolvedValue("Etc/UTC")

    await socialPostScheduleService.schedule({
      id: "p-1",
      plan: { autoSpacing: true, queue: "next" },
      workspaceId: "ws-1",
    })

    expect(mocks.setTargetSchedule).toHaveBeenCalledTimes(1)
    expect(mocks.setTargetSchedule.mock.calls[0]?.[0].values).toMatchObject({
      scheduleMode: "queue",
      timezone: "Etc/UTC",
    })
  })

  test("the slot keeps Instagram's 10 minute gap from a queued slot and from the last publish", async () => {
    const soon = new Date(Date.now() + 5 * MINUTE)
    mocks.listOccupiedSlots.mockResolvedValue([soon])
    mocks.findPace.mockResolvedValue({
      lastPublishStartedAt: new Date(Date.now() - MINUTE),
      pausedUntil: null,
      pauseReason: null,
    })

    await socialPostScheduleService.schedule({
      id: "p-1",
      plan: { autoSpacing: true, queue: "next" },
      workspaceId: "ws-1",
    })

    const [slot] = writtenSlots()
    expect((slot as Date).getTime() - soon.getTime()).toBeGreaterThanOrEqual(
      10 * MINUTE,
    )
  })

  test("a paused destination gets no slot before the pause ends", async () => {
    const pausedUntil = new Date(Date.now() + 6 * 60 * MINUTE)
    mocks.findPace.mockResolvedValue({
      lastPublishStartedAt: null,
      pausedUntil,
      pauseReason: "limitReached",
    })

    await socialPostScheduleService.schedule({
      id: "p-1",
      plan: { autoSpacing: true, queue: "next" },
      workspaceId: "ws-1",
    })

    const [slot] = writtenSlots()
    expect((slot as Date).getTime()).toBeGreaterThanOrEqual(
      pausedUntil.getTime(),
    )
  })

  test("a destination that has a posting schedule keeps following it", async () => {
    mocks.findPostingSchedule.mockResolvedValue({
      slots: Array.from({ length: 7 }, (_, weekday) => ({
        enabled: true,
        times: ["09:00"],
        weekday,
      })),
      timezone: "UTC",
    })

    await socialPostScheduleService.schedule({
      id: "p-1",
      plan: { autoSpacing: true, queue: "next" },
      workspaceId: "ws-1",
    })

    const [slot] = writtenSlots()
    expect((slot as Date).getUTCHours()).toBe(9)
    expect(mocks.findPace).not.toHaveBeenCalled()
    expect(mocks.setTargetSchedule.mock.calls[0]?.[0].values.timezone).toBe(
      "UTC",
    )
  })
})
