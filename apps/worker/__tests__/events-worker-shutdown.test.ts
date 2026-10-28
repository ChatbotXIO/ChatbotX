import { expect, test, vi } from "vitest"

const state = vi.hoisted(() => ({
  ensureBootstrapped: vi.fn(async () => undefined),
  flushAllPendingWorkspaceRealtimeEvents: vi.fn(async () => undefined),
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
  startWorker: vi.fn(),
  stopWorker: vi.fn(async () => undefined),
}))

vi.mock("@chatbotx.io/business", () => ({
  flushAllPendingWorkspaceRealtimeEvents:
    state.flushAllPendingWorkspaceRealtimeEvents,
}))

vi.mock("@chatbotx.io/event-bus/worker", () => ({
  startWorker: state.startWorker,
  stopWorker: state.stopWorker,
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  closeAllQueueEvents: vi.fn(async () => undefined),
}))

vi.mock("../src/lib/bootstrap", () => ({
  ensureBootstrapped: state.ensureBootstrapped,
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    error: state.loggerError,
    info: state.loggerInfo,
  },
}))

vi.mock("../src/events/analytics", () => ({ analyticsDashboardEvents: [] }))
vi.mock("../src/events/error-log", () => ({ default: [] }))
vi.mock("../src/events/flow", () => ({ default: [] }))
vi.mock("../src/events/message", () => ({ default: [] }))

await import("../src/events/worker")

test("drains realtime events after the event worker stop fails", async () => {
  const exit = vi
    .spyOn(process, "exit")
    .mockImplementation((() => undefined) as never)
  state.stopWorker.mockRejectedValueOnce(new Error("stop failed"))

  process.emit("SIGTERM")

  await vi.waitFor(() => {
    expect(exit).toHaveBeenCalledWith(1)
  })
  expect(state.flushAllPendingWorkspaceRealtimeEvents).toHaveBeenCalledOnce()
  expect(state.stopWorker.mock.invocationCallOrder[0]).toBeLessThan(
    state.flushAllPendingWorkspaceRealtimeEvents.mock.invocationCallOrder[0] ??
      Number.POSITIVE_INFINITY,
  )
  exit.mockRestore()
})

test("a startWorker rejection takes the failed-to-start path", async () => {
  const exit = vi
    .spyOn(process, "exit")
    .mockImplementation((() => undefined) as never)
  state.startWorker.mockRejectedValueOnce(new Error("redis unavailable"))
  vi.resetModules()

  await import("../src/events/worker")

  await vi.waitFor(() => {
    expect(state.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ worker: "events" }),
      "Failed to start worker",
    )
  })
  await vi.waitFor(() => {
    expect(exit).toHaveBeenCalledWith(1)
  })
  exit.mockRestore()
})
