import { getAuditActor } from "@chatbotx.io/business/audit"
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  ensureBootstrapped: vi.fn(),
  findAndExecuteWebhooks: vi.fn(),
  isBlockedWorkspace: vi.fn(),
  processJob: undefined as undefined | ((job: unknown) => Promise<void>),
}))

vi.mock("@chatbotx.io/worker-config", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/worker-config")>()
  return {
    ...actual,
    WebhookJobAction: { evaluateWebhooks: "evaluateWebhooks" },
    defaultWorkerOptions: {},
    getRedisConnection: vi.fn(),
    queueNames: { enum: { webhook: "webhook" } },
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

vi.mock("../src/env", () => ({
  env: { WEBHOOK_WORKER_CONCURRENCY: 10 },
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
vi.mock("../src/webhook/services/webhook-matcher.service", () => ({
  WebhookMatcherService: class {
    findAndExecuteWebhooks = (...args: unknown[]) =>
      mocks.findAndExecuteWebhooks(...args)
  },
}))

beforeAll(async () => {
  mocks.ensureBootstrapped.mockResolvedValue(undefined)
  await import("../src/webhook/worker")
  await vi.waitFor(() => expect(mocks.processJob).toBeTypeOf("function"))
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isBlockedWorkspace.mockResolvedValue(false)
})

describe("webhook worker audit context", () => {
  test("populates the audit actor with the job's own workspace before dispatching webhooks", async () => {
    let capturedActor: ReturnType<typeof getAuditActor>
    mocks.findAndExecuteWebhooks.mockImplementationOnce(() => {
      capturedActor = getAuditActor()
    })

    await mocks.processJob?.({
      id: "job-1",
      data: {
        type: "evaluateWebhooks",
        data: { workspaceId: "workspace-1" },
      },
    })

    expect(capturedActor).toEqual(
      expect.objectContaining({
        workspaceId: "workspace-1",
        source: "webhook:evaluateWebhooks",
      }),
    )
  })
})
