// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockChatQueueAdd,
  mockCreateMessageRepository,
  mockDbUpdate,
  mockIntegrationQueueAdd,
  mockRepositoryCreate,
  updateBuilder,
} = vi.hoisted(() => {
  const updateBuilder = {
    set: vi.fn(),
    where: vi.fn(),
  }
  updateBuilder.set.mockReturnValue(updateBuilder)
  updateBuilder.where.mockResolvedValue(undefined)

  const mockRepositoryCreate = vi.fn()

  return {
    mockChatQueueAdd: vi.fn().mockResolvedValue(undefined),
    mockCreateMessageRepository: vi.fn().mockResolvedValue({
      create: mockRepositoryCreate,
      createWithAttachments: vi.fn(),
    }),
    mockDbUpdate: vi.fn().mockReturnValue(updateBuilder),
    mockIntegrationQueueAdd: vi.fn().mockResolvedValue(undefined),
    mockRepositoryCreate,
    updateBuilder,
  }
})

vi.mock("@/lib/safe-action", () => ({
  workspaceActionClient: {
    bindArgsSchemas: vi.fn(() => ({
      inputSchema: vi.fn(() => ({
        action: vi.fn(),
      })),
    })),
  },
}))

vi.mock("@chatbotx.io/business", () => ({
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
    query: {
      contactInboxModel: { findFirst: vi.fn() },
    },
    update: mockDbUpdate,
  },
  eq: vi.fn((col: unknown, val: unknown) => ({ __eq: [col, val] })),
  findOrFail: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: mockCreateMessageRepository,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactInboxModel: { id: "contactInboxId" },
  conversationModel: { id: "conversationId" },
}))

vi.mock("@chatbotx.io/filesystem", () => ({
  uploadMultipleFiles: vi.fn(),
}))

vi.mock("@chatbotx.io/partysocket-config", () => ({
  RealtimeEventType: { messageCreated: "messageCreated" },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  ChatJobAction: {
    broadcastEvent: "broadcastEvent",
    sendChannelMessage: "sendChannelMessage",
  },
  chatQueue: { add: mockChatQueueAdd },
  IntegrationJobAction: { sendFlow: "sendFlow" },
  integrationQueue: { add: mockIntegrationQueueAdd },
}))

const { createMessage } = await import(
  "../src/features/messages/actions/create-message.action"
)

const conversation = {
  id: "conv-1",
  workspaceId: "ws-1",
  contactId: "contact-1",
}

const contactInbox = {
  id: "ci-1",
  inboxId: "inbox-1",
  contactId: "contact-1",
}

describe("createMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updateBuilder.set.mockReturnValue(updateBuilder)
    updateBuilder.where.mockResolvedValue(undefined)
    mockDbUpdate.mockReturnValue(updateBuilder)
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

  test("uses one shared timestamp for the message and conversation read/activity fields", async () => {
    await createMessage({
      conversation: conversation as never,
      contactInbox: contactInbox as never,
      parsedInput: { text: "hello", clientId: "client-1" },
      user: { id: "user-1" } as never,
    })

    const messageInput = mockRepositoryCreate.mock.calls[0]?.[0] as {
      createdAt: Date
    }
    const conversationSet = updateBuilder.set.mock.calls[0]?.[0] as {
      agentLastReadAt: Date
      lastActivityAt: Date
      adminRepliedAt: Date
    }

    expect(conversationSet.agentLastReadAt).toBe(messageInput.createdAt)
    expect(conversationSet.lastActivityAt).toBe(messageInput.createdAt)
    expect(conversationSet.adminRepliedAt).toBe(messageInput.createdAt)
  })

  test("updates contact inbox lastMessageAt from the created message timestamp", async () => {
    await createMessage({
      conversation: conversation as never,
      contactInbox: contactInbox as never,
      parsedInput: { text: "hello" },
    })

    const messageInput = mockRepositoryCreate.mock.calls[0]?.[0] as {
      createdAt: Date
    }
    expect(updateBuilder.set).toHaveBeenNthCalledWith(2, {
      lastMessageAt: messageInput.createdAt,
    })
  })
})
