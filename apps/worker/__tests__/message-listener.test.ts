import { EVENT_BUS_MESSAGE_ID } from "@chatbotx.io/event-bus"
import { messageEventTypeSchema } from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockRecordSendFailure,
  mockEnqueueContactRepliedEvaluation,
  mockFindWorkspaceIntegrationByInboxId,
  mockFindMessengerIntegrationByInboxId,
  mockFindInstagramIntegrationByInboxId,
  mockHasEnabledTriggerRule,
  mockRecordDelivered,
} = vi.hoisted(() => ({
  mockRecordSendFailure: vi.fn().mockResolvedValue(undefined),
  mockEnqueueContactRepliedEvaluation: vi.fn().mockResolvedValue(undefined),
  mockFindWorkspaceIntegrationByInboxId: vi.fn(),
  mockFindMessengerIntegrationByInboxId: vi.fn(),
  mockFindInstagramIntegrationByInboxId: vi.fn(),
  mockHasEnabledTriggerRule: vi.fn(),
  mockRecordDelivered: vi.fn().mockResolvedValue(true),
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
  commentAutomationAnalyticsService: makeService(["onSeen"]),
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
  contactActivityService: { recordDelivered: mockRecordDelivered },
  contactInboxService: {
    recordSendFailure: mockRecordSendFailure,
  },
  adsConversionService: {
    enqueueContactRepliedEvaluation: mockEnqueueContactRepliedEvaluation,
    hasEnabledTriggerRule: mockHasEnabledTriggerRule,
    // Mirrors the real CTWA_ELIGIBLE_CHANNELS set post-flip (whatsapp +
    // messenger + instagram) — independent of the real implementation since
    // this is mocked, but exercises the same 3-channel dispatch the listener
    // code now supports.
    isEligibleChannel: (channel: unknown) =>
      channel === "whatsapp" ||
      channel === "messenger" ||
      channel === "instagram",
  },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  integrationWhatsappRepository: {
    findWorkspaceIntegrationByInboxId: mockFindWorkspaceIntegrationByInboxId,
  },
  integrationMessengerRepository: {
    findWorkspaceIntegrationByInboxId: mockFindMessengerIntegrationByInboxId,
  },
  integrationInstagramRepository: {
    findWorkspaceIntegrationByInboxId: mockFindInstagramIntegrationByInboxId,
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
    mockFindMessengerIntegrationByInboxId.mockResolvedValue({ id: "im-1" })
    mockFindInstagramIntegrationByInboxId.mockResolvedValue({ id: "ii-1" })
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
      channel: "whatsapp",
      integrationId: "iw-1",
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

  test("ignores inbound payloads on non-ads-eligible channels (e.g. telegram)", async () => {
    await contactRepliedListener().handler?.([
      {
        workspaceId: "ws-1",
        contactId: "contact-1",
        contactInboxId: "ci-1",
        channel: "telegram",
        inboxId: "inbox-1",
        occurredAt: new Date("2026-08-11T00:00:00.000Z"),
        origin: "inbound",
        messageId: "msg-1",
      },
    ])

    expect(mockFindWorkspaceIntegrationByInboxId).not.toHaveBeenCalled()
    expect(mockFindMessengerIntegrationByInboxId).not.toHaveBeenCalled()
    expect(mockFindInstagramIntegrationByInboxId).not.toHaveBeenCalled()
    expect(mockEnqueueContactRepliedEvaluation).not.toHaveBeenCalled()
  })

  test("resolves the Messenger integration and enqueues a messenger-channel evaluation", async () => {
    await contactRepliedListener().handler?.([
      {
        workspaceId: "ws-1",
        contactId: "contact-1",
        contactInboxId: "ci-1",
        channel: "messenger",
        inboxId: "inbox-messenger-1",
        occurredAt: new Date("2026-08-11T00:00:00.000Z"),
        origin: "inbound",
        messageId: "msg-1",
        isFirstIncomingMessage: true,
      },
    ])

    expect(mockFindMessengerIntegrationByInboxId).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      inboxId: "inbox-messenger-1",
    })
    expect(mockFindWorkspaceIntegrationByInboxId).not.toHaveBeenCalled()
    expect(mockHasEnabledTriggerRule).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      channel: "messenger",
      integrationId: "im-1",
      triggerType: "contactReplied",
    })
    expect(mockEnqueueContactRepliedEvaluation).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      channel: "messenger",
      integrationId: "im-1",
      contactInboxId: "ci-1",
      isFirstReply: true,
      messageId: "msg-1",
    })
  })

  test("keeps whatsapp and messenger integration id caches separate within the same batch", async () => {
    mockFindWorkspaceIntegrationByInboxId.mockResolvedValue({ id: "same-id" })
    mockFindMessengerIntegrationByInboxId.mockResolvedValue({ id: "same-id" })

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
      {
        workspaceId: "ws-1",
        contactId: "contact-2",
        contactInboxId: "ci-2",
        channel: "messenger",
        inboxId: "inbox-2",
        occurredAt: new Date("2026-08-11T00:00:01.000Z"),
        origin: "inbound",
        messageId: "msg-2",
      },
    ])

    expect(mockHasEnabledTriggerRule).toHaveBeenCalledTimes(2)
    expect(mockHasEnabledTriggerRule).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "whatsapp",
        integrationId: "same-id",
      }),
    )
    expect(mockHasEnabledTriggerRule).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "messenger",
        integrationId: "same-id",
      }),
    )
    expect(mockEnqueueContactRepliedEvaluation).toHaveBeenCalledTimes(2)
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
      channel: "whatsapp",
      integrationId: "iw-1",
      contactInboxId: "ci-1",
      isFirstReply: true,
      messageId: "msg-1",
    })
    expect(mockEnqueueContactRepliedEvaluation).toHaveBeenNthCalledWith(2, {
      workspaceId: "ws-1",
      channel: "whatsapp",
      integrationId: "iw-1",
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
      channel: "whatsapp",
      integrationId: "iw-1",
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
      channel: "whatsapp",
      integrationId: "iw-1",
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

  describe("last-delivered listener", () => {
    const lastDeliveredListener = () => {
      const listener = messageListeners[
        messageEventTypeSchema.enum["message:delivered"]
      ]?.find((candidate) => candidate.name === "last-delivered")
      if (!listener?.handler) {
        throw new Error("last-delivered listener is missing")
      }
      return listener
    }

    const delivered = (overrides: Record<string, unknown> = {}) => ({
      context: {
        workspaceId: "ws-1",
        contactId: "contact-1",
        conversationId: "conv-1",
        channel: "whatsapp",
      },
      action: { messageId: "msg-1" },
      occurredAt: new Date("2026-07-09T00:10:00.000Z"),
      ...overrides,
    })

    beforeEach(() => {
      mockRecordDelivered.mockResolvedValue(true)
    })

    test("is registered on message:delivered only", () => {
      expect(listenerNames("message:delivered")).toContain("last-delivered")
      expect(listenerNames("message:sent")).not.toContain("last-delivered")
    })

    test("prefers the provider's delivery time over the processing time", async () => {
      await lastDeliveredListener().handler?.([
        delivered({
          providerOccurredAt: new Date("2026-07-09T00:05:00.000Z"),
        }),
      ])

      expect(mockRecordDelivered).toHaveBeenCalledWith({
        records: [
          {
            contactId: "contact-1",
            deliveredAt: new Date("2026-07-09T00:05:00.000Z"),
          },
        ],
        workspaceId: "ws-1",
      })
    })

    test("falls back to occurredAt, including when the bus delivers it as a string", async () => {
      await lastDeliveredListener().handler?.([
        delivered({ occurredAt: "2026-07-09T00:10:00.000Z" }),
      ])

      expect(
        mockRecordDelivered.mock.calls[0]?.[0].records[0].deliveredAt,
      ).toEqual(new Date("2026-07-09T00:10:00.000Z"))
    })

    test("clamps a provider clock that is ahead so the state cannot be pinned to the future", async () => {
      const before = Date.now()
      await lastDeliveredListener().handler?.([
        delivered({ providerOccurredAt: new Date("2999-01-01T00:00:00.000Z") }),
      ])

      const recorded =
        mockRecordDelivered.mock.calls[0]?.[0].records[0].deliveredAt.getTime()
      expect(recorded).toBeGreaterThanOrEqual(before)
      expect(recorded).toBeLessThanOrEqual(Date.now())
    })

    test("writes one fenced call per workspace", async () => {
      await lastDeliveredListener().handler?.([
        delivered(),
        delivered({
          context: {
            workspaceId: "ws-2",
            contactId: "contact-9",
            conversationId: "conv-9",
            channel: "whatsapp",
          },
        }),
        delivered({ occurredAt: new Date("2026-07-09T00:20:00.000Z") }),
      ])

      expect(mockRecordDelivered).toHaveBeenCalledTimes(2)
      const byWorkspace = Object.fromEntries(
        mockRecordDelivered.mock.calls.map(([arg]) => [
          arg.workspaceId,
          arg.records.length,
        ]),
      )
      expect(byWorkspace).toEqual({ "ws-1": 2, "ws-2": 1 })
    })

    test("logs a failed workspace group and still records the others", async () => {
      mockRecordDelivered
        .mockRejectedValueOnce(new Error("database down"))
        .mockResolvedValueOnce(true)

      const result = await lastDeliveredListener().handler?.([
        delivered({ [EVENT_BUS_MESSAGE_ID]: "stream-1-0" }),
        delivered({
          [EVENT_BUS_MESSAGE_ID]: "stream-2-0",
          context: {
            workspaceId: "ws-2",
            contactId: "contact-9",
            conversationId: "conv-9",
            channel: "whatsapp",
          },
        }),
      ])

      // The bus acks the whole batch regardless, so nothing is reported back.
      expect(result).toBeUndefined()
      expect(mockRecordDelivered).toHaveBeenCalledTimes(2)
    })
  })
})
