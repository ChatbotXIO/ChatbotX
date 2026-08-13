import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockEmit,
  mockResolveIntegrationContextFromContactInbox,
  mockRunChannelHandler,
  mockDbUpdate,
  mockUpdateSourceId,
  mockUpdateSendError,
  mockCreateMessageRepository,
  mockContactUnblockIfBlocked,
  mockRecordOutboundMessageSent,
  mockRecordSendFailure,
  mockChatQueueAdd,
} = vi.hoisted(() => {
  const updateChain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
  }

  const updateSourceId = vi.fn().mockResolvedValue(undefined)
  const updateSendError = vi.fn().mockResolvedValue(undefined)

  return {
    mockEmit: vi.fn().mockResolvedValue(undefined),
    mockResolveIntegrationContextFromContactInbox: vi.fn(),
    mockRunChannelHandler: vi.fn().mockResolvedValue({ messageIds: ["mid-1"] }),
    mockDbUpdate: vi.fn().mockReturnValue(updateChain),
    mockUpdateSourceId: updateSourceId,
    mockUpdateSendError: updateSendError,
    mockCreateMessageRepository: vi.fn().mockResolvedValue({
      updateSourceId,
      updateSendError,
      findById: vi.fn().mockResolvedValue(null),
    }),
    mockContactUnblockIfBlocked: vi.fn().mockResolvedValue(null),
    mockRecordOutboundMessageSent: vi.fn().mockResolvedValue(undefined),
    mockRecordSendFailure: vi.fn().mockResolvedValue(undefined),
    mockChatQueueAdd: vi.fn().mockResolvedValue(undefined),
  }
})

vi.mock("@chatbotx.io/business", () => ({
  contactInboxService: {
    recordOutboundMessageSent: mockRecordOutboundMessageSent,
    recordSendFailure: mockRecordSendFailure,
  },
  contactService: { unblockIfBlocked: mockContactUnblockIfBlocked },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    update: mockDbUpdate,
  },
  eq: vi.fn((col: unknown, val: unknown) => ({ __eq: [col, val] })),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  messageModel: { id: "id", sourceId: "sourceId" },
  whatsappFlowModel: { id: "id", sourceId: "sourceId" },
}))

vi.mock("@chatbotx.io/event-bus", () => ({
  emit: mockEmit,
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: mockCreateMessageRepository,
}))

vi.mock("@chatbotx.io/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/sdk")>()
  return {
    ...actual,
    parseSdkError: vi.fn().mockResolvedValue({ message: "sdk error" }),
  }
})

vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

vi.mock("../src/services/integrations", () => ({
  allIntegrations: {},
  resolveIntegrationContextFromContactInbox:
    mockResolveIntegrationContextFromContactInbox,
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  ChatJobAction: { broadcastEvent: "broadcastEvent" },
  chatQueue: { add: mockChatQueueAdd },
}))

const { sendFlowStepToChannel, sendMessageToChannel } = await import(
  "../src/chat/handlers/send-message"
)
const { ChannelError, ChannelErrorCategory } = await import("@chatbotx.io/sdk")

const conversation = {
  id: "conv-1",
  workspaceId: "ws-1",
  contactId: "contact-1",
}

const contactInbox = {
  id: "ci-1",
  inboxId: "inbox-1",
  channel: "messenger",
  contactId: "contact-1",
  sourceId: "psid-1",
  source: "messenger",
}

describe("chat send-message handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRunChannelHandler.mockResolvedValue({ messageIds: ["mid-1"] })
    mockContactUnblockIfBlocked.mockResolvedValue(null)
    mockResolveIntegrationContextFromContactInbox.mockResolvedValue({
      ctx: { workspaceId: "ws-1" },
      integration: {
        runChannelHandler: mockRunChannelHandler,
      },
    })
  })

  test("passes sendFrom to sendMessage channel handler", async () => {
    await sendMessageToChannel({
      conversation: conversation as never,
      contactInbox: contactInbox as never,
      message: {
        id: "msg-1",
        workspaceId: "ws-1",
        conversationId: "conv-1",
        contactInboxId: "ci-1",
        contentType: "text",
        messageType: "outgoing",
        senderType: "user",
        text: "hello",
      } as never,
      sendFrom: "inbox",
    })

    expect(mockRunChannelHandler).toHaveBeenCalledWith(
      "message",
      "sendMessage",
      expect.objectContaining({
        data: expect.objectContaining({
          sendFrom: "inbox",
        }),
      }),
    )
    expect(mockRecordOutboundMessageSent).toHaveBeenCalledWith({
      contactInboxId: "ci-1",
      contactId: "contact-1",
      workspaceId: "ws-1",
      at: expect.any(Date),
    })
  })

  test("persists provider message id as sourceId for a bot outgoing message", async () => {
    // Regression: bot/agent outgoing messages were saved with sourceId=null, so
    // the channel's echo webhook (createOrUpdate → findBySourceId) could not
    // dedup against them and re-inserted a duplicate row during coexist sync.
    mockRunChannelHandler.mockResolvedValueOnce({
      messageIds: ["wamid.echo-1"],
    })

    const createdAt = new Date("2026-07-09T08:37:21.108Z")

    await sendMessageToChannel({
      conversation: conversation as never,
      contactInbox: contactInbox as never,
      message: {
        id: "msg-bot-1",
        workspaceId: "ws-1",
        conversationId: "conv-1",
        contactInboxId: "ci-1",
        contentType: "text",
        messageType: "outgoing",
        senderType: "bot",
        sourceId: null,
        text: "automated reply",
        createdAt,
      } as never,
    })

    expect(mockUpdateSourceId).toHaveBeenCalledWith(
      "msg-bot-1",
      "wamid.echo-1",
      "ws-1",
      createdAt,
    )
  })

  test("does not retry the send when persisting a comment reply's sourceId fails", async () => {
    // Regression: the reply is already live on the channel at this point — a
    // thrown error here must be swallowed, not rethrown, or BullMQ redelivers
    // the job and sendComment fires again, posting a second duplicate reply.
    mockRunChannelHandler.mockResolvedValueOnce({
      messageIds: ["reply-1"],
    })
    mockUpdateSourceId.mockRejectedValueOnce(new Error("shard write failed"))

    await expect(
      sendMessageToChannel({
        conversation: conversation as never,
        contactInbox: contactInbox as never,
        message: {
          id: "msg-comment-1",
          workspaceId: "ws-1",
          conversationId: "conv-1",
          contactInboxId: "ci-1",
          contentType: "text",
          messageType: "outgoing",
          senderType: "user",
          text: "comment reply",
          type: "comment",
          parentId: "parent-1",
          createdAt: new Date("2026-07-09T08:37:21.108Z"),
        } as never,
      }),
    ).resolves.toEqual({ messageIds: ["reply-1"] })

    expect(mockRunChannelHandler).toHaveBeenCalledTimes(1)
  })

  test("auto-unblocks after a successful non-comment send", async () => {
    await sendMessageToChannel({
      conversation: conversation as never,
      contactInbox: contactInbox as never,
      message: {
        id: "msg-1",
        workspaceId: "ws-1",
        conversationId: "conv-1",
        contactInboxId: "ci-1",
        contentType: "text",
        messageType: "outgoing",
        senderType: "user",
        text: "hello",
      } as never,
    })

    expect(mockContactUnblockIfBlocked).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "contact-1",
    })
  })

  test("does not auto-unblock after a comment reply send", async () => {
    const createdAt = new Date("2026-01-04T03:04:05.000Z")
    await sendMessageToChannel({
      conversation: conversation as never,
      contactInbox: contactInbox as never,
      message: {
        id: "msg-comment-1",
        workspaceId: "ws-1",
        conversationId: "conv-1",
        contactInboxId: "ci-1",
        contentType: "text",
        messageType: "outgoing",
        senderType: "user",
        text: "comment reply",
        type: "comment",
        createdAt,
      } as never,
    })

    expect(mockContactUnblockIfBlocked).not.toHaveBeenCalled()
    expect(mockRecordOutboundMessageSent).toHaveBeenCalledWith({
      contactInboxId: "ci-1",
      contactId: "contact-1",
      workspaceId: "ws-1",
      at: createdAt,
    })
  })

  test("does not update sourceId when the channel returns no provider id", async () => {
    mockRunChannelHandler.mockResolvedValueOnce({ messageIds: [] })

    await sendMessageToChannel({
      conversation: conversation as never,
      contactInbox: contactInbox as never,
      message: {
        id: "msg-bot-2",
        workspaceId: "ws-1",
        conversationId: "conv-1",
        contactInboxId: "ci-1",
        contentType: "text",
        messageType: "outgoing",
        senderType: "bot",
        sourceId: null,
        text: "automated reply",
      } as never,
    })

    expect(mockUpdateSourceId).not.toHaveBeenCalled()
  })

  test("passes sendFrom to sendFlowStep channel handler", async () => {
    await sendFlowStepToChannel({
      conversation: conversation as never,
      contactInbox: contactInbox as never,
      flowId: "flow-1",
      step: {
        id: "step-1",
        nodeId: "node-1",
        stepType: "sendText",
        text: "hello",
      } as never,
      sendFrom: "inbox",
    })

    expect(mockRunChannelHandler).toHaveBeenCalledWith(
      "message",
      "sendFlowStep",
      expect.objectContaining({
        data: expect.objectContaining({
          sendFrom: "inbox",
        }),
      }),
    )
    expect(mockRecordOutboundMessageSent).toHaveBeenCalledWith({
      contactInboxId: "ci-1",
      contactId: "contact-1",
      workspaceId: "ws-1",
      at: expect.any(Date),
    })
  })

  test("does not throw non-retryable ChannelError after emitting failure", async () => {
    const error = new ChannelError(
      "expired human agent window",
      ChannelErrorCategory.PAYLOAD_INVALID,
      { code: "messenger_human_agent_window_expired" },
    )
    mockRunChannelHandler.mockRejectedValueOnce(error)

    await expect(
      sendMessageToChannel({
        conversation: conversation as never,
        contactInbox: contactInbox as never,
        message: {
          id: "msg-1",
          workspaceId: "ws-1",
          conversationId: "conv-1",
          contactInboxId: "ci-1",
          contentType: "text",
          messageType: "outgoing",
          senderType: "user",
          text: "hello",
          createdAt: new Date("2026-07-09T08:37:21.108Z"),
        } as never,
      }),
    ).resolves.toEqual({ messageIds: [] })

    expect(mockEmit).toHaveBeenCalledWith(
      "message:failed",
      expect.objectContaining({
        action: { messageId: "msg-1" },
        errorData: { message: "sdk error" },
      }),
    )
    expect(mockRecordOutboundMessageSent).not.toHaveBeenCalled()
    expect(mockRecordSendFailure).not.toHaveBeenCalled()
    expect(mockUpdateSendError).toHaveBeenCalledWith(
      "msg-1",
      "sdk error",
      "ws-1",
      expect.any(Date),
    )
    expect(mockChatQueueAdd).toHaveBeenCalledWith(
      "broadcastEvent",
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: "ws-1",
          event: {
            eventType: "messageFailed",
            data: { messageId: "msg-1", error: "sdk error" },
          },
        }),
      }),
    )
  })

  test("does not persist a sendError on a successful send", async () => {
    await sendMessageToChannel({
      conversation: conversation as never,
      contactInbox: contactInbox as never,
      message: {
        id: "msg-1",
        workspaceId: "ws-1",
        conversationId: "conv-1",
        contactInboxId: "ci-1",
        contentType: "text",
        messageType: "outgoing",
        senderType: "user",
        text: "hello",
      } as never,
    })

    expect(mockUpdateSendError).not.toHaveBeenCalled()
    expect(mockChatQueueAdd).not.toHaveBeenCalled()
  })

  test("clears a prior sendError when a retry (attemptsMade > 0) succeeds", async () => {
    const createdAt = new Date("2026-07-09T08:37:21.108Z")

    await sendMessageToChannel(
      {
        conversation: conversation as never,
        contactInbox: contactInbox as never,
        message: {
          id: "msg-1",
          workspaceId: "ws-1",
          conversationId: "conv-1",
          contactInboxId: "ci-1",
          contentType: "text",
          messageType: "outgoing",
          senderType: "user",
          text: "hello",
          clientId: "client-1",
          createdAt,
        } as never,
      },
      1,
    )

    expect(mockUpdateSendError).toHaveBeenCalledWith(
      "msg-1",
      null,
      "ws-1",
      createdAt,
    )
    expect(mockChatQueueAdd).toHaveBeenCalledWith(
      "broadcastEvent",
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: "ws-1",
          event: {
            eventType: "messageFailed",
            data: { messageId: "msg-1", clientId: "client-1", error: null },
          },
        }),
      }),
    )
  })

  test("does not clear sendError on a first-attempt (non-retry) successful send", async () => {
    await sendMessageToChannel({
      conversation: conversation as never,
      contactInbox: contactInbox as never,
      message: {
        id: "msg-1",
        workspaceId: "ws-1",
        conversationId: "conv-1",
        contactInboxId: "ci-1",
        contentType: "text",
        messageType: "outgoing",
        senderType: "user",
        text: "hello",
        createdAt: new Date("2026-07-09T08:37:21.108Z"),
      } as never,
    })

    expect(mockUpdateSendError).not.toHaveBeenCalled()
    expect(mockChatQueueAdd).not.toHaveBeenCalled()
  })

  test("does not retry a retryable ChannelError for messenger/instagram channels", async () => {
    const error = new ChannelError(
      "network error",
      ChannelErrorCategory.NETWORK_ERROR,
      { code: "network_error" },
    )
    mockRunChannelHandler.mockRejectedValueOnce(error)

    await expect(
      sendMessageToChannel({
        conversation: conversation as never,
        contactInbox: contactInbox as never, // channel: "messenger"
        message: {
          id: "msg-1",
          workspaceId: "ws-1",
          conversationId: "conv-1",
          contactInboxId: "ci-1",
          contentType: "text",
          messageType: "outgoing",
          senderType: "user",
          text: "hello",
        } as never,
      }),
    ).resolves.toEqual({ messageIds: [] })

    expect(mockEmit).toHaveBeenCalledWith(
      "message:failed",
      expect.objectContaining({
        action: { messageId: "msg-1" },
        errorData: { message: "sdk error" },
      }),
    )
  })

  test("does not retry a retryable ChannelError for the instagram channel", async () => {
    const error = new ChannelError(
      "network error",
      ChannelErrorCategory.NETWORK_ERROR,
      { code: "network_error" },
    )
    mockRunChannelHandler.mockRejectedValueOnce(error)

    await expect(
      sendMessageToChannel({
        conversation: conversation as never,
        contactInbox: { ...contactInbox, channel: "instagram" } as never,
        message: {
          id: "msg-1",
          workspaceId: "ws-1",
          conversationId: "conv-1",
          contactInboxId: "ci-1",
          contentType: "text",
          messageType: "outgoing",
          senderType: "user",
          text: "hello",
        } as never,
      }),
    ).resolves.toEqual({ messageIds: [] })
  })

  test("still throws a retryable ChannelError for channels outside the fix scope", async () => {
    const error = new ChannelError(
      "rate limited",
      ChannelErrorCategory.RATE_LIMITED,
      { code: "rate_limited" },
    )
    mockRunChannelHandler.mockRejectedValueOnce(error)

    await expect(
      sendMessageToChannel({
        conversation: conversation as never,
        contactInbox: { ...contactInbox, channel: "whatsapp" } as never,
        message: {
          id: "msg-1",
          workspaceId: "ws-1",
          conversationId: "conv-1",
          contactInboxId: "ci-1",
          contentType: "text",
          messageType: "outgoing",
          senderType: "user",
          text: "hello",
        } as never,
      }),
    ).rejects.toBe(error)

    expect(mockEmit).toHaveBeenCalledWith(
      "message:failed",
      expect.objectContaining({
        action: { messageId: "msg-1" },
        errorData: { message: "sdk error" },
      }),
    )
  })

  test("does not retry missing integration auth resolution errors", async () => {
    const error = new ChannelError(
      "Unable to find integration auth for channel: messenger",
      ChannelErrorCategory.AUTH_FAILED,
      { code: "integration_auth_missing" },
    )
    mockResolveIntegrationContextFromContactInbox.mockRejectedValueOnce(error)

    await expect(
      sendMessageToChannel({
        conversation: conversation as never,
        contactInbox: contactInbox as never,
        message: {
          id: "msg-1",
          workspaceId: "ws-1",
          conversationId: "conv-1",
          contactInboxId: "ci-1",
          contentType: "text",
          messageType: "outgoing",
          senderType: "user",
          text: "hello",
        } as never,
      }),
    ).resolves.toEqual({ messageIds: [] })

    expect(mockRunChannelHandler).not.toHaveBeenCalled()
    expect(mockEmit).toHaveBeenCalledWith(
      "message:failed",
      expect.objectContaining({
        action: { messageId: "msg-1" },
        errorData: { message: "sdk error" },
      }),
    )
  })
})
