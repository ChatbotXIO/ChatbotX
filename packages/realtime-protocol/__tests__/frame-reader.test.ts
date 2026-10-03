import { describe, expect, test, vi } from "vitest"
import { createRealtimeFrameReader } from "../src/frame-reader"
import { realtimeGuestBatchEnvelopeSchema } from "../src/schemas"

const makeReader = (
  overrides: Partial<Parameters<typeof createRealtimeFrameReader>[0]> = {},
) => {
  const onParseError = vi.fn()
  const onResyncNeeded = vi.fn()
  const reader = createRealtimeFrameReader({
    onParseError,
    onResyncNeeded,
    schema: realtimeGuestBatchEnvelopeSchema,
    ...overrides,
  })
  return { onParseError, onResyncNeeded, reader }
}

describe("createRealtimeFrameReader", () => {
  test("returns the batch for a valid frame and advances the seq cursor", () => {
    const { reader } = makeReader()
    expect(reader.getLastSeq()).toBeNull()

    const batch = reader.readFrame(
      JSON.stringify({
        batch: [{ data: { id: "m1" }, eventType: "messageCreated" }],
        seq: "5-0",
      }),
    )

    expect(batch).toEqual([{ data: { id: "m1" }, eventType: "messageCreated" }])
    expect(reader.getLastSeq()).toBe("5-0")
  })

  test("getLastSeq() is unaffected by a frame readFrame rejects", () => {
    const { reader } = makeReader()
    reader.readFrame(
      JSON.stringify({
        batch: [{ data: {}, eventType: "typing" }],
        seq: "5-0",
      }),
    )

    reader.readFrame(JSON.stringify({ not: "valid" }))

    expect(reader.getLastSeq()).toBe("5-0")
  })

  test("ignores a heartbeat frame without dispatching or reporting a parse error", () => {
    const { onParseError, reader } = makeReader()

    const batch = reader.readFrame(JSON.stringify({ hb: 1 }))

    expect(batch).toBeNull()
    expect(onParseError).not.toHaveBeenCalled()
  })

  test("reports malformed JSON and triggers a resync", () => {
    const { onParseError, onResyncNeeded, reader } = makeReader()

    const batch = reader.readFrame("not-json")

    expect(batch).toBeNull()
    expect(onParseError).toHaveBeenCalledTimes(1)
    expect(onResyncNeeded).toHaveBeenCalledTimes(1)
  })

  test("reports and resyncs on a schema-invalid frame", () => {
    const { onParseError, onResyncNeeded, reader } = makeReader()

    const batch = reader.readFrame(JSON.stringify({ not: "a valid frame" }))

    expect(batch).toBeNull()
    expect(onParseError).toHaveBeenCalledTimes(1)
    expect(onResyncNeeded).toHaveBeenCalledTimes(1)
  })

  test("drops a replayed frame with a seq that isn't after the last one seen", () => {
    const { reader } = makeReader()
    reader.readFrame(
      JSON.stringify({
        batch: [{ data: {}, eventType: "typing" }],
        seq: "5-0",
      }),
    )

    const replayed = reader.readFrame(
      JSON.stringify({
        batch: [{ data: {}, eventType: "typing" }],
        seq: "5-0",
      }),
    )

    expect(replayed).toBeNull()
  })

  test("reset() re-accepts a previously seen seq for a new connection", () => {
    const { reader } = makeReader()
    reader.readFrame(
      JSON.stringify({
        batch: [{ data: {}, eventType: "typing" }],
        seq: "5-0",
      }),
    )

    reader.reset()
    const batch = reader.readFrame(
      JSON.stringify({
        batch: [{ data: {}, eventType: "typing" }],
        seq: "5-0",
      }),
    )

    expect(batch).not.toBeNull()
  })

  test("throttles onResyncNeeded across a burst of invalid batches within the window", () => {
    const { onResyncNeeded, reader } = makeReader({ resyncThrottleMs: 2000 })

    reader.readFrame(JSON.stringify({ not: "valid" }))
    reader.readFrame(JSON.stringify({ also: "not valid" }))
    reader.readFrame(JSON.stringify({ still: "not valid" }))

    expect(onResyncNeeded).toHaveBeenCalledTimes(1)
  })

  test("reportInvalidEvent shares the same throttle window as an invalid batch", () => {
    // Per-event failures found after parsing share the batch-invalid resync
    // throttle.
    const { onResyncNeeded, reader } = makeReader({ resyncThrottleMs: 2000 })

    reader.readFrame(JSON.stringify({ not: "valid" }))
    reader.reportInvalidEvent()

    expect(onResyncNeeded).toHaveBeenCalledTimes(1)
  })

  test("allows a resync again once the throttle window elapses", () => {
    vi.useFakeTimers()
    try {
      const { onResyncNeeded, reader } = makeReader({ resyncThrottleMs: 2000 })

      reader.readFrame(JSON.stringify({ not: "valid" }))
      vi.advanceTimersByTime(2001)
      reader.readFrame(JSON.stringify({ still: "not valid" }))

      expect(onResyncNeeded).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })
})
