import "../src/schedule/worker"
import { beforeEach, describe, expect, test, vi } from "vitest"

type ScheduleWorkerProcessor = (job: {
  data: { type: string; data: Record<string, unknown> }
}) => Promise<void>

const state = vi.hoisted(() => ({
  processor: undefined as ScheduleWorkerProcessor | undefined,
  materializeRecurringBroadcasts: vi.fn(async () => undefined),
  enqueueRecurringBroadcasts: vi.fn(async () => undefined),
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

vi.mock("../src/schedule/handlers/materialize-recurring-broadcasts", () => ({
  materializeRecurringBroadcasts: state.materializeRecurringBroadcasts,
}))

vi.mock("../src/schedule/handlers/enqueue-recurring-broadcasts", () => ({
  enqueueRecurringBroadcasts: state.enqueueRecurringBroadcasts,
}))

const items = [
  { recurrenceId: "r1", workspaceId: "w1", occurrenceAtMs: 1_760_320_800_000 },
]

const getProcessor = async (): Promise<ScheduleWorkerProcessor> => {
  await vi.waitFor(() => expect(state.processor).toBeDefined())
  if (!state.processor) {
    throw new Error("Schedule worker processor was not initialized")
  }
  return state.processor
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("schedule worker recurring broadcast dispatch", () => {
  test("hands a materialize batch's items to the materializer only", async () => {
    const processor = await getProcessor()

    await processor({
      data: { type: "materializeRecurringBroadcasts", data: { items } },
    })

    expect(state.materializeRecurringBroadcasts).toHaveBeenCalledWith(items)
    expect(state.enqueueRecurringBroadcasts).not.toHaveBeenCalled()
  })

  test("a failed batch fails the job, so BullMQ retries it", async () => {
    const processor = await getProcessor()
    const failure = new Error("1 of 1 recurring broadcast slots failed")
    state.materializeRecurringBroadcasts.mockRejectedValueOnce(failure)

    await expect(
      processor({
        data: { type: "materializeRecurringBroadcasts", data: { items } },
      }),
    ).rejects.toBe(failure)
  })
})
