import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findByIdForWorkspace: vi.fn(),
  findAttributionByContactInbox: vi.fn(),
  findAttributionByAdReferral: vi.fn(),
  findBySourceEventId: vi.fn(),
  insertIgnoreDuplicate: vi.fn(),
  findWorkspaceIntegrationByInboxId: vi.fn(),
  findMessengerIntegrationByInboxId: vi.fn(),
  findInstagramIntegrationByInboxId: vi.fn(),
  enqueueIntegrationJob: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  adsConversionEventRepository: {
    findAttributionByContactInbox: mocks.findAttributionByContactInbox,
    findAttributionByAdReferral: mocks.findAttributionByAdReferral,
    findBySourceEventId: mocks.findBySourceEventId,
    insertIgnoreDuplicate: mocks.insertIgnoreDuplicate,
  },
  contactInboxRepository: {
    findByIdForWorkspace: mocks.findByIdForWorkspace,
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
  // Unused by recordTriggerConversion but required so importing service.ts
  // (which re-exports the whole rule-evaluation surface) does not crash.
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

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(),
  withCache: (_key: string, fn: () => Promise<unknown>) => fn(),
  createRedisConnection: vi.fn(() => ({ on: vi.fn() })),
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

const { adsConversionService } = await import("../src/ads-conversion/service")

const baseInput = {
  workspaceId: "ws-1",
  contactInboxId: "ci-1",
  triggerId: "trigger-1",
}

describe("AdsConversionService.recordTriggerConversion", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ now: new Date("2026-08-10T12:34:56.000Z") })

    mocks.findByIdForWorkspace.mockResolvedValue({
      id: "ci-1",
      channel: "whatsapp",
      inboxId: "inbox-1",
    })
    mocks.findWorkspaceIntegrationByInboxId.mockResolvedValue({ id: "iw-1" })
    mocks.findMessengerIntegrationByInboxId.mockResolvedValue({ id: "im-1" })
    mocks.findInstagramIntegrationByInboxId.mockResolvedValue({ id: "ii-1" })
    mocks.findAttributionByContactInbox.mockResolvedValue({
      id: "ci-1",
      referral: { adId: "ad-1", ctwaClid: "clid-1" },
      wabaId: "waba-1",
    })
    mocks.findAttributionByAdReferral.mockResolvedValue({
      id: "ci-1",
      referral: { adId: "ad-1", source: "ADS" },
    })
    mocks.insertIgnoreDuplicate.mockImplementation(async (values: unknown) => ({
      id: "event-1",
      capiStatus: "pending",
      createdAt: new Date("2026-08-10T00:00:00.000Z"),
      updatedAt: new Date("2026-08-10T00:00:00.000Z"),
      ...(values as Record<string, unknown>),
    }))
    mocks.findBySourceEventId.mockResolvedValue(null)
    mocks.enqueueIntegrationJob.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test("non-attributed contact is a cheap no-op: one indexed lookup then return", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(null)

    await expect(
      adsConversionService.recordTriggerConversion({
        ...baseInput,
        eventType: "lead",
      }),
    ).resolves.toBeNull()

    expect(mocks.findByIdForWorkspace).toHaveBeenCalledTimes(1)
    expect(mocks.findByIdForWorkspace).toHaveBeenCalledWith(
      { id: "ci-1", workspaceId: "ws-1" },
      undefined,
    )
    expect(mocks.findWorkspaceIntegrationByInboxId).not.toHaveBeenCalled()
    expect(mocks.findAttributionByContactInbox).not.toHaveBeenCalled()
    expect(mocks.insertIgnoreDuplicate).not.toHaveBeenCalled()
  })

  test("non-ads-eligible channel (e.g. telegram) is a no-op after the single lookup", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue({
      id: "ci-1",
      channel: "telegram",
      inboxId: "inbox-1",
    })

    await expect(
      adsConversionService.recordTriggerConversion({
        ...baseInput,
        eventType: "lead",
      }),
    ).resolves.toBeNull()

    expect(mocks.findWorkspaceIntegrationByInboxId).not.toHaveBeenCalled()
    expect(mocks.insertIgnoreDuplicate).not.toHaveBeenCalled()
  })

  test("no-op when the inbox's channel has no integration resolved", async () => {
    mocks.findWorkspaceIntegrationByInboxId.mockResolvedValue(null)

    await expect(
      adsConversionService.recordTriggerConversion({
        ...baseInput,
        eventType: "lead",
      }),
    ).resolves.toBeNull()

    expect(mocks.findAttributionByContactInbox).not.toHaveBeenCalled()
    expect(mocks.insertIgnoreDuplicate).not.toHaveBeenCalled()
  })

  test("whatsapp: non-attributed contact (no CTWA referral) is a no-op", async () => {
    mocks.findAttributionByContactInbox.mockResolvedValue(null)

    await expect(
      adsConversionService.recordTriggerConversion({
        ...baseInput,
        eventType: "lead",
      }),
    ).resolves.toBeNull()

    expect(mocks.insertIgnoreDuplicate).not.toHaveBeenCalled()
  })

  test("whatsapp: empty-string ctwaClid is treated as absent (truthy gate, not just present)", async () => {
    mocks.findAttributionByContactInbox.mockResolvedValue({
      id: "ci-1",
      referral: { adId: "ad-1", ctwaClid: "" },
      wabaId: "waba-1",
    })

    await expect(
      adsConversionService.recordTriggerConversion({
        ...baseInput,
        eventType: "lead",
      }),
    ).resolves.toBeNull()

    expect(mocks.insertIgnoreDuplicate).not.toHaveBeenCalled()
  })

  test("whatsapp: attributed lead inserts a trigger-source event carrying ctwaClid + wabaId and enqueues CAPI send", async () => {
    await expect(
      adsConversionService.recordTriggerConversion({
        ...baseInput,
        eventType: "lead",
      }),
    ).resolves.toMatchObject({ id: "event-1" })

    expect(mocks.insertIgnoreDuplicate).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        channel: "whatsapp",
        integrationWhatsappId: "iw-1",
        wabaId: "waba-1",
        source: "trigger",
        eventType: "lead",
        ctwaClid: "clid-1",
        adId: "ad-1",
        contactInboxId: "ci-1",
        currency: null,
        value: null,
        sourceEventId: "trigger-trigger-1-lead-inbox-ci-1-20260810",
        capiStatus: "pending",
      }),
      undefined,
    )
    expect(mocks.enqueueIntegrationJob).toHaveBeenCalledWith(
      {
        type: "sendConversionEvent",
        data: { adsConversionEventId: "event-1", workspaceId: "ws-1" },
      },
      { jobId: "ads-conversion-send-event-1" },
    )
  })

  test("whatsapp: attributed purchase threads value/currency onto the inserted row", async () => {
    await expect(
      adsConversionService.recordTriggerConversion({
        ...baseInput,
        eventType: "purchase",
        value: "19.99",
        currency: "USD",
      }),
    ).resolves.toMatchObject({ id: "event-1" })

    expect(mocks.insertIgnoreDuplicate).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "purchase",
        value: "19.99",
        currency: "USD",
        sourceEventId: "trigger-trigger-1-purchase-inbox-ci-1-20260810",
      }),
      undefined,
    )
  })

  test("value/currency are ignored (forced null) for a lead event even if somehow provided", async () => {
    await adsConversionService.recordTriggerConversion({
      ...baseInput,
      eventType: "lead",
      value: "19.99",
      currency: "USD",
    })

    expect(mocks.insertIgnoreDuplicate).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "lead",
        value: null,
        currency: null,
      }),
      undefined,
    )
  })

  test("dedup key includes eventType: trackAdsLead and trackAdsPurchase on the same trigger/inbox/day produce TWO distinct events", async () => {
    const leadEvent = await adsConversionService.recordTriggerConversion({
      ...baseInput,
      eventType: "lead",
    })
    const purchaseEvent = await adsConversionService.recordTriggerConversion({
      ...baseInput,
      eventType: "purchase",
      value: "5.00",
      currency: "USD",
    })

    expect(leadEvent).not.toBeNull()
    expect(purchaseEvent).not.toBeNull()
    expect(mocks.insertIgnoreDuplicate).toHaveBeenCalledTimes(2)

    const sourceEventIds = mocks.insertIgnoreDuplicate.mock.calls.map(
      (call) => (call[0] as { sourceEventId: string }).sourceEventId,
    )
    expect(sourceEventIds).toEqual([
      "trigger-trigger-1-lead-inbox-ci-1-20260810",
      "trigger-trigger-1-purchase-inbox-ci-1-20260810",
    ])
  })

  test("deduped-retry: a still-pending existing row is re-enqueued (find-or-create recovery)", async () => {
    mocks.insertIgnoreDuplicate.mockResolvedValue(null)
    mocks.findBySourceEventId.mockResolvedValue({
      id: "event-existing",
      workspaceId: "ws-1",
      capiStatus: "pending",
    })

    await expect(
      adsConversionService.recordTriggerConversion({
        ...baseInput,
        eventType: "lead",
      }),
    ).resolves.toBeNull()

    expect(mocks.findBySourceEventId).toHaveBeenCalledWith(
      {
        workspaceId: "ws-1",
        integrationWhatsappId: "iw-1",
        source: "trigger",
        sourceEventId: "trigger-trigger-1-lead-inbox-ci-1-20260810",
      },
      undefined,
    )
    expect(mocks.enqueueIntegrationJob).toHaveBeenCalledWith(
      {
        type: "sendConversionEvent",
        data: { adsConversionEventId: "event-existing", workspaceId: "ws-1" },
      },
      { jobId: "ads-conversion-send-event-existing" },
    )
  })

  test("deduped: an already-sent existing row is not re-enqueued", async () => {
    mocks.insertIgnoreDuplicate.mockResolvedValue(null)
    mocks.findBySourceEventId.mockResolvedValue({
      id: "event-existing",
      workspaceId: "ws-1",
      capiStatus: "sent",
    })

    await expect(
      adsConversionService.recordTriggerConversion({
        ...baseInput,
        eventType: "lead",
      }),
    ).resolves.toBeNull()

    expect(mocks.enqueueIntegrationJob).not.toHaveBeenCalled()
  })

  test("messenger: non-attributed contact (SHORTLINK / no ADS referral) is a no-op", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue({
      id: "ci-2",
      channel: "messenger",
      inboxId: "inbox-2",
    })
    mocks.findAttributionByAdReferral.mockResolvedValue(null)

    await expect(
      adsConversionService.recordTriggerConversion({
        workspaceId: "ws-1",
        contactInboxId: "ci-2",
        triggerId: "trigger-1",
        eventType: "lead",
      }),
    ).resolves.toBeNull()

    expect(mocks.insertIgnoreDuplicate).not.toHaveBeenCalled()
  })

  test("messenger: attributed lead inserts a trigger-source event scoped to the messenger integration FK", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue({
      id: "ci-2",
      channel: "messenger",
      inboxId: "inbox-2",
    })

    await expect(
      adsConversionService.recordTriggerConversion({
        workspaceId: "ws-1",
        contactInboxId: "ci-2",
        triggerId: "trigger-1",
        eventType: "lead",
      }),
    ).resolves.toMatchObject({ id: "event-1" })

    expect(mocks.findMessengerIntegrationByInboxId).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      inboxId: "inbox-2",
    })
    expect(mocks.insertIgnoreDuplicate).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "messenger",
        integrationMessengerId: "im-1",
        integrationWhatsappId: null,
        integrationInstagramId: null,
        source: "trigger",
        eventType: "lead",
        adId: "ad-1",
        contactInboxId: "ci-2",
        sourceEventId: "trigger-trigger-1-lead-inbox-ci-2-20260810",
      }),
      undefined,
    )
  })

  test("messenger: attributed purchase threads value/currency", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue({
      id: "ci-2",
      channel: "messenger",
      inboxId: "inbox-2",
    })

    await adsConversionService.recordTriggerConversion({
      workspaceId: "ws-1",
      contactInboxId: "ci-2",
      triggerId: "trigger-1",
      eventType: "purchase",
      value: "42.50",
      currency: "EUR",
    })

    expect(mocks.insertIgnoreDuplicate).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "purchase",
        value: "42.50",
        currency: "EUR",
      }),
      undefined,
    )
  })

  test("instagram: non-attributed contact is a no-op", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue({
      id: "ci-3",
      channel: "instagram",
      inboxId: "inbox-3",
    })
    mocks.findAttributionByAdReferral.mockResolvedValue(null)

    await expect(
      adsConversionService.recordTriggerConversion({
        workspaceId: "ws-1",
        contactInboxId: "ci-3",
        triggerId: "trigger-1",
        eventType: "lead",
      }),
    ).resolves.toBeNull()

    expect(mocks.insertIgnoreDuplicate).not.toHaveBeenCalled()
  })

  test("instagram: attributed lead inserts a trigger-source event scoped to the instagram integration FK", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue({
      id: "ci-3",
      channel: "instagram",
      inboxId: "inbox-3",
    })

    await expect(
      adsConversionService.recordTriggerConversion({
        workspaceId: "ws-1",
        contactInboxId: "ci-3",
        triggerId: "trigger-1",
        eventType: "lead",
      }),
    ).resolves.toMatchObject({ id: "event-1" })

    expect(mocks.findInstagramIntegrationByInboxId).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      inboxId: "inbox-3",
    })
    expect(mocks.insertIgnoreDuplicate).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "instagram",
        integrationInstagramId: "ii-1",
        integrationWhatsappId: null,
        integrationMessengerId: null,
        source: "trigger",
        eventType: "lead",
        adId: "ad-1",
        contactInboxId: "ci-3",
        sourceEventId: "trigger-trigger-1-lead-inbox-ci-3-20260810",
      }),
      undefined,
    )
  })

  test("instagram: attributed purchase threads value/currency", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue({
      id: "ci-3",
      channel: "instagram",
      inboxId: "inbox-3",
    })

    await adsConversionService.recordTriggerConversion({
      workspaceId: "ws-1",
      contactInboxId: "ci-3",
      triggerId: "trigger-1",
      eventType: "purchase",
      value: "7.25",
      currency: "GBP",
    })

    expect(mocks.insertIgnoreDuplicate).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "purchase",
        value: "7.25",
        currency: "GBP",
      }),
      undefined,
    )
  })
})
