import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  update: vi.fn(),
  createPublishedDefault: vi.fn(),
  invalidateList: vi.fn(),
  inboxFind: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: async (fn: (tx: unknown) => unknown) => await fn({ tx: true }),
    query: {
      inboxModel: { findFirst: mocks.inboxFind },
      minigameModel: { findFirst: vi.fn() },
      flowModel: { findFirst: vi.fn(async () => ({ id: "f" })) },
      tagModel: { findMany: vi.fn(async () => []) },
    },
  },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  leaderboardRepository: { insert: mocks.insert, update: mocks.update },
  leaderboardParticipantRepository: {},
  leaderboardAuditLogRepository: {},
  leaderboardScoreEventRepository: {},
  fileRepository: {},
}))

vi.mock("../src/flow", () => ({
  flowService: { createPublishedDefault: mocks.createPublishedDefault },
}))
vi.mock("../src/flow-version", () => ({
  flowVersionService: { invalidateList: mocks.invalidateList },
}))
vi.mock("../src/leaderboard/ranking", () => ({
  leaderboardRankingService: {},
}))
vi.mock("../src/leaderboard/scoring", () => ({
  leaderboardInboxCacheTag: (id: string) => `i:${id}`,
  leaderboardMinigameCacheTag: (id: string) => `m:${id}`,
}))
vi.mock("@chatbotx.io/worker-config", () => ({
  DefaultJobAction: {},
  defaultQueue: {},
  LeaderboardJobAction: {},
  leaderboardQueue: {},
}))
vi.mock("@chatbotx.io/redis", () => ({ invalidateCacheByTags: vi.fn() }))
vi.mock("../src/audit/dispatcher", () => ({ dispatchAuditRecord: vi.fn() }))

const { leaderboardService } = await import("../src/leaderboard/service")
const { defaultLeaderboardRules } = await import("../src/leaderboard/config")

const input = (overrides: Record<string, unknown> = {}) => ({
  workspaceId: "1",
  name: "Top fans",
  description: "",
  coverImageUrl: "",
  startsAt: new Date("2026-10-01T00:00:00Z"),
  endsAt: new Date("2026-11-01T00:00:00Z"),
  platform: "messenger" as const,
  inboxId: "10",
  minigameId: null,
  scope: { postScope: "all" as const, postIds: [], telegramChatIds: [] },
  rules: defaultLeaderboardRules("messenger"),
  followersOnly: false,
  tagIds: [],
  resetTime: "22:00",
  cooldownSeconds: 0,
  referralWelcomeFlowId: null,
  rewardSettings: { flowId: null, topN: 3, autoOnFinish: false },
  ...overrides,
})

const buildViewUrl = (id: string) =>
  `https://app.test/leaderboards?leaderboardId=${id}&token={{leaderboard_view_token}}`

beforeEach(() => {
  vi.clearAllMocks()
  mocks.inboxFind.mockResolvedValue({ id: "10", channel: "messenger" })
  mocks.insert.mockImplementation(async (values) => ({ id: "99", ...values }))
  mocks.update.mockImplementation(async (_where, values) => ({
    id: "99",
    ...values,
  }))
  mocks.createPublishedDefault.mockResolvedValue({ flowId: "555" })
})

describe("leaderboardService.create welcome flow", () => {
  test("creates and links a welcome flow whose button opens the public page", async () => {
    const row = await leaderboardService.create(input(), { buildViewUrl })
    expect(mocks.createPublishedDefault).toHaveBeenCalledTimes(1)
    const [, flow] = mocks.createPublishedDefault.mock.calls[0]
    const step = flow.nodes[0].data.details.steps[0]
    expect(step.text).toContain("{{referral_name}}")
    expect(step.buttons[0].beforeStep.url).toBe(buildViewUrl("99"))
    expect(row.referralWelcomeFlowId).toBe("555")
    expect(mocks.invalidateList).toHaveBeenCalledWith("555")
  })

  test.each([
    ["a welcome flow is already chosen", { referralWelcomeFlowId: "7" }],
    [
      "the platform is email",
      { platform: "email", rules: defaultLeaderboardRules("email") },
    ],
  ])("skips the flow when %s", async (_label, overrides) => {
    if ((overrides as { platform?: string }).platform === "email") {
      mocks.inboxFind.mockResolvedValue({ id: "10", channel: "smtp" })
    }
    await leaderboardService.create(input(overrides), { buildViewUrl })
    expect(mocks.createPublishedDefault).not.toHaveBeenCalled()
  })
})
