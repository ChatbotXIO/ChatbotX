import {
  afterEach,
  beforeEach,
  describe,
  expect,
  type MockInstance,
  test,
  vi,
} from "vitest"
import type * as ShutdownModule from "../src/lib/shutdown"

const { bootstrapMock, envMock, loggerMock } = vi.hoisted(() => ({
  bootstrapMock: vi.fn(async () => undefined),
  envMock: {
    WORKER_SHUTDOWN_TIMEOUT_MS: undefined as number | undefined,
  },
  loggerMock: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  },
}))

vi.mock("@chatbotx.io/business", () => ({
  flushAllPendingWorkspaceRealtimeEvents: vi.fn(),
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  closeAllQueueEvents: vi.fn(),
}))
vi.mock("../src/lib/bootstrap", () => ({
  ensureBootstrapped: bootstrapMock,
}))
vi.mock("../src/lib/logger", () => ({ logger: loggerMock }))
vi.mock("../src/env", () => ({ env: envMock }))

type Shutdown = typeof ShutdownModule

describe("worker shutdown coordinator", () => {
  let shutdown: Shutdown
  let exitSpy: MockInstance
  let listeners: Map<string, (...args: unknown[]) => unknown>

  beforeEach(async () => {
    vi.resetModules()
    envMock.WORKER_SHUTDOWN_TIMEOUT_MS = undefined
    vi.clearAllMocks()
    listeners = new Map()
    const register = (
      event: string,
      listener: (...args: unknown[]) => unknown,
    ) => {
      listeners.set(event, listener)
      return process
    }
    vi.spyOn(process, "once").mockImplementation(register as never)
    vi.spyOn(process, "on").mockImplementation(register as never)
    exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never)
    // Resetting module state is the test seam for the process-wide coordinator.
    shutdown = await import("../src/lib/shutdown")
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  test("closes every registered worker and exits 0", async () => {
    const closeChat = vi.fn().mockResolvedValue(undefined)
    const closeLow = vi.fn().mockResolvedValue(undefined)
    shutdown.onShutdown("chat", closeChat)
    shutdown.onShutdown("low", closeLow)

    await shutdown.requestShutdown("SIGTERM")

    expect(closeChat).toHaveBeenCalledOnce()
    expect(closeLow).toHaveBeenCalledOnce()
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  test("still closes the other workers and exits 1 when one close fails", async () => {
    const closeLow = vi.fn().mockResolvedValue(undefined)
    shutdown.onShutdown("chat", () => Promise.reject(new Error("boom")))
    shutdown.onShutdown("low", closeLow)

    await shutdown.requestShutdown("SIGTERM")

    expect(closeLow).toHaveBeenCalledOnce()
    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.objectContaining({ worker: "chat" }),
      "Error during worker shutdown",
    )
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  test("runs finalizers only after every worker closer settles", async () => {
    const events: string[] = []
    const { promise: chatClosed, resolve: releaseChatClose } =
      Promise.withResolvers<void>()
    const flushRealtime = vi.fn(() => {
      events.push("realtime:flushed")
    })

    shutdown.onShutdown("chat", async () => {
      events.push("chat:closing")
      await chatClosed
      events.push("chat:closed")
    })
    shutdown.onShutdown("low", () => {
      events.push("low:closed")
    })
    shutdown.onShutdownFinalize("realtime", flushRealtime)

    const shutdownPromise = shutdown.requestShutdown("SIGTERM")
    await vi.waitFor(() => expect(events).toContain("chat:closing"))
    expect(flushRealtime).not.toHaveBeenCalled()

    releaseChatClose()
    await shutdownPromise

    expect(events).toEqual([
      "chat:closing",
      "low:closed",
      "chat:closed",
      "realtime:flushed",
    ])
  })

  test("keeps the first finalizer registered for a name", async () => {
    const firstFinalizer = vi.fn()
    const duplicateFinalizer = vi.fn()
    shutdown.onShutdown("chat", vi.fn().mockResolvedValue(undefined))
    shutdown.onShutdownFinalize("realtime", firstFinalizer)
    shutdown.onShutdownFinalize("realtime", duplicateFinalizer)

    await shutdown.requestShutdown("SIGTERM")

    expect(firstFinalizer).toHaveBeenCalledOnce()
    expect(duplicateFinalizer).not.toHaveBeenCalled()
  })

  test("ignores and logs closers registered after shutdown begins", async () => {
    const { promise: chatClosed, resolve: releaseChatClose } =
      Promise.withResolvers<void>()
    const lateClose = vi.fn()
    shutdown.onShutdown("chat", () => chatClosed)

    const shutdownPromise = shutdown.requestShutdown("SIGTERM")
    await vi.waitFor(() =>
      expect(loggerMock.info).toHaveBeenCalledWith(
        expect.anything(),
        "Shutting down",
      ),
    )
    shutdown.onShutdown("late", lateClose)
    releaseChatClose()
    await shutdownPromise

    expect(lateClose).not.toHaveBeenCalled()
    expect(loggerMock.warn).toHaveBeenCalledWith(
      { worker: "late" },
      "Ignoring worker shutdown closer registered after shutdown began",
    )
  })

  test("does not arm a shutdown deadline when timeout is unset", async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout")
    shutdown.onShutdown("chat", vi.fn().mockResolvedValue(undefined))

    await shutdown.requestShutdown("SIGTERM")

    expect(setTimeoutSpy).not.toHaveBeenCalled()
  })

  test("exits 1 and names the stuck workers when draining exceeds the deadline", async () => {
    vi.useFakeTimers()
    envMock.WORKER_SHUTDOWN_TIMEOUT_MS = 1000
    shutdown.onShutdown("heavy", () => new Promise(() => undefined))
    shutdown.onShutdown("low", vi.fn().mockResolvedValue(undefined))

    shutdown.requestShutdown("SIGTERM")
    await vi.advanceTimersByTimeAsync(1000)

    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.objectContaining({ pending: ["heavy"], timeoutMs: 1000 }),
      "Shutdown timed out with workers still draining",
    )
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  test("ignores a second shutdown request while one is in progress", async () => {
    const close = vi.fn().mockResolvedValue(undefined)
    shutdown.onShutdown("chat", close)

    await Promise.all([
      shutdown.requestShutdown("SIGTERM"),
      shutdown.requestShutdown("SIGINT"),
    ])

    expect(close).toHaveBeenCalledOnce()
    expect(exitSpy).toHaveBeenCalledOnce()
  })

  test("a worker that fails to start drains the others and exits 1", async () => {
    const closeChat = vi.fn().mockResolvedValue(undefined)
    shutdown.onShutdown("chat", closeChat)

    shutdown.runWorker("webhook", () => Promise.reject(new Error("no redis")))
    await vi.waitFor(() => expect(exitSpy).toHaveBeenCalledWith(1))

    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.objectContaining({ worker: "webhook" }),
      "Failed to start worker",
    )
    expect(closeChat).toHaveBeenCalledOnce()
  })

  test("runWorker bootstraps before starting the worker", async () => {
    const order: string[] = []
    bootstrapMock.mockImplementationOnce(() => {
      order.push("bootstrap")
      return Promise.resolve(undefined)
    })
    const start = vi.fn(() => {
      order.push("start")
      return Promise.resolve()
    })

    shutdown.runWorker("chat", start)
    await vi.waitFor(() => expect(start).toHaveBeenCalledOnce())

    expect(order).toEqual(["bootstrap", "start"])
  })

  test("a bootstrap failure skips start and exits 1", async () => {
    bootstrapMock.mockRejectedValueOnce(new Error("license invalid"))
    const start = vi.fn()

    shutdown.runWorker("chat", start)
    await vi.waitFor(() => expect(exitSpy).toHaveBeenCalledWith(1))

    expect(start).not.toHaveBeenCalled()
    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.objectContaining({ worker: "chat" }),
      "Failed to start worker",
    )
  })

  test("installs signal and crash handlers once and routes crashes to exit 1", async () => {
    shutdown.onShutdown("chat", vi.fn().mockResolvedValue(undefined))
    shutdown.onShutdown("low", vi.fn().mockResolvedValue(undefined))

    expect([...listeners.keys()].sort()).toEqual([
      "SIGINT",
      "SIGTERM",
      "uncaughtException",
      "unhandledRejection",
    ])
    expect(process.once).toHaveBeenCalledTimes(2)

    listeners.get("unhandledRejection")?.(new Error("lost promise"))
    await vi.waitFor(() => expect(exitSpy).toHaveBeenCalledWith(1))
    expect(loggerMock.fatal).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.anything() }),
      "Unhandled rejection",
    )
  })
})
