import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
  FreeswitchEventBatcher,
  freeswitchJobId,
} from "../src/freeswitch/event-batcher"
import type { KeptFreeswitchEvent } from "../src/freeswitch/keep-rule"

const event = (
  uuid: string,
  kind: KeptFreeswitchEvent["event"] = "CHANNEL_ANSWER",
): KeptFreeswitchEvent => ({
  event: kind,
  workspaceId: "ws-1",
  integrationId: "iw-1",
  uuid,
  vars: { sipHeaders: {} },
})

describe("FreeswitchEventBatcher", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  test("jobId is fs-<uuid>-<event>", () => {
    expect(freeswitchJobId("abc", "CHANNEL_ANSWER")).toBe(
      "fs-abc-CHANNEL_ANSWER",
    )
  })

  test("flushes on maxBatchSize without waiting for the timer", async () => {
    const addBulk = vi.fn().mockResolvedValue(undefined)
    const batcher = new FreeswitchEventBatcher("default", addBulk, {
      maxBatchSize: 2,
      flushIntervalMs: 1000,
    })

    batcher.push(event("uuid-1"))
    expect(addBulk).not.toHaveBeenCalled()
    batcher.push(event("uuid-2"))
    // size-triggered flush is fire-and-forget; let the microtask run.
    await vi.waitFor(() => expect(addBulk).toHaveBeenCalledTimes(1))

    const batch = addBulk.mock.calls[0][0]
    expect(batch).toHaveLength(2)
    expect(batch[0].opts.jobId).toBe("fs-uuid-1-CHANNEL_ANSWER")
  })

  test("flushes after flushIntervalMs even below maxBatchSize", async () => {
    const addBulk = vi.fn().mockResolvedValue(undefined)
    const batcher = new FreeswitchEventBatcher("default", addBulk, {
      maxBatchSize: 200,
      flushIntervalMs: 100,
    })

    batcher.push(event("uuid-1"))
    expect(addBulk).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(100)
    expect(addBulk).toHaveBeenCalledTimes(1)
    expect(addBulk.mock.calls[0][0]).toHaveLength(1)
  })

  test("close() flushes any remaining buffered events", async () => {
    const addBulk = vi.fn().mockResolvedValue(undefined)
    const batcher = new FreeswitchEventBatcher("default", addBulk, {
      maxBatchSize: 200,
      flushIntervalMs: 100,
    })

    batcher.push(event("uuid-1"))
    await batcher.close()

    expect(addBulk).toHaveBeenCalledTimes(1)
  })

  test("a flush with an empty buffer is a no-op", async () => {
    const addBulk = vi.fn().mockResolvedValue(undefined)
    const batcher = new FreeswitchEventBatcher("default", addBulk)

    await batcher.flush()

    expect(addBulk).not.toHaveBeenCalled()
  })

  test("job data carries the nodeId and the event's workspace/integration/uuid/vars", async () => {
    const addBulk = vi.fn().mockResolvedValue(undefined)
    const batcher = new FreeswitchEventBatcher("node-b", addBulk, {
      maxBatchSize: 1,
    })

    batcher.push(event("uuid-1", "CUSTOM:cbx::call"))
    await vi.waitFor(() => expect(addBulk).toHaveBeenCalledTimes(1))

    expect(addBulk.mock.calls[0][0][0].data).toEqual({
      type: "whatsappFreeswitchEvent",
      data: {
        nodeId: "node-b",
        workspaceId: "ws-1",
        integrationId: "iw-1",
        uuid: "uuid-1",
        event: "CUSTOM:cbx::call",
        vars: { sipHeaders: {} },
      },
    })
  })
})

describe("FreeswitchEventBatcher: failed flushes", () => {
  test("a failed addBulk keeps the batch and retries it with backoff", async () => {
    vi.useFakeTimers()
    try {
      const onFlushError = vi.fn()
      const addBulk = vi
        .fn()
        .mockRejectedValueOnce(new Error("redis down"))
        .mockResolvedValue(undefined)
      const batcher = new FreeswitchEventBatcher("default", addBulk, {
        maxBatchSize: 200,
        flushIntervalMs: 100,
        onFlushError,
      })

      batcher.push(event("uuid-1"))
      await expect(batcher.flush()).rejects.toThrow("redis down")
      expect(batcher.pendingCount).toBe(1)
      expect(onFlushError).toHaveBeenCalledWith(expect.any(Error), 0)

      // Backoff doubles the interval after one failure.
      await vi.advanceTimersByTimeAsync(199)
      expect(addBulk).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1)
      expect(addBulk).toHaveBeenCalledTimes(2)
      expect(addBulk.mock.calls[1]?.[0]).toHaveLength(1)
      expect(batcher.pendingCount).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  test("a sustained outage drops the OLDEST events past maxBufferedEvents and reports the count", async () => {
    const onFlushError = vi.fn()
    const addBulk = vi.fn().mockRejectedValue(new Error("redis down"))
    const batcher = new FreeswitchEventBatcher("default", addBulk, {
      maxBatchSize: 10,
      flushIntervalMs: 100_000,
      maxBufferedEvents: 3,
      onFlushError,
    })

    for (const uuid of ["u1", "u2", "u3", "u4"]) {
      batcher.push(event(uuid))
    }
    await expect(batcher.flush()).rejects.toThrow("redis down")

    expect(batcher.pendingCount).toBe(3)
    expect(onFlushError).toHaveBeenCalledWith(expect.any(Error), 1)
    await batcher.flush().catch(() => undefined)
    const retried = addBulk.mock.calls.at(-1)?.[0] as Array<{
      opts: { jobId: string }
    }>
    expect(retried.map((job) => job.opts.jobId)).toEqual([
      "fs-u2-CHANNEL_ANSWER",
      "fs-u3-CHANNEL_ANSWER",
      "fs-u4-CHANNEL_ANSWER",
    ])
  })
})

describe("FreeswitchEventBatcher: admission control", () => {
  test("the cap holds while an addBulk is hung — oldest events are dropped on push, not after", async () => {
    const onFlushError = vi.fn()
    let resolveHung: (() => void) | undefined
    // Only the FIRST enqueue hangs; later ones resolve immediately.
    const addBulk = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveHung = resolve
          }),
      )
      .mockResolvedValue(undefined)
    const batcher = new FreeswitchEventBatcher("default", addBulk, {
      maxBatchSize: 1,
      flushIntervalMs: 100_000,
      maxBufferedEvents: 2,
      onFlushError,
    })

    batcher.push(event("u1")) // triggers a flush that hangs (batch = [u1])
    batcher.push(event("u2"))
    batcher.push(event("u3"))
    batcher.push(event("u4")) // over the cap → u2 dropped on admission

    expect(batcher.pendingCount).toBe(2)
    expect(onFlushError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "freeswitch-event-buffer-overflow" }),
      1,
    )
    resolveHung?.()
    // Drain: the first flush just awaits the (now resolved) in-flight one,
    // then each flush sends one maxBatchSize=1 batch.
    await batcher.flush()
    while (batcher.pendingCount > 0) {
      await batcher.flush()
    }
    const sent = addBulk.mock.calls.flatMap((c) =>
      (c[0] as Array<{ opts: { jobId: string } }>).map((j) => j.opts.jobId),
    )
    expect(sent).toEqual([
      "fs-u1-CHANNEL_ANSWER",
      "fs-u3-CHANNEL_ANSWER",
      "fs-u4-CHANNEL_ANSWER",
    ])
  })
})
