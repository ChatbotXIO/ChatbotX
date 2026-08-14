import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockAiAgentFindDefault,
  mockAutomatedResponseGetAll,
  mockIntegrationQueueAdd,
  mockLoggerWarn,
  mockSimpleQueueEnqueue,
  mockWorkspaceFindById,
} = vi.hoisted(() => ({
  mockAiAgentFindDefault: vi.fn(),
  mockAutomatedResponseGetAll: vi.fn(),
  mockIntegrationQueueAdd: vi.fn().mockResolvedValue(undefined),
  mockLoggerWarn: vi.fn(),
  mockSimpleQueueEnqueue: vi.fn().mockResolvedValue(undefined),
  mockWorkspaceFindById: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  aiAgentService: {
    findDefault: mockAiAgentFindDefault,
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
  IntegrationJobAction: {
    processAutomatedResonse: "processAutomatedResonse",
  },
  integrationQueue: {
    add: mockIntegrationQueueAdd,
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
  })

  test("uses workspace smart delay timing for AI messages without keyword matches", async () => {
    mockWorkspaceFindById.mockResolvedValue({
      smartResponseDelaySeconds: 30,
    })

    await enqueueMessage(enqueueProps)

    expect(mockWorkspaceFindById).toHaveBeenCalledWith({ id: "workspace-1" })
    expect(mockAutomatedResponseGetAll).toHaveBeenCalledWith("workspace-1")
    expect(mockAiAgentFindDefault).toHaveBeenCalledWith("workspace-1")
    expect(mockIntegrationQueueAdd).toHaveBeenCalledWith(
      "processAutomatedResonse",
      {
        type: "processAutomatedResonse",
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

    expect(mockIntegrationQueueAdd).toHaveBeenCalledWith(
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

    expect(mockIntegrationQueueAdd).toHaveBeenCalledWith(
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
    expect(mockIntegrationQueueAdd).toHaveBeenCalledWith(
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
    expect(mockIntegrationQueueAdd).toHaveBeenCalledWith(
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

    await expect(enqueueMessage(enqueueProps)).resolves.toBeUndefined()

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      lookupError,
      "Smart delay lookup failed; using default timing",
    )
    expect(mockIntegrationQueueAdd).toHaveBeenCalledWith(
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
})
