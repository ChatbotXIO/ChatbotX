import { EVENT_BUS_MESSAGE_ID } from "@chatbotx.io/event-bus"
import { messageEventTypeSchema } from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockRecordSendFailure,
  mockEnqueueContactRepliedEvaluation,
  mockFindWorkspaceIntegrationByInboxId,
  mockHasEnabledTriggerRule,
} = vi.hoisted(() => ({
  mockRecordSendFailure: vi.fn().mockResolvedValue(undefined),
  mockEnqueueContactRepliedEvaluation: vi.fn().mockResolvedValue(undefined),
  mockFindWorkspaceIntegrationByInboxId: vi.fn(),
  mockHasEnabledTriggerRule: vi.fn(),
}))

const makeService = (methods: string[]) =>
  Object.fromEntries(methods.map((method) => [method, vi.fn()]))

vi.mock("@chatbotx.io/analytics", () => ({
  broadcastAnalyticsService: makeService([
    "onMessageSent",
    "onFailed",
    "onDelivered",
    "onSeen",
  ]),
  contactAnalyticsService: makeService(["handleBlocked"]),
  flowAnalyticsService: makeService([
    "onMessageSent",
    "onMessageFailed",
    "onMessageDelivered",
  ]),
  macTrackingService: makeService([
    "trackMessageOut",
    "trackMessageOutHourly",
    "trackMessageIn",
    "trackMessageInHourly",
  ]),
  sequenceAnalyticsService: makeService([
    "onMessageSent",
    "onFailed",
    "onDelivered",
    "onSeen",
  ]),
}))

vi.mock("@chatbotx.io/business", () => ({
  contactInboxService: {
    recordSendFailure: mockRecordSendFailure,
  },
  adsConversionService: {
    enqueueContactRepliedEvaluation: mockEnqueueContactRepliedEvaluation,
    hasEnabledTriggerRule: mockHasEnabledTriggerRule,
    isEligibleChannel: (channel: unknown) => channel === "whatsapp",
  },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  integrationWhatsappRepository: {
    findWorkspaceIntegrationByInboxId: mockFindWorkspaceIntegrationByInboxId,
  },
}))

const { messageListeners } = await import("../src/events/message/listener")

function listenerNames(eventType: keyof typeof messageEventTypeSchema.enum) {
  return (
    messageListeners[messageEventTypeSchema.enum[eventType]]?.map(
      (listener) => listener.name,
    ) ?? []
  )
}

function failedListener() {
  const listener = messageListeners[
    messageEventTypeSchema.enum["message:failed"]
  ]?.find((candidate) => candidate.name === "contact-inbox-send-failure")

  if (!listener?.handler) {
    throw new Error("contact-inbox-send-failure listener is missing")
  }

  return listener
}

function contactRepliedListener() {
  const listener = messageListeners[
    messageEventTypeSchema.enum["message:received"]
  ]?.find((candidate) => candidate.name === "ads-conversion-contact-replied")

  if (!listener?.handler) {
    throw new Error("ads-conversion-contact-replied listener is missing")
  }

  return listener
}

describe("messageListeners", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRecordSendFailure.mockResolvedValue(undefined)
    mockEnqueueContactRepliedEvaluation.mockResolvedValue(undefined)
    mockFindWorkspaceIntegrationByInboxId.mockResolvedValue({
      id: "iw-1",
      wabaId: "waba-1",
    })
    mockHasEnabledTriggerRule.mockResolvedValue(true)
  })

  test("registers active-hourly only for real message activity", () => {
    expect(listenerNames("message:sent")).toContain("active-hourly")
    expect(listenerNames("message:received")).toContain("active-hourly")

    expect(listenerNames("message:delivered")).not.toContain("active-hourly")
    expect(listenerNames("message:seen")).not.toContain("active-hourly")
    expect(listenerNames("message:failed")).not.toContain("active-hourly")
  })

  test("records contact inbox send failures from message:failed events", async () => {
    await failedListener().handler?.([
      {
        context: {
          workspaceId: "ws-1",
          contactId: "contact-1",
          conversationId: "conv-1",
          channel: "messenger",
          contactInboxId: "ci-1",
        },
        action: { messageId: "msg-1" },
        errorData: { message: "provider rejected message" },
        occurredAt: new Date("2026-07-09T00:00:00.000Z"),
      },
    ])

    expect(mockRecordSendFailure).toHaveBeenCalledWith({
      contactInboxId: "ci-1",
      contactId: "contact-1",
      workspaceId: "ws-1",
      error: "provider rejected message",
    })
  })

  test("skips failures that do not include contactInboxId", async () => {
    await failedListener().handler?.([
      {
        context: {
          workspaceId: "ws-1",
          contactId: "contact-1",
          conversationId: "conv-1",
          channel: "messenger",
        },
        action: { messageId: "msg-1" },
        errorData: { message: "provider rejected message" },
        occurredAt: new Date("2026-07-09T00:00:00.000Z"),
      },
    ])

    expect(mockRecordSendFailure).not.toHaveBeenCalled()
  })

  test("returns failed event ids when contact inbox update fails", async () => {
    mockRecordSendFailure.mockRejectedValueOnce(new Error("database down"))

    const result = await failedListener().handler?.([
      {
        [EVENT_BUS_MESSAGE_ID]: "stream-1-0",
        context: {
          workspaceId: "ws-1",
          contactId: "contact-1",
          conversationId: "conv-1",
          channel: "messenger",
          contactInboxId: "ci-1",
        },
        action: { messageId: "msg-1" },
        errorData: "provider rejected message",
        occurredAt: new Date("2026-07-09T00:00:00.000Z"),
      },
    ])

    expect(result).toEqual({ failedMessageIds: ["stream-1-0"] })
  })

  test("registers the ads-conversion contact-replied listener on message:received", () => {
    expect(listenerNames("message:received")).toContain(
      "ads-conversion-contact-replied",
    )
  })

  test("enqueues contactReplied evaluation for inbound whatsapp payloads", async () => {
    await contactRepliedListener().handler?.([
      {
        workspaceId: "ws-1",
        contactId: "contact-1",
        contactInboxId: "ci-1",
        channel: "whatsapp",
        inboxId: "inbox-1",
        occurredAt: new Date("2026-08-11T00:00:00.000Z"),
        origin: "inbound",
        messageId: "msg-1",
        isFirstIncomingMessage: true,
      },
    ])

    expect(mockFindWorkspaceIntegrationByInboxId).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      inboxId: "inbox-1",
    })
    expect(mockEnqueueContactRepliedEvaluation).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      integrationWhatsappId: "iw-1",
      contactInboxId: "ci-1",
      isFirstReply: true,
      messageId: "msg-1",
    })
  })

  test("ignores payloads without origin: 'inbound' (e.g. delivery-status echoes)", async () => {
    await contactRepliedListener().handler?.([
      {
        workspaceId: "ws-1",
        contactId: "contact-1",
        contactInboxId: "ci-1",
        channel: "whatsapp",
        inboxId: "inbox-1",
        occurredAt: new Date("2026-08-11T00:00:00.000Z"),
        messageId: "msg-1",
        // origin is intentionally omitted — this is the delivery-status shape
        // emitted from message-status.ts, not a genuine inbound message.
      },
    ])

    expect(mockFindWorkspaceIntegrationByInboxId).not.toHaveBeenCalled()
    expect(mockEnqueueContactRepliedEvaluation).not.toHaveBeenCalled()
  })

  test("ignores inbound payloads on non-whatsapp channels", async () => {
    await contactRepliedListener().handler?.([
      {
        workspaceId: "ws-1",
        contactId: "contact-1",
        contactInboxId: "ci-1",
        channel: "messenger",
        inboxId: "inbox-1",
        occurredAt: new Date("2026-08-11T00:00:00.000Z"),
        origin: "inbound",
        messageId: "msg-1",
      },
    ])

    expect(mockEnqueueContactRepliedEvaluation).not.toHaveBeenCalled()
  })

  test("resolves integrationWhatsappId once per inboxId across a batch", async () => {
    await contactRepliedListener().handler?.([
      {
        workspaceId: "ws-1",
        contactId: "contact-1",
        contactInboxId: "ci-1",
        channel: "whatsapp",
        inboxId: "inbox-1",
        occurredAt: new Date("2026-08-11T00:00:00.000Z"),
        origin: "inbound",
        messageId: "msg-1",
        isFirstIncomingMessage: true,
      },
      {
        workspaceId: "ws-1",
        contactId: "contact-2",
        contactInboxId: "ci-2",
        channel: "whatsapp",
        inboxId: "inbox-1",
        occurredAt: new Date("2026-08-11T00:00:01.000Z"),
        origin: "inbound",
        messageId: "msg-2",
        isFirstIncomingMessage: false,
      },
    ])

    expect(mockFindWorkspaceIntegrationByInboxId).toHaveBeenCalledTimes(1)
    expect(mockEnqueueContactRepliedEvaluation).toHaveBeenCalledTimes(2)
    expect(mockEnqueueContactRepliedEvaluation).toHaveBeenNthCalledWith(1, {
      workspaceId: "ws-1",
      integrationWhatsappId: "iw-1",
      contactInboxId: "ci-1",
      isFirstReply: true,
      messageId: "msg-1",
    })
    expect(mockEnqueueContactRepliedEvaluation).toHaveBeenNthCalledWith(2, {
      workspaceId: "ws-1",
      integrationWhatsappId: "iw-1",
      contactInboxId: "ci-2",
      isFirstReply: false,
      messageId: "msg-2",
    })
  })

  test("skips enqueue when the inbox has no WhatsApp integration", async () => {
    mockFindWorkspaceIntegrationByInboxId.mockResolvedValue(null)

    await contactRepliedListener().handler?.([
      {
        workspaceId: "ws-1",
        contactId: "contact-1",
        contactInboxId: "ci-1",
        channel: "whatsapp",
        inboxId: "inbox-1",
        occurredAt: new Date("2026-08-11T00:00:00.000Z"),
        origin: "inbound",
        messageId: "msg-1",
      },
    ])

    expect(mockEnqueueContactRepliedEvaluation).not.toHaveBeenCalled()
  })

  test("defaults isFirstReply to false when isFirstIncomingMessage is omitted", async () => {
    await contactRepliedListener().handler?.([
      {
        workspaceId: "ws-1",
        contactId: "contact-1",
        contactInboxId: "ci-1",
        channel: "whatsapp",
        inboxId: "inbox-1",
        occurredAt: new Date("2026-08-11T00:00:00.000Z"),
        origin: "inbound",
        messageId: "msg-1",
      },
    ])

    expect(mockEnqueueContactRepliedEvaluation).toHaveBeenCalledWith(
      expect.objectContaining({ isFirstReply: false }),
    )
  })

  test("skips enqueue when the integration has no enabled contactReplied rule", async () => {
    mockHasEnabledTriggerRule.mockResolvedValue(false)

    await contactRepliedListener().handler?.([
      {
        workspaceId: "ws-1",
        contactId: "contact-1",
        contactInboxId: "ci-1",
        channel: "whatsapp",
        inboxId: "inbox-1",
        occurredAt: new Date("2026-08-11T00:00:00.000Z"),
        origin: "inbound",
        messageId: "msg-1",
      },
    ])

    expect(mockHasEnabledTriggerRule).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      integrationWhatsappId: "iw-1",
      triggerType: "contactReplied",
    })
    expect(mockEnqueueContactRepliedEvaluation).not.toHaveBeenCalled()
  })

  test("skips a payload when contactReplied gating fails and continues the batch", async () => {
    mockHasEnabledTriggerRule
      .mockRejectedValueOnce(new Error("gate unavailable"))
      .mockResolvedValueOnce(true)

    await expect(
      contactRepliedListener().handler?.([
        {
          workspaceId: "ws-1",
          contactId: "contact-1",
          contactInboxId: "ci-1",
          channel: "whatsapp",
          inboxId: "inbox-1",
          occurredAt: new Date("2026-08-11T00:00:00.000Z"),
          origin: "inbound",
          messageId: "msg-1",
        },
        {
          workspaceId: "ws-1",
          contactId: "contact-2",
          contactInboxId: "ci-2",
          channel: "whatsapp",
          inboxId: "inbox-2",
          occurredAt: new Date("2026-08-11T00:00:01.000Z"),
          origin: "inbound",
          messageId: "msg-2",
        },
      ]),
    ).resolves.toBeUndefined()

    expect(mockHasEnabledTriggerRule).toHaveBeenCalledTimes(2)
    expect(mockEnqueueContactRepliedEvaluation).toHaveBeenCalledTimes(1)
    expect(mockEnqueueContactRepliedEvaluation).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      integrationWhatsappId: "iw-1",
      contactInboxId: "ci-2",
      isFirstReply: false,
      messageId: "msg-2",
    })
  })

  test("checks hasEnabledTriggerRule once per integrationWhatsappId across a batch", async () => {
    await contactRepliedListener().handler?.([
      {
        workspaceId: "ws-1",
        contactId: "contact-1",
        contactInboxId: "ci-1",
        channel: "whatsapp",
        inboxId: "inbox-1",
        occurredAt: new Date("2026-08-11T00:00:00.000Z"),
        origin: "inbound",
        messageId: "msg-1",
        isFirstIncomingMessage: true,
      },
      {
        workspaceId: "ws-1",
        contactId: "contact-2",
        contactInboxId: "ci-2",
        channel: "whatsapp",
        inboxId: "inbox-1",
        occurredAt: new Date("2026-08-11T00:00:01.000Z"),
        origin: "inbound",
        messageId: "msg-2",
        isFirstIncomingMessage: false,
      },
    ])

    expect(mockHasEnabledTriggerRule).toHaveBeenCalledTimes(1)
    expect(mockEnqueueContactRepliedEvaluation).toHaveBeenCalledTimes(2)
  })
})
