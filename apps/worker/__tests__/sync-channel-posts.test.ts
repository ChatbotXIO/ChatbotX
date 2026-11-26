import { ChannelError, ChannelErrorCategory } from "@chatbotx.io/sdk"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  commitPage: vi.fn(),
  fail: vi.fn(),
  isForeignKeyViolationError: vi.fn(() => false),
  listPosts: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  markNotConnected: vi.fn(),
  resolvePostIntegration: vi.fn(),
  retryDelay: vi.fn((attempts: number) => attempts * 1000),
  retryLater: vi.fn(),
  workspaceTimezone: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  CHANNEL_POST_SYNC_JOB_BUDGET_MS: 60_000,
  CHANNEL_POST_SYNC_MAX_ATTEMPTS: 5,
  CHANNEL_POST_SYNC_MAX_PAGES_PER_JOB: 5,
  CHANNEL_POST_SYNC_MAX_POSTS_PER_CYCLE: 2000,
  CHANNEL_POST_SYNC_PAGE_SIZE: 100,
  CHANNEL_POST_SYNC_RATE_LIMIT_BACKOFF_MS: 900_000,
  channelPostSyncRetryDelayMs: mocks.retryDelay,
  channelPostSyncService: {
    claim: mocks.claim,
    commitPage: mocks.commitPage,
    fail: mocks.fail,
    markNotConnected: mocks.markNotConnected,
    retryLater: mocks.retryLater,
    workspaceTimezone: mocks.workspaceTimezone,
  },
}))
vi.mock("@chatbotx.io/channel-registry", () => ({
  INTEGRATION_AUTH_MISSING_CODE: "integration_auth_missing",
}))
vi.mock("@chatbotx.io/database/client", () => ({
  isForeignKeyViolationError: mocks.isForeignKeyViolationError,
}))
vi.mock("../src/lib/logger", () => ({
  logger: { info: mocks.loggerInfo, warn: mocks.loggerWarn },
}))
vi.mock("../src/channel-post-sync/resolve-post-integration", () => ({
  resolvePostIntegration: mocks.resolvePostIntegration,
}))

const { classifyFailure, syncChannelPosts } = await import(
  "../src/channel-post-sync/sync-channel-posts"
)

const claim = (overrides: Record<string, unknown> = {}) => ({
  attempts: 0,
  backfillCompletedAt: null,
  channel: "messenger",
  claimToken: "tok",
  id: "7",
  inboxId: "11",
  resumeCursor: null,
  syncedCount: 0,
  workspaceId: "ws-1",
  ...overrides,
})

const items = (count: number, from = 0) =>
  Array.from({ length: count }, (_, index) => ({
    externalPostId: `ext-${from + index}`,
  }))

const page = (count: number, nextCursor: string | null, from = 0) => ({
  items: items(count, from),
  nextCursor,
})

const data = { inboxId: "11", workspaceId: "ws-1" }

beforeEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
  mocks.claim.mockResolvedValue(claim())
  mocks.resolvePostIntegration.mockResolvedValue({
    channel: "messenger",
    ctx: { kind: "ctx" },
    integration: { runChannelHandler: mocks.listPosts },
    integrationId: "5",
    sourceAccountId: "page-1",
  })
  mocks.workspaceTimezone.mockResolvedValue("Asia/Ho_Chi_Minh")
  mocks.commitPage.mockResolvedValue(true)
  mocks.retryLater.mockResolvedValue(true)
  mocks.fail.mockResolvedValue(true)
  mocks.markNotConnected.mockResolvedValue(true)
  mocks.isForeignKeyViolationError.mockReturnValue(false)
})

/** The `n`th committed page: its outcome, cursor, count and the posts written. */
const committed = (index: number) => mocks.commitPage.mock.calls[index]?.[0]

describe("syncChannelPosts", () => {
  test("does nothing when the sync is no longer queued", async () => {
    mocks.claim.mockResolvedValue(null)

    await syncChannelPosts(data)

    expect(mocks.resolvePostIntegration).not.toHaveBeenCalled()
    expect(mocks.listPosts).not.toHaveBeenCalled()
  })

  test("reads a one-page listing, writes it for the inbox and completes the cycle in one commit", async () => {
    mocks.listPosts.mockResolvedValueOnce(page(3, null))

    await syncChannelPosts(data)

    expect(mocks.listPosts).toHaveBeenCalledWith("post", "listPosts", {
      ctx: { kind: "ctx" },
      data: { cursor: undefined, limit: 100 },
    })
    expect(mocks.commitPage).toHaveBeenCalledTimes(1)
    expect(committed(0)).toMatchObject({
      claim: { claimToken: "tok" },
      outcome: "complete",
      page: {
        channel: "messenger",
        inboxId: "11",
        integrationId: "5",
        observedAt: expect.any(Date),
        sourceAccountId: "page-1",
        timezone: "Asia/Ho_Chi_Minh",
        workspaceId: "ws-1",
      },
      syncedCount: 3,
    })
    expect(committed(0).page.items).toHaveLength(3)
  })

  test("hands the rest to the next tick after five pages, with the cursor it reached", async () => {
    for (let index = 0; index < 5; index++) {
      mocks.listPosts.mockResolvedValueOnce(
        page(100, `c${index + 1}`, index * 100),
      )
    }

    await syncChannelPosts(data)

    expect(mocks.listPosts).toHaveBeenCalledTimes(5)
    expect(mocks.commitPage.mock.calls.map(([call]) => call.outcome)).toEqual([
      "progress",
      "progress",
      "progress",
      "progress",
      "continueLater",
    ])
    expect(committed(4)).toMatchObject({ resumeCursor: "c5", syncedCount: 500 })
  })

  test("commits each page with its position, which is also the heartbeat", async () => {
    mocks.listPosts
      .mockResolvedValueOnce(page(100, "c1"))
      .mockResolvedValueOnce(page(10, null, 100))

    await syncChannelPosts(data)

    expect(committed(0)).toMatchObject({
      outcome: "progress",
      resumeCursor: "c1",
      syncedCount: 100,
    })
    expect(committed(1)).toMatchObject({
      outcome: "complete",
      syncedCount: 110,
    })
    expect(mocks.listPosts.mock.calls[1]?.[2].data.cursor).toBe("c1")
  })

  test("resumes an unfinished listing from its cursor and keeps counting", async () => {
    mocks.claim.mockResolvedValue(
      claim({ resumeCursor: "saved", syncedCount: 300 }),
    )
    mocks.listPosts.mockResolvedValueOnce(page(20, null))

    await syncChannelPosts(data)

    expect(mocks.listPosts.mock.calls[0]?.[2].data.cursor).toBe("saved")
    expect(committed(0)).toMatchObject({
      outcome: "complete",
      syncedCount: 320,
    })
  })

  test("a new cycle after a finished one starts from zero, not from the last count", async () => {
    mocks.claim.mockResolvedValue(
      claim({ resumeCursor: null, syncedCount: 1500 }),
    )
    mocks.listPosts.mockResolvedValueOnce(page(5, null))

    await syncChannelPosts(data)

    expect(committed(0)).toMatchObject({ syncedCount: 5 })
  })

  test("stops at the per-cycle cap and writes no more than the cap", async () => {
    mocks.claim.mockResolvedValue(
      claim({ resumeCursor: "c", syncedCount: 1950 }),
    )
    mocks.listPosts.mockResolvedValueOnce(page(100, "more"))

    await syncChannelPosts(data)

    expect(committed(0).page.items).toHaveLength(50)
    // The cap ended the cycle but the listing was not read to its end, so the
    // backfill must not be recorded as complete.
    expect(committed(0)).toMatchObject({
      outcome: "capped",
      syncedCount: 2000,
    })
  })

  test("a listing that ends exactly at the cap is still a complete one", async () => {
    mocks.claim.mockResolvedValue(
      claim({ resumeCursor: "c", syncedCount: 1950 }),
    )
    mocks.listPosts.mockResolvedValueOnce(page(50, null))

    await syncChannelPosts(data)

    expect(committed(0)).toMatchObject({
      outcome: "complete",
      syncedCount: 2000,
    })
  })

  test("hands over once the time budget is spent, even before five pages", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-11-22T10:00:00.000Z"))
    mocks.listPosts.mockImplementationOnce(() => {
      vi.setSystemTime(new Date("2026-11-22T10:01:01.000Z"))
      return Promise.resolve(page(100, "c1"))
    })

    await syncChannelPosts(data)

    expect(mocks.listPosts).toHaveBeenCalledTimes(1)
    expect(committed(0)).toMatchObject({
      outcome: "continueLater",
      resumeCursor: "c1",
      syncedCount: 100,
    })
  })

  test("passes a thumbnail deadline inside the job budget", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-11-22T10:00:00.000Z"))
    mocks.listPosts.mockResolvedValueOnce(page(1, null))

    await syncChannelPosts(data)

    expect(committed(0).page.thumbnailDeadline).toBe(
      new Date("2026-11-22T10:01:00.000Z").getTime(),
    )
  })

  test("a worker taken over writes nothing more: the commit reports it and the read stops", async () => {
    mocks.listPosts.mockResolvedValue(page(100, "c1"))
    // The fenced commit touched no row: the page was rolled back, not written.
    mocks.commitPage.mockResolvedValueOnce(false)

    await syncChannelPosts(data)

    expect(mocks.listPosts).toHaveBeenCalledTimes(1)
    expect(mocks.commitPage).toHaveBeenCalledTimes(1)
    expect(mocks.retryLater).not.toHaveBeenCalled()
    expect(mocks.fail).not.toHaveBeenCalled()
    expect(mocks.loggerWarn).toHaveBeenCalled()
  })

  test("takeover of a finishing page is logged, never thrown", async () => {
    mocks.listPosts.mockResolvedValueOnce(page(3, null))
    mocks.commitPage.mockResolvedValueOnce(false)

    await expect(syncChannelPosts(data)).resolves.toBeUndefined()
    expect(mocks.loggerWarn).toHaveBeenCalled()
  })

  test("a committed position is the one a retry resumes from", async () => {
    mocks.listPosts
      .mockResolvedValueOnce(page(100, "c1"))
      .mockRejectedValueOnce(
        new ChannelError("timeout", ChannelErrorCategory.NETWORK_ERROR),
      )
    mocks.commitPage.mockResolvedValueOnce(true)

    await syncChannelPosts(data)

    expect(mocks.retryLater).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ resumeCursor: "c1", syncedCount: 100 }),
    )
  })

  test("a failed commit leaves the previous position for the retry", async () => {
    mocks.listPosts.mockResolvedValueOnce(page(100, "c1"))
    mocks.commitPage.mockRejectedValueOnce(new Error("connection reset"))

    await syncChannelPosts(data)

    expect(mocks.retryLater).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ resumeCursor: null, syncedCount: 0 }),
    )
  })

  test("a deleted workspace or inbox ends the sync quietly", async () => {
    const gone = new Error("foreign key")
    mocks.listPosts.mockResolvedValueOnce(page(3, null))
    mocks.commitPage.mockRejectedValueOnce(gone)
    mocks.isForeignKeyViolationError.mockImplementation((err) => err === gone)

    await syncChannelPosts(data)

    expect(mocks.retryLater).not.toHaveBeenCalled()
    expect(mocks.fail).not.toHaveBeenCalled()
  })
})

describe("syncChannelPosts failures", () => {
  test("a rate limit waits fifteen minutes without counting as an attempt and keeps the position", async () => {
    mocks.listPosts
      .mockResolvedValueOnce(page(100, "c1"))
      .mockRejectedValueOnce(
        new ChannelError("slow down", ChannelErrorCategory.RATE_LIMITED),
      )

    await syncChannelPosts(data)

    expect(mocks.retryLater).toHaveBeenCalledWith(
      expect.objectContaining({ claimToken: "tok" }),
      {
        category: "rate_limited",
        countAttempt: false,
        delayMs: 900_000,
        message: "slow down",
        permanent: false,
        resumeCursor: "c1",
        syncedCount: 100,
      },
    )
  })

  test("a missing integration parks the sync as not connected: not failed, not retried", async () => {
    mocks.resolvePostIntegration.mockRejectedValueOnce(
      new ChannelError(
        "Unable to find integration auth for channel: messenger",
        ChannelErrorCategory.AUTH_FAILED,
        { code: "integration_auth_missing" },
      ),
    )

    await syncChannelPosts(data)

    expect(mocks.markNotConnected).toHaveBeenCalledWith(
      expect.objectContaining({ claimToken: "tok" }),
    )
    expect(mocks.fail).not.toHaveBeenCalled()
    expect(mocks.retryLater).not.toHaveBeenCalled()
  })

  test("any other authorisation failure still fails the sync", async () => {
    mocks.resolvePostIntegration.mockRejectedValueOnce(
      new ChannelError("denied", ChannelErrorCategory.AUTH_FAILED, {
        code: "other",
      }),
    )

    await syncChannelPosts(data)

    expect(mocks.markNotConnected).not.toHaveBeenCalled()
    expect(mocks.fail).toHaveBeenCalled()
  })

  test("an authorisation failure stops the sync with its category", async () => {
    mocks.listPosts.mockRejectedValueOnce(
      new ChannelError("token expired", ChannelErrorCategory.AUTH_FAILED),
    )

    await syncChannelPosts(data)

    expect(mocks.fail).toHaveBeenCalledWith(
      expect.objectContaining({ claimToken: "tok" }),
      expect.objectContaining({
        category: "auth_failed",
        message: "token expired",
      }),
    )
    expect(mocks.retryLater).not.toHaveBeenCalled()
  })

  test("a missing integration fails the sync instead of retrying forever", async () => {
    mocks.resolvePostIntegration.mockRejectedValueOnce(
      new ChannelError("no auth", ChannelErrorCategory.AUTH_FAILED),
    )

    await syncChannelPosts(data)

    expect(mocks.fail).toHaveBeenCalled()
    expect(mocks.listPosts).not.toHaveBeenCalled()
  })

  test("an unknown error is retried with a growing wait and counts as an attempt", async () => {
    mocks.claim.mockResolvedValue(claim({ attempts: 1 }))
    mocks.listPosts.mockRejectedValueOnce(new Error("socket hang up"))

    await syncChannelPosts(data)

    expect(mocks.retryDelay).toHaveBeenCalledWith(2)
    expect(mocks.retryLater).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ countAttempt: true, delayMs: 2000 }),
    )
  })

  test("runs out of attempts: the fifth failure stops the sync", async () => {
    mocks.claim.mockResolvedValue(claim({ attempts: 4 }))
    mocks.listPosts.mockRejectedValueOnce(new Error("still failing"))

    await syncChannelPosts(data)

    expect(mocks.fail).toHaveBeenCalled()
    expect(mocks.retryLater).not.toHaveBeenCalled()
  })

  test("a failure that finds the row taken over is logged, never thrown", async () => {
    mocks.listPosts.mockRejectedValueOnce(new Error("boom"))
    mocks.retryLater.mockResolvedValueOnce(false)

    await expect(syncChannelPosts(data)).resolves.toBeUndefined()
    expect(mocks.loggerWarn).toHaveBeenCalledTimes(2)
  })
})

describe("syncChannelPosts with a stale resume cursor", () => {
  test("a resume cursor the channel rejects restarts the listing instead of failing the sync", async () => {
    mocks.claim.mockResolvedValue(
      claim({ resumeCursor: "old", syncedCount: 700 }),
    )
    mocks.listPosts.mockRejectedValueOnce(
      new ChannelError("bad cursor", ChannelErrorCategory.PAYLOAD_INVALID),
    )

    await syncChannelPosts(data)

    expect(mocks.fail).not.toHaveBeenCalled()
    expect(mocks.retryLater).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        countAttempt: true,
        resumeCursor: null,
        syncedCount: 0,
      }),
    )
  })

  test("a rejected cursor deeper in the job keeps the progress already written", async () => {
    mocks.claim.mockResolvedValue(
      claim({ resumeCursor: "old", syncedCount: 700 }),
    )
    mocks.listPosts
      .mockResolvedValueOnce(page(100, "c2", 700))
      .mockRejectedValueOnce(
        new ChannelError("bad cursor", ChannelErrorCategory.PAYLOAD_INVALID),
      )

    await syncChannelPosts(data)

    // No restart from page 1: the rejected cursor was received in this job.
    expect(mocks.retryLater).not.toHaveBeenCalled()
    expect(mocks.fail).toHaveBeenCalled()
  })

  test("an error that is not the channel's (a database blip) keeps the cursor", async () => {
    mocks.claim.mockResolvedValue(
      claim({ resumeCursor: "old", syncedCount: 700 }),
    )
    mocks.listPosts.mockRejectedValueOnce(new Error("deadlock detected"))

    await syncChannelPosts(data)

    expect(mocks.retryLater).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ resumeCursor: "old", syncedCount: 700 }),
    )
  })

  test("a network error keeps the cursor: it is not the cursor's fault", async () => {
    mocks.claim.mockResolvedValue(
      claim({ resumeCursor: "old", syncedCount: 700 }),
    )
    mocks.listPosts.mockRejectedValueOnce(
      new ChannelError("timeout", ChannelErrorCategory.NETWORK_ERROR),
    )

    await syncChannelPosts(data)

    expect(mocks.retryLater).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ resumeCursor: "old", syncedCount: 700 }),
    )
  })

  test("a rejected payload with no cursor to blame stays a permanent failure", async () => {
    mocks.listPosts.mockRejectedValueOnce(
      new ChannelError("bad request", ChannelErrorCategory.PAYLOAD_INVALID),
    )

    await syncChannelPosts(data)

    expect(mocks.fail).toHaveBeenCalled()
    expect(mocks.retryLater).not.toHaveBeenCalled()
  })

  test("a rejected cursor with no attempts left stops the sync", async () => {
    mocks.claim.mockResolvedValue(
      claim({ attempts: 4, resumeCursor: "old", syncedCount: 700 }),
    )
    mocks.listPosts.mockRejectedValueOnce(
      new ChannelError("bad cursor", ChannelErrorCategory.PAYLOAD_INVALID),
    )

    await syncChannelPosts(data)

    expect(mocks.fail).toHaveBeenCalled()
    expect(mocks.retryLater).not.toHaveBeenCalled()
  })
})

describe("classifyFailure", () => {
  test.each([
    [ChannelErrorCategory.AUTH_FAILED, "permanent"],
    [ChannelErrorCategory.PERMISSION_DENIED, "permanent"],
    [ChannelErrorCategory.PAYLOAD_INVALID, "permanent"],
    [ChannelErrorCategory.NOT_FOUND, "permanent"],
    [ChannelErrorCategory.NETWORK_ERROR, "retry"],
    [ChannelErrorCategory.UNKNOWN, "retry"],
  ])("a %s error is %s", (category, kind) => {
    expect(classifyFailure(new ChannelError("x", category), 0).permanent).toBe(
      kind === "permanent",
    )
  })

  test("never keeps more than 500 characters of the message", () => {
    const failure = classifyFailure(new Error("x".repeat(5000)), 0)

    expect(failure.message).toHaveLength(500)
  })

  test("a non-error value is still classified", () => {
    expect(classifyFailure("oops", 0)).toMatchObject({
      category: null,
      message: "oops",
      permanent: false,
    })
  })
})
