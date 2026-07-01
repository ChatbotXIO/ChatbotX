import {
  type BaseEventListener,
  EVENT_BUS_MESSAGE_ID,
} from "@chatbotx.io/flow-config"
import type { Redis } from "@chatbotx.io/redis"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { z } from "zod"
import { BaseEventBus, type EventBusConfig } from "../src/event-bus"

type TestEventMap = {
  "test:event": { value: string }
}

type TestListener = BaseEventListener<TestEventMap[keyof TestEventMap]>

type FakeRedis = Redis & {
  call: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
  duplicate: ReturnType<typeof vi.fn>
  quit: ReturnType<typeof vi.fn>
  xack: ReturnType<typeof vi.fn>
  xadd: ReturnType<typeof vi.fn>
  xautoclaim: ReturnType<typeof vi.fn>
  xgroup: ReturnType<typeof vi.fn>
}

const streamEntry = (id: string, payload: TestEventMap["test:event"]) =>
  [id, ["type", "test:event", "payload", JSON.stringify(payload)]] as [
    string,
    string[],
  ]

function createFakeRedis(): FakeRedis {
  return {
    call: vi.fn().mockResolvedValue(null),
    disconnect: vi.fn(),
    duplicate: vi.fn(),
    quit: vi.fn().mockResolvedValue("OK"),
    xack: vi.fn().mockResolvedValue(1),
    xadd: vi.fn().mockResolvedValue("1-0"),
    xautoclaim: vi.fn().mockResolvedValue(["0-0", [], []]),
    xgroup: vi.fn().mockResolvedValue("OK"),
  } as unknown as FakeRedis
}

function createBus(
  redis: FakeRedis,
  config: Partial<EventBusConfig<TestEventMap>> = {},
) {
  class TestEventBus extends BaseEventBus<TestEventMap, TestListener> {
    consumeOnceForTest(
      consumerName = "consumer-1",
      listeners: Partial<Record<keyof TestEventMap, TestListener[]>> = {},
    ) {
      return this.consumeOnce(consumerName, listeners)
    }

    getBlockingRedisForTest() {
      return this.blockingRedis
    }
  }

  return new TestEventBus(redis, {
    consumerGroup: "test-group",
    schemas: {
      "test:event": z.object({ value: z.string() }),
    },
    streamKey: "events:test",
    ...config,
  })
}

describe("BaseEventBus consumer reliability", () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test("uses a dedicated duplicate connection for blocking reads and closes it on deregister", async () => {
    const sharedRedis = createFakeRedis()
    const blockingRedis = createFakeRedis()
    sharedRedis.duplicate.mockReturnValue(blockingRedis)

    const bus = createBus(sharedRedis, {
      claimIntervalMs: Number.POSITIVE_INFINITY,
    })
    sharedRedis.call.mockResolvedValue([])
    blockingRedis.call.mockImplementation(() => {
      bus.stop()
      return Promise.resolve(null)
    })

    await bus.startConsuming("consumer-1", {})
    await bus.deregister()

    expect(sharedRedis.duplicate).toHaveBeenCalledTimes(1)
    expect(blockingRedis.call).toHaveBeenCalledWith(
      "XREADGROUP",
      "GROUP",
      "test-group",
      "consumer-1",
      "BLOCK",
      5000,
      "COUNT",
      500,
      "STREAMS",
      "events:test",
      ">",
    )
    expect(sharedRedis.call).toHaveBeenCalledWith(
      "XPENDING",
      "events:test",
      "test-group",
      "-",
      "+",
      1,
      "consumer-1",
    )
    expect(sharedRedis.xgroup).toHaveBeenCalledWith(
      "DELCONSUMER",
      "events:test",
      "test-group",
      "consumer-1",
    )
    expect(blockingRedis.quit).toHaveBeenCalledTimes(1)
  })

  test("keeps the consumer registered when pending messages remain", async () => {
    const sharedRedis = createFakeRedis()
    const blockingRedis = createFakeRedis()
    sharedRedis.duplicate.mockReturnValue(blockingRedis)
    sharedRedis.call.mockResolvedValue([["1-0", "consumer-1", 1000, 1]])
    blockingRedis.call.mockImplementation(() => {
      bus.stop()
      return Promise.resolve(null)
    })
    const logger = await import("../src/logger")
    const warnSpy = vi.spyOn(logger.logger, "warn").mockImplementation(vi.fn())
    const bus = createBus(sharedRedis, {
      claimIntervalMs: Number.POSITIVE_INFINITY,
    })

    await bus.startConsuming("consumer-1", {})
    await bus.deregister()

    expect(sharedRedis.call).toHaveBeenCalledWith(
      "XPENDING",
      "events:test",
      "test-group",
      "-",
      "+",
      1,
      "consumer-1",
    )
    expect(sharedRedis.xgroup).not.toHaveBeenCalledWith(
      "DELCONSUMER",
      "events:test",
      "test-group",
      "consumer-1",
    )
    expect(warnSpy).toHaveBeenCalledWith(
      {
        pending: 1,
        stream: "events:test",
        consumerName: "consumer-1",
      },
      "[EventBus] skipping DELCONSUMER because messages are still pending",
    )
  })

  test("keeps the consumer registered when pending inspection fails", async () => {
    const sharedRedis = createFakeRedis()
    const blockingRedis = createFakeRedis()
    sharedRedis.duplicate.mockReturnValue(blockingRedis)
    sharedRedis.call.mockRejectedValue(new Error("pending check failed"))
    blockingRedis.call.mockImplementation(() => {
      bus.stop()
      return Promise.resolve(null)
    })
    const logger = await import("../src/logger")
    const errorSpy = vi
      .spyOn(logger.logger, "error")
      .mockImplementation(vi.fn())
    const bus = createBus(sharedRedis, {
      claimIntervalMs: Number.POSITIVE_INFINITY,
    })

    await bus.startConsuming("consumer-1", {})
    await bus.deregister()

    expect(sharedRedis.xgroup).not.toHaveBeenCalledWith(
      "DELCONSUMER",
      "events:test",
      "test-group",
      "consumer-1",
    )
    expect(errorSpy).toHaveBeenCalledWith(
      {
        err: expect.any(Error),
        stream: "events:test",
        consumerName: "consumer-1",
      },
      "[EventBus] skipping DELCONSUMER after XPENDING failed",
    )
  })

  test("initializes a consumer group once and ignores existing groups", async () => {
    const redis = createFakeRedis()
    const bus = createBus(redis)

    await expect(bus.initialize()).resolves.toBe(bus)
    await expect(bus.initialize()).resolves.toBe(bus)

    expect(redis.xgroup).toHaveBeenCalledTimes(1)
    expect(redis.xgroup).toHaveBeenCalledWith(
      "CREATE",
      "events:test",
      "test-group",
      "0",
      "MKSTREAM",
    )

    const existingGroupRedis = createFakeRedis()
    existingGroupRedis.xgroup.mockRejectedValue(new Error("BUSYGROUP exists"))
    const existingGroupBus = createBus(existingGroupRedis)
    await expect(existingGroupBus.initialize()).resolves.toBe(existingGroupBus)
  })

  test("throws initialization errors that are not BUSYGROUP", async () => {
    const redis = createFakeRedis()
    redis.xgroup.mockRejectedValue(new Error("redis down"))

    await expect(createBus(redis).initialize()).rejects.toThrow("redis down")
  })

  test("emits transformed payloads with maxlen and rejects invalid payloads", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1234)
    const redis = createFakeRedis()
    redis.xadd.mockResolvedValue("1-0")
    const bus = createBus(redis, { maxLen: 42 }).setPayloadHandler(
      (_eventType, payload) => ({ value: payload.value.toUpperCase() }),
    )

    await expect(bus.emit("test:event", { value: "ok" })).resolves.toBe("1-0")
    const validatingBus = createBus(redis)
    await expect(
      validatingBus.emit("test:event", {
        value: 123,
      } as unknown as { value: string }),
    ).resolves.toBe("")

    expect(redis.xadd).toHaveBeenCalledWith(
      "events:test",
      "MAXLEN",
      "~",
      42,
      "*",
      "type",
      "test:event",
      "payload",
      JSON.stringify({ value: "OK" }),
      "timestamp",
      "1234",
    )
  })

  test("clones a bus with a different consumer group", () => {
    const redis = createFakeRedis()
    const clone = createBus(redis, { readBatchSize: 25 }).cloneForGroup(
      "other-group",
    )

    expect(clone.getConfig()).toMatchObject({
      consumerGroup: "other-group",
      readBatchSize: 25,
      streamKey: "events:test",
    })
  })

  test("uses configured read batch size for XREADGROUP", async () => {
    const redis = createFakeRedis()
    const bus = createBus(redis, {
      claimIntervalMs: Number.POSITIVE_INFINITY,
      readBatchSize: 123,
    })

    await bus.consumeOnceForTest()

    expect(redis.call).toHaveBeenCalledWith(
      "XREADGROUP",
      "GROUP",
      "test-group",
      "consumer-1",
      "BLOCK",
      5000,
      "COUNT",
      123,
      "STREAMS",
      "events:test",
      ">",
    )
  })

  test("leaves a timed-out batch unacked and allows the next read attempt", async () => {
    const loggerModule = await import("../src/logger")
    const warnSpy = vi
      .spyOn(loggerModule.logger, "warn")
      .mockImplementation(vi.fn())
    vi.useFakeTimers()
    const redis = createFakeRedis()
    redis.call
      .mockResolvedValueOnce([
        ["events:test", [streamEntry("1-0", { value: "stuck" })]],
      ])
      .mockResolvedValueOnce(null)
    const bus = createBus(redis, {
      claimIntervalMs: Number.POSITIVE_INFINITY,
      processTimeoutMs: 25,
    })
    const neverResolves = vi.fn(
      () => new Promise<void>(() => undefined),
    ) satisfies TestListener["handler"]

    const firstRead = bus.consumeOnceForTest("consumer-1", {
      "test:event": [{ name: "stuck-listener", handler: neverResolves }],
    })
    await vi.advanceTimersByTimeAsync(25)
    await firstRead

    await bus.consumeOnceForTest()

    expect(redis.xack).not.toHaveBeenCalled()
    expect(redis.call).toHaveBeenCalledTimes(2)
    expect(warnSpy).toHaveBeenCalledWith(
      { count: 1, stream: "events:test", timeoutMs: 25 },
      "[EventBus] batch processing timed out; leaving unacked for reclaim",
    )
  })

  test("passes an AbortSignal to handlers and aborts it on timeout", async () => {
    vi.useFakeTimers()
    const redis = createFakeRedis()
    redis.call.mockResolvedValueOnce([
      ["events:test", [streamEntry("1-0", { value: "stuck" })]],
    ])
    const bus = createBus(redis, {
      claimIntervalMs: Number.POSITIVE_INFINITY,
      processTimeoutMs: 25,
    })
    let receivedSignal: AbortSignal | undefined
    const neverResolves = vi.fn((_payloads, signal) => {
      receivedSignal = signal
      return new Promise<void>(() => undefined)
    }) satisfies TestListener["handler"]

    const read = bus.consumeOnceForTest("consumer-1", {
      "test:event": [{ name: "abort-aware-listener", handler: neverResolves }],
    })
    await vi.advanceTimersByTimeAsync(25)
    await read

    expect(receivedSignal).toBeDefined()
    expect(receivedSignal?.aborted).toBe(true)
    expect(redis.xack).not.toHaveBeenCalled()
  })

  test("rate-limits XAUTOCLAIM and processes claimed entries through ack path", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    const redis = createFakeRedis()
    redis.xautoclaim.mockResolvedValue([
      "0-0",
      [streamEntry("2-0", { value: "claimed" })],
      [],
    ])
    const bus = createBus(redis, {
      claimBatchSize: 77,
      claimIdleMs: 180_000,
      claimIntervalMs: 30_000,
    })

    await bus.consumeOnceForTest()
    await bus.consumeOnceForTest()

    expect(redis.xautoclaim).toHaveBeenCalledTimes(1)
    expect(redis.xautoclaim).toHaveBeenCalledWith(
      "events:test",
      "test-group",
      "consumer-1",
      180_000,
      "0",
      "COUNT",
      77,
    )
    expect(redis.xack).toHaveBeenCalledWith("events:test", "test-group", "2-0")
  })

  test("logs handler failures before acking a completed batch", async () => {
    const redis = createFakeRedis()
    redis.call.mockResolvedValueOnce([
      ["events:test", [streamEntry("3-0", { value: "failed" })]],
    ])
    const bus = createBus(redis, {
      claimIntervalMs: Number.POSITIVE_INFINITY,
    })
    const logger = await import("../src/logger")
    const warnSpy = vi.spyOn(logger.logger, "warn").mockImplementation(vi.fn())

    await bus.consumeOnceForTest("consumer-1", {
      "test:event": [
        {
          name: "failing-listener",
          handler: () => Promise.reject(new Error("listener failed")),
        },
      ],
    })

    expect(warnSpy).toHaveBeenCalledWith(
      { failed: 1, stream: "events:test", total: 1 },
      "[EventBus] acking batch despite handler failures",
    )
    expect(redis.xack).toHaveBeenCalledWith("events:test", "test-group", "3-0")
  })

  test("attaches stream ids and selectively acks only successful messages when enabled", async () => {
    const redis = createFakeRedis()
    redis.call.mockResolvedValueOnce([
      [
        "events:test",
        [
          streamEntry("4-0", { value: "ok" }),
          streamEntry("5-0", { value: "retry" }),
        ],
      ],
    ])
    const bus = createBus(redis, {
      claimIntervalMs: Number.POSITIVE_INFINITY,
      enableSelectiveRetry: true,
    })
    const handler = vi.fn((payloads) => {
      expect(payloads).toEqual([
        { value: "ok", [EVENT_BUS_MESSAGE_ID]: "4-0" },
        { value: "retry", [EVENT_BUS_MESSAGE_ID]: "5-0" },
      ])
      return { failedMessageIds: ["5-0"] }
    }) satisfies TestListener["handler"]

    await bus.consumeOnceForTest("consumer-1", {
      "test:event": [{ name: "partial-listener", handler }],
    })

    expect(redis.xack).toHaveBeenCalledTimes(1)
    expect(redis.xack).toHaveBeenCalledWith("events:test", "test-group", "4-0")
  })

  test("moves reclaimed messages past max deliveries to the dead-letter stream", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-07-01T00:00:00.000Z"))
    const redis = createFakeRedis()
    redis.xautoclaim.mockResolvedValue([
      "0-0",
      [streamEntry("6-0", { value: "poison" })],
      [],
    ])
    redis.call.mockImplementation((command: string) => {
      if (command === "XPENDING") {
        return Promise.resolve([["6-0", "consumer-1", 200_000, 3]])
      }
      return Promise.resolve(null)
    })
    const bus = createBus(redis, {
      claimIntervalMs: 0,
      deadLetterMaxLen: 10,
      enableSelectiveRetry: true,
      maxDeliveries: 2,
    })
    const handler = vi.fn() satisfies TestListener["handler"]

    await bus.consumeOnceForTest("consumer-1", {
      "test:event": [{ name: "not-called", handler }],
    })

    expect(handler).not.toHaveBeenCalled()
    expect(redis.xadd).toHaveBeenCalledWith(
      "events:test:dead",
      "MAXLEN",
      "~",
      10,
      "*",
      "type",
      "test:event",
      "payload",
      JSON.stringify({ value: "poison" }),
      "originalId",
      "6-0",
      "deliveryCount",
      "3",
      "error",
      expect.any(String),
      "timestamp",
      String(Date.now()),
    )
    expect(redis.xack).toHaveBeenCalledWith("events:test", "test-group", "6-0")
  })

  test("reprocesses reclaimed messages at or below max deliveries", async () => {
    const redis = createFakeRedis()
    redis.xautoclaim.mockResolvedValue([
      "0-0",
      [streamEntry("7-0", { value: "retryable" })],
      [],
    ])
    redis.call.mockImplementation((command: string) => {
      if (command === "XPENDING") {
        return Promise.resolve([["7-0", "consumer-1", 200_000, 2]])
      }
      return Promise.resolve(null)
    })
    const bus = createBus(redis, {
      claimIntervalMs: 0,
      enableSelectiveRetry: true,
      maxDeliveries: 2,
    })
    const handler = vi.fn() satisfies TestListener["handler"]

    await bus.consumeOnceForTest("consumer-1", {
      "test:event": [{ name: "retryable-listener", handler }],
    })

    expect(handler).toHaveBeenCalledTimes(1)
    expect(redis.xadd).not.toHaveBeenCalled()
    expect(redis.xack).toHaveBeenCalledWith("events:test", "test-group", "7-0")
  })

  test("writes the stored processing error to the dead-letter stream", async () => {
    const redis = createFakeRedis()
    redis.xautoclaim
      .mockResolvedValueOnce(["0-0", [], []])
      .mockResolvedValue(["0-0", [streamEntry("8-0", { value: "poison" })], []])
    redis.call
      .mockResolvedValueOnce([
        ["events:test", [streamEntry("8-0", { value: "poison" })]],
      ])
      .mockImplementation((command: string) => {
        if (command === "XPENDING") {
          return Promise.resolve([["8-0", "consumer-1", 200_000, 3]])
        }
        return Promise.resolve(null)
      })
    const bus = createBus(redis, {
      claimIntervalMs: 0,
      enableSelectiveRetry: true,
      maxDeliveries: 2,
    })

    await bus.consumeOnceForTest("consumer-1", {
      "test:event": [
        {
          name: "poison-listener",
          handler: () => {
            throw new Error("database unavailable")
          },
        },
      ],
    })
    await bus.consumeOnceForTest("consumer-1", {})

    expect(redis.xadd).toHaveBeenCalledWith(
      expect.any(String),
      "MAXLEN",
      "~",
      expect.any(Number),
      "*",
      "type",
      "test:event",
      "payload",
      expect.any(String),
      "originalId",
      "8-0",
      "deliveryCount",
      "3",
      "error",
      "database unavailable",
      "timestamp",
      expect.any(String),
    )
  })

  test("writes a max-deliveries fallback error after restart-like empty error memory", async () => {
    const redis = createFakeRedis()
    redis.xautoclaim.mockResolvedValue([
      "0-0",
      [streamEntry("9-0", { value: "poison" })],
      [],
    ])
    redis.call.mockImplementation((command: string) => {
      if (command === "XPENDING") {
        return Promise.resolve([["9-0", "consumer-1", 200_000, 6]])
      }
      return Promise.resolve(null)
    })
    const logger = await import("../src/logger")
    const deadLetterErrorSpy = vi
      .spyOn(logger.deadLetterLogger, "error")
      .mockImplementation(vi.fn())
    const bus = createBus(redis, {
      claimIntervalMs: 0,
      enableSelectiveRetry: true,
      maxDeliveries: 5,
    })

    await bus.consumeOnceForTest("consumer-1", {})

    expect(redis.xadd).toHaveBeenCalledWith(
      expect.any(String),
      "MAXLEN",
      "~",
      expect.any(Number),
      "*",
      "type",
      "test:event",
      "payload",
      expect.any(String),
      "originalId",
      "9-0",
      "deliveryCount",
      "6",
      "error",
      "max deliveries exceeded",
      "timestamp",
      expect.any(String),
    )
    expect(deadLetterErrorSpy).toHaveBeenCalledWith(
      {
        deadLetterStreamKey: "events:test:dead",
        deliveryCount: 6,
        messageId: "9-0",
        stream: "events:test",
      },
      "[EventBus] moved message to dead-letter stream",
    )
  })

  test("logs reclaim failures and continues with the normal read", async () => {
    const redis = createFakeRedis()
    redis.xautoclaim.mockRejectedValue(new Error("claim failed"))
    const logger = await import("../src/logger")
    const errorSpy = vi
      .spyOn(logger.logger, "error")
      .mockImplementation(vi.fn())
    const bus = createBus(redis)

    await bus.consumeOnceForTest()

    expect(errorSpy).toHaveBeenCalledWith(
      { err: expect.any(Error), stream: "events:test" },
      "[EventBus] reclaim failed",
    )
    expect(redis.call).toHaveBeenCalledWith(
      "XREADGROUP",
      "GROUP",
      "test-group",
      "consumer-1",
      "BLOCK",
      5000,
      "COUNT",
      500,
      "STREAMS",
      "events:test",
      ">",
    )
  })

  test("falls back to disconnect when closing a duplicate connection fails", async () => {
    const sharedRedis = createFakeRedis()
    const blockingRedis = createFakeRedis()
    blockingRedis.quit.mockRejectedValue(new Error("quit failed"))
    sharedRedis.duplicate.mockReturnValue(blockingRedis)

    const bus = createBus(sharedRedis, {
      claimIntervalMs: Number.POSITIVE_INFINITY,
    })
    blockingRedis.call.mockImplementation(() => {
      bus.stop()
      return Promise.resolve(null)
    })

    await bus.startConsuming("consumer-1", {})

    expect(blockingRedis.quit).toHaveBeenCalledTimes(1)
    expect(blockingRedis.disconnect).toHaveBeenCalledTimes(1)
  })

  test("logs consume loop errors and retries while running", async () => {
    vi.useFakeTimers()
    const redis = createFakeRedis()
    const blockingRedis = createFakeRedis()
    redis.duplicate.mockReturnValue(blockingRedis)
    const logger = await import("../src/logger")
    const errorSpy = vi
      .spyOn(logger.logger, "error")
      .mockImplementation(vi.fn())

    class RetryingBus extends BaseEventBus<TestEventMap, TestListener> {
      private attempts = 0

      protected override consumeOnce() {
        this.attempts += 1
        if (this.attempts === 1) {
          return Promise.reject(new Error("read failed"))
        }
        this.stop()
        return Promise.resolve()
      }
    }

    const bus = new RetryingBus(redis, {
      consumerGroup: "test-group",
      schemas: {
        "test:event": z.object({ value: z.string() }),
      },
      streamKey: "events:test",
    })

    const consuming = bus.startConsuming("consumer-1", {})
    await vi.advanceTimersByTimeAsync(1000)
    await consuming

    expect(errorSpy).toHaveBeenCalledWith(
      { err: expect.any(Error), stream: "events:test" },
      "[EventBus] consume loop error",
    )
  })
})
