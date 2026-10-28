import { expect, test, vi } from "vitest"

const state = vi.hoisted(() => ({
  createQueueWorker: vi.fn(),
  loggerError: vi.fn(),
  registerSchedules: vi.fn(),
  requestShutdown: vi.fn(),
  startMarketingMessageWorker: vi.fn(),
}))

vi.mock("bullmq", () => {
  class Queue {}
  return { Queue }
})

vi.mock("@chatbotx.io/worker-config", async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    queueNames: { enum: { schedule: "schedule" } },
    scheduleQueue: new (await import("bullmq")).Queue(),
  }
})

vi.mock("../src/lib/create-queue-worker", () => ({
  createQueueWorker: state.createQueueWorker,
}))

vi.mock("../src/lib/logger", () => ({
  logger: { error: state.loggerError, info: vi.fn(), warn: vi.fn() },
}))

vi.mock("../src/lib/run-job-with-audit-context", () => ({
  runJobWithAuditContext: async (_context: unknown, run: () => Promise<void>) =>
    await run(),
}))

vi.mock("../src/lib/shutdown", () => ({
  requestShutdown: state.requestShutdown,
  runWorker: (_name: string, start: () => unknown) => {
    start()
  },
}))

vi.mock("../src/marketing-message/consumer", () => ({
  startMarketingMessageWorker: state.startMarketingMessageWorker,
}))

vi.mock("../src/schedule/handlers/register-schedules", () => ({
  registerSchedules: state.registerSchedules,
}))

test("a registerSchedules rejection still starts both workers without shutting down", async () => {
  state.registerSchedules.mockRejectedValue(new Error("redis unavailable"))

  await import("../src/schedule/worker")

  await vi.waitFor(() => {
    expect(state.createQueueWorker).toHaveBeenCalledOnce()
  })
  expect(state.startMarketingMessageWorker).toHaveBeenCalledOnce()
  expect(state.loggerError).toHaveBeenCalledWith(
    expect.objectContaining({ err: expect.any(Error) }),
    "Error registering schedules",
  )
  expect(state.requestShutdown).not.toHaveBeenCalled()
})
