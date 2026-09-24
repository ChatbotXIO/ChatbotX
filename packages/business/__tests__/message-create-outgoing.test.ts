// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mockMarkAgentReplied = vi.fn()
const mockUpdateTracking = vi.fn()
const mockRepositoryCreate = vi.fn()
const mockCreateMessageRepository = vi.fn()
const mockChatQueueAdd = vi.fn()
const mockResolveTenantSettings = vi.fn()
const mockBroadcastToWorkspaceParty = vi.fn()

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: mockCreateMessageRepository,
  mediaLibraryFileRepository: { findByPath: vi.fn(), findById: vi.fn() },
}))

vi.mock("@chatbotx.io/filesystem", () => ({
  guessFileTypeFromMimeType: vi.fn(() => "image"),
  pathJoin: (...parts: string[]) => parts.join("/"),
  uploader: { copyObject: vi.fn(), getPresignedDownload: vi.fn() },
  uploadMultipleFiles: vi.fn(async () => []),
}))

vi.mock("@chatbotx.io/partysocket-config", () => ({
  RealtimeEventType: { messageCreated: "messageCreated" },
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return { ...actual, createId: () => "generated-id" }
})

vi.mock("@chatbotx.io/worker-config", () => ({
  ChatJobAction: {
    broadcastEvent: "broadcastEvent",
    sendChannelMessage: "sendChannelMessage",
    checkOutboundAutomatedResponse: "checkOutboundAutomatedResponse",
  },
  chatQueue: { add: mockChatQueueAdd },
  IntegrationJobAction: { sendFlow: "sendFlow" },
  integrationQueue: { add: vi.fn() },
}))

vi.mock("../src/contact-inbox/service", () => ({
  contactInboxService: { updateTracking: mockUpdateTracking },
}))

vi.mock("../src/conversation/service", () => ({
  conversationService: {
    markAgentReplied: mockMarkAgentReplied,
    findOrCreate: vi.fn(),
  },
}))

vi.mock("../src/platform/settings", () => ({
  resolveTenantSettings: mockResolveTenantSettings,
}))

vi.mock("../src/platform/realtime-broadcast", () => ({
  broadcastToWorkspaceParty: mockBroadcastToWorkspaceParty,
}))

vi.mock("../src/utils", () => ({
  getPublicFileUrl: (path: string, base: string) => `${base}/${path}`,
}))

const { createOutgoing } = await import("../src/message/create-outgoing")

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

describe("messageService.createOutgoing", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveTenantSettings.mockResolvedValue({
      storageUrl: "https://storage.example.com",
    })
    mockMarkAgentReplied.mockResolvedValue(undefined)
    mockUpdateTracking.mockResolvedValue(null)
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
    mockBroadcastToWorkspaceParty.mockResolvedValue(undefined)
  })

  test("uses one shared timestamp for the message and conversation agent-replied fields", async () => {
    await createOutgoing({
      conversation: conversation as never,
      contactInbox: contactInbox as never,
      input: { text: "hello", clientId: "client-1" },
      user: { id: "user-1" } as never,
    })

    const messageInput = mockRepositoryCreate.mock.calls[0]?.[0] as {
      createdAt: Date
    }
    expect(mockMarkAgentReplied).toHaveBeenCalledWith({
      id: conversation.id,
      workspaceId: conversation.workspaceId,
      at: messageInput.createdAt,
    })
  })

  test("updates contact inbox lastMessageAt from the created message timestamp", async () => {
    await createOutgoing({
      conversation: conversation as never,
      contactInbox: contactInbox as never,
      input: { text: "hello" },
    })

    const messageInput = mockRepositoryCreate.mock.calls[0]?.[0] as {
      createdAt: Date
    }
    expect(mockUpdateTracking).toHaveBeenCalledWith({
      contactInboxId: "ci-1",
      contactId: "contact-1",
      workspaceId: "ws-1",
      data: {
        firstInteractionAt: messageInput.createdAt,
        lastMessageAt: messageInput.createdAt,
      },
    })
  })

  test("broadcasts a created message directly instead of queueing it", async () => {
    await createOutgoing({
      conversation: conversation as never,
      contactInbox: contactInbox as never,
      input: { text: "hello", clientId: "client-1" },
    })

    expect(mockBroadcastToWorkspaceParty).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({
        eventType: "messageCreated",
        data: expect.objectContaining({ clientId: "client-1", id: "msg-1" }),
      }),
    )
  })

  test("uses attempts=1 for manual Threads comment replies", async () => {
    await createOutgoing({
      conversation: conversation as never,
      contactInbox: { ...contactInbox, channel: "threads" } as never,
      input: {
        text: "hello",
        replyToMessageId: "parent-1",
        replyToMessageCreatedAt: new Date("2026-08-12T00:00:00Z"),
      },
      user: { id: "user-1" } as never,
    })

    expect(mockChatQueueAdd).toHaveBeenNthCalledWith(
      1,
      "sendChannelMessage",
      expect.objectContaining({
        data: expect.objectContaining({
          message: expect.objectContaining({ type: "comment" }),
        }),
      }),
      { attempts: 1 },
    )
  })

  test("keeps default queue options for non-Threads manual comment replies", async () => {
    await createOutgoing({
      conversation: conversation as never,
      contactInbox: { ...contactInbox, channel: "messenger" } as never,
      input: {
        text: "hello",
        replyToMessageId: "parent-1",
        replyToMessageCreatedAt: new Date("2026-08-12T00:00:00Z"),
      },
      user: { id: "user-1" } as never,
    })

    expect(mockChatQueueAdd).toHaveBeenNthCalledWith(
      1,
      "sendChannelMessage",
      expect.objectContaining({
        data: expect.objectContaining({
          message: expect.objectContaining({ type: "comment" }),
        }),
      }),
    )
    expect(mockChatQueueAdd.mock.calls[0]).toHaveLength(2)
  })
})
