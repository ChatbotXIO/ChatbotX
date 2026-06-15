// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockAutomatedResponseEnqueue,
  mockChatQueueAdd,
  mockConversationEnsureActive,
  mockCreateMessageRepository,
  mockDbTransaction,
  mockDbUpdate,
  mockEmit,
  mockFindOrFail,
  mockIntegrationQueueAdd,
  mockRepositoryCreate,
  tx,
  updateBuilder,
} = vi.hoisted(() => {
  const updateBuilder = {
    set: vi.fn(),
    where: vi.fn(),
  }
  updateBuilder.set.mockReturnValue(updateBuilder)
  updateBuilder.where.mockResolvedValue(undefined)

  const tx = {
    query: {
      contactInboxModel: { findFirst: vi.fn() },
      conversationModel: { findFirst: vi.fn() },
      contactModel: { findFirst: vi.fn() },
    },
    insert: vi.fn(),
  }
  const mockDbTransaction = vi.fn((fn: (tx: unknown) => unknown) => fn(tx))
  const mockRepositoryCreate = vi.fn()

  return {
    mockAutomatedResponseEnqueue: vi.fn().mockResolvedValue(undefined),
    mockChatQueueAdd: vi.fn().mockResolvedValue(undefined),
    mockConversationEnsureActive: vi.fn().mockResolvedValue(false),
    mockCreateMessageRepository: vi.fn().mockResolvedValue({
      create: mockRepositoryCreate,
      createWithAttachments: vi.fn(),
    }),
    mockDbTransaction,
    mockDbUpdate: vi.fn().mockReturnValue(updateBuilder),
    mockEmit: vi.fn(),
    mockFindOrFail: vi.fn(),
    mockIntegrationQueueAdd: vi.fn().mockResolvedValue(undefined),
    mockRepositoryCreate,
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
  conversationService: { ensureActive: mockConversationEnsureActive },
  resolveTenantSettings: vi
    .fn()
    .mockResolvedValue({ storageUrl: "https://storage.example.com" }),
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {},
}))

vi.mock("@chatbotx.io/business/utils", () => ({
  getPublicFileUrl: vi.fn((path: string, base: string) => `${base}/${path}`),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: mockDbTransaction,
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

describe("handleCreateWebchatMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updateBuilder.set.mockReturnValue(updateBuilder)
    updateBuilder.where.mockResolvedValue(undefined)
    mockDbUpdate.mockReturnValue(updateBuilder)
    mockDbTransaction.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn(tx),
    )
    mockFindOrFail.mockResolvedValue({ inboxId: "inbox-1" })
    tx.query.contactInboxModel.findFirst.mockResolvedValue(contactInbox)
    tx.query.conversationModel.findFirst.mockResolvedValue(conversation)
    tx.query.contactModel.findFirst.mockResolvedValue(contact)
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
