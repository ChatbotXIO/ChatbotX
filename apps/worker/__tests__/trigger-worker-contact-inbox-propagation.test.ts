import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// Queue -> worker seam (§5.6): verifies the trigger worker correctly
// round-trips a contactInboxId that a producer threaded through the shared
// metadata bag (via withContactInboxMetadata on the emitter side) back out
// with extractContactInboxId, and propagates it into
// TriggerExecutorService.execute's TriggerExecutionInput — the second
// argument now takes {contactId, contactInboxId} instead of a bare
// contactId string.
// ---------------------------------------------------------------------------

type TriggerWorkerJob = {
  data: {
    type: string
    data: {
      workspaceId: string
      contactId: string
      eventType: string
      eventData: Record<string, unknown>
      timestamp: Date
      source?: string
      channelOriginated?: boolean
    }
  }
}

type TriggerWorkerProcessor = (job: TriggerWorkerJob) => Promise<void>

const state = vi.hoisted(() => ({
  processor: undefined as TriggerWorkerProcessor | undefined,
  workerClose: vi.fn(async () => undefined),
  workerOn: vi.fn(),
  ensureBootstrapped: vi.fn(async () => undefined),
  isBlockedWorkspace: vi.fn(async () => false),
  resolveWorkspaceId: vi.fn(async () => "ws-1"),
  findMatchingTriggers: vi.fn(),
  triggerExecute: vi.fn(async () => undefined),
  runWithWebhookExecutionContext: vi.fn(
    async (_ctx: unknown, fn: () => unknown) => await fn(),
  ),
  loggerInfo: vi.fn(),
  loggerError: vi.fn(),
}))

vi.mock("bullmq", () => {
  class WorkerMock {
    close = state.workerClose
    on = state.workerOn

    constructor(
      _queueName: unknown,
      processor: TriggerWorkerProcessor,
      _options: unknown,
    ) {
      state.processor = processor
    }
  }

  return { Worker: WorkerMock }
})

vi.mock("@chatbotx.io/worker-config", () => ({
  defaultWorkerOptions: {},
  getRedisConnection: () => ({}),
  queueNames: { enum: { trigger: "trigger" } },
  TriggerJobAction: { evaluateTriggers: "evaluateTriggers" },
}))

vi.mock("@chatbotx.io/sdk", () => ({
  SdkException: class SdkException extends Error {},
}))

vi.mock("@chatbotx.io/events/context", () => ({
  runWithWebhookExecutionContext: (...args: [unknown, () => unknown]) =>
    state.runWithWebhookExecutionContext(...args),
}))

// extractContactInboxId is the real implementation (re-declared here rather
// than importActual'd, to avoid pulling @chatbotx.io/events' full barrel —
// TriggerEventEmitter/WebhookEventEmitter — into this narrow worker-seam
// test). Its own behavior is covered exhaustively by
// packages/events/__tests__/contact-inbox-context.test.ts; this test only
// needs the exact same key contract to prove the worker wires it correctly.
const CONTACT_INBOX_METADATA_KEY = "contactInboxId"
vi.mock("@chatbotx.io/events", () => ({
  extractContactInboxId: (eventData: Record<string, unknown> | undefined) => {
    const value = eventData?.[CONTACT_INBOX_METADATA_KEY]
    return typeof value === "string" && value.length > 0 ? value : undefined
  },
}))

vi.mock("../src/lib/bootstrap", () => ({
  ensureBootstrapped: () => state.ensureBootstrapped(),
}))

vi.mock("../src/lib/is-blocked-workspace", () => ({
  isBlockedWorkspace: (workspaceId: string | undefined) =>
    state.isBlockedWorkspace(workspaceId),
}))

vi.mock("../src/lib/resolve-workspace-id", () => ({
  resolveWorkspaceId: (data: unknown) => state.resolveWorkspaceId(data),
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    info: (...args: unknown[]) => state.loggerInfo(...args),
    error: (...args: unknown[]) => state.loggerError(...args),
  },
}))

vi.mock("../src/trigger/services/trigger-matcher.service", () => ({
  TriggerMatcherService: class {
    findMatchingTriggers = (...args: unknown[]) =>
      state.findMatchingTriggers(...args)
  },
}))

vi.mock("../src/trigger/services/trigger-executor.service", () => ({
  TriggerExecutorService: class {
    execute = (...args: unknown[]) => state.triggerExecute(...args)
  },
}))

await import("../src/trigger/worker")

const runTriggerJob = async (
  eventData: Record<string, unknown>,
): Promise<void> => {
  if (!state.processor) {
    throw new Error("Trigger worker processor was not captured")
  }
  await state.processor({
    data: {
      type: "evaluateTriggers",
      data: {
        workspaceId: "ws-1",
        contactId: "contact-1",
        eventType: "tagApplied",
        eventData,
        timestamp: new Date("2026-08-27T00:00:00Z"),
      },
    },
  })
}

describe("trigger worker — queue-to-executor contactInboxId propagation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.isBlockedWorkspace.mockResolvedValue(false)
    state.resolveWorkspaceId.mockResolvedValue("ws-1")
    state.runWithWebhookExecutionContext.mockImplementation(
      async (_ctx: unknown, fn: () => unknown) => await fn(),
    )
    state.findMatchingTriggers.mockResolvedValue([
      { id: "trigger-1", workspaceId: "ws-1", actions: [] },
    ])
  })

  test("extracts a threaded contactInboxId from eventData and passes it to TriggerExecutorService.execute", async () => {
    await runTriggerJob({ contactInboxId: "11669088263749632", tagId: "tag-1" })

    expect(state.triggerExecute).toHaveBeenCalledTimes(1)
    expect(state.triggerExecute).toHaveBeenCalledWith(
      { id: "trigger-1", workspaceId: "ws-1", actions: [] },
      { contactId: "contact-1", contactInboxId: "11669088263749632" },
    )
  })

  test("propagates undefined when eventData carries no contactInboxId (already-queued jobs, schema-precludes-attribution events)", async () => {
    await runTriggerJob({ tagId: "tag-1" })

    expect(state.triggerExecute).toHaveBeenCalledWith(
      { id: "trigger-1", workspaceId: "ws-1", actions: [] },
      { contactId: "contact-1", contactInboxId: undefined },
    )
  })

  test("propagates undefined when eventData carries a malformed (non-string) contactInboxId", async () => {
    await runTriggerJob({ contactInboxId: 12_345 })

    expect(state.triggerExecute).toHaveBeenCalledWith(
      { id: "trigger-1", workspaceId: "ws-1", actions: [] },
      { contactId: "contact-1", contactInboxId: undefined },
    )
  })
})
