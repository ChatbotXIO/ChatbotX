import { beforeEach, describe, expect, test, vi } from "vitest"

const { consumeSpy, fetchDispatchSpy, loggerInfoSpy, loggerWarnSpy } =
  vi.hoisted(() => ({
    consumeSpy: vi.fn(),
    fetchDispatchSpy: vi.fn(),
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
    withLock = vi.fn()
  },
}))

vi.mock("@chatbotx.io/sequence-scheduler", () => ({
  advanceEnrollment: vi.fn(),
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: { sendSequenceFlow: "sendSequenceFlow" },
  SEQUENCE_SCHEDULER_QUEUE_NAME: "sequence-scheduler",
  integrationQueue: { add: vi.fn() },
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
      isDispatchReady = vi.fn()
      lockDispatch = vi.fn()
      validateDispatch = vi.fn()
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
    fetchStep = vi.fn()
    validateStep = vi.fn()
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
})
