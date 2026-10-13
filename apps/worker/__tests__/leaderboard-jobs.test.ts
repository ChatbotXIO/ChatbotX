import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  award: vi.fn(),
  reverse: vi.fn(),
  rebuild: vi.fn(),
  findUnscoped: vi.fn(),
  triggerRewards: vi.fn(),
  changeFromFlow: vi.fn(),
}))

vi.mock("@chatbotx.io/business/leaderboard", () => ({
  leaderboardScoringService: {
    award: mocks.award,
    reverse: mocks.reverse,
    changeFromFlow: mocks.changeFromFlow,
  },
  leaderboardRankingService: { rebuild: mocks.rebuild },
  leaderboardService: { findUnscoped: mocks.findUnscoped },
  triggerLeaderboardRewards: mocks.triggerRewards,
}))

vi.mock("../src/leaderboard/follower-check", () => ({
  buildLeaderboardFollowerCheck: () => undefined,
}))

vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { processLeaderboardJob } = await import("../src/leaderboard/process-job")

beforeEach(() => {
  vi.clearAllMocks()
  mocks.triggerRewards.mockResolvedValue({ winners: [], sent: 0, skipped: [] })
})

describe("processLeaderboardJob", () => {
  test("award parses the event time and forwards the context", async () => {
    await processLeaderboardJob({
      type: "award",
      data: {
        workspaceId: "1",
        contactId: "7",
        inboxId: "10",
        rule: "comments",
        sourceRef: "c-1",
        eventAt: "2026-10-12T08:00:00.000Z",
        context: { postId: "p1", textLength: 42 },
      },
    })
    expect(mocks.award).toHaveBeenCalledWith(
      expect.objectContaining({
        rule: "comments",
        sourceRef: "c-1",
        eventAt: new Date("2026-10-12T08:00:00.000Z"),
        context: { postId: "p1", textLength: 42 },
      }),
    )
  })

  test("an unknown rule is dropped instead of retried", async () => {
    await processLeaderboardJob({
      type: "award",
      data: {
        workspaceId: "1",
        contactId: "7",
        rule: "nope",
        sourceRef: "x",
        eventAt: "2026-10-12T08:00:00.000Z",
      },
    })
    expect(mocks.award).not.toHaveBeenCalled()
  })

  test("rebuildRank ignores a leaderboard of another workspace", async () => {
    mocks.findUnscoped.mockResolvedValue({ id: "5", workspaceId: "2" })
    await processLeaderboardJob({
      type: "rebuildRank",
      data: { workspaceId: "1", leaderboardId: "5" },
    })
    expect(mocks.rebuild).not.toHaveBeenCalled()
  })

  test("triggerRewards delegates to the business function", async () => {
    await processLeaderboardJob({
      type: "triggerRewards",
      data: { workspaceId: "1", leaderboardId: "5" },
    })
    expect(mocks.triggerRewards).toHaveBeenCalledWith({
      workspaceId: "1",
      leaderboardId: "5",
    })
  })
})
