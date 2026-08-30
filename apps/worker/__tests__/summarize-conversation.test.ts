import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  aiAgentQueueAdd: vi.fn(),
  findFirstConversation: vi.fn(),
  get: vi.fn(),
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
  runExclusive: vi.fn(),
  summarizeConversation: vi.fn(),
  update: vi.fn(),
}))

vi.mock("@chatbotx.io/ai/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/ai/server")>()
  return {
    ...actual,
    aiContextStore: {
      get: mocks.get,
      runExclusive: mocks.runExclusive,
      update: mocks.update,
    },
    summarizeConversation: mocks.summarizeConversation,
  }
})
vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      conversationModel: {
        findFirst: mocks.findFirstConversation,
      },
    },
  },
}))
vi.mock("@chatbotx.io/worker-config", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/worker-config")>()
  return {
    ...actual,
    AIJobAction: { summarizeConversation: "summarizeConversation" },
    aiAgentQueue: { add: mocks.aiAgentQueueAdd },
  }
})
vi.mock("../src/lib/logger", () => ({
  logger: { error: mocks.loggerError, warn: mocks.loggerWarn },
}))

const { handleSummarizeConversation } = await import(
  "../src/ai-agent/handlers/summarize-conversation"
)

describe("handleSummarizeConversation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.runExclusive.mockImplementation(
      (_conversationId: string, fn: () => Promise<unknown>) => fn(),
    )
    mocks.update.mockResolvedValue(undefined)
  })

  test("resets the 'summarizing' flag before rethrowing when the AI summarization call fails", async () => {
    mocks.get
      .mockResolvedValueOnce({
        summarizing: false,
        needsResummarize: false,
        summary: "old summary",
        history: Array.from({ length: 25 }, (_, i) => ({
          role: "user",
          content: `msg-${i}`,
          messageId: `msg-${i}`,
        })),
      })
      .mockResolvedValueOnce({
        summarizing: true,
        needsResummarize: false,
        summary: "old summary",
        history: Array.from({ length: 25 }, (_, i) => ({
          role: "user",
          content: `msg-${i}`,
          messageId: `msg-${i}`,
        })),
      })
    mocks.findFirstConversation.mockResolvedValue({
      id: "conv-1",
      workspaceId: "ws-1",
    })
    mocks.summarizeConversation.mockRejectedValue(
      new Error("provider unavailable"),
    )

    await expect(
      handleSummarizeConversation({ conversationId: "conv-1" }),
    ).rejects.toThrow("provider unavailable")

    // The first update marks the job in-flight; the fix must add a second
    // update that clears it again once the AI call fails, so the *next*
    // appendHistory call is free to enqueue a fresh summarize job instead of
    // being permanently blocked by a flag no job will ever clear.
    expect(mocks.update).toHaveBeenCalledWith(
      "conv-1",
      expect.objectContaining({
        summarizing: true,
        needsResummarize: false,
        summarizingStartedAt: expect.any(Number),
      }),
    )
    expect(mocks.update).toHaveBeenCalledWith("conv-1", {
      summarizing: false,
      summarizingStartedAt: null,
    })
    const resetCallIndex = mocks.update.mock.calls.findIndex(
      ([, payload]) =>
        (payload as { summarizing?: boolean }).summarizing === false,
    )
    expect(resetCallIndex).toBeGreaterThan(-1)
  })

  test("does not throw when the reset-on-failure update itself fails, and still rethrows the original error", async () => {
    mocks.get.mockResolvedValue({
      summarizing: false,
      needsResummarize: false,
      summary: "",
      history: Array.from({ length: 25 }, (_, i) => ({
        role: "user",
        content: `msg-${i}`,
        messageId: `msg-${i}`,
      })),
    })
    mocks.findFirstConversation.mockResolvedValue({
      id: "conv-1",
      workspaceId: "ws-1",
    })
    mocks.summarizeConversation.mockRejectedValue(new Error("original error"))
    mocks.update.mockImplementation((_id: string, payload: object) => {
      if ("summarizing" in payload && payload.summarizing === false) {
        return Promise.reject(new Error("redis down"))
      }
      return Promise.resolve()
    })

    await expect(
      handleSummarizeConversation({ conversationId: "conv-1" }),
    ).rejects.toThrow("original error")

    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: "conv-1" }),
      expect.stringContaining("Failed to reset stuck 'summarizing' flag"),
    )
  })

  test("does not re-enter summarization while 'summarizing' is fresh (not stale)", async () => {
    mocks.get.mockResolvedValueOnce({
      summarizing: true,
      summarizingStartedAt: Date.now() - 1000, // 1s ago, well under the stale threshold
      needsResummarize: false,
      summary: "old",
      history: Array.from({ length: 25 }, (_, i) => ({
        role: "user",
        content: `msg-${i}`,
        messageId: `msg-${i}`,
      })),
    })

    await handleSummarizeConversation({ conversationId: "conv-1" })

    expect(mocks.update).toHaveBeenCalledWith("conv-1", {
      needsResummarize: true,
    })
    expect(mocks.summarizeConversation).not.toHaveBeenCalled()
    expect(mocks.loggerWarn).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("stale"),
    )
  })

  test("self-heals from a stale 'summarizing' flag left by a crashed job", async () => {
    mocks.get
      .mockResolvedValueOnce({
        summarizing: true,
        summarizingStartedAt: Date.now() - 10 * 60 * 1000, // 10 min ago
        needsResummarize: false,
        summary: "old",
        history: Array.from({ length: 25 }, (_, i) => ({
          role: "user",
          content: `msg-${i}`,
          messageId: `msg-${i}`,
        })),
      })
      .mockResolvedValueOnce({
        summarizing: true,
        needsResummarize: false,
        summary: "old",
        history: Array.from({ length: 25 }, (_, i) => ({
          role: "user",
          content: `msg-${i}`,
          messageId: `msg-${i}`,
        })),
      })
    mocks.findFirstConversation.mockResolvedValue({
      id: "conv-1",
      workspaceId: "ws-1",
    })
    mocks.summarizeConversation.mockResolvedValue("recovered summary")

    await handleSummarizeConversation({ conversationId: "conv-1" })

    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: "conv-1" }),
      expect.stringContaining("stale"),
    )
    expect(mocks.summarizeConversation).toHaveBeenCalled()
    expect(mocks.update).toHaveBeenCalledWith(
      "conv-1",
      expect.objectContaining({ summary: "recovered summary" }),
    )
  })

  test("logs and does not throw when the follow-up requeue fails after a successful summarize", async () => {
    mocks.get
      .mockResolvedValueOnce({
        summarizing: false,
        needsResummarize: false,
        summary: "old",
        history: Array.from({ length: 25 }, (_, i) => ({
          role: "user",
          content: `msg-${i}`,
          messageId: `msg-${i}`,
        })),
      })
      .mockResolvedValueOnce({
        summarizing: true,
        needsResummarize: true, // forces shouldRequeue = true
        summary: "old",
        history: Array.from({ length: 25 }, (_, i) => ({
          role: "user",
          content: `msg-${i}`,
          messageId: `msg-${i}`,
        })),
      })
    mocks.findFirstConversation.mockResolvedValue({
      id: "conv-1",
      workspaceId: "ws-1",
    })
    mocks.summarizeConversation.mockResolvedValue("new summary")
    mocks.aiAgentQueueAdd.mockRejectedValue(new Error("queue down"))

    await expect(
      handleSummarizeConversation({ conversationId: "conv-1" }),
    ).resolves.toBeUndefined()

    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: "conv-1" }),
      expect.stringContaining("Failed to requeue"),
    )
  })

  test("succeeds normally and leaves 'summarizing' false when summarization succeeds", async () => {
    mocks.get
      .mockResolvedValueOnce({
        summarizing: false,
        needsResummarize: false,
        summary: "old",
        history: Array.from({ length: 25 }, (_, i) => ({
          role: "user",
          content: `msg-${i}`,
          messageId: `msg-${i}`,
        })),
      })
      .mockResolvedValueOnce({
        summarizing: true,
        needsResummarize: false,
        summary: "old",
        history: Array.from({ length: 25 }, (_, i) => ({
          role: "user",
          content: `msg-${i}`,
          messageId: `msg-${i}`,
        })),
      })
    mocks.findFirstConversation.mockResolvedValue({
      id: "conv-1",
      workspaceId: "ws-1",
    })
    mocks.summarizeConversation.mockResolvedValue("new summary")

    await handleSummarizeConversation({ conversationId: "conv-1" })

    expect(mocks.update).toHaveBeenCalledWith(
      "conv-1",
      expect.objectContaining({ summary: "new summary", summarizing: false }),
    )
    expect(mocks.loggerError).not.toHaveBeenCalled()
  })
})
