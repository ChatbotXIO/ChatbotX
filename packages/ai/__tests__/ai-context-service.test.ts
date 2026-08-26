import { MessageShardUnavailableError } from "@chatbotx.io/database/errors"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createMessageRepository: vi.fn(),
  delete: vi.fn(),
  findConversationAIContextState: vi.fn(),
  getSafeSinceTime: vi.fn(),
  get: vi.fn(),
  queueAdd: vi.fn(),
  loggerError: vi.fn(),
  runExclusive: vi.fn(),
  summarizeConversation: vi.fn(),
  update: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: mocks.createMessageRepository,
  findConversationAIContextState: mocks.findConversationAIContextState,
  getSafeSinceTime: mocks.getSafeSinceTime,
}))
vi.mock("@chatbotx.io/worker-config", () => ({
  AIJobAction: { summarizeConversation: "summarizeConversation" },
  aiAgentQueue: { add: mocks.queueAdd },
}))
vi.mock("../src/server/cache/ai-context-store", () => ({
  aiContextStore: {
    delete: mocks.delete,
    get: mocks.get,
    runExclusive: mocks.runExclusive,
    update: mocks.update,
  },
}))
vi.mock("../src/server/services/summarizer", () => ({
  summarizeConversation: mocks.summarizeConversation,
}))
vi.mock("../src/logger", () => ({
  logger: { error: mocks.loggerError },
}))

const { aiContextService } = await import(
  "../src/server/services/ai-context-service"
)

describe("aiContextService.getOrInitContext", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.runExclusive.mockImplementation(
      (_conversationId: string, fn: () => Promise<unknown>) => fn(),
    )
    mocks.get.mockResolvedValue(null)
    mocks.delete.mockResolvedValue(undefined)
    mocks.getSafeSinceTime.mockReturnValue(new Date("2025-06-01T00:00:00.000Z"))
    mocks.update.mockResolvedValue(undefined)
  })

  test("keeps history empty when the marker is the latest message", async () => {
    const marker = {
      id: "10",
      text: "already deleted",
      senderType: "contact",
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
    }
    const findAIContextMessages = vi.fn().mockResolvedValue([])
    mocks.createMessageRepository.mockResolvedValue({ findAIContextMessages })
    mocks.findConversationAIContextState.mockResolvedValue({
      aiContextLastMessageId: marker.id,
      lastActivityAt: marker.createdAt,
    })

    const result = await aiContextService.getOrInitContext({
      workspaceId: "ws-1",
      conversationId: "conv-1",
    })

    expect(result?.history).toEqual([])
    expect(result?.summary).toBe("")
    expect(mocks.summarizeConversation).not.toHaveBeenCalled()
    expect(findAIContextMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conv-1",
        markerMessageId: marker.id,
        workspaceId: "ws-1",
      }),
    )
  })

  test("uses lastActivityAt as the lower-bound anchor", async () => {
    const lastActivityAt = new Date("2026-06-01T00:00:00.000Z")
    mocks.createMessageRepository.mockResolvedValue({
      findAIContextMessages: vi.fn().mockResolvedValue([]),
    })
    mocks.findConversationAIContextState.mockResolvedValue({
      aiContextLastMessageId: null,
      lastActivityAt,
    })

    await aiContextService.getOrInitContext({
      workspaceId: "ws-1",
      conversationId: "conv-1",
    })

    expect(mocks.getSafeSinceTime).toHaveBeenCalledWith(
      lastActivityAt,
      365 * 24 * 60 * 60 * 1000,
    )
  })

  test("does not summarize restored history when summaries are disabled", async () => {
    const createdAt = new Date("2026-06-01T00:00:00.000Z")
    mocks.createMessageRepository.mockResolvedValue({
      findAIContextMessages: vi.fn().mockResolvedValue([
        { id: "10", text: "new lead", senderType: "contact", createdAt },
      ]),
    })
    mocks.findConversationAIContextState.mockResolvedValue({
      aiContextLastMessageId: null,
      lastActivityAt: createdAt,
    })

    const result = await aiContextService.getOrInitContext({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      disableSummary: true,
    })

    expect(result?.summary).toBe("")
    expect(result?.history).toHaveLength(1)
    expect(mocks.summarizeConversation).not.toHaveBeenCalled()
  })

  test("keeps only messages newer than the marker when timestamps match", async () => {
    const createdAt = new Date("2026-06-01T00:00:00.000Z")
    const findAIContextMessages = vi
      .fn()
      .mockResolvedValue([
        { id: "10", text: "new", senderType: "contact", createdAt },
      ])
    mocks.createMessageRepository.mockResolvedValue({ findAIContextMessages })
    mocks.findConversationAIContextState.mockResolvedValue({
      aiContextLastMessageId: "9",
      lastActivityAt: createdAt,
    })
    mocks.summarizeConversation.mockResolvedValue("summary")

    const result = await aiContextService.getOrInitContext({
      workspaceId: "ws-1",
      conversationId: "conv-1",
    })

    expect(result?.history.map((message) => message.messageId)).toEqual(["10"])
  })

  test("reinitializes cached context when its marker is stale", async () => {
    const findAIContextMessages = vi.fn().mockResolvedValue([])
    mocks.createMessageRepository.mockResolvedValue({ findAIContextMessages })
    mocks.get.mockResolvedValue({
      markerMessageId: null,
      summary: "old personal data",
      history: [{ role: "user", content: "old message" }],
      summarizing: false,
      needsResummarize: false,
      updatedAt: Date.now(),
    })
    mocks.findConversationAIContextState.mockResolvedValue({
      aiContextLastMessageId: "marker-1",
      lastActivityAt: new Date("2026-06-01T00:00:00.000Z"),
    })

    const result = await aiContextService.getOrInitContext({
      workspaceId: "ws-1",
      conversationId: "conv-1",
    })

    expect(mocks.delete).toHaveBeenCalledWith("conv-1")
    expect(result?.markerMessageId).toBe("marker-1")
    expect(result?.summary).toBe("")
    expect(result?.history).toEqual([])
  })

  test("rethrows storage failures without caching partial history", async () => {
    mocks.createMessageRepository.mockResolvedValue({
      findAIContextMessages: vi
        .fn()
        .mockRejectedValue(new MessageShardUnavailableError("shard down")),
    })
    mocks.findConversationAIContextState.mockResolvedValue({
      aiContextLastMessageId: null,
      lastActivityAt: new Date(),
    })

    await expect(
      aiContextService.getOrInitContext({
        workspaceId: "ws-1",
        conversationId: "conv-1",
      }),
    ).rejects.toThrow("shard down")

    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "getOrInitContext",
        conversationId: "conv-1",
        workspaceId: "ws-1",
      }),
      expect.any(String),
    )
  })

  test("does not read messages when the conversation is outside the workspace", async () => {
    const findAIContextMessages = vi.fn()
    mocks.createMessageRepository.mockResolvedValue({ findAIContextMessages })
    mocks.findConversationAIContextState.mockResolvedValue(null)

    await expect(
      aiContextService.getOrInitContext({
        workspaceId: "other-ws",
        conversationId: "conv-1",
      }),
    ).resolves.toBeNull()

    expect(mocks.createMessageRepository).not.toHaveBeenCalled()
    expect(findAIContextMessages).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })
})

describe("aiContextService.appendHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.runExclusive.mockImplementation(
      (_conversationId: string, fn: () => Promise<unknown>) => fn(),
    )
    mocks.update.mockResolvedValue(undefined)
  })

  test("does not enqueue summarization when summaries are disabled", async () => {
    const existingHistory = Array.from({ length: 100 }, (_, index) => ({
      role: "user" as const,
      content: `message ${index}`,
      messageId: `${index}`,
      createdAt: index,
    }))
    mocks.get
      .mockResolvedValueOnce({
        markerMessageId: null,
        summary: "old summary",
        history: existingHistory,
        summarizing: false,
        needsResummarize: false,
        updatedAt: Date.now(),
      })
      .mockResolvedValueOnce({
        markerMessageId: null,
        summary: "old summary",
        history: existingHistory.slice(1),
        summarizing: false,
        needsResummarize: false,
        updatedAt: Date.now(),
      })

    await aiContextService.appendHistory({
      conversationId: "conv-1",
      disableSummary: true,
      newMessages: [
        {
          message: { role: "assistant", content: "reply" },
          messageId: "reply-1",
          createdAt: 101,
        },
      ],
    })

    expect(mocks.queueAdd).not.toHaveBeenCalled()
    expect(mocks.update).toHaveBeenCalledWith(
      "conv-1",
      expect.objectContaining({
        needsResummarize: false,
        history: expect.arrayContaining([
          expect.objectContaining({ messageId: "reply-1" }),
        ]),
      }),
    )
    const updatePayload = mocks.update.mock.calls[0]?.[1] as {
      history: unknown[]
    }
    expect(updatePayload.history).toHaveLength(100)
  })
})
