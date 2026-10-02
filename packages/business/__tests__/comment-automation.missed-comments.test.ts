import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findAutomation: vi.fn(),
  findWorkspace: vi.fn(),
  selectWhere: vi.fn(),
  setNumberIfNotExists: vi.fn(),
  deleteKeys: vi.fn(),
  reserveTimeWindow: vi.fn(),
  exists: vi.fn(),
  setNumber: vi.fn(),
  incrementCounter: vi.fn(),
  expire: vi.fn(),
  getAll: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      commentAutomationModel: { findFirst: mocks.findAutomation },
      workspaceModel: { findFirst: mocks.findWorkspace },
    },
    select: vi.fn(() => ({
      from: (table: { name: string }) => ({
        where: (condition: unknown) => mocks.selectWhere(table.name, condition),
      }),
    })),
  },
  and: (...conditions: unknown[]) => ({ and: conditions }),
  eq: (column: unknown, value: unknown) => ({ eq: [column, value] }),
  inArray: (column: unknown, values: unknown) => ({
    inArray: [column, values],
  }),
  ne: vi.fn(),
  relationsFilterToSQL: vi.fn(),
  sql: vi.fn(),
}))

vi.mock("@chatbotx.io/database/partials", async () => {
  const actual = await vi.importActual<
    typeof import("@chatbotx.io/database/partials")
  >("@chatbotx.io/database/partials")
  return {
    canProcessMissedComments: actual.canProcessMissedComments,
    commentAutomationTypes: actual.commentAutomationTypes,
  }
})

vi.mock("@chatbotx.io/database/schema", () => ({
  commentAutomationEventModel: {
    name: "event",
    automationId: "Event.automationId",
    commentId: "Event.commentId",
  },
  commentAutomationMissModel: {
    name: "miss",
    automationId: "Miss.automationId",
    commentId: "Miss.commentId",
  },
  commentAutomationModel: {
    name: "automation",
    id: "Automation.id",
    workspaceId: "Automation.workspaceId",
  },
  commentAutomationReplyModel: {},
  contactInboxModel: {},
}))

vi.mock("../src/flow/service", () => ({
  flowService: { exists: vi.fn().mockResolvedValue(true) },
}))

vi.mock("@chatbotx.io/redis", () => ({
  distributedStore: {
    setNumberIfNotExists: mocks.setNumberIfNotExists,
    delete: mocks.deleteKeys,
    reserveTimeWindow: mocks.reserveTimeWindow,
    exists: mocks.exists,
    setNumber: mocks.setNumber,
    incrementCounter: mocks.incrementCounter,
    expire: mocks.expire,
    getAll: mocks.getAll,
  },
}))

const { commentAutomationService } = await import(
  "../src/comment-automation/service"
)

function buildAutomation(overrides: Record<string, unknown> = {}) {
  return {
    id: "automation-1",
    workspaceId: "ws-1",
    type: "messenger",
    isActive: true,
    startTime: null,
    endTime: null,
    post: { type: "postIds", value: ["111_222"] },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findWorkspace.mockResolvedValue({ timezone: "UTC" })
})

describe("commentAutomationService.resolveMissedCommentsTarget", () => {
  test("accepts an active single-post automation within its schedule", async () => {
    mocks.findAutomation.mockResolvedValue(buildAutomation())

    await expect(
      commentAutomationService.resolveMissedCommentsTarget({
        workspaceId: "ws-1",
        id: "automation-1",
      }),
    ).resolves.toMatchObject({
      eligible: true,
      channelType: "messenger",
      postId: "111_222",
    })
    expect(mocks.findAutomation).toHaveBeenCalledWith({
      where: { id: "automation-1", workspaceId: "ws-1" },
    })
  })

  test.each([
    {
      name: "all posts",
      overrides: { post: { type: "all", value: [] } },
      reason: "notSinglePost",
    },
    {
      name: "several posts",
      overrides: { post: { type: "postIds", value: ["1_2", "1_3"] } },
      reason: "notSinglePost",
    },
    {
      name: "turned off",
      overrides: { isActive: false },
      reason: "inactive",
    },
  ])("refuses an automation that is $name", async ({ overrides, reason }) => {
    mocks.findAutomation.mockResolvedValue(buildAutomation(overrides))

    await expect(
      commentAutomationService.resolveMissedCommentsTarget({
        workspaceId: "ws-1",
        id: "automation-1",
      }),
    ).resolves.toEqual({ eligible: false, reason })
  })

  test("refuses outside the schedule, where every replay would become a permanent miss", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-28T12:00:00Z") })
    mocks.findAutomation.mockResolvedValue(
      buildAutomation({ startTime: "08:00", endTime: "09:00" }),
    )

    await expect(
      commentAutomationService.resolveMissedCommentsTarget({
        workspaceId: "ws-1",
        id: "automation-1",
      }),
    ).resolves.toEqual({ eligible: false, reason: "outsideSchedule" })
    vi.useRealTimers()
  })

  test("throws not-found for another workspace's automation", async () => {
    mocks.findAutomation.mockResolvedValue(undefined)

    await expect(
      commentAutomationService.resolveMissedCommentsTarget({
        workspaceId: "ws-2",
        id: "automation-1",
      }),
    ).rejects.toMatchObject({ httpStatusCode: 404 })
  })
})

describe("commentAutomationService.findProcessedCommentIds", () => {
  test("unions the comment ids this automation has an event or a miss for", async () => {
    mocks.selectWhere.mockImplementation((table: string) =>
      Promise.resolve(
        table === "event" ? [{ commentId: "c-1" }] : [{ commentId: "c-2" }],
      ),
    )

    const processed = await commentAutomationService.findProcessedCommentIds({
      automationId: "automation-1",
      commentIds: ["c-1", "c-2", "c-3"],
    })

    expect([...processed].sort()).toEqual(["c-1", "c-2"])
    expect(mocks.selectWhere).toHaveBeenCalledWith("event", {
      and: [
        { eq: ["Event.automationId", "automation-1"] },
        { inArray: ["Event.commentId", ["c-1", "c-2", "c-3"]] },
      ],
    })
    expect(mocks.selectWhere).toHaveBeenCalledWith("miss", {
      and: [
        { eq: ["Miss.automationId", "automation-1"] },
        { inArray: ["Miss.commentId", ["c-1", "c-2", "c-3"]] },
      ],
    })
  })

  test("skips the queries when there is nothing to check", async () => {
    const processed = await commentAutomationService.findProcessedCommentIds({
      automationId: "automation-1",
      commentIds: [],
    })

    expect(processed.size).toBe(0)
    expect(mocks.selectWhere).not.toHaveBeenCalled()
  })
})

describe("commentAutomationService missed-comments lock", () => {
  test("claims with SET NX and releases the same key", async () => {
    mocks.exists.mockResolvedValue(false)
    mocks.setNumberIfNotExists.mockResolvedValue(true)

    await expect(
      commentAutomationService.claimMissedCommentsRun("automation-1"),
    ).resolves.toBe(true)
    await commentAutomationService.releaseMissedCommentsRun("automation-1")

    const [key, value, ttl] = mocks.setNumberIfNotExists.mock.calls[0] ?? []
    expect(value).toBe(1)
    expect(ttl).toBe(1800)
    expect(mocks.deleteKeys).toHaveBeenCalledWith(key)
  })
})

describe("commentAutomationService.reserveMissedCommentsReplayWindow", () => {
  test("books the span on one timeline per channel account", async () => {
    mocks.reserveTimeWindow.mockResolvedValue(1234)

    await expect(
      commentAutomationService.reserveMissedCommentsReplayWindow({
        channelType: "messenger",
        integrationIdentifier: "page-1",
        spanMs: 3000,
      }),
    ).resolves.toBe(1234)
    expect(mocks.reserveTimeWindow).toHaveBeenCalledWith(
      "comment-automation:missed-comments:pace:messenger:page-1",
      3000,
    )
  })
})

const REMAINING_KEY =
  "comment-automation:missed-comments:remaining:automation-1"
const LOCK_KEY = "comment-automation:missed-comments:automation-1"

describe("commentAutomationService missed-comments processing status", () => {
  test("a run with replays still queued blocks a new one", async () => {
    mocks.exists.mockResolvedValue(true)

    await expect(
      commentAutomationService.claimMissedCommentsRun("automation-1"),
    ).resolves.toBe(false)
    expect(mocks.exists).toHaveBeenCalledWith(REMAINING_KEY)
    expect(mocks.setNumberIfNotExists).not.toHaveBeenCalled()
  })

  test("starts the counter at the number of replays", async () => {
    await commentAutomationService.startMissedCommentsReplay("automation-1", 20)

    expect(mocks.setNumber).toHaveBeenCalledWith(REMAINING_KEY, 20, 1800)
  })

  test("settling takes back failed enqueues and stretches the TTL past the last replay", async () => {
    mocks.incrementCounter.mockResolvedValue(15)

    await commentAutomationService.settleMissedCommentsEnqueue("automation-1", {
      failed: 5,
      lastDelayMs: 19_000,
    })

    expect(mocks.incrementCounter).toHaveBeenCalledWith(REMAINING_KEY, -5)
    expect(mocks.expire).toHaveBeenCalledWith(REMAINING_KEY, 19 + 1800)
    expect(mocks.deleteKeys).not.toHaveBeenCalled()
  })

  test("settling clears the status when every enqueue failed", async () => {
    mocks.incrementCounter.mockResolvedValue(0)

    await commentAutomationService.settleMissedCommentsEnqueue("automation-1", {
      failed: 20,
      lastDelayMs: 19_000,
    })

    expect(mocks.deleteKeys).toHaveBeenCalledWith(REMAINING_KEY)
    expect(mocks.expire).not.toHaveBeenCalled()
  })

  test("the last finished replay clears the status", async () => {
    mocks.incrementCounter.mockResolvedValueOnce(1).mockResolvedValueOnce(0)

    await commentAutomationService.finishMissedCommentReplay("automation-1")
    expect(mocks.deleteKeys).not.toHaveBeenCalled()

    await commentAutomationService.finishMissedCommentReplay("automation-1")
    expect(mocks.incrementCounter).toHaveBeenCalledWith(REMAINING_KEY, -1)
    expect(mocks.deleteKeys).toHaveBeenCalledWith(REMAINING_KEY)
  })

  test("reports the workspace's automations that are scanning or still replaying", async () => {
    mocks.selectWhere.mockResolvedValue([
      { id: "automation-1" },
      { id: "automation-2" },
      { id: "automation-3" },
    ])
    mocks.getAll.mockResolvedValue({
      [LOCK_KEY]: 1,
      "comment-automation:missed-comments:remaining:automation-2": 4,
    })

    await expect(
      commentAutomationService.findMissedCommentsInProgress({
        workspaceId: "ws-1",
        automationIds: [
          "automation-1",
          "automation-2",
          "automation-3",
          "other-ws-automation",
        ],
      }),
    ).resolves.toEqual(["automation-1", "automation-2"])
    // Only ids the workspace owns reach Redis.
    expect(mocks.selectWhere).toHaveBeenCalledWith("automation", {
      and: [
        { eq: ["Automation.workspaceId", "ws-1"] },
        {
          inArray: [
            "Automation.id",
            [
              "automation-1",
              "automation-2",
              "automation-3",
              "other-ws-automation",
            ],
          ],
        },
      ],
    })
    expect(mocks.getAll.mock.calls[0]?.[0]).toHaveLength(6)
  })

  test("reads nothing for an empty id list", async () => {
    await expect(
      commentAutomationService.findMissedCommentsInProgress({
        workspaceId: "ws-1",
        automationIds: [],
      }),
    ).resolves.toEqual([])
    expect(mocks.selectWhere).not.toHaveBeenCalled()
    expect(mocks.getAll).not.toHaveBeenCalled()
  })
})
