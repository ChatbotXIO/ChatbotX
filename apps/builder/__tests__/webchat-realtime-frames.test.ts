import { describe, expect, test, vi } from "vitest"
import { createWebchatFrameHandler } from "@/features/integration-webchat/lib/webchat-realtime-frames"

const messageCreatedFrame = (seq: string, id: string): string =>
  JSON.stringify({
    batch: [{ data: { id }, eventType: "messageCreated" }],
    seq,
  })

describe("createWebchatFrameHandler", () => {
  test("dispatches every event in a valid batch", () => {
    const onMessage = vi.fn()
    const handler = createWebchatFrameHandler({
      onMessage,
      onParseError: vi.fn(),
      onTyping: vi.fn(),
    })

    handler.handleFrame(messageCreatedFrame("5-0", "m1"))

    expect(onMessage).toHaveBeenCalledTimes(1)
    expect(onMessage).toHaveBeenCalledWith({ id: "m1" })
  })

  test("drops a replayed frame with the same seq", () => {
    const onMessage = vi.fn()
    const handler = createWebchatFrameHandler({
      onMessage,
      onParseError: vi.fn(),
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
      onTyping: vi.fn(),
    })

    handler.handleFrame(messageCreatedFrame("5-0", "m1"))
    handler.handleFrame(messageCreatedFrame("3-0", "m2"))
    handler.handleFrame(messageCreatedFrame("6-0", "m3"))

    expect(onMessage).toHaveBeenCalledTimes(2)
    expect(onMessage).toHaveBeenNthCalledWith(1, { id: "m1" })
    expect(onMessage).toHaveBeenNthCalledWith(2, { id: "m3" })
  })

  test("reset() re-accepts a previously seen seq for a new connection", () => {
    const onMessage = vi.fn()
    const handler = createWebchatFrameHandler({
      onMessage,
      onParseError: vi.fn(),
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
      onTyping: vi.fn(),
    })

    handler.handleFrame(JSON.stringify({ hb: 1 }))

    expect(onMessage).not.toHaveBeenCalled()
    expect(onParseError).not.toHaveBeenCalled()
  })
})
