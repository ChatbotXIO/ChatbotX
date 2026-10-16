import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  applyChangeInTransaction: vi.fn(),
  findParticipant: vi.fn(),
  contactHasAnyTag: vi.fn(),
  findScorableForInbox: vi.fn(),
  findScorableForMinigame: vi.fn(),
  findByIdAndWorkspace: vi.fn(),
  update: vi.fn(),
  transitionStatus: vi.fn(),
  syncScore: vi.fn(),
  scheduleRebuildSafely: vi.fn(),
  rebuild: vi.fn(),
  drop: vi.fn(),
  queueAdd: vi.fn(),
  audit: vi.fn(),
  findContact: vi.fn(),
}))

class LeaderboardChangeRejected extends Error {}

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: async (fn: (tx: unknown) => unknown) => await fn({}),
    query: { contactModel: { findFirst: mocks.findContact } },
  },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  LeaderboardChangeRejected,
  leaderboardParticipantRepository: {
    applyChangeInTransaction: mocks.applyChangeInTransaction,
    find: mocks.findParticipant,
    contactHasAnyTag: mocks.contactHasAnyTag,
  },
  leaderboardRepository: {
    findScorableForInbox: mocks.findScorableForInbox,
    findScorableForMinigame: mocks.findScorableForMinigame,
    findByIdAndWorkspace: mocks.findByIdAndWorkspace,
    update: mocks.update,
    transitionStatus: mocks.transitionStatus,
  },
  leaderboardAuditLogRepository: { insert: vi.fn() },
  leaderboardScoreEventRepository: {},
}))

vi.mock("@chatbotx.io/redis", () => ({
  withCache: async (_key: string, fn: () => unknown) => await fn(),
  invalidateCacheByTags: vi.fn(),
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  DefaultJobAction: { exportLeaderboardParticipants: "export" },
  defaultQueue: { add: vi.fn() },
  LeaderboardJobAction: { triggerRewards: "triggerRewards" },
  leaderboardQueue: { add: mocks.queueAdd },
}))

vi.mock("../src/leaderboard/ranking", () => ({
  leaderboardRankingService: {
    syncScore: mocks.syncScore,
    scheduleRebuildSafely: mocks.scheduleRebuildSafely,
    rebuild: mocks.rebuild,
    drop: mocks.drop,
    statsMany: vi.fn(async () => new Map()),
  },
}))

vi.mock("../src/flow", () => ({ flowService: {} }))
vi.mock("../src/flow-version", () => ({ flowVersionService: {} }))

vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: mocks.audit,
}))

vi.mock("../src/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { leaderboardScoringService } = await import("../src/leaderboard/scoring")
const { leaderboardService } = await import("../src/leaderboard/service")
const { defaultLeaderboardRules } = await import("../src/leaderboard/config")

const NOW = new Date("2026-10-12T08:00:00Z")

const leaderboard = (overrides: Record<string, unknown> = {}) => ({
  id: "100",
  workspaceId: "1",
  status: "active",
  platform: "messenger",
  inboxId: "10",
  minigameId: null,
  startsAt: new Date("2026-10-01T00:00:00Z"),
  endsAt: new Date("2026-11-01T00:00:00Z"),
  rules: defaultLeaderboardRules("messenger"),
  scope: { postScope: "all", postIds: [], telegramChatIds: [] },
  followersOnly: false,
  tagIds: [],
  resetTime: "22:00",
  cooldownSeconds: 0,
  rewardSettings: { flowId: null, topN: 3, autoOnFinish: false },
  ...overrides,
})

const applied = {
  status: "applied",
  score: 30,
  scoredAt: NOW,
  isNew: true,
  leaderboardStatus: "active",
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  mocks.applyChangeInTransaction.mockResolvedValue(applied)
  mocks.contactHasAnyTag.mockResolvedValue(true)
  mocks.findContact.mockResolvedValue({ id: "7" })
  mocks.syncScore.mockResolvedValue(true)
})

const award = (overrides: Record<string, unknown> = {}) =>
  leaderboardScoringService.award({
    workspaceId: "1",
    contactId: "7",
    inboxId: "10",
    rule: "comments",
    sourceRef: "comment-1",
    eventAt: NOW,
    context: { postId: "p1", textLength: 40 },
    ...overrides,
  })

describe("leaderboardScoringService.award", () => {
  test("awards the rule points with daily-cap limits and mirrors to Redis", async () => {
    mocks.findScorableForInbox.mockResolvedValue([leaderboard()])
    const [outcome] = await award()
    expect(outcome.result.status).toBe("applied")
    const change = mocks.applyChangeInTransaction.mock.calls[0][0]
    expect(change).toMatchObject({
      delta: 30,
      source: "rule",
      rule: "comments",
      sourceRef: "comment-1",
      limits: { dayBucket: "2026-10-11", maxPerDay: null, cooldownSeconds: 0 },
      allowedStatuses: ["active", "finished"],
    })
    // Redis gets Postgres' exact score, not a delta.
    expect(mocks.syncScore).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: "7",
        score: 30,
        isNew: true,
        leaderboardStatus: "active",
      }),
    )
  })

  test("the event id is the same on a retry", async () => {
    mocks.findScorableForInbox.mockResolvedValue([leaderboard()])
    await award()
    await award()
    const [first, second] = mocks.applyChangeInTransaction.mock.calls
    expect(first[0].eventId).toBe(second[0].eventId)
    expect(first[0].eventAt).toEqual(second[0].eventAt)
  })

  test("adds the golden-hour bonus inside the window", async () => {
    const rules = defaultLeaderboardRules("messenger")
    rules.comments = {
      ...(rules.comments as NonNullable<typeof rules.comments>),
      bonusPoints: 20,
      bonusMinutes: 60,
    }
    mocks.findScorableForInbox.mockResolvedValue([leaderboard({ rules })])
    await award({
      context: {
        postId: "p1",
        textLength: 40,
        postPublishedAt: new Date(NOW.getTime() - 30 * 60_000).toISOString(),
      },
    })
    expect(mocks.applyChangeInTransaction.mock.calls[0][0].delta).toBe(50)
  })

  test.each([
    ["tooShort", { context: { postId: "p1", textLength: 5 } }, {}],
    [
      "postNotInScope",
      { context: { postId: "other", textLength: 40 } },
      {
        scope: { postScope: "specific", postIds: ["p1"], telegramChatIds: [] },
      },
    ],
    ["outsideWindow", { eventAt: new Date("2026-12-01T00:00:00Z") }, {}],
  ])("skips with %s", async (reason, input, lb) => {
    mocks.findScorableForInbox.mockResolvedValue([leaderboard(lb)])
    const [outcome] = await award(input)
    expect(outcome.result).toEqual({ status: "skipped", reason })
    expect(mocks.applyChangeInTransaction).not.toHaveBeenCalled()
  })

  test("skips contacts without a required tag", async () => {
    mocks.findScorableForInbox.mockResolvedValue([
      leaderboard({ tagIds: ["5"] }),
    ])
    mocks.contactHasAnyTag.mockResolvedValue(false)
    const [outcome] = await award()
    expect(outcome.result).toEqual({ status: "skipped", reason: "missingTag" })
  })

  test("followers-only uses the worker-supplied check on supported platforms", async () => {
    mocks.findScorableForInbox.mockResolvedValue([
      leaderboard({
        platform: "instagram",
        followersOnly: true,
        rules: defaultLeaderboardRules("instagram"),
      }),
    ])
    const checkFollower = vi.fn(async () => false)
    const [outcome] = await award({ checkFollower })
    expect(checkFollower).toHaveBeenCalled()
    expect(outcome.result).toEqual({ status: "skipped", reason: "notFollower" })
  })

  test("a rejected UPSERT (cap/cooldown/ban) reports rejected", async () => {
    mocks.findScorableForInbox.mockResolvedValue([leaderboard()])
    mocks.applyChangeInTransaction.mockRejectedValue(
      new LeaderboardChangeRejected(),
    )
    const [outcome] = await award()
    expect(outcome.result).toEqual({ status: "rejected" })
    expect(mocks.syncScore).not.toHaveBeenCalled()
  })

  test("ignores leaderboards of another workspace", async () => {
    mocks.findScorableForInbox.mockResolvedValue([
      leaderboard({ workspaceId: "2" }),
    ])
    expect(await award()).toEqual([])
  })

  test("looks up leaderboards that finished within the late-event grace", async () => {
    mocks.findScorableForInbox.mockResolvedValue([])
    await award()
    expect(mocks.findScorableForInbox).toHaveBeenCalledWith({
      inboxId: "10",
      finishedSince: new Date(NOW.getTime() - 10 * 60 * 1000),
    })
  })

  test("a finished leaderboard still scores an event from before it finished", async () => {
    mocks.findScorableForInbox.mockResolvedValue([
      leaderboard({ status: "finished", finishedAt: NOW }),
    ])
    const [outcome] = await award({
      eventAt: new Date(NOW.getTime() - 5000),
    })
    expect(outcome.result.status).toBe("applied")
  })

  test("an early finish ends the window at finishedAt", async () => {
    mocks.findScorableForInbox.mockResolvedValue([
      leaderboard({
        status: "finished",
        finishedAt: new Date(NOW.getTime() - 60_000),
      }),
    ])
    const [outcome] = await award()
    expect(outcome.result).toEqual({
      status: "skipped",
      reason: "outsideWindow",
    })
  })

  test("a leaderboard closed under the lock reports closed and skips Redis", async () => {
    mocks.findScorableForInbox.mockResolvedValue([leaderboard()])
    mocks.applyChangeInTransaction.mockResolvedValue({ status: "closed" })
    const [outcome] = await award()
    expect(outcome.result).toEqual({ status: "closed" })
    expect(mocks.syncScore).not.toHaveBeenCalled()
  })

  test("a failed Redis write schedules a rebuild after the transaction", async () => {
    mocks.findScorableForInbox.mockResolvedValue([leaderboard()])
    mocks.syncScore.mockResolvedValue(false)
    const [outcome] = await award()
    expect(outcome.result.status).toBe("applied")
    expect(mocks.scheduleRebuildSafely).toHaveBeenCalledTimes(1)
  })
})

describe("leaderboardScoringService.changeFromFlow", () => {
  test.each([
    "paused",
    "finished",
    "draft",
  ])("is blocked while %s", async (status) => {
    mocks.findByIdAndWorkspace.mockResolvedValue(leaderboard({ status }))
    const result = await leaderboardScoringService.changeFromFlow({
      workspaceId: "1",
      leaderboardId: "100",
      contactId: "7",
      operation: "add",
      points: 10,
      targets: { user: true, referrer: false },
    })
    expect(result.status).toBe("blocked")
    expect(mocks.applyChangeInTransaction).not.toHaveBeenCalled()
  })

  test("subtracts from the user and the referrer", async () => {
    mocks.findByIdAndWorkspace.mockResolvedValue(leaderboard())
    mocks.findParticipant.mockResolvedValue({ referrerContactId: "8" })
    const result = await leaderboardScoringService.changeFromFlow({
      workspaceId: "1",
      leaderboardId: "100",
      contactId: "7",
      operation: "subtract",
      points: 15,
      targets: { user: true, referrer: true },
    })
    expect(result.results.map((entry) => entry.contactId)).toEqual(["7", "8"])
    for (const [change] of mocks.applyChangeInTransaction.mock.calls) {
      expect(change).toMatchObject({
        delta: -15,
        source: "flow",
        limits: null,
        allowedStatuses: ["active"],
      })
    }
  })

  const flowChange = (dedup: { key: string; at?: Date | null } | null) =>
    leaderboardScoringService.changeFromFlow({
      workspaceId: "1",
      leaderboardId: "100",
      contactId: "7",
      operation: "add",
      points: 10,
      targets: { user: true, referrer: false },
      dedup,
    })

  test("dedups a retried step without a trigger time through the look-back", async () => {
    mocks.findByIdAndWorkspace.mockResolvedValue(leaderboard())
    await flowChange({ key: "job-1:1700000000000:step-1" })
    await flowChange({ key: "job-1:1700000000000:step-1" })
    const [first, second] = mocks.applyChangeInTransaction.mock.calls.map(
      ([change]) => change,
    )
    expect(first.eventId).toBe(second.eventId)
    expect(first.dedupSince).toEqual(
      new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000),
    )
  })

  test("a trigger time pins the event time and needs no look-back", async () => {
    mocks.findByIdAndWorkspace.mockResolvedValue(leaderboard())
    const at = new Date("2026-10-12T07:00:00Z")
    await flowChange({ key: "k", at })
    expect(mocks.applyChangeInTransaction.mock.calls[0][0]).toMatchObject({
      eventAt: at,
      dedupSince: null,
    })
  })

  test("reports blocked when the leaderboard closed under the lock", async () => {
    mocks.findByIdAndWorkspace.mockResolvedValue(leaderboard())
    mocks.applyChangeInTransaction.mockResolvedValue({ status: "closed" })
    expect((await flowChange(null)).status).toBe("blocked")
  })
})

describe("leaderboardScoringService.creditReferral", () => {
  const credit = (overrides: Record<string, unknown> = {}) =>
    leaderboardScoringService.creditReferral({
      workspaceId: "1",
      leaderboardId: "100",
      inviteeContactId: "9",
      referrerContactId: "7",
      ...overrides,
    })

  test("credits the referrer when the invitee is new", async () => {
    mocks.findByIdAndWorkspace.mockResolvedValue(leaderboard())
    mocks.findParticipant.mockResolvedValue({ isBanned: false })
    await expect(credit()).resolves.toBe("credited")
    const [join, reward] = mocks.applyChangeInTransaction.mock.calls.map(
      ([change]) => change,
    )
    expect(join).toMatchObject({
      contactId: "9",
      delta: 0,
      referrerContactId: "7",
    })
    expect(reward).toMatchObject({
      contactId: "7",
      delta: 50,
      rule: "referral",
    })
  })

  test("does not credit an invitee who already played", async () => {
    mocks.findByIdAndWorkspace.mockResolvedValue(leaderboard())
    mocks.findParticipant.mockResolvedValue({
      isBanned: false,
      referrerContactId: null,
    })
    mocks.applyChangeInTransaction.mockResolvedValue({
      ...applied,
      isNew: false,
    })
    await expect(credit()).resolves.toBe("notNew")
    expect(mocks.applyChangeInTransaction).toHaveBeenCalledTimes(1)
  })

  test("retries the credit when this referrer's join already committed", async () => {
    mocks.findByIdAndWorkspace.mockResolvedValue(leaderboard())
    // Referrer lookup, then the invitee row stamped by the earlier join.
    mocks.findParticipant
      .mockResolvedValueOnce({ isBanned: false })
      .mockResolvedValueOnce({ referrerContactId: "7" })
    mocks.applyChangeInTransaction
      .mockResolvedValueOnce({ status: "duplicate" })
      .mockResolvedValueOnce(applied)
    await expect(credit()).resolves.toBe("credited")
    expect(mocks.applyChangeInTransaction.mock.calls[1][0]).toMatchObject({
      contactId: "7",
      rule: "referral",
    })
  })

  test("an already-paid credit is not paid again", async () => {
    mocks.findByIdAndWorkspace.mockResolvedValue(leaderboard())
    mocks.findParticipant
      .mockResolvedValueOnce({ isBanned: false })
      .mockResolvedValueOnce({ referrerContactId: "7" })
    mocks.applyChangeInTransaction.mockResolvedValue({ status: "duplicate" })
    await expect(credit()).resolves.toBe("notNew")
  })

  test("ignores self-referral, other-workspace referrers and banned referrers", async () => {
    await expect(credit({ inviteeContactId: "7" })).resolves.toBe("ignored")
    mocks.findByIdAndWorkspace.mockResolvedValue(leaderboard())
    mocks.findContact.mockResolvedValue(undefined)
    await expect(credit()).resolves.toBe("ignored")
    mocks.findContact.mockResolvedValue({ id: "7" })
    mocks.findParticipant.mockResolvedValue({ isBanned: true })
    await expect(credit()).resolves.toBe("ignored")
  })

  test("credits a referrer who has not scored yet", async () => {
    mocks.findByIdAndWorkspace.mockResolvedValue(leaderboard())
    mocks.findParticipant.mockResolvedValue(undefined)
    await expect(credit()).resolves.toBe("credited")
  })
})

describe("leaderboardService status transitions", () => {
  test.each([
    ["draft", "pause"],
    ["active", "delete"],
    ["finished", "start"],
    ["paused", "finish"],
  ])("a %s leaderboard cannot %s", async (status, action) => {
    mocks.findByIdAndWorkspace.mockResolvedValue(leaderboard({ status }))
    const call = (
      leaderboardService as unknown as Record<
        string,
        (input: { workspaceId: string; id: string }) => Promise<unknown>
      >
    )[action]
    await expect(
      call.call(leaderboardService, { workspaceId: "1", id: "100" }),
    ).rejects.toMatchObject({ code: "leaderboardActionNotAllowed" })
  })

  test("finish drops the Redis ranking and queues automatic rewards after the late-event grace", async () => {
    const finished = leaderboard({
      status: "finished",
      rewardSettings: { flowId: "55", topN: 3, autoOnFinish: true },
    })
    mocks.findByIdAndWorkspace.mockResolvedValue(leaderboard())
    mocks.transitionStatus.mockResolvedValue(finished)
    await leaderboardService.finish({ workspaceId: "1", id: "100" })
    expect(mocks.transitionStatus).toHaveBeenCalledWith(
      { workspaceId: "1", id: "100", from: "active" },
      expect.objectContaining({ status: "finished" }),
    )
    expect(mocks.drop).toHaveBeenCalledWith("100")
    expect(mocks.queueAdd).toHaveBeenCalledWith(
      "triggerRewards",
      expect.objectContaining({
        data: { workspaceId: "1", leaderboardId: "100" },
      }),
      { jobId: "lb-rewards-100", delay: 10 * 60 * 1000 },
    )
  })

  test("a transition that lost a race to another one is refused", async () => {
    mocks.findByIdAndWorkspace.mockResolvedValue(leaderboard())
    mocks.transitionStatus.mockResolvedValue(null)
    await expect(
      leaderboardService.pause({ workspaceId: "1", id: "100" }),
    ).rejects.toMatchObject({ code: "leaderboardActionNotAllowed" })
  })

  test("publish requires an enabled rule", async () => {
    const rules = defaultLeaderboardRules("messenger")
    for (const rule of Object.values(rules)) {
      if (rule) {
        rule.enabled = false
      }
    }
    mocks.findByIdAndWorkspace.mockResolvedValue(
      leaderboard({ status: "draft", rules }),
    )
    await expect(
      leaderboardService.publish({ workspaceId: "1", id: "100" }),
    ).rejects.toMatchObject({ field: "rules" })
  })
})
