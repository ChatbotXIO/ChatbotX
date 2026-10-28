import { beforeEach, describe, expect, test, vi } from "vitest"

const state = vi.hoisted(() => ({
  captured: [] as {
    queue: unknown
    processor: unknown
    options: Record<string, unknown>
  }[],
  listeners: new Map<string, (...args: never[]) => unknown>(),
  close: vi.fn(async () => undefined),
  onShutdown: vi.fn(),
  requestShutdown: vi.fn(),
  loggerError: vi.fn(),
}))

vi.mock("bullmq", () => ({
  Worker: class {
    close = state.close
    constructor(
      queue: unknown,
      processor: unknown,
      options: Record<string, unknown>,
    ) {
      state.captured.push({ queue, processor, options })
    }
    on(event: string, listener: (...args: never[]) => unknown) {
      state.listeners.set(event, listener)
    }
  },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  defaultWorkerOptions: {
    concurrency: 5,
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
  getQueueConnection: vi.fn((queue: string) => ({ conn: queue })),
}))

vi.mock("../src/lib/logger", () => ({
  logger: { error: state.loggerError },
}))

vi.mock("../src/lib/shutdown", () => ({
  onShutdown: state.onShutdown,
  requestShutdown: state.requestShutdown,
}))

const { createQueueWorker } = await import("../src/lib/create-queue-worker")

describe("createQueueWorker", () => {
  beforeEach(() => {
    state.captured.length = 0
    state.listeners.clear()
    vi.clearAllMocks()
  })

  test("merges the queue connection and defaults, with caller options winning", () => {
    createQueueWorker("chat" as never, vi.fn(), { concurrency: 30 })

    expect(state.captured[0]?.queue).toBe("chat")
    expect(state.captured[0]?.options).toEqual({
      connection: { conn: "chat" },
      concurrency: 30,
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    })
  })

  test("attaches error and failed listeners", () => {
    createQueueWorker("chat" as never, vi.fn())

    expect([...state.listeners.keys()].sort()).toEqual(["error", "failed"])
  })

  test("logs a failed job with its queue and id", () => {
    createQueueWorker("chat" as never, vi.fn())

    state.listeners.get("failed")?.(
      { id: "7" } as never,
      new Error("boom") as never,
    )

    expect(state.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ queue: "chat", jobId: "7" }),
      "Job has failed",
    )
  })

  test("a custom onFailed replaces the default logger", () => {
    const onFailed = vi.fn()
    createQueueWorker("chat" as never, vi.fn(), { onFailed })

    state.listeners.get("failed")?.(
      { id: "7" } as never,
      new Error("boom") as never,
    )

    expect(onFailed).toHaveBeenCalledOnce()
    expect(state.loggerError).not.toHaveBeenCalled()
    expect(state.captured[0]?.options).not.toHaveProperty("onFailed")
  })

  test("registers a closer named after the queue that closes the worker", async () => {
    createQueueWorker("heavy" as never, vi.fn())

    expect(state.onShutdown).toHaveBeenCalledWith("heavy", expect.any(Function))
    await state.onShutdown.mock.calls[0]?.[1]()
    expect(state.close).toHaveBeenCalledOnce()
  })

  test("an error event is logged and does not trigger shutdown", () => {
    createQueueWorker("chat" as never, vi.fn())

    state.listeners.get("error")?.(new Error("ECONNRESET") as never)

    expect(state.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ queue: "chat" }),
      "Queue worker error",
    )
    expect(state.requestShutdown).not.toHaveBeenCalled()
  })
})
