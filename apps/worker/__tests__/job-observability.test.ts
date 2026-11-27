import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const observability = vi.hoisted(() => ({
  captureException: vi.fn(),
  classifyError: vi.fn(() => "code_bug"),
  incrementJobCompleted: vi.fn(),
  incrementJobFailed: vi.fn(),
}))

vi.mock("@chatbotx.io/observability", () => observability)

const { instrumentWorker } = await import("../src/lib/job-observability")

type WorkerEventHandler = (...args: unknown[]) => void

type WorkerStub = {
  on: (event: string, handler: WorkerEventHandler) => void
}

const createWorker = (): {
  emit: (event: string, ...args: unknown[]) => void
  worker: WorkerStub
} => {
  const handlers = new Map<string, WorkerEventHandler>()

  return {
    worker: {
      on: (event, handler) => {
        handlers.set(event, handler)
      },
    },
    emit: (event, ...args) => {
      handlers.get(event)?.(...args)
    },
  }
}

describe("instrumentWorker", () => {
  const originalBullBoardUrl = process.env.BULL_BOARD_URL

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    if (originalBullBoardUrl === undefined) {
      delete process.env.BULL_BOARD_URL
      return
    }
    process.env.BULL_BOARD_URL = originalBullBoardUrl
  })

  test("adds the failed job id and its Bull Board link to the captured exception", () => {
    process.env.BULL_BOARD_URL = "https://app.example.test/developer/queues/"
    const { worker, emit } = createWorker()

    instrumentWorker(worker as never, { queue: "integration" })
    emit(
      "failed",
      { attemptsMade: 2, id: "job/1", name: "incomingMessage" },
      new Error("message write failed"),
    )

    expect(observability.captureException).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: { attemptsMade: 2, jobId: "job/1" },
        extra: {
          bullboardUrl:
            "https://app.example.test/developer/queues/queue/integration/job%2F1",
        },
      }),
    )
  })

  test("omits the Bull Board link when it is not configured", () => {
    delete process.env.BULL_BOARD_URL
    const { worker, emit } = createWorker()

    instrumentWorker(worker as never, { queue: "integration" })
    emit(
      "failed",
      { attemptsMade: 2, id: "job-1", name: "incomingMessage" },
      new Error("message write failed"),
    )

    expect(observability.captureException).toHaveBeenCalledWith(
      expect.not.objectContaining({ extra: expect.anything() }),
    )
  })
})
