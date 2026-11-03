import { beforeEach, describe, expect, test, vi } from "vitest"

// `TriggerExecutorService` is the loop circuit breaker: a trigger that already
// ran too often for this contact in the window is skipped entirely, with no
// action, no contact history and no stats, so a runaway automation loop stops.

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  recordContactHistory: vi.fn(),
  incrementStats: vi.fn(),
  tryAcquireContactRun: vi.fn(),
}))

vi.mock("../src/trigger/services/action-executor", () => ({
  ActionExecutor: class {
    execute = mocks.execute
  },
}))
vi.mock("@chatbotx.io/business", () => ({
  triggerService: {
    recordContactHistory: mocks.recordContactHistory,
    incrementStats: mocks.incrementStats,
    tryAcquireContactRun: mocks.tryAcquireContactRun,
  },
}))
vi.mock("@chatbotx.io/events", () => ({
  setTriggerExecutionContext: vi.fn(),
}))
vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

const { TriggerExecutorService } = await import(
  "../src/trigger/services/trigger-executor.service"
)

const trigger = {
  id: "trigger-1",
  workspaceId: "ws-1",
  actions: [{ type: "addTag" }],
} as unknown as Parameters<
  InstanceType<typeof TriggerExecutorService>["execute"]
>[0]

describe("TriggerExecutorService run limit", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.execute.mockResolvedValue(undefined)
  })

  test("runs the actions when the contact is within the run limit", async () => {
    mocks.tryAcquireContactRun.mockResolvedValue(true)

    await new TriggerExecutorService().execute(trigger, {
      contactId: "contact-1",
    })

    expect(mocks.tryAcquireContactRun).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      triggerId: "trigger-1",
      contactId: "contact-1",
    })
    expect(mocks.execute).toHaveBeenCalledTimes(1)
    expect(mocks.recordContactHistory).toHaveBeenCalledTimes(1)
  })

  test("skips the whole run and records nothing once the limit is exceeded", async () => {
    mocks.tryAcquireContactRun.mockResolvedValue(false)

    await expect(
      new TriggerExecutorService().execute(trigger, {
        contactId: "contact-1",
      }),
    ).resolves.toBeUndefined()

    expect(mocks.execute).not.toHaveBeenCalled()
    expect(mocks.recordContactHistory).not.toHaveBeenCalled()
    expect(mocks.incrementStats).not.toHaveBeenCalled()
  })
})
