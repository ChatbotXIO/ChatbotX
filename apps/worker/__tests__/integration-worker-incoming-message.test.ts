import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// Job-level ordering proof for the `incomingMessage` case in
// `src/integration/worker.ts` (fix round 1 of Task 2 of
// .superpowers/sdd/2026-08-31-messenger-ctm-profile-backfill): the
// receiveMessage-level assertion in received-message.test.ts is a fine
// proxy, but the brief's actual bullet asks for the refresh's resolution to
// be proven ordered before the automated-response dispatch AT THE JOB
// LEVEL, i.e. through the real `worker.ts` processor. Unlike
// integration-worker-boot.test.ts, this file does NOT mock
// `./handlers/received-message` — it boots the REAL `receiveMessage`
// pipeline (mocking only its DB/Redis/channel-registry dependencies, same
// convention as received-message.test.ts) so the real post-save
// `refreshExistingContactProfile` call runs, while `resolveIncomingTextRouting`
// and `automatedResponseService.enqueue` (the dispatch this bullet cares
// about) stay mocked and observable.
// ---------------------------------------------------------------------------

type CapturedWorker = {
  queueName: unknown
  processor: (job: { data: unknown }) => Promise<unknown>
}

const {
  mockCreateOrUpdate,
  mockCreateMessageRepository,
  mockDbUpdate,
  mockFindContactInbox,
  mockRunChannelHandler,
  mockBuildContext,
  mockresolveTenantSettings,
  mockUpdateContactFromMessage,
  mockContactUnblockIfBlocked,
  mockContactUpdate,
  mockDbTransaction,
  mockDbCount,
  mockWorkspaceIsActiveNow,
  mockSyncScopedIdentity,
  mockIsUniqueViolationError,
  mockContactProfileRefresh,
  mockResolveIntegrationContextFromContactInbox,
  mockResolveIncomingTextRouting,
  mockAutomatedResponseEnqueue,
  mockConversationFindOrCreate,
  workerState,
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
  const mockRunChannelHandler = vi.fn()
  const mockCreateOrUpdate = vi.fn()
  const mockCreateMessageRepository = vi.fn().mockResolvedValue({
    createOrUpdate: mockCreateOrUpdate,
    createOrUpdateWithAttachments: vi.fn(),
  })

  return {
    mockCreateOrUpdate,
    mockCreateMessageRepository,
    mockDbUpdate,
    mockFindContactInbox,
    mockRunChannelHandler,
    mockBuildContext: vi.fn().mockResolvedValue({ workspaceId: "ws-1" }),
    mockresolveTenantSettings: vi
      .fn()
      .mockResolvedValue({ storageUrl: "https://files.example.test" }),
    mockUpdateContactFromMessage: vi.fn().mockResolvedValue(undefined),
    mockContactUnblockIfBlocked: vi.fn().mockResolvedValue(null),
    mockContactUpdate: vi.fn().mockResolvedValue({}),
    mockDbTransaction,
    mockDbCount,
    mockWorkspaceIsActiveNow: vi.fn().mockReturnValue(true),
    // Pass-through by default: returns the matched contactInbox unchanged.
    mockSyncScopedIdentity: vi.fn(
      async ({ contactInbox }: { contactInbox: unknown }) => ({
        contactInbox,
        learnedPrimaryIdentity: undefined,
      }),
    ),
    mockIsUniqueViolationError: vi.fn().mockReturnValue(false),
    mockContactProfileRefresh: vi.fn(),
    mockResolveIntegrationContextFromContactInbox: vi.fn(),
    mockResolveIncomingTextRouting: vi.fn(),
    mockAutomatedResponseEnqueue: vi.fn().mockResolvedValue(undefined),
    mockConversationFindOrCreate: vi.fn(),
    workerState: { capturedWorkers: [] as CapturedWorker[] },
  }
})

// ---------------------------------------------------------------------------
// Worker-boot infra (mirrors integration-worker-boot.test.ts)
// ---------------------------------------------------------------------------

vi.mock("bullmq", () => {
  class WorkerMock {
    close = vi.fn()
    on = vi.fn()
    constructor(queueName: unknown, processor: CapturedWorker["processor"]) {
      workerState.capturedWorkers.push({ queueName, processor })
    }
  }
  return { Worker: WorkerMock, UnrecoverableError: class extends Error {} }
})

vi.mock("../src/env", () => ({
  env: { INTEGRATION_WORKER_CONCURRENCY: 10 },
}))

vi.mock("../src/lib/bootstrap", () => ({
  ensureBootstrapped: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../src/lib/is-blocked-workspace", () => ({
  isBlockedWorkspace: vi.fn().mockResolvedValue(false),
}))

vi.mock("../src/lib/resolve-workspace-id", () => ({
  resolveWorkspaceId: vi.fn().mockResolvedValue("ws-1"),
}))

vi.mock("../src/integration/job-context", () => ({
  runIntegrationJobWithWebhookContext: (
    _job: unknown,
    callback: () => Promise<unknown>,
  ) => callback(),
}))

vi.mock("../src/integration/routing", () => ({
  resolveIncomingTextRouting: mockResolveIncomingTextRouting,
}))

vi.mock("../src/integration/utils/message", () => ({
  closeChatQueueEvents: vi.fn().mockResolvedValue(undefined),
}))

// Every OTHER handler module worker.ts wires into its switch — none of them
// are exercised by the `incomingMessage` case, stubbed only so the module
// graph resolves.
vi.mock("../src/integration/handlers/ads-automatic-event", () => ({
  handleAdsAutomaticEvent: vi.fn(),
}))
vi.mock("../src/integration/handlers/ads-conversion/registry", () => ({
  dispatchAdsConversionJob: vi.fn(),
}))
vi.mock("../src/integration/handlers/automated-response", () => ({
  processAutomatedResponse: vi.fn(),
}))
vi.mock("../src/integration/handlers/challenge", () => ({
  runChallenge: vi.fn(),
}))
vi.mock("../src/integration/handlers/coexist/attachment-download", () => ({
  coexistAttachmentDownload: vi.fn(),
}))
vi.mock("../src/integration/handlers/coexist/instagram-sync", () => ({
  coexistInstagramSync: vi.fn(),
}))
vi.mock("../src/integration/handlers/coexist/messenger-sync", () => ({
  coexistMessengerSync: vi.fn(),
}))
vi.mock("../src/integration/handlers/coexist/whatsapp-buffer", () => ({
  coexistWhatsappBuffer: vi.fn(),
}))
vi.mock("../src/integration/handlers/coexist/whatsapp-flush", () => ({
  coexistWhatsappFlush: vi.fn(),
}))
vi.mock("../src/integration/handlers/comment-automation", () => ({
  processCommentAutomation: vi.fn(),
}))
vi.mock("../src/integration/handlers/comment-automation/ai-reply", () => ({
  processCommentAIReply: vi.fn(),
}))
vi.mock("../src/integration/handlers/contact/update-avatar", () => ({
  updateContactAvatar: vi.fn(),
}))
vi.mock("../src/integration/handlers/conversation", () => ({
  agentMarkAsRead: vi.fn(),
  contactMarkAsRead: vi.fn(),
}))
vi.mock("../src/integration/handlers/flow", () => ({
  runFlowNode: vi.fn(),
  runFlowPostback: vi.fn(),
  runFlowQuickReply: vi.fn(),
}))
vi.mock("../src/integration/handlers/follow-up", () => ({
  runFollowUpResume: vi.fn(),
}))
vi.mock("../src/integration/handlers/inbox_labels", () => ({
  handleChannelLabelWebhook: vi.fn(),
}))
vi.mock("../src/integration/handlers/lead-ads", () => ({
  processLeadgen: vi.fn(),
}))
vi.mock("../src/integration/handlers/message-status", () => ({
  handleMessageStatus: vi.fn(),
}))
vi.mock(
  "../src/integration/handlers/meta-conversions/send-meta-capi-event",
  () => ({ handleSendMetaCapiEvent: vi.fn() }),
)
vi.mock("../src/integration/handlers/ref", () => ({
  runRef: vi.fn(),
}))
vi.mock("../src/integration/handlers/sequence-flow", () => ({
  handleSendSequenceFlow: vi.fn(),
}))
vi.mock("../src/integration/handlers/story-reply-automation", () => ({
  processStoryReplyAutomation: vi.fn(),
}))
vi.mock("../src/integration/handlers/template-flow-response", () => ({
  captureTemplateFlowResponse: vi.fn(),
}))
vi.mock("../src/integration/handlers/wait-resume", () => ({
  runWaitResume: vi.fn(),
}))

// ---------------------------------------------------------------------------
// receiveMessage's own dependencies — deliberately NOT mocking
// `../src/integration/handlers/received-message` itself (that is the module
// under test here), mirroring `received-message.test.ts`'s mock surface so
// the real pipeline — including the new post-save profile refresh call —
// runs for real.
// ---------------------------------------------------------------------------

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: mockCreateMessageRepository,
  contactInboxRepository: {
    findWithContact: mockFindContactInbox,
  },
}))

vi.mock("@chatbotx.io/automated-response", () => ({
  automatedResponseService: {
    enqueue: mockAutomatedResponseEnqueue,
    enqueueFlowAction: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    update: mockDbUpdate,
    query: { contactInboxModel: { findFirst: mockFindContactInbox } },
    $count: mockDbCount,
    transaction: mockDbTransaction,
  },
  eq: vi.fn((col: unknown, val: unknown) => ({ __eq: [col, val] })),
  findOrFail: vi.fn(),
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
// (packages/business/src/contact/profile-refresh/rules.ts), matching the
// convention already used in received-message.test.ts.
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
  appointmentService: { cancelAppointmentByToken: vi.fn() },
  broadcastToWorkspaceParty: vi.fn(),
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
  recordProfileRefreshFailure: vi.fn().mockResolvedValue(undefined),
  contactInboxService: {
    updateTracking: vi
      .fn()
      .mockResolvedValue({ cacheTags: ["contacts:contact-1:contact-inboxes"] }),
    invalidateTracking: vi.fn().mockResolvedValue(undefined),
    syncScopedIdentity: mockSyncScopedIdentity,
  },
  contactService: {
    unblockIfBlocked: mockContactUnblockIfBlocked,
    update: mockContactUpdate,
  },
  conversationService: {
    findOrCreate: mockConversationFindOrCreate,
    ensureActive: vi.fn().mockResolvedValue(true),
    recordInboundActivity: vi
      .fn()
      .mockResolvedValue({ cacheTags: ["contacts:contact-1:contact-inboxes"] }),
  },
  workspaceService: {
    find: vi.fn(),
    findById: vi.fn().mockResolvedValue({
      isActive: true,
      startTime: null,
      endTime: null,
      timezone: "UTC",
    }),
    isActiveNow: mockWorkspaceIsActiveNow,
  },
  quotaEnforcementService: {
    increment: vi.fn().mockResolvedValue(undefined),
    createNewContactWithMac: vi.fn(),
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
  emit: vi.fn().mockResolvedValue(undefined),
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
  isSourceUserIdKeyedIdentity: (identity: {
    sourceId: string
    sourceUserId?: string | null
  }) =>
    Boolean(identity.sourceUserId) &&
    identity.sourceId === identity.sourceUserId,
  getStoryReply: () => undefined,
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
  parseAppointmentCancelPostback: vi.fn().mockReturnValue(null),
  verifyAppointmentCancelPostback: vi.fn(),
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  isNoRedisEnv: () => true,
  defaultWorkerOptions: {
    concurrency: 5,
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
  getRedisConnection: () => ({}),
  closeIntegrationQueueEvents: vi.fn().mockResolvedValue(undefined),
  queueNames: { enum: { integration: "integration" } },
  ChatJobAction: { sendChatMessage: "sendChatMessage" },
  chatQueue: { add: vi.fn().mockResolvedValue(undefined) },
  IntegrationJobAction: {
    incomingMessage: "incomingMessage",
    runFlowPostback: "runFlowPostback",
    runFlowQuickReply: "runFlowQuickReply",
    runRef: "runRef",
  },
  integrationQueue: {
    add: vi.fn().mockResolvedValue(undefined),
    getJob: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

vi.mock("../src/lib/db", () => ({
  detectFlowVersion: vi.fn(),
}))

vi.mock("../src/services/integrations", () => ({
  allIntegrations: {
    messenger: { runChannelHandler: mockRunChannelHandler },
  },
  integrationService: {
    identifyInboxAndIntegrationAuthFromIdentifier: vi.fn(),
  },
  isInstagramViaFacebook: (row: { type?: string }) => row.type === "facebook",
  resolveIntegrationContextFromContactInbox:
    mockResolveIntegrationContextFromContactInbox,
}))

// ---------------------------------------------------------------------------
// Boot the real worker (side effect of importing worker.ts) and fixtures
// ---------------------------------------------------------------------------

await import("../src/integration/worker")
await vi.waitFor(() => {
  expect(workerState.capturedWorkers).toHaveLength(1)
})
const { integrationService } = await import("../src/services/integrations")

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

// Nameless — eligible for the post-save refresh (`hasEmptyProfileName`).
const fakeContact = {
  id: "contact-1",
  workspaceId: "ws-1",
  firstName: null,
  lastName: null,
  blockedAt: null,
} as unknown as import("@chatbotx.io/database/types").ContactModel

const fakeConversation = {
  id: "conv-1",
  workspaceId: "ws-1",
  contactId: "contact-1",
} as unknown as import("@chatbotx.io/database/types").ConversationModel

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("integration worker — incomingMessage case: profile refresh vs. automated-response dispatch ordering", () => {
  beforeEach(() => {
    mockCreateOrUpdate.mockReset()
    mockRunChannelHandler.mockReset()
    mockFindContactInbox.mockReset()
    mockContactProfileRefresh.mockReset()
    mockResolveIntegrationContextFromContactInbox.mockReset()
    mockResolveIncomingTextRouting.mockReset()
    mockAutomatedResponseEnqueue.mockClear()
    mockDbTransaction.mockClear()
    mockContactUpdate.mockClear()
    mockConversationFindOrCreate.mockReset()

    vi.mocked(
      integrationService.identifyInboxAndIntegrationAuthFromIdentifier,
    ).mockResolvedValue({
      inbox: fakeInbox,
      integrationRow: fakeIntegrationRow,
    } as never)
    mockFindContactInbox.mockResolvedValue({
      ...fakeContactInbox,
      contact: fakeContact,
    })
    mockConversationFindOrCreate.mockResolvedValue(fakeConversation)
    mockCreateMessageRepository.mockResolvedValue({
      createOrUpdate: mockCreateOrUpdate,
      createOrUpdateWithAttachments: vi.fn(),
    })
    mockCreateOrUpdate.mockResolvedValue({
      message: fakeCreatedMessage,
      isNew: true,
    })
    // The channel already parsed a plain inbound text message, no
    // postback/quickReply/ref/referral — the simplest path into
    // `resolveIncomingTextRouting`.
    mockRunChannelHandler.mockImplementation(
      (_domain: string, action: string) => {
        if (action === "getProfile") {
          return Promise.resolve({ firstName: "Jane", lastName: "Doe" })
        }
        return Promise.resolve({
          message: {
            sourceId: "msg-src-1",
            messageType: "incoming",
            text: "hello",
            contentType: "text",
            contentAttributes: {},
            attachments: [],
          },
          contact: { sourceId: "psid-123" },
          postbackAction: null,
          quickReplyAction: null,
          ref: null,
        })
      },
    )
    mockResolveIntegrationContextFromContactInbox.mockResolvedValue({
      integration: { runChannelHandler: mockRunChannelHandler },
      ctx: { workspaceId: "ws-1" },
    })
    // The real `contactProfileRefreshService.refresh` — mocked here, as
    // received-message.test.ts does — resolves `contactService.update`
    // (the marker this bullet cares about) as part of a successful
    // channelApi fetch, matching Task 1's real "updated" outcome.
    mockContactProfileRefresh.mockImplementation(async (input) => {
      await input.fetchProfile()
      await mockContactUpdate({ id: input.contactId }, {})
      return { status: "updated", contact: { id: input.contactId } }
    })
    mockResolveIncomingTextRouting.mockResolvedValue({
      type: "automatedResponse",
      conversation: fakeConversation,
    })
  })

  test("the refresh's contactService.update resolves before automatedResponseService.enqueue is invoked", async () => {
    const [integrationWorker] = workerState.capturedWorkers

    await integrationWorker?.processor({
      data: {
        type: "incomingMessage",
        data: {
          integrationType: "messenger",
          integrationIdentifier: "inbox-1",
          payload: {},
        },
      },
    })

    expect(mockContactProfileRefresh).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: "contact-1", source: "channelApi" }),
    )
    expect(mockAutomatedResponseEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({ contactInboxId: "ci-1" }),
    )
    // The refresh (and the `contactService.update` write inside it) is
    // awaited to completion inside `receiveMessage`, strictly before
    // `worker.ts`'s `incomingMessage` case goes on to call
    // `resolveIncomingTextRouting` and `automatedResponseService.enqueue` —
    // both invocation order AND resolution order are proven by these two
    // independent mocks only ever being called in this sequence.
    expect(mockContactUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      mockAutomatedResponseEnqueue.mock.invocationCallOrder[0],
    )
    expect(mockContactProfileRefresh.mock.invocationCallOrder[0]).toBeLessThan(
      mockResolveIncomingTextRouting.mock.invocationCallOrder[0],
    )
  })

  test("a named contact skips the refresh entirely but automated-response dispatch still runs", async () => {
    mockFindContactInbox.mockResolvedValue({
      ...fakeContactInbox,
      contact: { ...fakeContact, firstName: "Already Named" },
    })
    const [integrationWorker] = workerState.capturedWorkers

    await integrationWorker?.processor({
      data: {
        type: "incomingMessage",
        data: {
          integrationType: "messenger",
          integrationIdentifier: "inbox-1",
          payload: {},
        },
      },
    })

    expect(mockContactProfileRefresh).not.toHaveBeenCalled()
    expect(mockAutomatedResponseEnqueue).toHaveBeenCalled()
  })
})
