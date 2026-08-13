import { UnrecoverableError } from "bullmq"
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
  mockContactUnblockIfBlocked,
  mockConversationFindOrCreate,
  mockAutomatedResponseEnqueueFlowAction,
  mockIntegrationQueueAdd,
  mockDbSet,
  mockDbTransaction,
  mockDbCount,
  mockCreateNewContactWithMac,
  mockWorkspaceFind,
  mockQuotaIncrement,
  mockContactUpdate,
  mockUpdateTracking,
  mockInvalidateTracking,
  mockWorkspaceIsActiveNow,
  mockAppointmentCancelByToken,
  mockParseAppointmentCancelPostback,
  mockVerifyAppointmentCancelPostback,
  mockChatQueueAdd,
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
  const mockDbCount = vi.fn().mockResolvedValue(1)

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
    mockresolveTenantSettings: vi
      .fn()
      .mockResolvedValue({ storageUrl: "https://files.example.test" }),
    mockUpdateContactFromMessage: vi.fn().mockResolvedValue(undefined),
    mockContactUnblockIfBlocked: vi.fn().mockResolvedValue(null),
    mockContactUpdate: vi.fn().mockResolvedValue({}),
    mockConversationFindOrCreate: vi.fn(),
    mockAutomatedResponseEnqueueFlowAction: vi
      .fn()
      .mockResolvedValue(undefined),
    mockIntegrationQueueAdd: vi.fn().mockResolvedValue(undefined),
    mockDbSet,
    mockDbTransaction,
    mockDbCount,
    mockCreateNewContactWithMac: vi.fn(),
    mockWorkspaceFind: vi.fn().mockResolvedValue(null),
    mockWorkspaceIsActiveNow: vi.fn().mockReturnValue(true),
    mockQuotaIncrement: vi.fn().mockResolvedValue(undefined),
    mockUpdateTracking: vi
      .fn()
      .mockResolvedValue({ cacheTags: ["contacts:contact-1:contact-inboxes"] }),
    mockInvalidateTracking: vi.fn().mockResolvedValue(undefined),
    mockAppointmentCancelByToken: vi.fn().mockResolvedValue({
      cancellable: true,
    }),
    mockParseAppointmentCancelPostback: vi.fn().mockReturnValue(null),
    mockVerifyAppointmentCancelPostback: vi.fn(),
    mockChatQueueAdd: vi.fn().mockResolvedValue(undefined),
  }
})

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: mockCreateMessageRepository,
}))

vi.mock("@chatbotx.io/automated-response", () => ({
  automatedResponseService: {
    enqueueFlowAction: mockAutomatedResponseEnqueueFlowAction,
  },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    update: mockDbUpdate,
    query: {
      contactInboxModel: { findFirst: mockFindContactInbox },
    },
    $count: mockDbCount,
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
  conversationModel: {
    id: "id",
    lastActivityAt: "lastActivityAt",
    sourceId: "sourceId",
    workspaceId: "workspaceId",
  },
}))

vi.mock("@chatbotx.io/business", () => ({
  appointmentService: {
    cancelAppointmentByToken: mockAppointmentCancelByToken,
  },
  broadcastToWorkspaceParty: mockBroadcast,
  buildContext: mockBuildContext,
  resolveTenantSettings: mockresolveTenantSettings,
  updateContactFromMessage: mockUpdateContactFromMessage,
  contactInboxService: {
    updateTracking: mockUpdateTracking,
    invalidateTracking: mockInvalidateTracking,
  },
  contactService: {
    unblockIfBlocked: mockContactUnblockIfBlocked,
    update: mockContactUpdate,
  },
  conversationService: { findOrCreate: mockConversationFindOrCreate },
  workspaceService: {
    find: mockWorkspaceFind,
    findById: vi.fn().mockResolvedValue({
      isActive: true,
      startTime: null,
      endTime: null,
      timezone: "UTC",
    }),
    isActiveNow: mockWorkspaceIsActiveNow,
  },
  quotaEnforcementService: {
    increment: mockQuotaIncrement,
    createNewContactWithMac: mockCreateNewContactWithMac,
  },
  userQuotaService: {
    isLimitReached: vi.fn().mockResolvedValue(false),
    increment: vi.fn().mockResolvedValue(undefined),
  },
  messageCleanupService: {
    cancelByInboxSource: vi.fn().mockResolvedValue(undefined),
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
  contentTypes: { enum: { text: "text", location: "location" } },
  messageTypes: { enum: { incoming: "incoming", outgoing: "outgoing" } },
  SdkException: class SdkException extends Error {},
  getStoryReply: (contentAttributes: unknown) => {
    if (!contentAttributes || typeof contentAttributes !== "object") {
      return
    }
    const attrs = contentAttributes as {
      type?: string
      story?: { id: string; url?: string }
      storyReply?: { id: string; url?: string }
    }
    return attrs.type === "story_reply" ? attrs.story : attrs.storyReply
  },
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

vi.mock("@chatbotx.io/encryption", () => ({
  parseAppointmentCancelPostback: mockParseAppointmentCancelPostback,
  verifyAppointmentCancelPostback: mockVerifyAppointmentCancelPostback,
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  ChatJobAction: {
    sendChatMessage: "sendChatMessage",
  },
  chatQueue: {
    add: mockChatQueueAdd,
  },
  IntegrationJobAction: {
    runFlowPostback: "runFlowPostback",
    runFlowQuickReply: "runFlowQuickReply",
    runRef: "runRef",
  },
  integrationQueue: {
    add: mockIntegrationQueueAdd,
    getJob: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

vi.mock("../src/services/integrations", () => ({
  allIntegrations: {
    messenger: {
      runChannelHandler: mockRunChannelHandler,
      // Messenger comment path fetches the comment attachment; no attachment here.
      runAction: vi.fn().mockResolvedValue(undefined),
    },
    telegram: {
      runChannelHandler: mockRunChannelHandler,
    },
    whatsapp: {
      runChannelHandler: mockRunChannelHandler,
    },
    zalo: {
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

const { metaReferralToContactSource, receiveComment, receiveMessage } =
  await import("../src/integration/handlers/received-message")
const { encodeButtonPayload } = await import("@chatbotx.io/flow-config")
const { logger } = await import("../src/lib/logger")
const { allIntegrations, integrationService } = await import(
  "../src/services/integrations"
)

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

const fakeContact = {
  id: "contact-1",
  workspaceId: "ws-1",
  blockedAt: new Date("2026-01-01T00:00:00Z"),
} as unknown as import("@chatbotx.io/database/types").ContactModel

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

type CreateNewContactWithMacArgs = {
  create: (tx: {
    insert: (model: unknown) => {
      values: (row: Record<string, unknown>) => {
        returning: () => Promise<Record<string, unknown>[]>
      }
    }
  }) => Promise<unknown>
}

const runCapturedNewContactCreate = async () => {
  const rows: Record<string, unknown>[] = []
  const args = mockCreateNewContactWithMac.mock.calls.at(-1)?.[0] as
    | CreateNewContactWithMacArgs
    | undefined
  if (!args) {
    throw new Error("Expected createNewContactWithMac to be called")
  }

  await args.create({
    insert: () => ({
      values: (row) => {
        rows.push(row)
        return {
          returning: () =>
            Promise.resolve([
              {
                id:
                  "source" in row
                    ? "ci-from-callback"
                    : "contact-from-callback",
                contactId: "contact-from-callback",
                createdAt: new Date("2026-06-21T00:00:00Z"),
                workspaceId: "ws-1",
                ...row,
              },
            ]),
        }
      },
    }),
  })

  return rows
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("receiveMessage — message repository branch", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Setup: existing contact inbox → skip transaction contact creation
    mockFindContactInbox.mockResolvedValue({
      ...fakeContactInbox,
      contact: fakeContact,
    })
    mockFindOrFail.mockResolvedValue(fakeConversation)
    mockConversationFindOrCreate.mockResolvedValue(fakeConversation)

    vi.mocked(
      integrationService.identifyInboxAndIntegrationAuthFromIdentifier,
    ).mockResolvedValue({
      inbox: fakeInbox,
      integrationRow: fakeIntegrationRow,
    } as never)

    mockBuildContext.mockResolvedValue({ workspaceId: "ws-1" })
    mockresolveTenantSettings.mockResolvedValue({
      storageUrl: "https://files.example.test",
    })
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
    mockChatQueueAdd.mockResolvedValue(undefined)
    mockAppointmentCancelByToken.mockResolvedValue({ cancellable: true })
    mockParseAppointmentCancelPostback.mockReturnValue(null)
    mockVerifyAppointmentCancelPostback.mockResolvedValue({
      workspaceId: "ws-1",
      appointmentId: "appointment-1",
      contactId: "contact-1",
      contactInboxId: "ci-1",
    })
    mockWorkspaceIsActiveNow.mockReturnValue(true)
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

  test("auto-unblocks on inbound messages using the loaded contact", async () => {
    mockRunChannelHandler.mockResolvedValue({
      message: { ...baseIncomingMessage, attachments: [] },
      contact: { sourceId: "psid-123", firstName: "Test" },
      postbackAction: null,
      quickReplyAction: null,
      ref: null,
    })

    await receiveMessage(baseProps)

    expect(mockContactUnblockIfBlocked).toHaveBeenCalledWith(
      { workspaceId: "ws-1", id: "contact-1" },
      fakeContact,
    )
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

    expect(mockUpdateTracking).toHaveBeenCalledWith({
      tx: expect.any(Object),
      contactInboxId: "ci-1",
      contactId: "contact-1",
      workspaceId: "ws-1",
      data: {
        firstInteractionAt: fakeCreatedMessage.createdAt,
        lastMessageAt: fakeCreatedMessage.createdAt,
        lastIncomingMessageAt: fakeCreatedMessage.createdAt,
        lastUserInput: "hello",
        lastUserInputType: "text",
      },
    })
    expect(mockDbSet).toHaveBeenCalledWith({
      lastActivityAt: fakeCreatedMessage.createdAt,
    })
  })

  test("emits message:received with origin: 'inbound' and isFirstIncomingMessage: true for a contact's first inbound message", async () => {
    mockFindContactInbox.mockResolvedValue({
      ...fakeContactInbox,
      lastIncomingMessageAt: null,
      contact: fakeContact,
    })
    mockRunChannelHandler.mockResolvedValue({
      message: { ...baseIncomingMessage, attachments: [] },
      contact: { sourceId: "psid-123", firstName: "Test" },
      postbackAction: null,
      quickReplyAction: null,
      ref: null,
    })

    await receiveMessage(baseProps)

    expect(mockEmit).toHaveBeenCalledWith(
      "message:received",
      expect.objectContaining({
        workspaceId: "ws-1",
        contactId: "contact-1",
        contactInboxId: "ci-1",
        channel: "messenger",
        inboxId: "inbox-1",
        origin: "inbound",
        messageId: fakeCreatedMessage.id,
        isFirstIncomingMessage: true,
      }),
    )
  })

  test("emits isFirstIncomingMessage: false when the contact already has a prior inbound message", async () => {
    mockFindContactInbox.mockResolvedValue({
      ...fakeContactInbox,
      lastIncomingMessageAt: new Date("2025-12-31T00:00:00Z"),
      contact: fakeContact,
    })
    mockRunChannelHandler.mockResolvedValue({
      message: { ...baseIncomingMessage, attachments: [] },
      contact: { sourceId: "psid-123", firstName: "Test" },
      postbackAction: null,
      quickReplyAction: null,
      ref: null,
    })

    await receiveMessage(baseProps)

    expect(mockEmit).toHaveBeenCalledWith(
      "message:received",
      expect.objectContaining({
        origin: "inbound",
        isFirstIncomingMessage: false,
      }),
    )
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

    expect(mockContactUnblockIfBlocked).not.toHaveBeenCalled()
    expect(mockUpdateTracking).toHaveBeenCalledWith({
      tx: expect.any(Object),
      contactInboxId: "ci-1",
      contactId: "contact-1",
      workspaceId: "ws-1",
      data: {
        firstInteractionAt: fakeCreatedMessage.createdAt,
        lastMessageAt: fakeCreatedMessage.createdAt,
      },
    })
    expect(mockDbSet).toHaveBeenCalledWith({
      lastActivityAt: fakeCreatedMessage.createdAt,
    })
    expect(mockUpdateTracking).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastIncomingMessageAt: expect.any(Date),
        }),
      }),
    )
    // An outgoing webhook echo (e.g. an agent's native-app reply synced back
    // in) is not a genuine contact-authored message, so it must not carry the
    // `origin: "inbound"` discriminant the ads-conversion contactReplied
    // listener keys off of.
    expect(mockEmit).toHaveBeenCalledWith(
      "message:received",
      expect.not.objectContaining({ origin: "inbound" }),
    )
  })

  test("does not flip an outgoing story-reply echo for an already-known contact", async () => {
    // Only a brand-new contact's outgoing story reply is corrected (see the
    // "flips an outgoing story-reply echo..." test in the new-contact
    // describe block). An agent genuinely replying to an existing contact's
    // story via the native Instagram app must stay outgoing — flipping it
    // would make story-reply automation auto-reply to the agent's own
    // message.
    mockRunChannelHandler.mockResolvedValue({
      message: {
        ...baseIncomingMessage,
        messageType: "outgoing",
        contentAttributes: {
          type: "story_reply",
          story: { id: "story-1", url: "https://example.com/story-1" },
        },
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

    expect(mockCreateOrUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        messageType: "outgoing",
        senderType: "user",
        senderId: null,
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
    expect(mockUpdateTracking).not.toHaveBeenCalled()
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

  test("drops garbage postback action and returns it as null", async () => {
    mockRunChannelHandler.mockResolvedValue({
      message: { ...baseIncomingMessage, attachments: [] },
      contact: { sourceId: "psid-123", firstName: "Test" },
      postbackAction: "foreign-postback",
      quickReplyAction: null,
      ref: null,
    })

    const result = await receiveMessage(baseProps)

    expect(result.postbackAction).toBeNull()
    expect(mockIntegrationQueueAdd).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledWith(
      {
        kind: "postback",
        integrationType: "messenger",
        integrationIdentifier: "inbox-1",
        action: "foreign-postback",
      },
      "Dropping undecodable flow action from channel webhook",
    )
  })

  test("keeps valid postback action and enqueues the postback flow job", async () => {
    const postbackAction = encodeButtonPayload({ flowId: "42" })
    mockRunChannelHandler.mockResolvedValue({
      message: { ...baseIncomingMessage, attachments: [] },
      contact: { sourceId: "psid-123", firstName: "Test" },
      postbackAction,
      quickReplyAction: null,
      ref: null,
    })

    const result = await receiveMessage(baseProps)

    expect(result.postbackAction).toBe(postbackAction)
    expect(mockAutomatedResponseEnqueueFlowAction).toHaveBeenCalledWith({
      kind: "postback",
      data: expect.objectContaining({ action: postbackAction }),
    })
  })

  test("sends Vietnamese feedback instead of going silent when an appointment cancel token is invalid", async () => {
    mockParseAppointmentCancelPostback.mockReturnValue("cancel-token")
    mockVerifyAppointmentCancelPostback.mockRejectedValue(
      new Error("token expired"),
    )
    mockRunChannelHandler.mockResolvedValue({
      message: { ...baseIncomingMessage, attachments: [] },
      contact: { sourceId: "psid-123", firstName: "Test", language: "vi" },
      postbackAction: "cancel-token",
      quickReplyAction: null,
      ref: null,
    })

    await receiveMessage(baseProps)

    expect(mockAppointmentCancelByToken).not.toHaveBeenCalled()
    expect(mockChatQueueAdd).toHaveBeenCalledWith("sendChatMessage", {
      type: "sendChatMessage",
      data: expect.objectContaining({
        conversation: expect.objectContaining({ id: fakeConversation.id }),
        contactInbox: expect.objectContaining({ id: fakeContactInbox.id }),
        text: "Liên kết hủy lịch đã hết hạn hoặc không còn khả dụng.",
      }),
    })
  })

  test("sends English feedback for appointment cancel postbacks when the workspace is inactive", async () => {
    mockParseAppointmentCancelPostback.mockReturnValue("cancel-token")
    mockWorkspaceIsActiveNow.mockReturnValue(false)
    mockRunChannelHandler.mockResolvedValue({
      message: { ...baseIncomingMessage, attachments: [] },
      contact: { sourceId: "psid-123", firstName: "Test", language: "en" },
      postbackAction: "cancel-token",
      quickReplyAction: null,
      ref: null,
    })

    await receiveMessage(baseProps)

    expect(mockAppointmentCancelByToken).not.toHaveBeenCalled()
    expect(mockChatQueueAdd).toHaveBeenCalledWith("sendChatMessage", {
      type: "sendChatMessage",
      data: expect.objectContaining({
        conversation: expect.objectContaining({ id: fakeConversation.id }),
        contactInbox: expect.objectContaining({ id: fakeContactInbox.id }),
        text: "This appointment cannot be cancelled because the workspace is currently inactive.",
      }),
    })
  })

  test("falls back to English feedback when an appointment cancel token is valid but no longer cancellable", async () => {
    mockParseAppointmentCancelPostback.mockReturnValue("cancel-token")
    mockAppointmentCancelByToken.mockResolvedValue({ cancellable: false })
    mockRunChannelHandler.mockResolvedValue({
      message: { ...baseIncomingMessage, attachments: [] },
      contact: { sourceId: "psid-123", firstName: "Test", language: "xx" },
      postbackAction: "cancel-token",
      quickReplyAction: null,
      ref: null,
    })

    await receiveMessage(baseProps)

    expect(mockAppointmentCancelByToken).toHaveBeenCalled()
    expect(mockChatQueueAdd).toHaveBeenCalledWith("sendChatMessage", {
      type: "sendChatMessage",
      data: expect.objectContaining({
        conversation: expect.objectContaining({ id: fakeConversation.id }),
        contactInbox: expect.objectContaining({ id: fakeContactInbox.id }),
        text: "This cancellation link has expired or is no longer available.",
      }),
    })
  })

  test("drops garbage quick reply action and returns it as null", async () => {
    mockRunChannelHandler.mockResolvedValue({
      message: { ...baseIncomingMessage, attachments: [] },
      contact: { sourceId: "psid-123", firstName: "Test" },
      postbackAction: null,
      quickReplyAction: "foreign-quick-reply",
      ref: null,
    })

    const result = await receiveMessage(baseProps)

    expect(result.quickReplyAction).toBeNull()
    expect(mockIntegrationQueueAdd).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledWith(
      {
        kind: "quickReply",
        integrationType: "messenger",
        integrationIdentifier: "inbox-1",
        action: "foreign-quick-reply",
      },
      "Dropping undecodable flow action from channel webhook",
    )
  })

  test("keeps valid quick reply action and enqueues the quick reply flow job", async () => {
    const quickReplyAction = encodeButtonPayload({ flowId: "42" })
    mockRunChannelHandler.mockResolvedValue({
      message: { ...baseIncomingMessage, attachments: [] },
      contact: { sourceId: "psid-123", firstName: "Test" },
      postbackAction: null,
      quickReplyAction,
      ref: null,
    })

    const result = await receiveMessage(baseProps)

    expect(result.quickReplyAction).toBe(quickReplyAction)
    expect(mockAutomatedResponseEnqueueFlowAction).toHaveBeenCalledWith({
      kind: "quickReply",
      data: expect.objectContaining({ action: quickReplyAction }),
    })
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

describe("receiveMessage — new contact MAC gate", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // No existing contact inbox → new-contact creation path.
    mockFindContactInbox.mockResolvedValue(undefined)
    mockFindOrFail.mockResolvedValue(fakeConversation)
    mockConversationFindOrCreate.mockResolvedValue(fakeConversation)
    mockWorkspaceFind.mockResolvedValue({ ownerId: "owner-1" })
    vi.mocked(
      integrationService.identifyInboxAndIntegrationAuthFromIdentifier,
    ).mockResolvedValue({
      inbox: fakeInbox,
      integrationRow: fakeIntegrationRow,
    } as never)
    mockBuildContext.mockResolvedValue({ workspaceId: "ws-1" })
    mockresolveTenantSettings.mockResolvedValue({
      storageUrl: "https://files.example.test",
    })
    mockRunChannelHandler.mockResolvedValue({
      message: { ...baseIncomingMessage, attachments: [] },
      contact: { sourceId: "psid-123", firstName: "Test" },
      postbackAction: null,
      quickReplyAction: null,
      ref: null,
    })
    mockCreateMessageRepository.mockResolvedValue({
      createOrUpdate: mockCreateOrUpdate,
      createOrUpdateWithAttachments: mockCreateOrUpdateWithAttachments,
    })
    mockCreateOrUpdate.mockResolvedValue({
      message: fakeCreatedMessage,
      isNew: true,
    })
  })

  test("rejects with a non-retryable error and creates no message when the MAC limit is reached", async () => {
    mockCreateNewContactWithMac.mockResolvedValue({ ok: false, level: "user" })

    // Must be UnrecoverableError so BullMQ fails the job once without retrying —
    // a deterministic billing cap must never dead-letter (drop) the inbound message.
    await expect(receiveMessage(baseProps)).rejects.toBeInstanceOf(
      UnrecoverableError,
    )
    expect(mockCreateMessageRepository).not.toHaveBeenCalled()
    expect(mockQuotaIncrement).not.toHaveBeenCalled()
  })

  test("creates the contact via the atomic helper (which records contacts itself)", async () => {
    const newContact = {
      id: "contact-new",
      workspaceId: "ws-1",
      firstName: "Test",
      phoneNumber: null,
      email: null,
      blockedAt: null,
      createdAt: new Date("2026-06-21T00:00:00Z"),
    }
    const contactInbox = {
      ...fakeContactInbox,
      id: "ci-new",
      contactId: "contact-new",
    }
    mockCreateNewContactWithMac.mockResolvedValue({
      ok: true,
      value: { newContact, contactInbox, conversation: fakeConversation },
    })

    await receiveMessage(baseProps)

    expect(mockContactUnblockIfBlocked).toHaveBeenCalledWith(
      { workspaceId: "ws-1", id: "contact-new" },
      newContact,
    )
    expect(mockCreateNewContactWithMac).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: "owner-1", workspaceId: "ws-1" }),
    )
    // `contacts` is recorded inside createNewContactWithMac now, so the handler
    // must not increment it separately (avoids double-counting).
    expect(mockQuotaIncrement).not.toHaveBeenCalled()
  })

  test("still fetches getProfile for an outgoing webhook echo when creating a new contact", async () => {
    // A page-initiated echo (e.g. an agent replying to a story mention
    // directly on Instagram) can be the FIRST time we see that contact.
    // Skipping getProfile here would leave the contact without a name/avatar
    // forever, since later inbound messages reuse the existing contactInbox
    // and never re-fetch the profile.
    mockRunChannelHandler.mockImplementation(
      (_domain: string, action: string) => {
        if (action === "getProfile") {
          return Promise.resolve({
            firstName: "Story Replier",
            avatar: "https://example.com/avatar.jpg",
          })
        }
        return Promise.resolve({
          message: {
            ...baseIncomingMessage,
            messageType: "outgoing",
            attachments: [],
          },
          contact: { sourceId: "psid-123" },
          postbackAction: null,
          quickReplyAction: null,
          ref: null,
        })
      },
    )
    mockCreateNewContactWithMac.mockResolvedValue({
      ok: true,
      value: {
        newContact: {
          id: "contact-new",
          workspaceId: "ws-1",
          firstName: "Story Replier",
          phoneNumber: null,
          email: null,
          blockedAt: null,
          createdAt: new Date("2026-06-21T00:00:00Z"),
        },
        contactInbox: {
          ...fakeContactInbox,
          id: "ci-new",
          contactId: "contact-new",
        },
        conversation: fakeConversation,
      },
    })

    await receiveMessage(baseProps)

    expect(mockRunChannelHandler).toHaveBeenCalledWith(
      "contact",
      "getProfile",
      expect.objectContaining({ data: { sourceId: "psid-123" } }),
    )
    const rows = await runCapturedNewContactCreate()
    expect(rows).toContainEqual(
      expect.objectContaining({
        firstName: "Story Replier",
        avatar: "https://example.com/avatar.jpg",
      }),
    )
  })

  test("flips an outgoing story-reply echo to incoming when it creates a brand-new contact", async () => {
    // Meta has been observed sending a real customer's first-ever story
    // reply as an is_echo:true message with sender.id === the page's own
    // id. A page can't have proactively DM'd a contact it never talked to,
    // so this combination (new contact + outgoing + storyReply) must be
    // corrected to incoming — otherwise story-reply automation never fires
    // (see apps/worker/src/integration/worker.ts's `isFromContact` gate).
    mockRunChannelHandler.mockResolvedValue({
      message: {
        ...baseIncomingMessage,
        messageType: "outgoing",
        contentAttributes: {
          type: "story_reply",
          story: { id: "story-1", url: "https://example.com/story-1" },
        },
        attachments: [],
      },
      contact: { sourceId: "psid-123" },
      postbackAction: null,
      quickReplyAction: null,
      ref: null,
    })
    const contactInbox = {
      ...fakeContactInbox,
      id: "ci-new",
      contactId: "contact-new",
    }
    mockCreateNewContactWithMac.mockResolvedValue({
      ok: true,
      value: {
        newContact: {
          id: "contact-new",
          workspaceId: "ws-1",
          firstName: null,
          phoneNumber: null,
          email: null,
          blockedAt: null,
          createdAt: new Date("2026-06-21T00:00:00Z"),
        },
        contactInbox,
        conversation: fakeConversation,
      },
    })

    await receiveMessage(baseProps)

    expect(mockCreateOrUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        messageType: "incoming",
        senderType: "contact",
        senderId: "contact-new",
      }),
    )
  })

  test("creates the contact without profile data when getProfile rejects (e.g. consent error)", async () => {
    mockRunChannelHandler.mockImplementation(
      (_domain: string, action: string) => {
        if (action === "getProfile") {
          return Promise.reject(
            new Error("(#230) User consent is required to access user profile"),
          )
        }
        return Promise.resolve({
          message: { ...baseIncomingMessage, attachments: [] },
          contact: { sourceId: "psid-123" },
          postbackAction: null,
          quickReplyAction: null,
          ref: null,
        })
      },
    )
    mockCreateNewContactWithMac.mockResolvedValue({
      ok: true,
      value: {
        newContact: {
          id: "contact-new",
          workspaceId: "ws-1",
          firstName: null,
          phoneNumber: null,
          email: null,
          blockedAt: null,
          createdAt: new Date("2026-06-21T00:00:00Z"),
        },
        contactInbox: {
          ...fakeContactInbox,
          id: "ci-new",
          contactId: "contact-new",
        },
        conversation: fakeConversation,
      },
    })

    await expect(receiveMessage(baseProps)).resolves.toBeDefined()
    expect(mockCreateMessageRepository).toHaveBeenCalled()
  })

  test("writes inboundMessage as the source for plain inbound DMs", async () => {
    const newContact = {
      id: "contact-new",
      workspaceId: "ws-1",
      firstName: "Test",
      phoneNumber: null,
      email: null,
      blockedAt: null,
      createdAt: new Date("2026-06-21T00:00:00Z"),
    }
    mockCreateNewContactWithMac.mockResolvedValue({
      ok: true,
      value: {
        newContact,
        contactInbox: {
          ...fakeContactInbox,
          id: "ci-new",
          contactId: "contact-new",
        },
        conversation: fakeConversation,
      },
    })

    await receiveMessage(baseProps)

    const rows = await runCapturedNewContactCreate()
    expect(rows).toContainEqual(
      expect.objectContaining({ source: "inboundMessage" }),
    )
  })

  test("writes mapped Meta referral source for inbound DMs with referral", async () => {
    const newContact = {
      id: "contact-new",
      workspaceId: "ws-1",
      firstName: "Test",
      phoneNumber: null,
      email: null,
      blockedAt: null,
      createdAt: new Date("2026-06-21T00:00:00Z"),
    }
    mockRunChannelHandler.mockResolvedValue({
      message: { ...baseIncomingMessage, attachments: [] },
      contact: { sourceId: "psid-123", firstName: "Test" },
      postbackAction: null,
      quickReplyAction: null,
      ref: "m.me-link",
      referralSource: "SHORTLINK",
    })
    mockCreateNewContactWithMac.mockResolvedValue({
      ok: true,
      value: {
        newContact,
        contactInbox: {
          ...fakeContactInbox,
          id: "ci-new",
          contactId: "contact-new",
        },
        conversation: fakeConversation,
      },
    })

    await receiveMessage(baseProps)

    const rows = await runCapturedNewContactCreate()
    expect(rows).toContainEqual(expect.objectContaining({ source: "botLink" }))
  })

  test("derives WhatsApp locale, timezone, and language from the wa_id phone country", async () => {
    vi.mocked(
      integrationService.identifyInboxAndIntegrationAuthFromIdentifier,
    ).mockResolvedValue({
      inbox: { ...fakeInbox, channel: "whatsapp" },
      integrationRow: fakeIntegrationRow,
    } as never)
    mockRunChannelHandler.mockResolvedValue({
      message: { ...baseIncomingMessage, attachments: [] },
      contact: { sourceId: "84901234567", firstName: "Test" },
      postbackAction: null,
      quickReplyAction: null,
      ref: null,
    })
    mockCreateNewContactWithMac.mockResolvedValue({
      ok: true,
      value: {
        newContact: {
          ...fakeContact,
          id: "contact-new",
          blockedAt: null,
          createdAt: new Date("2026-06-21T00:00:00Z"),
        },
        contactInbox: {
          ...fakeContactInbox,
          id: "ci-new",
          contactId: "contact-new",
          channel: "whatsapp",
        },
        conversation: fakeConversation,
      },
    })

    await receiveMessage({ ...baseProps, integrationType: "whatsapp" })

    const rows = await runCapturedNewContactCreate()
    expect(rows).toContainEqual(
      expect.objectContaining({
        locale: "vi_VN",
        timezone: "Asia/Ho_Chi_Minh",
      }),
    )
    expect(rows).toContainEqual(expect.objectContaining({ language: "vi" }))
  })

  test("writes Telegram language_code to ContactInbox.language without region", async () => {
    vi.mocked(
      integrationService.identifyInboxAndIntegrationAuthFromIdentifier,
    ).mockResolvedValue({
      inbox: { ...fakeInbox, channel: "telegram" },
      integrationRow: fakeIntegrationRow,
    } as never)
    mockRunChannelHandler.mockImplementation(
      (_domain: string, action: string) => {
        if (action === "getProfile") {
          return Promise.resolve({ sourceId: "tg-1", locale: "zh-CN" })
        }
        return Promise.resolve({
          message: { ...baseIncomingMessage, attachments: [] },
          contact: { sourceId: "tg-1", locale: "zh-CN" },
          postbackAction: null,
          quickReplyAction: null,
          ref: null,
        })
      },
    )
    mockCreateNewContactWithMac.mockResolvedValue({
      ok: true,
      value: {
        newContact: {
          ...fakeContact,
          id: "contact-new",
          blockedAt: null,
          createdAt: new Date("2026-06-21T00:00:00Z"),
        },
        contactInbox: {
          ...fakeContactInbox,
          id: "ci-new",
          contactId: "contact-new",
          channel: "telegram",
        },
        conversation: fakeConversation,
      },
    })

    await receiveMessage({ ...baseProps, integrationType: "telegram" })

    const rows = await runCapturedNewContactCreate()
    expect(rows).toContainEqual(expect.objectContaining({ locale: "zh_CN" }))
    expect(rows).toContainEqual(expect.objectContaining({ language: "zh" }))
  })

  test("keeps provided channel profile values while deriving only missing language", async () => {
    mockRunChannelHandler.mockImplementation(
      (_domain: string, action: string) => {
        if (action === "getProfile") {
          return Promise.resolve({
            sourceId: "psid-123",
            locale: "ja-JP",
            timezone: "Asia/Tokyo",
          })
        }
        return Promise.resolve({
          message: { ...baseIncomingMessage, attachments: [] },
          contact: { sourceId: "psid-123", locale: "en-US" },
          postbackAction: null,
          quickReplyAction: null,
          ref: null,
        })
      },
    )
    mockCreateNewContactWithMac.mockResolvedValue({
      ok: true,
      value: {
        newContact: {
          ...fakeContact,
          id: "contact-new",
          blockedAt: null,
          createdAt: new Date("2026-06-21T00:00:00Z"),
        },
        contactInbox: {
          ...fakeContactInbox,
          id: "ci-new",
          contactId: "contact-new",
        },
        conversation: fakeConversation,
      },
    })

    await receiveMessage(baseProps)

    const rows = await runCapturedNewContactCreate()
    expect(rows).toContainEqual(
      expect.objectContaining({
        locale: "ja_JP",
        timezone: "Asia/Tokyo",
      }),
    )
    expect(rows).toContainEqual(expect.objectContaining({ language: "ja" }))
  })

  test("persists inbound payload tracking in the same activity update", async () => {
    mockRunChannelHandler.mockResolvedValue({
      message: {
        ...baseIncomingMessage,
        attachments: [],
        contentType: "location",
        contentAttributes: { latitude: 10.75, longitude: 106.66 },
      },
      contact: { sourceId: "psid-123", firstName: "Test" },
      postbackAction: null,
      quickReplyAction: null,
      ref: "launch",
      referralSource: "ADS",
      referral: {
        ref: "launch",
        adTitle: "Launch ad",
      },
      buttonTitle: "Choose plan",
    })
    mockCreateNewContactWithMac.mockResolvedValue({
      ok: true,
      value: {
        newContact: {
          ...fakeContact,
          id: "contact-new",
          blockedAt: null,
          createdAt: new Date("2026-06-21T00:00:00Z"),
        },
        contactInbox: {
          ...fakeContactInbox,
          id: "ci-new",
          contactId: "contact-new",
        },
        conversation: fakeConversation,
      },
    })

    await receiveMessage(baseProps)

    expect(mockUpdateTracking).toHaveBeenCalledTimes(1)
    expect(mockUpdateTracking).toHaveBeenCalledWith({
      tx: expect.any(Object),
      contactInboxId: "ci-new",
      contactId: "contact-new",
      workspaceId: "ws-1",
      data: {
        firstInteractionAt: fakeCreatedMessage.createdAt,
        lastMessageAt: fakeCreatedMessage.createdAt,
        lastIncomingMessageAt: fakeCreatedMessage.createdAt,
        lastUserInput: null,
        lastUserInputType: "location",
        referral: {
          ref: "launch",
          adTitle: "Launch ad",
        },
        lastBtnTitle: "Choose plan",
      },
    })
    expect(mockContactUpdate).toHaveBeenCalledWith(
      { workspaceId: "ws-1", id: "contact-new" },
      { location: { latitude: 10.75, longitude: 106.66 } },
      expect.any(Object),
    )
  })

  test("does not persist location from outgoing channel echoes", async () => {
    mockRunChannelHandler.mockResolvedValue({
      message: {
        ...baseIncomingMessage,
        messageType: "outgoing",
        attachments: [],
        contentType: "location",
        contentAttributes: { latitude: 10.75, longitude: 106.66 },
      },
      contact: { sourceId: "psid-123", firstName: "Test" },
      postbackAction: null,
      quickReplyAction: null,
      ref: null,
    })
    mockCreateNewContactWithMac.mockResolvedValue({
      ok: true,
      value: {
        newContact: {
          ...fakeContact,
          id: "contact-new",
          blockedAt: null,
          createdAt: new Date("2026-06-21T00:00:00Z"),
        },
        contactInbox: {
          ...fakeContactInbox,
          id: "ci-new",
          contactId: "contact-new",
        },
        conversation: fakeConversation,
      },
    })

    await receiveMessage(baseProps)

    expect(mockContactUpdate).not.toHaveBeenCalled()
  })
})

describe("contact source taxonomy", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindContactInbox.mockResolvedValue(undefined)
    mockFindOrFail.mockResolvedValue(fakeConversation)
    mockConversationFindOrCreate.mockResolvedValue(fakeConversation)
    mockWorkspaceFind.mockResolvedValue({ ownerId: "owner-1" })
    vi.mocked(
      integrationService.identifyInboxAndIntegrationAuthFromIdentifier,
    ).mockResolvedValue({
      inbox: fakeInbox,
      integrationRow: fakeIntegrationRow,
    } as never)
    mockBuildContext.mockResolvedValue({ workspaceId: "ws-1" })
    mockCreateMessageRepository.mockResolvedValue({
      createOrUpdate: mockCreateOrUpdate,
      createOrUpdateWithAttachments: mockCreateOrUpdateWithAttachments,
    })
    mockCreateOrUpdate.mockResolvedValue({
      message: fakeCreatedMessage,
      isNew: true,
    })
    mockCreateNewContactWithMac.mockResolvedValue({
      ok: true,
      value: {
        newContact: {
          ...fakeContact,
          id: "contact-new",
          blockedAt: null,
          createdAt: new Date("2026-06-21T00:00:00Z"),
        },
        contactInbox: {
          ...fakeContactInbox,
          id: "ci-new",
          contactId: "contact-new",
        },
        conversation: fakeConversation,
      },
    })
  })

  test("maps Meta referral source buckets", () => {
    expect(metaReferralToContactSource("ADS")).toBe("ads")
    expect(metaReferralToContactSource("SHORTLINK")).toBe("botLink")
    expect(metaReferralToContactSource("CUSTOMER_CHAT_PLUGIN")).toBe(
      "chatPlugin",
    )
    expect(metaReferralToContactSource("UNKNOWN")).toBeUndefined()
    expect(metaReferralToContactSource()).toBeUndefined()
  })

  test("writes comments as the source for feed comment contacts", async () => {
    await receiveComment({
      integrationType: "messenger",
      integrationIdentifier: "inbox-1",
      commentData: {
        commentId: "comment-1",
        fromId: "commenter-1",
        fromName: "Commenter",
        message: "hello",
        postId: "post-1",
      },
    })

    const rows = await runCapturedNewContactCreate()
    expect(rows).toContainEqual(expect.objectContaining({ source: "comments" }))
    expect(mockUpdateTracking).toHaveBeenCalledWith({
      tx: expect.any(Object),
      contactInboxId: "ci-new",
      contactId: "contact-new",
      workspaceId: "ws-1",
      data: {
        firstInteractionAt: fakeCreatedMessage.createdAt,
        lastMessageAt: fakeCreatedMessage.createdAt,
        lastCommentMessageId: fakeCreatedMessage.id,
        lastCommentMessageAt: fakeCreatedMessage.createdAt,
      },
    })
    expect(mockDbCount).not.toHaveBeenCalled()
    expect(
      vi
        .mocked(allIntegrations.messenger?.runAction)
        .mock.calls.some(([action]) => action === "getPostDetails"),
    ).toBe(false)
  })
})
