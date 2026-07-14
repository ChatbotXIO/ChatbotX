import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockBuildContext,
  mockCreateMessageRepository,
  mockEmit,
  mockFindConversation,
  mockFindContactInbox,
  mockIdentifyIntegration,
  mockLoggerWarn,
  mockMarkReadByContact,
  mockRunChannelHandler,
} = vi.hoisted(() => ({
  mockBuildContext: vi.fn().mockResolvedValue({ workspaceId: "ws-1" }),
  mockCreateMessageRepository: vi.fn().mockResolvedValue({
    findBySourceId: vi.fn().mockResolvedValue(null),
  }),
  mockEmit: vi.fn().mockResolvedValue(undefined),
  mockFindConversation: vi.fn(),
  mockFindContactInbox: vi.fn(),
  mockIdentifyIntegration: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockMarkReadByContact: vi.fn().mockResolvedValue(undefined),
  mockRunChannelHandler: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  buildContext: mockBuildContext,
  contactInboxService: {
    findByUncached: mockFindContactInbox,
  },
  conversationService: {
    findDMByContact: mockFindConversation,
    markReadByContact: mockMarkReadByContact,
  },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      contactInboxModel: { findFirst: mockFindContactInbox },
    },
  },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: mockCreateMessageRepository,
  getSafeSinceTime: vi.fn((date: Date | null) => date ?? new Date(0)),
}))

vi.mock("@chatbotx.io/event-bus", () => ({
  emit: mockEmit,
}))

vi.mock("@chatbotx.io/sdk", () => ({
  SdkException: class SdkException extends Error {},
}))

vi.mock("@chatbotx.io/flow-config", () => ({
  messageEventTypeSchema: {
    enum: {
      "message:delivered": "message:delivered",
      "message:failed": "message:failed",
      "message:received": "message:received",
      "message:seen": "message:seen",
    },
  },
  UPDATE_STATUS_PAYLOAD_TYPE: "update_status",
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: { messageStatus: "messageStatus" },
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: mockLoggerWarn,
    info: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock("../src/services/integrations", () => ({
  allIntegrations: {
    messenger: { runChannelHandler: mockRunChannelHandler },
    whatsapp: { runChannelHandler: mockRunChannelHandler },
  },
  integrationService: {
    identifyInboxAndIntegrationAuthFromIdentifier: mockIdentifyIntegration,
  },
}))

vi.mock("../src/integration/handlers/flow", () => ({
  runFlowPostback: vi.fn(),
}))

const { contactMarkAsRead } = await import(
  "../src/integration/handlers/conversation"
)
const { handleMessageStatus } = await import(
  "../src/integration/handlers/message-status"
)

const contactInbox = {
  id: "ci-1",
  contactId: "contact-1",
  inboxId: "inbox-1",
  sourceId: "source-contact-1",
  lastMessageAt: null,
  conversation: {
    id: "conv-1",
    workspaceId: "ws-1",
  },
  contact: {
    id: "contact-1",
  },
}

type MarkReadByContactProps = {
  workspaceId: string
  conversationId: string
  contactInboxId: string
  contactId: string
  seenAt: Date
}

const firstMarkReadByContactProps = (): MarkReadByContactProps => {
  const props = mockMarkReadByContact.mock.calls[0]?.[0] as
    | MarkReadByContactProps
    | undefined
  if (!props) {
    throw new Error("Expected markReadByContact to be called")
  }
  return props
}

describe("read receipt timestamp handling", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIdentifyIntegration.mockResolvedValue({
      inbox: {
        id: "inbox-1",
        workspaceId: "ws-1",
        channel: "whatsapp",
      },
      integrationRow: { id: "integration-1" },
    })
    mockFindContactInbox.mockResolvedValue(contactInbox)
    mockFindConversation.mockResolvedValue(contactInbox.conversation)
    mockRunChannelHandler.mockResolvedValue({
      contact: { sourceId: "source-contact-1" },
    })
  })

  test("contactMarkAsRead uses Zalo top-level millisecond timestamp string", async () => {
    const seenAt = new Date(1_700_000_000_123)

    await contactMarkAsRead({
      integrationType: "zalo",
      integrationIdentifier: "oa-1",
      sourceConversationId: "source-contact-1",
      payload: { timestamp: "1700000000123" },
    })

    expect(mockMarkReadByContact).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      contactInboxId: "ci-1",
      contactId: "contact-1",
      seenAt,
    })
    expect(mockEmit).toHaveBeenCalledWith(
      "message:seen",
      expect.objectContaining({ occurredAt: seenAt }),
    )
  })

  test("contactMarkAsRead falls back to one shared Date when payload has no timestamp", async () => {
    await contactMarkAsRead({
      integrationType: "messenger",
      integrationIdentifier: "page-1",
      sourceConversationId: "source-contact-1",
      payload: undefined,
    })

    const markReadProps = firstMarkReadByContactProps()
    const event = mockEmit.mock.calls[0]?.[1] as { occurredAt: Date }

    expect(markReadProps.seenAt).toBeInstanceOf(Date)
    expect(markReadProps.seenAt).toBe(event.occurredAt)
  })

  test("contactMarkAsRead falls back when Messenger webhook timestamp is invalid", async () => {
    await contactMarkAsRead({
      integrationType: "messenger",
      integrationIdentifier: "page-1",
      sourceConversationId: "source-contact-1",
      payload: {
        object: "page",
        entry: [{ messaging: [{ timestamp: "abc" }] }],
      },
    })

    const markReadProps = firstMarkReadByContactProps()
    const event = mockEmit.mock.calls[0]?.[1] as { occurredAt: Date }

    expect(markReadProps.seenAt).toBeInstanceOf(Date)
    expect(markReadProps.seenAt).toBe(event.occurredAt)
  })

  test("contactMarkAsRead skips gracefully when contact inbox is missing", async () => {
    mockFindContactInbox.mockResolvedValueOnce(null)

    await expect(
      contactMarkAsRead({
        integrationType: "messenger",
        integrationIdentifier: "page-1",
        sourceConversationId: "missing-source",
        payload: {
          object: "page",
          entry: [{ messaging: [{ timestamp: 1_700_000_000_123 }] }],
        },
      }),
    ).resolves.toBeUndefined()

    expect(mockMarkReadByContact).not.toHaveBeenCalled()
    expect(mockEmit).not.toHaveBeenCalled()
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      {
        integrationType: "messenger",
        integrationIdentifier: "page-1",
        sourceConversationId: "missing-source",
      },
      "contactMarkAsRead: no contact inbox for this source id, skipping",
    )
  })

  test("contactMarkAsRead skips gracefully when no DM conversation exists", async () => {
    mockFindConversation.mockResolvedValueOnce(undefined)

    await expect(
      contactMarkAsRead({
        integrationType: "messenger",
        integrationIdentifier: "page-1",
        sourceConversationId: "source-contact-1",
        payload: {
          object: "page",
          entry: [{ messaging: [{ timestamp: 1_700_000_000_123 }] }],
        },
      }),
    ).resolves.toBeUndefined()

    expect(mockMarkReadByContact).not.toHaveBeenCalled()
    expect(mockEmit).not.toHaveBeenCalled()
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      {
        integrationType: "messenger",
        integrationIdentifier: "page-1",
        sourceConversationId: "source-contact-1",
        contactInboxId: "ci-1",
        contactId: "contact-1",
      },
      "contactMarkAsRead: no DM conversation for contact inbox, skipping",
    )
  })

  test("contactMarkAsRead writes conversation, contact inbox, and event with the same webhook timestamp", async () => {
    const seenAt = new Date(1_700_000_000_123)

    await contactMarkAsRead({
      integrationType: "messenger",
      integrationIdentifier: "page-1",
      sourceConversationId: "source-contact-1",
      payload: {
        object: "page",
        entry: [{ messaging: [{ timestamp: 1_700_000_000_123 }] }],
      },
    })

    expect(mockMarkReadByContact).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      contactInboxId: "ci-1",
      contactId: "contact-1",
      seenAt,
    })
    expect(mockEmit).toHaveBeenCalledWith(
      "message:seen",
      expect.objectContaining({ occurredAt: seenAt }),
    )
  })

  test("messageStatus read writes conversation, contact inbox, and event with the same WhatsApp seconds timestamp", async () => {
    const seenAt = new Date(1_700_000_000_000)

    await handleMessageStatus({
      integrationType: "whatsapp",
      integrationIdentifier: "phone-number-1",
      payload: {
        messageId: "provider-message-1",
        status: "read",
        timestamp: "1700000000",
      },
    })

    expect(mockMarkReadByContact).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      contactInboxId: "ci-1",
      contactId: "contact-1",
      seenAt,
    })
    expect(mockEmit).toHaveBeenCalledWith(
      "message:seen",
      expect.objectContaining({ occurredAt: seenAt }),
    )
  })

  test("messageStatus delivered emits without updating contactLastReadAt", async () => {
    await handleMessageStatus({
      integrationType: "whatsapp",
      integrationIdentifier: "phone-number-1",
      payload: {
        messageId: "provider-message-1",
        status: "delivered",
        timestamp: "1700000000",
      },
    })

    expect(mockMarkReadByContact).not.toHaveBeenCalled()
    expect(mockEmit).toHaveBeenCalledWith(
      "message:delivered",
      expect.objectContaining({ occurredAt: expect.any(Date) }),
    )
  })

  test("messageStatus failed emits without updating contactLastReadAt", async () => {
    await handleMessageStatus({
      integrationType: "whatsapp",
      integrationIdentifier: "phone-number-1",
      payload: {
        messageId: "provider-message-1",
        status: "failed",
        timestamp: "1700000000",
        error: { code: "bad-template" },
      },
    })

    expect(mockMarkReadByContact).not.toHaveBeenCalled()
    expect(mockEmit).toHaveBeenCalledWith(
      "message:failed",
      expect.objectContaining({
        errorData: { code: "bad-template" },
        occurredAt: expect.any(Date),
      }),
    )
  })

  test("messageStatus read updates contactLastReadAt even when message lookup returns null", async () => {
    await handleMessageStatus({
      integrationType: "whatsapp",
      integrationIdentifier: "phone-number-1",
      payload: {
        messageId: "unknown-message",
        status: "read",
        timestamp: "1700000000",
      },
    })

    expect(mockMarkReadByContact).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      contactInboxId: "ci-1",
      contactId: "contact-1",
      seenAt: new Date(1_700_000_000_000),
    })
  })

  test("messageStatus read keeps millisecond timestamp unchanged", async () => {
    const seenAt = new Date(1_700_000_000_123)

    await handleMessageStatus({
      integrationType: "whatsapp",
      integrationIdentifier: "phone-number-1",
      payload: {
        messageId: "provider-message-1",
        status: "read",
        timestamp: "1700000000123",
      },
    })

    expect(mockMarkReadByContact).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      contactInboxId: "ci-1",
      contactId: "contact-1",
      seenAt,
    })
    expect(mockEmit).toHaveBeenCalledWith(
      "message:seen",
      expect.objectContaining({ occurredAt: seenAt }),
    )
  })

  test("messageStatus read falls back when timestamp is invalid", async () => {
    await handleMessageStatus({
      integrationType: "whatsapp",
      integrationIdentifier: "phone-number-1",
      payload: {
        messageId: "provider-message-1",
        status: "read",
        timestamp: "abc",
      },
    })

    const markReadProps = firstMarkReadByContactProps()
    const event = mockEmit.mock.calls[0]?.[1] as { occurredAt: Date }

    expect(markReadProps.seenAt).toBeInstanceOf(Date)
    expect(markReadProps.seenAt).toBe(event.occurredAt)
  })
})
