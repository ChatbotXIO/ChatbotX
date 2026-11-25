import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  exists: vi.fn(),
  isLockAcquisitionError: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  runExclusive: vi.fn(),
  runFeed: vi.fn(),
  scanDue: vi.fn(),
  withBlockedOwnerGuard: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  socialPostFeedRunner: { runFeed: mocks.runFeed, scanDue: mocks.scanDue },
  socialPostPartPublishService: { runPart: vi.fn() },
  socialPostPublishService: { runTarget: vi.fn() },
  socialPostRemoveService: { runRemoval: vi.fn() },
  registerFeedFetcher: vi.fn(),
  withBlockedOwnerGuard: mocks.withBlockedOwnerGuard,
}))
vi.mock("@chatbotx.io/business/net/feed-fetch", () => ({ fetchFeed: vi.fn() }))
vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
  }),
}))
vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: { runExclusive: mocks.runExclusive },
  distributedStore: { exists: mocks.exists },
  isLockAcquisitionError: mocks.isLockAcquisitionError,
}))
vi.mock("../src/lib/run-job-with-audit-context", () => ({
  runJobWithAuditContext: async (_ctx: unknown, run: () => Promise<unknown>) =>
    await run(),
}))
vi.mock("../src/post-publish/publishers", () => ({ socialPublishers: {} }))

const { scanSocialPostFeeds } = await import(
  "../src/schedule/handlers/scan-social-post-feeds"
)
const { processPostPublishJob } = await import(
  "../src/post-publish/process-job"
)

describe("scanSocialPostFeeds", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.runExclusive.mockImplementation(
      async ({ fn }: { fn: () => Promise<unknown> }) => await fn(),
    )
  })

  test("hands the due feeds to the queue under one lock shorter than the minute", async () => {
    mocks.scanDue.mockResolvedValue(3)

    const queued = await scanSocialPostFeeds()

    expect(queued).toBe(3)
    expect(mocks.runExclusive).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "schedule:scan-social-post-feeds",
        retryTimeoutInSeconds: 0,
        timeoutInSeconds: 50,
      }),
    )
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      { queued: 3 },
      expect.any(String),
    )
  })

  test("a tick that finds the previous run still holding the lock is skipped", async () => {
    const error = new Error("lock")
    mocks.runExclusive.mockRejectedValue(error)
    mocks.isLockAcquisitionError.mockReturnValue(true)
    mocks.exists.mockResolvedValue(true)

    await expect(scanSocialPostFeeds()).resolves.toBeUndefined()

    expect(mocks.loggerWarn).toHaveBeenCalled()
  })

  test("any other failure is rethrown", async () => {
    mocks.runExclusive.mockRejectedValue(new Error("boom"))
    mocks.isLockAcquisitionError.mockReturnValue(false)

    await expect(scanSocialPostFeeds()).rejects.toThrow("boom")
  })
})

describe("the runFeed job", () => {
  const job = {
    data: { feedId: "f-1", workspaceId: "ws-1" },
    type: "runFeed",
  } as const

  beforeEach(() => {
    vi.resetAllMocks()
  })

  test("checks the feed inside the owner guard", async () => {
    mocks.withBlockedOwnerGuard.mockImplementation(
      async (_id: string, run: () => Promise<unknown>) => await run(),
    )

    await processPostPublishJob(job)

    expect(mocks.runFeed).toHaveBeenCalledWith({
      id: "f-1",
      workspaceId: "ws-1",
    })
  })

  test("a blocked owner is a bare return: the feed is not checked", async () => {
    mocks.withBlockedOwnerGuard.mockResolvedValue(undefined)

    await processPostPublishJob(job)

    expect(mocks.runFeed).not.toHaveBeenCalled()
  })
})
