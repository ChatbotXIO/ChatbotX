import { messageEventTypeSchema } from "@chatbotx.io/flow-config"
import { describe, expect, test, vi } from "vitest"

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

const { messageListeners } = await import("../src/events/message/listener")

function listenerNames(eventType: keyof typeof messageEventTypeSchema.enum) {
  return (
    messageListeners[messageEventTypeSchema.enum[eventType]]?.map(
      (listener) => listener.name,
    ) ?? []
  )
}

describe("messageListeners", () => {
  test("registers active-hourly only for real message activity", () => {
    expect(listenerNames("message:sent")).toContain("active-hourly")
    expect(listenerNames("message:received")).toContain("active-hourly")

    expect(listenerNames("message:delivered")).not.toContain("active-hourly")
    expect(listenerNames("message:seen")).not.toContain("active-hourly")
    expect(listenerNames("message:failed")).not.toContain("active-hourly")
  })
})
