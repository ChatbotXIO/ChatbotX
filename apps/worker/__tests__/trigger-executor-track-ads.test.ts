import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  actionExecutorExecute: vi.fn(),
  insertHistoryValues: vi.fn(),
  insertStatsValues: vi.fn(),
  onConflictDoUpdate: vi.fn(),
  setTriggerExecutionContext: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
  // Distinct sentinel objects so the db.insert mock below can tell which
  // table is being written to (triggerContactHistoryModel vs
  // triggerStatsModel) by reference equality.
  triggerContactHistoryModelRef: { name: "triggerContactHistoryModel" },
  triggerStatsModelRef: { name: "triggerStatsModel" },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    insert: (model: unknown) => {
      if (model === mocks.triggerStatsModelRef) {
        return {
          values: (...args: unknown[]) => {
            mocks.insertStatsValues(...args)
            return { onConflictDoUpdate: mocks.onConflictDoUpdate }
          },
        }
      }
      return {
        values: (...args: unknown[]) => mocks.insertHistoryValues(...args),
      }
    },
  },
  sql: (...args: unknown[]) => ({ sql: args }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  triggerContactHistoryModel: mocks.triggerContactHistoryModelRef,
  triggerStatsModel: mocks.triggerStatsModelRef,
}))

vi.mock("@chatbotx.io/events", () => ({
  setTriggerExecutionContext: (...args: unknown[]) =>
    mocks.setTriggerExecutionContext(...args),
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: vi.fn(() => "generated-id"),
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    error: (...args: unknown[]) => mocks.loggerError(...args),
    info: (...args: unknown[]) => mocks.loggerInfo(...args),
    warn: vi.fn(),
  },
}))

vi.mock("../src/trigger/services/action-executor", () => ({
  ActionExecutor: class {
    execute(input: unknown) {
      return mocks.actionExecutorExecute(input)
    }
  },
}))

const { TriggerExecutorService } = await import(
  "../src/trigger/services/trigger-executor.service"
)

// Full-chain wiring for the Trigger automation actions trackAdsLead /
// trackAdsPurchase: TriggerExecutorService -> ActionExecutor.execute (per
// action, per-action try/catch) -> adsConversionService.recordTriggerConversion
// -> AdsConversionEvent insert -> CAPI send enqueue. The last two hops are
// covered by packages/business/__tests__/ads-conversion-trigger.service.test.ts;
// this file covers the trigger-level wiring: that a trackAdsPurchase action
// reaches ActionExecutor.execute, and that an error in one action (including
// a trackAds* action) never prevents sibling actions — or the trigger's own
// history/stats bookkeeping — from completing.
describe("TriggerExecutorService action sibling isolation (trackAdsLead / trackAdsPurchase)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.insertHistoryValues.mockResolvedValue(undefined)
    mocks.onConflictDoUpdate.mockResolvedValue(undefined)
  })

  test("a trackAdsLead action reaching the executor does not block a later trackAdsPurchase sibling", async () => {
    mocks.actionExecutorExecute.mockResolvedValueOnce(undefined) // trackAdsLead
    mocks.actionExecutorExecute.mockResolvedValueOnce(undefined) // trackAdsPurchase

    const service = new TriggerExecutorService()
    await service.execute(
      {
        id: "trigger-1",
        workspaceId: "ws-1",
        actions: [
          { type: "trackAdsLead" },
          { type: "trackAdsPurchase", value: "10.00", currency: "USD" },
        ],
      } as never,
      { contactId: "contact-1" },
    )

    expect(mocks.actionExecutorExecute).toHaveBeenCalledTimes(2)
    expect(mocks.actionExecutorExecute).toHaveBeenNthCalledWith(1, {
      action: { type: "trackAdsLead" },
      contactId: "contact-1",
      triggerId: "trigger-1",
      workspaceId: "ws-1",
      contactInboxId: undefined,
    })
    expect(mocks.actionExecutorExecute).toHaveBeenNthCalledWith(2, {
      action: { type: "trackAdsPurchase", value: "10.00", currency: "USD" },
      contactId: "contact-1",
      triggerId: "trigger-1",
      workspaceId: "ws-1",
      contactInboxId: undefined,
    })
    // Trigger-level bookkeeping still runs — the whole trigger is recorded
    // as a success even though it carried multiple ads-tracking actions.
    expect(mocks.insertHistoryValues).toHaveBeenCalledTimes(1)
    expect(mocks.onConflictDoUpdate).toHaveBeenCalledTimes(1)
  })

  test("an error thrown for trackAdsLead (e.g. recordTriggerConversion rejecting) does not fail the trackAdsPurchase sibling or the trigger run", async () => {
    mocks.actionExecutorExecute.mockRejectedValueOnce(
      new Error("recordTriggerConversion failed"),
    ) // trackAdsLead
    mocks.actionExecutorExecute.mockResolvedValueOnce(undefined) // trackAdsPurchase

    const service = new TriggerExecutorService()
    await service.execute(
      {
        id: "trigger-1",
        workspaceId: "ws-1",
        actions: [
          { type: "trackAdsLead" },
          { type: "trackAdsPurchase", value: "10.00", currency: "USD" },
        ],
      } as never,
      { contactId: "contact-1" },
    )

    // Both actions were attempted despite the first one throwing.
    expect(mocks.actionExecutorExecute).toHaveBeenCalledTimes(2)
    // The failure was logged, not swallowed silently.
    expect(mocks.loggerError).toHaveBeenCalledTimes(1)
    // The trigger itself is still recorded as a successful run — a single
    // action's error must not fail sibling actions or the trigger.
    expect(mocks.insertHistoryValues).toHaveBeenCalledTimes(1)
    expect(mocks.onConflictDoUpdate).toHaveBeenCalledTimes(1)
    expect(mocks.insertStatsValues).toHaveBeenCalledWith(
      expect.objectContaining({ successCount: 1, failureCount: 0 }),
    )
  })
})
