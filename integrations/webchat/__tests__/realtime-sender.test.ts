import { beforeEach, describe, expect, test, vi } from "vitest"
import { sendTyping } from "../src/handlers/conversation"
import { sendMessage } from "../src/handlers/message"

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }))

vi.mock("ky", () => ({ default: { post: postMock } }))

const internalRealtimeUrl = "http://realtime:1999/"
const headers = { Authorization: "Bearer signed-token" }

const createMessageProps = (): Parameters<typeof sendMessage>[0] =>
  ({
    ctx: {
      platform: {
        getRealtimeBroadcastAuthHeaders: vi.fn(async () => headers),
        internalRealtimeUrl,
      },
    },
    data: {
      contact: { sourceId: "guest_1" },
      message: { id: "message_1" },
    },
  }) as Parameters<typeof sendMessage>[0]

const createTypingProps = (): Parameters<typeof sendTyping>[0] =>
  ({
    ctx: {
      platform: {
        getRealtimeBroadcastAuthHeaders: vi.fn(async () => headers),
        internalRealtimeUrl,
      },
    },
    data: {
      contact: { sourceId: "guest_1" },
      typing: true,
    },
  }) as Parameters<typeof sendTyping>[0]

beforeEach(() => {
  postMock.mockReset()
  postMock.mockReturnValue({ json: vi.fn(), text: vi.fn() })
})

describe("webchat realtime senders", () => {
  test("sends messages to the internal realtime endpoint", async () => {
    await sendMessage(createMessageProps())

    expect(postMock).toHaveBeenCalledWith("parties/guests/guest_1", {
      baseUrl: internalRealtimeUrl,
      headers,
      json: {
        data: { id: "message_1" },
        eventType: "messageCreated",
      },
    })
  })

  test("sends typing events to the internal realtime endpoint", async () => {
    await sendTyping(createTypingProps())

    expect(postMock).toHaveBeenCalledWith("parties/guests/guest_1", {
      baseUrl: internalRealtimeUrl,
      headers,
      json: {
        data: { typing: true },
        eventType: "typing",
      },
    })
  })
})
