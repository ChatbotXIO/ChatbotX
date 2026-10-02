import { describe, expect, test, vi } from "vitest"
import { createWebchatFrameHandler } from "@/features/integration-webchat/lib/webchat-realtime-frames"

const validMessage = (id: string, messageType = "incoming") => ({
  id,
  conversationId: "conv_1",
  contactInboxId: "inbox_1",
  workspaceId: "ws_1",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  messageType,
  contentType: "text",
  senderType: "contact",
  type: "message",
  text: null,
  contentAttributes: null,
  senderId: null,
  sourceId: null,
  deletedAt: null,
  parentId: null,
  attributes: null,
  sendError: null,
})

const messageCreatedFrame = (seq: string, id: string): string =>
  JSON.stringify({
    batch: [{ data: validMessage(id), eventType: "messageCreated" }],
    seq,
  })

describe("createWebchatFrameHandler", () => {
  test("dispatches every event in a valid batch", () => {
    const onMessage = vi.fn()
    const handler = createWebchatFrameHandler({
      onMessage,
      onParseError: vi.fn(),
      onResyncNeeded: vi.fn(),
      onTyping: vi.fn(),
    })

    handler.handleFrame(messageCreatedFrame("5-0", "m1"))

    expect(onMessage).toHaveBeenCalledTimes(1)
    expect(onMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: "m1" }),
    )
  })

  test("drops a replayed frame with the same seq", () => {
    const onMessage = vi.fn()
    const handler = createWebchatFrameHandler({
      onMessage,
      onParseError: vi.fn(),
      onResyncNeeded: vi.fn(),
      onTyping: vi.fn(),
    })
    const frame = messageCreatedFrame("5-0", "m1")

    handler.handleFrame(frame)
    handler.handleFrame(frame)

    expect(onMessage).toHaveBeenCalledTimes(1)
  })

  test("ignores an older seq but accepts a newer one", () => {
    const onMessage = vi.fn()
    const handler = createWebchatFrameHandler({
      onMessage,
      onParseError: vi.fn(),
      onResyncNeeded: vi.fn(),
      onTyping: vi.fn(),
    })

    handler.handleFrame(messageCreatedFrame("5-0", "m1"))
    handler.handleFrame(messageCreatedFrame("3-0", "m2"))
    handler.handleFrame(messageCreatedFrame("6-0", "m3"))

    expect(onMessage).toHaveBeenCalledTimes(2)
    expect(onMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: "m1" }),
    )
    expect(onMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: "m3" }),
    )
  })

  test("reset() re-accepts a previously seen seq for a new connection", () => {
    const onMessage = vi.fn()
    const handler = createWebchatFrameHandler({
      onMessage,
      onParseError: vi.fn(),
      onResyncNeeded: vi.fn(),
      onTyping: vi.fn(),
    })
    const frame = messageCreatedFrame("5-0", "m1")

    handler.handleFrame(frame)
    handler.reset()
    handler.handleFrame(frame)

    expect(onMessage).toHaveBeenCalledTimes(2)
  })

  test("ignores a heartbeat frame without dispatching or reporting a parse error", () => {
    const onMessage = vi.fn()
    const onParseError = vi.fn()
    const handler = createWebchatFrameHandler({
      onMessage,
      onParseError,
      onResyncNeeded: vi.fn(),
      onTyping: vi.fn(),
    })

    handler.handleFrame(JSON.stringify({ hb: 1 }))

    expect(onMessage).not.toHaveBeenCalled()
    expect(onParseError).not.toHaveBeenCalled()
  })

  test("reports a parse error instead of forwarding a null or malformed messageCreated payload", () => {
    // Regression for PR #1349 finding #6: `event.data as MessageResource`
    // trusted the wire payload unchecked — a null payload threw inside the
    // try block (reported as a generic parse error) and a malformed object
    // reached `onMessage` as-is.
    const onMessage = vi.fn()
    const onParseError = vi.fn()
    const onResyncNeeded = vi.fn()
    const handler = createWebchatFrameHandler({
      onMessage,
      onParseError,
      onResyncNeeded,
      onTyping: vi.fn(),
    })

    handler.handleFrame(
      JSON.stringify({
        batch: [{ data: null, eventType: "messageCreated" }],
        seq: "1-0",
      }),
    )
    handler.handleFrame(
      JSON.stringify({
        batch: [{ data: { unexpected: "shape" }, eventType: "messageCreated" }],
        seq: "2-0",
      }),
    )

    expect(onMessage).not.toHaveBeenCalled()
    expect(onParseError).toHaveBeenCalledTimes(2)
    // Throttled (round-5 finding): two invalid payloads this close together
    // share one resync signal instead of storming onResyncNeeded.
    expect(onResyncNeeded).toHaveBeenCalledTimes(1)
  })
})
