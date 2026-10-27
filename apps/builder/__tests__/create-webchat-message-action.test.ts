// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockAutomatedResponseEnqueue,
  mockAutomatedResponseEnqueueFlowAction,
  mockChatQueueAdd,
  mockCheckGuestRateLimit,
  mockContactFindById,
  mockContactInboxFindLatest,
  mockContactUnblockIfBlocked,
  mockConversationEnsureActive,
  mockConversationFindBy,
  mockConversationRecordGuestInboundRead,
  mockCreateIncoming,
  mockCreateWebchatGuestContact,
  mockEmit,
  mockFindWebchat,
  mockIntegrationQueueAdd,
  mockVerifyWebchatAccessToken,
  mockWorkspaceFind,
} = vi.hoisted(() => ({
  mockAutomatedResponseEnqueue: vi.fn().mockResolvedValue(undefined),
  mockAutomatedResponseEnqueueFlowAction: vi.fn().mockResolvedValue(undefined),
  mockChatQueueAdd: vi.fn().mockResolvedValue(undefined),
  mockCheckGuestRateLimit: vi
    .fn()
    .mockResolvedValue({ limited: false, retryAfter: 10 }),
  mockContactFindById: vi.fn(),
  mockContactInboxFindLatest: vi.fn(),
  mockContactUnblockIfBlocked: vi.fn().mockResolvedValue(null),
  mockConversationEnsureActive: vi.fn().mockResolvedValue(false),
  mockConversationFindBy: vi.fn(),
  mockConversationRecordGuestInboundRead: vi.fn().mockResolvedValue(undefined),
  mockCreateIncoming: vi.fn(),
  mockCreateWebchatGuestContact: vi.fn(),
  mockEmit: vi.fn(),
  mockFindWebchat: vi.fn(),
  mockIntegrationQueueAdd: vi.fn().mockResolvedValue(undefined),
  mockVerifyWebchatAccessToken: vi.fn().mockResolvedValue({
    authorized: true,
    originHost: null,
  }),
  mockWorkspaceFind: vi.fn().mockResolvedValue({ ownerId: "owner-1" }),
}))

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
  isWorkspaceScheduledForDeletion: (
    workspace:
      | { scheduledDeletionAt?: Date | string | null }
      | null
      | undefined,
  ) => Boolean(workspace?.scheduledDeletionAt),
  integrationWebchatService: {
    findByIdForWorkspace: mockFindWebchat,
  },
  contactInboxService: {
    findLatestBySource: mockContactInboxFindLatest,
  },
  contactService: {
    findById: mockContactFindById,
    unblockIfBlocked: mockContactUnblockIfBlocked,
  },
  conversationService: {
    ensureActive: mockConversationEnsureActive,
    findBy: mockConversationFindBy,
    recordGuestInboundRead: mockConversationRecordGuestInboundRead,
  },
  createWebchatGuestContact: mockCreateWebchatGuestContact,
  messageService: { createIncoming: mockCreateIncoming },
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
  getGuestRequestHeaders: vi.fn(() => new Headers()),
}))

vi.mock("@/features/integration-webchat/lib/webchat-access-token", () => ({
  authorizeWebchatGuestRequest: mockVerifyWebchatAccessToken,
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
  db: { update: vi.fn() },
  eq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  findOrFail: vi.fn(),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings,
    values,
  })),
}))

vi.mock("@chatbotx.io/database/schema", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/database/schema")>()
  return {
    ...actual,
    contactInboxModel: {
      ...actual.contactInboxModel,
      id: "contactInboxId",
      firstInteractionAt: "firstInteractionAt",
    },
    contactModel: { ...actual.contactModel, id: "contactId" },
    conversationModel: { ...actual.conversationModel, id: "conversationId" },
  }
})

vi.mock("@chatbotx.io/event-bus", () => ({
  emit: mockEmit,
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

vi.mock("@chatbotx.io/partysocket-config", () => ({
  RealtimeEventType: { messageCreated: "messageCreated" },
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
  mockFindWebchat.mockResolvedValue({
    inboxId: "inbox-1",
    authorizedDomains: [],
    persistentMenus: [],
  })
  mockConversationFindBy.mockResolvedValue(conversation)
  mockContactFindById.mockResolvedValue(contact)
  mockContactUnblockIfBlocked.mockResolvedValue(null)
  mockCreateIncoming.mockImplementation(({ message }) =>
    Promise.resolve({
      id: "msg-1",
      ...message,
      attachments: [],
      sourceId: null,
      updatedAt: message.createdAt,
    }),
  )
  mockCreateWebchatGuestContact.mockResolvedValue({
    ok: true,
    value: { contact, contactInbox, conversation },
  })
  mockChatQueueAdd.mockResolvedValue(undefined)
  mockCheckGuestRateLimit.mockResolvedValue({ limited: false, retryAfter: 10 })
  mockVerifyWebchatAccessToken.mockResolvedValue({
    authorized: true,
  })
  mockWorkspaceFind.mockResolvedValue({ ownerId: "owner-1" })
}

describe("handleCreateWebchatMessage", () => {
  beforeEach(() => {
    resetCommonMocks()
    mockContactInboxFindLatest.mockResolvedValue(contactInbox)
  })

  test("records guest inbound read and activity timestamps after creating a webchat message", async () => {
    await handleCreateWebchatMessage({
      parsedInput: {
        text: "hello",
        workspaceId: "ws-1",
        webchatId: "webchat-1",
        guestConversationId: "guest-1",
      },
    })

    const messageInput = mockCreateIncoming.mock.calls[0]?.[0].message as {
      createdAt: Date
    }
    expect(mockConversationRecordGuestInboundRead).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      contactInboxId: "ci-1",
      contactId: "contact-1",
      at: messageInput.createdAt,
      lastActivityAt: messageInput.createdAt,
      data: {
        firstInteractionAt: messageInput.createdAt,
        contactLastReadAt: messageInput.createdAt,
        lastMessageAt: messageInput.createdAt,
        lastIncomingMessageAt: messageInput.createdAt,
        lastUserInput: "hello",
        lastUserInputType: "text",
      },
    })
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

  test("passes webchat contact-inbox tracking through the atomic guest-read update", async () => {
    await handleCreateWebchatMessage({
      parsedInput: {
        text: "hello",
        workspaceId: "ws-1",
        webchatId: "webchat-1",
        guestConversationId: "guest-1",
      },
    })

    const messageInput = mockCreateIncoming.mock.calls[0]?.[0].message as {
      createdAt: Date
    }
    expect(mockConversationRecordGuestInboundRead).toHaveBeenCalledWith(
      expect.objectContaining({
        contactInboxId: "ci-1",
        contactId: "contact-1",
        data: {
          firstInteractionAt: messageInput.createdAt,
          contactLastReadAt: messageInput.createdAt,
          lastMessageAt: messageInput.createdAt,
          lastIncomingMessageAt: messageInput.createdAt,
          lastUserInput: "hello",
          lastUserInputType: "text",
        },
      }),
    )
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

  test("rejects an unauthorized webchat request before resolving conversations", async () => {
    mockVerifyWebchatAccessToken.mockResolvedValue({
      authorized: false,
      originHost: null,
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
    mockFindWebchat.mockResolvedValue({
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
    mockFindWebchat.mockResolvedValue({
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

describe("handleCreateWebchatMessage — guest contact creation", () => {
  beforeEach(() => {
    resetCommonMocks()
  })

  const input = {
    text: "hello",
    workspaceId: "ws-1",
    webchatId: "webchat-1",
    guestConversationId: "guest-1",
  }

  test("does not create a guest contact for an existing webchat inbox", async () => {
    mockContactInboxFindLatest.mockResolvedValue(contactInbox)

    await handleCreateWebchatMessage({ parsedInput: input })

    expect(mockCreateWebchatGuestContact).not.toHaveBeenCalled()
  })

  test("creates a new guest contact through the business service", async () => {
    mockContactInboxFindLatest.mockResolvedValue(undefined)

    await handleCreateWebchatMessage({ parsedInput: input })

    expect(mockWorkspaceFind).toHaveBeenCalledWith({ where: { id: "ws-1" } })
    expect(mockCreateWebchatGuestContact).toHaveBeenCalledWith({
      ownerId: "owner-1",
      workspaceId: "ws-1",
      inboxId: "inbox-1",
      sourceId: "guest-1",
      profile: {
        locale: undefined,
        timezone: undefined,
        webchatParentUrl: undefined,
      },
    })
  })

  test("queues the configured welcome flow for a new contact", async () => {
    mockContactInboxFindLatest.mockResolvedValue(undefined)
    mockFindWebchat.mockResolvedValue({
      inboxId: "inbox-1",
      authorizedDomains: [],
      welcomeFlowId: "flow-1",
    })

    await handleCreateWebchatMessage({
      parsedInput: {
        ...input,
        init: true,
      },
    })

    expect(mockIntegrationQueueAdd).toHaveBeenCalledWith(
      "sendFlow",
      expect.objectContaining({
        type: "sendFlow",
        data: expect.objectContaining({
          conversationId: expect.objectContaining({ id: "conv-1" }),
          contactInboxId: expect.objectContaining({ id: "ci-1" }),
          flowId: "flow-1",
          origin: "channel",
        }),
      }),
    )
  })

  test("does not queue a welcome flow when it is not configured", async () => {
    mockContactInboxFindLatest.mockResolvedValue(undefined)

    await handleCreateWebchatMessage({
      parsedInput: {
        ...input,
        init: true,
      },
    })

    expect(mockIntegrationQueueAdd).not.toHaveBeenCalledWith(
      "sendFlow",
      expect.anything(),
    )
  })

  test("rejects when the business service reports that the MAC limit is reached", async () => {
    mockContactInboxFindLatest.mockResolvedValue(undefined)
    mockCreateWebchatGuestContact.mockResolvedValue({
      ok: false,
      level: "user",
    })

    await expect(
      handleCreateWebchatMessage({ parsedInput: input }),
    ).rejects.toMatchObject({
      message: "Contact limit reached",
      code: "quotaExceeded",
    })
  })

  test("passes locale and timezone to the guest contact service", async () => {
    mockContactInboxFindLatest.mockResolvedValue(undefined)

    await handleCreateWebchatMessage({
      parsedInput: {
        ...input,
        locale: "vi-VN",
        timezone: "Asia/Ho_Chi_Minh",
      },
    })

    expect(mockCreateWebchatGuestContact).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: {
          locale: "vi-VN",
          timezone: "Asia/Ho_Chi_Minh",
          webchatParentUrl: undefined,
        },
      }),
    )
  })

  test("does not create a contact for an existing webchat inbox with profile data", async () => {
    mockContactInboxFindLatest.mockResolvedValue(contactInbox)

    await handleCreateWebchatMessage({
      parsedInput: {
        ...input,
        locale: "vi-VN",
        timezone: "Asia/Ho_Chi_Minh",
      },
    })

    expect(mockCreateWebchatGuestContact).not.toHaveBeenCalled()
  })
})
