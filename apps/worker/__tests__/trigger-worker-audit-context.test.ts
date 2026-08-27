import { getAuditActor } from "@chatbotx.io/business/audit"
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  ensureBootstrapped: vi.fn(),
  executeStep: vi.fn(),
  findMatchingTriggers: vi.fn(),
  isBlockedWorkspace: vi.fn(),
  processJob: undefined as undefined | ((job: unknown) => Promise<void>),
  resolveWorkspaceId: vi.fn(),
}))

vi.mock("@chatbotx.io/events/context", () => ({
  runWithWebhookExecutionContext: (
    _context: unknown,
    fn: () => Promise<unknown>,
  ) => fn(),
}))

vi.mock("@chatbotx.io/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/sdk")>()
  return { ...actual, SdkException: class SdkException extends Error {} }
})

vi.mock("@chatbotx.io/worker-config", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/worker-config")>()
  return {
    ...actual,
    TriggerJobAction: { evaluateTriggers: "evaluateTriggers" },
    defaultWorkerOptions: {},
    getRedisConnection: vi.fn(),
    queueNames: { enum: { trigger: "trigger" } },
  }
})

vi.mock("bullmq", () => ({
  Worker: class Worker {
    constructor(_queue: string, processJob: (job: unknown) => Promise<void>) {
      mocks.processJob = processJob
    }

    on() {
      // Worker event registration is not exercised by this unit test.
    }

    close() {
      return Promise.resolve()
    }
  },
}))

vi.mock("../src/lib/bootstrap", () => ({
  ensureBootstrapped: mocks.ensureBootstrapped,
}))
vi.mock("../src/lib/is-blocked-workspace", () => ({
  isBlockedWorkspace: mocks.isBlockedWorkspace,
}))
vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))
vi.mock("../src/lib/resolve-workspace-id", () => ({
  resolveWorkspaceId: mocks.resolveWorkspaceId,
}))
vi.mock("../src/trigger/services/trigger-executor.service", () => ({
  TriggerExecutorService: class {
    execute = (...args: unknown[]) => mocks.executeStep(...args)
  },
}))
vi.mock("../src/trigger/services/trigger-matcher.service", () => ({
  TriggerMatcherService: class {
    findMatchingTriggers = (...args: unknown[]) =>
      mocks.findMatchingTriggers(...args)
  },
}))

beforeAll(async () => {
  mocks.ensureBootstrapped.mockResolvedValue(undefined)
  await import("../src/trigger/worker")
  await vi.waitFor(() => expect(mocks.processJob).toBeTypeOf("function"))
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isBlockedWorkspace.mockResolvedValue(false)
  mocks.resolveWorkspaceId.mockResolvedValue("workspace-1")
  mocks.findMatchingTriggers.mockResolvedValue([{ id: "trigger-1" }])
})

describe("trigger worker audit context", () => {
  test("populates the audit actor with the resolved workspace before executing matched triggers", async () => {
    let capturedActor: ReturnType<typeof getAuditActor>
    mocks.executeStep.mockImplementationOnce(() => {
      capturedActor = getAuditActor()
    })

    await mocks.processJob?.({
      id: "job-1",
      data: {
        type: "evaluateTriggers",
        data: { source: "webhook", eventType: "test", contactId: "contact-1" },
      },
    })

    expect(capturedActor).toEqual(
      expect.objectContaining({
        workspaceId: "workspace-1",
        source: "trigger:evaluateTriggers",
      }),
    )
  })
})
