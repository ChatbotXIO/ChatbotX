import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findByIdAndWorkspace: vi.fn(),
  contactFindFirst: vi.fn(),
  applyChangeInTransaction: vi.fn(),
}))

class LeaderboardChangeRejected extends Error {}

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: async (fn: (tx: unknown) => unknown) => await fn({}),
    query: { contactModel: { findFirst: mocks.contactFindFirst } },
  },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  LeaderboardChangeRejected,
  leaderboardRepository: { findByIdAndWorkspace: mocks.findByIdAndWorkspace },
  leaderboardParticipantRepository: {
    applyChangeInTransaction: mocks.applyChangeInTransaction,
  },
  leaderboardAuditLogRepository: { insert: vi.fn() },
  leaderboardScoreEventRepository: {},
}))

vi.mock("../src/leaderboard/ranking", () => ({
  leaderboardRankingService: { applyCommitted: vi.fn() },
}))
vi.mock("../src/audit/dispatcher", () => ({ dispatchAuditRecord: vi.fn() }))
vi.mock("@chatbotx.io/redis", () => ({ invalidateCacheByTags: vi.fn() }))

const { leaderboardParticipantService, maskParticipantPhone } = await import(
  "../src/leaderboard/participants"
)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findByIdAndWorkspace.mockResolvedValue({
    id: "lb-1",
    workspaceId: "ws-1",
    status: "active",
  })
})

describe("manual adjust", () => {
  test("rejects a contact that is not in the leaderboard's workspace", async () => {
    mocks.contactFindFirst.mockResolvedValue(undefined)
    await expect(
      leaderboardParticipantService.adjust({
        workspaceId: "ws-1",
        leaderboardId: "lb-1",
        contactId: "foreign-contact",
        delta: 1,
        reason: "probe",
        actorUserId: "u-1",
      }),
    ).rejects.toMatchObject({ code: "notFound" })
    expect(mocks.contactFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "foreign-contact", workspaceId: "ws-1" },
      }),
    )
    expect(mocks.applyChangeInTransaction).not.toHaveBeenCalled()
  })
})

describe("maskParticipantPhone", () => {
  test.each([
    ["+84 912 345 678", "••••••••678"],
    ["12", "••"],
    [null, null],
  ])("%s → %s", (input, expected) => {
    expect(maskParticipantPhone(input)).toBe(expected)
  })
})
