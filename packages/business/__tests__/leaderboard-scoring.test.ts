import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  applyChangeInTransaction: vi.fn(),
  findParticipant: vi.fn(),
  contactHasAnyTag: vi.fn(),
  findLiveForInbox: vi.fn(),
  findLiveForMinigame: vi.fn(),
  findByIdAndWorkspace: vi.fn(),
  update: vi.fn(),
  applyCommitted: vi.fn(),
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
    findLiveForInbox: mocks.findLiveForInbox,
    findLiveForMinigame: mocks.findLiveForMinigame,
    findByIdAndWorkspace: mocks.findByIdAndWorkspace,
    update: mocks.update,
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
    applyCommitted: mocks.applyCommitted,
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
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  mocks.applyChangeInTransaction.mockResolvedValue(applied)
  mocks.contactHasAnyTag.mockResolvedValue(true)
  mocks.findContact.mockResolvedValue({ id: "7" })
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
    mocks.findLiveForInbox.mockResolvedValue([leaderboard()])
    const [outcome] = await award()
    expect(outcome.result.status).toBe("applied")
    const change = mocks.applyChangeInTransaction.mock.calls[0][0]
    expect(change).toMatchObject({
      delta: 30,
      source: "rule",
      rule: "comments",
      sourceRef: "comment-1",
      limits: { dayBucket: "2026-10-11", maxPerDay: null, cooldownSeconds: 0 },
    })
    expect(mocks.applyCommitted).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: "7", delta: 30, isNew: true }),
    )
  })

  test("the event id is the same on a retry", async () => {
    mocks.findLiveForInbox.mockResolvedValue([leaderboard()])
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
    mocks.findLiveForInbox.mockResolvedValue([leaderboard({ rules })])
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
    mocks.findLiveForInbox.mockResolvedValue([leaderboard(lb)])
    const [outcome] = await award(input)
    expect(outcome.result).toEqual({ status: "skipped", reason })
    expect(mocks.applyChangeInTransaction).not.toHaveBeenCalled()
  })

  test("skips contacts without a required tag", async () => {
    mocks.findLiveForInbox.mockResolvedValue([leaderboard({ tagIds: ["5"] })])
    mocks.contactHasAnyTag.mockResolvedValue(false)
    const [outcome] = await award()
    expect(outcome.result).toEqual({ status: "skipped", reason: "missingTag" })
  })

  test("followers-only uses the worker-supplied check on supported platforms", async () => {
    mocks.findLiveForInbox.mockResolvedValue([
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
    mocks.findLiveForInbox.mockResolvedValue([leaderboard()])
    mocks.applyChangeInTransaction.mockRejectedValue(
      new LeaderboardChangeRejected(),
    )
    const [outcome] = await award()
    expect(outcome.result).toEqual({ status: "rejected" })
    expect(mocks.applyCommitted).not.toHaveBeenCalled()
  })

  test("ignores leaderboards of another workspace", async () => {
    mocks.findLiveForInbox.mockResolvedValue([
      leaderboard({ workspaceId: "2" }),
    ])
    expect(await award()).toEqual([])
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
      expect(change).toMatchObject({ delta: -15, source: "flow", limits: null })
    }
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
    mocks.findParticipant.mockResolvedValue({ isBanned: false })
    mocks.applyChangeInTransaction.mockResolvedValue({
      ...applied,
      isNew: false,
    })
    await expect(credit()).resolves.toBe("notNew")
    expect(mocks.applyChangeInTransaction).toHaveBeenCalledTimes(1)
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

  test("finish drops the Redis ranking and queues automatic rewards", async () => {
    const finished = leaderboard({
      status: "finished",
      rewardSettings: { flowId: "55", topN: 3, autoOnFinish: true },
    })
    mocks.findByIdAndWorkspace.mockResolvedValue(leaderboard())
    mocks.update.mockResolvedValue(finished)
    await leaderboardService.finish({ workspaceId: "1", id: "100" })
    expect(mocks.drop).toHaveBeenCalledWith("100")
    expect(mocks.queueAdd).toHaveBeenCalledWith(
      "triggerRewards",
      expect.objectContaining({
        data: { workspaceId: "1", leaderboardId: "100" },
      }),
      { jobId: "lb-rewards-100" },
    )
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
