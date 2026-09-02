import { MessageShardUnavailableError } from "@chatbotx.io/database/errors"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  cacheDelete: vi.fn(),
  createMessageRepository: vi.fn(),
  findLastByConversation: vi.fn(),
  findDMByContact: vi.fn(),
  loggerError: vi.fn(),
  runExclusive: vi.fn(),
  updateMarker: vi.fn(),
}))

vi.mock("@chatbotx.io/ai/server", () => ({
  aiContextStore: {
    delete: mocks.cacheDelete,
    runExclusive: mocks.runExclusive,
  },
}))
vi.mock("@chatbotx.io/business", () => ({
  conversationService: {
    findDMByContact: mocks.findDMByContact,
    updateAIContextLastMessageId: mocks.updateMarker,
  },
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: mocks.createMessageRepository,
  getSafeSinceTime: vi.fn((value: Date | null) =>
    value ? new Date("2026-06-01T00:00:00.000Z") : undefined,
  ),
}))
vi.mock("../src/lib/logger", () => ({
  logger: { error: mocks.loggerError },
}))

const { handleAIDeleteMessageHistory } = await import(
  "../src/integration/handlers/delete-message-history"
)

const props = {
  conversation: {
    id: "conv-1",
    workspaceId: "ws-1",
    contactId: "contact-1",
    sourceId: null,
  },
  contactInbox: {
    channel: "instagram",
    lastMessageAt: new Date("2026-06-01T01:00:00.000Z"),
  },
} as never

describe("handleAIDeleteMessageHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createMessageRepository.mockResolvedValue({
      findLastByConversation: mocks.findLastByConversation,
    })
    mocks.runExclusive.mockImplementation(
      (_conversationId: string, fn: () => Promise<unknown>) => fn(),
    )
    mocks.cacheDelete.mockResolvedValue(undefined)
    mocks.findDMByContact.mockResolvedValue(undefined)
    mocks.updateMarker.mockResolvedValue(undefined)
  })

  test("falls back to complete history and deletes cache before marker mutation", async () => {
    mocks.findLastByConversation
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "10" }])
    const order: string[] = []
    mocks.cacheDelete.mockImplementation(() => {
      order.push("cache")
    })
    mocks.updateMarker.mockImplementation(() => {
      order.push("marker")
    })

    await expect(handleAIDeleteMessageHistory(props)).resolves.toEqual({
      status: "success",
      result: null,
    })

    expect(mocks.runExclusive).toHaveBeenCalledWith(
      "conv-1",
      expect.any(Function),
    )
    expect(mocks.findLastByConversation).toHaveBeenNthCalledWith(1, "conv-1", {
      limit: 1,
      requireCompleteResults: true,
      sinceTime: new Date("2026-06-01T00:00:00.000Z"),
      workspaceId: "ws-1",
    })
    expect(mocks.findLastByConversation).toHaveBeenNthCalledWith(2, "conv-1", {
      limit: 1,
      requireCompleteResults: true,
      sinceTime: new Date(0),
      workspaceId: "ws-1",
    })
    expect(mocks.updateMarker).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      messageId: "10",
    })
    expect(order).toEqual(["cache", "marker"])
  })

  test("uses one complete-history query when lastMessageAt is missing", async () => {
    mocks.findLastByConversation.mockResolvedValue([{ id: "10" }])

    await handleAIDeleteMessageHistory({
      ...props,
      contactInbox: { lastMessageAt: null },
    } as never)

    expect(mocks.findLastByConversation).toHaveBeenCalledTimes(1)
    expect(mocks.findLastByConversation).toHaveBeenCalledWith("conv-1", {
      limit: 1,
      requireCompleteResults: true,
      sinceTime: new Date(0),
      workspaceId: "ws-1",
    })
  })

  test("does not fall back when the narrow query finds a marker", async () => {
    mocks.findLastByConversation.mockResolvedValue([{ id: "10" }])

    await handleAIDeleteMessageHistory(props)

    expect(mocks.findLastByConversation).toHaveBeenCalledTimes(1)
  })

  test("also resets the canonical DM conversation from a comment conversation", async () => {
    mocks.findLastByConversation
      .mockResolvedValueOnce([{ id: "comment-last" }])
      .mockResolvedValueOnce([{ id: "dm-last" }])
    mocks.findDMByContact.mockResolvedValue({
      id: "dm-conv-1",
      workspaceId: "ws-1",
    })

    await expect(
      handleAIDeleteMessageHistory({
        ...props,
        conversation: {
          id: "comment-conv-1",
          workspaceId: "ws-1",
          contactId: "contact-1",
          sourceId: "post-1",
        },
      } as never),
    ).resolves.toEqual({
      status: "success",
      result: null,
    })

    expect(mocks.findDMByContact).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "contact-1",
      channel: "instagram",
    })
    expect(mocks.runExclusive).toHaveBeenNthCalledWith(
      1,
      "comment-conv-1",
      expect.any(Function),
    )
    expect(mocks.runExclusive).toHaveBeenNthCalledWith(
      2,
      "dm-conv-1",
      expect.any(Function),
    )
    expect(mocks.cacheDelete).toHaveBeenNthCalledWith(1, "comment-conv-1")
    expect(mocks.cacheDelete).toHaveBeenNthCalledWith(2, "dm-conv-1")
    expect(mocks.updateMarker).toHaveBeenNthCalledWith(1, {
      workspaceId: "ws-1",
      conversationId: "comment-conv-1",
      messageId: "comment-last",
    })
    expect(mocks.updateMarker).toHaveBeenNthCalledWith(2, {
      workspaceId: "ws-1",
      conversationId: "dm-conv-1",
      messageId: "dm-last",
    })
  })

  test("returns the error route when marker mutation fails after deleting the cache", async () => {
    mocks.findLastByConversation.mockResolvedValue([{ id: "10" }])
    mocks.updateMarker.mockRejectedValue(new Error("service down"))

    await expect(handleAIDeleteMessageHistory(props)).resolves.toEqual({
      status: "error",
      errorMessage: "service down",
      result: null,
    })

    expect(mocks.cacheDelete).toHaveBeenCalledTimes(1)
    expect(mocks.loggerError).toHaveBeenCalledTimes(1)
  })

  test("normalizes, logs, and routes non-storage read failures", async () => {
    mocks.findLastByConversation.mockRejectedValue(new Error("shard down"))

    await expect(handleAIDeleteMessageHistory(props)).resolves.toEqual({
      status: "error",
      errorMessage: "shard down",
      result: null,
    })

    expect(mocks.cacheDelete).not.toHaveBeenCalled()
    expect(mocks.updateMarker).not.toHaveBeenCalled()
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "aiDeleteMessageHistory",
        conversationId: "conv-1",
        workspaceId: "ws-1",
      }),
      expect.any(String),
    )
  })

  test("preserves typed storage errors for worker retry classification", async () => {
    const error = new MessageShardUnavailableError("shard down")
    mocks.findLastByConversation.mockRejectedValue(error)

    await expect(handleAIDeleteMessageHistory(props)).rejects.toBe(error)
  })
})
