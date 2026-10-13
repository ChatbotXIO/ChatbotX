import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findBy: vi.fn(),
  withCache: vi.fn(
    async (_key: string, fn: () => Promise<unknown>, _options?: unknown) =>
      await fn(),
  ),
  getChatMember: vi.fn(),
  zaloRunAction: vi.fn(),
  runChannelHandler: vi.fn(),
  warn: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  contactInboxService: { findBy: mocks.findBy },
}))
vi.mock("@chatbotx.io/redis", () => ({ withCache: mocks.withCache }))
vi.mock("@chatbotx.io/integration-telegram", () => ({
  getTelegramChatMemberStatus: mocks.getChatMember,
  isTelegramMemberStatus: (status: string, isMember?: boolean) =>
    ["creator", "administrator", "member"].includes(status) ||
    (status === "restricted" && isMember === true),
}))
vi.mock("@chatbotx.io/integration-zalo", () => ({
  integration: { runAction: mocks.zaloRunAction },
}))
vi.mock("../src/services/integrations", () => ({
  resolveIntegrationContextFromContactInbox: vi.fn(async () => ({
    integration: { runChannelHandler: mocks.runChannelHandler },
    ctx: { auth: { secretText: "token" } },
  })),
}))
vi.mock("../src/lib/logger", () => ({ logger: { warn: mocks.warn } }))

const { buildLeaderboardFollowerCheck } = await import(
  "../src/leaderboard/follower-check"
)

const leaderboard = (platform: string, telegramChatIds: string[] = []) =>
  ({
    id: "lb-1",
    platform,
    scope: { postScope: "all", postIds: [], telegramChatIds },
  }) as never

const check = buildLeaderboardFollowerCheck({
  workspaceId: "ws-1",
  contactId: "contact-1",
  inboxId: "inbox-1",
})

describe("buildLeaderboardFollowerCheck", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findBy.mockResolvedValue({ sourceId: "user-1", channel: "telegram" })
  })

  test("no inbox means no follower filter", () => {
    expect(
      buildLeaderboardFollowerCheck({
        workspaceId: "ws-1",
        contactId: "contact-1",
        inboxId: null,
      }),
    ).toBeUndefined()
  })

  test("Telegram: a member of any configured chat follows; cached per chat", async () => {
    mocks.getChatMember
      .mockResolvedValueOnce({ status: "left" })
      .mockResolvedValueOnce({ status: "member" })
    await expect(check?.(leaderboard("telegram", ["-1", "-2"]))).resolves.toBe(
      true,
    )
    expect(mocks.withCache).toHaveBeenCalledWith(
      "leaderboard:follower:inbox-1:contact-1:-1",
      expect.any(Function),
      { ttl: 600 },
    )
  })

  test("Telegram: not a member of any configured chat", async () => {
    mocks.getChatMember.mockResolvedValue({ status: "kicked" })
    await expect(check?.(leaderboard("telegram", ["-1"]))).resolves.toBe(false)
  })

  test("Zalo: reads user_is_follower", async () => {
    mocks.findBy.mockResolvedValue({ sourceId: "zalo-1", channel: "zalo" })
    mocks.zaloRunAction.mockResolvedValue({ user_is_follower: false })
    await expect(check?.(leaderboard("zalo"))).resolves.toBe(false)
    expect(mocks.zaloRunAction).toHaveBeenCalledWith("getUserDetail", {
      ctx: expect.anything(),
      userId: "zalo-1",
    })
  })

  test("Instagram: reads followsBusiness from the profile snapshot", async () => {
    mocks.findBy.mockResolvedValue({ sourceId: "igsid", channel: "instagram" })
    mocks.runChannelHandler.mockResolvedValue({ followsBusiness: true })
    await expect(check?.(leaderboard("instagram"))).resolves.toBe(true)
  })

  test("an API failure counts as a follower and logs a warning", async () => {
    mocks.getChatMember.mockRejectedValue(new Error("telegram down"))
    await expect(check?.(leaderboard("telegram", ["-1"]))).resolves.toBe(true)
    expect(mocks.warn).toHaveBeenCalledOnce()
  })
})
