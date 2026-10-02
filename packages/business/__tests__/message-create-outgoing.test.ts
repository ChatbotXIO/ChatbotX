// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mockMarkAgentReplied = vi.fn()
const mockUpdateTracking = vi.fn()
const mockRepositoryCreate = vi.fn()
const mockCreateMessageRepository = vi.fn()
const mockChatQueueAdd = vi.fn()
const mockResolveTenantSettings = vi.fn()
const mockBroadcastToWorkspaceParty = vi.fn()
const mockIntegrationQueueAdd = vi.fn()
const mockFlowExists = vi.fn()
const mockFindOrCreate = vi.fn()
const mockPrepareProductMessage = vi.fn()
const mockQueueWorkspaceRealtimeEvent = vi.fn()

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: mockCreateMessageRepository,
  flowRepository: { existsInWorkspace: mockFlowExists },
  mediaLibraryFileRepository: { findByPath: vi.fn(), findById: vi.fn() },
}))

vi.mock("@chatbotx.io/filesystem", () => ({
  guessFileTypeFromMimeType: vi.fn(() => "image"),
  pathJoin: (...parts: string[]) => parts.join("/"),
  uploader: { copyObject: vi.fn(), getPresignedDownload: vi.fn() },
  uploadMultipleFiles: vi.fn(async () => []),
}))

vi.mock("@chatbotx.io/realtime-protocol", () => ({
  RealtimeEventType: { messageCreated: "messageCreated" },
  routeForConversation: vi.fn(() => ({
    assignedTeamIds: [],
    assignedUserIds: [],
  })),
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
  integrationQueue: { add: mockIntegrationQueueAdd },
}))

vi.mock("../src/contact-inbox/service", () => ({
  contactInboxService: { updateTracking: mockUpdateTracking },
}))

vi.mock("../src/conversation/service", () => ({
  conversationService: {
    markAgentReplied: mockMarkAgentReplied,
    findOrCreate: mockFindOrCreate,
  },
}))

vi.mock("../src/product-message/service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/product-message/service")>()
  return {
    ...actual,
    productMessageService: { prepareOutgoing: mockPrepareProductMessage },
  }
})

vi.mock("../src/platform/settings", () => ({
  resolveTenantSettings: mockResolveTenantSettings,
}))

vi.mock("../src/platform/realtime-broadcast", () => ({
  queueWorkspaceRealtimeEvent: mockQueueWorkspaceRealtimeEvent,
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
    mockQueueWorkspaceRealtimeEvent.mockResolvedValue(undefined)
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

    expect(mockQueueWorkspaceRealtimeEvent).toHaveBeenCalledWith(
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

describe("messageService.createOutgoing with a flow", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("queues the flow when it belongs to the conversation's workspace", async () => {
    mockFlowExists.mockResolvedValue(true)

    await createOutgoing({
      conversation: conversation as never,
      contactInbox: contactInbox as never,
      input: { flowId: "flow-1" } as never,
    })

    expect(mockFlowExists).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "flow-1",
    })
    expect(mockIntegrationQueueAdd).toHaveBeenCalledOnce()
  })

  test("rejects a flow of another workspace with 404 and queues nothing", async () => {
    mockFlowExists.mockResolvedValue(false)

    await expect(
      createOutgoing({
        conversation: conversation as never,
        contactInbox: contactInbox as never,
        input: { flowId: "foreign-flow" } as never,
      }),
    ).rejects.toMatchObject({ code: "notFound", httpStatusCode: 404 })

    expect(mockIntegrationQueueAdd).not.toHaveBeenCalled()
  })
})

describe("messageService.createOutgoing with products", () => {
  const products = {
    display: "products" as const,
    header: "Picks",
    body: "Look",
    sections: [{ productIds: ["1", "2"] }],
  }
  const productMessage = {
    display: "products" as const,
    header: "Picks",
    body: "Look",
    sections: [{ items: [{ productId: "1" }, { productId: "2" }] }],
  }
  const prepared = {
    message: productMessage,
    missing: [],
    text: "Look",
    contentAttributes: { type: "product_message", payload: productMessage },
  }
  const whatsappContactInbox = { ...contactInbox, channel: "whatsapp" }

  const send = (
    input: Record<string, unknown> = {},
    user: { id: string } | undefined = { id: "user-1" },
  ) =>
    createOutgoing({
      conversation: conversation as never,
      contactInbox: whatsappContactInbox as never,
      input: { products, ...input } as never,
      user: user as never,
    })

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
    mockPrepareProductMessage.mockResolvedValue(prepared)
  })

  const expectNothingCreated = () => {
    expect(mockRepositoryCreate).not.toHaveBeenCalled()
    expect(mockBroadcastToWorkspaceParty).not.toHaveBeenCalled()
    expect(mockChatQueueAdd).not.toHaveBeenCalled()
  }

  test("stores the prepared message, publishes it and queues the channel send", async () => {
    await send({ clientId: "client-1" })

    expect(mockPrepareProductMessage).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      channel: "whatsapp",
      content: products,
      onMissing: "reject",
    })
    expect(mockRepositoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "Look",
        contentType: "text",
        contentAttributes: prepared.contentAttributes,
      }),
    )
    expect(mockBroadcastToWorkspaceParty).toHaveBeenCalledTimes(1)
    expect(mockChatQueueAdd).toHaveBeenCalledWith(
      "sendChannelMessage",
      expect.objectContaining({
        data: expect.objectContaining({ sendFrom: "inbox" }),
      }),
    )
  })

  test("does not run outbound keyword automations on the product text", async () => {
    await send()

    const queued = mockChatQueueAdd.mock.calls.map(([name]) => name)
    expect(queued).toEqual(["sendChannelMessage"])
  })

  test("keeps the routing-bypass flag next to the product entity", async () => {
    await send({ bypassThreadControlLock: true })

    expect(mockRepositoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        contentAttributes: {
          ...prepared.contentAttributes,
          metadata: { bypassThreadControlLock: true },
        },
      }),
    )
  })

  test.each([
    ["channelUnsupported", ["channelUnsupported"]],
    ["catalogNotConnected", ["catalogNotConnected"]],
    ["noProductsSendable", ["noProductsSendable"]],
    ["productsNotSendable", ["productsNotSendable", ["7", "8"]]],
  ] as const)("a %s message is refused with its reason and nothing is created", async (reason, args) => {
    const { ProductMessageUnresolvableError } = await import("../src/errors")
    mockPrepareProductMessage.mockRejectedValue(
      new ProductMessageUnresolvableError(
        ...(args as ConstructorParameters<
          typeof ProductMessageUnresolvableError
        >),
      ),
    )

    await expect(send()).rejects.toMatchObject({
      code: "productMessageUnresolvable",
      httpStatusCode: 422,
      reason,
    })
    expectNothingCreated()
  })

  test("a message that breaks the channel's rules is refused and nothing is created", async () => {
    const { validationException } = await import("../src/errors")
    mockPrepareProductMessage.mockRejectedValue(
      validationException("products", "Invalid product message", {
        issues: "header: sendProductsFieldRequired",
      }),
    )

    await expect(send()).rejects.toMatchObject({
      code: "validation",
      httpStatusCode: 422,
    })
    expectNothingCreated()
  })

  test.each([
    ["a comment reply", { replyToMessageId: "parent-1" }],
    ["a private reply", { isPrivateReply: true }],
  ])("refuses products as %s before resolving anything or creating a conversation", async (_name, extra) => {
    await expect(send(extra)).rejects.toMatchObject({
      code: "validation",
      httpStatusCode: 422,
      field: "products",
    })
    expect(mockPrepareProductMessage).not.toHaveBeenCalled()
    expect(mockFindOrCreate).not.toHaveBeenCalled()
    expectNothingCreated()
  })

  test("a plain text send never touches the product service", async () => {
    await createOutgoing({
      conversation: conversation as never,
      contactInbox: whatsappContactInbox as never,
      input: { text: "hello" },
      user: { id: "user-1" } as never,
    })

    expect(mockPrepareProductMessage).not.toHaveBeenCalled()
    expect(mockChatQueueAdd.mock.calls.map(([name]) => name)).toContain(
      "checkOutboundAutomatedResponse",
    )
  })
})
