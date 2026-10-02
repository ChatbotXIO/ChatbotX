import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  emit: vi.fn().mockResolvedValue(undefined),
  runChannelHandler: vi.fn(),
  resolveIntegrationContext: vi.fn(),
  updateSourceId: vi.fn().mockResolvedValue(undefined),
  updateSendError: vi.fn().mockResolvedValue(undefined),
  recordOutboundMessageSent: vi.fn().mockResolvedValue(undefined),
  recordSendFailure: vi.fn().mockResolvedValue(undefined),
  recordEvent: vi.fn(),
  refreshForRouting: vi.fn(),
  loggerWarn: vi.fn(),
}))

const REJECTION_CODE = 1_234_567

vi.mock("@chatbotx.io/analytics", () => ({
  commentAutomationAnalyticsService: { settleEvent: vi.fn() },
}))

vi.mock("@chatbotx.io/business", () => ({
  contactInboxService: {
    recordOutboundMessageSent: mocks.recordOutboundMessageSent,
    recordSendFailure: mocks.recordSendFailure,
  },
  contactService: { unblockIfBlocked: vi.fn().mockResolvedValue(null) },
  conversationService: { markReadByOutbound: vi.fn().mockResolvedValue(true) },
  messageService: {
    updateSendError: mocks.updateSendError,
    updateSourceId: mocks.updateSourceId,
    updateAttributes: vi.fn().mockResolvedValue(undefined),
    findWithAttachments: vi.fn().mockResolvedValue(null),
  },
  queueWorkspaceRealtimeEvent: vi.fn(),
  whatsappCallPermissionService: { recordPermanentGrant: vi.fn() },
  threadControlService: {
    recordEvent: mocks.recordEvent,
    refreshForRouting: mocks.refreshForRouting,
  },
}))

vi.mock("@chatbotx.io/channel-registry/thread-control", () => ({
  getChannelThreadOwner: vi.fn(),
  syncThreadOwner: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { update: vi.fn() },
  eq: vi.fn(),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  messageModel: { id: "id", sourceId: "sourceId" },
  whatsappFlowModel: { id: "id", sourceId: "sourceId" },
}))

vi.mock("@chatbotx.io/event-bus", () => ({ emit: mocks.emit }))

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: vi.fn().mockResolvedValue({
    updateSourceId: mocks.updateSourceId,
    updateSendError: mocks.updateSendError,
    findById: vi.fn().mockResolvedValue(null),
  }),
}))

vi.mock("@chatbotx.io/integration-whatsapp", () => ({
  THREAD_CONTROL_REJECTION_CODES: new Set([REJECTION_CODE]),
}))

vi.mock("@chatbotx.io/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/sdk")>()
  return {
    ...actual,
    parseSdkError: vi.fn().mockResolvedValue({ message: "sdk error" }),
  }
})

vi.mock("../src/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: mocks.loggerWarn,
    info: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock("../src/services/integrations", () => ({
  allIntegrations: {},
  resolveIntegrationContextFromContactInbox: mocks.resolveIntegrationContext,
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  ChatJobAction: { broadcastEvent: "broadcastEvent" },
  chatQueue: { add: vi.fn() },
}))

const {
  sendFlowStepToChannel,
  sendMessageToChannel,
  THREAD_NOT_OWNED_ERROR_CODE,
} = await import("../src/chat/handlers/send-message")
const { ChannelError, ChannelErrorCategory } = await import("@chatbotx.io/sdk")

const NOW = new Date("2026-09-29T12:00:00.000Z")
const HOUR = 60 * 60 * 1000
const iso = (msAgo: number) => new Date(NOW.getTime() - msAgo).toISOString()

const conversation = {
  id: "conv-1",
  workspaceId: "ws-1",
  contactId: "contact-1",
}

const baseContactInbox = {
  id: "ci-1",
  inboxId: "inbox-1",
  channel: "whatsapp",
  contactId: "contact-1",
  sourceId: "84900000001",
  source: "whatsapp",
  threadControlState: null,
  threadOwnerRole: null,
  threadControlUpdatedAt: null,
  lastIncomingMessageAt: null,
}

/** A row as the chat job carries it: JSON-serialized, so dates are strings. */
const standbyRecently = {
  ...baseContactInbox,
  threadControlState: "standby",
  threadOwnerRole: "ai_agent",
  threadControlUpdatedAt: iso(HOUR),
  lastIncomingMessageAt: iso(HOUR),
}

const message = {
  id: "msg-1",
  workspaceId: "ws-1",
  conversationId: "conv-1",
  contactInboxId: "ci-1",
  contentType: "text",
  messageType: "outgoing",
  senderType: "bot",
  text: "hello",
  createdAt: NOW,
}

const flowStepArgs = {
  conversation: conversation as never,
  flowId: "flow-1",
  step: { id: "s-1", nodeId: "n-1", stepType: "sendText", text: "hi" } as never,
  botSentAnalytics: {
    triggerHandler: "test",
    triggerType: "message_bot_sent_flow_step_channel",
  },
}

const sendDirect = (contactInbox: Record<string, unknown>) =>
  sendMessageToChannel({
    conversation: conversation as never,
    contactInbox: contactInbox as never,
    message: message as never,
  })

const rejection = (code: number) =>
  new ChannelError("not the owner", ChannelErrorCategory.PERMISSION_DENIED, {
    code,
  })

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  // Sub-second clock: our own events must be recorded at Meta's whole-second
  // resolution (`occurredAt: NOW`), so a same-second handover still wins.
  vi.setSystemTime(new Date(NOW.getTime() + 750))
  mocks.runChannelHandler.mockResolvedValue({
    messageIds: ["mid-1"],
    sentCount: 1,
  })
  mocks.recordEvent.mockResolvedValue({
    eventApplied: true,
    stateChanged: true,
  })
  mocks.resolveIntegrationContext.mockResolvedValue({
    ctx: { workspaceId: "ws-1" },
    integration: { runChannelHandler: mocks.runChannelHandler },
  })
  // No handover since enqueue: the current row is the job's row.
  mocks.refreshForRouting.mockImplementation(
    ({ contactInbox }: { contactInbox: unknown }) =>
      Promise.resolve(contactInbox),
  )
})

describe("send gate — sendMessageToChannel (Service messages)", () => {
  test("gates on the current row: owned at enqueue, taken by another app since → no channel call", async () => {
    const ownedAtEnqueue = {
      ...standbyRecently,
      threadControlState: "owned",
      threadOwnerRole: null,
    }
    const takenSince = {
      ...standbyRecently,
      threadControlUpdatedAt: new Date(NOW.getTime() - 1000),
      lastIncomingMessageAt: new Date(NOW.getTime() - HOUR),
    }
    mocks.refreshForRouting.mockResolvedValue(takenSince)

    await sendDirect(ownedAtEnqueue)

    expect(mocks.refreshForRouting).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactInbox: ownedAtEnqueue,
    })
    expect(mocks.runChannelHandler).not.toHaveBeenCalled()
    expect(mocks.updateSendError).toHaveBeenCalledTimes(1)
  })

  test("records the implicit take against the current row, not the job's", async () => {
    const idleNow = {
      ...standbyRecently,
      threadControlState: "idle",
      threadOwnerRole: null,
    }
    mocks.refreshForRouting.mockResolvedValue(idleNow)

    await sendDirect({ ...standbyRecently, threadControlState: "owned" })

    expect(mocks.runChannelHandler).toHaveBeenCalledTimes(1)
    expect(mocks.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "serviceSent", contactInbox: idleNow }),
    )
  })

  test("a Service send on a thread another responder owns is blocked before the API call and never retried", async () => {
    const result = await sendDirect(standbyRecently)

    expect(mocks.runChannelHandler).not.toHaveBeenCalled()
    // Recorded as a visible send error, reported as a terminal failure ...
    expect(mocks.updateSendError).toHaveBeenCalledTimes(1)
    expect(mocks.emit).toHaveBeenCalledWith(
      "message:failed",
      expect.objectContaining({ willRetry: false }),
    )
    // ... and swallowed (a rethrow would make BullMQ retry a permanent refusal).
    expect(result).toEqual({ messageIds: [], sentCount: 0 })
    expect(mocks.recordOutboundMessageSent).not.toHaveBeenCalled()
    expect(mocks.recordEvent).not.toHaveBeenCalled()
  })

  test("a Service send flagged bypassThreadControlLock skips the gate on a standby thread and records the implicit take", async () => {
    await sendMessageToChannel({
      conversation: conversation as never,
      contactInbox: standbyRecently as never,
      message: {
        ...message,
        contentAttributes: { metadata: { bypassThreadControlLock: true } },
      } as never,
    })

    expect(mocks.runChannelHandler).toHaveBeenCalledTimes(1)
    expect(mocks.updateSendError).not.toHaveBeenCalled()
    expect(mocks.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "serviceSent" }),
    )
  })

  test("a public comment reply is exempt from the gate on a standby thread and never records an implicit take", async () => {
    const result = await sendMessageToChannel({
      conversation: conversation as never,
      contactInbox: standbyRecently as never,
      message: { ...message, type: "comment" } as never,
    })

    expect(mocks.runChannelHandler).toHaveBeenCalledWith(
      "comment",
      "sendComment",
      expect.anything(),
    )
    expect(result).toEqual({ messageIds: ["mid-1"], sentCount: 1 })
    expect(mocks.updateSendError).not.toHaveBeenCalled()
    expect(mocks.recordEvent).not.toHaveBeenCalled()
  })

  test("a private-reply DM (type comment) is still gated on a standby thread", async () => {
    const result = await sendMessageToChannel({
      conversation: conversation as never,
      contactInbox: standbyRecently as never,
      message: {
        ...message,
        type: "comment",
        contentAttributes: { isPrivateReply: true },
      } as never,
    })

    expect(mocks.runChannelHandler).not.toHaveBeenCalled()
    expect(mocks.updateSendError).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ messageIds: [], sentCount: 0 })
  })

  test("metadata without the bypass flag still gates a standby thread", async () => {
    const result = await sendMessageToChannel({
      conversation: conversation as never,
      contactInbox: standbyRecently as never,
      message: {
        ...message,
        contentAttributes: { metadata: { bypassThreadControlLock: false } },
      } as never,
    })

    expect(mocks.runChannelHandler).not.toHaveBeenCalled()
    expect(result).toEqual({ messageIds: [], sentCount: 0 })
  })

  test("a standby row idle after 24h of silence is allowed and the send makes us owner", async () => {
    await sendDirect({
      ...standbyRecently,
      threadControlUpdatedAt: iso(25 * HOUR),
      lastIncomingMessageAt: iso(25 * HOUR),
    })

    expect(mocks.runChannelHandler).toHaveBeenCalledTimes(1)
    expect(mocks.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        inbox: { id: "inbox-1", threadControlSeenAt: null },
        conversationId: "conv-1",
        event: "serviceSent",
        occurredAt: NOW,
      }),
    )
  })

  test("an explicitly idle thread is allowed and records serviceSent (implicit take)", async () => {
    await sendDirect({
      ...baseContactInbox,
      threadControlState: "idle",
      threadControlUpdatedAt: iso(HOUR),
    })

    expect(mocks.runChannelHandler).toHaveBeenCalledTimes(1)
    expect(mocks.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "serviceSent" }),
    )
  })

  test("a thread routing never observed is untouched: no extra work on the hot path", async () => {
    await sendDirect(baseContactInbox)

    expect(mocks.runChannelHandler).toHaveBeenCalledTimes(1)
    expect(mocks.recordEvent).not.toHaveBeenCalled()
  })

  test("a row that predates the routing columns behaves as never observed", async () => {
    const legacyRow: Record<string, unknown> = { ...baseContactInbox }
    for (const column of [
      "threadControlState",
      "threadOwnerRole",
      "threadControlUpdatedAt",
    ]) {
      delete legacyRow[column]
    }

    await sendDirect(legacyRow)

    expect(mocks.runChannelHandler).toHaveBeenCalledTimes(1)
    expect(mocks.recordEvent).not.toHaveBeenCalled()
  })

  test("an owned thread sends normally and costs no routing write", async () => {
    await sendDirect({
      ...baseContactInbox,
      threadControlState: "owned",
      threadControlUpdatedAt: iso(HOUR),
      lastIncomingMessageAt: iso(HOUR),
    })

    expect(mocks.runChannelHandler).toHaveBeenCalledTimes(1)
    expect(mocks.recordEvent).not.toHaveBeenCalled()
  })

  test("a failure recording serviceSent is logged and never rethrown after a delivered send", async () => {
    mocks.recordEvent.mockRejectedValue(new Error("db down"))

    const result = await sendDirect({
      ...baseContactInbox,
      threadControlState: "idle",
      threadControlUpdatedAt: iso(HOUR),
    })

    expect(result).toEqual({ messageIds: ["mid-1"], sentCount: 1 })
    expect(mocks.loggerWarn).toHaveBeenCalled()
  })

  test("a Meta ownership rejection is reconciled as serviceRejected, still recorded on the message, and not retried", async () => {
    mocks.runChannelHandler.mockRejectedValue(rejection(REJECTION_CODE))

    const result = await sendDirect({
      ...baseContactInbox,
      threadControlState: "owned",
      threadControlUpdatedAt: iso(HOUR),
      lastIncomingMessageAt: iso(HOUR),
    })

    expect(mocks.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        conversationId: "conv-1",
        event: "serviceRejected",
        occurredAt: NOW,
      }),
    )
    expect(mocks.updateSendError).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ messageIds: [], sentCount: 0 })
  })

  test("other permission errors are not mistaken for an ownership rejection", async () => {
    mocks.runChannelHandler.mockRejectedValue(rejection(10))

    await sendDirect(baseContactInbox)

    expect(mocks.recordEvent).not.toHaveBeenCalled()
  })
})

describe("send gate — sendFlowStepToChannel", () => {
  test("a Service step on a thread another responder owns throws the thread-not-owned error before the API call", async () => {
    await expect(
      sendFlowStepToChannel({
        ...flowStepArgs,
        contactInbox: standbyRecently as never,
      }),
    ).rejects.toMatchObject({
      code: THREAD_NOT_OWNED_ERROR_CODE,
      category: ChannelErrorCategory.PERMISSION_DENIED,
      isRetryable: false,
    })

    expect(mocks.runChannelHandler).not.toHaveBeenCalled()
    expect(mocks.recordOutboundMessageSent).not.toHaveBeenCalled()
  })

  test("gates on the CURRENT row: a handover landed since the step was loaded → refreshes and blocks", async () => {
    // Step loaded while the thread looked idle; a partner took it over since.
    mocks.refreshForRouting.mockResolvedValue(standbyRecently)

    await expect(
      sendFlowStepToChannel({
        ...flowStepArgs,
        contactInbox: {
          ...baseContactInbox,
          threadControlState: "idle",
          threadControlUpdatedAt: iso(HOUR),
        } as never,
      }),
    ).rejects.toMatchObject({ code: THREAD_NOT_OWNED_ERROR_CODE })

    expect(mocks.refreshForRouting).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactInbox: expect.objectContaining({ id: "ci-1" }),
    })
    expect(mocks.runChannelHandler).not.toHaveBeenCalled()
  })

  test("a template step is allowed through on a standby thread and never changes ownership", async () => {
    await sendFlowStepToChannel({
      ...flowStepArgs,
      contactInbox: standbyRecently as never,
      isTemplateMessage: true,
    })

    expect(mocks.runChannelHandler).toHaveBeenCalledTimes(1)
    expect(mocks.recordEvent).not.toHaveBeenCalled()
  })

  test("an idle thread is allowed and a Service step records serviceSent", async () => {
    await sendFlowStepToChannel({
      ...flowStepArgs,
      contactInbox: {
        ...baseContactInbox,
        threadControlState: "idle",
        threadControlUpdatedAt: iso(HOUR),
      } as never,
    })

    expect(mocks.runChannelHandler).toHaveBeenCalledTimes(1)
    expect(mocks.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "serviceSent",
        conversationId: "conv-1",
      }),
    )
  })

  test("a never-observed thread sends with no routing write", async () => {
    await sendFlowStepToChannel({
      ...flowStepArgs,
      contactInbox: baseContactInbox as never,
    })

    expect(mocks.runChannelHandler).toHaveBeenCalledTimes(1)
    expect(mocks.recordEvent).not.toHaveBeenCalled()
  })

  test("a Meta ownership rejection is reconciled through the same path and the original error is rethrown unchanged", async () => {
    const error = rejection(REJECTION_CODE)
    mocks.runChannelHandler.mockRejectedValue(error)

    await expect(
      sendFlowStepToChannel({
        ...flowStepArgs,
        contactInbox: baseContactInbox as never,
      }),
    ).rejects.toBe(error)

    expect(mocks.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "serviceRejected",
        conversationId: "conv-1",
      }),
    )
  })

  test("an unrelated failure is rethrown unchanged with no routing write", async () => {
    const error = new Error("boom")
    mocks.runChannelHandler.mockRejectedValue(error)

    await expect(
      sendFlowStepToChannel({
        ...flowStepArgs,
        contactInbox: baseContactInbox as never,
      }),
    ).rejects.toBe(error)

    expect(mocks.recordEvent).not.toHaveBeenCalled()
  })
})
