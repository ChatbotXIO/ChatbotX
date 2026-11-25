import { beforeEach, describe, expect, test, vi } from "vitest"

const quota = vi.hoisted(() => ({ room: true }))

const mocks = vi.hoisted(() => ({
  announceAttention: vi.fn(),
  charge: vi.fn(),
  claimQuotaCharge: vi.fn(),
  listPendingQuotaCharges: vi.fn(),
  releaseQuotaCharge: vi.fn(),
  addToPosts: vi.fn(),
  announce: vi.fn(),
  checkPace: vi.fn(),
  spacingDeferral: vi.fn(),
  emit: vi.fn(),
  recordLimitError: vi.fn(),
  releaseClaim: vi.fn(),
  resetLimitErrors: vi.fn(),
  resetLimitStreak: vi.fn(),
  claim: vi.fn(),
  claimDue: vi.fn(),
  claimExpired: vi.fn(),
  findExpiredClaim: vi.fn(),
  enqueue: vi.fn(),
  findByExternalId: vi.fn(),
  findDestinationInboxes: vi.fn(),
  findDestinations: vi.fn(),
  findForPublish: vi.fn(),
  findForWorkspace: vi.fn(),
  findTargetStatus: vi.fn(),
  loadCredentials: vi.fn(),
  recordAuth: vi.fn(),
  get: vi.fn(),
  upsertPublished: vi.fn(),
  lowEnqueue: vi.fn(),
  linkChannelPost: vi.fn(),
  listPostMedia: vi.fn(),
  listTargetMedia: vi.fn(),
  listTargetStatuses: vi.fn(),
  listTargets: vi.fn(),
  listTopics: vi.fn(),
  lockPost: vi.fn(),
  markAttemptStarted: vi.fn(),
  findPace: vi.fn(),
  partFirstUnsettled: vi.fn(),
  partListForTargets: vi.fn(),
  partReset: vi.fn(),
  partStartFirst: vi.fn(),
  resumeForParts: vi.fn(),
  requestPublishNow: vi.fn(),
  resetForRetry: vi.fn(),
  resolveAsPublished: vi.fn(),
  setPostStatus: vi.fn(),
  settle: vi.fn(),
}))

const tx = { kind: "tx" }

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: async (run: (client: typeof tx) => Promise<unknown>) =>
      await run(tx),
  },
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  channelPostRepository: {
    findByExternalId: mocks.findByExternalId,
    upsertPublished: mocks.upsertPublished,
  },
  postTopicRepository: { addToPosts: mocks.addToPosts },
  socialPostPublishRepository: {
    claim: mocks.claim,
    claimDue: mocks.claimDue,
    claimExpired: mocks.claimExpired,
    findExpiredClaim: mocks.findExpiredClaim,
    claimQuotaCharge: mocks.claimQuotaCharge,
    listPendingQuotaCharges: async (input: { limit: number }) =>
      (await mocks.listPendingQuotaCharges(input)) ?? [],
    releaseQuotaCharge: mocks.releaseQuotaCharge,
    findDestinationInboxes: mocks.findDestinationInboxes,
    findForPublish: mocks.findForPublish,
    findTargetStatus: mocks.findTargetStatus,
    linkChannelPost: mocks.linkChannelPost,
    listTargetStatuses: mocks.listTargetStatuses,
    lockPost: mocks.lockPost,
    markAttemptStarted: mocks.markAttemptStarted,
    releaseClaim: mocks.releaseClaim,
    requestPublishNow: mocks.requestPublishNow,
    resetForRetry: mocks.resetForRetry,
    resolveAsPublished: mocks.resolveAsPublished,
    resumeForParts: mocks.resumeForParts,
    setPostStatus: mocks.setPostStatus,
    settle: mocks.settle,
  },
  socialPostPaceRepository: {
    findPace: mocks.findPace,
    recordLimitError: mocks.recordLimitError,
    resetLimitErrors: mocks.resetLimitErrors,
    resetLimitStreak: mocks.resetLimitStreak,
  },
  socialPostPartRepository: {
    claimDue: async () => [],
    claimExpired: async () => [],
    firstUnsettled: mocks.partFirstUnsettled,
    listForTargets: mocks.partListForTargets,
    resetForRetry: mocks.partReset,
    startFirst: mocks.partStartFirst,
  },
  socialPostSchedulingRepository: {
    countWaiting: async () => 0,
  },
  socialPostRepository: {
    findDestinations: mocks.findDestinations,
    findForWorkspace: mocks.findForWorkspace,
    listPostMedia: mocks.listPostMedia,
    listTargetMedia: mocks.listTargetMedia,
    listTargets: mocks.listTargets,
    listTopics: mocks.listTopics,
  },
}))
vi.mock("@chatbotx.io/worker-config", () => ({
  PostPublishJobAction: {
    checkPart: "checkPart",
    checkTarget: "checkTarget",
    publishPart: "publishPart",
    publishTarget: "publishTarget",
  },
  postCheckPartJobId: (id: string, lease: number) =>
    `social-post-check-part-${id}-${lease}`,
  postCheckTargetJobId: (id: string, lease: number) =>
    `social-post-check-target-${id}-${lease}`,
  postPartJobId: (id: string) => `social-post-part-${id}`,
  postPublishJobId: (id: string) => `social-post-target-${id}`,
  postPublishQueue: { add: mocks.enqueue },
  LowJobAction: { refreshChannelPost: "refreshChannelPost" },
  lowQueue: { add: mocks.lowEnqueue },
}))
vi.mock("../src/message-usage/service", () => ({
  MESSAGE_QUOTA_EXCEEDED: "postMessageQuotaExceeded",
  messageUsageService: {
    charge: mocks.charge,
    hasRoom: async () => quota.room,
  },
}))
vi.mock("../src/social-post/publish-pace", () => ({
  checkPace: mocks.checkPace,
  spacingDeferral: mocks.spacingDeferral,
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
vi.mock("../src/publish-destination/notify-attention", () => ({
  announcePublishConnectionAttention: mocks.announceAttention,
}))
vi.mock("../src/platform/settings", () => ({
  resolveTenantSettings: async () => ({ storageUrl: "https://files.test" }),
}))
vi.mock("../src/utils", () => ({
  getPublicFileUrl: (path: string, base: string) => `${base}/${path}`,
}))
vi.mock("../src/workspace-lifecycle/with-blocked-owner-guard", () => ({
  withBlockedOwnerGuard: async (_id: string, run: () => Promise<unknown>) =>
    await run(),
}))
vi.mock("../src/social-post/notify", () => ({
  announceSettledTarget: mocks.announce,
  emitSocialPostChanged: mocks.emit,
}))
vi.mock("../src/social-post/service", () => ({
  socialPostService: { get: mocks.get },
}))

const { socialPostPublishService } = await import(
  "../src/social-post/publish.service"
)
const { classifyFailure } = await import("../src/social-post/publish-outcome")
const { computePostStatus } = await import("../src/social-post/post-status")
const { MISSED_SCHEDULE_WINDOW_MS } = await import(
  "../src/social-post/schedule-policy"
)

beforeEach(() => {
  quota.room = true
})

const WS = "ws-1"
const LEASE = new Date("2026-01-01T00:10:00Z")

const target = (overrides: Record<string, unknown> = {}) => ({
  accountId: null,
  accountProvider: "facebook",
  accountStatus: null,
  attemptCount: 1,
  contentType: "text",
  continuation: null,
  destinationExternalId: null,
  destinationId: "dest-1",
  destinationIsActive: true,
  inboxId: "i-1",
  id: "t-1",
  linkUrl: null,
  options: {},
  overridesMedia: false,
  postText: "hello",
  provider: "facebook",
  publishStartedAt: null,
  rateLimitAttempts: 0,
  socialPostId: "p-1",
  status: "publishing",
  textOverride: null,
  workspaceId: WS,
  ...overrides,
})

/** What `loadPublishCredentials` answers for a ready Facebook Page inbox. */
const credentials = (overrides: Record<string, unknown> = {}) => ({
  credentials: {
    accessToken: "page-token",
    destinationExternalId: "page-1",
    fence: {
      grantedScopes: null,
      integrationId: "g-1",
      integrationTable: "IntegrationMessenger",
      kind: "inbox",
      provider: "facebook",
      publishDestinationId: "dest-1",
      tokenFingerprint: "abc",
    },
    publisherKey: "facebook",
    ...overrides,
  },
  ok: true,
})

const blocker = (code: string, category = "authFailed") => ({
  blocker: {
    category,
    code,
    message: "m",
    provablyNotCreated: true,
    status: "failed",
  },
  ok: false,
})

const publisher = () => ({
  checkStatus: vi.fn(),
  delete: vi.fn(),
  publish: vi.fn(),
})

const outcomeOf = (call = 0) => mocks.settle.mock.calls[call]?.[0].outcome

describe("post status from targets", () => {
  test.each([
    [["published", "published"], "draft", "published", true],
    [["published", "failed"], "publishing", "partiallyPublished", true],
    [["failed", "failed"], "publishing", "failed", true],
    [["cancelled", "cancelled"], "publishing", "cancelled", true],
    [["published", "publishing"], "publishing", "publishing", false],
    [["published", "needsReview"], "publishing", "publishing", false],
    [["pending", "pending"], "draft", "draft", false],
    [["published", "pending"], "publishing", "publishing", false],
    [["pending", "pending"], "publishing", "publishing", false],
    [["published", "published"], "publishing", "published", true],
  ] as const)("%j (was %s) is %s", (statuses, current, status, completed) => {
    expect(computePostStatus(statuses, current)).toEqual({
      completed,
      status,
    })
  })
})

describe("failure classification", () => {
  const now = new Date("2026-01-01T00:00:00Z")
  const fail = (
    category: string,
    provablyNotCreated: boolean,
  ): Parameters<typeof classifyFailure>[0] => ({
    category: category as never,
    code: "c",
    message: "m",
    provablyNotCreated,
    status: "failed",
  })

  test("a network error retries with the 1, 5, 15, 60 minute ladder, up to five attempts", () => {
    const waits = [1, 2, 3, 4].map((attemptCount) => {
      const { outcome } = classifyFailure(fail("networkError", true), {
        attemptCount,
        now,
      })
      return outcome.kind === "retry"
        ? outcome.nextAttemptAt.getTime() - now.getTime()
        : null
    })
    expect(waits).toEqual([1, 5, 15, 60].map((minutes) => minutes * 60_000))
    expect(
      classifyFailure(fail("networkError", true), { attemptCount: 5, now })
        .outcome.kind,
    ).toBe("failed")
  })

  test("a rate limit has its own 1 h, 2 h, 4 h budget and spends no attempt", () => {
    const waits = [0, 1, 2].map((rateLimitAttempts) => {
      const { outcome } = classifyFailure(fail("rateLimited", true), {
        attemptCount: 1,
        now,
        random: () => 0,
        rateLimitAttempts,
      })
      return outcome.kind === "retry"
        ? [outcome.nextAttemptAt.getTime() - now.getTime(), outcome.budget]
        : null
    })
    expect(waits).toEqual([
      [3_600_000, "rateLimit"],
      [7_200_000, "rateLimit"],
      [14_400_000, "rateLimit"],
    ])
    const exhausted = classifyFailure(fail("rateLimited", true), {
      attemptCount: 1,
      now,
      rateLimitAttempts: 3,
    }).outcome
    expect(exhausted).toMatchObject({
      error: { code: "publishRateLimitExhausted" },
      kind: "failed",
    })
  })

  test("a limit answer that does not prove nothing was created needs a person, never a retry", () => {
    for (const category of ["rateLimited", "quotaExceeded"]) {
      const { outcome } = classifyFailure(fail(category, false), {
        attemptCount: 1,
        now,
        rateLimitAttempts: 0,
      })
      expect(outcome.kind).toBe("needsReview")
    }
  })

  test("the platform's reset hint wins over the ladder, capped at 24 hours", () => {
    const hinted = (retryAfterMs: number) => {
      const { outcome } = classifyFailure(
        { ...fail("rateLimited", true), retryAfterMs },
        { attemptCount: 1, now, random: () => 0, rateLimitAttempts: 0 },
      )
      return outcome.kind === "retry"
        ? outcome.nextAttemptAt.getTime() - now.getTime()
        : null
    }
    expect(hinted(5 * 3_600_000)).toBe(5 * 3_600_000)
    expect(hinted(10 * 60_000)).toBe(3_600_000)
    expect(hinted(72 * 3_600_000)).toBe(24 * 3_600_000)
  })

  test("a per-token throttle retries in about a minute, outside the ladder and the pause streak", () => {
    const { outcome, pauseReason } = classifyFailure(
      {
        ...fail("rateLimited", true),
        code: "rate_limit_exceeded",
        scope: "token",
      },
      { attemptCount: 1, now, random: () => 0, rateLimitAttempts: 0 },
    )
    expect(pauseReason).toBeNull()
    expect(outcome).toMatchObject({ kind: "retry" })
    expect(outcome).not.toHaveProperty("budget")
    if (outcome.kind === "retry") {
      expect(outcome.nextAttemptAt.getTime() - now.getTime()).toBe(60_000)
    }
  })

  test("a per-token throttle does not spend the rate-limit ladder, even when it is used up", () => {
    const { outcome } = classifyFailure(
      { ...fail("rateLimited", true), scope: "token" },
      { attemptCount: 1, now, random: () => 0, rateLimitAttempts: 3 },
    )
    expect(outcome.kind).toBe("retry")
  })

  test("a per-token throttle honours a longer reset hint", () => {
    const { outcome } = classifyFailure(
      { ...fail("rateLimited", true), retryAfterMs: 90_000, scope: "token" },
      { attemptCount: 1, now, random: () => 0 },
    )
    if (outcome.kind !== "retry") {
      throw new Error("expected a retry")
    }
    expect(outcome.nextAttemptAt.getTime() - now.getTime()).toBe(90_000)
  })

  test("a per-token throttle that may have created the post needs a person, never a retry", () => {
    const { outcome } = classifyFailure(
      { ...fail("rateLimited", false), scope: "token" },
      { attemptCount: 1, now, random: () => 0 },
    )
    expect(outcome.kind).toBe("needsReview")
  })

  test("a per-token throttle gives up after the attempt budget", () => {
    const { outcome } = classifyFailure(
      { ...fail("rateLimited", true), scope: "token" },
      { attemptCount: 5, now, random: () => 0 },
    )
    expect(outcome.kind).toBe("failed")
  })

  test("only an account-level limit counts toward pausing the destination", () => {
    const reasonOf = (
      extra: Record<string, unknown>,
      category = "rateLimited",
    ) =>
      classifyFailure(
        { ...fail(category, true), ...extra },
        { attemptCount: 1, now },
      ).pauseReason
    expect(reasonOf({ scope: "account" })).toBe("limitReached")
    expect(reasonOf({ scope: "app" })).toBeNull()
    expect(reasonOf({})).toBeNull()
    expect(reasonOf({}, "accountRestricted")).toBe("accountRestricted")
    expect(
      reasonOf({ code: "spam_risk_too_many_posts", scope: "account" }),
    ).toBe("spamRisk")
  })

  test("a network error that proves nothing was created retries", () => {
    expect(
      classifyFailure(fail("networkError", true), { attemptCount: 1, now })
        .outcome.kind,
    ).toBe("retry")
  })

  test("a call that may have created the post is never retried automatically", () => {
    expect(
      classifyFailure(fail("networkError", false), { attemptCount: 1, now })
        .outcome.kind,
    ).toBe("needsReview")
    expect(
      classifyFailure(fail("unknown", false), { attemptCount: 1, now }).outcome
        .kind,
    ).toBe("needsReview")
  })

  test("content errors fail without a retry", () => {
    for (const category of ["payloadInvalid", "mediaInvalid", "notFound"]) {
      expect(
        classifyFailure(fail(category, true), { attemptCount: 1, now }).outcome
          .kind,
      ).toBe("failed")
    }
  })

  test("auth and permission errors fail and flag the credential for a reconnect", () => {
    expect(
      classifyFailure(fail("authFailed", true), { attemptCount: 1, now }),
    ).toMatchObject({
      authFailure: "authFailed",
      outcome: { kind: "failed" },
    })
    expect(
      classifyFailure(fail("permissionDenied", true), { attemptCount: 1, now })
        .authFailure,
    ).toBe("permissionDenied")
    expect(
      classifyFailure(fail("networkError", true), { attemptCount: 1, now })
        .authFailure,
    ).toBeNull()
  })
})

describe("runTarget", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.partListForTargets.mockResolvedValue([])
    mocks.checkPace.mockResolvedValue({
      kind: "go",
      releaseSlot: async () => undefined,
    })
    mocks.claim.mockResolvedValue({ attemptCount: 1, leaseUntil: LEASE })
    mocks.findForPublish.mockResolvedValue(target())
    mocks.loadCredentials.mockResolvedValue(credentials())
    mocks.listPostMedia.mockResolvedValue([])
    mocks.markAttemptStarted.mockResolvedValue("marked")
    mocks.settle.mockResolvedValue("p-1")
    mocks.lockPost.mockResolvedValue({ status: "publishing" })
    mocks.listTargetStatuses.mockResolvedValue(["published"])
    mocks.findDestinationInboxes.mockResolvedValue([])
    mocks.listTopics.mockResolvedValue([])
  })

  test("the claim carries the late-publish cutoff, so a queued job that became overdue is refused", async () => {
    mocks.claim.mockResolvedValue(null)
    const before = Date.now()

    const result = await socialPostPublishService.runTarget(
      { id: "t-1", workspaceId: WS },
      {} as never,
    )

    const input = mocks.claim.mock.calls[0]?.[0] as {
      lateCutoff: Date
      now: Date
    }
    expect(result).toBe("skipped")
    expect(input.now.getTime() - input.lateCutoff.getTime()).toBe(
      MISSED_SCHEDULE_WINDOW_MS,
    )
    expect(input.now.getTime()).toBeGreaterThanOrEqual(before)
  })

  test("a lost claim (another worker took it) does nothing", async () => {
    mocks.claim.mockResolvedValue(null)
    const fake = publisher()

    const result = await socialPostPublishService.runTarget(
      { id: "t-1", workspaceId: WS },
      { facebook: fake },
    )

    expect(result).toBe("skipped")
    expect(fake.publish).not.toHaveBeenCalled()
    expect(mocks.settle).not.toHaveBeenCalled()
  })

  test("two workers racing: only the one that claimed publishes", async () => {
    mocks.claim
      .mockResolvedValueOnce({ attemptCount: 1, leaseUntil: LEASE })
      .mockResolvedValueOnce(null)
    const fake = publisher()
    fake.publish.mockResolvedValue({
      externalPostId: "page-1_9",
      permalink: null,
      status: "published",
    })

    const results = await Promise.all([
      socialPostPublishService.runTarget(
        { id: "t-1", workspaceId: WS },
        { facebook: fake },
      ),
      socialPostPublishService.runTarget(
        { id: "t-1", workspaceId: WS },
        { facebook: fake },
      ),
    ])

    expect(results.sort()).toEqual(["settled", "skipped"])
    expect(fake.publish).toHaveBeenCalledTimes(1)
  })

  test("the marker is written before the network call, with the destination's token and the lease as fence", async () => {
    const fake = publisher()
    const order: string[] = []
    mocks.markAttemptStarted.mockImplementation(() => {
      order.push("marker")
      return Promise.resolve(true)
    })
    fake.publish.mockImplementation(() => {
      order.push("publish")
      return Promise.resolve({
        externalPostId: "x",
        permalink: null,
        status: "published",
      })
    })

    await socialPostPublishService.runTarget(
      { id: "t-1", workspaceId: WS },
      { facebook: fake },
    )

    expect(order).toEqual(["marker", "publish"])
    // The marker is fenced on the destination reservation the pace gate wrote.
    expect(mocks.markAttemptStarted).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "t-1",
        reservedAt: expect.any(Date),
      }),
    )
    expect(fake.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "page-token",
        destinationExternalId: "page-1",
        text: "hello",
      }),
    )
    expect(mocks.settle.mock.calls[0]?.[0]).toMatchObject({
      fence: LEASE,
      outcome: { externalPostId: "x", kind: "published" },
    })
  })

  describe("the message quota", () => {
    const published = {
      externalPostId: "x",
      permalink: null,
      status: "published",
    }

    beforeEach(() => {
      quota.room = true
      mocks.claimQuotaCharge.mockResolvedValue(true)
      mocks.charge.mockResolvedValue(undefined)
    })

    test("a target that settles published is charged once, one message", async () => {
      const fake = publisher()
      fake.publish.mockResolvedValue(published)

      await socialPostPublishService.runTarget(
        { id: "t-1", workspaceId: WS },
        { facebook: fake },
      )

      expect(mocks.claimQuotaCharge).toHaveBeenCalledWith({
        id: "t-1",
        workspaceId: WS,
      })
      expect(mocks.charge).toHaveBeenCalledTimes(1)
      expect(mocks.charge).toHaveBeenCalledWith({ count: 1, workspaceId: WS })
    })

    test("a replayed settle whose claim was already taken does not charge again", async () => {
      const fake = publisher()
      fake.publish.mockResolvedValue(published)
      mocks.claimQuotaCharge.mockResolvedValue(false)

      await socialPostPublishService.runTarget(
        { id: "t-1", workspaceId: WS },
        { facebook: fake },
      )

      expect(mocks.charge).not.toHaveBeenCalled()
    })

    test.each([
      [
        "failed",
        {
          category: "unknown",
          code: "x",
          message: "m",
          provablyNotCreated: true,
          retryable: false,
          status: "failed",
        },
      ],
      [
        "retried unknown-outcome",
        {
          category: "networkError",
          code: "x",
          message: "m",
          provablyNotCreated: false,
          retryable: true,
          status: "failed",
        },
      ],
    ] as const)("a %s result is free", async (_name, result) => {
      const fake = publisher()
      fake.publish.mockResolvedValue(result)

      await socialPostPublishService.runTarget(
        { id: "t-1", workspaceId: WS },
        { facebook: fake },
      )

      expect(mocks.claimQuotaCharge).not.toHaveBeenCalled()
      expect(mocks.charge).not.toHaveBeenCalled()
    })

    test("a head that is out while parts remain is not charged yet", async () => {
      const fake = publisher()
      fake.publish.mockResolvedValue(published)
      mocks.findForPublish.mockResolvedValue(target({ partCount: 2 }))
      mocks.partStartFirst.mockResolvedValue("part-1")

      await socialPostPublishService.runTarget(
        { id: "t-1", workspaceId: WS },
        { facebook: fake },
      )

      expect(mocks.settle.mock.calls[0]?.[0].outcome.kind).toBe("headPublished")
      expect(mocks.charge).not.toHaveBeenCalled()
    })

    test("a charge that throws gives the claim back and the sweep charges it later", async () => {
      const fake = publisher()
      fake.publish.mockResolvedValue(published)
      mocks.charge.mockRejectedValueOnce(new Error("redis down"))

      await socialPostPublishService.runTarget(
        { id: "t-1", workspaceId: WS },
        { facebook: fake },
      )

      expect(mocks.releaseQuotaCharge).toHaveBeenCalledWith({
        id: "t-1",
        workspaceId: WS,
      })

      mocks.listPendingQuotaCharges.mockResolvedValue([
        { id: "t-1", workspaceId: WS },
      ])
      mocks.claimExpired.mockResolvedValue([])
      await socialPostPublishService.recoverExpired()

      expect(mocks.listPendingQuotaCharges).toHaveBeenCalledWith({
        limit: expect.any(Number),
      })
      expect(mocks.charge).toHaveBeenCalledTimes(2)
    })

    test("a person confirming a needsReview target as published charges it", async () => {
      mocks.findTargetStatus.mockResolvedValue({
        externalPostId: null,
        socialPostId: "p-1",
        status: "needsReview",
      })
      mocks.partListForTargets.mockResolvedValue([])
      mocks.resolveAsPublished.mockResolvedValue("p-1")
      mocks.get.mockResolvedValue({
        id: "p-1",
        status: "published",
        targets: [],
      })

      await socialPostPublishService.resolveTarget({
        id: "p-1",
        outcome: "published",
        targetId: "t-1",
        workspaceId: WS,
      })

      expect(mocks.charge).toHaveBeenCalledTimes(1)
    })

    test("at the limit the target fails quotaExceeded before the marker and any call, with the attempt given back", async () => {
      const fake = publisher()
      quota.room = false

      const result = await socialPostPublishService.runTarget(
        { id: "t-1", workspaceId: WS },
        { facebook: fake },
      )

      expect(result).toBe("settled")
      expect(fake.publish).not.toHaveBeenCalled()
      expect(mocks.markAttemptStarted).not.toHaveBeenCalled()
      // Refused before the pace gate: no spacing slot is reserved for it.
      expect(mocks.checkPace).not.toHaveBeenCalled()
      expect(outcomeOf()).toMatchObject({
        error: {
          category: "quotaExceeded",
          code: "postMessageQuotaExceeded",
        },
        giveAttemptBack: true,
        kind: "failed",
      })
      expect(mocks.charge).not.toHaveBeenCalled()
    })
  })

  describe("a link on the post", () => {
    const LINK = "https://example.com/a"
    const photo = {
      altText: null,
      durationMs: null,
      kind: "image",
      mimeType: "image/jpeg",
      path: "p.jpg",
      size: 1000,
    }
    const published = {
      externalPostId: "x",
      permalink: null,
      status: "published",
    }

    test("a photo target publishes the link at the end of its caption", async () => {
      mocks.findForPublish.mockResolvedValue(
        target({ contentType: "image", linkUrl: LINK }),
      )
      mocks.listPostMedia.mockResolvedValue([photo])
      const fake = publisher()
      fake.publish.mockResolvedValue(published)

      await socialPostPublishService.runTarget(
        { id: "t-1", workspaceId: WS },
        { facebook: fake },
      )

      expect(fake.publish).toHaveBeenCalledWith(
        expect.objectContaining({ linkUrl: null, text: `hello\n\n${LINK}` }),
      )
    })

    test("a Facebook link target keeps a structured link and an untouched text", async () => {
      mocks.findForPublish.mockResolvedValue(
        target({ contentType: "link", linkUrl: LINK }),
      )
      const fake = publisher()
      fake.publish.mockResolvedValue(published)

      await socialPostPublishService.runTarget(
        { id: "t-1", workspaceId: WS },
        { facebook: fake },
      )

      expect(fake.publish).toHaveBeenCalledWith(
        expect.objectContaining({ linkUrl: LINK, text: "hello" }),
      )
    })
  })

  test("a crash after the marker with no provider-side identity is retried on the ladder", async () => {
    const fake = publisher()
    fake.publish.mockRejectedValue(new Error("socket hang up"))

    await socialPostPublishService.runTarget(
      { id: "t-1", workspaceId: WS },
      { facebook: fake },
    )

    expect(outcomeOf()).toMatchObject({
      error: { code: "internalError" },
      kind: "retry",
    })
    expect(fake.publish).toHaveBeenCalledTimes(1)
  })

  test("a crash after the marker with a provider-side identity waits for review", async () => {
    mocks.findForPublish.mockResolvedValue(
      target({ continuation: { containerId: "c1" } }),
    )
    const fake = publisher()
    fake.publish.mockRejectedValue(new Error("socket hang up"))

    await socialPostPublishService.runTarget(
      { id: "t-1", workspaceId: WS },
      { facebook: fake },
    )

    expect(outcomeOf()).toMatchObject({
      error: { code: "internalError" },
      kind: "needsReview",
    })
  })

  test("a network error with no provider-side identity is retried, not sent to review", async () => {
    const fake = publisher()
    fake.publish.mockResolvedValue({
      category: "networkError",
      code: "timeout",
      message: "m",
      provablyNotCreated: false,
      status: "failed",
    })

    await socialPostPublishService.runTarget(
      { id: "t-1", workspaceId: WS },
      { facebook: fake },
    )

    expect(outcomeOf()).toMatchObject({
      error: { code: "timeout" },
      kind: "retry",
    })
    expect(fake.publish).toHaveBeenCalledTimes(1)
  })

  test("an unknown outcome that holds a provider-side identity still waits for review", async () => {
    mocks.findForPublish.mockResolvedValue(
      target({ continuation: { publishId: "p1" } }),
    )
    const fake = publisher()
    fake.publish.mockResolvedValue({
      category: "networkError",
      code: "timeout",
      message: "m",
      provablyNotCreated: false,
      status: "failed",
    })

    await socialPostPublishService.runTarget(
      { id: "t-1", workspaceId: WS },
      { facebook: fake },
    )

    expect(outcomeOf()).toMatchObject({ kind: "needsReview" })
  })

  test("an unknown outcome with no identity fails after the last attempt", async () => {
    mocks.findForPublish.mockResolvedValue(target({ attemptCount: 5 }))
    const fake = publisher()
    fake.publish.mockResolvedValue({
      category: "networkError",
      code: "timeout",
      message: "m",
      provablyNotCreated: false,
      status: "failed",
    })

    await socialPostPublishService.runTarget(
      { id: "t-1", workspaceId: WS },
      { facebook: fake },
    )

    expect(outcomeOf()).toMatchObject({ kind: "failed" })
  })

  test("a crash before the marker is safe to retry", async () => {
    mocks.markAttemptStarted.mockRejectedValue(new Error("db down"))
    const fake = publisher()

    await socialPostPublishService.runTarget(
      { id: "t-1", workspaceId: WS },
      { facebook: fake },
    )

    expect(fake.publish).not.toHaveBeenCalled()
    expect(outcomeOf().kind).toBe("retry")
  })

  test("a marker that is refused (claim lost) stops before the network", async () => {
    mocks.markAttemptStarted.mockResolvedValue("leaseLost")
    const fake = publisher()

    const result = await socialPostPublishService.runTarget(
      { id: "t-1", workspaceId: WS },
      { facebook: fake },
    )

    expect(result).toBe("claimLost")
    expect(fake.publish).not.toHaveBeenCalled()
  })

  test("a marker refused because a newer attempt reserved the destination defers without sending or spending an attempt", async () => {
    const releaseSlot = vi.fn().mockResolvedValue(undefined)
    mocks.checkPace.mockResolvedValue({ kind: "go", releaseSlot })
    mocks.markAttemptStarted.mockResolvedValue("reservationTaken")
    const until = new Date("2026-01-01T00:30:00Z")
    mocks.spacingDeferral.mockResolvedValue(until)
    mocks.releaseClaim.mockResolvedValue(true)
    const fake = publisher()

    const result = await socialPostPublishService.runTarget(
      { id: "t-1", workspaceId: WS },
      { facebook: fake },
    )

    expect(result).toBe("deferred")
    expect(fake.publish).not.toHaveBeenCalled()
    expect(mocks.releaseClaim).toHaveBeenCalledWith({
      fence: LEASE,
      id: "t-1",
      nextAttemptAt: until,
      workspaceId: WS,
    })
    expect(mocks.settle).not.toHaveBeenCalled()
    expect(releaseSlot).toHaveBeenCalledTimes(1)
  })

  test("a container network stores the container id as `processing`", async () => {
    const fake = publisher()
    fake.publish.mockResolvedValue({
      continuation: { containerId: "c1" },
      retryAfterMs: 1000,
      status: "pending",
    })

    await socialPostPublishService.runTarget(
      { id: "t-1", workspaceId: WS },
      { facebook: fake },
    )

    expect(outcomeOf()).toMatchObject({
      continuation: { containerId: "c1" },
      kind: "processing",
    })
  })

  test("the pace gate defers the target before anything is sent and spends no attempt", async () => {
    const fake = publisher()
    const until = new Date("2026-01-01T00:20:00Z")
    mocks.checkPace.mockResolvedValue({
      kind: "defer",
      reason: "spacing",
      until,
    })
    mocks.releaseClaim.mockResolvedValue(true)

    const result = await socialPostPublishService.runTarget(
      { id: "t-1", workspaceId: WS },
      { facebook: fake },
    )

    expect(result).toBe("deferred")
    expect(mocks.releaseClaim).toHaveBeenCalledWith({
      fence: LEASE,
      id: "t-1",
      nextAttemptAt: until,
      workspaceId: WS,
    })
    expect(mocks.markAttemptStarted).not.toHaveBeenCalled()
    expect(fake.publish).not.toHaveBeenCalled()
    expect(mocks.settle).not.toHaveBeenCalled()
  })

  test("the provider slot taken by the gate is given back when the attempt ends", async () => {
    const releaseSlot = vi.fn().mockResolvedValue(undefined)
    mocks.checkPace.mockResolvedValue({ kind: "go", releaseSlot })
    const fake = publisher()
    fake.publish.mockResolvedValue({
      externalPostId: "x",
      permalink: null,
      status: "published",
    })

    await socialPostPublishService.runTarget(
      { id: "t-1", workspaceId: WS },
      { facebook: fake },
    )

    expect(releaseSlot).toHaveBeenCalledTimes(1)
  })

  test("two account-level limit answers are counted by the circuit breaker; an app-level one is not", async () => {
    const fake = publisher()
    fake.publish.mockResolvedValue({
      category: "rateLimited",
      code: "graph_17",
      message: "user limit",
      provablyNotCreated: true,
      scope: "account",
      status: "failed",
    })
    await socialPostPublishService.runTarget(
      { id: "t-1", workspaceId: WS },
      { facebook: fake },
    )
    expect(outcomeOf()).toMatchObject({ budget: "rateLimit", kind: "retry" })
    expect(mocks.recordLimitError).toHaveBeenCalledWith(
      expect.objectContaining({
        destinationId: "dest-1",
        pauseMs: 6 * 3_600_000,
        reason: "limitReached",
        threshold: 2,
      }),
    )

    mocks.recordLimitError.mockClear()
    fake.publish.mockResolvedValue({
      category: "rateLimited",
      code: "graph_4",
      message: "app limit",
      provablyNotCreated: true,
      scope: "app",
      status: "failed",
    })
    await socialPostPublishService.runTarget(
      { id: "t-1", workspaceId: WS },
      { facebook: fake },
    )
    expect(mocks.recordLimitError).not.toHaveBeenCalled()
  })

  test("a destination paused by the circuit breaker is announced once, keyed by the pause end", async () => {
    const pausedUntil = new Date("2026-01-01T06:00:00Z")
    mocks.recordLimitError.mockResolvedValue({
      pausedUntil,
      reason: "limitReached",
    })
    const fake = publisher()
    fake.publish.mockResolvedValue({
      category: "rateLimited",
      code: "graph_17",
      message: "user limit",
      provablyNotCreated: true,
      scope: "account",
      status: "failed",
    })

    await socialPostPublishService.runTarget(
      { id: "t-1", workspaceId: WS },
      { facebook: fake },
    )

    expect(mocks.announceAttention).toHaveBeenCalledTimes(1)
    expect(mocks.announceAttention).toHaveBeenCalledWith({
      alert: "paused",
      publishDestinationId: "dest-1",
      transitionKey: String(pausedUntil.getTime()),
      workspaceId: WS,
    })
  })

  test("limit, unrelated failure, limit: the failure ends the streak (counted limit answers only reset, never pause)", async () => {
    const fake = publisher()
    const limit = {
      category: "rateLimited",
      code: "graph_17",
      message: "user limit",
      provablyNotCreated: true,
      scope: "account",
      status: "failed",
    }
    const invalidMedia = {
      category: "mediaInvalid",
      code: "bad_media",
      message: "bad",
      provablyNotCreated: true,
      status: "failed",
    }
    const run = async (): Promise<void> => {
      await socialPostPublishService.runTarget(
        { id: "t-1", workspaceId: WS },
        { facebook: fake },
      )
    }
    mocks.resetLimitStreak.mockClear()
    mocks.recordLimitError.mockClear()

    fake.publish.mockResolvedValueOnce(limit)
    await run()
    expect(mocks.resetLimitStreak).not.toHaveBeenCalled()

    fake.publish.mockResolvedValueOnce(invalidMedia)
    await run()
    expect(mocks.resetLimitStreak).toHaveBeenCalledWith({
      destinationId: "dest-1",
      workspaceId: WS,
    })

    fake.publish.mockResolvedValueOnce(limit)
    await run()
    // Two limit answers, the streak reset in between: the repository counted
    // them one at a time (it resets to zero), so the second does not pause.
    expect(mocks.recordLimitError).toHaveBeenCalledTimes(2)
    expect(mocks.resetLimitStreak).toHaveBeenCalledTimes(1)
  })

  test("a token or app throttle keeps the streak (only a real decision resets it)", async () => {
    const fake = publisher()
    mocks.resetLimitStreak.mockClear()
    for (const scope of ["token", "app"]) {
      fake.publish.mockResolvedValueOnce({
        category: "rateLimited",
        code: "rate_limit_exceeded",
        message: "throttled",
        provablyNotCreated: true,
        scope,
        status: "failed",
      })
      await socialPostPublishService.runTarget(
        { id: "t-1", workspaceId: WS },
        { facebook: fake },
      )
    }
    expect(mocks.resetLimitStreak).not.toHaveBeenCalled()
  })

  test("a transport error keeps the streak", async () => {
    const fake = publisher()
    fake.publish.mockResolvedValue({
      category: "networkError",
      code: "timeout",
      message: "timeout",
      provablyNotCreated: true,
      status: "failed",
    })
    mocks.resetLimitStreak.mockClear()
    await socialPostPublishService.runTarget(
      { id: "t-1", workspaceId: WS },
      { facebook: fake },
    )
    expect(mocks.resetLimitStreak).not.toHaveBeenCalled()
  })

  test("a published post resets the destination's streak", async () => {
    const fake = publisher()
    fake.publish.mockResolvedValue({
      externalPostId: "x",
      permalink: null,
      status: "published",
    })
    await socialPostPublishService.runTarget(
      { id: "t-1", workspaceId: WS },
      { facebook: fake },
    )
    expect(mocks.resetLimitErrors).toHaveBeenCalledWith({
      destinationId: "dest-1",
      workspaceId: WS,
    })
  })

  test("a rejected token fails the target and records the auth failure with the credential's fence", async () => {
    const fake = publisher()
    fake.publish.mockResolvedValue({
      category: "authFailed",
      code: "190",
      message: "expired",
      provablyNotCreated: true,
      status: "failed",
    })

    await socialPostPublishService.runTarget(
      { id: "t-1", workspaceId: WS },
      { facebook: fake },
    )

    expect(outcomeOf().kind).toBe("failed")
    expect(mocks.recordAuth).toHaveBeenCalledWith({
      category: "authFailed",
      credentials: expect.objectContaining({
        fence: expect.objectContaining({ tokenFingerprint: "abc" }),
      }),
      workspaceId: WS,
    })
  })

  test("a permission error records permissionDenied, not a reconnect", async () => {
    const fake = publisher()
    fake.publish.mockResolvedValue({
      category: "permissionDenied",
      code: "200",
      message: "no permission",
      provablyNotCreated: true,
      status: "failed",
    })

    await socialPostPublishService.runTarget(
      { id: "t-1", workspaceId: WS },
      { facebook: fake },
    )

    expect(mocks.recordAuth).toHaveBeenCalledWith(
      expect.objectContaining({ category: "permissionDenied" }),
    )
  })

  test.each([
    "inboxDisconnected",
    "inboxNeedsReconnect",
    "publishPermissionMissing",
  ])("a %s destination fails before any call or marker", async (code) => {
    mocks.loadCredentials.mockResolvedValue(blocker(code))
    const fake = publisher()

    await socialPostPublishService.runTarget(
      { id: "t-1", workspaceId: WS },
      { facebook: fake },
    )

    expect(outcomeOf()).toMatchObject({
      error: { category: "authFailed", code },
      kind: "failed",
    })
    expect(fake.publish).not.toHaveBeenCalled()
    expect(mocks.markAttemptStarted).not.toHaveBeenCalled()
  })

  test("content that no longer passes the registry fails before the marker", async () => {
    mocks.findForPublish.mockResolvedValue(target({ postText: null }))
    const fake = publisher()

    await socialPostPublishService.runTarget(
      { id: "t-1", workspaceId: WS },
      { facebook: fake },
    )

    expect(outcomeOf()).toMatchObject({
      error: { category: "payloadInvalid", code: "textRequired" },
      kind: "failed",
    })
    expect(fake.publish).not.toHaveBeenCalled()
  })

  test("the publisher is picked by the credential's key: Instagram via Facebook uses its own", async () => {
    mocks.loadCredentials.mockResolvedValue(
      credentials({ publisherKey: "instagramFacebook" }),
    )
    const login = publisher()
    const viaFacebook = publisher()
    viaFacebook.publish.mockResolvedValue({
      externalPostId: "ig-1",
      permalink: null,
      status: "published",
    })

    await socialPostPublishService.runTarget(
      { id: "t-1", workspaceId: WS },
      { instagram: login, instagramFacebook: viaFacebook },
    )

    expect(viaFacebook.publish).toHaveBeenCalledTimes(1)
    expect(login.publish).not.toHaveBeenCalled()
  })

  test("a network with no publisher registered fails with a clear code", async () => {
    mocks.loadCredentials.mockResolvedValue(
      credentials({ publisherKey: "tiktok" }),
    )

    await socialPostPublishService.runTarget({ id: "t-1", workspaceId: WS }, {})

    expect(outcomeOf()).toMatchObject({
      error: { code: "publisherUnavailable" },
      kind: "failed",
    })
  })

  test("the parent post's status is recomputed under its lock in the same transaction as the result", async () => {
    mocks.listTargetStatuses.mockResolvedValue(["published", "failed"])
    const fake = publisher()
    fake.publish.mockResolvedValue({
      externalPostId: "x",
      permalink: null,
      status: "published",
    })

    await socialPostPublishService.runTarget(
      { id: "t-1", workspaceId: WS },
      { facebook: fake },
    )

    expect(mocks.settle).toHaveBeenCalledWith(expect.anything(), tx)
    expect(mocks.lockPost).toHaveBeenCalledWith(
      { id: "p-1", workspaceId: WS },
      tx,
    )
    expect(mocks.setPostStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "p-1",
        status: "partiallyPublished",
      }),
      tx,
    )
  })

  describe("link to the inbox", () => {
    const run = async () => {
      const fake = publisher()
      fake.publish.mockResolvedValue({
        externalPostId: "page-1_9",
        permalink: null,
        status: "published",
      })
      await socialPostPublishService.runTarget(
        { id: "t-1", workspaceId: WS },
        { facebook: fake },
      )
    }
    const inbox = { channel: "messenger", inboxId: "i-1", integrationId: "g-1" }

    test("exactly one inbox: the channel post is created, linked and gets the topics", async () => {
      mocks.findDestinationInboxes.mockResolvedValue([inbox])
      mocks.upsertPublished.mockResolvedValue("cp-1")
      mocks.listTopics.mockResolvedValue([{ id: "topic-1" }])

      await run()

      expect(mocks.upsertPublished).toHaveBeenCalledWith({
        channel: "messenger",
        externalPostId: "page-1_9",
        inboxId: "i-1",
        integrationId: "g-1",
        known: {
          caption: "hello",
          contentType: "text",
          permalink: null,
          publishedAt: expect.any(Date),
          thumbnail: null,
        },
        sourceAccountId: "page-1",
        workspaceId: WS,
      })
      expect(mocks.linkChannelPost).toHaveBeenCalledWith({
        channelPostId: "cp-1",
        id: "t-1",
        workspaceId: WS,
      })
      expect(mocks.addToPosts).toHaveBeenCalledWith({
        channelPostIds: ["cp-1"],
        topicIds: ["topic-1"],
      })
    })

    test("the channel post gets what the publish knows: photo, caption with link, permalink, date, image path", async () => {
      mocks.findDestinationInboxes.mockResolvedValue([inbox])
      mocks.upsertPublished.mockResolvedValue("cp-1")
      mocks.findForPublish.mockResolvedValue(
        target({ contentType: "image", postText: "look" }),
      )
      mocks.listPostMedia.mockResolvedValue([
        {
          durationMs: null,
          kind: "image",
          mimeType: "image/png",
          path: "public/space/1/a.png",
          size: 10,
        },
      ])
      const fake = publisher()
      fake.publish.mockResolvedValue({
        externalPostId: "page-1_9",
        permalink: "https://facebook.com/page-1/posts/9",
        status: "published",
      })

      await socialPostPublishService.runTarget(
        { id: "t-1", workspaceId: WS },
        { facebook: fake },
      )

      expect(mocks.upsertPublished).toHaveBeenCalledWith(
        expect.objectContaining({
          known: {
            caption: "look",
            contentType: "photo",
            permalink: "https://facebook.com/page-1/posts/9",
            publishedAt: expect.any(Date),
            thumbnail: "public/space/1/a.png",
          },
        }),
      )
    })

    test("a delayed refresh of the linked channel post is queued so the counts and a video thumbnail fill later", async () => {
      mocks.findDestinationInboxes.mockResolvedValue([inbox])
      mocks.upsertPublished.mockResolvedValue("cp-1")

      await run()

      expect(mocks.lowEnqueue).toHaveBeenCalledWith(
        "refreshChannelPost",
        {
          data: {
            channelPostId: "cp-1",
            publishedTarget: { socialPostId: "p-1", targetId: "t-1" },
            workspaceId: WS,
          },
          type: "refreshChannelPost",
        },
        expect.objectContaining({
          delay: 60_000,
          jobId: "refresh-channel-post-cp-1",
        }),
      )
    })

    test("a channel post the sync already has is reused", async () => {
      mocks.findDestinationInboxes.mockResolvedValue([inbox])
      mocks.upsertPublished.mockResolvedValue(null)
      mocks.findByExternalId.mockResolvedValue({ id: "cp-9" })

      await run()

      expect(mocks.linkChannelPost).toHaveBeenCalledWith(
        expect.objectContaining({ channelPostId: "cp-9" }),
      )
    })

    test("no inbox leaves the target unlinked", async () => {
      mocks.findDestinationInboxes.mockResolvedValue([])
      await run()
      expect(mocks.upsertPublished).not.toHaveBeenCalled()
      expect(mocks.linkChannelPost).not.toHaveBeenCalled()
    })

    test("a Meta target links its own inbox even when several read the page", async () => {
      mocks.findDestinationInboxes.mockResolvedValue([
        { ...inbox, inboxId: "i-2", integrationId: "g-2" },
        inbox,
      ])
      mocks.upsertPublished.mockResolvedValue("cp-1")
      await run()
      expect(mocks.upsertPublished).toHaveBeenCalledWith(
        expect.objectContaining({ inboxId: "i-1", integrationId: "g-1" }),
      )
    })

    test("a Meta target whose inbox is not among the readers stays unlinked", async () => {
      mocks.findDestinationInboxes.mockResolvedValue([
        { ...inbox, inboxId: "i-2" },
      ])
      await run()
      expect(mocks.upsertPublished).not.toHaveBeenCalled()
    })

    test("a TikTok target with several inboxes is ambiguous: unlinked", async () => {
      mocks.findForPublish.mockResolvedValue(
        target({ inboxId: null, provider: "tiktok" }),
      )
      mocks.loadCredentials.mockResolvedValue(
        credentials({ publisherKey: "tiktok" }),
      )
      mocks.findDestinationInboxes.mockResolvedValue([
        inbox,
        { ...inbox, inboxId: "i-2" },
      ])
      const fake = publisher()
      fake.publish.mockResolvedValue({
        externalPostId: "tt-1",
        permalink: null,
        status: "published",
      })
      await socialPostPublishService.runTarget(
        { id: "t-1", workspaceId: WS },
        { tiktok: fake },
      )
      expect(mocks.upsertPublished).not.toHaveBeenCalled()
    })

    test("a link failure never undoes the published result", async () => {
      mocks.findDestinationInboxes.mockRejectedValue(new Error("db"))
      await expect(run()).resolves.toBeUndefined()
      expect(outcomeOf().kind).toBe("published")
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
    await socialPostPublishService.runTargetCheck(
      {
        id: claim.id,
        leaseUntil: claim.leaseUntil,
        workspaceId: claim.workspaceId,
      },
      publishers as never,
    )
  }
}

describe("recoverExpired", () => {
  const expired = (overrides: Record<string, unknown> = {}) => ({
    attemptCount: 1,
    continuation: null,
    id: "t-1",
    leaseUntil: LEASE,
    publishStartedAt: null,
    status: "publishing",
    workspaceId: WS,
    ...overrides,
  })

  beforeEach(() => {
    vi.resetAllMocks()
    mocks.partListForTargets.mockResolvedValue([])
    mocks.settle.mockResolvedValue("p-1")
    mocks.lockPost.mockResolvedValue({ status: "publishing" })
    mocks.listTargetStatuses.mockResolvedValue(["pending"])
    mocks.findDestinationInboxes.mockResolvedValue([])
    mocks.listTopics.mockResolvedValue([])
  })

  test("recovery keeps claiming full batches until one comes back short", async () => {
    const full = Array.from({ length: 25 }, (_, i) =>
      expired({ continuation: { containerId: `c-${i}` }, id: `t-${i}` }),
    )
    mocks.claimExpired
      .mockResolvedValueOnce(full)
      .mockResolvedValueOnce([expired({ id: "last" })])

    const count = await socialPostPublishService.recoverExpired()

    expect(count).toBe(26)
    expect(mocks.claimExpired).toHaveBeenCalledTimes(2)
  })

  test("the scan only claims: one check job per target, and no network read inline", async () => {
    const fake = publisher()
    mocks.claimExpired.mockResolvedValue([
      expired({ continuation: { containerId: "c-1" }, id: "t-1" }),
      expired({ id: "t-2" }),
    ])

    const count = await socialPostPublishService.recoverExpired()

    expect(count).toBe(2)
    expect(mocks.enqueue).toHaveBeenCalledTimes(2)
    expect(mocks.enqueue).toHaveBeenCalledWith(
      "checkTarget",
      expect.objectContaining({
        data: expect.objectContaining({
          leaseUntilMs: LEASE.getTime(),
          socialPostTargetId: "t-1",
        }),
      }),
      { jobId: `social-post-check-target-t-1-${LEASE.getTime()}` },
    )
    expect(fake.checkStatus).not.toHaveBeenCalled()
    expect(mocks.settle).not.toHaveBeenCalled()
  })

  test("a check job whose lease is no longer the stored one does nothing", async () => {
    const fake = publisher()
    mocks.findExpiredClaim.mockResolvedValue(null)

    const held = await socialPostPublishService.runTargetCheck(
      { id: "t-1", leaseUntil: LEASE, workspaceId: WS },
      { facebook: fake },
    )

    expect(held).toBe(false)
    expect(fake.checkStatus).not.toHaveBeenCalled()
    expect(mocks.settle).not.toHaveBeenCalled()
  })

  test("a queue that refuses the job loses nothing: the claim just expires again", async () => {
    mocks.claimExpired.mockResolvedValue([expired()])
    mocks.enqueue.mockRejectedValue(new Error("redis down"))

    await expect(socialPostPublishService.recoverExpired()).resolves.toBe(1)
  })

  test("an attempt that stopped before the marker goes back to the queue", async () => {
    mocks.claimExpired.mockResolvedValue([expired()])

    await recoverInline({})

    expect(outcomeOf()).toMatchObject({ error: null, kind: "retry" })
  })

  test("an attempt that stopped after the marker with no identity is retried with the first backoff", async () => {
    const started = new Date()
    mocks.claimExpired.mockResolvedValue([
      expired({ attemptCount: 1, publishStartedAt: started }),
    ])
    const fake = publisher()

    await recoverInline({ facebook: fake })

    const outcome = outcomeOf()
    expect(outcome).toMatchObject({
      error: { code: "outcomeUnknownRetried" },
      kind: "retry",
    })
    expect(outcome.nextAttemptAt.getTime() - Date.now()).toBeGreaterThan(
      50 * 1000,
    )
    expect(outcome.nextAttemptAt.getTime() - Date.now()).toBeLessThanOrEqual(
      60 * 1000,
    )
    expect(fake.publish).not.toHaveBeenCalled()
    expect(fake.checkStatus).not.toHaveBeenCalled()
  })

  test("an unknown-outcome retry waits as long as the ladder says for the attempt it spent", async () => {
    mocks.claimExpired.mockResolvedValue([
      expired({ attemptCount: 4, publishStartedAt: new Date() }),
    ])

    await recoverInline({ facebook: publisher() })

    const outcome = outcomeOf()
    expect(outcome.kind).toBe("retry")
    expect(outcome.nextAttemptAt.getTime() - Date.now()).toBeGreaterThan(
      59 * 60 * 1000,
    )
  })

  test("an unknown-outcome attempt fails after the last attempt, never needsReview", async () => {
    mocks.claimExpired.mockResolvedValue([
      expired({ attemptCount: 5, publishStartedAt: new Date() }),
    ])

    await recoverInline({ facebook: publisher() })

    expect(outcomeOf()).toMatchObject({
      error: { code: "attemptsExhausted" },
      kind: "failed",
    })
  })

  test("a final-call marker (Instagram or Threads) still waits for review", async () => {
    mocks.claimExpired.mockResolvedValue([
      expired({
        continuation: { containerId: "c1", finalCallAt: "1" },
        publishStartedAt: new Date(),
        status: "processing",
      }),
    ])
    mocks.findForPublish.mockResolvedValue(
      target({ provider: "threads", status: "processing" }),
    )
    mocks.loadCredentials.mockResolvedValue(
      credentials({ accessToken: "t", publisherKey: "threads" }),
    )
    const fake = publisher()
    fake.checkStatus.mockResolvedValue({
      category: "unknown",
      code: "final_call_unconfirmed",
      message: "m",
      provablyNotCreated: false,
      status: "failed",
    })

    await recoverInline({ threads: fake })

    expect(outcomeOf()).toMatchObject({ kind: "needsReview" })
  })

  test("a container is read again by its id and adopted when published", async () => {
    mocks.claimExpired.mockResolvedValue([
      expired({
        continuation: { containerId: "c1" },
        publishStartedAt: new Date(),
        status: "processing",
      }),
    ])
    mocks.findForPublish.mockResolvedValue(
      target({ provider: "threads", status: "processing" }),
    )
    mocks.loadCredentials.mockResolvedValue(
      credentials({ accessToken: "t", publisherKey: "threads" }),
    )
    const fake = publisher()
    fake.checkStatus.mockResolvedValue({
      externalPostId: "th-1",
      permalink: null,
      status: "published",
    })

    await recoverInline({ threads: fake })

    expect(fake.checkStatus).toHaveBeenCalledWith({
      accessToken: "t",
      checkpoint: expect.any(Function),
      contentType: "text",
      continuation: { containerId: "c1" },
      destinationExternalId: "page-1",
      options: {},
      text: "hello",
    })
    expect(outcomeOf()).toMatchObject({
      externalPostId: "th-1",
      kind: "published",
    })
  })

  test("the status check carries the caption with the separately supplied link, like the first request", async () => {
    mocks.claimExpired.mockResolvedValue([
      expired({
        continuation: { containerId: "c1" },
        publishStartedAt: new Date(),
        status: "processing",
      }),
    ])
    mocks.findForPublish.mockResolvedValue(
      target({
        contentType: "carousel",
        linkUrl: "https://example.com/offer",
        provider: "instagram",
        status: "processing",
      }),
    )
    mocks.loadCredentials.mockResolvedValue(
      credentials({ accessToken: "t", publisherKey: "instagram" }),
    )
    const fake = publisher()
    fake.checkStatus.mockResolvedValue({
      externalPostId: "ig-1",
      permalink: null,
      status: "published",
    })

    await recoverInline({ instagram: fake })

    expect(fake.checkStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "hello\n\nhttps://example.com/offer",
      }),
    )
  })

  test("an Instagram container created through the other flavour waits for review", async () => {
    mocks.claimExpired.mockResolvedValue([
      expired({
        continuation: { containerId: "c1", via: "instagram" },
        publishStartedAt: new Date(),
        status: "processing",
      }),
    ])
    mocks.findForPublish.mockResolvedValue(
      target({ provider: "instagram", status: "processing" }),
    )
    mocks.loadCredentials.mockResolvedValue(
      credentials({ publisherKey: "instagramFacebook" }),
    )
    const login = publisher()
    const viaFacebook = publisher()

    await recoverInline({
      instagram: login,
      instagramFacebook: viaFacebook,
    })

    expect(outcomeOf()).toMatchObject({
      error: { code: "publisherChanged" },
      kind: "needsReview",
    })
    expect(login.checkStatus).not.toHaveBeenCalled()
    expect(viaFacebook.checkStatus).not.toHaveBeenCalled()
  })

  test("a container without a recorded flavour (legacy) is read with the current publisher", async () => {
    mocks.claimExpired.mockResolvedValue([
      expired({
        continuation: { containerId: "c1" },
        publishStartedAt: new Date(),
        status: "processing",
      }),
    ])
    mocks.findForPublish.mockResolvedValue(
      target({ provider: "instagram", status: "processing" }),
    )
    mocks.loadCredentials.mockResolvedValue(
      credentials({ publisherKey: "instagramFacebook" }),
    )
    const viaFacebook = publisher()
    viaFacebook.checkStatus.mockResolvedValue({
      externalPostId: "ig-1",
      permalink: null,
      status: "published",
    })

    await recoverInline({
      instagramFacebook: viaFacebook,
    })

    expect(viaFacebook.checkStatus).toHaveBeenCalledTimes(1)
    expect(outcomeOf().kind).toBe("published")
  })

  test("a final publish that may have created the post waits for review", async () => {
    mocks.claimExpired.mockResolvedValue([
      expired({
        continuation: { containerId: "c1" },
        publishStartedAt: new Date(),
        status: "processing",
      }),
    ])
    mocks.findForPublish.mockResolvedValue(target({ provider: "threads" }))
    mocks.loadCredentials.mockResolvedValue(
      credentials({ accessToken: "t", publisherKey: "threads" }),
    )
    const fake = publisher()
    fake.checkStatus.mockResolvedValue({
      category: "networkError",
      code: "network",
      message: "reset",
      provablyNotCreated: false,
      status: "failed",
    })

    await recoverInline({ threads: fake })

    expect(outcomeOf().kind).toBe("needsReview")
  })

  const OLD = new Date(Date.now() - 3 * 60 * 60 * 1000)

  test.each([
    ["TikTok publish id", { phase: "processing", publishId: "v_pub_1" }],
    ["Facebook feed video", { flow: "video", videoId: "v1" }],
    [
      "Facebook reel after finish",
      { flow: "reel", phase: "finishing", videoId: "v1" },
    ],
  ])("a %s that never finishes waits for review, never failed (a retry would post twice)", async (_name, continuation) => {
    mocks.claimExpired.mockResolvedValue([
      expired({ continuation, publishStartedAt: OLD, status: "processing" }),
    ])

    await recoverInline({})

    expect(outcomeOf()).toMatchObject({
      error: { code: "processingTimeout" },
      kind: "needsReview",
    })
  })

  test("an Instagram container that never finishes still fails (only the final publish call posts it)", async () => {
    mocks.claimExpired.mockResolvedValue([
      expired({
        continuation: { containerId: "c1", via: "instagram" },
        publishStartedAt: OLD,
        status: "processing",
      }),
    ])

    await recoverInline({})

    expect(outcomeOf()).toMatchObject({
      error: { code: "processingTimeout" },
      kind: "failed",
    })
  })

  test("a TikTok target whose destination is gone waits for review", async () => {
    mocks.claimExpired.mockResolvedValue([
      expired({
        continuation: { phase: "upload", publishId: "v_pub_1" },
        publishStartedAt: new Date(),
        status: "processing",
      }),
    ])
    mocks.findForPublish.mockResolvedValue(null)

    await recoverInline({})

    expect(outcomeOf()).toMatchObject({
      error: { code: "publisherUnavailable" },
      kind: "needsReview",
    })
  })

  test("a TikTok target whose credentials are rejected waits for review", async () => {
    mocks.claimExpired.mockResolvedValue([
      expired({
        continuation: { phase: "processing", publishId: "v_pub_1" },
        publishStartedAt: new Date(),
        status: "processing",
      }),
    ])
    mocks.findForPublish.mockResolvedValue(target({ provider: "tiktok" }))
    mocks.loadCredentials.mockResolvedValue({
      blocker: { code: "inboxNeedsReconnect", message: "Reconnect" },
      ok: false,
    })

    await recoverInline({})

    expect(outcomeOf()).toMatchObject({
      error: { category: "authFailed" },
      kind: "needsReview",
    })
  })

  test("an Instagram container whose destination is gone still fails", async () => {
    mocks.claimExpired.mockResolvedValue([
      expired({
        continuation: { containerId: "c1" },
        publishStartedAt: new Date(),
        status: "processing",
      }),
    ])
    mocks.findForPublish.mockResolvedValue(null)

    await recoverInline({})

    expect(outcomeOf()).toMatchObject({ kind: "failed" })
  })

  test.each([
    [
      "an Instagram container",
      { containerId: "c1", finalCallAt: "1", via: "instagram" },
    ],
    [
      "a Facebook reel",
      { finalCallAt: "1", flow: "reel", phase: "uploaded", videoId: "v1" },
    ],
    [
      "a Facebook video story",
      {
        finalCallAt: "1",
        flow: "videoStory",
        phase: "uploaded",
        videoId: "v1",
      },
    ],
  ])("%s stalled after its final call was sent waits for review, never failed", async (_name, continuation) => {
    mocks.claimExpired.mockResolvedValue([
      expired({
        continuation,
        publishStartedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
        status: "processing",
      }),
    ])
    await recoverInline({})
    expect(outcomeOf()).toMatchObject({
      error: { code: "processingTimeout" },
      kind: "needsReview",
    })

    mocks.settle.mockClear()
    mocks.claimExpired.mockResolvedValue([
      expired({
        continuation,
        publishStartedAt: new Date(),
        status: "processing",
      }),
    ])
    mocks.findForPublish.mockResolvedValue(null)
    await recoverInline({})
    expect(outcomeOf()).toMatchObject({ kind: "needsReview" })
  })

  test("recovery hands the publisher a checkpoint that stores the marker and moves the fence", async () => {
    mocks.claimExpired.mockResolvedValue([
      expired({
        continuation: { containerId: "c1" },
        publishStartedAt: new Date(),
        status: "processing",
      }),
    ])
    mocks.findForPublish.mockResolvedValue(
      target({ provider: "threads", status: "processing" }),
    )
    mocks.loadCredentials.mockResolvedValue(
      credentials({ accessToken: "t", publisherKey: "threads" }),
    )
    const fake = publisher()
    fake.checkStatus.mockImplementation(
      async (request: {
        checkpoint?: (c: Record<string, string>) => Promise<boolean>
      }) => {
        await request.checkpoint?.({ containerId: "c1", finalCallAt: "5" })
        return { externalPostId: "th-1", permalink: null, status: "published" }
      },
    )

    await recoverInline({ threads: fake })

    const first = mocks.settle.mock.calls[0]?.[0]
    const second = mocks.settle.mock.calls[1]?.[0]
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

  test("a container that never finishes is given up", async () => {
    mocks.claimExpired.mockResolvedValue([
      expired({
        continuation: { containerId: "c1" },
        publishStartedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
        status: "processing",
      }),
    ])

    await recoverInline({})

    expect(outcomeOf()).toMatchObject({
      error: { code: "processingTimeout" },
      kind: "failed",
    })
  })
})

describe("publishing and the scan", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.partListForTargets.mockResolvedValue([])
    mocks.findForWorkspace.mockResolvedValue({
      id: "p-1",
      linkUrl: null,
      text: "hello",
    })
    mocks.listTargets.mockResolvedValue([
      {
        contentType: "text",
        destinationId: "dest-1",
        id: "t-1",
        options: {},
        overridesMedia: false,
        provider: "facebook",
        textOverride: null,
      },
    ])
    mocks.listPostMedia.mockResolvedValue([])
    mocks.listTargetMedia.mockResolvedValue([])
    mocks.findDestinations.mockResolvedValue([
      { id: "dest-1", provider: "facebook", state: "ready" },
    ])
    mocks.lockPost.mockResolvedValue({ status: "draft" })
    mocks.requestPublishNow.mockResolvedValue(["t-1"])
    mocks.listTargetStatuses.mockResolvedValue(["pending"])
    mocks.get.mockResolvedValue({
      id: "p-1",
      status: "publishing",
      targets: [{ id: "t-1", status: "pending" }],
    })
  })

  test("publish now makes the targets due, marks the post publishing and enqueues one job per target after the commit", async () => {
    await socialPostPublishService.publishNow({ id: "p-1", workspaceId: WS })

    expect(mocks.requestPublishNow).toHaveBeenCalled()
    expect(mocks.enqueue).toHaveBeenCalledWith(
      "publishTarget",
      {
        data: { socialPostTargetId: "t-1", workspaceId: WS },
        type: "publishTarget",
      },
      { jobId: "social-post-target-t-1" },
    )
  })

  test("publish now sets the post publishing in the same transaction, under the lock", async () => {
    await socialPostPublishService.publishNow({ id: "p-1", workspaceId: WS })

    expect(mocks.setPostStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        completedAt: null,
        id: "p-1",
        status: "publishing",
        workspaceId: WS,
      }),
      expect.anything(),
    )
    expect(mocks.lockPost.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.setPostStatus.mock.invocationCallOrder[0] ?? 0,
    )
  })

  test("a scheduled post published now refuses a repeat once it is publishing", async () => {
    mocks.lockPost.mockResolvedValueOnce({ status: "scheduled" })
    await socialPostPublishService.publishNow({ id: "p-1", workspaceId: WS })
    const stored = mocks.setPostStatus.mock.calls[0]?.[0].status
    mocks.lockPost.mockResolvedValue({ status: stored })

    await expect(
      socialPostPublishService.publishNow({ id: "p-1", workspaceId: WS }),
    ).rejects.toMatchObject({ code: "socialPostNotPublishable" })
    expect(mocks.requestPublishNow).toHaveBeenCalledTimes(1)
  })

  test("a second publish of the same post is refused and enqueues nothing", async () => {
    mocks.lockPost.mockResolvedValue({ status: "publishing" })

    await expect(
      socialPostPublishService.publishNow({ id: "p-1", workspaceId: WS }),
    ).rejects.toMatchObject({ code: "socialPostNotPublishable" })
    expect(mocks.enqueue).not.toHaveBeenCalled()
  })

  test("a post with an issue is refused whole, before anything changes", async () => {
    mocks.findForWorkspace.mockResolvedValue({
      id: "p-1",
      linkUrl: null,
      text: null,
    })

    await expect(
      socialPostPublishService.publishNow({ id: "p-1", workspaceId: WS }),
    ).rejects.toMatchObject({ code: "socialPostContentInvalid" })
    expect(mocks.requestPublishNow).not.toHaveBeenCalled()
  })

  test("validation runs after the post lock, so an edit that lands first refuses the publish", async () => {
    let locked = false
    mocks.lockPost.mockImplementation(() => {
      locked = true
      return Promise.resolve({ status: "draft" })
    })
    mocks.findForWorkspace.mockImplementation(() =>
      Promise.resolve(
        locked
          ? { id: "p-1", linkUrl: null, text: null }
          : { id: "p-1", linkUrl: null, text: "hello" },
      ),
    )

    await expect(
      socialPostPublishService.publishNow({ id: "p-1", workspaceId: WS }),
    ).rejects.toMatchObject({ code: "socialPostContentInvalid" })
    expect(mocks.requestPublishNow).not.toHaveBeenCalled()
    expect(mocks.enqueue).not.toHaveBeenCalled()
  })

  test("a failed enqueue does not fail the publish: the scan finds the due target", async () => {
    mocks.enqueue.mockRejectedValue(new Error("redis down"))

    await expect(
      socialPostPublishService.publishNow({ id: "p-1", workspaceId: WS }),
    ).resolves.toMatchObject({ id: "p-1" })
  })

  test("the scan enqueues each due target under its own job id", async () => {
    mocks.claimDue.mockResolvedValue([
      { id: "t-1", workspaceId: WS },
      { id: "t-2", workspaceId: "ws-2" },
    ])

    const count = await socialPostPublishService.scanDue()

    expect(count).toBe(2)
    expect(mocks.enqueue.mock.calls.map((call) => call[2])).toEqual([
      { jobId: "social-post-target-t-1" },
      { jobId: "social-post-target-t-2" },
    ])
  })

  test("the scan keeps claiming full batches until one comes back short", async () => {
    const full = Array.from({ length: 100 }, (_, i) => ({
      id: `t-${i}`,
      workspaceId: WS,
    }))
    mocks.claimDue
      .mockResolvedValueOnce(full)
      .mockResolvedValueOnce(full)
      .mockResolvedValueOnce([{ id: "last", workspaceId: WS }])

    const count = await socialPostPublishService.scanDue()

    expect(count).toBe(201)
    expect(mocks.claimDue).toHaveBeenCalledTimes(3)
  })

  test("the scan and the claim both refuse a target older than the late-publish window", async () => {
    mocks.claimDue.mockResolvedValue([])
    const now = new Date("2026-01-01T12:00:00Z")
    const cutoff = new Date(now.getTime() - MISSED_SCHEDULE_WINDOW_MS)

    await socialPostPublishService.scanDue(now)

    expect(mocks.claimDue).toHaveBeenCalledWith(
      expect.objectContaining({ lateCutoff: cutoff }),
    )
  })

  test("retry needs a target of that post in a retryable state", async () => {
    mocks.findTargetStatus.mockResolvedValue({
      socialPostId: "other",
      status: "failed",
    })
    await expect(
      socialPostPublishService.retryTarget({
        id: "p-1",
        targetId: "t-1",
        workspaceId: WS,
      }),
    ).rejects.toThrow("Target not found")

    mocks.findTargetStatus.mockResolvedValue({
      socialPostId: "p-1",
      status: "published",
    })
    mocks.resetForRetry.mockResolvedValue(null)
    await expect(
      socialPostPublishService.retryTarget({
        id: "p-1",
        targetId: "t-1",
        workspaceId: WS,
      }),
    ).rejects.toMatchObject({ code: "socialPostTargetNotRetryable" })
    expect(mocks.enqueue).not.toHaveBeenCalled()
  })

  test("resolving as published settles a target waiting for review without publishing", async () => {
    mocks.findTargetStatus.mockResolvedValue({
      socialPostId: "p-1",
      status: "needsReview",
    })
    mocks.resolveAsPublished.mockResolvedValue("p-1")

    await socialPostPublishService.resolveTarget({
      id: "p-1",
      outcome: "published",
      targetId: "t-1",
      workspaceId: WS,
    })

    expect(mocks.resolveAsPublished).toHaveBeenCalled()
    expect(mocks.enqueue).not.toHaveBeenCalled()
  })

  test("resolving as retry on a target that is not waiting for review is refused", async () => {
    mocks.findTargetStatus.mockResolvedValue({
      socialPostId: "p-1",
      status: "failed",
    })

    await expect(
      socialPostPublishService.resolveTarget({
        id: "p-1",
        outcome: "retry",
        targetId: "t-1",
        workspaceId: WS,
      }),
    ).rejects.toMatchObject({ code: "socialPostTargetNotReviewable" })
  })

  describe("a target with follow-up parts", () => {
    beforeEach(() => {
      mocks.checkPace.mockResolvedValue({
        kind: "go",
        releaseSlot: async () => undefined,
      })
      mocks.partListForTargets.mockResolvedValue([])
      mocks.lockPost.mockResolvedValue({ status: "publishing" })
    })

    test("the head settles as headPublished, the first part becomes due in the same transaction and its job is queued; the inbox link waits", async () => {
      mocks.claim.mockResolvedValue({ attemptCount: 1, leaseUntil: LEASE })
      mocks.findForPublish.mockResolvedValue(target({ partCount: 2 }))
      mocks.loadCredentials.mockResolvedValue(credentials())
      mocks.listPostMedia.mockResolvedValue([])
      mocks.markAttemptStarted.mockResolvedValue("marked")
      mocks.settle.mockResolvedValue("p-1")
      mocks.listTargetStatuses.mockResolvedValue(["processing"])
      mocks.partStartFirst.mockResolvedValue("part-1")
      const fake = publisher()
      fake.publish.mockResolvedValue({
        externalPostId: "head-1",
        permalink: null,
        status: "published",
      })

      await socialPostPublishService.runTarget(
        { id: "t-1", workspaceId: WS },
        { facebook: fake },
      )

      expect(outcomeOf()).toMatchObject({
        externalPostId: "head-1",
        kind: "headPublished",
      })
      expect(mocks.partStartFirst).toHaveBeenCalledWith(
        expect.objectContaining({ socialPostTargetId: "t-1" }),
        tx,
      )
      expect(mocks.enqueue.mock.calls.map((call) => call[2])).toEqual([
        { jobId: "social-post-part-part-1" },
      ])
      expect(mocks.linkChannelPost).not.toHaveBeenCalled()
      expect(fake.publish).toHaveBeenCalledTimes(1)
    })

    test("retry on a target whose head is out resumes at the first unsettled part: the head is not reset or reposted", async () => {
      mocks.findTargetStatus.mockResolvedValue({
        externalPostId: "head-1",
        socialPostId: "p-1",
        status: "failed",
      })
      mocks.partFirstUnsettled.mockResolvedValue({
        id: "part-2",
        position: 2,
        status: "failed",
      })
      mocks.resumeForParts.mockResolvedValue("p-1")
      mocks.partReset.mockResolvedValue("t-1")
      mocks.get.mockResolvedValue({
        id: "p-1",
        status: "publishing",
        targets: [],
      })

      await socialPostPublishService.retryTarget({
        id: "p-1",
        targetId: "t-1",
        workspaceId: WS,
      })

      expect(mocks.resetForRetry).not.toHaveBeenCalled()
      expect(mocks.partReset).toHaveBeenCalledWith(
        expect.objectContaining({ id: "part-2" }),
        tx,
      )
      expect(mocks.enqueue.mock.calls.map((call) => call[2])).toEqual([
        { jobId: "social-post-part-part-2" },
      ])
    })

    test("a head waiting for review cannot be marked published when parts must follow it", async () => {
      mocks.findTargetStatus.mockResolvedValue({
        externalPostId: null,
        socialPostId: "p-1",
        status: "needsReview",
      })
      mocks.partListForTargets.mockResolvedValue([{ id: "part-1" }])

      await expect(
        socialPostPublishService.resolveTarget({
          id: "p-1",
          outcome: "published",
          targetId: "t-1",
          workspaceId: WS,
        }),
      ).rejects.toMatchObject({ code: "socialPostHeadUnconfirmed" })
      expect(mocks.resolveAsPublished).not.toHaveBeenCalled()
    })
  })

  describe("lock order: the post row first, then its targets", () => {
    const order: string[] = []
    const record = (name: string) => () => {
      order.push(name)
      return Promise.resolve(
        name === "settle" ? "p-1" : { status: "publishing" },
      )
    }

    test("a published result locks the post before it writes the target", async () => {
      order.length = 0
      mocks.lockPost.mockImplementation(record("lockPost"))
      mocks.settle.mockImplementation(record("settle"))
      mocks.listTargetStatuses.mockResolvedValue(["published"])
      mocks.listTopics.mockResolvedValue([])

      await (
        socialPostPublishService as unknown as {
          settle: (
            t: { id: string; socialPostId: string; workspaceId: string },
            f: Date,
            o: unknown,
          ) => Promise<boolean>
        }
      ).settle({ id: "t-1", socialPostId: "p-1", workspaceId: WS }, LEASE, {
        externalPostId: "x",
        kind: "published",
        permalink: null,
        publishedAt: new Date(),
      })

      expect(order.indexOf("lockPost")).toBeGreaterThanOrEqual(0)
      expect(order.indexOf("lockPost")).toBeLessThan(order.indexOf("settle"))
      expect(mocks.lockPost.mock.calls[0]?.[0]).toEqual({
        id: "p-1",
        workspaceId: WS,
      })
    })

    test("retry and resolve lock the post before they write the target", async () => {
      for (const [name, outcome] of [
        ["resetForRetry", "retry"],
        ["resolveAsPublished", "published"],
      ] as const) {
        order.length = 0
        mocks.findTargetStatus.mockResolvedValue({
          socialPostId: "p-1",
          status: "needsReview",
        })
        mocks.lockPost.mockImplementation(record("lockPost"))
        const write = mocks[name]
        write.mockImplementation(() => {
          order.push(name)
          return Promise.resolve("p-1")
        })
        mocks.listTargetStatuses.mockResolvedValue(["published"])
        mocks.get.mockResolvedValue({
          id: "p-1",
          status: "publishing",
          targets: [{ id: "t-1", status: "pending" }],
        })

        await socialPostPublishService.resolveTarget({
          id: "p-1",
          outcome,
          targetId: "t-1",
          workspaceId: WS,
        })

        expect(order.indexOf("lockPost")).toBeLessThan(order.indexOf(name))
      }
    })
  })
})

describe("announcing what settled", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.checkPace.mockResolvedValue({
      kind: "go",
      releaseSlot: async () => undefined,
    })
    mocks.partListForTargets.mockResolvedValue([])
    mocks.claim.mockResolvedValue({ attemptCount: 2, leaseUntil: LEASE })
    mocks.findForPublish.mockResolvedValue(target({ attemptCount: 2 }))
    mocks.loadCredentials.mockResolvedValue(credentials())
    mocks.listPostMedia.mockResolvedValue([])
    mocks.markAttemptStarted.mockResolvedValue("marked")
    mocks.settle.mockResolvedValue("p-1")
    mocks.lockPost.mockResolvedValue({ status: "publishing" })
    mocks.listTargetStatuses.mockResolvedValue(["published"])
    mocks.findDestinationInboxes.mockResolvedValue([])
    mocks.listTopics.mockResolvedValue([])
  })

  const published = () => {
    const fake = publisher()
    fake.publish.mockResolvedValue({
      externalPostId: "x",
      permalink: null,
      status: "published",
    })
    return fake
  }

  test("a stored result is announced once, with the attempt it belongs to", async () => {
    await socialPostPublishService.runTarget(
      { id: "t-1", workspaceId: WS },
      { facebook: published() },
    )

    expect(mocks.announce).toHaveBeenCalledTimes(1)
    expect(mocks.announce.mock.calls[0]?.[0]).toMatchObject({
      attemptCount: 2,
      id: "t-1",
      workspaceId: WS,
    })
    expect(mocks.announce.mock.calls[0]?.[1]).toMatchObject({
      kind: "published",
    })
  })

  test("a result that was not stored (claim lost) is not announced", async () => {
    mocks.settle.mockResolvedValue(null)

    await socialPostPublishService.runTarget(
      { id: "t-1", workspaceId: WS },
      { facebook: published() },
    )

    expect(mocks.announce).not.toHaveBeenCalled()
  })

  test("nothing is announced when the transaction rolls back", async () => {
    mocks.settle.mockRejectedValue(new Error("deadlock detected"))

    await expect(
      socialPostPublishService.runTarget(
        { id: "t-1", workspaceId: WS },
        { facebook: published() },
      ),
    ).rejects.toThrow("deadlock detected")

    expect(mocks.announce).not.toHaveBeenCalled()
  })

  test("a retry and a resolve announce the target with the status it now has", async () => {
    mocks.findTargetStatus.mockResolvedValue({
      socialPostId: "p-1",
      status: "failed",
    })
    mocks.resetForRetry.mockResolvedValue("p-1")
    mocks.get.mockResolvedValue({
      id: "p-1",
      status: "publishing",
      targets: [{ id: "t-1", status: "pending" }],
    })

    await socialPostPublishService.retryTarget({
      id: "p-1",
      targetId: "t-1",
      workspaceId: WS,
    })

    expect(mocks.emit).toHaveBeenCalledWith({
      socialPostId: "p-1",
      status: "pending",
      targetId: "t-1",
      workspaceId: WS,
    })
  })
})
