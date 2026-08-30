import { getAuditActor } from "@chatbotx.io/business/audit"
import type { HeavyJobData } from "@chatbotx.io/worker-config"
import { describe, expect, test, vi } from "vitest"

// This test boots the real `src/heavy/worker.ts` module (it starts itself on
// import) to assert: the heavy worker process boots exactly one BullMQ
// `Worker`, on the `heavy` queue, with the long-lock/coarse-concurrency
// options the coexist workload needs, and every `HeavyJobData` variant routes
// to its handler via the exhaustive switch. Every import worker.ts pulls in
// is mocked below so this stays a fast, isolated unit test.

type CapturedWorker = {
  queueName: unknown
  processor: (job: { data: unknown }) => Promise<unknown>
  options: Record<string, unknown>
}

const workerState = vi.hoisted(() => ({
  capturedWorkers: [] as CapturedWorker[],
  coexistAttachmentDownload: vi.fn(async () => undefined),
  coexistInstagramSync: vi.fn(async () => undefined),
  coexistMessengerSync: vi.fn(async () => undefined),
  coexistWhatsappBuffer: vi.fn(async () => undefined),
  coexistWhatsappFlush: vi.fn(async () => undefined),
  ensureBootstrapped: vi.fn(async () => undefined),
  isBlockedWorkspace: vi.fn(async () => false),
  resolveWorkspaceId: vi.fn(async () => undefined),
  workerClose: vi.fn(async () => undefined),
  workerOn: vi.fn(),
}))

vi.mock("bullmq", () => {
  class WorkerMock {
    close = workerState.workerClose
    on = workerState.workerOn

    constructor(
      queueName: unknown,
      processor: CapturedWorker["processor"],
      options: Record<string, unknown>,
    ) {
      workerState.capturedWorkers.push({ queueName, processor, options })
    }
  }

  return { Worker: WorkerMock }
})

vi.mock("@chatbotx.io/worker-config", () => ({
  HeavyJobAction: {
    coexistWhatsappBuffer: "coexistWhatsappBuffer",
    coexistWhatsappFlush: "coexistWhatsappFlush",
    coexistMessengerSync: "coexistMessengerSync",
    coexistInstagramSync: "coexistInstagramSync",
    coexistAttachmentDownload: "coexistAttachmentDownload",
  },
  defaultWorkerOptions: {
    concurrency: 5,
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
  getRedisConnection: () => ({}),
  queueNames: {
    enum: {
      heavy: "heavy",
    },
  },
}))

vi.mock("../src/env", () => ({
  env: { HEAVY_WORKER_CONCURRENCY: 5 },
}))

vi.mock("../src/lib/bootstrap", () => ({
  ensureBootstrapped: workerState.ensureBootstrapped,
}))

vi.mock("../src/lib/is-blocked-workspace", () => ({
  isBlockedWorkspace: workerState.isBlockedWorkspace,
}))

vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

vi.mock("../src/lib/resolve-workspace-id", () => ({
  resolveWorkspaceId: workerState.resolveWorkspaceId,
}))

vi.mock("../src/heavy/handlers/coexist/attachment-download", () => ({
  coexistAttachmentDownload: workerState.coexistAttachmentDownload,
}))
vi.mock("../src/heavy/handlers/coexist/instagram-sync", () => ({
  coexistInstagramSync: workerState.coexistInstagramSync,
}))
vi.mock("../src/heavy/handlers/coexist/messenger-sync", () => ({
  coexistMessengerSync: workerState.coexistMessengerSync,
}))
vi.mock("../src/heavy/handlers/coexist/whatsapp-buffer", () => ({
  coexistWhatsappBuffer: workerState.coexistWhatsappBuffer,
}))
vi.mock("../src/heavy/handlers/coexist/whatsapp-flush", () => ({
  coexistWhatsappFlush: workerState.coexistWhatsappFlush,
}))

// Importing the worker module boots it exactly once (ESM module cache) — the
// single `new Worker(...)` call happens as a side effect of this import, so
// it must happen once, before any assertions, rather than per-test.
await import("../src/heavy/worker")
await vi.waitFor(() => {
  expect(workerState.capturedWorkers).toHaveLength(1)
})

describe("heavy worker process boot", () => {
  test("boots exactly one Worker, on the heavy queue", () => {
    expect(workerState.capturedWorkers).toHaveLength(1)
    expect(workerState.capturedWorkers[0]?.queueName).toBe("heavy")
  })

  test("uses the env-tunable concurrency and the long coexist lock", () => {
    const [heavyWorker] = workerState.capturedWorkers

    expect(heavyWorker?.options.concurrency).toBe(5)
    expect(heavyWorker?.options.lockDuration).toBe(10 * 60 * 1000)
    expect(heavyWorker?.options.stalledInterval).toBe(10 * 60 * 1000)
    expect(heavyWorker?.options.maxStalledCount).toBe(1)
  })
})

describe("heavy worker dispatch (exhaustive switch over HeavyJobData)", () => {
  const jobs: HeavyJobData[] = [
    {
      type: "coexistWhatsappBuffer",
      data: { phoneNumberId: "phone-1", payload: {} },
    },
    {
      type: "coexistWhatsappFlush",
      data: { phoneNumberId: "phone-1" },
    },
    {
      type: "coexistMessengerSync",
      data: { runId: "run-1", integrationId: "int-1", workspaceId: "ws-1" },
    },
    {
      type: "coexistInstagramSync",
      data: { runId: "run-1", integrationId: "int-1", workspaceId: "ws-1" },
    },
    {
      type: "coexistAttachmentDownload",
      data: {
        attachmentId: "att-1",
        workspaceId: "ws-1",
        channel: "messenger",
        integrationId: "int-1",
      },
    },
  ]

  const handlerByType: Record<HeavyJobData["type"], keyof typeof workerState> =
    {
      coexistWhatsappBuffer: "coexistWhatsappBuffer",
      coexistWhatsappFlush: "coexistWhatsappFlush",
      coexistMessengerSync: "coexistMessengerSync",
      coexistInstagramSync: "coexistInstagramSync",
      coexistAttachmentDownload: "coexistAttachmentDownload",
    }

  test.each(jobs)("dispatches $type to its own handler", async (jobData) => {
    for (const fn of Object.values(handlerByType)) {
      ;(workerState[fn] as ReturnType<typeof vi.fn>).mockClear()
    }
    const [heavyWorker] = workerState.capturedWorkers

    await heavyWorker?.processor({ data: jobData })

    const handlerKey = handlerByType[jobData.type]
    expect(workerState[handlerKey]).toHaveBeenCalledWith(jobData.data)
  })

  test("populates the audit actor with the heavy job source before dispatching", async () => {
    let capturedActor: ReturnType<typeof getAuditActor>
    workerState.coexistWhatsappBuffer.mockImplementationOnce(() => {
      capturedActor = getAuditActor()
      return Promise.resolve(undefined)
    })
    const [heavyWorker] = workerState.capturedWorkers

    await heavyWorker?.processor({ data: jobs[0] })

    expect(capturedActor).toEqual(
      expect.objectContaining({ source: "heavy:coexistWhatsappBuffer" }),
    )
  })

  test("short-circuits before dispatch when the workspace is blocked", async () => {
    workerState.isBlockedWorkspace.mockResolvedValueOnce(true)
    workerState.coexistWhatsappBuffer.mockClear()
    const [heavyWorker] = workerState.capturedWorkers

    await heavyWorker?.processor({ data: jobs[0] })

    expect(workerState.coexistWhatsappBuffer).not.toHaveBeenCalled()
  })
})
