import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockIntegrationQueueAdd,
  mockLoggerWarn,
  mockSimpleQueueEnqueue,
  mockWorkspaceFindById,
} = vi.hoisted(() => ({
  mockIntegrationQueueAdd: vi.fn().mockResolvedValue(undefined),
  mockLoggerWarn: vi.fn(),
  mockSimpleQueueEnqueue: vi.fn().mockResolvedValue(undefined),
  mockWorkspaceFindById: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  workspaceService: {
    findById: mockWorkspaceFindById,
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
  workspaceId: "workspace-1",
}

const queueKey = "automated-response:conversation-1-contact-inbox-1:messages"

describe("enqueueMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("uses workspace smart delay timing for the BullMQ job and Redis list", async () => {
    mockWorkspaceFindById.mockResolvedValue({
      smartResponseDelaySeconds: 30,
    })

    await enqueueMessage(enqueueProps)

    expect(mockWorkspaceFindById).toHaveBeenCalledWith({ id: "workspace-1" })
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

  test("preserves v1 env timing when workspace disables smart delay", async () => {
    mockWorkspaceFindById.mockResolvedValue({
      smartResponseDelaySeconds: null,
    })

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
