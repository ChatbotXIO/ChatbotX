import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const repo = {
    findLastByConversation: vi.fn(),
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

describe("messageService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("listLastMessages reads through the message repository and returns chronological order", async () => {
    const { messageService } = await import("../src/message/service")
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
    expect(mocks.withCache).toHaveBeenCalledWith(
      "messages:ws-1:conv-1:latest:2",
      expect.any(Function),
      {
        tags: ["conversations:conv-1", "conversations:conv-1:messages"],
      },
    )
  })

  test("findLatestIncomingMessage reads the newest incoming message through the repository", async () => {
    const { messageService } = await import("../src/message/service")
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
})
