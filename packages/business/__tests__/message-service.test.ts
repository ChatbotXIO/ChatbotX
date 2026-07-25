import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const repo = {
    findById: vi.fn(),
    findLastByConversation: vi.fn(),
    hardDeleteAllByContactInbox: vi.fn(),
    listIncomingTextsByContactInbox: vi.fn(),
  }
  return {
    db: { query: { messageModel: { findFirst: vi.fn(), findMany: vi.fn() } } },
    repo,
    createMessageRepository: vi.fn().mockResolvedValue(repo),
    withCache: vi.fn(
      async (
        _key: string,
        factory: () => Promise<unknown>,
        _options: Record<string, unknown>,
      ) => factory(),
    ),
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  db: mocks.db,
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: mocks.createMessageRepository,
}))

vi.mock("@chatbotx.io/redis", () => ({
  withCache: mocks.withCache,
}))

const { messageService } = await import("../src/message/service")

describe("messageService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("listLastMessages reads through the message repository and returns chronological order", async () => {
    const newer = { id: "msg-2", createdAt: new Date("2026-01-02") }
    const older = { id: "msg-1", createdAt: new Date("2026-01-01") }
    const sinceTime = new Date("2025-01-01")
    mocks.repo.findLastByConversation.mockResolvedValue([newer, older])

    const result = await messageService.listLastMessages({
      conversationId: "conv-1",
      limit: 2,
      sinceTime,
      workspaceId: "ws-1",
    })

    expect(mocks.createMessageRepository).toHaveBeenCalledTimes(1)
    expect(mocks.repo.findLastByConversation).toHaveBeenCalledWith("conv-1", {
      messageTypes: ["incoming", "outgoing"],
      limit: 2,
      sinceTime,
      workspaceId: "ws-1",
    })
    expect(result).toEqual([older, newer])
    // Reads straight through to the repository — caching this call was removed
    // deliberately, so re-introducing it should break here first.
    expect(mocks.withCache).not.toHaveBeenCalled()
  })

  test("findLatestIncomingMessage reads the newest incoming message through the repository", async () => {
    const message = { id: "msg-1" }
    const sinceTime = new Date("2025-01-01")
    mocks.repo.findLastByConversation.mockResolvedValue([message])

    const result = await messageService.findLatestIncomingMessage({
      conversationId: "conv-1",
      sinceTime,
      workspaceId: "ws-1",
    })

    expect(mocks.repo.findLastByConversation).toHaveBeenCalledWith("conv-1", {
      messageTypes: ["incoming"],
      limit: 1,
      sinceTime,
      workspaceId: "ws-1",
    })
    expect(result).toBe(message)
  })

  test("findLatestIncomingMessageWithAttachments requests attachments from the repository", async () => {
    const message = {
      id: "msg-1",
      attachments: [{ id: "attachment-1", fileType: "image" }],
    }
    const sinceTime = new Date("2025-01-01")
    mocks.repo.findLastByConversation.mockResolvedValue([message])

    const result =
      await messageService.findLatestIncomingMessageWithAttachments({
        conversationId: "conv-1",
        sinceTime,
        workspaceId: "ws-1",
      })

    expect(mocks.repo.findLastByConversation).toHaveBeenCalledWith("conv-1", {
      messageTypes: ["incoming"],
      limit: 1,
      requireCompleteResults: true,
      sinceTime,
      withAttachments: true,
      workspaceId: "ws-1",
    })
    expect(result).toBe(message)
  })

  test("findById reads one message through the repository", async () => {
    const message = {
      id: "msg-1",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      workspaceId: "ws-1",
    }
    mocks.repo.findById.mockResolvedValue(message)

    const result = await messageService.findById({
      id: "msg-1",
      createdAt: message.createdAt,
      workspaceId: "ws-1",
    })

    expect(mocks.repo.findById).toHaveBeenCalledWith({
      id: "msg-1",
      createdAt: message.createdAt,
      workspaceId: "ws-1",
    })
    expect(result).toBe(message)
  })

  test("listIncomingTextsByContactInbox delegates to the repository", async () => {
    const sinceTime = new Date("2025-01-01")
    mocks.repo.listIncomingTextsByContactInbox.mockResolvedValue([
      "newest",
      "older",
    ])

    const result = await messageService.listIncomingTextsByContactInbox({
      contactInboxId: "contact-inbox-1",
      limit: 200,
      sinceTime,
      workspaceId: "ws-1",
    })

    expect(mocks.repo.listIncomingTextsByContactInbox).toHaveBeenCalledWith({
      contactInboxId: "contact-inbox-1",
      limit: 200,
      sinceTime,
      workspaceId: "ws-1",
    })
    expect(result).toEqual(["newest", "older"])
  })

  test("hardDeleteAllByContactInbox delegates to the repository", async () => {
    const sinceTime = new Date("2025-01-01")
    mocks.repo.hardDeleteAllByContactInbox.mockResolvedValue({
      attachmentPaths: ["origin.jpg", "thumb.jpg"],
    })

    const result = await messageService.hardDeleteAllByContactInbox({
      contactInboxId: "contact-inbox-1",
      sinceTime,
      workspaceId: "ws-1",
    })

    expect(mocks.repo.hardDeleteAllByContactInbox).toHaveBeenCalledWith({
      contactInboxId: "contact-inbox-1",
      sinceTime,
      workspaceId: "ws-1",
    })
    expect(result).toEqual({ attachmentPaths: ["origin.jpg", "thumb.jpg"] })
  })
})
