import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// Hoist mock references
// ---------------------------------------------------------------------------

const {
  mockCreateOrUpdate,
  mockCreateOrUpdateWithAttachments,
  mockCreateMessageRepository,
  mockDbUpdate,
  mockFindOrFail,
  mockFindContactInbox,
  mockRunChannelHandler,
  mockBroadcast,
  mockEmit,
  mockBuildContext,
  mockresolveTenantSettings,
  mockUpdateContactFromMessage,
  mockIntegrationQueueAdd,
  mockDbSet,
  mockDbTransaction,
} = vi.hoisted(() => {
  const mockDbSet = vi.fn()
  const updateChain = { set: mockDbSet, where: vi.fn() }
  updateChain.set.mockReturnValue(updateChain)
  updateChain.where.mockResolvedValue(undefined)
  const mockDbUpdate = vi.fn().mockReturnValue(updateChain)
  const mockDbTransaction = vi
    .fn()
    .mockImplementation((fn: (tx: unknown) => unknown) =>
      fn({ update: mockDbUpdate }),
    )

  const mockFindContactInbox = vi.fn()
  const mockFindOrFail = vi.fn()

  const mockRunChannelHandler = vi.fn()

  const mockCreateOrUpdate = vi.fn()
  const mockCreateOrUpdateWithAttachments = vi.fn()
  const mockCreateMessageRepository = vi.fn().mockResolvedValue({
    createOrUpdate: mockCreateOrUpdate,
    createOrUpdateWithAttachments: mockCreateOrUpdateWithAttachments,
  })

  return {
    mockCreateOrUpdate,
    mockCreateOrUpdateWithAttachments,
    mockCreateMessageRepository,
    mockDbUpdate,
    mockFindContactInbox,
    mockFindOrFail,
    mockRunChannelHandler,
    mockBroadcast: vi.fn(),
    mockEmit: vi.fn().mockResolvedValue(undefined),
    mockBuildContext: vi.fn().mockResolvedValue({ workspaceId: "ws-1" }),
    mockresolveTenantSettings: vi.fn().mockResolvedValue({}),
    mockUpdateContactFromMessage: vi.fn().mockResolvedValue(undefined),
    mockIntegrationQueueAdd: vi.fn().mockResolvedValue(undefined),
    mockDbSet,
    mockDbTransaction,
  }
})

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: mockCreateMessageRepository,
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    update: mockDbUpdate,
    query: {
      contactInboxModel: { findFirst: mockFindContactInbox },
    },
    transaction: mockDbTransaction,
  },
  eq: vi.fn((col: unknown, val: unknown) => ({ __eq: [col, val] })),
  findOrFail: mockFindOrFail,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactInboxModel: {
    id: "id",
    lastMessageAt: "lastMessageAt",
    lastIncomingMessageAt: "lastIncomingMessageAt",
  },
  contactModel: { id: "id" },
  conversationModel: { id: "id", lastActivityAt: "lastActivityAt" },
}))

vi.mock("@chatbotx.io/business", () => ({
  broadcastToWorkspaceParty: mockBroadcast,
  buildContext: mockBuildContext,
  resolveTenantSettings: mockresolveTenantSettings,
  updateContactFromMessage: mockUpdateContactFromMessage,
  workspaceService: { find: vi.fn().mockResolvedValue(null) },
  userQuotaService: {
    isLimitReached: vi.fn().mockResolvedValue(false),
    increment: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock("@chatbotx.io/event-bus", () => ({
  emit: mockEmit,
}))

vi.mock("@chatbotx.io/events", () => ({
  emitContactCreated: vi.fn().mockResolvedValue(undefined),
  setWebhookExecutionContext: vi.fn(),
}))

vi.mock("@chatbotx.io/partysocket-config", () => ({
  RealtimeEventType: { messageCreated: "messageCreated" },
}))

vi.mock("@chatbotx.io/sdk", () => ({
  SdkException: class SdkException extends Error {},
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return { ...actual, createId: vi.fn(() => "test-id") }
})

vi.mock("@chatbotx.io/flow-config", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/flow-config")>()
  return { ...actual }
})

vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: {
    runFlowPostback: "runFlowPostback",
    runFlowQuickReply: "runFlowQuickReply",
    runRef: "runRef",
  },
  integrationQueue: { add: mockIntegrationQueueAdd },
}))

vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

vi.mock("../src/services/integrations", () => ({
  allIntegrations: {
    messenger: {
      runChannelHandler: mockRunChannelHandler,
    },
  },
  integrationService: {
    identifyInboxAndIntegrationAuthFromIdentifier: vi.fn(),
  },
}))

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

const { receiveMessage } = await import(
  "../src/integration/handlers/received-message"
)
const { integrationService } = await import("../src/services/integrations")

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fakeInbox = {
  id: "inbox-1",
  workspaceId: "ws-1",
  channel: "messenger",
} as unknown as import("@chatbotx.io/database/types").InboxModel

const fakeIntegrationRow = {
  id: "integration-1",
  auth: {},
  inboxId: "inbox-1",
} as unknown as { id: string; auth: unknown; inboxId: string }

const fakeContactInbox = {
  id: "ci-1",
  contactId: "contact-1",
  inboxId: "inbox-1",
  sourceId: "psid-123",
  channel: "messenger",
  source: "messenger",
} as unknown as import("@chatbotx.io/database/types").ContactInboxModel

const fakeConversation = {
  id: "conv-1",
  workspaceId: "ws-1",
  contactId: "contact-1",
} as unknown as import("@chatbotx.io/database/types").ConversationModel

const baseIncomingMessage = {
  sourceId: "msg-src-1",
  messageType: "incoming" as const,
  text: "hello",
  contentType: "text" as const,
  contentAttributes: {},
  attachments: undefined,
}

const fakeCreatedMessage = {
  id: "msg-created",
  sourceId: "msg-src-1",
  conversationId: "conv-1",
  contactInboxId: "ci-1",
  workspaceId: "ws-1",
  messageType: "incoming",
  contentType: "text",
  senderType: "contact",
  text: "hello",
  contentAttributes: {},
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
}

const baseProps = {
  integrationType: "messenger",
  integrationIdentifier: "inbox-1",
  payload: {},
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("receiveMessage — message repository branch", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Setup: existing contact inbox → skip transaction contact creation
    mockFindContactInbox.mockResolvedValue(fakeContactInbox)
    mockFindOrFail.mockResolvedValue(fakeConversation)

    vi.mocked(
      integrationService.identifyInboxAndIntegrationAuthFromIdentifier,
    ).mockResolvedValue({
      inbox: fakeInbox,
      integrationRow: fakeIntegrationRow,
    } as never)

    mockBuildContext.mockResolvedValue({ workspaceId: "ws-1" })
    mockresolveTenantSettings.mockResolvedValue({})
    mockCreateMessageRepository.mockResolvedValue({
      createOrUpdate: mockCreateOrUpdate,
      createOrUpdateWithAttachments: mockCreateOrUpdateWithAttachments,
    })
    mockCreateOrUpdate.mockResolvedValue({
      message: fakeCreatedMessage,
      isNew: true,
    })
    mockCreateOrUpdateWithAttachments.mockResolvedValue({
      result: { ...fakeCreatedMessage, attachments: [] },
      isNew: true,
    })
    mockEmit.mockResolvedValue(undefined)
    mockBroadcast.mockReturnValue(undefined)
    mockIntegrationQueueAdd.mockResolvedValue(undefined)
  })

  test("calls repository.createOrUpdate() when message has no attachments", async () => {
    mockRunChannelHandler.mockResolvedValue({
      message: { ...baseIncomingMessage, attachments: [] },
      contact: { sourceId: "psid-123", firstName: "Test" },
      postbackAction: null,
      quickReplyAction: null,
      ref: null,
    })

    await receiveMessage(baseProps)

    expect(mockCreateOrUpdate).toHaveBeenCalledTimes(1)
    expect(mockCreateOrUpdateWithAttachments).not.toHaveBeenCalled()
  })

  test("calls repository.createOrUpdateWithAttachments() when message has attachments", async () => {
    mockRunChannelHandler.mockResolvedValue({
      message: {
        ...baseIncomingMessage,
        attachments: [
          {
            fileType: "image/jpeg",
            fileName: "img.jpg",
            originPath: "uploads/img.jpg",
            fileSize: 10_000,
            sourceUrl: "https://example.com/img.jpg",
          },
        ],
      },
      contact: { sourceId: "psid-123", firstName: "Test" },
      postbackAction: null,
      quickReplyAction: null,
      ref: null,
    })

    await receiveMessage(baseProps)

    expect(mockCreateOrUpdateWithAttachments).toHaveBeenCalledTimes(1)
    expect(mockCreateOrUpdate).not.toHaveBeenCalled()
  })

  test("updates contact inbox and conversation activity timestamps when incoming message is new", async () => {
    mockRunChannelHandler.mockResolvedValue({
      message: { ...baseIncomingMessage, attachments: [] },
      contact: { sourceId: "psid-123", firstName: "Test" },
      postbackAction: null,
      quickReplyAction: null,
      ref: null,
    })
    mockCreateOrUpdate.mockResolvedValue({
      message: fakeCreatedMessage,
      isNew: true,
    })

    await receiveMessage(baseProps)

    expect(mockDbSet).toHaveBeenCalledWith({
      lastMessageAt: fakeCreatedMessage.createdAt,
      lastIncomingMessageAt: fakeCreatedMessage.createdAt,
    })
    expect(mockDbSet).toHaveBeenCalledWith({
      lastActivityAt: fakeCreatedMessage.createdAt,
    })
  })

  test("updates conversation activity but not lastIncomingMessageAt for outgoing webhook echo", async () => {
    mockRunChannelHandler.mockResolvedValue({
      message: {
        ...baseIncomingMessage,
        messageType: "outgoing",
        attachments: [],
      },
      contact: { sourceId: "psid-123", firstName: "Test" },
      postbackAction: null,
      quickReplyAction: null,
      ref: null,
    })
    mockCreateOrUpdate.mockResolvedValue({
      message: { ...fakeCreatedMessage, messageType: "outgoing" },
      isNew: true,
    })

    await receiveMessage(baseProps)

    expect(mockDbSet).toHaveBeenCalledWith({
      lastMessageAt: fakeCreatedMessage.createdAt,
    })
    expect(mockDbSet).toHaveBeenCalledWith({
      lastActivityAt: fakeCreatedMessage.createdAt,
    })
    expect(mockDbSet).not.toHaveBeenCalledWith(
      expect.objectContaining({
        lastIncomingMessageAt: expect.any(Date),
      }),
    )
  })

  test("does NOT update lastMessageAt when isNew=false", async () => {
    mockRunChannelHandler.mockResolvedValue({
      message: { ...baseIncomingMessage, attachments: [] },
      contact: { sourceId: "psid-123", firstName: "Test" },
      postbackAction: null,
      quickReplyAction: null,
      ref: null,
    })
    mockCreateOrUpdate.mockResolvedValue({
      message: fakeCreatedMessage,
      isNew: false,
    })

    await receiveMessage(baseProps)

    expect(mockDbUpdate).not.toHaveBeenCalled()
  })

  test("does NOT call createMessageRepository when message is null", async () => {
    mockRunChannelHandler.mockResolvedValue({
      message: null,
      contact: { sourceId: "psid-123", firstName: "Test" },
      postbackAction: null,
      quickReplyAction: null,
      ref: null,
    })

    const result = await receiveMessage(baseProps)

    expect(mockCreateMessageRepository).not.toHaveBeenCalled()
    expect(result.message).toBeNull()
  })

  test("throws for unsupported integration type", async () => {
    await expect(
      receiveMessage({
        ...baseProps,
        integrationType: "unknown_channel" as never,
      }),
    ).rejects.toThrow("Unsupported integration")
  })
})
