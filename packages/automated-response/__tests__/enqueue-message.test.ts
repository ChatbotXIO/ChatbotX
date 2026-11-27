import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockAiAgentFindDefault,
  mockAiAgentQueueAdd,
  mockAutomatedResponseGetAll,
  mockLoggerWarn,
  mockSimpleQueueEnqueue,
  mockWorkspaceFindById,
  mockHasGlobalRouterEnabled,
} = vi.hoisted(() => ({
  mockAiAgentFindDefault: vi.fn(),
  mockAiAgentQueueAdd: vi.fn().mockResolvedValue(undefined),
  mockAutomatedResponseGetAll: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockSimpleQueueEnqueue: vi.fn().mockResolvedValue(undefined),
  mockWorkspaceFindById: vi.fn(),
  mockHasGlobalRouterEnabled: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  aiAgentService: {
    findDefault: mockAiAgentFindDefault,
  },
  decisionProfileService: {
    hasGlobalRouterEnabled: mockHasGlobalRouterEnabled,
  },
  workspaceService: {
    findById: mockWorkspaceFindById,
  },
}))

vi.mock("../src/utils", () => ({
  automatedResponseService: {
    getAll: mockAutomatedResponseGetAll,
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  simpleQueue: {
    enqueue: mockSimpleQueueEnqueue,
  },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  AIJobAction: {
    processAutomatedResponse: "processAutomatedResponse",
  },
  aiAgentQueue: {
    add: mockAiAgentQueueAdd,
  },
}))

vi.mock("../src/keys", () => ({
  env: {
    AUTOMATED_RESPONSE_DELAY_SECONDS: 2,
    AUTOMATED_RESPONSE_TTL_SECONDS: 2,
  },
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: mockLoggerWarn,
  },
}))

const { enqueueMessage } = await import("../src/enqueue-message")

const enqueueProps = {
  conversationId: "conversation-1",
  contactInboxId: "contact-inbox-1",
  messageId: "message-1",
  messageText: "hello",
  workspaceId: "workspace-1",
}

const queueKey = "automated-response:conversation-1-contact-inbox-1:messages"

describe("enqueueMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAiAgentFindDefault.mockResolvedValue({ id: "ai-agent-1" })
    mockAutomatedResponseGetAll.mockResolvedValue([])
    mockHasGlobalRouterEnabled.mockResolvedValue(false)
  })

  test("uses workspace smart delay timing for AI messages without keyword matches", async () => {
    mockWorkspaceFindById.mockResolvedValue({
      smartResponseDelaySeconds: 30,
    })

    await enqueueMessage(enqueueProps)

    expect(mockWorkspaceFindById).toHaveBeenCalledWith({ id: "workspace-1" })
    expect(mockAutomatedResponseGetAll).toHaveBeenCalledWith("workspace-1")
    expect(mockAiAgentFindDefault).toHaveBeenCalledWith("workspace-1")
    expect(mockHasGlobalRouterEnabled).toHaveBeenCalledWith("workspace-1")
    expect(mockAiAgentQueueAdd).toHaveBeenCalledWith(
      "processAutomatedResponse",
      {
        type: "processAutomatedResponse",
        data: {
          conversationId: "conversation-1",
          contactInboxId: "contact-inbox-1",
          messageId: "message-1",
        },
      },
      {
        deduplication: {
          id: queueKey,
          ttl: 30_000,
          extend: true,
          replace: true,
        },
        delay: 30_000,
        jobId: "automated-response-message-1",
      },
    )
    expect(mockSimpleQueueEnqueue).toHaveBeenCalledWith(
      queueKey,
      "message-1",
      150_000,
    )
  })

  test("preserves v1 env timing when the message matches a keyword rule", async () => {
    mockWorkspaceFindById.mockResolvedValue({
      smartResponseDelaySeconds: 30,
    })
    mockAutomatedResponseGetAll.mockResolvedValue([
      { keywords: ["hello"], type: "inbound" },
    ])

    await enqueueMessage(enqueueProps)

    expect(mockAiAgentQueueAdd).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({
        delay: 2000,
        deduplication: expect.objectContaining({
          ttl: 2000,
        }),
      }),
    )
    expect(mockSimpleQueueEnqueue).toHaveBeenCalledWith(
      queueKey,
      "message-1",
      10_000,
    )
  })

  test("preserves v1 env timing when the workspace has no default AI agent", async () => {
    mockWorkspaceFindById.mockResolvedValue({
      smartResponseDelaySeconds: 30,
    })
    mockAiAgentFindDefault.mockResolvedValue(undefined)

    await enqueueMessage(enqueueProps)

    expect(mockAiAgentQueueAdd).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({
        delay: 2000,
        deduplication: expect.objectContaining({
          ttl: 2000,
        }),
      }),
    )
  })

  test("uses smart delay when Global Router is the only async responder", async () => {
    mockWorkspaceFindById.mockResolvedValue({
      smartResponseDelaySeconds: 30,
    })
    mockAiAgentFindDefault.mockResolvedValue(undefined)
    mockHasGlobalRouterEnabled.mockResolvedValue(true)

    await enqueueMessage(enqueueProps)

    expect(mockAiAgentQueueAdd).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({
        delay: 30_000,
        deduplication: expect.objectContaining({ ttl: 30_000 }),
      }),
    )
  })

  test("skips keyword lookup when message text is omitted", async () => {
    mockWorkspaceFindById.mockResolvedValue({
      smartResponseDelaySeconds: 30,
    })

    await enqueueMessage({
      conversationId: "conversation-1",
      contactInboxId: "contact-inbox-1",
      messageId: "message-1",
      workspaceId: "workspace-1",
    })

    expect(mockAutomatedResponseGetAll).not.toHaveBeenCalled()
    expect(mockAiAgentFindDefault).toHaveBeenCalledWith("workspace-1")
    expect(mockAiAgentQueueAdd).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({
        delay: 30_000,
        deduplication: expect.objectContaining({
          ttl: 30_000,
        }),
      }),
    )
  })

  test("preserves v1 env timing when workspace disables smart delay", async () => {
    mockWorkspaceFindById.mockResolvedValue({
      smartResponseDelaySeconds: null,
    })

    await enqueueMessage(enqueueProps)

    expect(mockAutomatedResponseGetAll).not.toHaveBeenCalled()
    expect(mockAiAgentFindDefault).not.toHaveBeenCalled()
    expect(mockAiAgentQueueAdd).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({
        delay: 2000,
        deduplication: expect.objectContaining({
          ttl: 2000,
        }),
      }),
    )
    expect(mockSimpleQueueEnqueue).toHaveBeenCalledWith(
      queueKey,
      "message-1",
      10_000,
    )
  })

  test("falls back to env timing when workspace lookup fails", async () => {
    const lookupError = new Error("cache unavailable")
    mockWorkspaceFindById.mockRejectedValue(lookupError)

    await expect(enqueueMessage(enqueueProps)).resolves.toBe(true)

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      lookupError,
      "Smart delay lookup failed; using default timing",
    )
    expect(mockAiAgentQueueAdd).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({
        delay: 2000,
        deduplication: expect.objectContaining({
          ttl: 2000,
        }),
      }),
    )
  })

  describe("image/video without text", () => {
    const mediaProps = {
      ...enqueueProps,
      messageText: "",
      attachmentFileTypes: ["image" as const],
    }

    test("is not queued when no inbound keyword rule matches it", async () => {
      mockWorkspaceFindById.mockResolvedValue({})
      mockAutomatedResponseGetAll.mockResolvedValue([
        {
          type: "inbound",
          keywords: [],
          conditions: [{ operator: "containsVideo", values: [] }],
        },
        {
          type: "outbound",
          keywords: [],
          conditions: [{ operator: "containsImage", values: [] }],
        },
      ])

      await expect(enqueueMessage(mediaProps)).resolves.toBe(false)

      expect(mockAiAgentQueueAdd).not.toHaveBeenCalled()
      expect(mockSimpleQueueEnqueue).not.toHaveBeenCalled()
    })

    test("is queued when an inbound image condition matches it", async () => {
      mockWorkspaceFindById.mockResolvedValue({})
      mockAutomatedResponseGetAll.mockResolvedValue([
        {
          type: "inbound",
          keywords: [],
          conditions: [{ operator: "containsImage", values: [] }],
        },
      ])

      await expect(enqueueMessage(mediaProps)).resolves.toBe(true)

      expect(mockAiAgentQueueAdd).toHaveBeenCalledTimes(1)
      expect(mockSimpleQueueEnqueue).toHaveBeenCalledWith(
        queueKey,
        "message-1",
        expect.any(Number),
      )
    })

    test("is not queued when the keyword lookup fails", async () => {
      mockAutomatedResponseGetAll.mockRejectedValue(new Error("redis down"))

      await expect(enqueueMessage(mediaProps)).resolves.toBe(false)

      expect(mockAiAgentQueueAdd).not.toHaveBeenCalled()
    })
  })

  describe("audio without text", () => {
    const audioProps = {
      ...enqueueProps,
      messageText: "",
      attachmentFileTypes: ["audio" as const],
    }

    test("is queued when an inbound audio condition matches it", async () => {
      mockWorkspaceFindById.mockResolvedValue({})
      mockAutomatedResponseGetAll.mockResolvedValue([
        {
          type: "inbound",
          keywords: [],
          conditions: [{ operator: "containsAudio", values: [] }],
        },
      ])

      await expect(enqueueMessage(audioProps)).resolves.toBe(true)

      expect(mockAiAgentQueueAdd).toHaveBeenCalledTimes(1)
      expect(mockSimpleQueueEnqueue).toHaveBeenCalledWith(
        queueKey,
        "message-1",
        expect.any(Number),
      )
    })

    test("is not queued when only image/video rules exist", async () => {
      mockWorkspaceFindById.mockResolvedValue({})
      mockAutomatedResponseGetAll.mockResolvedValue([
        {
          type: "inbound",
          keywords: [],
          conditions: [{ operator: "containsImage", values: [] }],
        },
        {
          type: "inbound",
          keywords: [],
          conditions: [{ operator: "containsVideo", values: [] }],
        },
      ])

      await expect(enqueueMessage(audioProps)).resolves.toBe(false)

      expect(mockAiAgentQueueAdd).not.toHaveBeenCalled()
      expect(mockSimpleQueueEnqueue).not.toHaveBeenCalled()
    })

    test("is not queued by a rule that only negates text", async () => {
      mockWorkspaceFindById.mockResolvedValue({})
      mockAutomatedResponseGetAll.mockResolvedValue([
        {
          type: "inbound",
          keywords: [],
          conditions: [{ operator: "notContains", values: ["stop"] }],
        },
      ])

      await expect(enqueueMessage(audioProps)).resolves.toBe(false)

      expect(mockAiAgentQueueAdd).not.toHaveBeenCalled()
    })

    test("loads the keyword rules once when smart delay is on", async () => {
      mockWorkspaceFindById.mockResolvedValue({ smartResponseDelaySeconds: 30 })
      mockAutomatedResponseGetAll.mockResolvedValue([
        {
          type: "inbound",
          keywords: [],
          conditions: [{ operator: "containsAudio", values: [] }],
        },
      ])

      await expect(enqueueMessage(audioProps)).resolves.toBe(true)

      // The media-only gate and the smart-delay check share one lookup.
      expect(mockAutomatedResponseGetAll).toHaveBeenCalledTimes(1)
      // A matching keyword keeps the v1 env timing, not the 30 s smart delay.
      expect(mockAiAgentQueueAdd).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({ delay: 2000 }),
      )
    })

    test("is not queued by an outbound rule", async () => {
      mockWorkspaceFindById.mockResolvedValue({})
      mockAutomatedResponseGetAll.mockResolvedValue([
        {
          type: "outbound",
          keywords: [],
          conditions: [{ operator: "containsAudio", values: [] }],
        },
      ])

      await expect(enqueueMessage(audioProps)).resolves.toBe(false)

      expect(mockAiAgentQueueAdd).not.toHaveBeenCalled()
    })

    test("is not queued when the keyword lookup fails", async () => {
      mockAutomatedResponseGetAll.mockRejectedValue(new Error("redis down"))

      await expect(enqueueMessage(audioProps)).resolves.toBe(false)

      expect(mockAiAgentQueueAdd).not.toHaveBeenCalled()
    })
  })
})
