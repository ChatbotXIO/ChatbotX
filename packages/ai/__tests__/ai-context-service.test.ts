import { MessageShardUnavailableError } from "@chatbotx.io/database/errors"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  aiAgentQueueAdd: vi.fn(),
  createMessageRepository: vi.fn(),
  delete: vi.fn(),
  findConversationAIContextState: vi.fn(),
  getSafeSinceTime: vi.fn(),
  get: vi.fn(),
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
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
  aiAgentQueue: { add: mocks.aiAgentQueueAdd },
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
  logger: { error: mocks.loggerError, warn: mocks.loggerWarn },
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

  test("assigns a unique, monotonic seq to each initial history entry", async () => {
    const createdAt = new Date("2026-06-01T00:00:00.000Z")
    const findAIContextMessages = vi.fn().mockResolvedValue([
      { id: "1", text: "first", senderType: "contact", createdAt },
      { id: "2", text: "second", senderType: "bot", createdAt },
      { id: "3", text: "third", senderType: "contact", createdAt },
    ])
    mocks.createMessageRepository.mockResolvedValue({ findAIContextMessages })
    mocks.findConversationAIContextState.mockResolvedValue({
      aiContextLastMessageId: null,
      lastActivityAt: createdAt,
    })
    mocks.summarizeConversation.mockResolvedValue("summary")

    const result = await aiContextService.getOrInitContext({
      workspaceId: "ws-1",
      conversationId: "conv-1",
    })

    expect(result?.history.map((m) => m.seq)).toEqual([0, 1, 2])
    expect(result?.nextSeq).toBe(3)
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

  test("enqueues a summarize job when history exceeds the trigger threshold and no job is in flight", async () => {
    mocks.get
      .mockResolvedValueOnce({
        markerMessageId: null,
        summary: "",
        history: Array.from({ length: 100 }, (_, i) => ({
          role: "user" as const,
          content: `old-${i}`,
          messageId: `old-${i}`,
          createdAt: i,
        })),
        summarizing: false,
        needsResummarize: false,
        updatedAt: Date.now(),
      })
      .mockResolvedValueOnce(null)

    await aiContextService.appendHistory({
      conversationId: "conv-1",
      newMessages: [
        { message: { role: "user", content: "new" }, messageId: "new-1" },
      ],
    })

    expect(mocks.aiAgentQueueAdd).toHaveBeenCalledTimes(1)
    expect(mocks.update).toHaveBeenCalledWith(
      "conv-1",
      expect.objectContaining({
        history: expect.arrayContaining([
          expect.objectContaining({ messageId: "new-1" }),
        ]),
      }),
    )
  })

  test("does not enqueue a second summarize job while one is already marked in-flight, and warns", async () => {
    mocks.get
      .mockResolvedValueOnce({
        markerMessageId: null,
        summary: "",
        history: Array.from({ length: 100 }, (_, i) => ({
          role: "user" as const,
          content: `old-${i}`,
          messageId: `old-${i}`,
          createdAt: i,
        })),
        summarizing: true,
        needsResummarize: false,
        updatedAt: Date.now(),
      })
      .mockResolvedValueOnce(null)

    await aiContextService.appendHistory({
      conversationId: "conv-1",
      newMessages: [
        { message: { role: "user", content: "new" }, messageId: "new-1" },
      ],
    })

    expect(mocks.aiAgentQueueAdd).not.toHaveBeenCalled()
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: "conv-1" }),
      expect.stringContaining("summarize job is already marked in-flight"),
    )
  })

  test("assigns increasing seq values to newly appended messages, starting from nextSeq", async () => {
    mocks.get
      .mockResolvedValueOnce({
        markerMessageId: null,
        summary: "",
        history: [{ role: "user", content: "old", messageId: "old-1", seq: 0 }],
        nextSeq: 1,
        summarizing: false,
        needsResummarize: false,
        updatedAt: Date.now(),
      })
      .mockResolvedValueOnce(null)

    await aiContextService.appendHistory({
      conversationId: "conv-1",
      newMessages: [
        { message: { role: "user", content: "a" }, messageId: "new-a" },
        { message: { role: "user", content: "b" }, messageId: "new-b" },
      ],
    })

    expect(mocks.update).toHaveBeenCalledWith(
      "conv-1",
      expect.objectContaining({
        nextSeq: 3,
        history: [
          expect.objectContaining({ messageId: "old-1", seq: 0 }),
          expect.objectContaining({ messageId: "new-a", seq: 1 }),
          expect.objectContaining({ messageId: "new-b", seq: 2 }),
        ],
      }),
    )
  })

  test("truncates history to the hard cap when it is stuck growing past the trigger threshold, regardless of the summarizing flag", async () => {
    const existingHistory = Array.from({ length: 149 }, (_, i) => ({
      role: "user" as const,
      content: `old-${i}`,
      messageId: `old-${i}`,
      createdAt: i,
    }))
    mocks.get
      .mockResolvedValueOnce({
        markerMessageId: null,
        summary: "",
        history: existingHistory,
        summarizing: true,
        needsResummarize: false,
        updatedAt: Date.now(),
      })
      .mockResolvedValueOnce(null)

    await aiContextService.appendHistory({
      conversationId: "conv-1",
      newMessages: Array.from({ length: 5 }, (_, i) => ({
        message: { role: "user" as const, content: `new-${i}` },
        messageId: `new-${i}`,
      })),
    })

    expect(mocks.update).toHaveBeenCalledTimes(1)
    const [, updatePayload] = mocks.update.mock.calls[0] as [
      string,
      { history: Array<{ messageId?: string }> },
    ]
    // 149 existing + 5 new = 154, capped to 150 — the oldest 4 are dropped,
    // the most recent messages (including all 5 new ones) are kept.
    expect(updatePayload.history).toHaveLength(150)
    expect(updatePayload.history.at(-1)?.messageId).toBe("new-4")
    expect(updatePayload.history.some((m) => m.messageId === "old-0")).toBe(
      false,
    )
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conv-1",
        historyLengthBeforeTruncate: 154,
        hardCap: 150,
        droppedCount: 4,
      }),
      expect.stringContaining("history exceeded hard cap"),
    )
    // Stuck-detection warn should still fire independently of the hard cap.
    expect(mocks.loggerWarn).toHaveBeenCalled()
  })
})
