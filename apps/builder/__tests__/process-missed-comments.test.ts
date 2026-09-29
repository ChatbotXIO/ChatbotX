import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockResolveTarget,
  mockClaimRun,
  mockReleaseRun,
  mockFindProcessed,
  mockScanPostComments,
  mockQueueAddBulk,
  mockWorkspaceFindById,
  mockIsActiveNow,
  mockReserveWindow,
  mockStartReplay,
  mockSettleEnqueue,
} = vi.hoisted(() => ({
  mockResolveTarget: vi.fn(),
  mockClaimRun: vi.fn(),
  mockReleaseRun: vi.fn(),
  mockFindProcessed: vi.fn(),
  mockScanPostComments: vi.fn(),
  mockQueueAddBulk: vi.fn(),
  mockWorkspaceFindById: vi.fn(),
  mockIsActiveNow: vi.fn(),
  mockReserveWindow: vi.fn(),
  mockStartReplay: vi.fn(),
  mockSettleEnqueue: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  commentAutomationService: {
    resolveMissedCommentsTarget: mockResolveTarget,
    claimMissedCommentsRun: mockClaimRun,
    releaseMissedCommentsRun: mockReleaseRun,
    findProcessedCommentIds: mockFindProcessed,
    reserveMissedCommentsReplayWindow: mockReserveWindow,
    startMissedCommentsReplay: mockStartReplay,
    settleMissedCommentsEnqueue: mockSettleEnqueue,
  },
  workspaceService: {
    findById: mockWorkspaceFindById,
    isActiveNow: mockIsActiveNow,
  },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  LowJobAction: { replayMissedComment: "replayMissedComment" },
  lowQueue: { addBulk: mockQueueAddBulk },
}))

vi.mock("@/lib/log", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock(
  "../src/features/shared/comment-automation/lib/missed-comments/index",
  () => ({ scanPostComments: mockScanPostComments }),
)

const { processMissedComments } = await import(
  "../src/features/shared/comment-automation/lib/missed-comments/process-missed-comments"
)
const { MissedCommentsIntegrationNotFoundError } = await import(
  "../src/features/shared/comment-automation/lib/missed-comments/types"
)

const PROPS = { workspaceId: "ws-1", id: "automation-1" }
const NOW = 1_800_000_000_000

function scanned(commentId: string, createdTime: number) {
  return {
    integrationIdentifier: "page-1",
    commentData: {
      commentId,
      postId: "page-1_story-1",
      parentId: "page-1_story-1",
      fromId: `user-${commentId}`,
      createdTime,
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ now: NOW })
  // A free timeline: the booking starts now.
  mockReserveWindow.mockResolvedValue(NOW)
  mockResolveTarget.mockResolvedValue({
    eligible: true,
    automation: { id: "automation-1" },
    channelType: "messenger",
    postId: "page-1_story-1",
  })
  mockClaimRun.mockResolvedValue(true)
  mockReleaseRun.mockResolvedValue(undefined)
  mockFindProcessed.mockResolvedValue(new Set())
  mockScanPostComments.mockResolvedValue([])
  mockQueueAddBulk.mockResolvedValue([])
  mockWorkspaceFindById.mockResolvedValue({ id: "ws-1" })
  mockIsActiveNow.mockReturnValue(true)
})

function enqueuedJobs() {
  return mockQueueAddBulk.mock.calls.flatMap((call) => call[0])
}

describe("processMissedComments", () => {
  test("passes an ineligible automation's reason through without locking", async () => {
    mockResolveTarget.mockResolvedValue({
      eligible: false,
      reason: "outsideSchedule",
    })

    await expect(processMissedComments(PROPS)).resolves.toEqual({
      status: "failed",
      reason: "outsideSchedule",
    })
    expect(mockClaimRun).not.toHaveBeenCalled()
    expect(mockScanPostComments).not.toHaveBeenCalled()
  })

  test("refuses a second run while one holds the lock", async () => {
    mockClaimRun.mockResolvedValue(false)

    await expect(processMissedComments(PROPS)).resolves.toEqual({
      status: "failed",
      reason: "alreadyRunning",
    })
    expect(mockScanPostComments).not.toHaveBeenCalled()
    expect(mockReleaseRun).not.toHaveBeenCalled()
  })

  test("skips handled comments and enqueues the rest oldest first, only for this automation", async () => {
    mockScanPostComments.mockResolvedValue([
      scanned("c-new", 300),
      scanned("c-done", 200),
      scanned("c-old", 100),
    ])
    mockFindProcessed.mockResolvedValue(new Set(["c-done"]))

    await expect(processMissedComments(PROPS)).resolves.toEqual({
      status: "done",
      scanned: 3,
      skipped: 1,
      queued: 2,
      failed: 0,
    })

    expect(mockScanPostComments).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "messenger",
        workspaceId: "ws-1",
        postId: "page-1_story-1",
      }),
    )
    expect(mockFindProcessed).toHaveBeenCalledWith({
      automationId: "automation-1",
      commentIds: ["c-new", "c-done", "c-old"],
    })
    // On the low queue, oldest first, one second apart, one attempt each.
    expect(enqueuedJobs()).toEqual([
      {
        name: "replayMissedComment",
        data: {
          type: "replayMissedComment",
          data: {
            workspaceId: "ws-1",
            integrationType: "messenger",
            integrationIdentifier: "page-1",
            commentData: scanned("c-old", 100).commentData,
            replay: { automationId: "automation-1" },
          },
        },
        opts: {
          jobId: "missed-comment-automation-1-c-old",
          delay: 0,
          attempts: 1,
        },
      },
      expect.objectContaining({
        opts: {
          jobId: "missed-comment-automation-1-c-new",
          delay: 1000,
          attempts: 1,
        },
      }),
    ])
    expect(mockReserveWindow).toHaveBeenCalledWith({
      channelType: "messenger",
      integrationIdentifier: "page-1",
      spanMs: 2000,
    })
    expect(mockReleaseRun).toHaveBeenCalledWith("automation-1")
  })

  test("enqueues in chunks of 500 and counts a failed chunk without stopping", async () => {
    mockScanPostComments.mockResolvedValue(
      Array.from({ length: 1001 }, (_, index) =>
        scanned(`c-${index}`, 1000 + index),
      ),
    )
    mockQueueAddBulk.mockRejectedValueOnce(new Error("redis down"))

    await expect(processMissedComments(PROPS)).resolves.toEqual({
      status: "done",
      scanned: 1001,
      skipped: 0,
      queued: 501,
      failed: 500,
    })
    expect(mockQueueAddBulk.mock.calls.map((call) => call[0].length)).toEqual([
      500, 500, 1,
    ])
    expect(enqueuedJobs().at(-1)?.opts.delay).toBe(1_000_000)
  })

  test("queues behind another run already booked on the same account", async () => {
    // Another automation's run on this Page is booked for the next 5 seconds.
    mockReserveWindow.mockResolvedValue(NOW + 5000)
    mockScanPostComments.mockResolvedValue([
      scanned("c-1", 100),
      scanned("c-2", 200),
    ])

    await processMissedComments(PROPS)

    expect(enqueuedJobs().map((job) => job.opts.delay)).toEqual([5000, 6000])
  })

  test("counts the replays before enqueueing them, then settles the count", async () => {
    mockScanPostComments.mockResolvedValue([
      scanned("c-1", 100),
      scanned("c-2", 200),
      scanned("c-3", 300),
    ])

    await processMissedComments(PROPS)

    expect(mockStartReplay).toHaveBeenCalledWith("automation-1", 3)
    // The first replay can run at once, so the counter must exist first.
    expect(mockStartReplay.mock.invocationCallOrder[0]).toBeLessThan(
      mockQueueAddBulk.mock.invocationCallOrder[0] ?? 0,
    )
    expect(mockSettleEnqueue).toHaveBeenCalledWith("automation-1", {
      failed: 0,
      lastDelayMs: 2000,
    })
  })

  test("settles the count with the replays that failed to enqueue", async () => {
    mockScanPostComments.mockResolvedValue(
      Array.from({ length: 501 }, (_, index) => scanned(`c-${index}`, index)),
    )
    mockQueueAddBulk.mockRejectedValueOnce(new Error("redis down"))

    await processMissedComments(PROPS)

    expect(mockSettleEnqueue).toHaveBeenCalledWith("automation-1", {
      failed: 500,
      lastDelayMs: 500_000,
    })
  })

  test("starts no processing status when nothing is left to replay", async () => {
    mockScanPostComments.mockResolvedValue([scanned("c-done", 100)])
    mockFindProcessed.mockResolvedValue(new Set(["c-done"]))

    await processMissedComments(PROPS)

    expect(mockStartReplay).not.toHaveBeenCalled()
    expect(mockSettleEnqueue).not.toHaveBeenCalled()
    expect(mockQueueAddBulk).not.toHaveBeenCalled()
  })

  test("refuses a workspace that is off or outside its active hours", async () => {
    mockIsActiveNow.mockReturnValue(false)

    await expect(processMissedComments(PROPS)).resolves.toEqual({
      status: "failed",
      reason: "workspaceInactive",
    })
    expect(mockWorkspaceFindById).toHaveBeenCalledWith({ id: "ws-1" })
    expect(mockClaimRun).not.toHaveBeenCalled()
  })

  test("reports a missing integration and still releases the lock", async () => {
    mockScanPostComments.mockRejectedValue(
      new MissedCommentsIntegrationNotFoundError(),
    )

    await expect(processMissedComments(PROPS)).resolves.toEqual({
      status: "failed",
      reason: "integrationNotFound",
    })
    expect(mockReleaseRun).toHaveBeenCalledWith("automation-1")
  })

  test("reports a failed comment fetch and still releases the lock", async () => {
    mockScanPostComments.mockRejectedValue(new Error("token expired"))

    await expect(processMissedComments(PROPS)).resolves.toEqual({
      status: "failed",
      reason: "fetchFailed",
    })
    expect(mockQueueAddBulk).not.toHaveBeenCalled()
    expect(mockReleaseRun).toHaveBeenCalledWith("automation-1")
  })
})
