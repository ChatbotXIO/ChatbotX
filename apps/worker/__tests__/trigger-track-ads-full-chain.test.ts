import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

// Full-chain integration test for the Trigger automation actions
// trackAdsLead / trackAdsPurchase: unlike trigger-executor-track-ads.test.ts
// (mocks ActionExecutor) and trigger-action-executor-track-ads.test.ts (mocks
// adsConversionService), this file exercises the REAL chain end-to-end —
//
//   TriggerExecutorService
//     -> real ActionExecutor.execute
//     -> real adsConversionService.recordTriggerConversion
//     -> real recordTriggerConversion (packages/business/src/ads-conversion/record-ads-conversion.ts)
//     -> AdsConversionEvent insert + CAPI send enqueue
//
// Mocking is deliberately confined to the outer boundaries only: the two
// db.query lookups ActionExecutor itself performs (conversation/contactInbox),
// contactInboxRepository.findByIdForWorkspace, the per-channel integration
// resolver repositories, adsConversionEventRepository, and the queue
// (enqueueIntegrationJob). `@chatbotx.io/business` is NOT mocked — the real
// barrel is loaded, exactly as apps/worker/__tests__/send-conversion-event.test.ts
// already does — so `db`/`utils` mocks below spread the actual module and
// only override the handful of members this test needs, keeping every other
// business/service module's module-scope code (zod schemas built from real
// `@chatbotx.io/database/schema` exports, `zodBigintAsString`, etc.) intact.

const mocks = vi.hoisted(() => ({
  conversationFindFirst: vi.fn(),
  contactInboxFindFirst: vi.fn(),
  insertHistoryValues: vi.fn(),
  insertStatsValues: vi.fn(),
  onConflictDoUpdate: vi.fn(),
  setTriggerExecutionContext: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
  findByIdForWorkspace: vi.fn(),
  findMostRecentByContact: vi.fn(),
  findAttributionByContactInbox: vi.fn(),
  findAttributionByAdReferral: vi.fn(),
  findBySourceEventId: vi.fn(),
  insertIgnoreDuplicate: vi.fn(),
  findWorkspaceIntegrationByInboxId: vi.fn(),
  findMessengerIntegrationByInboxId: vi.fn(),
  findInstagramIntegrationByInboxId: vi.fn(),
  enqueueIntegrationJob: vi.fn(),
}))

// db.query.conversationModel/contactInboxModel (ActionExecutor's own lookups)
// and db.insert (TriggerExecutorService's history/stats bookkeeping) are
// stubbed; everything else on the client — including every drizzle-orm
// re-export other business modules rely on at import time — stays real.
vi.mock("@chatbotx.io/database/client", async () => {
  const actual = await vi.importActual<
    typeof import("@chatbotx.io/database/client")
  >("@chatbotx.io/database/client")
  const { triggerContactHistoryModel, triggerStatsModel } =
    await vi.importActual<typeof import("@chatbotx.io/database/schema")>(
      "@chatbotx.io/database/schema",
    )

  return {
    ...actual,
    db: {
      ...actual.db,
      query: {
        ...actual.db.query,
        conversationModel: {
          findFirst: (...args: unknown[]) =>
            mocks.conversationFindFirst(...args),
        },
        contactInboxModel: {
          findFirst: (...args: unknown[]) =>
            mocks.contactInboxFindFirst(...args),
        },
      },
      insert: (model: unknown) => {
        if (model === triggerStatsModel) {
          return {
            values: (...args: unknown[]) => {
              mocks.insertStatsValues(...args)
              return { onConflictDoUpdate: mocks.onConflictDoUpdate }
            },
          }
        }
        if (model === triggerContactHistoryModel) {
          return {
            values: (...args: unknown[]) => mocks.insertHistoryValues(...args),
          }
        }
        // Not exercised by trackAdsLead/trackAdsPurchase (e.g. addTag's
        // contactsToTagsModel insert) — inert stand-in.
        return {
          values: () => ({
            onConflictDoNothing: () => ({ returning: vi.fn() }),
          }),
        }
      },
    },
  }
})

// `@chatbotx.io/database/schema` and `@chatbotx.io/database/partials` stay
// completely real: `packages/business/src/ads-conversion/schema.ts` builds
// zod schemas from `@chatbotx.io/database/schema` exports at module-eval
// time, and `action-executor.ts` switches on the real `triggerActions` enum
// from `@chatbotx.io/database/partials`.

vi.mock("@chatbotx.io/database/repositories", () => ({
  adsConversionEventRepository: {
    findAttributionByContactInbox: mocks.findAttributionByContactInbox,
    findAttributionByAdReferral: mocks.findAttributionByAdReferral,
    findBySourceEventId: mocks.findBySourceEventId,
    insertIgnoreDuplicate: mocks.insertIgnoreDuplicate,
  },
  contactInboxRepository: {
    findByIdForWorkspace: mocks.findByIdForWorkspace,
    findMostRecentByContact: mocks.findMostRecentByContact,
  },
  integrationWhatsappRepository: {
    findWorkspaceIntegrationByInboxId: mocks.findWorkspaceIntegrationByInboxId,
  },
  integrationMessengerRepository: {
    findWorkspaceIntegrationByInboxId: mocks.findMessengerIntegrationByInboxId,
  },
  integrationInstagramRepository: {
    findWorkspaceIntegrationByInboxId: mocks.findInstagramIntegrationByInboxId,
  },
  // Unused by recordTriggerConversion but required so importing the real
  // service.ts (which re-exports the whole rule-evaluation surface) does not
  // crash — mirrors packages/business/__tests__/ads-conversion-trigger.service.test.ts.
  adsConversionRuleRepository: {
    listByWorkspace: vi.fn(),
    findWorkspaceRule: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  integrationFacebookAdsRepository: {
    findWorkspaceIntegration: vi.fn(),
  },
}))

vi.mock("@chatbotx.io/worker-config", async () => {
  const actual = await vi.importActual<
    typeof import("@chatbotx.io/worker-config")
  >("@chatbotx.io/worker-config")
  return {
    ...actual,
    enqueueIntegrationJob: mocks.enqueueIntegrationJob,
  }
})

vi.mock("@chatbotx.io/utils", async () => {
  const actual =
    await vi.importActual<typeof import("@chatbotx.io/utils")>(
      "@chatbotx.io/utils",
    )
  return { ...actual, createId: vi.fn(() => "generated-id") }
})

vi.mock("@chatbotx.io/events", () => ({
  setTriggerExecutionContext: (...args: unknown[]) =>
    mocks.setTriggerExecutionContext(...args),
}))

vi.mock("@chatbotx.io/events/context", () => ({
  webhookChannelOrigin: vi.fn(() => "webhook"),
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    error: (...args: unknown[]) => mocks.loggerError(...args),
    info: (...args: unknown[]) => mocks.loggerInfo(...args),
    warn: vi.fn(),
  },
}))

vi.mock("../src/integration/handlers/spreadsheet-handler", () => ({
  clearSpreadsheetRow: vi.fn(),
  getSpreadsheetRandomRow: vi.fn(),
  getSpreadsheetRow: vi.fn(),
  sendSpreadsheetData: vi.fn(),
  updateSpreadsheetRow: vi.fn(),
}))

const { TriggerExecutorService } = await import(
  "../src/trigger/services/trigger-executor.service"
)

describe("Trigger trackAdsLead/trackAdsPurchase full chain (TriggerExecutorService -> real ActionExecutor -> real adsConversionService.recordTriggerConversion)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ now: new Date("2026-08-10T12:34:56.000Z") })

    mocks.insertHistoryValues.mockResolvedValue(undefined)
    mocks.onConflictDoUpdate.mockResolvedValue(undefined)

    mocks.conversationFindFirst.mockResolvedValue({
      id: "conv-1",
      contactId: "contact-1",
      workspaceId: "ws-1",
    })
    mocks.contactInboxFindFirst.mockResolvedValue({
      id: "ci-1",
      inboxId: "inbox-1",
      contactId: "contact-1",
      channel: "whatsapp",
    })

    mocks.findByIdForWorkspace.mockResolvedValue({
      id: "ci-1",
      channel: "whatsapp",
      inboxId: "inbox-1",
    })
    mocks.findMostRecentByContact.mockResolvedValue({
      id: "ci-1",
      channel: "whatsapp",
      inboxId: "inbox-1",
    })
    mocks.findWorkspaceIntegrationByInboxId.mockResolvedValue({ id: "iw-1" })
    mocks.findAttributionByContactInbox.mockResolvedValue({
      id: "ci-1",
      referral: { adId: "ad-1", ctwaClid: "clid-1" },
      wabaId: "waba-1",
    })
    mocks.findBySourceEventId.mockResolvedValue(null)
    mocks.enqueueIntegrationJob.mockResolvedValue(undefined)

    let insertCounter = 0
    mocks.insertIgnoreDuplicate.mockImplementation(
      (values: Record<string, unknown>) => {
        insertCounter += 1
        return {
          id: `event-${insertCounter}`,
          capiStatus: "pending",
          createdAt: new Date("2026-08-10T00:00:00.000Z"),
          updatedAt: new Date("2026-08-10T00:00:00.000Z"),
          ...values,
        }
      },
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test("a trigger with both trackAdsLead and trackAdsPurchase produces two AdsConversionEvent inserts, each followed by its own CAPI enqueue", async () => {
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

    expect(mocks.insertIgnoreDuplicate).toHaveBeenCalledTimes(2)

    // Lead insert: first call, dedup key embeds eventType "lead".
    expect(mocks.insertIgnoreDuplicate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        workspaceId: "ws-1",
        channel: "whatsapp",
        integrationWhatsappId: "iw-1",
        source: "trigger",
        eventType: "lead",
        contactInboxId: "ci-1",
        currency: null,
        value: null,
        sourceEventId: "trigger-trigger-1-lead-inbox-ci-1-20260810",
      }),
      undefined,
    )

    // Purchase insert: second call, distinct dedup key + threaded value/currency.
    expect(mocks.insertIgnoreDuplicate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        workspaceId: "ws-1",
        channel: "whatsapp",
        integrationWhatsappId: "iw-1",
        source: "trigger",
        eventType: "purchase",
        contactInboxId: "ci-1",
        currency: "USD",
        value: "10.00",
        sourceEventId: "trigger-trigger-1-purchase-inbox-ci-1-20260810",
      }),
      undefined,
    )

    // Each insert is followed by its own CAPI send enqueue, keyed by the
    // generated event id (idempotent jobId).
    expect(mocks.enqueueIntegrationJob).toHaveBeenCalledTimes(2)
    expect(mocks.enqueueIntegrationJob).toHaveBeenNthCalledWith(
      1,
      {
        type: "sendConversionEvent",
        data: { adsConversionEventId: "event-1", workspaceId: "ws-1" },
      },
      { jobId: "ads-conversion-send-event-1" },
    )
    expect(mocks.enqueueIntegrationJob).toHaveBeenNthCalledWith(
      2,
      {
        type: "sendConversionEvent",
        data: { adsConversionEventId: "event-2", workspaceId: "ws-1" },
      },
      { jobId: "ads-conversion-send-event-2" },
    )

    // Trigger-level bookkeeping still completes for a fully successful run.
    expect(mocks.insertHistoryValues).toHaveBeenCalledTimes(1)
    expect(mocks.insertStatsValues).toHaveBeenCalledWith(
      expect.objectContaining({ successCount: 1, failureCount: 0 }),
    )
  })

  test("a non-attributed contact (no CTWA referral) reaches recordTriggerConversion but inserts nothing and enqueues nothing", async () => {
    mocks.findAttributionByContactInbox.mockResolvedValue(null)

    const service = new TriggerExecutorService()
    await service.execute(
      {
        id: "trigger-1",
        workspaceId: "ws-1",
        actions: [{ type: "trackAdsLead" }],
      } as never,
      { contactId: "contact-1" },
    )

    expect(mocks.insertIgnoreDuplicate).not.toHaveBeenCalled()
    expect(mocks.enqueueIntegrationJob).not.toHaveBeenCalled()
    // Trigger bookkeeping still succeeds — an attribution no-op is not an error.
    expect(mocks.insertStatsValues).toHaveBeenCalledWith(
      expect.objectContaining({ successCount: 1, failureCount: 0 }),
    )
  })
})
