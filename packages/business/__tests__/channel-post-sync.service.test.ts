import { beforeEach, describe, expect, test, vi } from "vitest"

const SYNC_JOB_ID_1 = /^sync-channel-posts-1-\d+$/
const SYNC_JOB_ID_2 = /^sync-channel-posts-2-\d+$/

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  countPhoneComments: vi.fn(),
  ensureRows: vi.fn(),
  findEligibleInboxes: vi.fn(),
  findWorkspaceTimezone: vi.fn(),
  findRefreshTarget: vi.fn(),
  claimLiveRechecks: vi.fn(),
  listForWorkspace: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  parkIneligible: vi.fn(),
  releaseRecoveredAuthFailures: vi.fn(),
  releaseReconnectedParked: vi.fn(),
  resetAfterAuthChange: vi.fn(),
  lowQueueAdd: vi.fn(),
  markFailed: vi.fn(),
  markRemoved: vi.fn(),
  queueDue: vi.fn(),
  release: vi.fn(),
  rehostListedThumbnails: vi.fn(),
  requestRefresh: vi.fn(),
  saveProgress: vi.fn(),
  setPhoneCommentsCount: vi.fn(),
  upsertListedChannelPosts: vi.fn(),
}))

const tx = { kind: "tx" }

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: async (run: (client: typeof tx) => Promise<unknown>) =>
      await run(tx),
  },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  channelPostManagementRepository: {
    findRefreshTarget: mocks.findRefreshTarget,
    markRemoved: mocks.markRemoved,
  },
  channelPostMetricRepository: {
    findWorkspaceTimezone: mocks.findWorkspaceTimezone,
  },
  channelPostRepository: {
    claimLiveRechecks: mocks.claimLiveRechecks,
    setPhoneCommentsCount: mocks.setPhoneCommentsCount,
  },
  channelPostSyncRepository: {
    claim: mocks.claim,
    ensureRows: mocks.ensureRows,
    findEligibleInboxes: mocks.findEligibleInboxes,
    listForWorkspace: mocks.listForWorkspace,
    markFailed: mocks.markFailed,
    parkIneligible: mocks.parkIneligible,
    queueDue: mocks.queueDue,
    release: mocks.release,
    releaseRecoveredAuthFailures: mocks.releaseRecoveredAuthFailures,
    releaseReconnectedParked: mocks.releaseReconnectedParked,
    requestRefresh: mocks.requestRefresh,
    resetAfterAuthChange: mocks.resetAfterAuthChange,
    saveProgress: mocks.saveProgress,
  },
  upsertListedChannelPosts: mocks.upsertListedChannelPosts,
}))
vi.mock("@chatbotx.io/worker-config", () => ({
  LowJobAction: {
    refreshChannelPost: "refreshChannelPost",
    syncChannelPosts: "syncChannelPosts",
  },
  lowQueue: { add: mocks.lowQueueAdd },
}))
vi.mock("@chatbotx.io/redis", () => ({ invalidateCacheByTags: vi.fn() }))
vi.mock("../src/logger", () => ({
  logger: { info: mocks.loggerInfo, warn: mocks.loggerWarn },
}))
vi.mock("../src/channel-post/sync-reset", () => ({
  resetChannelPostSyncAfterAuthChange: mocks.resetAfterAuthChange,
}))
vi.mock("../src/channel-post/comments.service", () => ({
  channelPostCommentsService: { countPhoneComments: mocks.countPhoneComments },
}))
vi.mock("../src/channel-post/service", () => ({
  channelPostService: { rehostListedThumbnails: mocks.rehostListedThumbnails },
}))
vi.mock("@chatbotx.io/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/utils")>()),
  createId: () => "generated-token",
}))

const {
  CHANNEL_POST_PHONE_RECOUNT_LIMIT,
  CHANNEL_POST_REFRESH_COOLDOWN_MS,
  CHANNEL_POST_SYNC_INTERVAL_MS,
  CHANNEL_POST_SYNC_MAX_ATTEMPTS,
  CHANNEL_POST_SYNC_QUEUED_RECHECK_MS,
  CHANNEL_POST_SYNC_STALLED_AFTER_MS,
  channelPostSyncJobId,
  channelPostSyncRetryDelayMs,
  channelPostSyncService,
} = await import("../src/channel-post/sync.service")

const SYNC_JOB_ID = /^sync-channel-posts-1-\d+$/

const inbox = (id: string, channel = "messenger") => ({
  channel,
  id,
  name: `Inbox ${id}`,
  status: "connected",
  syncable: true,
})

const statusRow = (inboxId: string, status = "queued") => ({
  attempts: 0,
  backfillCompletedAt: null,
  channel: "messenger",
  inboxId,
  inboxName: `Inbox ${inboxId}`,
  lastError: null,
  lastErrorCategory: null,
  lastRequestedAt: null,
  lastSyncedAt: null,
  nextSyncAt: null,
  status,
  syncedCount: 0,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.lowQueueAdd.mockResolvedValue(undefined)
  mocks.ensureRows.mockResolvedValue(undefined)
  mocks.parkIneligible.mockResolvedValue(0)
  mocks.releaseRecoveredAuthFailures.mockResolvedValue(0)
  mocks.releaseReconnectedParked.mockResolvedValue(0)
  mocks.resetAfterAuthChange.mockResolvedValue(true)
  mocks.claimLiveRechecks.mockResolvedValue([])
})

describe("channelPostSyncService.request", () => {
  test("creates the missing rows, starts a sync per free inbox and enqueues one job each", async () => {
    mocks.findEligibleInboxes.mockResolvedValue([inbox("1"), inbox("2")])
    mocks.requestRefresh
      .mockResolvedValueOnce({ id: "r1", inboxId: "1" })
      .mockResolvedValueOnce(null)
    mocks.listForWorkspace.mockResolvedValue([
      statusRow("1"),
      statusRow("2", "running"),
    ])

    const result = await channelPostSyncService.request({ workspaceId: "ws-1" })

    expect(mocks.ensureRows).toHaveBeenCalledWith(
      expect.objectContaining({
        inboxes: [inbox("1"), inbox("2")],
        workspaceId: "ws-1",
      }),
    )
    expect(mocks.lowQueueAdd).toHaveBeenCalledTimes(1)
    expect(mocks.lowQueueAdd).toHaveBeenCalledWith(
      "syncChannelPosts",
      {
        data: { inboxId: "1", workspaceId: "ws-1" },
        type: "syncChannelPosts",
      },
      {
        jobId: expect.stringMatching(SYNC_JOB_ID),
        removeOnComplete: true,
        removeOnFail: true,
      },
    )
    expect(result.items).toEqual([
      {
        channel: "messenger",
        inboxId: "1",
        inboxName: "Inbox 1",
        requested: true,
        status: "queued",
      },
      {
        channel: "messenger",
        inboxId: "2",
        inboxName: "Inbox 2",
        requested: false,
        status: "running",
      },
    ])
  })

  test("only asks for channels that have a post list", async () => {
    mocks.findEligibleInboxes.mockResolvedValue([])
    mocks.listForWorkspace.mockResolvedValue([])

    await channelPostSyncService.request({ workspaceId: "ws-1" })

    expect(mocks.findEligibleInboxes).toHaveBeenCalledWith(
      expect.objectContaining({
        channels: ["messenger", "instagram", "threads", "tiktok"],
      }),
    )
  })

  test("applies the cooldown and the lost-job recheck window it documents", async () => {
    mocks.findEligibleInboxes.mockResolvedValue([inbox("1")])
    mocks.requestRefresh.mockResolvedValue(null)
    mocks.listForWorkspace.mockResolvedValue([statusRow("1")])

    await channelPostSyncService.request({ workspaceId: "ws-1" })

    const call = mocks.requestRefresh.mock.calls[0]?.[0]
    expect(call.cooldownMs).toBe(CHANNEL_POST_REFRESH_COOLDOWN_MS)
    expect(call.queuedUntil.getTime() - call.now.getTime()).toBe(
      CHANNEL_POST_SYNC_QUEUED_RECHECK_MS,
    )
  })

  test("ignores disconnected inboxes: no row, no refresh, no job, not in the answer", async () => {
    mocks.findEligibleInboxes.mockResolvedValue([
      inbox("1"),
      { ...inbox("2"), status: "disconnected", syncable: false },
      // Connected, but its integration row is missing.
      { ...inbox("3"), syncable: false },
    ])
    mocks.requestRefresh.mockResolvedValue({ id: "r1", inboxId: "1" })
    mocks.listForWorkspace.mockResolvedValue([statusRow("1")])

    await channelPostSyncService.request({ workspaceId: "ws-1" })

    expect(mocks.ensureRows).toHaveBeenCalledWith(
      expect.objectContaining({ inboxes: [inbox("1")] }),
    )
    expect(mocks.requestRefresh).toHaveBeenCalledTimes(1)
    expect(mocks.lowQueueAdd).toHaveBeenCalledTimes(1)
    expect(mocks.listForWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ inboxIds: ["1"] }),
    )
  })

  test("a requested inbox that is not eligible is not found (one) or a validation error (several)", async () => {
    mocks.findEligibleInboxes.mockResolvedValue([])

    await expect(
      channelPostSyncService.request({ inboxIds: ["9"], workspaceId: "ws-1" }),
    ).rejects.toMatchObject({ code: "notFound" })
    mocks.findEligibleInboxes.mockResolvedValue([inbox("1")])
    await expect(
      channelPostSyncService.request({
        inboxIds: ["1", "9"],
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({ code: "validation" })
    expect(mocks.ensureRows).not.toHaveBeenCalled()
  })

  test("a failed enqueue is logged, not thrown: the row stays queued for the scanner", async () => {
    mocks.findEligibleInboxes.mockResolvedValue([inbox("1")])
    mocks.requestRefresh.mockResolvedValue({ id: "r1", inboxId: "1" })
    mocks.listForWorkspace.mockResolvedValue([statusRow("1")])
    mocks.lowQueueAdd.mockRejectedValue(new Error("redis down"))

    const result = await channelPostSyncService.request({ workspaceId: "ws-1" })

    expect(result.items[0]?.requested).toBe(true)
    expect(mocks.loggerWarn).toHaveBeenCalled()
  })

  test("leaves out a row on a channel or status it does not know", async () => {
    mocks.findEligibleInboxes.mockResolvedValue([inbox("1")])
    mocks.requestRefresh.mockResolvedValue(null)
    mocks.listForWorkspace.mockResolvedValue([
      { ...statusRow("1"), channel: "retired" },
      { ...statusRow("2"), status: "weird" },
      statusRow("3"),
    ])

    const result = await channelPostSyncService.request({ workspaceId: "ws-1" })

    expect(result.items.map((item) => item.inboxId)).toEqual(["3"])
  })
})

describe("channelPostSyncService.scanDue", () => {
  test("queues the due rows with the documented windows and enqueues a job per row", async () => {
    mocks.queueDue.mockResolvedValue([
      { channel: "messenger", id: "a", inboxId: "1", workspaceId: "ws-1" },
      { channel: "tiktok", id: "b", inboxId: "2", workspaceId: "ws-2" },
    ])

    const count = await channelPostSyncService.scanDue()

    const call = mocks.queueDue.mock.calls[0]?.[0]
    expect(call.batchSize).toBe(50)
    expect(call.queuedUntil.getTime() - call.now.getTime()).toBe(
      CHANNEL_POST_SYNC_QUEUED_RECHECK_MS,
    )
    expect(call.now.getTime() - call.stalledBefore.getTime()).toBe(
      CHANNEL_POST_SYNC_STALLED_AFTER_MS,
    )
    expect(count).toBe(2)
    const jobIds = mocks.lowQueueAdd.mock.calls.map(
      ([, , options]) => options.jobId,
    )
    expect(jobIds[0]).toMatch(SYNC_JOB_ID_1)
    expect(jobIds[1]).toMatch(SYNC_JOB_ID_2)
  })

  test("self-heals before queueing: parks ineligible rows and releases recovered auth failures, bounded", async () => {
    mocks.queueDue.mockResolvedValue([])
    mocks.parkIneligible.mockResolvedValue(2)
    mocks.releaseRecoveredAuthFailures.mockResolvedValue(1)
    const order: string[] = []
    mocks.parkIneligible.mockImplementation(() => {
      order.push("park")
      return Promise.resolve(2)
    })
    mocks.releaseRecoveredAuthFailures.mockImplementation(() => {
      order.push("release")
      return Promise.resolve(1)
    })
    mocks.queueDue.mockImplementation(() => {
      order.push("queue")
      return Promise.resolve([])
    })

    await channelPostSyncService.scanDue()

    expect(order).toEqual(["park", "release", "queue"])
    expect(mocks.parkIneligible).toHaveBeenCalledWith(
      expect.objectContaining({ batchSize: 50 }),
    )
    expect(mocks.releaseRecoveredAuthFailures).toHaveBeenCalledWith(
      expect.objectContaining({ batchSize: 50 }),
    )
  })

  test("self-heal makes rows parked as notConnected due again once their inbox is syncable, before queueing and bounded", async () => {
    const order: string[] = []
    mocks.releaseReconnectedParked.mockImplementation(() => {
      order.push("releaseParked")
      return Promise.resolve(1)
    })
    mocks.queueDue.mockImplementation(() => {
      order.push("queue")
      return Promise.resolve([])
    })

    await channelPostSyncService.scanDue()

    expect(order).toEqual(["releaseParked", "queue"])
    expect(mocks.releaseReconnectedParked).toHaveBeenCalledWith(
      expect.objectContaining({ batchSize: 50 }),
    )
  })

  test("enqueues nothing when nothing is due", async () => {
    mocks.queueDue.mockResolvedValue([])

    expect(await channelPostSyncService.scanDue()).toBe(0)
    expect(mocks.lowQueueAdd).not.toHaveBeenCalled()
  })

  test("one failed enqueue does not stop the others", async () => {
    mocks.queueDue.mockResolvedValue([
      { channel: "messenger", id: "a", inboxId: "1", workspaceId: "ws-1" },
      { channel: "messenger", id: "b", inboxId: "2", workspaceId: "ws-1" },
    ])
    mocks.lowQueueAdd.mockRejectedValueOnce(new Error("boom"))

    await channelPostSyncService.scanDue()

    expect(mocks.lowQueueAdd).toHaveBeenCalledTimes(2)
  })
})

describe("channelPostSyncService.scanDue stale live broadcasts", () => {
  beforeEach(() => {
    mocks.queueDue.mockResolvedValue([])
  })

  const refreshTarget = {
    channel: "messenger",
    externalPostId: "x",
    id: "p1",
    inboxId: "1",
  }

  test("claims a bounded batch due for a re-read, a window ahead, within a day of the broadcast", async () => {
    await channelPostSyncService.scanDue()

    const call = mocks.claimLiveRechecks.mock.calls[0]?.[0]
    expect(call.limit).toBe(20)
    expect(call.recheckAfterMs).toBe(10 * 60 * 1000)
    expect(call.now.getTime() - call.giveUpBefore.getTime()).toBe(
      24 * 60 * 60 * 1000,
    )
  })

  test("re-reads each claimed broadcast through the refresh job", async () => {
    mocks.claimLiveRechecks.mockResolvedValue([
      { id: "p1", workspaceId: "ws-1" },
      { id: "p2", workspaceId: "ws-1" },
    ])
    mocks.findRefreshTarget.mockResolvedValue(refreshTarget)

    await channelPostSyncService.scanDue()

    const jobIds = mocks.lowQueueAdd.mock.calls.map(
      ([, , options]) => options.jobId,
    )
    expect(jobIds).toEqual([
      "refresh-channel-post-p1",
      "refresh-channel-post-p2",
    ])
  })

  test("rows whose integrations are gone cannot starve a valid row: the claim moves them on, so the next scan reaches the next batch", async () => {
    const gone = Array.from({ length: 20 }, (_, index) => ({
      id: `gone-${index}`,
      workspaceId: "ws-gone",
    }))
    const valid = { id: "valid", workspaceId: "ws-ok" }
    mocks.claimLiveRechecks
      .mockResolvedValueOnce(gone)
      .mockResolvedValueOnce([valid])
    mocks.findRefreshTarget.mockImplementation(({ id }: { id: string }) =>
      Promise.resolve(id === "valid" ? { ...refreshTarget, id } : null),
    )

    await channelPostSyncService.scanDue()
    await channelPostSyncService.scanDue()

    const jobIds = mocks.lowQueueAdd.mock.calls.map(
      ([, , options]) => options.jobId,
    )
    expect(jobIds).toEqual(["refresh-channel-post-valid"])
    expect(mocks.claimLiveRechecks).toHaveBeenCalledTimes(2)
  })

  test("a row that cannot be queued does not stop the others or the scan", async () => {
    mocks.claimLiveRechecks.mockResolvedValue([
      { id: "p1", workspaceId: "ws-1" },
      { id: "p2", workspaceId: "ws-1" },
    ])
    mocks.findRefreshTarget.mockResolvedValue(refreshTarget)
    mocks.lowQueueAdd.mockRejectedValueOnce(new Error("redis down"))

    await expect(channelPostSyncService.scanDue()).resolves.toBe(0)

    expect(mocks.lowQueueAdd).toHaveBeenCalledTimes(2)
    expect(mocks.loggerWarn).toHaveBeenCalled()
  })

  test("a failing claim is logged and never fails the scan", async () => {
    mocks.claimLiveRechecks.mockRejectedValue(new Error("db down"))

    await expect(channelPostSyncService.scanDue()).resolves.toBe(0)

    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      expect.stringContaining("stale live"),
    )
  })
})

describe("job ids", () => {
  test("have no colon (BullMQ rejects it)", () => {
    expect(channelPostSyncJobId("42", 1_793_577_600_000)).toBe(
      "sync-channel-posts-42-1793577600000",
    )
    expect(channelPostSyncJobId("42", 1)).not.toContain(":")
  })

  test("differ for each queueing, so the next slice is never dropped while the previous job is still active", () => {
    expect(channelPostSyncJobId("42", 1)).not.toBe(
      channelPostSyncJobId("42", 2),
    )
  })
})

describe("channelPostSyncRetryDelayMs", () => {
  test.each([
    [1, 60_000],
    [2, 5 * 60_000],
    [3, 15 * 60_000],
    [4, 60 * 60_000],
    [5, 60 * 60_000],
    [99, 60 * 60_000],
    [0, 60_000],
  ])("attempt %s waits %s ms", (attempts, expected) => {
    expect(channelPostSyncRetryDelayMs(attempts)).toBe(expected)
  })

  test("the sync gives up after a handful of attempts", () => {
    expect(CHANNEL_POST_SYNC_MAX_ATTEMPTS).toBe(5)
  })
})

describe("claiming and settling", () => {
  const claim = { attempts: 1, claimToken: "tok", id: "7" }

  test("claim returns the row together with the token it generated", async () => {
    mocks.claim.mockResolvedValue({ id: "7", inboxId: "1" })

    const claimed = await channelPostSyncService.claim("1")

    expect(mocks.claim).toHaveBeenCalledWith(
      expect.objectContaining({ claimToken: "generated-token", inboxId: "1" }),
    )
    expect(claimed).toEqual({
      claimToken: "generated-token",
      id: "7",
      inboxId: "1",
    })
  })

  test("claim answers null when the sync is not queued", async () => {
    mocks.claim.mockResolvedValue(null)

    expect(await channelPostSyncService.claim("1")).toBeNull()
  })

  test("markNotConnected parks the row idle with no next time and the notConnected code", async () => {
    mocks.release.mockResolvedValue(true)

    await channelPostSyncService.markNotConnected(claim)

    expect(mocks.release.mock.calls[0]?.[0].outcome).toMatchObject({
      attempts: 0,
      lastErrorCategory: "notConnected",
      nextSyncAt: null,
    })
  })

  test("completeCycle schedules the next listing a full interval away and marks backfill done", async () => {
    mocks.release.mockResolvedValue(true)

    await channelPostSyncService.completeCycle(claim, 120)

    const call = mocks.release.mock.calls[0]?.[0]
    expect(call.markBackfillComplete).toBe(true)
    expect(call.markSynced).toBe(true)
    expect(call.outcome).toMatchObject({
      attempts: 0,
      lastError: null,
      resumeCursor: null,
      syncedCount: 120,
    })
    expect(call.outcome.nextSyncAt.getTime() - call.now.getTime()).toBe(
      CHANNEL_POST_SYNC_INTERVAL_MS,
    )
  })

  test("continueLater keeps the cursor, is due immediately and does not mark backfill done", async () => {
    mocks.release.mockResolvedValue(true)

    await channelPostSyncService.continueLater(claim, {
      resumeCursor: "cur",
      syncedCount: 500,
    })

    const call = mocks.release.mock.calls[0]?.[0]
    expect(call.markBackfillComplete).toBe(false)
    expect(call.markSynced).toBe(false)
    expect(call.outcome.resumeCursor).toBe("cur")
    expect(call.outcome.nextSyncAt).toEqual(call.now)
  })

  test("retryLater counts the attempt unless it is a rate limit", async () => {
    mocks.release.mockResolvedValue(true)
    const failure = {
      category: "network_error",
      delayMs: 60_000,
      message: "timeout",
      resumeCursor: "cur",
      syncedCount: 10,
    }

    await channelPostSyncService.retryLater(claim, {
      ...failure,
      countAttempt: true,
    })
    await channelPostSyncService.retryLater(claim, {
      ...failure,
      countAttempt: false,
    })

    expect(mocks.release.mock.calls[0]?.[0].outcome.attempts).toBe(2)
    expect(mocks.release.mock.calls[1]?.[0].outcome.attempts).toBe(1)
    expect(mocks.release.mock.calls[0]?.[0].outcome.nextSyncAt.getTime()).toBe(
      mocks.release.mock.calls[0]?.[0].now.getTime() + 60_000,
    )
  })

  test("fail stops the sync with the category the UI keys a re-authorisation on", async () => {
    mocks.markFailed.mockResolvedValue(true)

    await channelPostSyncService.fail(claim, {
      category: "auth_failed",
      message: "token expired",
    })

    expect(mocks.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        claimToken: "tok",
        id: "7",
        lastError: "token expired",
        lastErrorCategory: "auth_failed",
      }),
    )
  })

  test("every settle reports whether the worker still owned the row", async () => {
    mocks.release.mockResolvedValue(false)
    mocks.saveProgress.mockResolvedValue(false)

    expect(await channelPostSyncService.completeCycle(claim, 1)).toBe(false)
    expect(
      await channelPostSyncService.saveProgress(claim, {
        resumeCursor: null,
        syncedCount: 1,
      }),
    ).toBe(false)
  })
})

describe("channelPostSyncService.resetAfterAuthChange", () => {
  test("hands the inbox and workspace to the repository on the caller's transaction", async () => {
    const result = await channelPostSyncService.resetAfterAuthChange(
      { inboxId: "1", workspaceId: "ws-1" },
      tx as never,
    )

    expect(result).toBe(true)
    expect(mocks.resetAfterAuthChange).toHaveBeenCalledWith(
      { inboxId: "1", workspaceId: "ws-1" },
      tx,
    )
  })
})

describe("channelPostSyncService.recordPage", () => {
  const item = (externalPostId: string) => ({
    authorExternalId: null,
    authorName: null,
    caption: "Hello",
    commentsCount: 3,
    contentType: "photo" as const,
    externalPostId,
    liveStatus: null,
    mediaType: "added_photos",
    permalink: null,
    publishedAt: null,
    reactionsCount: null,
    sharesCount: 0,
    thumbnailUrl: `https://cdn.example/${externalPostId}.jpg`,
    viewsCount: null,
  })
  const base = {
    channel: "messenger",
    inboxId: "11",
    integrationId: "5",
    sourceAccountId: "page-1",
    thumbnailDeadline: 123,
    workspaceId: "ws-1",
  }

  test("upserts the page for the inbox and then re-hosts the missing thumbnails", async () => {
    mocks.upsertListedChannelPosts.mockResolvedValue(undefined)
    mocks.rehostListedThumbnails.mockResolvedValue(undefined)

    await channelPostSyncService.recordPage({
      ...base,
      items: [item("a"), item("b")],
    })

    const upsert = mocks.upsertListedChannelPosts.mock.calls[0]?.[0]
    expect(upsert.target).toEqual({
      channel: "messenger",
      inboxId: "11",
      integrationId: "5",
      sourceAccountId: "page-1",
      workspaceId: "ws-1",
    })
    expect(
      upsert.posts.map(
        (post: { externalPostId: string }) => post.externalPostId,
      ),
    ).toEqual(["a", "b"])
    expect(upsert.posts[0]).not.toHaveProperty("thumbnailUrl")
    expect(mocks.rehostListedThumbnails).toHaveBeenCalledWith({
      channel: "messenger",
      deadline: 123,
      posts: [
        { externalPostId: "a", thumbnailUrl: "https://cdn.example/a.jpg" },
        { externalPostId: "b", thumbnailUrl: "https://cdn.example/b.jpg" },
      ],
      workspaceId: "ws-1",
    })
  })

  test("skips a post with no id", async () => {
    mocks.upsertListedChannelPosts.mockResolvedValue(undefined)
    mocks.rehostListedThumbnails.mockResolvedValue(undefined)

    await channelPostSyncService.recordPage({
      ...base,
      items: [item(""), item("a")],
    })

    expect(
      mocks.upsertListedChannelPosts.mock.calls[0]?.[0].posts,
    ).toHaveLength(1)
  })
})

describe("post refresh", () => {
  test("queues one background refresh per post for a post that exists on a listed channel", async () => {
    mocks.findRefreshTarget.mockResolvedValue({ channel: "messenger", id: "9" })

    const result = await channelPostSyncService.requestPostRefresh({
      id: "9",
      workspaceId: "ws-1",
    })

    expect(result).toEqual({ queued: true })
    expect(mocks.lowQueueAdd).toHaveBeenCalledWith(
      "refreshChannelPost",
      {
        data: { channelPostId: "9", workspaceId: "ws-1" },
        type: "refreshChannelPost",
      },
      {
        attempts: 1,
        // Kept for the 60 s cooldown, so a repeat of the same job id is dropped.
        jobId: "refresh-channel-post-9",
        removeOnComplete: { age: 60 },
        removeOnFail: { age: 60 },
      },
    )
  })

  test.each([
    ["a missing post", null],
    ["a post on a channel with no post list", { channel: "whatsapp", id: "9" }],
  ])("is not found for %s", async (_label, target) => {
    mocks.findRefreshTarget.mockResolvedValue(target)

    await expect(
      channelPostSyncService.requestPostRefresh({
        id: "9",
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({ code: "notFound" })
    expect(mocks.lowQueueAdd).not.toHaveBeenCalled()
  })

  test("markPostRemoved hides the post inside its workspace", async () => {
    mocks.markRemoved.mockResolvedValue(undefined)

    await channelPostSyncService.markPostRemoved({
      id: "9",
      workspaceId: "ws-1",
    })

    expect(mocks.markRemoved).toHaveBeenCalledWith(
      expect.objectContaining({ id: "9", workspaceId: "ws-1" }),
    )
  })
})

describe("channelPostSyncService.commitPage", () => {
  const claimRef = { claimToken: "tok", id: "7" }
  const item = (externalPostId: string) => ({
    authorExternalId: null,
    authorName: null,
    caption: "Hello",
    commentsCount: 3,
    contentType: "photo" as const,
    externalPostId,
    liveStatus: null,
    mediaType: "added_photos",
    permalink: null,
    publishedAt: null,
    reactionsCount: null,
    sharesCount: 0,
    thumbnailUrl: `https://cdn.example/${externalPostId}.jpg`,
    viewsCount: null,
  })
  const page = {
    channel: "messenger",
    inboxId: "11",
    integrationId: "5",
    items: [item("a")],
    sourceAccountId: "page-1",
    thumbnailDeadline: 123,
    workspaceId: "ws-1",
  }
  const commit = (outcome: "complete" | "continueLater" | "progress") =>
    channelPostSyncService.commitPage({
      claim: claimRef,
      outcome,
      page,
      resumeCursor: "c2",
      syncedCount: 100,
    })

  beforeEach(() => {
    mocks.upsertListedChannelPosts.mockResolvedValue(undefined)
    mocks.rehostListedThumbnails.mockResolvedValue(undefined)
    mocks.saveProgress.mockResolvedValue(true)
    mocks.release.mockResolvedValue(true)
  })

  test("writes the page and the fenced position on the same transaction, then re-hosts thumbnails", async () => {
    const order: string[] = []
    mocks.upsertListedChannelPosts.mockImplementation(() => {
      order.push("upsert")
      return Promise.resolve()
    })
    mocks.saveProgress.mockImplementation(() => {
      order.push("fence")
      return Promise.resolve(true)
    })
    mocks.rehostListedThumbnails.mockImplementation(() => {
      order.push("thumbnails")
      return Promise.resolve()
    })

    const kept = await commit("progress")

    expect(kept).toBe(true)
    expect(order).toEqual(["upsert", "fence", "thumbnails"])
    expect(mocks.upsertListedChannelPosts.mock.calls[0]?.[1]).toBe(tx)
    expect(mocks.saveProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        claimToken: "tok",
        id: "7",
        resumeCursor: "c2",
        syncedCount: 100,
      }),
      tx,
    )
  })

  test("a worker that was taken over rolls the page back, re-hosts nothing and reports it", async () => {
    mocks.saveProgress.mockResolvedValue(false)

    const kept = await commit("progress")

    expect(kept).toBe(false)
    // The upsert ran inside the transaction that is rolled back by the throw.
    expect(mocks.upsertListedChannelPosts).toHaveBeenCalledTimes(1)
    expect(mocks.rehostListedThumbnails).not.toHaveBeenCalled()
  })

  test.each([
    ["continueLater", { markBackfillComplete: false, markSynced: false }],
    ["complete", { markBackfillComplete: true, markSynced: true }],
    // The 2,000-post cap ends the cycle but never proves the backlog was read.
    ["capped", { markBackfillComplete: false, markSynced: true }],
  ] as const)("%s releases the row through the same transaction", async (outcome, flags) => {
    await commit(outcome)

    expect(mocks.release).toHaveBeenCalledTimes(1)
    expect(mocks.release.mock.calls[0]?.[0]).toMatchObject({
      claimToken: "tok",
      id: "7",
      ...flags,
    })
    expect(mocks.release.mock.calls[0]?.[1]).toBe(tx)
    expect(mocks.saveProgress).not.toHaveBeenCalled()
  })

  test("a lost claim at release is the same clean stop", async () => {
    mocks.release.mockResolvedValue(false)

    expect(await commit("complete")).toBe(false)
    expect(mocks.rehostListedThumbnails).not.toHaveBeenCalled()
  })

  test("any other failure propagates so the job retries", async () => {
    mocks.upsertListedChannelPosts.mockRejectedValue(new Error("db down"))

    await expect(commit("progress")).rejects.toThrow("db down")
    expect(mocks.saveProgress).not.toHaveBeenCalled()
  })
})

describe("channelPostSyncService.workspaceTimezone", () => {
  test("reads the workspace zone and falls back to UTC when it cannot be read", async () => {
    mocks.findWorkspaceTimezone.mockResolvedValueOnce("Asia/Ho_Chi_Minh")
    expect(await channelPostSyncService.workspaceTimezone("ws-1")).toBe(
      "Asia/Ho_Chi_Minh",
    )
    mocks.findWorkspaceTimezone.mockResolvedValueOnce(null)
    expect(await channelPostSyncService.workspaceTimezone("ws-1")).toBe("UTC")
  })
})

describe("channelPostSyncService.reconcilePhoneCount", () => {
  const input = { id: "post-9", workspaceId: "ws-1" }

  test("sets the stored count to what the comments say, bounded by the recount limit", async () => {
    mocks.countPhoneComments.mockResolvedValue({ capped: false, count: 7 })
    mocks.setPhoneCommentsCount.mockResolvedValue(true)

    const result = await channelPostSyncService.reconcilePhoneCount(input)

    expect(mocks.countPhoneComments).toHaveBeenCalledWith({
      limit: CHANNEL_POST_PHONE_RECOUNT_LIMIT,
      postId: "post-9",
      workspaceId: "ws-1",
    })
    // A set, not an increment: it repairs a short count and cannot double one.
    expect(mocks.setPhoneCommentsCount).toHaveBeenCalledWith({
      count: 7,
      id: "post-9",
      workspaceId: "ws-1",
    })
    expect(result).toEqual({ count: 7, repaired: true, skipped: false })
  })

  test("a count that already matches is not a repair", async () => {
    mocks.countPhoneComments.mockResolvedValue({ capped: false, count: 3 })
    mocks.setPhoneCommentsCount.mockResolvedValue(false)

    expect(await channelPostSyncService.reconcilePhoneCount(input)).toEqual({
      count: 3,
      repaired: false,
      skipped: false,
    })
  })

  test("a post with more phone comments than the limit keeps its count: a lower bound must not shrink it", async () => {
    mocks.countPhoneComments.mockResolvedValue({
      capped: true,
      count: CHANNEL_POST_PHONE_RECOUNT_LIMIT,
    })

    const result = await channelPostSyncService.reconcilePhoneCount(input)

    expect(mocks.setPhoneCommentsCount).not.toHaveBeenCalled()
    expect(result).toMatchObject({ repaired: false, skipped: true })
  })

  test("a post whose threads hit the lookup cap is skipped, so its counter is not lowered", async () => {
    // What `countPhoneComments` reports when the thread lookup was capped.
    mocks.countPhoneComments.mockResolvedValue({ capped: true, count: 0 })

    const result = await channelPostSyncService.reconcilePhoneCount(input)

    expect(mocks.setPhoneCommentsCount).not.toHaveBeenCalled()
    expect(result).toMatchObject({ repaired: false, skipped: true })
  })

  test("under every cap the counter is set", async () => {
    mocks.countPhoneComments.mockResolvedValue({ capped: false, count: 9 })
    mocks.setPhoneCommentsCount.mockResolvedValue(true)

    const result = await channelPostSyncService.reconcilePhoneCount(input)

    expect(mocks.setPhoneCommentsCount).toHaveBeenCalledWith(
      expect.objectContaining({ count: 9 }),
    )
    expect(result).toMatchObject({ repaired: true, skipped: false })
  })

  test("a read failure propagates and writes nothing", async () => {
    mocks.countPhoneComments.mockRejectedValue(new Error("shard down"))

    await expect(
      channelPostSyncService.reconcilePhoneCount(input),
    ).rejects.toThrow("shard down")
    expect(mocks.setPhoneCommentsCount).not.toHaveBeenCalled()
  })

  test("the recount limit is a named bound", () => {
    expect(CHANNEL_POST_PHONE_RECOUNT_LIMIT).toBe(10_000)
  })
})
