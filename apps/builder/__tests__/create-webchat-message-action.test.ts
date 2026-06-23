// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  insertBuilder,
  mockAutomatedResponseEnqueue,
  mockChatQueueAdd,
  mockContactFindById,
  mockContactInboxFindLatest,
  mockConversationEnsureActive,
  mockConversationFindBy,
  mockCreateMessageRepository,
  mockCreateNewContactWithMac,
  mockDbUpdate,
  mockEmit,
  mockFindOrFail,
  mockIntegrationQueueAdd,
  mockQuotaIncrement,
  mockRepositoryCreate,
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

  // The transaction handed to the `createNewContactWithMac` create callback.
  const tx = {
    insert: vi.fn().mockReturnValue(insertBuilder),
  }

  const mockRepositoryCreate = vi.fn()

  return {
    insertBuilder,
    mockAutomatedResponseEnqueue: vi.fn().mockResolvedValue(undefined),
    mockContactFindById: vi.fn(),
    mockContactInboxFindLatest: vi.fn(),
    mockConversationFindBy: vi.fn(),
    mockChatQueueAdd: vi.fn().mockResolvedValue(undefined),
    mockConversationEnsureActive: vi.fn().mockResolvedValue(false),
    mockCreateMessageRepository: vi.fn().mockResolvedValue({
      create: mockRepositoryCreate,
      createWithAttachments: vi.fn(),
    }),
    // Default: behave like an under-limit owner — run the create callback in
    // the fake transaction and report success.
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
    mockFindOrFail: vi.fn(),
    mockIntegrationQueueAdd: vi.fn().mockResolvedValue(undefined),
    mockQuotaIncrement: vi.fn().mockResolvedValue(undefined),
    mockRepositoryCreate,
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
  automatedResponseService: { enqueue: mockAutomatedResponseEnqueue },
}))

vi.mock("@chatbotx.io/business", () => ({
  contactInboxService: { findLatestBySource: mockContactInboxFindLatest },
  contactService: { findById: mockContactFindById },
  conversationService: {
    ensureActive: mockConversationEnsureActive,
    findBy: mockConversationFindBy,
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
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: mockCreateMessageRepository,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactInboxModel: { id: "contactInboxId" },
  contactModel: { id: "contactId" },
  conversationModel: { id: "conversationId" },
  integrationWebchatModel: { id: "integrationWebchatId" },
}))

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
  updateBuilder.set.mockReturnValue(updateBuilder)
  updateBuilder.where.mockResolvedValue(undefined)
  mockDbUpdate.mockReturnValue(updateBuilder)
  mockFindOrFail.mockResolvedValue({ inboxId: "inbox-1" })
  mockConversationFindBy.mockResolvedValue(conversation)
  mockContactFindById.mockResolvedValue(contact)
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
  tx.insert.mockReturnValue(insertBuilder)
  insertBuilder.values.mockReturnValue(insertBuilder)
  insertBuilder.returning.mockReset()
  mockQuotaIncrement.mockResolvedValue(undefined)
  mockWorkspaceFind.mockResolvedValue({ ownerId: "owner-1" })
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

  test("updates conversation read and activity timestamps from the created webchat message", async () => {
    await handleCreateWebchatMessage({
      parsedInput: {
        text: "hello",
        workspaceId: "ws-1",
        webchatId: "webchat-1",
        guestConversationId: "guest-1",
      },
    })

    const messageInput = mockRepositoryCreate.mock.calls[0]?.[0] as {
      createdAt: Date
    }
    expect(updateBuilder.set).toHaveBeenNthCalledWith(1, {
      contactLastReadAt: messageInput.createdAt,
      lastActivityAt: messageInput.createdAt,
      contactRepliedAt: messageInput.createdAt,
    })
  })

  test("updates webchat contact inbox message, incoming message, and read timestamps", async () => {
    await handleCreateWebchatMessage({
      parsedInput: {
        text: "hello",
        workspaceId: "ws-1",
        webchatId: "webchat-1",
        guestConversationId: "guest-1",
      },
    })

    const messageInput = mockRepositoryCreate.mock.calls[0]?.[0] as {
      createdAt: Date
    }
    expect(updateBuilder.set).toHaveBeenNthCalledWith(2, {
      contactLastReadAt: messageInput.createdAt,
      lastMessageAt: messageInput.createdAt,
      lastIncomingMessageAt: messageInput.createdAt,
    })
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

  const seedNewContactInserts = () => {
    insertBuilder.returning
      .mockResolvedValueOnce([
        {
          id: "contact-new",
          workspaceId: "ws-1",
          createdAt: new Date("2026-06-21T00:00:00Z"),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "ci-new",
          inboxId: "inbox-1",
          contactId: "contact-new",
          sourceId: "guest-1",
          source: "webchat",
          channel: "webchat",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "conv-new",
          workspaceId: "ws-1",
          contactId: "contact-new",
          additionalAttributes: null,
        },
      ])
  }

  test("does not touch quota for an existing contact", async () => {
    mockContactInboxFindLatest.mockResolvedValue(contactInbox)

    await handleCreateWebchatMessage({ parsedInput: input })

    expect(mockCreateNewContactWithMac).not.toHaveBeenCalled()
    expect(mockQuotaIncrement).not.toHaveBeenCalled()
  })

  test("gates a new contact through the atomic MAC chokepoint", async () => {
    mockContactInboxFindLatest.mockResolvedValue(undefined)
    seedNewContactInserts()

    await handleCreateWebchatMessage({ parsedInput: input })

    expect(mockWorkspaceFind).toHaveBeenCalledWith({ where: { id: "ws-1" } })
    // MAC is gated + consumed atomically with the insert (owner-derived). The
    // info-only `contacts` counter is recorded inside this chokepoint too, so
    // the action no longer increments it separately (that would double-count).
    expect(mockCreateNewContactWithMac).toHaveBeenCalledTimes(1)
    expect(mockCreateNewContactWithMac).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: "owner-1", workspaceId: "ws-1" }),
    )
    expect(mockQuotaIncrement).not.toHaveBeenCalled()
  })

  test("rejects and creates nothing when the MAC limit is reached", async () => {
    mockContactInboxFindLatest.mockResolvedValue(undefined)
    mockCreateNewContactWithMac.mockResolvedValue({
      ok: false,
      level: "user",
    })

    await expect(
      handleCreateWebchatMessage({ parsedInput: input }),
    ).rejects.toMatchObject({
      message: "Contact limit reached",
      code: "quotaExceeded",
    })

    expect(tx.insert).not.toHaveBeenCalled()
    expect(mockQuotaIncrement).not.toHaveBeenCalled()
  })
})
