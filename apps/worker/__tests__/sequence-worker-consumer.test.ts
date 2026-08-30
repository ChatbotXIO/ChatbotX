import { beforeEach, describe, expect, test, vi } from "vitest"

// Real implementation, isolated from `@chatbotx.io/business/audit`'s barrel
// export — that module also re-exports `./service`, which pulls in
// `@chatbotx.io/utils`' Snowflake id generator. That generator throws on a
// second construction within the same process, and this file's
// `vi.resetModules()` (needed to re-boot the consumer singleton per test)
// would otherwise re-trigger it on every test.
vi.mock("@chatbotx.io/business/audit", async () => {
  const { AsyncLocalStorage } = await import("node:async_hooks")
  const storage = new AsyncLocalStorage<Record<string, unknown>>()
  return {
    SYSTEM_ACTOR: "system",
    withAuditContext: (actor: Record<string, unknown>, fn: () => unknown) =>
      storage.run(actor, fn),
    getAuditActor: () => storage.getStore(),
  }
})

const { getAuditActor } = await import("@chatbotx.io/business/audit")

const {
  consumeSpy,
  fetchDispatchSpy,
  integrationQueueAddSpy,
  loggerInfoSpy,
  loggerWarnSpy,
} = vi.hoisted(() => ({
  consumeSpy: vi.fn(),
  fetchDispatchSpy: vi.fn(),
  integrationQueueAddSpy: vi.fn(),
  loggerInfoSpy: vi.fn(),
  loggerWarnSpy: vi.fn(),
}))

vi.mock("@chatbotx.io/flow-config", () => ({
  SEQUENCE_SCHEDULE_PAYLOAD_TYPE: "sequence_schedule",
}))

vi.mock("@chatbotx.io/business", () => ({
  withBlockedOwnerGuard: async (
    _workspaceId: unknown,
    fn: () => Promise<unknown>,
  ) => fn(),
}))

vi.mock("@chatbotx.io/redis", () => ({
  sequenceConnections: { useExisting: vi.fn().mockResolvedValue({}) },
}))

vi.mock("@chatbotx.io/scheduler", () => ({
  SchedulerClient: class {
    addToSchedule = vi.fn()
    removeFromSchedule = vi.fn()
    withLock = vi.fn(
      (
        _bucket: unknown,
        _dispatchId: unknown,
        _ttl: unknown,
        fn: () => Promise<unknown>,
      ) => fn(),
    )
  },
}))

vi.mock("@chatbotx.io/sequence-scheduler", () => ({
  advanceEnrollment: vi.fn(),
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: { sendSequenceFlow: "sendSequenceFlow" },
  SEQUENCE_SCHEDULER_QUEUE_NAME: "sequence-scheduler",
  integrationQueue: { add: integrationQueueAddSpy },
}))

vi.mock("@chatbotx.io/worker-config/message-queue/factory", () => ({
  createConsumer: vi.fn().mockResolvedValue({
    close: vi.fn(),
    consume: consumeSpy,
  }),
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    info: loggerInfoSpy,
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

vi.mock("../src/sequence-scheduler/services/retry-scheduler.service", () => ({
  RetrySchedulerService: class {
    markDispatchCanceled = vi.fn()
  },
}))

vi.mock("../src/sequence-scheduler/services/step-executor.service", () => ({
  StepExecutorService: class {
    fetchStep = vi.fn(() => ({ id: "step-1", sequenceId: "sequence-1" }))
    validateStep = vi.fn(() => ({ valid: true }))
  },
}))

describe("sequence worker consumer", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    consumeSpy.mockImplementation(async (handler) => {
      await handler(JSON.stringify({ dispatchId: "dispatch-1", bucket: 1 }))
    })
  })

  test("logs and skips messages missing workspaceId", async () => {
    await import("../src/sequence-scheduler/worker-consumer")

    await vi.waitFor(() => {
      expect(consumeSpy).toHaveBeenCalledOnce()
    })

    expect(loggerWarnSpy).toHaveBeenCalledWith(
      { payload: { dispatchId: "dispatch-1", bucket: 1 } },
      "Skipping sequence dispatch message without workspaceId",
    )
    expect(fetchDispatchSpy).not.toHaveBeenCalled()
    expect(loggerInfoSpy).toHaveBeenCalledWith(
      "Dispatch consumer fully operational",
    )
  })

  test("populates the audit actor with the dispatch workspace before executing the sequence step", async () => {
    const dispatch = {
      id: "dispatch-1",
      workspaceId: "workspace-1",
      stepId: "step-1",
      sequenceId: "sequence-1",
      contactId: "contact-1",
      contactInboxId: "contact-inbox-1",
      enrollmentId: "enrollment-1",
      bucket: 1,
      attempt: 0,
    }
    fetchDispatchSpy.mockResolvedValue(dispatch)
    consumeSpy.mockImplementation(async (handler) => {
      await handler(
        JSON.stringify({
          dispatchId: "dispatch-1",
          bucket: 1,
          workspaceId: "workspace-1",
        }),
      )
    })

    let capturedActor: ReturnType<typeof getAuditActor>
    integrationQueueAddSpy.mockImplementationOnce(() => {
      capturedActor = getAuditActor()
      return Promise.resolve()
    })

    await import("../src/sequence-scheduler/worker-consumer")

    await vi.waitFor(() => {
      expect(integrationQueueAddSpy).toHaveBeenCalledOnce()
    })

    expect(capturedActor).toEqual(
      expect.objectContaining({
        workspaceId: "workspace-1",
        source: "sequence-scheduler:executeStep",
      }),
    )
  })
})
