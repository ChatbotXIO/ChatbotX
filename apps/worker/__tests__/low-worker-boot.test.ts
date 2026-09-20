import { beforeEach, describe, expect, test, vi } from "vitest"

// Boots the real `src/low/worker.ts` (which starts itself on import) and asserts
// it creates exactly one BullMQ `Worker` on the `low` queue, routes each
// LowJobAction to the correct shared handler, and gates every job behind
// `withBlockedOwnerGuard`. All of the worker's imports are mocked to keep this a
// fast, isolated unit test.

type CapturedWorker = {
  queueName: unknown
  processor: (job: { data: unknown; id?: string }) => Promise<unknown>
  options: Record<string, unknown>
}

const workerState = vi.hoisted(() => ({
  capturedWorkers: [] as CapturedWorker[],
  ensureBootstrapped: vi.fn(async () => undefined),
  coexistAttachmentDownload: vi.fn(async () => undefined),
  updateContactAvatar: vi.fn(async () => undefined),
  withBlockedOwnerGuard: vi.fn(
    async (_workspaceId: unknown, fn: () => Promise<unknown>) => await fn(),
  ),
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
  LowJobAction: {
    coexistAttachmentDownload: "coexistAttachmentDownload",
    updateContactAvatar: "updateContactAvatar",
  },
  queueNames: { enum: { low: "low" } },
  defaultWorkerOptions: { concurrency: 5, removeOnComplete: { count: 1000 } },
  getRedisConnection: vi.fn(() => ({})),
}))

vi.mock("@chatbotx.io/business", () => ({
  withBlockedOwnerGuard: workerState.withBlockedOwnerGuard,
}))

vi.mock("../src/env", () => ({
  env: { LOW_WORKER_CONCURRENCY: 30 },
}))

vi.mock("../src/lib/bootstrap", () => ({
  ensureBootstrapped: workerState.ensureBootstrapped,
}))

vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

vi.mock("../src/lib/run-job-with-audit-context", () => ({
  runJobWithAuditContext: vi.fn(
    async (_params: unknown, fn: () => Promise<unknown>) => await fn(),
  ),
}))

vi.mock("../src/integration/handlers/coexist/attachment-download", () => ({
  coexistAttachmentDownload: workerState.coexistAttachmentDownload,
}))

vi.mock("../src/integration/handlers/contact/update-avatar", () => ({
  updateContactAvatar: workerState.updateContactAvatar,
}))

// Importing the worker module boots it exactly once (ESM module cache).
await import("../src/low/worker")
await vi.waitFor(() => {
  expect(workerState.capturedWorkers).toHaveLength(1)
})

describe("low worker process boot", () => {
  beforeEach(() => {
    workerState.coexistAttachmentDownload.mockClear()
    workerState.updateContactAvatar.mockClear()
    workerState.withBlockedOwnerGuard.mockClear()
    workerState.withBlockedOwnerGuard.mockImplementation(
      async (_workspaceId: unknown, fn: () => Promise<unknown>) => await fn(),
    )
  })

  test("boots exactly one Worker on the low queue at the env-tunable concurrency", () => {
    expect(workerState.capturedWorkers).toHaveLength(1)
    expect(workerState.capturedWorkers[0]?.queueName).toBe("low")
    expect(workerState.capturedWorkers[0]?.options.concurrency).toBe(30)
  })

  test("routes coexistAttachmentDownload to its handler with the job payload", async () => {
    const [worker] = workerState.capturedWorkers
    const data = {
      attachmentId: "att-1",
      workspaceId: "ws-1",
      channel: "messenger",
      integrationId: "int-1",
    }

    await worker?.processor({
      data: { type: "coexistAttachmentDownload", data },
    })

    expect(workerState.coexistAttachmentDownload).toHaveBeenCalledWith(data)
    expect(workerState.updateContactAvatar).not.toHaveBeenCalled()
    expect(workerState.withBlockedOwnerGuard).toHaveBeenCalledWith(
      "ws-1",
      expect.any(Function),
    )
  })

  test("routes updateContactAvatar to its handler with the job payload", async () => {
    const [worker] = workerState.capturedWorkers
    const data = {
      workspaceId: "ws-2",
      contactInboxId: "ci-2",
      sourceId: "src-2",
    }

    await worker?.processor({
      data: { type: "updateContactAvatar", data },
    })

    expect(workerState.updateContactAvatar).toHaveBeenCalledWith(data)
    expect(workerState.coexistAttachmentDownload).not.toHaveBeenCalled()
    expect(workerState.withBlockedOwnerGuard).toHaveBeenCalledWith(
      "ws-2",
      expect.any(Function),
    )
  })

  test("a frozen workspace short-circuits before any handler runs", async () => {
    workerState.withBlockedOwnerGuard.mockImplementationOnce(
      async () => undefined,
    )
    const [worker] = workerState.capturedWorkers

    await worker?.processor({
      data: {
        type: "coexistAttachmentDownload",
        data: {
          attachmentId: "att-3",
          workspaceId: "ws-3",
          channel: "whatsapp",
          integrationId: "int-3",
        },
      },
    })

    expect(workerState.coexistAttachmentDownload).not.toHaveBeenCalled()
  })

  test("an unknown action is a no-op — no handler is invoked", async () => {
    const [worker] = workerState.capturedWorkers

    await worker?.processor({
      data: { type: "somethingElse", data: { workspaceId: "ws-4" } },
    })

    expect(workerState.coexistAttachmentDownload).not.toHaveBeenCalled()
    expect(workerState.updateContactAvatar).not.toHaveBeenCalled()
  })
})
