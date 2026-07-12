import { EVENT_BUS_MESSAGE_ID } from "@chatbotx.io/event-bus"
import { messageEventTypeSchema } from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockRecordSendFailure } = vi.hoisted(() => ({
  mockRecordSendFailure: vi.fn().mockResolvedValue(undefined),
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

describe("messageListeners", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRecordSendFailure.mockResolvedValue(undefined)
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
})
