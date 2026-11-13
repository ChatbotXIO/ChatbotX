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

describe("conversationService.findLastIncomingEmailThread", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("returns the newest inbound email's thread headers for the contact inbox", async () => {
    findLastByConversation.mockResolvedValue([
      {
        contactInboxId: "ci-other",
        contentAttributes: { email: { subject: "Someone else" } },
      },
      {
        contactInboxId: "ci-1",
        contentAttributes: {
          email: { subject: "Order 1234", messageId: "<new@x>" },
        },
      },
      {
        contactInboxId: "ci-1",
        contentAttributes: {
          email: { subject: "Older", messageId: "<old@x>" },
        },
      },
    ])

    const result = await conversationService.findLastIncomingEmailThread({
      conversation,
      contactInboxId: "ci-1",
    })

    expect(result).toEqual({ subject: "Order 1234", messageId: "<new@x>" })
    expect(findLastByConversation).toHaveBeenCalledWith(
      "conv-1",
      expect.objectContaining({
        workspaceId: "ws-1",
        messageTypes: ["incoming"],
        withAttachments: false,
      }),
    )
  })

  test("skips inbound messages that carry no email attributes", async () => {
    findLastByConversation.mockResolvedValue([
      { contactInboxId: "ci-1", contentAttributes: null },
      { contactInboxId: "ci-1", contentAttributes: { email: "not-an-object" } },
      {
        contactInboxId: "ci-1",
        contentAttributes: { email: { messageId: "<m@x>" } },
      },
    ])

    const result = await conversationService.findLastIncomingEmailThread({
      conversation,
      contactInboxId: "ci-1",
    })

    expect(result).toEqual({ messageId: "<m@x>" })
  })

  test("returns undefined for a conversation with no inbound email", async () => {
    findLastByConversation.mockResolvedValue([])

    expect(
      await conversationService.findLastIncomingEmailThread({
        conversation,
        contactInboxId: "ci-1",
      }),
    ).toBeUndefined()
  })
})
