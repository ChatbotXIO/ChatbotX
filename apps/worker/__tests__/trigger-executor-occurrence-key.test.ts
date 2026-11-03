import { beforeEach, describe, expect, test, vi } from "vitest"

// `TriggerExecutorService` hands each action a key that is identical on every
// retry of the same trigger job and different per action, which is what the
// Google Ads `event` dedup mode builds its provider id from.

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
  actions: [{ type: "addTag" }, { type: "sendGoogleAdsConversion" }],
} as unknown as Parameters<
  InstanceType<typeof TriggerExecutorService>["execute"]
>[0]

const keysOf = () =>
  mocks.execute.mock.calls.map(
    ([context]: [{ occurrenceKey?: string }]) => context.occurrenceKey,
  )

describe("TriggerExecutorService occurrence keys", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.execute.mockResolvedValue(undefined)
    mocks.tryAcquireContactRun.mockResolvedValue(true)
  })

  test("builds one key per action from the job id, the trigger and the position", async () => {
    await new TriggerExecutorService().execute(trigger, {
      contactId: "contact-1",
      occurrenceId: "job-9",
    })

    expect(keysOf()).toEqual([
      "trigger:job-9:trigger-1:0",
      "trigger:job-9:trigger-1:1",
    ])
  })

  test("the same job retried produces the same keys", async () => {
    const service = new TriggerExecutorService()
    await service.execute(trigger, { contactId: "c", occurrenceId: "job-9" })
    const first = keysOf()
    mocks.execute.mockClear()
    await service.execute(trigger, { contactId: "c", occurrenceId: "job-9" })

    expect(keysOf()).toEqual(first)
  })

  test("another job produces other keys", async () => {
    const service = new TriggerExecutorService()
    await service.execute(trigger, { contactId: "c", occurrenceId: "job-9" })
    const first = keysOf()
    mocks.execute.mockClear()
    await service.execute(trigger, { contactId: "c", occurrenceId: "job-10" })

    expect(keysOf()).not.toEqual(first)
  })

  test("without a job id there is no key", async () => {
    await new TriggerExecutorService().execute(trigger, {
      contactId: "contact-1",
    })

    expect(keysOf()).toEqual([undefined, undefined])
  })
})

describe("TriggerExecutorService bookkeeping", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.execute.mockResolvedValue(undefined)
  })

  test("runs every action with one shared scope", async () => {
    await new TriggerExecutorService().execute(trigger, {
      contactId: "contact-1",
    })

    const scopes = mocks.execute.mock.calls.map(([, scope]) => scope)
    expect(scopes).toHaveLength(2)
    expect(scopes[0]).toBe(scopes[1])
  })

  test("a bookkeeping failure after the actions ran does not rethrow, so the job is not retried", async () => {
    mocks.recordContactHistory.mockRejectedValueOnce(new Error("db down"))

    await expect(
      new TriggerExecutorService().execute(trigger, { contactId: "contact-1" }),
    ).resolves.toBeUndefined()
    expect(mocks.execute).toHaveBeenCalledTimes(2)
  })
})
