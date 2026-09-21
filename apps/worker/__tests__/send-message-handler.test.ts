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
  mockRecordPermanentGrant,
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
    mockRunChannelHandler: vi
      .fn()
      .mockResolvedValue({ messageIds: ["mid-1"], sentCount: 1 }),
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
    mockRecordPermanentGrant: vi.fn().mockResolvedValue(undefined),
  }
})

const mockSettleEvent = vi.fn().mockResolvedValue(undefined)

vi.mock("@chatbotx.io/analytics", () => ({
  commentAutomationAnalyticsService: { settleEvent: mockSettleEvent },
}))

vi.mock("@chatbotx.io/business", () => ({
  contactInboxService: {
    recordOutboundMessageSent: mockRecordOutboundMessageSent,
    recordSendFailure: mockRecordSendFailure,
  },
  contactService: { unblockIfBlocked: mockContactUnblockIfBlocked },
  whatsappCallPermissionService: {
    recordPermanentGrant: mockRecordPermanentGrant,
  },
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

const isBotSentDashboardCall = (call: unknown[]) => {
  if (call[0] !== "analytics:dashboard") {
    return false
  }

  const payload = call[1]
  return (
    typeof payload === "object" &&
    payload !== null &&
    "eventType" in payload &&
    payload.eventType === "message:bot_sent"
  )
}

describe("chat send-message handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRunChannelHandler.mockResolvedValue({
      messageIds: ["mid-1"],
      sentCount: 1,
    })
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
    expect(mockEmit.mock.calls.filter(isBotSentDashboardCall)).toHaveLength(0)
  })

  test("persists provider message id as sourceId for a bot outgoing message", async () => {
    // Regression: bot/agent outgoing messages were saved with sourceId=null, so
    // the channel's echo webhook (createOrUpdate → findBySourceId) could not
    // dedup against them and re-inserted a duplicate row during coexist sync.
    mockRunChannelHandler.mockResolvedValueOnce({
      messageIds: ["wamid.echo-1"],
      sentCount: 1,
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

  test("emits one bot-sent dashboard event per accepted provider message", async () => {
    mockRunChannelHandler.mockResolvedValueOnce({
      messageIds: ["m1", "m2", "m3"],
      sentCount: 3,
    })

    await sendMessageToChannel({
      conversation: conversation as never,
      contactInbox: contactInbox as never,
      message: {
        id: "msg-bot-multi",
        workspaceId: "ws-1",
        conversationId: "conv-1",
        contactInboxId: "ci-1",
        contentType: "text",
        messageType: "outgoing",
        senderType: "bot",
        sourceId: null,
        text: "automated reply",
        createdAt: new Date("2026-07-09T08:37:21.108Z"),
      } as never,
    })

    const botSentCalls = mockEmit.mock.calls.filter(isBotSentDashboardCall)

    expect(botSentCalls).toHaveLength(3)
    expect(botSentCalls).toEqual(
      expect.arrayContaining([
        [
          "analytics:dashboard",
          expect.objectContaining({
            eventType: "message:bot_sent",
            metadata: expect.objectContaining({
              triggerContext: expect.objectContaining({
                triggerHandler: "sendMessageToChannel",
                triggerType: "message_bot_sent_channel",
              }),
              sentPayload: {
                index: 0,
                count: 3,
                providerMessageId: "m1",
              },
            }),
          }),
        ],
      ]),
    )
  })

  test("does not emit bot-sent dashboard events for zero-send results", async () => {
    mockRunChannelHandler.mockResolvedValueOnce({
      messageIds: [],
      sentCount: 0,
    })

    await sendMessageToChannel({
      conversation: conversation as never,
      contactInbox: contactInbox as never,
      message: {
        id: "msg-bot-zero",
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

    expect(mockEmit.mock.calls.filter(isBotSentDashboardCall)).toHaveLength(0)
  })

  test("does not retry the send when persisting a comment reply's sourceId fails", async () => {
    // Regression: the reply is already live on the channel at this point — a
    // thrown error here must be swallowed, not rethrown, or BullMQ redelivers
    // the job and sendComment fires again, posting a second duplicate reply.
    mockRunChannelHandler.mockResolvedValueOnce({
      messageIds: ["reply-1"],
      sentCount: 1,
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
    ).resolves.toEqual({ messageIds: ["reply-1"], sentCount: 1 })

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
    mockRunChannelHandler.mockResolvedValueOnce({
      messageIds: [],
      sentCount: 0,
    })

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
    expect(mockEmit.mock.calls.filter(isBotSentDashboardCall)).toHaveLength(0)
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

  test("emits flow-step bot events using supplied trigger metadata", async () => {
    mockRunChannelHandler.mockResolvedValueOnce({
      messageIds: ["p1", "p2"],
      sentCount: 2,
    })

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
      botSentAnalytics: {
        triggerHandler: "customFlowHandler",
        triggerType: "custom_flow_trigger",
      },
    })

    const botSentCalls = mockEmit.mock.calls.filter(isBotSentDashboardCall)

    expect(botSentCalls).toHaveLength(2)
    expect(botSentCalls[0][1]).toEqual(
      expect.objectContaining({
        metadata: expect.objectContaining({
          triggerContext: expect.objectContaining({
            triggerHandler: "customFlowHandler",
            triggerType: "custom_flow_trigger",
          }),
          sentPayload: {
            index: 0,
            count: 2,
            providerMessageId: "p1",
          },
        }),
      }),
    )
  })

  // `errorData` is whatever `parseSdkError` produced and carries no stack, so
  // unless the frames are captured here — while the thrown value is still in
  // hand — `ErrorLog.stackTrace` is NULL for every outbound send failure, the
  // densest write path in the system.
  test("emits the thrown error's stack frames alongside the failure", async () => {
    const error = new ChannelError(
      "expired human agent window",
      ChannelErrorCategory.PAYLOAD_INVALID,
      { code: "messenger_human_agent_window_expired" },
    )
    mockRunChannelHandler.mockRejectedValueOnce(error)

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

    const failed = mockEmit.mock.calls.find(
      (call: unknown[]) => call[0] === "message:failed",
    )
    const errorStack = (failed?.[1] as { errorStack?: string }).errorStack

    expect(errorStack).toEqual(expect.stringContaining("    at "))
    // Frames only: the message lives in `errorData`, not stored twice.
    expect(errorStack).not.toContain("expired human agent window")
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

  test("reconciles Meta 138017 on a call_permission_request: records the grant, broadcasts the call-mode refresh, STILL shows the send-error icon, and never rethrows", async () => {
    // 138017 = the consumer already granted a permanent permission. The worker
    // records the local grant and nudges open threads to refetch
    // `useOutboundCallMode` (button flips to direct-dial) — but the request
    // message never reached the consumer, so the send-error icon must still
    // show. It must NOT rethrow (permanent error → a BullMQ retry would just
    // re-POST the request to Meta).
    const createdAt = new Date("2026-09-15T06:11:52.105Z")
    const error = new ChannelError(
      "(#138017) already approved",
      ChannelErrorCategory.AUTH_FAILED,
      { code: 138_017 },
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
          text: "We would like to call you",
          contentAttributes: { type: "whatsapp_call_permission_request" },
          createdAt,
        } as never,
      }),
    ).resolves.toEqual({ messageIds: [] })

    // Grant reconciled + button flipped to direct-dial.
    expect(mockRecordPermanentGrant).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactInboxId: "ci-1",
      grantedAt: expect.any(Date),
    })
    expect(mockChatQueueAdd).toHaveBeenCalledWith(
      "broadcastEvent",
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: "ws-1",
          event: {
            eventType: "whatsappCallPermissionUpdated",
            data: { conversationId: "conv-1" },
          },
        }),
      }),
    )
    // The send-error icon is still surfaced (this is the correction).
    expect(mockEmit).toHaveBeenCalledWith(
      "message:failed",
      expect.objectContaining({ action: { messageId: "msg-1" } }),
    )
    expect(mockUpdateSendError).toHaveBeenCalledWith(
      "msg-1",
      "sdk error",
      "ws-1",
      createdAt,
    )
  })

  // A public comment-automation reply is recorded `sent` when it is enqueued —
  // the Graph API call only happens here, so this is the only place that knows
  // the reply never landed.
  describe("comment automation analytics settlement", () => {
    const commentReply = {
      id: "msg-1",
      workspaceId: "ws-1",
      conversationId: "conv-1",
      contactInboxId: "ci-1",
      contentType: "text",
      messageType: "outgoing",
      senderType: "bot",
      type: "comment",
      text: "hello",
      contentAttributes: {
        replyToCommentId: "comment-1",
        commentAutomation: {
          automationId: "automation-1",
          replyChannel: "public",
        },
      },
    }

    test("flips the event to failed when the send terminally fails", async () => {
      mockRunChannelHandler.mockRejectedValueOnce(
        new ChannelError("token revoked", ChannelErrorCategory.AUTH_FAILED, {
          code: "auth_failed",
        }),
      )

      await expect(
        sendMessageToChannel({
          conversation: conversation as never,
          contactInbox: contactInbox as never,
          message: commentReply as never,
        }),
      ).resolves.toEqual({ messageIds: [] })

      expect(mockSettleEvent).toHaveBeenCalledWith({
        automationId: "automation-1",
        commentId: "comment-1",
        replyChannel: "public",
        status: "failed",
        errorDetail: "sdk error",
      })
    })

    test("leaves the event alone while another attempt is still to come", async () => {
      mockRunChannelHandler.mockRejectedValueOnce(
        new ChannelError("rate limited", ChannelErrorCategory.RATE_LIMITED, {
          code: "rate_limited",
        }),
      )

      await expect(
        sendMessageToChannel(
          {
            conversation: conversation as never,
            contactInbox: { ...contactInbox, channel: "whatsapp" } as never,
            message: commentReply as never,
          },
          0,
          true,
        ),
      ).rejects.toThrow()

      expect(mockSettleEvent).not.toHaveBeenCalled()
    })

    test("ignores a failed send that is not a comment-automation reply", async () => {
      mockRunChannelHandler.mockRejectedValueOnce(
        new ChannelError("token revoked", ChannelErrorCategory.AUTH_FAILED, {
          code: "auth_failed",
        }),
      )

      await expect(
        sendMessageToChannel({
          conversation: conversation as never,
          contactInbox: contactInbox as never,
          message: {
            ...commentReply,
            contentAttributes: { replyToCommentId: "comment-1" },
          } as never,
        }),
      ).resolves.toEqual({ messageIds: [] })

      expect(mockSettleEvent).not.toHaveBeenCalled()
    })

    test("does not settle a successful send", async () => {
      await sendMessageToChannel({
        conversation: conversation as never,
        contactInbox: contactInbox as never,
        message: commentReply as never,
      })

      expect(mockSettleEvent).not.toHaveBeenCalled()
    })
  })
})
