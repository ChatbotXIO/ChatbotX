import { beforeEach, describe, expect, test, vi } from "vitest"

const { findLastByConversation } = vi.hoisted(() => ({
  findLastByConversation: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@chatbotx.io/database/repositories")>()
  return {
    ...original,
    createMessageRepository: vi.fn(async () => ({ findLastByConversation })),
  }
})
vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(),
  withCache: vi.fn((_key: string, fn: () => unknown) => fn()),
  createRedisConnection: vi.fn(() => ({ on: vi.fn() })),
}))
vi.mock("@chatbotx.io/analytics", () => ({ macAnalyticsService: {} }))

const { conversationService } = await import("../src/conversation/service")

const conversation = {
  id: "conv-1",
  workspaceId: "ws-1",
  lastActivityAt: new Date("2026-09-24T10:00:00.000Z"),
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
}

describe("conversationService.findLastIncomingMessageSourceId", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("returns the newest incoming sourceId received on the given contact inbox", async () => {
    findLastByConversation.mockResolvedValue([
      { contactInboxId: "ci-other", sourceId: "wamid.other" },
      { contactInboxId: "ci-1", sourceId: "wamid.newest" },
      { contactInboxId: "ci-1", sourceId: "wamid.older" },
    ])

    const result = await conversationService.findLastIncomingMessageSourceId({
      conversation,
      contactInboxId: "ci-1",
    })

    expect(result).toBe("wamid.newest")
    expect(findLastByConversation).toHaveBeenCalledWith(
      "conv-1",
      expect.objectContaining({
        workspaceId: "ws-1",
        messageTypes: ["incoming"],
        limit: 10,
        withAttachments: false,
      }),
    )
  })

  test("skips rows without a sourceId and returns undefined when none match", async () => {
    findLastByConversation.mockResolvedValue([
      { contactInboxId: "ci-1", sourceId: null },
      { contactInboxId: "ci-other", sourceId: "wamid.other" },
    ])

    const result = await conversationService.findLastIncomingMessageSourceId({
      conversation,
      contactInboxId: "ci-1",
    })

    expect(result).toBeUndefined()
  })
})
