import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const { loggerMock } = vi.hoisted(() => ({
  loggerMock: { info: vi.fn(), error: vi.fn(), fatal: vi.fn() },
}))

vi.mock("../src/lib/logger", () => ({ logger: loggerMock }))
vi.mock("../src/env", () => ({ env: { WORKER_SHUTDOWN_TIMEOUT_MS: 1000 } }))

type ShutdownModule = typeof import("../src/lib/shutdown")

describe("worker shutdown coordinator", () => {
  let shutdown: ShutdownModule
  let exitSpy: ReturnType<typeof vi.spyOn>
  let listeners: Map<string, (...args: unknown[]) => unknown>

  beforeEach(async () => {
    vi.resetModules()
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

  test("exits 1 and names the stuck workers when draining exceeds the deadline", async () => {
    vi.useFakeTimers()
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
