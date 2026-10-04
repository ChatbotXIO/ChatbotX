import "../src/schedule/worker"
import { describe, expect, test, vi } from "vitest"

type ScheduleWorkerProcessor = (job: {
  data: { type: string; data: Record<string, unknown> }
}) => Promise<void>

const state = vi.hoisted(() => ({
  processor: undefined as ScheduleWorkerProcessor | undefined,
  purgeExpiredConnectSessions: vi.fn(async () => undefined),
}))

vi.mock("bullmq", () => {
  class Queue {}

  class Worker {
    close = vi.fn(async () => undefined)
    on = vi.fn()

    constructor(
      _queueName: string,
      processor: ScheduleWorkerProcessor,
      _options: unknown,
    ) {
      state.processor = processor
    }
  }

  return { Queue, Worker }
})

// A partial mock keeps worker-config's unrelated runtime exports needed by
// handler imports; Vitest's importOriginal is required for that test seam.
vi.mock("@chatbotx.io/worker-config", async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    defaultWorkerOptions: {},
    getQueueConnection: () => ({}),
    queueNames: { enum: { schedule: "schedule" } },
    ScheduleJobData: {
      ...actual.ScheduleJobData,
      purgeExpiredConnectSessions: "purgeExpiredConnectSessions",
    },
    scheduleQueue: {},
  }
})

vi.mock("../src/lib/bootstrap", () => ({
  ensureBootstrapped: async () => undefined,
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}))

vi.mock("../src/lib/run-job-with-audit-context", () => ({
  runJobWithAuditContext: async (_context: unknown, run: () => Promise<void>) =>
    await run(),
}))

vi.mock("../src/schedule/handlers/purge-expired-connect-sessions", () => ({
  purgeExpiredConnectSessions: state.purgeExpiredConnectSessions,
}))

describe("schedule worker connect-session retention dispatch", () => {
  test("dispatches purgeExpiredConnectSessions jobs to the retention handler", async () => {
    await vi.waitFor(() => expect(state.processor).toBeDefined())
    if (!state.processor) {
      throw new Error("Schedule worker processor was not initialized")
    }

    await state.processor({
      data: {
        type: "purgeExpiredConnectSessions",
        data: {},
      },
    })

    expect(state.purgeExpiredConnectSessions).toHaveBeenCalledOnce()
  })
})
