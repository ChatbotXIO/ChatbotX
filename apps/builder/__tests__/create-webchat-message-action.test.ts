// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  insertBuilder,
  mockAutomatedResponseEnqueue,
  mockAutomatedResponseEnqueueFlowAction,
  mockQueueWorkspaceRealtimeEvent,
  mockChatQueueAdd,
  mockCheckGuestRateLimit,
  mockContactFindById,
  mockContactInboxFindLatest,
  mockContactInboxUpdateTracking,
  mockContactUnblockIfBlocked,
  mockConversationEnsureActive,
  mockConversationFindBy,
  mockCreateMessageRepository,
  mockCreateNewContactWithMac,
  mockDbUpdate,
  mockEmit,
  mockEmitContactCreated,
  mockFindOrCreateGuestConversation,
  mockFindOrFail,
  mockFindWebchatByIdForWorkspace,
  mockIntegrationQueueAdd,
  mockQuotaIncrement,
  mockRecordInboundActivity,
  mockRepositoryCreate,
  mockVerifyWebchatAccessToken,
  mockWorkspaceFind,
  tx,
  updateBuilder,
} = vi.hoisted(() => {
  const updateBuilder = {
    set: vi.fn(),
    where: vi.fn(),
  }
  updateBuilder.set.mockReturnValue(updateBuilder)
  updateBuilder.where.mockResolvedValue(undefined)

  const insertBuilder = {
    values: vi.fn(),
    returning: vi.fn(),
  }
  insertBuilder.values.mockReturnValue(insertBuilder)

  const tx = {
    insert: vi.fn().mockReturnValue(insertBuilder),
  }

  const mockRepositoryCreate = vi.fn()

  return {
    insertBuilder,
    mockAutomatedResponseEnqueue: vi.fn().mockResolvedValue(undefined),
    mockAutomatedResponseEnqueueFlowAction: vi
      .fn()
      .mockResolvedValue(undefined),
    mockQueueWorkspaceRealtimeEvent: vi.fn().mockResolvedValue(undefined),
    mockChatQueueAdd: vi.fn().mockResolvedValue(undefined),
    mockCheckGuestRateLimit: vi
      .fn()
      .mockResolvedValue({ limited: false, retryAfter: 10 }),
    mockContactFindById: vi.fn(),
    mockContactInboxFindLatest: vi.fn(),
    mockContactInboxUpdateTracking: vi.fn().mockResolvedValue(null),
    mockContactUnblockIfBlocked: vi.fn().mockResolvedValue(null),
    mockConversationEnsureActive: vi.fn().mockResolvedValue(false),
    mockConversationFindBy: vi.fn(),
    mockCreateMessageRepository: vi.fn().mockResolvedValue({
      create: mockRepositoryCreate,
      createWithAttachments: vi.fn(),
    }),
    mockCreateNewContactWithMac: vi.fn(
      async (args: {
        create: (tx: unknown) => Promise<{ value: unknown }>
      }): Promise<
        { ok: true; value: unknown } | { ok: false; level: string }
      > => {
        const created = await args.create(tx)
        return { ok: true, value: created.value }
      },
    ),
    mockDbUpdate: vi.fn().mockReturnValue(updateBuilder),
    mockEmit: vi.fn(),
    mockEmitContactCreated: vi.fn().mockResolvedValue(undefined),
    mockFindOrCreateGuestConversation: vi.fn(),
    mockFindOrFail: vi.fn(),
    mockFindWebchatByIdForWorkspace: vi.fn(),
    mockIntegrationQueueAdd: vi.fn().mockResolvedValue(undefined),
    mockQuotaIncrement: vi.fn().mockResolvedValue(undefined),
    mockRecordInboundActivity: vi.fn().mockResolvedValue(null),
    mockRepositoryCreate,
    mockVerifyWebchatAccessToken: vi.fn().mockResolvedValue({
      authorized: true,
      guestConversationId: "workspace-1:guest-1",
    }),
    mockWorkspaceFind: vi.fn().mockResolvedValue({ ownerId: "owner-1" }),
    tx,
    updateBuilder,
  }
})

vi.mock("@/lib/safe-action", () => ({
  actionClient: {
    inputSchema: vi.fn(() => ({
      action: vi.fn(),
    })),
  },
}))

vi.mock("@chatbotx.io/automated-response", () => ({
  automatedResponseService: {
    enqueue: mockAutomatedResponseEnqueue,
    enqueueFlowAction: mockAutomatedResponseEnqueueFlowAction,
  },
}))

vi.mock("@chatbotx.io/business", () => ({
  queueWorkspaceRealtimeEvent: mockQueueWorkspaceRealtimeEvent,
  isWorkspaceScheduledForDeletion: (
    workspace:
      | { scheduledDeletionAt?: Date | string | null }
      | null
      | undefined,
  ) => Boolean(workspace?.scheduledDeletionAt),
  contactInboxService: {
    findLatestBySource: mockContactInboxFindLatest,
    updateTracking: mockContactInboxUpdateTracking,
  },
  contactService: {
    findById: mockContactFindById,
    unblockIfBlocked: mockContactUnblockIfBlocked,
  },
  conversationService: {
    ensureActive: mockConversationEnsureActive,
    findBy: mockConversationFindBy,
    recordInboundActivity: mockRecordInboundActivity,
  },
  integrationWebchatService: {
    findByIdForWorkspace: mockFindWebchatByIdForWorkspace,
    findOrCreateGuestConversation: mockFindOrCreateGuestConversation,
  },
  messageCleanupService: {
    cancelByInboxSource: vi.fn().mockResolvedValue(undefined),
  },
  messageService: {
    create: mockRepositoryCreate,
  },
  quotaEnforcementService: {
    increment: mockQuotaIncrement,
    createNewContactWithMac: mockCreateNewContactWithMac,
  },
  resolveTenantSettings: vi
    .fn()
    .mockResolvedValue({ storageUrl: "https://storage.example.com" }),
  workspaceService: { find: mockWorkspaceFind },
}))
vi.mock("@/lib/log", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

vi.mock("@/lib/rate-limit/guest-rate-limit", () => ({
  checkGuestRateLimit: mockCheckGuestRateLimit,
  getGuestClientIp: vi.fn(() => "192.0.2.1"),
}))

vi.mock("@/features/integration-webchat/lib/webchat-access-token", () => ({
  verifyWebchatAccessToken: mockVerifyWebchatAccessToken,
}))

const PROTOCOL_PREFIX_REGEX = /^https?:\/\//
const HOST_DELIMITER_REGEX = /[/:?#]/

vi.mock("@/features/integration-webchat/lib/authorized-domain", () => ({
  isOriginAuthorized: (
    origin: string | null | undefined,
    authorizedDomains: string[],
  ) => {
    if (!origin) {
      return true
    }
    if (authorizedDomains.length === 0) {
      return false
    }
    const host = origin
      .replace(PROTOCOL_PREFIX_REGEX, "")
      .split(HOST_DELIMITER_REGEX)[0]
    return authorizedDomains.some(
      (domain) => host === domain || host?.endsWith(`.${domain}`),
    )
  },
}))

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn((namespace?: string) => {
    const messages: Record<string, string> = {
      "webchat.rateLimitExceeded":
        "Too many requests. Please try again in a moment.",
      "webchat.unauthorizedDomain.description":
        "This website is not authorized to load this chat widget.",
    }

    return Promise.resolve(
      (key: string) => messages[namespace ? `${namespace}.${key}` : key] ?? key,
    )
  }),
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {
    code: string
    httpStatusCode: number
    constructor(message: string, code = "systemError", httpStatusCode = 400) {
      super(message)
      this.code = code
      this.httpStatusCode = httpStatusCode
    }
  },
}))

vi.mock("@chatbotx.io/business/utils", () => ({
  getPublicFileUrl: vi.fn((path: string, base: string) => `${base}/${path}`),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    update: mockDbUpdate,
  },
  eq: vi.fn((col: unknown, val: unknown) => ({ __eq: [col, val] })),
  findOrFail: mockFindOrFail,
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings,
    values,
  })),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: mockCreateMessageRepository,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactInboxModel: {
    id: "contactInboxId",
    firstInteractionAt: "firstInteractionAt",
  },
  contactModel: { id: "contactId" },
  conversationModel: { id: "conversationId" },
  integrationWebchatModel: { id: "integrationWebchatId" },
}))

vi.mock("@chatbotx.io/event-bus", () => ({
  emit: mockEmit,
}))

vi.mock("@chatbotx.io/events", () => ({
  emitContactCreated: mockEmitContactCreated,
}))

vi.mock("@chatbotx.io/filesystem", () => ({
  uploadMultipleFiles: vi.fn(),
}))

vi.mock("@chatbotx.io/flow-config", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/flow-config")>()
  return {
    ...actual,
    messageEventTypeSchema: {
      enum: { "message:received": "message:received" },
    },
  }
})

vi.mock("@chatbotx.io/realtime-protocol", () => ({
  RealtimeEventType: { messageCreated: "messageCreated" },
  routeForConversation: vi.fn(),
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return { ...actual, createId: vi.fn(() => "generated-id") }
})

vi.mock("@chatbotx.io/worker-config", () => ({
  ChatJobAction: { broadcastEvent: "broadcastEvent" },
  chatQueue: { add: mockChatQueueAdd },
  IntegrationJobAction: {
    runChallenge: "runChallenge",
    runFlowPostback: "runFlowPostback",
    runRef: "runRef",
    sendFlow: "sendFlow",
  },
  integrationQueue: { add: mockIntegrationQueueAdd },
}))

const { handleCreateWebchatMessage } = await import(
  "../src/features/messages/actions/create-webchat-message.action"
)

const conversation = {
  id: "conv-1",
  workspaceId: "ws-1",
  contactId: "contact-1",
  additionalAttributes: null,
}
const contactInbox = {
  id: "ci-1",
  inboxId: "inbox-1",
  contactId: "contact-1",
  sourceId: "guest-1",
  source: "webchat",
  channel: "webchat",
}
const contact = {
  id: "contact-1",
  createdAt: new Date("2026-01-01T00:00:00Z"),
}

const resetCommonMocks = () => {
  vi.clearAllMocks()
  updateBuilder.set.mockReturnValue(updateBuilder)
  updateBuilder.where.mockResolvedValue(undefined)
  mockDbUpdate.mockReturnValue(updateBuilder)
  mockFindOrFail.mockResolvedValue({
    inboxId: "inbox-1",
    authorizedDomains: [],
    persistentMenus: [],
  })
  mockConversationFindBy.mockResolvedValue(conversation)
  mockContactFindById.mockResolvedValue(contact)
  mockContactUnblockIfBlocked.mockResolvedValue(null)
  mockRepositoryCreate.mockImplementation((input) =>
    Promise.resolve({
      id: "msg-1",
      ...input,
      sourceId: null,
      updatedAt: input.createdAt,
    }),
  )
  mockCreateMessageRepository.mockResolvedValue({
    create: mockRepositoryCreate,
    createWithAttachments: vi.fn(),
  })
  mockChatQueueAdd.mockResolvedValue(undefined)
  mockQueueWorkspaceRealtimeEvent.mockResolvedValue(undefined)
  tx.insert.mockReturnValue(insertBuilder)
  insertBuilder.values.mockReturnValue(insertBuilder)
  insertBuilder.returning.mockReset()
  mockQuotaIncrement.mockResolvedValue(undefined)
  mockCheckGuestRateLimit.mockResolvedValue({ limited: false, retryAfter: 10 })
  mockVerifyWebchatAccessToken.mockResolvedValue({
    authorized: true,
  })
  mockWorkspaceFind.mockResolvedValue({ ownerId: "owner-1" })
  mockFindOrFail.mockResolvedValue({
    inboxId: "inbox-1",
    authorizedDomains: [],
    persistentMenus: [],
  })
  mockFindWebchatByIdForWorkspace.mockImplementation(() => mockFindOrFail())
  mockFindOrCreateGuestConversation.mockResolvedValue({
    conversation,
    contact,
    contactInbox,
  })
  mockCreateNewContactWithMac.mockImplementation(
    async (args: { create: (tx: unknown) => Promise<{ value: unknown }> }) => {
      const created = await args.create(tx)
      return { ok: true, value: created.value }
    },
  )
}

describe("handleCreateWebchatMessage", () => {
  beforeEach(() => {
    resetCommonMocks()
    mockContactInboxFindLatest.mockResolvedValue(contactInbox)
  })

  test("broadcasts the created message with the client's clientId for optimistic reconciliation", async () => {
    await handleCreateWebchatMessage({
      parsedInput: {
        text: "hello",
        workspaceId: "ws-1",
        webchatId: "webchat-1",
        guestConversationId: "guest-1",
        clientId: "client-1",
      },
    })

    expect(mockQueueWorkspaceRealtimeEvent).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({
        eventType: "messageCreated",
        data: expect.objectContaining({
          id: "msg-1",
          clientId: "client-1",
        }),
      }),
    )
  })

  test("rejects messages when the workspace is scheduled for deletion", async () => {
    mockWorkspaceFind.mockResolvedValue({
      id: "ws-1",
      ownerId: "owner-1",
      scheduledDeletionAt: new Date(),
    })

    await expect(
      handleCreateWebchatMessage({
        parsedInput: {
          text: "hello",
          workspaceId: "ws-1",
          webchatId: "webchat-1",
          guestConversationId: "guest-1",
        },
      }),
    ).rejects.toMatchObject({
      code: "workspaceScheduledDeletion",
    })

    expect(mockVerifyWebchatAccessToken).not.toHaveBeenCalled()
  })

  test("auto-unblocks using the resolved contact row after creating an inbound message", async () => {
    await handleCreateWebchatMessage({
      parsedInput: {
        text: "hello",
        workspaceId: "ws-1",
        webchatId: "webchat-1",
        guestConversationId: "guest-1",
      },
    })

    expect(mockContactUnblockIfBlocked).toHaveBeenCalledWith(
      { workspaceId: "ws-1", id: "contact-1" },
      contact,
    )
  })

  test("enqueues automated response with workspace context for active text messages", async () => {
    mockConversationEnsureActive.mockResolvedValue(true)

    await handleCreateWebchatMessage({
      parsedInput: {
        text: "hello",
        workspaceId: "ws-1",
        webchatId: "webchat-1",
        guestConversationId: "guest-1",
      },
    })

    expect(mockAutomatedResponseEnqueue).toHaveBeenCalledWith({
      conversationId: "conv-1",
      contactInboxId: "ci-1",
      messageId: "msg-1",
      messageText: "hello",
      workspaceId: "ws-1",
    })
  })

  test("enqueues webchat postbacks through flow action debounce", async () => {
    await handleCreateWebchatMessage({
      parsedInput: {
        text: "clicked",
        postback: "button-a",
        workspaceId: "ws-1",
        webchatId: "webchat-1",
        guestConversationId: "guest-1",
      },
    })

    expect(mockAutomatedResponseEnqueueFlowAction).toHaveBeenCalledWith({
      kind: "postback",
      data: {
        conversationId: conversation,
        contactInboxId: contactInbox,
        action: "button-a",
      },
    })
    expect(mockAutomatedResponseEnqueue).not.toHaveBeenCalled()
  })

  test("rejects unauthorized webchat origins before resolving conversations", async () => {
    mockFindOrFail.mockResolvedValue({
      inboxId: "inbox-1",
      authorizedDomains: ["example.com"],
    })

    await expect(
      handleCreateWebchatMessage({
        parsedInput: {
          text: "hello",
          workspaceId: "ws-1",
          webchatId: "webchat-1",
          guestConversationId: "guest-1",
          parentOrigin: "https://attacker.test",
        },
      }),
    ).rejects.toMatchObject({
      code: "forbidden",
      httpStatusCode: 403,
    })

    expect(mockContactInboxFindLatest).not.toHaveBeenCalled()
  })

  test("rejects an invalid access token even when no authorizedDomains are configured", async () => {
    // Bind-on-first-use: the token must always verify, regardless of
    // whether the webchat has an authorizedDomains allowlist configured.
    mockVerifyWebchatAccessToken.mockResolvedValue({
      authorized: false,
    })

    await expect(
      handleCreateWebchatMessage({
        parsedInput: {
          text: "hello",
          workspaceId: "ws-1",
          webchatId: "webchat-1",
          guestConversationId: "guest-1",
        },
      }),
    ).rejects.toMatchObject({
      code: "forbidden",
      httpStatusCode: 403,
    })

    expect(mockContactInboxFindLatest).not.toHaveBeenCalled()
  })
})

describe("handleCreateWebchatMessage — flowId", () => {
  beforeEach(() => {
    resetCommonMocks()
    mockContactInboxFindLatest.mockResolvedValue(contactInbox)
  })

  test("rejects a flowId that is not configured as a persistent menu flow (flow injection / IDOR)", async () => {
    mockFindOrFail.mockResolvedValue({
      inboxId: "inbox-1",
      authorizedDomains: [],
      persistentMenus: [
        { label: "Talk to sales", type: "flow", flowId: "flow-allowed" },
      ],
    })

    await expect(
      handleCreateWebchatMessage({
        parsedInput: {
          flowId: "flow-attacker",
          workspaceId: "ws-1",
          webchatId: "webchat-1",
          guestConversationId: "guest-1",
        },
      }),
    ).rejects.toMatchObject({
      code: "notFound",
      httpStatusCode: 404,
    })

    expect(mockIntegrationQueueAdd).not.toHaveBeenCalled()
  })

  test("enqueues a flowId that matches a configured persistent menu flow", async () => {
    mockFindOrFail.mockResolvedValue({
      inboxId: "inbox-1",
      authorizedDomains: [],
      persistentMenus: [
        { label: "Talk to sales", type: "flow", flowId: "flow-allowed" },
      ],
    })

    await handleCreateWebchatMessage({
      parsedInput: {
        flowId: "flow-allowed",
        workspaceId: "ws-1",
        webchatId: "webchat-1",
        guestConversationId: "guest-1",
      },
    })

    expect(mockIntegrationQueueAdd).toHaveBeenCalledWith(
      "sendFlow",
      expect.objectContaining({
        type: "sendFlow",
        data: expect.objectContaining({
          conversationId: expect.objectContaining({ id: "conv-1" }),
          contactInboxId: expect.objectContaining({ id: "ci-1" }),
          flowId: "flow-allowed",
          origin: "channel",
        }),
      }),
    )
  })
})

describe("handleCreateWebchatMessage — MAC quota", () => {
  beforeEach(() => {
    resetCommonMocks()
  })

  const input = {
    text: "hello",
    workspaceId: "ws-1",
    webchatId: "webchat-1",
    guestConversationId: "guest-1",
  }

  test("does not touch quota for an existing contact", async () => {
    mockContactInboxFindLatest.mockResolvedValue(contactInbox)

    await handleCreateWebchatMessage({ parsedInput: input })

    expect(mockCreateNewContactWithMac).not.toHaveBeenCalled()
    expect(mockQuotaIncrement).not.toHaveBeenCalled()
  })

  test("does not requeue the welcome flow for a returning visitor", async () => {
    mockContactInboxFindLatest.mockResolvedValue(contactInbox)
    mockFindOrFail.mockResolvedValue({
      inboxId: "inbox-1",
      authorizedDomains: [],
      welcomeFlowId: "flow-1",
    })

    await handleCreateWebchatMessage({ parsedInput: input })

    expect(mockEmitContactCreated).not.toHaveBeenCalled()
    expect(mockIntegrationQueueAdd).not.toHaveBeenCalled()
  })

  test("does not create a contact for existing webchat inbox even with payload locale and timezone", async () => {
    mockContactInboxFindLatest.mockResolvedValue(contactInbox)

    await handleCreateWebchatMessage({
      parsedInput: {
        ...input,
        locale: "vi-VN",
        timezone: "Asia/Ho_Chi_Minh",
      },
    })

    expect(tx.insert).not.toHaveBeenCalled()
  })
})
