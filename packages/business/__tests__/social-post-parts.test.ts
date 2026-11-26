import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const quota = vi.hoisted(() => ({ room: true }))

const mocks = vi.hoisted(() => ({
  charge: vi.fn(),
  claimQuotaCharge: vi.fn(),
  releaseQuotaCharge: vi.fn(),
  announce: vi.fn(),
  claim: vi.fn(),
  claimExpired: vi.fn(),
  findExpiredClaim: vi.fn(),
  emit: vi.fn(),
  enqueue: vi.fn(),
  finishFromPart: vi.fn(),
  findForPublish: vi.fn(),
  findPartForPublish: vi.fn(),
  findTargetStatus: vi.fn(),
  firstUnsettled: vi.fn(),
  get: vi.fn(),
  loadCredentials: vi.fn(),
  link: vi.fn(),
  listForTargets: vi.fn(),
  lockPost: vi.fn(),
  recordAuth: vi.fn(),
  markStarted: vi.fn(),
  releaseClaim: vi.fn(),
  replyDefer: vi.fn(),
  partSettle: vi.fn(),
  resetForRetry: vi.fn(),
  resetTargetForRetry: vi.fn(),
  resolveAsPublished: vi.fn(),
  resumeForParts: vi.fn(),
  startFirst: vi.fn(),
  targetSettle: vi.fn(),
}))

const tx = { kind: "tx" }

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: async (run: (client: typeof tx) => Promise<unknown>) =>
      await run(tx),
  },
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  socialPostPartRepository: {
    claim: mocks.claim,
    claimExpired: mocks.claimExpired,
    findExpiredClaim: mocks.findExpiredClaim,
    findForPublish: mocks.findPartForPublish,
    firstUnsettled: mocks.firstUnsettled,
    listForTargets: mocks.listForTargets,
    markStarted: mocks.markStarted,
    releaseClaim: mocks.releaseClaim,
    resetForRetry: mocks.resetForRetry,
    resolveAsPublished: mocks.resolveAsPublished,
    settle: mocks.partSettle,
    startFirst: mocks.startFirst,
  },
  socialPostPublishRepository: {
    claimQuotaCharge: mocks.claimQuotaCharge,
    releaseQuotaCharge: mocks.releaseQuotaCharge,
    finishFromPart: mocks.finishFromPart,
    findForPublish: mocks.findForPublish,
    findTargetStatus: mocks.findTargetStatus,
    lockPost: mocks.lockPost,
    resetForRetry: mocks.resetTargetForRetry,
    resumeForParts: mocks.resumeForParts,
    setPostStatus: vi.fn(),
    settle: mocks.targetSettle,
    listTargetStatuses: async () => ["processing"],
  },
  socialPostSchedulingRepository: { countWaiting: async () => 0 },
}))
vi.mock("@chatbotx.io/worker-config", () => ({
  NEVER_MATCHING_LEASE_MS: 0,
  PostPublishJobAction: {
    checkPart: "checkPart",
    checkTarget: "checkTarget",
    publishPart: "publishPart",
    publishTarget: "publishTarget",
  },
  postCheckPartDueJobId: (id: string, due: number) =>
    `social-post-check-part-${id}-due-${due}`,
  postCheckPartJobId: (id: string, lease: number) =>
    `social-post-check-part-${id}-${lease}`,
  postPartJobId: (id: string) => `social-post-part-${id}`,
  postPublishJobId: (id: string) => `social-post-target-${id}`,
  postPublishQueue: { add: mocks.enqueue },
}))
vi.mock("../src/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))
vi.mock("../src/publish-destination/credentials", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../src/publish-destination/credentials")
  >()),
  loadPublishCredentials: mocks.loadCredentials,
  recordPublishAuthFailure: mocks.recordAuth,
}))
vi.mock("../src/workspace-lifecycle/with-blocked-owner-guard", () => ({
  withBlockedOwnerGuard: async (_id: string, run: () => Promise<unknown>) =>
    await run(),
}))
vi.mock("../src/message-usage/service", () => ({
  MESSAGE_QUOTA_EXCEEDED: "postMessageQuotaExceeded",
  messageUsageService: {
    charge: mocks.charge,
    hasRoom: async () => quota.room,
  },
}))
vi.mock("../src/social-post/notify", () => ({
  announceSettledTarget: mocks.announce,
  emitSocialPostChanged: mocks.emit,
}))
vi.mock("../src/social-post/service", () => ({
  socialPostService: { get: mocks.get },
}))
vi.mock("../src/social-post/publish-pace", () => ({
  replyQuotaDeferral: mocks.replyDefer,
}))
vi.mock("../src/social-post/link-channel-post", () => ({
  linkPublishedChannelPost: mocks.link,
}))

const { logger } = await import("../src/logger")
const { socialPostPartPublishService, replyTargetOf } = await import(
  "../src/social-post/publish-parts.service"
)

beforeEach(() => {
  quota.room = true
})

const WS = "ws-1"
const LEASE = new Date("2026-01-01T00:10:00Z")

/** What `loadPublishCredentials` answers for a ready Threads inbox. */
const credentials = (accessToken = "account-token") => ({
  credentials: {
    accessToken,
    destinationExternalId: "user-1",
    fence: {
      grantedScopes: null,
      integrationId: "g-1",
      integrationTable: "IntegrationThreads",
      kind: "inbox",
      provider: "threads",
      publishDestinationId: "dest-1",
      tokenFingerprint: "abc",
    },
    publisherKey: "threads",
  },
  ok: true,
})

const part = (overrides: Record<string, unknown> = {}) => ({
  accountId: null,
  accountStatus: null,
  attemptCount: 1,
  contentType: "text",
  continuation: null,
  destinationExternalId: null,
  destinationId: "dest-1",
  destinationIsActive: true,
  headExternalPostId: "head-1",
  id: "part-1",
  kind: "threadPart",
  options: {},
  position: 1,
  provider: "threads",
  publishStartedAt: null,
  rateLimitAttempts: 0,
  socialPostId: "p-1",
  socialPostTargetId: "t-1",
  status: "publishing",
  targetStatus: "processing",
  text: "second",
  workspaceId: WS,
  ...overrides,
})

const publisher = () => ({
  checkStatus: vi.fn(),
  delete: vi.fn(),
  publish: vi.fn(),
  publishPart: vi.fn(),
})

const partOutcome = (call = 0) => mocks.partSettle.mock.calls[call]?.[0].outcome

describe("replyTargetOf", () => {
  const siblings = [
    {
      externalPostId: "r1",
      kind: "threadPart",
      position: 1,
      status: "published",
    },
    {
      externalPostId: null,
      kind: "threadPart",
      position: 2,
      status: "published",
    },
    {
      externalPostId: null,
      kind: "threadPart",
      position: 3,
      status: "pending",
    },
    {
      externalPostId: null,
      kind: "firstComment",
      position: 4,
      status: "pending",
    },
  ] as const

  test("the first part answers the head", () => {
    expect(
      replyTargetOf({ kind: "threadPart", position: 1 }, siblings, "h"),
    ).toBe("h")
  })

  test("a thread part answers the previous part", () => {
    expect(
      replyTargetOf(
        { kind: "threadPart", position: 2 },
        [{ ...siblings[0] }],
        "h",
      ),
    ).toBe("r1")
  })

  test("a part marked published by a person has no id: the chain continues from the one before", () => {
    expect(
      replyTargetOf({ kind: "threadPart", position: 3 }, siblings, "h"),
    ).toBe("r1")
  })

  test("the first comment always answers the head", () => {
    expect(
      replyTargetOf({ kind: "firstComment", position: 4 }, siblings, "h"),
    ).toBe("h")
  })
})

describe("runPart", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.claim.mockResolvedValue({ attemptCount: 1, leaseUntil: LEASE })
    mocks.findPartForPublish.mockResolvedValue(part())
    mocks.findForPublish.mockResolvedValue({
      destinationExternalId: "user-1",
      externalPostId: "head-1",
      id: "t-1",
      permalink: "https://example.test/p/head-1",
      provider: "threads",
      publishedAt: new Date("2026-01-01T00:05:00Z"),
      socialPostId: "p-1",
      workspaceId: WS,
    })
    mocks.loadCredentials.mockResolvedValue(credentials("account-token"))
    mocks.listForTargets.mockResolvedValue([])
    mocks.markStarted.mockResolvedValue(true)
    mocks.partSettle.mockResolvedValue("t-1")
    mocks.lockPost.mockResolvedValue({ status: "publishing" })
    mocks.startFirst.mockResolvedValue(null)
    mocks.firstUnsettled.mockResolvedValue(null)
  })

  test("a lost claim (an earlier part is not published, or another worker took it) does nothing", async () => {
    mocks.claim.mockResolvedValue(null)
    const fake = publisher()

    const result = await socialPostPartPublishService.runPart(
      { id: "part-1", workspaceId: WS },
      { threads: fake },
    )

    expect(result).toBe("skipped")
    expect(fake.publishPart).not.toHaveBeenCalled()
    expect(mocks.partSettle).not.toHaveBeenCalled()
  })

  test("a used-up reply quota gives the claim back, sends nothing and spends no attempt", async () => {
    const until = new Date("2026-01-01T01:00:00Z")
    mocks.replyDefer.mockResolvedValue(until)
    mocks.releaseClaim.mockResolvedValue(true)
    const fake = publisher()

    const result = await socialPostPartPublishService.runPart(
      { id: "part-1", workspaceId: WS },
      { threads: fake },
    )

    expect(result).toBe("deferred")
    expect(mocks.releaseClaim).toHaveBeenCalledWith({
      fence: LEASE,
      id: "part-1",
      nextAttemptAt: until,
      workspaceId: WS,
    })
    expect(mocks.markStarted).not.toHaveBeenCalled()
    expect(fake.publishPart).not.toHaveBeenCalled()
    expect(mocks.partSettle).not.toHaveBeenCalled()
  })

  test("a deferral whose claim was lost reports the loss", async () => {
    mocks.replyDefer.mockResolvedValue(new Date())
    mocks.releaseClaim.mockResolvedValue(false)

    const result = await socialPostPartPublishService.runPart(
      { id: "part-1", workspaceId: WS },
      { threads: publisher() },
    )

    expect(result).toBe("claimLost")
  })

  test("two workers racing on one part: only the claimant publishes", async () => {
    mocks.claim
      .mockResolvedValueOnce({ attemptCount: 1, leaseUntil: LEASE })
      .mockResolvedValueOnce(null)
    const fake = publisher()
    fake.publishPart.mockResolvedValue({
      continuation: { containerId: "c1" },
      retryAfterMs: 30_000,
      status: "pending",
    })
    const run = () =>
      socialPostPartPublishService.runPart(
        { id: "part-1", workspaceId: WS },
        { threads: fake },
      )

    const results = await Promise.all([run(), run()])

    expect(results.sort()).toEqual(["settled", "skipped"])
    expect(fake.publishPart).toHaveBeenCalledTimes(1)
  })

  describe("the delayed check of a pending answer", () => {
    const START = new Date("2026-03-01T10:00:00.000Z")
    const runPending = async () => {
      const fake = publisher()
      fake.publishPart.mockResolvedValue({
        continuation: { containerId: "c1" },
        retryAfterMs: 30_000,
        status: "pending",
      })
      await socialPostPartPublishService.runPart(
        { id: "part-1", workspaceId: WS },
        { threads: fake },
      )
    }

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] })
      vi.setSystemTime(START)
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    test("is queued at the stored check time with it as the expected due time", async () => {
      await runPending()

      const stored = partOutcome().nextCheckAt as Date
      expect(stored.getTime()).toBe(START.getTime() + 30_000)
      expect(mocks.enqueue).toHaveBeenCalledWith(
        "checkPart",
        expect.objectContaining({
          data: expect.objectContaining({
            expectedDueAtMs: stored.getTime(),
            socialPostPartId: "part-1",
            workspaceId: WS,
          }),
        }),
        {
          delay: 30_000,
          jobId: `social-post-check-part-part-1-due-${stored.getTime()}`,
        },
      )
    })

    test("carries a legacy lease that never equals the stored fence, so a previous worker no-ops", async () => {
      await runPending()

      const stored = (partOutcome().nextCheckAt as Date).getTime()
      const data = (
        mocks.enqueue.mock.calls[0]?.[1] as {
          data: { expectedDueAtMs: number; leaseUntilMs: number }
        }
      ).data
      expect(data.leaseUntilMs).not.toBe(stored)
      expect(data.leaseUntilMs).toBe(0)
    })

    test("is not queued when the claim was lost", async () => {
      mocks.partSettle.mockResolvedValue(null)

      await runPending()

      expect(mocks.enqueue).not.toHaveBeenCalled()
    })

    test("a queue that refuses it is logged and the scan stays the fallback", async () => {
      mocks.enqueue.mockRejectedValue(new Error("redis down"))

      await expect(runPending()).resolves.toBeUndefined()

      expect(logger.warn).toHaveBeenCalled()
    })

    test("a check time already past gets a zero delay", async () => {
      mocks.partSettle.mockImplementation(() => {
        vi.setSystemTime(new Date(START.getTime() + 90_000))
        return Promise.resolve("t-1")
      })

      await runPending()

      expect(mocks.enqueue.mock.calls[0]?.[2]).toMatchObject({ delay: 0 })
    })
  })

  test("the marker is written before the call; the first part replies to the head", async () => {
    const order: string[] = []
    mocks.markStarted.mockImplementation(() => {
      order.push("marker")
      return Promise.resolve(true)
    })
    const fake = publisher()
    fake.publishPart.mockImplementation(() => {
      order.push("publish")
      return Promise.resolve({
        continuation: { containerId: "c1" },
        retryAfterMs: 30_000,
        status: "pending",
      })
    })

    await socialPostPartPublishService.runPart(
      { id: "part-1", workspaceId: WS },
      { threads: fake },
    )

    expect(order).toEqual(["marker", "publish"])
    expect(fake.publishPart).toHaveBeenCalledWith({
      accessToken: "account-token",
      destinationExternalId: "user-1",
      kind: "threadPart",
      replyToExternalPostId: "head-1",
      text: "second",
    })
    expect(partOutcome()).toMatchObject({
      continuation: { containerId: "c1" },
      kind: "processing",
    })
    // The container id is stored in the part, never in the next part's call.
    expect(mocks.startFirst).not.toHaveBeenCalled()
  })

  test("a published part makes the next one due and queues exactly that part's job", async () => {
    const fake = publisher()
    fake.publishPart.mockResolvedValue({
      externalPostId: "r1",
      permalink: null,
      status: "published",
    })
    mocks.startFirst.mockResolvedValue("part-2")

    await socialPostPartPublishService.runPart(
      { id: "part-1", workspaceId: WS },
      { threads: fake },
    )

    expect(partOutcome()).toMatchObject({
      externalPostId: "r1",
      kind: "published",
    })
    expect(mocks.finishFromPart).not.toHaveBeenCalled()
    expect(mocks.enqueue).toHaveBeenCalledTimes(1)
    expect(mocks.enqueue.mock.calls[0]?.[2]).toEqual({
      jobId: "social-post-part-part-2",
    })
  })

  test("the last published part publishes the target and links the inbox post", async () => {
    const fake = publisher()
    fake.publishPart.mockResolvedValue({
      externalPostId: "r9",
      permalink: null,
      status: "published",
    })
    mocks.startFirst.mockResolvedValue(null)
    mocks.firstUnsettled.mockResolvedValue(null)

    await socialPostPartPublishService.runPart(
      { id: "part-1", workspaceId: WS },
      { threads: fake },
    )

    expect(mocks.finishFromPart).toHaveBeenCalledWith(
      expect.objectContaining({ id: "t-1", outcome: "published" }),
      tx,
    )
    expect(mocks.link).toHaveBeenCalledWith(
      expect.objectContaining({ id: "t-1" }),
      expect.objectContaining({
        externalPostId: "head-1",
        permalink: "https://example.test/p/head-1",
        publishedAt: new Date("2026-01-01T00:05:00Z"),
      }),
    )
    expect(mocks.enqueue).not.toHaveBeenCalled()
  })

  describe("the message quota", () => {
    beforeEach(() => {
      quota.room = true
      mocks.claimQuotaCharge.mockResolvedValue(true)
      mocks.charge.mockResolvedValue(undefined)
    })

    test("the last published part charges the target one message, not each part", async () => {
      const fake = publisher()
      fake.publishPart.mockResolvedValue({
        externalPostId: "r9",
        permalink: null,
        status: "published",
      })

      await socialPostPartPublishService.runPart(
        { id: "part-1", workspaceId: WS },
        { threads: fake },
      )

      expect(mocks.charge).toHaveBeenCalledTimes(1)
      expect(mocks.charge).toHaveBeenCalledWith({ count: 1, workspaceId: WS })
    })

    test("a part that is published with another part still to go is not charged", async () => {
      const fake = publisher()
      fake.publishPart.mockResolvedValue({
        externalPostId: "r9",
        permalink: null,
        status: "published",
      })
      mocks.startFirst.mockResolvedValue("part-2")

      await socialPostPartPublishService.runPart(
        { id: "part-1", workspaceId: WS },
        { threads: fake },
      )

      expect(mocks.charge).not.toHaveBeenCalled()
    })

    test("a failed part is free", async () => {
      const fake = publisher()
      fake.publishPart.mockResolvedValue({
        category: "unknown",
        code: "x",
        message: "m",
        provablyNotCreated: true,
        retryable: false,
        status: "failed",
      })

      await socialPostPartPublishService.runPart(
        { id: "part-1", workspaceId: WS },
        { threads: fake },
      )

      expect(mocks.charge).not.toHaveBeenCalled()
    })

    test("at the limit the part fails quotaExceeded before the marker and the call, attempt given back", async () => {
      quota.room = false
      const fake = publisher()

      await socialPostPartPublishService.runPart(
        { id: "part-1", workspaceId: WS },
        { threads: fake },
      )

      expect(fake.publishPart).not.toHaveBeenCalled()
      expect(mocks.markStarted).not.toHaveBeenCalled()
      expect(partOutcome()).toMatchObject({
        error: {
          category: "quotaExceeded",
          code: "postMessageQuotaExceeded",
        },
        giveAttemptBack: true,
        kind: "failed",
      })
    })
  })

  test("crash after the marker: needsReview for the part and the target, never a second call", async () => {
    const fake = publisher()
    fake.publishPart.mockRejectedValue(new Error("socket hang up"))

    const result = await socialPostPartPublishService.runPart(
      { id: "part-1", workspaceId: WS },
      { threads: fake },
    )

    expect(result).toBe("settled")
    expect(fake.publishPart).toHaveBeenCalledTimes(1)
    expect(partOutcome()).toMatchObject({ kind: "needsReview" })
    expect(mocks.finishFromPart).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "needsReview" }),
      tx,
    )
    expect(mocks.enqueue).not.toHaveBeenCalled()
  })

  test("a crash before the marker is a safe retry", async () => {
    mocks.loadCredentials.mockRejectedValue(new Error("db down"))
    const fake = publisher()

    await socialPostPartPublishService.runPart(
      { id: "part-1", workspaceId: WS },
      { threads: fake },
    )

    expect(fake.publishPart).not.toHaveBeenCalled()
    expect(partOutcome()).toMatchObject({ kind: "retry" })
  })

  test("a part that provably created nothing and cannot be retried fails the target; the head is untouched", async () => {
    const fake = publisher()
    fake.publishPart.mockResolvedValue({
      category: "payloadInvalid",
      code: "bad",
      message: "no",
      provablyNotCreated: true,
      status: "failed",
    })

    await socialPostPartPublishService.runPart(
      { id: "part-1", workspaceId: WS },
      { threads: fake },
    )

    expect(partOutcome()).toMatchObject({ kind: "failed" })
    expect(mocks.finishFromPart).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "failed" }),
      tx,
    )
    expect(mocks.targetSettle).not.toHaveBeenCalled()
  })

  test("the claim presents the push-back window so a rescheduled part is refused", async () => {
    mocks.claim.mockResolvedValue(null)

    await socialPostPartPublishService.runPart(
      { id: "part-1", workspaceId: WS },
      { threads: publisher() },
    )

    expect(mocks.claim).toHaveBeenCalledWith(
      expect.objectContaining({
        dueWindowMs: 5 * 60 * 1000,
        now: expect.any(Date),
      }),
    )
  })

  test("a limit answer retries on the ladder from the part's own counter and spends no attempt", async () => {
    const fake = publisher()
    mocks.findPartForPublish.mockResolvedValue(
      part({ attemptCount: 4, rateLimitAttempts: 1 }),
    )
    fake.publishPart.mockResolvedValue({
      category: "rateLimited",
      code: "limit",
      message: "slow down",
      provablyNotCreated: true,
      scope: "account",
      status: "failed",
    })

    await socialPostPartPublishService.runPart(
      { id: "part-1", workspaceId: WS },
      { threads: fake },
    )

    expect(partOutcome()).toMatchObject({ budget: "rateLimit", kind: "retry" })
  })

  test("a network without the part publisher fails the part before any call", async () => {
    const fake = { ...publisher(), publishPart: undefined }

    await socialPostPartPublishService.runPart(
      { id: "part-1", workspaceId: WS },
      { threads: fake },
    )

    expect(partOutcome()).toMatchObject({
      error: { code: "partsUnsupported" },
      kind: "failed",
    })
  })
})

/** The recovery scan's claims, each read the way the worker's check job reads it. */
const recoverInline = async (publishers: Record<string, unknown>) => {
  const claims = (await mocks.claimExpired()) as {
    id: string
    leaseUntil: Date
    workspaceId: string
  }[]
  for (const claim of claims) {
    mocks.findExpiredClaim.mockResolvedValueOnce(claim)
    await socialPostPartPublishService.runPartCheck(
      {
        id: claim.id,
        leaseUntil: claim.leaseUntil,
        workspaceId: claim.workspaceId,
      },
      publishers as never,
    )
  }
}

describe("recoverExpired (parts)", () => {
  const expired = (overrides: Record<string, unknown> = {}) => ({
    attemptCount: 1,
    continuation: null,
    id: "part-1",
    leaseUntil: LEASE,
    position: 1,
    publishStartedAt: null,
    socialPostId: "p-1",
    socialPostTargetId: "t-1",
    status: "publishing",
    workspaceId: WS,
    ...overrides,
  })

  beforeEach(() => {
    vi.resetAllMocks()
    mocks.partSettle.mockResolvedValue("t-1")
    mocks.lockPost.mockResolvedValue({ status: "publishing" })
  })

  test("the scan only claims: one check job per part, and no network read inline", async () => {
    const fake = publisher()
    mocks.claimExpired.mockResolvedValue([expired()])

    const count = await socialPostPartPublishService.recoverExpired()

    expect(count).toBe(1)
    expect(mocks.enqueue).toHaveBeenCalledWith(
      "checkPart",
      expect.objectContaining({
        data: expect.objectContaining({
          leaseUntilMs: LEASE.getTime(),
          socialPostPartId: "part-1",
        }),
      }),
      { jobId: `social-post-check-part-part-1-${LEASE.getTime()}` },
    )
    expect(fake.checkStatus).not.toHaveBeenCalled()
  })

  test("a part check job whose lease is no longer the stored one does nothing", async () => {
    const fake = publisher()
    mocks.findExpiredClaim.mockResolvedValue(null)

    const held = await socialPostPartPublishService.runPartCheck(
      { id: "part-1", leaseUntil: LEASE, workspaceId: WS },
      { threads: fake },
    )

    expect(held).toBe(false)
    expect(fake.checkStatus).not.toHaveBeenCalled()
    expect(mocks.partSettle).not.toHaveBeenCalled()
  })

  describe("a delayed part check job", () => {
    const DUE = new Date("2026-01-01T00:01:00Z")
    const NEW_LEASE = new Date("2026-01-01T00:11:00Z")
    const delayed = (fake: ReturnType<typeof publisher>) =>
      socialPostPartPublishService.runPartCheck(
        {
          expectedDueAt: DUE,
          id: "part-1",
          leaseUntil: DUE,
          workspaceId: WS,
        },
        { threads: fake },
      )

    test("that wins the claim reads the network under the new lease", async () => {
      const claim = expired({
        continuation: { containerId: "c1" },
        leaseUntil: NEW_LEASE,
        publishStartedAt: new Date(),
        status: "processing",
      })
      mocks.claimExpired.mockResolvedValue([claim])
      mocks.findExpiredClaim.mockResolvedValue(claim)
      mocks.findPartForPublish.mockResolvedValue(part({ status: "processing" }))
      mocks.loadCredentials.mockResolvedValue(credentials("t"))
      mocks.firstUnsettled.mockResolvedValue(null)
      mocks.findForPublish.mockResolvedValue({
        externalPostId: "head-1",
        id: "t-1",
      })
      const fake = publisher()
      fake.checkStatus.mockResolvedValue({
        externalPostId: "r1",
        permalink: null,
        status: "published",
      })

      const held = await delayed(fake)

      expect(held).toBe(true)
      expect(mocks.claimExpired).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 1,
          only: { expectedDueAt: DUE, id: "part-1", workspaceId: WS },
        }),
      )
      expect(mocks.findExpiredClaim).toHaveBeenCalledWith({
        id: "part-1",
        leaseUntil: NEW_LEASE,
        workspaceId: WS,
      })
      expect(fake.checkStatus).toHaveBeenCalledTimes(1)
    })

    test("that lost the claim (the scan took it, or it is stale) makes no network call", async () => {
      mocks.claimExpired.mockResolvedValue([])
      const fake = publisher()

      const held = await delayed(fake)

      expect(held).toBe(false)
      expect(mocks.findExpiredClaim).not.toHaveBeenCalled()
      expect(fake.checkStatus).not.toHaveBeenCalled()
    })

    test("queued without an expected due time is read as before, with no claim", async () => {
      mocks.findExpiredClaim.mockResolvedValue(null)

      const held = await socialPostPartPublishService.runPartCheck(
        { id: "part-1", leaseUntil: LEASE, workspaceId: WS },
        { threads: publisher() },
      )

      expect(held).toBe(false)
      expect(mocks.claimExpired).not.toHaveBeenCalled()
    })
  })

  test("a part that never reached the network goes back to the queue", async () => {
    mocks.claimExpired.mockResolvedValue([expired()])

    await recoverInline({ threads: publisher() })

    expect(partOutcome()).toMatchObject({ kind: "retry" })
  })

  test("a part with the marker and no stored identity waits for a person, never retried alone", async () => {
    mocks.claimExpired.mockResolvedValue([
      expired({ publishStartedAt: new Date("2026-01-01T00:00:01Z") }),
    ])
    const fake = publisher()

    await recoverInline({ threads: fake })

    expect(partOutcome()).toMatchObject({ kind: "needsReview" })
    expect(fake.publishPart).not.toHaveBeenCalled()
    expect(fake.checkStatus).not.toHaveBeenCalled()
  })

  test("a stored container is read again and a published result is adopted", async () => {
    mocks.claimExpired.mockResolvedValue([
      expired({
        continuation: { containerId: "c1" },
        publishStartedAt: new Date(),
        status: "processing",
      }),
    ])
    mocks.findPartForPublish.mockResolvedValue(part({ status: "processing" }))
    mocks.loadCredentials.mockResolvedValue(credentials("t"))
    mocks.firstUnsettled.mockResolvedValue(null)
    mocks.findForPublish.mockResolvedValue({
      id: "t-1",
      externalPostId: "head-1",
    })
    const fake = publisher()
    fake.checkStatus.mockResolvedValue({
      externalPostId: "r1",
      permalink: null,
      status: "published",
    })

    await recoverInline({ threads: fake })

    expect(fake.checkStatus).toHaveBeenCalledWith(
      expect.objectContaining({ continuation: { containerId: "c1" } }),
    )
    expect(partOutcome()).toMatchObject({
      externalPostId: "r1",
      kind: "published",
    })
    expect(fake.publishPart).not.toHaveBeenCalled()
  })

  const recoverMarked = async (
    expiredOverrides: Record<string, unknown>,
    fake = publisher(),
  ) => {
    mocks.claimExpired.mockResolvedValue([
      expired({
        continuation: { containerId: "c1", finalCallAt: "5" },
        status: "processing",
        ...expiredOverrides,
      }),
    ])
    mocks.findPartForPublish.mockResolvedValue(part({ status: "processing" }))
    mocks.loadCredentials.mockResolvedValue(credentials("t"))
    mocks.firstUnsettled.mockResolvedValue(null)
    mocks.findForPublish.mockResolvedValue({
      id: "t-1",
      externalPostId: "head-1",
    })
    await recoverInline({ threads: fake })
  }

  test("a part's checkpoint is stored before the final call and moves the fence", async () => {
    const fake = publisher()
    let kept: boolean | undefined
    fake.checkStatus.mockImplementation(
      async (request: {
        checkpoint?: (c: Record<string, string>) => Promise<boolean>
      }) => {
        kept = await request.checkpoint?.({
          containerId: "c1",
          finalCallAt: "5",
        })
        return { externalPostId: "r1", permalink: null, status: "published" }
      },
    )

    await recoverMarked(
      { continuation: { containerId: "c1" }, publishStartedAt: new Date() },
      fake,
    )

    const first = mocks.partSettle.mock.calls[0]?.[0]
    const second = mocks.partSettle.mock.calls[1]?.[0]
    expect(kept).toBe(true)
    expect(first).toMatchObject({
      fence: LEASE,
      outcome: {
        continuation: { containerId: "c1", finalCallAt: "5" },
        kind: "processing",
      },
    })
    expect(second?.outcome.kind).toBe("published")
    expect(second?.fence).toEqual(first?.outcome.nextCheckAt)
  })

  test("a lost checkpoint answers false so the publisher sends nothing", async () => {
    const fake = publisher()
    let kept: boolean | undefined
    mocks.partSettle.mockResolvedValueOnce(null)
    fake.checkStatus.mockImplementation(
      async (request: {
        checkpoint?: (c: Record<string, string>) => Promise<boolean>
      }) => {
        kept = await request.checkpoint?.({ finalCallAt: "5" })
        return { continuation: {}, retryAfterMs: 1000, status: "pending" }
      },
    )

    await recoverMarked(
      { continuation: { containerId: "c1" }, publishStartedAt: new Date() },
      fake,
    )

    expect(kept).toBe(false)
  })

  test("a part whose final call was already sent waits for review, never a second call", async () => {
    const fake = publisher()
    fake.checkStatus.mockResolvedValue({
      category: "unknown",
      code: "final_call_unconfirmed",
      message: "sent",
      provablyNotCreated: false,
      status: "failed",
    })

    await recoverMarked({ publishStartedAt: new Date() }, fake)

    expect(partOutcome()).toMatchObject({ kind: "needsReview" })
    expect(fake.publishPart).not.toHaveBeenCalled()
  })

  test.each([
    ["timed out", { publishStartedAt: new Date(Date.now() - 3 * 3_600_000) }],
    ["its destination is gone", { publishStartedAt: new Date() }],
  ])("a marked part that %s waits for review, not failed", async (name, overrides) => {
    mocks.claimExpired.mockResolvedValue([
      expired({
        continuation: { containerId: "c1", finalCallAt: "5" },
        status: "processing",
        ...overrides,
      }),
    ])
    mocks.findPartForPublish.mockResolvedValue(null)

    await recoverInline({ threads: publisher() })

    expect(partOutcome()).toMatchObject({ kind: "needsReview" })
    expect(name).toBeTruthy()
  })
})

describe("retry and resolve resume at the first unsettled part", () => {
  const unsettled = (overrides: Record<string, unknown> = {}) => ({
    id: "part-2",
    position: 2,
    status: "needsReview",
    ...overrides,
  })

  beforeEach(() => {
    vi.resetAllMocks()
    mocks.firstUnsettled.mockResolvedValue(unsettled())
    mocks.lockPost.mockResolvedValue({ status: "publishing" })
    mocks.resumeForParts.mockResolvedValue("p-1")
    mocks.resetForRetry.mockResolvedValue("t-1")
    mocks.resolveAsPublished.mockResolvedValue("t-1")
    mocks.startFirst.mockResolvedValue(null)
    mocks.get.mockResolvedValue({
      id: "p-1",
      status: "publishing",
      targets: [],
    })
  })

  test("retry resets the part and the target's phase, and queues the part: the head is never reposted", async () => {
    await socialPostPartPublishService.retryPart({
      id: "p-1",
      targetId: "t-1",
      workspaceId: WS,
    })

    expect(mocks.resumeForParts).toHaveBeenCalled()
    expect(mocks.resetForRetry).toHaveBeenCalledWith(
      expect.objectContaining({ id: "part-2" }),
      tx,
    )
    expect(mocks.resetTargetForRetry).not.toHaveBeenCalled()
    expect(mocks.enqueue.mock.calls[0]?.[2]).toEqual({
      jobId: "social-post-part-part-2",
    })
  })

  test("a part other than the first unsettled one is refused", async () => {
    await expect(
      socialPostPartPublishService.retryPart({
        id: "p-1",
        partId: "part-3",
        targetId: "t-1",
        workspaceId: WS,
      }),
    ).rejects.toMatchObject({ code: "socialPostPartNotResumable" })
    expect(mocks.resetForRetry).not.toHaveBeenCalled()
  })

  test("resolving a part as published continues the chain with the next part", async () => {
    mocks.startFirst.mockResolvedValue("part-3")

    await socialPostPartPublishService.resolvePartAsPublished({
      id: "p-1",
      targetId: "t-1",
      workspaceId: WS,
    })

    expect(mocks.resolveAsPublished).toHaveBeenCalled()
    expect(mocks.enqueue.mock.calls[0]?.[2]).toEqual({
      jobId: "social-post-part-part-3",
    })
  })

  test("only a part waiting for review can be resolved", async () => {
    mocks.firstUnsettled.mockResolvedValue(unsettled({ status: "failed" }))

    await expect(
      socialPostPartPublishService.resolvePartAsPublished({
        id: "p-1",
        targetId: "t-1",
        workspaceId: WS,
      }),
    ).rejects.toMatchObject({ code: "socialPostPartNotResumable" })
  })

  test("nothing to resume answers not found", async () => {
    mocks.firstUnsettled.mockResolvedValue(null)

    await expect(
      socialPostPartPublishService.retryPart({
        id: "p-1",
        targetId: "t-1",
        workspaceId: WS,
      }),
    ).rejects.toMatchObject({ code: "notFound" })
  })
})
