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
  mockSyncScopedIdentity,
  mockIsUniqueViolationError,
  mockDetectFlowVersion,
  mockContactProfileRefresh,
  mockRecordProfileRefreshFailure,
  mockResolveIntegrationContextFromContactInbox,
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
    // Pass-through by default: returns the matched contactInbox unchanged so
    // existing (pre-BSUID) tests keep their exact expected shape.
    mockSyncScopedIdentity: vi.fn(
      async ({ contactInbox }: { contactInbox: unknown }) => ({
        contactInbox,
        learnedPrimaryIdentity: undefined,
      }),
    ),
    mockIsUniqueViolationError: vi.fn().mockReturnValue(false),
    mockDetectFlowVersion: vi.fn(),
    // Default: a safe no-op result that never invokes `fetchProfile`, so
    // unrelated tests (most of which now have a nameless `fakeContact` and
    // therefore ARE eligible per `shouldRefreshContactProfile`) never
    // trigger a Graph call or touch `resolveIntegrationContextFromContactInbox`
    // unless a test explicitly overrides this mock to exercise the wiring.
    mockContactProfileRefresh: vi
      .fn()
      .mockResolvedValue({ status: "skipped", reason: "profileComplete" }),
    mockRecordProfileRefreshFailure: vi.fn().mockResolvedValue(undefined),
    mockResolveIntegrationContextFromContactInbox: vi.fn().mockResolvedValue({
      integration: { runChannelHandler: mockRunChannelHandler },
      ctx: { workspaceId: "ws-1" },
    }),
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
  isUniqueViolationError: mockIsUniqueViolationError,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  CONTACT_INBOX_SOURCE_ID_KEY: "ContactInbox_inboxId_sourceId_key",
  CONTACT_INBOX_SOURCE_USER_ID_KEY: "ContactInbox_inboxId_sourceUserId_key",
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

// Mirror of the real capability table
// (packages/business/src/contact/profile-refresh/rules.ts) — pure, so
// re-implemented here rather than partially importing the real (heavy)
// `@chatbotx.io/business` barrel, matching this file's existing convention
// for `@chatbotx.io/sdk`'s pure helpers above.
//
// Tried switching to `vi.mock("@chatbotx.io/business", async (importOriginal)
// => ...)` (as done in contact-profile-refresh.test.ts, which has no
// `@chatbotx.io/database/schema` mock to conflict with) — it breaks here: the
// real barrel's module graph reaches `ads-conversion/schema.ts`, which calls
// `createSelectSchema` from `@chatbotx.io/database/schema` at import time,
// and this file's `@chatbotx.io/database/schema` mock above is deliberately
// minimal (a handful of table shapes) and has no such export. Keeping the
// mirror here rather than widening that mock (and whatever else the real
// barrel transitively touches) to stay a small, scoped fix.
const CONTACT_PROFILE_NAME_CAPABILITIES: Record<
  string,
  { inbound: "payload" | "channelApi" | null; onDemand: boolean }
> = {
  messenger: { inbound: "channelApi", onDemand: true },
  instagram: { inbound: "channelApi", onDemand: true },
  zalo: { inbound: "channelApi", onDemand: true },
  telegram: { inbound: "channelApi", onDemand: true },
  whatsapp: { inbound: "payload", onDemand: false },
  tiktok: { inbound: null, onDemand: false },
  api: { inbound: "payload", onDemand: false },
  webchat: { inbound: null, onDemand: false },
  smtp: { inbound: null, onDemand: false },
  omnichannel: { inbound: null, onDemand: false },
}

vi.mock("@chatbotx.io/business", () => ({
  appointmentService: {
    cancelAppointmentByToken: mockAppointmentCancelByToken,
  },
  broadcastToWorkspaceParty: mockBroadcast,
  buildContext: mockBuildContext,
  resolveTenantSettings: mockresolveTenantSettings,
  updateContactFromMessage: mockUpdateContactFromMessage,
  hasOnDemandProfileApi: (channel: string) =>
    CONTACT_PROFILE_NAME_CAPABILITIES[channel]?.onDemand ?? false,
  resolveInboundProfileNameSource: (channel: string) =>
    CONTACT_PROFILE_NAME_CAPABILITIES[channel]?.inbound ?? null,
  hasEmptyProfileName: (contact: {
    firstName?: string | null
    lastName?: string | null
  }) => !(contact.firstName?.trim() || contact.lastName?.trim()),
  contactProfileRefreshService: { refresh: mockContactProfileRefresh },
  recordProfileRefreshFailure: mockRecordProfileRefreshFailure,
  contactInboxService: {
    updateTracking: mockUpdateTracking,
    invalidateTracking: mockInvalidateTracking,
    syncScopedIdentity: mockSyncScopedIdentity,
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
  // Mirror of the real pure helper — the module is fully mocked here.
  resolveWithSourceUserIdFallback: async <T>(
    identity: { sourceId: string; sourceUserId?: string | null },
    lookup: (
      where: { sourceId: string } | { sourceUserId: string },
    ) => Promise<T | undefined>,
  ): Promise<T | undefined> => {
    const bySourceId = await lookup({ sourceId: identity.sourceId })
    if (bySourceId || !identity.sourceUserId) {
      return bySourceId
    }
    return await lookup({ sourceUserId: identity.sourceUserId })
  },
  messageTypes: { enum: { incoming: "incoming", outgoing: "outgoing" } },
  SdkException: class SdkException extends Error {},
  // Mirror of the real pure predicate — the module is fully mocked, so the
  // actual one-liner is restated here.
  isSourceUserIdKeyedIdentity: (identity: {
    sourceId: string
    sourceUserId?: string | null
  }) =>
    Boolean(identity.sourceUserId) &&
    identity.sourceId === identity.sourceUserId,
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
  // `logProviderError` short-circuits on this, as `defaultQueue` does.
  isNoRedisEnv: () => true,
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

vi.mock("../src/lib/db", () => ({
  detectFlowVersion: mockDetectFlowVersion,
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
    instagram: {
      runChannelHandler: mockRunChannelHandler,
    },
    instagramFacebook: {
      runChannelHandler: mockRunChannelHandler,
    },
    tiktok: {
      runChannelHandler: mockRunChannelHandler,
    },
    webchat: {
      runChannelHandler: mockRunChannelHandler,
    },
    api: {
      runChannelHandler: mockRunChannelHandler,
    },
  },
  integrationService: {
    identifyInboxAndIntegrationAuthFromIdentifier: vi.fn(),
  },
  // Mirror of the real one-liner (apps/worker/src/services/integrations.ts).
  isInstagramViaFacebook: (row: { type?: string }) => row.type === "facebook",
  resolveIntegrationContextFromContactInbox:
    mockResolveIntegrationContextFromContactInbox,
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

  test("replaces a raw postback payload echo with the flow button label", async () => {
    const postbackAction = encodeButtonPayload({ flowId: "42", buttonId: "77" })
    mockDetectFlowVersion.mockResolvedValue({
      flowVersion: {
        id: "fv-1",
        nodes: [
          {
            id: "node-1",
            data: {
              details: {
                steps: [
                  {
                    buttons: [
                      {
                        id: "77",
                        label: "Xem sản phẩm",
                        buttonType: "nextStep",
                        beforeStep: null,
                        steps: [],
                      },
                    ],
                  },
                ],
              },
            },
          },
        ],
      },
      useLatestFlowVersion: true,
    })
    mockRunChannelHandler.mockResolvedValue({
      message: {
        ...baseIncomingMessage,
        text: `postback_${postbackAction}`,
        attachments: [],
      },
      contact: { sourceId: "psid-123", firstName: "Test" },
      postbackAction,
      quickReplyAction: null,
      ref: null,
    })

    await receiveMessage({ ...baseProps, integrationType: "zalo" })

    expect(mockDetectFlowVersion).toHaveBeenCalledWith({
      flowId: "42",
      flowVersionId: undefined,
      workspaceId: "ws-1",
    })
    expect(mockCreateOrUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Xem sản phẩm" }),
    )
    expect(mockUpdateTracking).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastBtnTitle: "Xem sản phẩm" }),
      }),
    )
    expect(mockAutomatedResponseEnqueueFlowAction).toHaveBeenCalledWith({
      kind: "postback",
      data: expect.objectContaining({ action: postbackAction }),
    })
  })

  test("keeps the raw postback text when the flow can no longer be resolved", async () => {
    const postbackAction = encodeButtonPayload({ flowId: "42", buttonId: "77" })
    mockDetectFlowVersion.mockRejectedValue(new Error("FlowVersion not found"))
    mockRunChannelHandler.mockResolvedValue({
      message: {
        ...baseIncomingMessage,
        text: `postback_${postbackAction}`,
        attachments: [],
      },
      contact: { sourceId: "psid-123", firstName: "Test" },
      postbackAction,
      quickReplyAction: null,
      ref: null,
    })

    await receiveMessage({ ...baseProps, integrationType: "zalo" })

    expect(mockCreateOrUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ text: `postback_${postbackAction}` }),
    )
  })

  test("does not rewrite text when the channel already supplies a button title", async () => {
    const postbackAction = encodeButtonPayload({ flowId: "42", buttonId: "77" })
    mockRunChannelHandler.mockResolvedValue({
      message: { ...baseIncomingMessage, attachments: [] },
      contact: { sourceId: "psid-123", firstName: "Test" },
      postbackAction,
      quickReplyAction: null,
      buttonTitle: "Nút Messenger",
      ref: null,
    })

    await receiveMessage(baseProps)

    expect(mockDetectFlowVersion).not.toHaveBeenCalled()
    expect(mockCreateOrUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ text: "hello" }),
    )
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
    // Threads the freshly-created ContactInbox id — not merely the contact
    // id — so a Trigger action reacting to newContact attributes to THIS
    // channel instead of falling back to most-recent-inbox.
    const { emitContactCreated } = await import("@chatbotx.io/events")
    expect(emitContactCreated).toHaveBeenCalledWith(
      "ws-1",
      "contact-new",
      "Test",
      undefined,
      undefined,
      "ci-new",
    )
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

describe("receiveMessage — referral-only events", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Existing contact inbox (returning contact receiving a standalone
    // `messaging_referrals` webhook on an already-open thread) — no new
    // contact/MAC gate involved.
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
    mockWorkspaceIsActiveNow.mockReturnValue(true)
  })

  test("persists ContactInbox.referral without creating a Message row", async () => {
    mockRunChannelHandler.mockResolvedValue({
      message: null,
      contact: { sourceId: "psid-123" },
      postbackAction: null,
      quickReplyAction: null,
      ref: "ad-ref",
      referralSource: "ADS",
      referral: {
        ref: "ad-ref",
        source: "ADS",
        type: "OPEN_THREAD",
        adId: "ad-9",
      },
    })

    const result = await receiveMessage(baseProps)

    expect(mockCreateMessageRepository).not.toHaveBeenCalled()
    expect(result.message).toBeNull()
    expect(mockUpdateTracking).toHaveBeenCalledWith({
      contactInboxId: "ci-1",
      contactId: "contact-1",
      workspaceId: "ws-1",
      data: {
        referral: {
          ref: "ad-ref",
          source: "ADS",
          type: "OPEN_THREAD",
          adId: "ad-9",
        },
      },
    })
    // Distinguishes this call from the `persistNewMessageSideEffects` path,
    // which always passes `tx` — this call runs standalone and
    // self-invalidates the tracking cache.
    expect(mockUpdateTracking).not.toHaveBeenCalledWith(
      expect.objectContaining({ tx: expect.anything() }),
    )
  })

  test("propagates a referral-only tracking persist failure instead of swallowing it", async () => {
    mockRunChannelHandler.mockResolvedValue({
      message: null,
      contact: { sourceId: "psid-123" },
      postbackAction: null,
      quickReplyAction: null,
      ref: "ad-ref",
      referralSource: "ADS",
      referral: {
        ref: "ad-ref",
        source: "ADS",
        type: "OPEN_THREAD",
        adId: "ad-9",
      },
    })
    mockUpdateTracking.mockRejectedValueOnce(new Error("db unavailable"))

    // A transient `updateTracking` failure here must fail the BullMQ job so
    // it retries — otherwise CTM/CTID referral attribution is silently lost
    // forever (the job "succeeds" with no persisted referral). It must NOT
    // be caught and downgraded to a warning.
    await expect(receiveMessage(baseProps)).rejects.toThrow("db unavailable")
  })

  test("does not persist tracking when there is no referral and no message", async () => {
    mockRunChannelHandler.mockResolvedValue({
      message: null,
      contact: { sourceId: "psid-123" },
      postbackAction: null,
      quickReplyAction: null,
      ref: null,
    })

    await receiveMessage(baseProps)

    expect(mockUpdateTracking).not.toHaveBeenCalled()
  })

  test("still enqueues the ref job for a referral-only event on an active workspace", async () => {
    mockRunChannelHandler.mockResolvedValue({
      message: null,
      contact: { sourceId: "psid-123" },
      postbackAction: null,
      quickReplyAction: null,
      ref: "ad-ref",
      referralSource: "ADS",
      referral: { ref: "ad-ref", source: "ADS", type: "OPEN_THREAD" },
    })

    await receiveMessage(baseProps)

    expect(mockIntegrationQueueAdd).toHaveBeenCalledWith(
      "runRef",
      expect.objectContaining({
        type: "runRef",
        data: expect.objectContaining({ ref: "ad-ref" }),
      }),
    )
  })
})

// ---------------------------------------------------------------------------
// Existing-contact profile refresh — post-save, all channels (Task 2 of
// .superpowers/sdd/2026-08-31-messenger-ctm-profile-backfill). The business
// rules (capability table, cooldown) are Task 1's, tested in
// packages/business/__tests__/contact-profile-refresh.test.ts; this suite
// only exercises the WORKER's wiring through the real `receiveMessage`
// pipeline: eligibility, fetcher selection per channel, and the never-throws
// guarantee.
// ---------------------------------------------------------------------------

describe("receiveMessage — existing contact profile refresh (post-save)", () => {
  beforeEach(() => {
    vi.clearAllMocks()

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
    mockWorkspaceIsActiveNow.mockReturnValue(true)
    mockResolveIntegrationContextFromContactInbox.mockResolvedValue({
      integration: { runChannelHandler: mockRunChannelHandler },
      ctx: { workspaceId: "ws-1" },
    })
  })

  test("named contact (has a name already) → refresh not called", async () => {
    mockFindContactInbox.mockResolvedValue({
      ...fakeContactInbox,
      contact: { ...fakeContact, firstName: "Jane" },
    })
    mockRunChannelHandler.mockResolvedValue({
      message: { ...baseIncomingMessage, attachments: [] },
      contact: { sourceId: "psid-123" },
      postbackAction: null,
      quickReplyAction: null,
      ref: null,
    })

    await receiveMessage(baseProps)

    expect(mockContactProfileRefresh).not.toHaveBeenCalled()
  })

  test("outgoing echo on an existing nameless contact → refresh not called", async () => {
    mockRunChannelHandler.mockResolvedValue({
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

    await receiveMessage(baseProps)

    expect(mockContactProfileRefresh).not.toHaveBeenCalled()
  })

  test("channel with inbound: null (webchat) → refresh not called even for a nameless existing contact", async () => {
    const webchatInbox = { ...fakeInbox, channel: "webchat" }
    vi.mocked(
      integrationService.identifyInboxAndIntegrationAuthFromIdentifier,
    ).mockResolvedValue({
      inbox: webchatInbox,
      integrationRow: fakeIntegrationRow,
    } as never)
    mockFindContactInbox.mockResolvedValue({
      ...fakeContactInbox,
      channel: "webchat",
      contact: fakeContact,
    })
    mockRunChannelHandler.mockResolvedValue({
      message: { ...baseIncomingMessage, attachments: [] },
      contact: { sourceId: "psid-123" },
      postbackAction: null,
      quickReplyAction: null,
      ref: null,
    })

    await receiveMessage({ ...baseProps, integrationType: "webchat" })

    expect(mockContactProfileRefresh).not.toHaveBeenCalled()
    expect(mockResolveIntegrationContextFromContactInbox).not.toHaveBeenCalled()
  })

  test("unknown/legacy channel string on the inbox row → message still persists, refresh not called, receiveMessage never throws", async () => {
    // Simulates a legacy/unknown `Inbox.channel` value (a plain text()
    // column) reaching the capability table — regression guard for
    // resolveInboundProfileNameSource/hasOnDemandProfileApi throwing a
    // TypeError on an unrecognized channel and rejecting the whole receive
    // job (which BullMQ would then retry, replaying postback/quickReply/
    // runRef enqueue for an already-saved message).
    const legacyInbox = { ...fakeInbox, channel: "legacy" }
    vi.mocked(
      integrationService.identifyInboxAndIntegrationAuthFromIdentifier,
    ).mockResolvedValue({
      inbox: legacyInbox,
      integrationRow: fakeIntegrationRow,
    } as never)
    mockFindContactInbox.mockResolvedValue({
      ...fakeContactInbox,
      channel: "legacy",
      contact: fakeContact,
    })
    mockRunChannelHandler.mockResolvedValue({
      message: { ...baseIncomingMessage, attachments: [] },
      contact: { sourceId: "psid-123" },
      postbackAction: null,
      quickReplyAction: null,
      ref: null,
    })

    // `integrationType` (webhook dispatch key) stays a registered value —
    // only `Inbox.channel` (the capability-table lookup key) is the
    // legacy/unknown string, matching how a real corrupted/legacy row would
    // reach `shouldRefreshContactProfile` independent of webhook routing.
    await receiveMessage(baseProps)

    expect(mockCreateOrUpdate).toHaveBeenCalled()
    expect(mockContactProfileRefresh).not.toHaveBeenCalled()
    expect(mockResolveIntegrationContextFromContactInbox).not.toHaveBeenCalled()
  })

  test("tiktok nameless existing contact → refresh not called (inbound: null); a sourceId is never treated as a name", async () => {
    const tiktokInbox = { ...fakeInbox, channel: "tiktok" }
    vi.mocked(
      integrationService.identifyInboxAndIntegrationAuthFromIdentifier,
    ).mockResolvedValue({
      inbox: tiktokInbox,
      integrationRow: fakeIntegrationRow,
    } as never)
    mockFindContactInbox.mockResolvedValue({
      ...fakeContactInbox,
      channel: "tiktok",
      contact: fakeContact,
    })
    mockRunChannelHandler.mockResolvedValue({
      message: { ...baseIncomingMessage, attachments: [] },
      contact: { sourceId: "tiktok-openid-1" },
      postbackAction: null,
      quickReplyAction: null,
      ref: null,
    })

    await receiveMessage({ ...baseProps, integrationType: "tiktok" })

    expect(mockContactProfileRefresh).not.toHaveBeenCalled()
  })

  test("whatsapp payload with contacts[0].profile.name → applies it directly, no integration resolution and no Graph call", async () => {
    const whatsappInbox = { ...fakeInbox, channel: "whatsapp" }
    vi.mocked(
      integrationService.identifyInboxAndIntegrationAuthFromIdentifier,
    ).mockResolvedValue({
      inbox: whatsappInbox,
      integrationRow: fakeIntegrationRow,
    } as never)
    mockFindContactInbox.mockResolvedValue({
      ...fakeContactInbox,
      channel: "whatsapp",
      contact: fakeContact,
    })
    mockRunChannelHandler.mockResolvedValue({
      message: { ...baseIncomingMessage, attachments: [] },
      // The channel already parsed contacts[0].profile.name into the SDK
      // IncomingContact — this is the payload the fetcher must apply as-is.
      contact: { sourceId: "psid-123", firstName: "Maria" },
      postbackAction: null,
      quickReplyAction: null,
      ref: null,
    })
    mockContactProfileRefresh.mockImplementation(async (input) => {
      const profile = await input.fetchProfile()
      return profile?.firstName
        ? { status: "updated", contact: {} }
        : { status: "unavailable" }
    })

    await receiveMessage({ ...baseProps, integrationType: "whatsapp" })

    expect(mockContactProfileRefresh).toHaveBeenCalledWith(
      expect.objectContaining({ source: "payload" }),
    )
    expect(mockResolveIntegrationContextFromContactInbox).not.toHaveBeenCalled()
    expect(mockRunChannelHandler).not.toHaveBeenCalledWith(
      "contact",
      "getProfile",
      expect.anything(),
    )
  })

  test("whatsapp payload without a name → unavailable, no local cooldown gate; a later message tries again", async () => {
    const whatsappInbox = { ...fakeInbox, channel: "whatsapp" }
    vi.mocked(
      integrationService.identifyInboxAndIntegrationAuthFromIdentifier,
    ).mockResolvedValue({
      inbox: whatsappInbox,
      integrationRow: fakeIntegrationRow,
    } as never)
    mockFindContactInbox.mockResolvedValue({
      ...fakeContactInbox,
      channel: "whatsapp",
      contact: fakeContact,
    })
    mockRunChannelHandler.mockResolvedValue({
      message: { ...baseIncomingMessage, attachments: [] },
      contact: { sourceId: "psid-123" }, // no name in the payload
      postbackAction: null,
      quickReplyAction: null,
      ref: null,
    })
    mockContactProfileRefresh.mockResolvedValue({ status: "unavailable" })

    await receiveMessage({ ...baseProps, integrationType: "whatsapp" })
    expect(mockContactProfileRefresh).toHaveBeenCalledTimes(1)

    // The worker adds no gate of its own — a later message is still a
    // candidate; the service (Task 1, tested there) owns the cooldown.
    await receiveMessage({ ...baseProps, integrationType: "whatsapp" })
    expect(mockContactProfileRefresh).toHaveBeenCalledTimes(2)
  })

  test("api channel: payload source, same as whatsapp", async () => {
    const apiInbox = { ...fakeInbox, channel: "api" }
    vi.mocked(
      integrationService.identifyInboxAndIntegrationAuthFromIdentifier,
    ).mockResolvedValue({
      inbox: apiInbox,
      integrationRow: fakeIntegrationRow,
    } as never)
    mockFindContactInbox.mockResolvedValue({
      ...fakeContactInbox,
      channel: "api",
      contact: fakeContact,
    })
    mockRunChannelHandler.mockResolvedValue({
      message: { ...baseIncomingMessage, attachments: [] },
      contact: { sourceId: "psid-123", firstName: "API Contact" },
      postbackAction: null,
      quickReplyAction: null,
      ref: null,
    })

    await receiveMessage({ ...baseProps, integrationType: "api" })

    expect(mockContactProfileRefresh).toHaveBeenCalledWith(
      expect.objectContaining({ source: "payload" }),
    )
    expect(mockResolveIntegrationContextFromContactInbox).not.toHaveBeenCalled()
  })

  test("telegram nameless existing contact → getProfile (getChat) called with the contactInbox's own sourceId, ignoring any name on the payload", async () => {
    const telegramInbox = { ...fakeInbox, channel: "telegram" }
    const telegramContactInbox = {
      ...fakeContactInbox,
      channel: "telegram",
      sourceId: "tg-chat-1",
    }
    vi.mocked(
      integrationService.identifyInboxAndIntegrationAuthFromIdentifier,
    ).mockResolvedValue({
      inbox: telegramInbox,
      integrationRow: fakeIntegrationRow,
    } as never)
    mockFindContactInbox.mockResolvedValue({
      ...telegramContactInbox,
      contact: fakeContact,
    })
    mockRunChannelHandler.mockImplementation(
      (_domain: string, action: string) => {
        if (action === "getProfile") {
          return Promise.resolve({ firstName: "Alex" })
        }
        return Promise.resolve({
          message: { ...baseIncomingMessage, attachments: [] },
          // A group-chat callback query names the clicking user here, not
          // the chat's own identity — the payload source must never be
          // used for telegram (capability table: inbound = "channelApi").
          contact: { sourceId: "tg-chat-1", firstName: "Whoever Clicked" },
          postbackAction: null,
          quickReplyAction: null,
          ref: null,
        })
      },
    )
    mockContactProfileRefresh.mockImplementation(async (input) => {
      await input.fetchProfile()
      return { status: "updated", contact: {} }
    })

    await receiveMessage({ ...baseProps, integrationType: "telegram" })

    expect(mockContactProfileRefresh).toHaveBeenCalledWith(
      expect.objectContaining({ source: "channelApi" }),
    )
    expect(mockResolveIntegrationContextFromContactInbox).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactInbox: expect.objectContaining({ sourceId: "tg-chat-1" }),
    })
    expect(mockRunChannelHandler).toHaveBeenCalledWith(
      "contact",
      "getProfile",
      {
        ctx: { workspaceId: "ws-1" },
        data: { sourceId: "tg-chat-1" },
      },
    )
  })

  test("instagram: the channelApi fetcher delegates registry dispatch to resolveIntegrationContextFromContactInbox (direct vs via-Facebook is invisible here)", async () => {
    const instagramInbox = { ...fakeInbox, channel: "instagram" }
    vi.mocked(
      integrationService.identifyInboxAndIntegrationAuthFromIdentifier,
    ).mockResolvedValue({
      inbox: instagramInbox,
      integrationRow: fakeIntegrationRow,
    } as never)
    mockFindContactInbox.mockResolvedValue({
      ...fakeContactInbox,
      channel: "instagram",
      contact: fakeContact,
    })
    mockRunChannelHandler.mockResolvedValue({
      message: { ...baseIncomingMessage, attachments: [] },
      contact: { sourceId: "psid-123" },
      postbackAction: null,
      quickReplyAction: null,
      ref: null,
    })
    // Standing in for `resolveIntegrationContextFromContactInbox` picking
    // the `instagramFacebook` registry (its own existing, unit-tested
    // behaviour) — this test only proves our fetcher uses whatever it
    // resolves rather than re-implementing the dispatch itself.
    const instagramFacebookRunChannelHandler = vi
      .fn()
      .mockResolvedValue({ firstName: "Via FB" })
    mockResolveIntegrationContextFromContactInbox.mockResolvedValue({
      integration: { runChannelHandler: instagramFacebookRunChannelHandler },
      ctx: { workspaceId: "ws-1" },
    })
    mockContactProfileRefresh.mockImplementation(async (input) => {
      await input.fetchProfile()
      return { status: "updated", contact: {} }
    })

    await receiveMessage({ ...baseProps, integrationType: "instagram" })

    expect(mockResolveIntegrationContextFromContactInbox).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactInbox: expect.objectContaining({ channel: "instagram" }),
    })
    expect(instagramFacebookRunChannelHandler).toHaveBeenCalledWith(
      "contact",
      "getProfile",
      expect.objectContaining({ data: { sourceId: "psid-123" } }),
    )
  })

  test("zalo nameless existing contact → getProfile called, display_name applied", async () => {
    const zaloInbox = { ...fakeInbox, channel: "zalo" }
    vi.mocked(
      integrationService.identifyInboxAndIntegrationAuthFromIdentifier,
    ).mockResolvedValue({
      inbox: zaloInbox,
      integrationRow: fakeIntegrationRow,
    } as never)
    mockFindContactInbox.mockResolvedValue({
      ...fakeContactInbox,
      channel: "zalo",
      contact: fakeContact,
    })
    mockRunChannelHandler.mockImplementation(
      (_domain: string, action: string) => {
        if (action === "getProfile") {
          // The zalo integration maps `display_name` onto `firstName`.
          return Promise.resolve({ firstName: "Nguyen Van A" })
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
    mockContactProfileRefresh.mockImplementation(async (input) => {
      const profile = await input.fetchProfile()
      return profile?.firstName
        ? { status: "updated", contact: {} }
        : { status: "unavailable" }
    })

    await receiveMessage({ ...baseProps, integrationType: "zalo" })

    expect(mockContactProfileRefresh).toHaveBeenCalledWith(
      expect.objectContaining({ source: "channelApi" }),
    )
    expect(mockRunChannelHandler).toHaveBeenCalledWith(
      "contact",
      "getProfile",
      {
        ctx: { workspaceId: "ws-1" },
        data: { sourceId: "psid-123" },
      },
    )
  })

  test("zalo display_name blank → unavailable (cooldown remains the service's responsibility)", async () => {
    const zaloInbox = { ...fakeInbox, channel: "zalo" }
    vi.mocked(
      integrationService.identifyInboxAndIntegrationAuthFromIdentifier,
    ).mockResolvedValue({
      inbox: zaloInbox,
      integrationRow: fakeIntegrationRow,
    } as never)
    mockFindContactInbox.mockResolvedValue({
      ...fakeContactInbox,
      channel: "zalo",
      contact: fakeContact,
    })
    mockRunChannelHandler.mockResolvedValue({
      message: { ...baseIncomingMessage, attachments: [] },
      contact: { sourceId: "psid-123" },
      postbackAction: null,
      quickReplyAction: null,
      ref: null,
    })
    mockContactProfileRefresh.mockResolvedValue({ status: "unavailable" })

    await receiveMessage({ ...baseProps, integrationType: "zalo" })

    expect(mockContactProfileRefresh).toHaveBeenCalledWith(
      expect.objectContaining({ source: "channelApi" }),
    )
  })

  test("duplicate webhook (isNewMessage === false) → the service is still called (owner decision)", async () => {
    mockCreateOrUpdate.mockResolvedValue({
      message: fakeCreatedMessage,
      isNew: false,
    })
    mockRunChannelHandler.mockResolvedValue({
      message: { ...baseIncomingMessage, attachments: [] },
      contact: { sourceId: "psid-123" },
      postbackAction: null,
      quickReplyAction: null,
      ref: null,
    })

    await receiveMessage(baseProps)

    expect(mockContactProfileRefresh).toHaveBeenCalled()
  })

  test("a new contact created by a text message whose creation-path getProfile failed still gets a refresh attempt in the same job (owner decision)", async () => {
    mockFindContactInbox.mockResolvedValue(undefined)
    mockWorkspaceFind.mockResolvedValue({ ownerId: "owner-1" })
    mockRunChannelHandler.mockImplementation(
      (_domain: string, action: string) => {
        if (action === "getProfile") {
          return Promise.reject(new Error("consent required"))
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
          lastName: null,
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
    mockCreateOrUpdate.mockResolvedValue({
      message: { ...fakeCreatedMessage, contactInboxId: "ci-new" },
      isNew: true,
    })

    await receiveMessage(baseProps)

    expect(mockRecordProfileRefreshFailure).toHaveBeenCalled()
    expect(mockContactProfileRefresh).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: "contact-new" }),
    )
  })

  test("creation path: if recordProfileRefreshFailure itself rejects, the contact is still created", async () => {
    mockFindContactInbox.mockResolvedValue(undefined)
    mockWorkspaceFind.mockResolvedValue({ ownerId: "owner-1" })
    mockRunChannelHandler.mockImplementation(
      (_domain: string, action: string) => {
        if (action === "getProfile") {
          return Promise.reject(new Error("consent required"))
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
    mockRecordProfileRefreshFailure.mockRejectedValueOnce(
      new Error("error-log stream down"),
    )
    mockCreateNewContactWithMac.mockResolvedValue({
      ok: true,
      value: {
        newContact: {
          id: "contact-new",
          workspaceId: "ws-1",
          firstName: null,
          lastName: null,
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

  test("if the profile-refresh service throws unexpectedly, receiveMessage still resolves and a warning is logged", async () => {
    mockContactProfileRefresh.mockRejectedValue(new Error("boom"))
    mockRunChannelHandler.mockResolvedValue({
      message: { ...baseIncomingMessage, attachments: [] },
      contact: { sourceId: "psid-123" },
      postbackAction: null,
      quickReplyAction: null,
      ref: null,
    })

    await expect(receiveMessage(baseProps)).resolves.toBeDefined()
    expect(logger.warn).toHaveBeenCalled()
  })

  test("two concurrent inbound messages from the same nameless contact → both persist, refresh runs for both (no lock)", async () => {
    mockRunChannelHandler.mockResolvedValue({
      message: { ...baseIncomingMessage, attachments: [] },
      contact: { sourceId: "psid-123" },
      postbackAction: null,
      quickReplyAction: null,
      ref: null,
    })
    mockContactProfileRefresh.mockImplementation(async (input) => {
      await input.fetchProfile()
      return { status: "updated", contact: {} }
    })

    await Promise.all([receiveMessage(baseProps), receiveMessage(baseProps)])

    expect(mockCreateOrUpdate).toHaveBeenCalledTimes(2)
    expect(mockContactProfileRefresh).toHaveBeenCalledTimes(2)
  })

  test("no worker-side cooldown gate: the service is called on every eligible message, even immediately after a failed/cooling-down attempt", async () => {
    mockRunChannelHandler.mockResolvedValue({
      message: { ...baseIncomingMessage, attachments: [] },
      contact: { sourceId: "psid-123" },
      postbackAction: null,
      quickReplyAction: null,
      ref: null,
    })
    mockContactProfileRefresh
      .mockResolvedValueOnce({ status: "failed" })
      .mockResolvedValueOnce({ status: "skipped", reason: "coolingDown" })
      .mockResolvedValueOnce({ status: "updated", contact: {} })

    await receiveMessage(baseProps)
    await receiveMessage(baseProps)
    await receiveMessage(baseProps)

    expect(mockContactProfileRefresh).toHaveBeenCalledTimes(3)
  })

  test("instagram: a referral-only event still fetches getProfile at creation time via hasOnDemandProfileApi (replaces canGetUserProfileIfNeeded)", async () => {
    const instagramInbox = { ...fakeInbox, channel: "instagram" }
    vi.mocked(
      integrationService.identifyInboxAndIntegrationAuthFromIdentifier,
    ).mockResolvedValue({
      inbox: instagramInbox,
      integrationRow: fakeIntegrationRow,
    } as never)
    mockFindContactInbox.mockResolvedValue(undefined)
    mockWorkspaceFind.mockResolvedValue({ ownerId: "owner-1" })
    mockRunChannelHandler.mockImplementation(
      (_domain: string, action: string) => {
        if (action === "getProfile") {
          return Promise.resolve({ firstName: "IG Contact" })
        }
        return Promise.resolve({
          message: null,
          contact: { sourceId: "ig-psid-1" },
          postbackAction: null,
          quickReplyAction: null,
          ref: "ad-ref",
          referralSource: "ADS",
          referral: { ref: "ad-ref", source: "ADS", type: "OPEN_THREAD" },
        })
      },
    )
    mockCreateNewContactWithMac.mockResolvedValue({
      ok: true,
      value: {
        newContact: {
          id: "contact-ig-new",
          workspaceId: "ws-1",
          firstName: "IG Contact",
          phoneNumber: null,
          email: null,
          blockedAt: null,
          createdAt: new Date("2026-06-21T00:00:00Z"),
        },
        contactInbox: {
          ...fakeContactInbox,
          id: "ci-ig-new",
          contactId: "contact-ig-new",
          channel: "instagram",
        },
        conversation: fakeConversation,
      },
    })

    await receiveMessage({ ...baseProps, integrationType: "instagram" })

    expect(mockRunChannelHandler).toHaveBeenCalledWith(
      "contact",
      "getProfile",
      expect.objectContaining({ data: { sourceId: "ig-psid-1" } }),
    )
  })

  test("zalo: a new contact creation still fetches getProfile at creation time via hasOnDemandProfileApi", async () => {
    mockFindContactInbox.mockResolvedValue(undefined)
    mockWorkspaceFind.mockResolvedValue({ ownerId: "owner-1" })
    const zaloInbox = { ...fakeInbox, channel: "zalo" }
    vi.mocked(
      integrationService.identifyInboxAndIntegrationAuthFromIdentifier,
    ).mockResolvedValue({
      inbox: zaloInbox,
      integrationRow: fakeIntegrationRow,
    } as never)
    mockRunChannelHandler.mockImplementation(
      (_domain: string, action: string) => {
        if (action === "getProfile") {
          return Promise.resolve({ firstName: "Zalo Contact" })
        }
        return Promise.resolve({
          message: { ...baseIncomingMessage, attachments: [] },
          contact: { sourceId: "zalo-psid-1" },
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
          id: "contact-zalo-new",
          workspaceId: "ws-1",
          firstName: "Zalo Contact",
          phoneNumber: null,
          email: null,
          blockedAt: null,
          createdAt: new Date("2026-06-21T00:00:00Z"),
        },
        contactInbox: {
          ...fakeContactInbox,
          id: "ci-zalo-new",
          contactId: "contact-zalo-new",
          channel: "zalo",
        },
        conversation: fakeConversation,
      },
    })
    mockCreateOrUpdate.mockResolvedValue({
      message: { ...fakeCreatedMessage, contactInboxId: "ci-zalo-new" },
      isNew: true,
    })

    await receiveMessage({ ...baseProps, integrationType: "zalo" })

    expect(mockRunChannelHandler).toHaveBeenCalledWith(
      "contact",
      "getProfile",
      expect.objectContaining({ data: { sourceId: "zalo-psid-1" } }),
    )
  })

  test("telegram: a new contact creation still fetches getProfile at creation time via hasOnDemandProfileApi", async () => {
    mockFindContactInbox.mockResolvedValue(undefined)
    mockWorkspaceFind.mockResolvedValue({ ownerId: "owner-1" })
    const telegramInbox = { ...fakeInbox, channel: "telegram" }
    vi.mocked(
      integrationService.identifyInboxAndIntegrationAuthFromIdentifier,
    ).mockResolvedValue({
      inbox: telegramInbox,
      integrationRow: fakeIntegrationRow,
    } as never)
    mockRunChannelHandler.mockImplementation(
      (_domain: string, action: string) => {
        if (action === "getProfile") {
          return Promise.resolve({ firstName: "Telegram Contact" })
        }
        return Promise.resolve({
          message: { ...baseIncomingMessage, attachments: [] },
          contact: { sourceId: "telegram-chat-1" },
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
          id: "contact-telegram-new",
          workspaceId: "ws-1",
          firstName: "Telegram Contact",
          phoneNumber: null,
          email: null,
          blockedAt: null,
          createdAt: new Date("2026-06-21T00:00:00Z"),
        },
        contactInbox: {
          ...fakeContactInbox,
          id: "ci-telegram-new",
          contactId: "contact-telegram-new",
          channel: "telegram",
        },
        conversation: fakeConversation,
      },
    })
    mockCreateOrUpdate.mockResolvedValue({
      message: { ...fakeCreatedMessage, contactInboxId: "ci-telegram-new" },
      isNew: true,
    })

    await receiveMessage({ ...baseProps, integrationType: "telegram" })

    expect(mockRunChannelHandler).toHaveBeenCalledWith(
      "contact",
      "getProfile",
      expect.objectContaining({ data: { sourceId: "telegram-chat-1" } }),
    )
  })

  test("CTM sequence: a referral-only creation whose getProfile fetch failed, then a text message from the same PSID triggers the refresh after the message is persisted", async () => {
    // --- Call 1: referral-only event, brand-new contact -------------------
    mockFindContactInbox.mockResolvedValueOnce(undefined)
    mockWorkspaceFind.mockResolvedValue({ ownerId: "owner-1" })
    mockRunChannelHandler.mockImplementation(
      (_domain: string, action: string) => {
        if (action === "getProfile") {
          return Promise.reject({
            code: 2_018_218,
            message: "consent required",
          })
        }
        return Promise.resolve({
          message: null,
          contact: { sourceId: "psid-ctm" },
          postbackAction: null,
          quickReplyAction: null,
          ref: "ad-ref",
          referralSource: "ADS",
          referral: {
            ref: "ad-ref",
            source: "ADS",
            type: "OPEN_THREAD",
            adId: "ad-1",
          },
        })
      },
    )
    mockCreateNewContactWithMac.mockResolvedValue({
      ok: true,
      value: {
        newContact: {
          id: "contact-ctm",
          workspaceId: "ws-1",
          firstName: null,
          lastName: null,
          phoneNumber: null,
          email: null,
          blockedAt: null,
          createdAt: new Date("2026-06-21T00:00:00Z"),
        },
        contactInbox: {
          ...fakeContactInbox,
          id: "ci-ctm",
          contactId: "contact-ctm",
          sourceId: "psid-ctm",
        },
        conversation: fakeConversation,
      },
    })

    await receiveMessage(baseProps)

    // No message on a referral-only event → the `if (incomingMessage)`
    // block (where the refresh call lives) never runs; only the
    // creation-path failure is recorded, with no cooldown possible from
    // this path (the service, and therefore the cooldown, is never called).
    expect(mockContactProfileRefresh).not.toHaveBeenCalled()
    expect(mockRecordProfileRefreshFailure).toHaveBeenCalled()

    // --- Call 2: a real text message from the same PSID --------------------
    mockFindContactInbox.mockResolvedValue({
      ...fakeContactInbox,
      id: "ci-ctm",
      contactId: "contact-ctm",
      sourceId: "psid-ctm",
      contact: {
        id: "contact-ctm",
        workspaceId: "ws-1",
        firstName: null,
        lastName: null,
      },
    })
    mockRunChannelHandler.mockImplementation(
      (_domain: string, action: string) => {
        if (action === "getProfile") {
          return Promise.resolve({ firstName: "Jane", lastName: "Doe" })
        }
        return Promise.resolve({
          message: {
            ...baseIncomingMessage,
            sourceId: "msg-ctm-2",
            attachments: [],
          },
          contact: { sourceId: "psid-ctm" },
          postbackAction: null,
          quickReplyAction: null,
          ref: null,
        })
      },
    )
    mockCreateOrUpdate.mockResolvedValue({
      message: {
        ...fakeCreatedMessage,
        id: "msg-ctm-2",
        contactInboxId: "ci-ctm",
      },
      isNew: true,
    })
    mockContactProfileRefresh.mockImplementation(async (input) => {
      await input.fetchProfile()
      return {
        status: "updated",
        contact: { id: "contact-ctm", firstName: "Jane", lastName: "Doe" },
      }
    })

    await receiveMessage(baseProps)

    expect(mockContactProfileRefresh).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: "contact-ctm",
        source: "channelApi",
      }),
    )
    expect(mockRunChannelHandler).toHaveBeenCalledWith(
      "contact",
      "getProfile",
      {
        ctx: { workspaceId: "ws-1" },
        data: { sourceId: "psid-ctm" },
      },
    )
    // The message row is persisted before the refresh runs — both happen
    // inside the same `receiveMessage` call, and the refresh is awaited
    // before it returns, so `receiveMessage` resolving already proves the
    // refresh (and therefore the mocked `contactService.update` inside it)
    // completed before anything `worker.ts`'s `incomingMessage` case does
    // afterwards (e.g. enqueueing `processAutomatedResponse`) — see
    // apps/worker/src/integration/worker.ts:82-160.
    expect(mockCreateOrUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      mockContactProfileRefresh.mock.invocationCallOrder[0],
    )
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

// ---------------------------------------------------------------------------
// WhatsApp Business-Scoped User ID (BSUID) support
// ---------------------------------------------------------------------------

describe("receiveMessage — BSUID resolver chain (D3)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindOrFail.mockResolvedValue(fakeConversation)
    mockConversationFindOrCreate.mockResolvedValue(fakeConversation)
    vi.mocked(
      integrationService.identifyInboxAndIntegrationAuthFromIdentifier,
    ).mockResolvedValue({
      inbox: { ...fakeInbox, channel: "whatsapp" },
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
  })

  test("falls back to matching by sourceUserId when the sourceId lookup misses (returning username adopter)", async () => {
    const bsuidContactInbox = {
      ...fakeContactInbox,
      id: "ci-bsuid",
      contactId: "contact-bsuid",
      sourceId: "user.bsuid-1",
      sourceUserId: "user.bsuid-1",
      channel: "whatsapp",
      contact: { ...fakeContact, id: "contact-bsuid" },
    }
    mockFindContactInbox
      .mockResolvedValueOnce(undefined) // resolveBySourceId miss
      .mockResolvedValueOnce(bsuidContactInbox) // resolveBySourceUserId hit
    mockRunChannelHandler.mockResolvedValue({
      message: { ...baseIncomingMessage, attachments: [] },
      contact: {
        sourceId: "84900000099",
        sourceUserId: "user.bsuid-1",
        firstName: "Test",
      },
      postbackAction: null,
      quickReplyAction: null,
      ref: null,
    })

    await receiveMessage({
      ...baseProps,
      integrationType: "whatsapp",
    })

    expect(mockFindContactInbox).toHaveBeenCalledTimes(2)
    expect(mockCreateOrUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ contactInboxId: "ci-bsuid" }),
    )
  })

  test("never re-runs the sourceId lookup as sourceUserId — sourceId match wins first and short-circuits", async () => {
    mockFindContactInbox.mockResolvedValueOnce({
      ...fakeContactInbox,
      channel: "whatsapp",
      contact: fakeContact,
    })
    mockRunChannelHandler.mockResolvedValue({
      message: { ...baseIncomingMessage, attachments: [] },
      contact: {
        sourceId: "psid-123",
        sourceUserId: "user.bsuid-2",
        firstName: "Test",
      },
      postbackAction: null,
      quickReplyAction: null,
      ref: null,
    })

    await receiveMessage({ ...baseProps, integrationType: "whatsapp" })

    // Only ONE lookup — resolveBySourceId hit, so resolveBySourceUserId never runs.
    expect(mockFindContactInbox).toHaveBeenCalledTimes(1)
  })

  test("backfills sourceUserId/sourceUsername onto the matched row via syncScopedIdentity", async () => {
    mockFindContactInbox.mockResolvedValueOnce({
      ...fakeContactInbox,
      channel: "whatsapp",
      sourceUserId: null,
      sourceUsername: null,
      contact: fakeContact,
    })
    const incomingContact = {
      sourceId: "psid-123",
      sourceUserId: "user.bsuid-3",
      sourceUsername: "@handle",
      firstName: "Test",
    }
    mockRunChannelHandler.mockResolvedValue({
      message: { ...baseIncomingMessage, attachments: [] },
      contact: incomingContact,
      postbackAction: null,
      quickReplyAction: null,
      ref: null,
    })

    await receiveMessage({ ...baseProps, integrationType: "whatsapp" })

    expect(mockSyncScopedIdentity).toHaveBeenCalledWith(
      expect.objectContaining({
        incomingContact: expect.objectContaining({
          sourceUserId: "user.bsuid-3",
          sourceUsername: "@handle",
        }),
      }),
    )
  })
})

describe("receiveMessage — new BSUID-keyed contact creation (D2/D8/§8.1)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindOrFail.mockResolvedValue(fakeConversation)
    mockConversationFindOrCreate.mockResolvedValue(fakeConversation)
    mockWorkspaceFind.mockResolvedValue({ ownerId: "owner-1" })
    vi.mocked(
      integrationService.identifyInboxAndIntegrationAuthFromIdentifier,
    ).mockResolvedValue({
      inbox: { ...fakeInbox, channel: "whatsapp" },
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
    mockFindContactInbox.mockResolvedValue(undefined)
  })

  test("creates a BSUID-keyed row (sourceId === sourceUserId) with both new columns set", async () => {
    mockRunChannelHandler.mockResolvedValue({
      message: { ...baseIncomingMessage, attachments: [] },
      contact: {
        sourceId: "user.bsuid-4",
        sourceUserId: "user.bsuid-4",
        sourceUsername: "@adopter",
        firstName: "Adopter",
      },
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
          sourceId: "user.bsuid-4",
          sourceUserId: "user.bsuid-4",
          sourceUsername: "@adopter",
          channel: "whatsapp",
        },
        conversation: fakeConversation,
      },
    })

    await receiveMessage({ ...baseProps, integrationType: "whatsapp" })

    const rows = await runCapturedNewContactCreate()
    expect(rows).toContainEqual(
      expect.objectContaining({
        sourceId: "user.bsuid-4",
        sourceUserId: "user.bsuid-4",
        sourceUsername: "@adopter",
      }),
    )
  })

  test("does NOT infer locale/timezone from a BSUID-keyed sourceId, even one shaped like a phone number (§8.1)", async () => {
    // Deliberately picks a value that WOULD have been mis-parsed as a valid
    // Vietnamese phone number by the pre-fix code path (`inbox.channel ===
    // "whatsapp"` unconditionally used `sourceId` as the phone hint).
    mockRunChannelHandler.mockResolvedValue({
      message: { ...baseIncomingMessage, attachments: [] },
      contact: {
        sourceId: "84901234567",
        sourceUserId: "84901234567",
        firstName: "Adopter",
      },
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
          sourceId: "84901234567",
          sourceUserId: "84901234567",
          channel: "whatsapp",
        },
        conversation: fakeConversation,
      },
    })

    await receiveMessage({ ...baseProps, integrationType: "whatsapp" })

    const rows = await runCapturedNewContactCreate()
    expect(rows).toContainEqual(
      expect.objectContaining({
        locale: undefined,
        timezone: undefined,
      }),
    )
  })

  test("recovers via the resolver chain when contact creation loses a unique-violation race (D8)", async () => {
    const winnerContactInbox = {
      ...fakeContactInbox,
      id: "ci-winner",
      contactId: "contact-winner",
      sourceId: "user.bsuid-5",
      sourceUserId: "user.bsuid-5",
      channel: "whatsapp",
      contact: { ...fakeContact, id: "contact-winner" },
    }
    // Initial resolver chain (both miss) already configured via the shared
    // `mockFindContactInbox.mockResolvedValue(undefined)` in beforeEach;
    // queue the recovery lookup's hit on top of it.
    mockFindContactInbox.mockResolvedValueOnce(undefined) // initial resolveBySourceId
    mockFindContactInbox.mockResolvedValueOnce(undefined) // initial resolveBySourceUserId
    mockFindContactInbox.mockResolvedValueOnce(winnerContactInbox) // recovery resolveBySourceId

    const raceError = Object.assign(new Error("duplicate key value"), {
      code: "23505",
    })
    mockCreateNewContactWithMac.mockRejectedValueOnce(raceError)
    mockIsUniqueViolationError.mockReturnValue(true)

    mockRunChannelHandler.mockResolvedValue({
      message: { ...baseIncomingMessage, attachments: [] },
      contact: {
        sourceId: "user.bsuid-5",
        sourceUserId: "user.bsuid-5",
        firstName: "Adopter",
      },
      postbackAction: null,
      quickReplyAction: null,
      ref: null,
    })

    await receiveMessage({
      ...baseProps,
      integrationType: "whatsapp",
    })

    expect(mockIsUniqueViolationError).toHaveBeenCalled()
    expect(mockCreateOrUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ contactInboxId: "ci-winner" }),
    )
  })

  test("rethrows a creation error that is not a unique-violation race", async () => {
    mockIsUniqueViolationError.mockReturnValue(false)
    mockCreateNewContactWithMac.mockRejectedValueOnce(
      new Error("connection reset"),
    )
    mockRunChannelHandler.mockResolvedValue({
      message: { ...baseIncomingMessage, attachments: [] },
      contact: { sourceId: "user.bsuid-6", firstName: "Adopter" },
      postbackAction: null,
      quickReplyAction: null,
      ref: null,
    })

    await expect(
      receiveMessage({ ...baseProps, integrationType: "whatsapp" }),
    ).rejects.toThrow("connection reset")
  })
})
