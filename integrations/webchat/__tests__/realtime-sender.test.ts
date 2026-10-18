import { beforeEach, describe, expect, test, vi } from "vitest"
import { sendTyping } from "../src/handlers/conversation"
import { sendMessage } from "../src/handlers/message"

const publishGuestRealtimeEvent = vi.fn()

const createMessageProps = (): Parameters<typeof sendMessage>[0] =>
  ({
    ctx: {
      platform: { publishGuestRealtimeEvent },
    },
    data: {
      contact: { sourceId: "guest_1" },
      message: { id: "message_1" },
    },
  }) as Parameters<typeof sendMessage>[0]

const createTypingProps = (): Parameters<typeof sendTyping>[0] =>
  ({
    ctx: {
      platform: { publishGuestRealtimeEvent },
    },
    data: {
      contact: { sourceId: "guest_1" },
      typing: true,
    },
  }) as Parameters<typeof sendTyping>[0]

beforeEach(() => {
  publishGuestRealtimeEvent.mockReset()
  publishGuestRealtimeEvent.mockResolvedValue(undefined)
})

describe("webchat realtime senders", () => {
  test("publishes messages through the guest realtime transport", async () => {
    await sendMessage(createMessageProps())

    expect(publishGuestRealtimeEvent).toHaveBeenCalledWith("guest_1", {
      data: { id: "message_1" },
      eventType: "messageCreated",
    })
  })

  test("publishes typing events through the guest realtime transport", async () => {
    await sendTyping(createTypingProps())

    expect(publishGuestRealtimeEvent).toHaveBeenCalledWith("guest_1", {
      data: { typing: true },
      eventType: "typing",
    })
  })
})
