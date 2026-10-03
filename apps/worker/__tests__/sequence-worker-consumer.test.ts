import { AsyncLocalStorage } from "node:async_hooks"
import { getAuditActor } from "@chatbotx.io/business/audit"
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  fetchDispatchSpy,
  integrationQueueAddSpy,
  isLockAcquisitionErrorSpy,
  loggerDebugSpy,
  loggerErrorSpy,
  loggerWarnSpy,
  removeFromScheduleSpy,
  useExistingSpy,
  withLockSpy,
  workerCloseSpy,
  workerCreatedSpy,
  workerOnSpy,
  workerOptionsSpy,
  workerProcessorSpy,
  workerWaitUntilReadySpy,
} = vi.hoisted(() => ({
  fetchDispatchSpy: vi.fn(),
  integrationQueueAddSpy: vi.fn(),
  isLockAcquisitionErrorSpy: vi.fn(),
  loggerDebugSpy: vi.fn(),
  loggerErrorSpy: vi.fn(),
  loggerWarnSpy: vi.fn(),
  removeFromScheduleSpy: vi.fn(),
  useExistingSpy: vi.fn(),
  withLockSpy: vi.fn(),
  workerCloseSpy: vi.fn(),
  workerCreatedSpy: vi.fn(),
  workerOnSpy: vi.fn(),
  workerOptionsSpy: vi.fn(),
  workerProcessorSpy: vi.fn(),
  workerWaitUntilReadySpy: vi.fn(),
}))

const auditStorage = new AsyncLocalStorage<Record<string, unknown>>()

vi.mock("@chatbotx.io/business/audit", () => ({
  SYSTEM_ACTOR: "system",
  auditService: { record: vi.fn() },
  getAuditActor: () => auditStorage.getStore(),
  withAuditContext: (actor: Record<string, unknown>, fn: () => unknown) =>
    auditStorage.run(actor, fn),
}))

vi.mock("@chatbotx.io/flow-config", () => ({
  SEQUENCE_SCHEDULE_PAYLOAD_TYPE: "sequenceSchedule",
}))

vi.mock("@chatbotx.io/redis", () => ({
  isLockAcquisitionError: isLockAcquisitionErrorSpy,
  sequenceConnections: { useExisting: useExistingSpy },
}))

vi.mock("@chatbotx.io/scheduler", () => ({
  SchedulerClient: class {
    addToSchedule = vi.fn()
    getLockKey = (bucket: number, dispatchId: string) =>
      `seq:dispatch:{${bucket}}:lock:${dispatchId}`
    removeFromSchedule = removeFromScheduleSpy
    withLock = withLockSpy
  },
}))

vi.mock("@chatbotx.io/sequence-scheduler", () => ({
  advanceEnrollment: vi.fn(),
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: { sendSequenceFlow: "sendSequenceFlow" },
  integrationQueue: { add: integrationQueueAddSpy },
  queueNames: { enum: { sequenceScheduler: "sequence-scheduler" } },
}))

vi.mock("bullmq", () => ({
  Worker: class {
    constructor(
      _queueName: string,
      processor: (job: unknown) => Promise<void>,
      options: unknown,
    ) {
      workerCreatedSpy()
      workerOptionsSpy(options)
      workerProcessorSpy.mockImplementation(processor)
    }

    close = workerCloseSpy
    on = workerOnSpy
    waitUntilReady = workerWaitUntilReadySpy
  },
}))

vi.mock("../src/lib/bootstrap", () => ({
  ensureBootstrapped: vi.fn(),
}))

vi.mock("../src/lib/is-blocked-workspace", () => ({
  isBlockedWorkspace: vi.fn().mockResolvedValue(false),
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    debug: loggerDebugSpy,
    error: loggerErrorSpy,
    info: vi.fn(),
    warn: loggerWarnSpy,
  },
}))

vi.mock("../src/sequence-scheduler/revert-dispatch", () => ({
  revertDispatchToPending: vi.fn(),
}))

vi.mock(
  "../src/sequence-scheduler/services/dispatch-processor.service",
  () => ({
    DispatchProcessorService: class {
      fetchDispatch = fetchDispatchSpy
      isDispatchReady = vi.fn(() => true)
      lockDispatch = vi.fn(() => true)
      validateDispatch = vi.fn(() => true)
    },
  }),
)

vi.mock("../src/sequence-scheduler/services/step-executor.service", () => ({
  StepExecutorService: class {
    fetchStep = vi.fn(() => ({ id: "step-1", sequenceId: "sequence-1" }))
    validateStep = vi.fn(() => ({ valid: true }))
  },
}))

vi.mock("../src/sequence-scheduler/services/retry-scheduler.service", () => ({
  RetrySchedulerService: class {
    markDispatchCanceled = vi.fn()
  },
}))

const startConsumer = async (): Promise<void> => {
  // The consumer is a module-scope singleton; reset it to exercise each startup independently.
  await import("../src/sequence-scheduler/worker-consumer")
  await vi.waitFor(() => {
    expect(workerCreatedSpy).toHaveBeenCalledOnce()
  })
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  fetchDispatchSpy.mockResolvedValue(null)
  isLockAcquisitionErrorSpy.mockReturnValue(false)
  removeFromScheduleSpy.mockResolvedValue(undefined)
  useExistingSpy.mockResolvedValue({})
  withLockSpy.mockImplementation(
    async (
      _bucket: number,
      _dispatchId: string,
      _timeoutInSeconds: number,
      fn: () => Promise<void>,
    ) => await fn(),
  )
  workerCloseSpy.mockResolvedValue(undefined)
  workerWaitUntilReadySpy.mockResolvedValue(undefined)
})

describe("sequence scheduler consumer", () => {
  test("processes the legacy wrapper payload during the one-release cutover", async () => {
    await startConsumer()

    await workerProcessorSpy({
      data: {
        key: "dispatch-1",
        value: JSON.stringify({
          bucket: 3,
          dispatchId: "dispatch-1",
          workspaceId: "workspace-1",
        }),
      },
    })

    expect(withLockSpy).toHaveBeenCalledWith(
      3,
      "dispatch-1",
      30,
      expect.any(Function),
    )
    expect(removeFromScheduleSpy).toHaveBeenCalledWith(3, "dispatch-1")
  })

  test("removes terminal jobs so the scheduler can enqueue a retried dispatch", async () => {
    await startConsumer()

    expect(workerOptionsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        removeOnComplete: { count: 0 },
        removeOnFail: { count: 0 },
      }),
    )
  })

  test("sets the dispatch workspace audit context before enqueuing a sequence step", async () => {
    fetchDispatchSpy.mockResolvedValue({
      attempt: 0,
      bucket: 3,
      contactId: "contact-1",
      contactInboxId: "contact-inbox-1",
      enrollmentId: "enrollment-1",
      id: "dispatch-1",
      sequenceId: "sequence-1",
      stepId: "step-1",
      workspaceId: "workspace-1",
    })
    integrationQueueAddSpy.mockImplementation(() => {
      expect(getAuditActor()).toEqual(
        expect.objectContaining({
          source: "sequence-scheduler:executeStep",
          workspaceId: "workspace-1",
        }),
      )
    })
    await startConsumer()

    await workerProcessorSpy({
      data: {
        bucket: 3,
        claimedAt: Date.now(),
        dispatchId: "dispatch-1",
        workspaceId: "workspace-1",
      },
    })

    expect(integrationQueueAddSpy).toHaveBeenCalledOnce()
  })

  test("discards malformed legacy payloads without retrying", async () => {
    await startConsumer()

    await expect(
      workerProcessorSpy({ data: { key: "dispatch-1", value: "{invalid" } }),
    ).resolves.toBeUndefined()

    expect(fetchDispatchSpy).not.toHaveBeenCalled()
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(SyntaxError) }),
      expect.stringContaining("Failed to parse"),
    )
  })

  test("skips lock contention without failing the BullMQ job", async () => {
    const lockError = new Error("lock held")
    withLockSpy.mockRejectedValueOnce(lockError)
    isLockAcquisitionErrorSpy.mockImplementation(
      (_error: unknown, key: string) =>
        key === "seq:dispatch:{3}:lock:dispatch-1",
    )
    await startConsumer()

    await expect(
      workerProcessorSpy({
        data: {
          bucket: 3,
          claimedAt: Date.now(),
          dispatchId: "dispatch-1",
          workspaceId: "workspace-1",
        },
      }),
    ).resolves.toBeUndefined()

    expect(loggerDebugSpy).toHaveBeenCalledWith(
      expect.objectContaining({ err: lockError }),
      expect.stringContaining("another worker owns the lock"),
    )

    expect(isLockAcquisitionErrorSpy).toHaveBeenCalledWith(
      lockError,
      "seq:dispatch:{3}:lock:dispatch-1",
    )
  })

  test("propagates non-lock failures so BullMQ retries the job", async () => {
    const processingError = new Error("database unavailable")
    withLockSpy.mockRejectedValueOnce(processingError)
    await startConsumer()

    await expect(
      workerProcessorSpy({
        data: {
          bucket: 3,
          claimedAt: Date.now(),
          dispatchId: "dispatch-1",
          workspaceId: "workspace-1",
        },
      }),
    ).rejects.toThrow("database unavailable")

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ err: processingError }),
      expect.stringContaining("propagating for BullMQ retry"),
    )
  })

  test("rethrows a lock error for a nested lock with a different key", async () => {
    const nestedLockError = new Error("nested lock held")
    withLockSpy.mockRejectedValueOnce(nestedLockError)
    isLockAcquisitionErrorSpy.mockReturnValue(false)
    await startConsumer()

    await expect(
      workerProcessorSpy({
        data: {
          bucket: 3,
          claimedAt: Date.now(),
          dispatchId: "dispatch-1",
          workspaceId: "workspace-1",
        },
      }),
    ).rejects.toThrow("nested lock held")

    expect(isLockAcquisitionErrorSpy).toHaveBeenCalledWith(
      nestedLockError,
      "seq:dispatch:{3}:lock:dispatch-1",
    )
  })
})
