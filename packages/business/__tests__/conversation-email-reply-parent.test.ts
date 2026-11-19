import { beforeEach, describe, expect, test, vi } from "vitest"

const { findEmailParent } = vi.hoisted(() => ({ findEmailParent: vi.fn() }))

vi.mock("@chatbotx.io/database/repositories", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@chatbotx.io/database/repositories")>()
  return {
    ...original,
    createMessageRepository: vi.fn(async () => ({ findEmailParent })),
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
  lastActivityAt: new Date(),
  createdAt: new Date(),
}
const email = { messageId: "<m@x>" }

describe("conversationService.findEmailReplyParent", () => {
  beforeEach(() => {
    findEmailParent.mockReset()
  })

  test("asks the repository (primary reads, filtered before limiting) for the newest parent", async () => {
    findEmailParent.mockResolvedValue({ contentAttributes: { email } })

    const result = await conversationService.findEmailReplyParent({
      conversation,
      contactInboxId: "ci-1",
    })

    expect(result).toEqual(email)
    expect(findEmailParent).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conv-1",
        workspaceId: "ws-1",
        contactInboxId: "ci-1",
        messageId: undefined,
      }),
    )
  })

  test("returns undefined when the thread has no delivered email yet", async () => {
    findEmailParent.mockResolvedValue(null)

    expect(
      await conversationService.findEmailReplyParent({
        conversation,
        contactInboxId: "ci-1",
      }),
    ).toBeUndefined()
  })

  test("never falls back when an explicit reply target is missing", async () => {
    findEmailParent.mockResolvedValue(null)

    await expect(
      conversationService.findEmailReplyParent({
        conversation,
        contactInboxId: "ci-1",
        replyToMessageId: "msg-9",
      }),
    ).rejects.toMatchObject({ code: "EMAIL_REPLY_PARENT_NOT_FOUND" })
    expect(findEmailParent).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: "msg-9" }),
    )
  })

  test("propagates a shard failure instead of treating it as no parent", async () => {
    findEmailParent.mockRejectedValue(new Error("shard down"))

    await expect(
      conversationService.findEmailReplyParent({
        conversation,
        contactInboxId: "ci-1",
      }),
    ).rejects.toThrow("shard down")
  })
})
