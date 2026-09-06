import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  delete: vi.fn(),
  adsConversionQueueAdd: vi.fn(),
  findAttributionByContactInbox: vi.fn(),
  findAttributionByCtwaClid: vi.fn(),
  findAttributionByAdReferral: vi.fn(),
  findBySourceEventId: vi.fn(),
  findWorkspaceRule: vi.fn(),
  findWorkspaceFacebookAdsIntegration: vi.fn(),
  findWorkspaceWhatsappIntegration: vi.fn(),
  findWorkspaceMessengerIntegration: vi.fn(),
  findWorkspaceInstagramIntegration: vi.fn(),
  findWorkspaceIntegrationByInboxId: vi.fn(),
  findMessengerIntegrationByInboxId: vi.fn(),
  findInstagramIntegrationByInboxId: vi.fn(),
  listWhatsappCtwaInboxesByContact: vi.fn(),
  listWhatsappCtwaInboxesByContacts: vi.fn(),
  listAdEligibleInboxesByContacts: vi.fn(),
  insertIgnoreDuplicate: vi.fn(),
  listByWorkspace: vi.fn(),
  update: vi.fn(),
  invalidateCacheByTags: vi.fn(),
  withCache: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  adsConversionEventRepository: {
    findAttributionByContactInbox: mocks.findAttributionByContactInbox,
    findAttributionByCtwaClid: mocks.findAttributionByCtwaClid,
    findAttributionByAdReferral: mocks.findAttributionByAdReferral,
    findBySourceEventId: mocks.findBySourceEventId,
    insertIgnoreDuplicate: mocks.insertIgnoreDuplicate,
  },
  adsConversionRuleRepository: {
    create: mocks.create,
    delete: mocks.delete,
    findWorkspaceRule: mocks.findWorkspaceRule,
    listByWorkspace: mocks.listByWorkspace,
    update: mocks.update,
  },
  contactInboxRepository: {
    listWhatsappCtwaInboxesByContact: mocks.listWhatsappCtwaInboxesByContact,
    listWhatsappCtwaInboxesByContacts: mocks.listWhatsappCtwaInboxesByContacts,
    listAdEligibleInboxesByContacts: mocks.listAdEligibleInboxesByContacts,
  },
  integrationFacebookAdsRepository: {
    findWorkspaceIntegration: mocks.findWorkspaceFacebookAdsIntegration,
  },
  integrationWhatsappRepository: {
    findByIdForWorkspace: mocks.findWorkspaceWhatsappIntegration,
    findWorkspaceIntegrationByInboxId: mocks.findWorkspaceIntegrationByInboxId,
  },
  integrationMessengerRepository: {
    findWorkspaceIntegration: mocks.findWorkspaceMessengerIntegration,
    findWorkspaceIntegrationByInboxId: mocks.findMessengerIntegrationByInboxId,
  },
  integrationInstagramRepository: {
    findWorkspaceIntegration: mocks.findWorkspaceInstagramIntegration,
    findWorkspaceIntegrationByInboxId: mocks.findInstagramIntegrationByInboxId,
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: mocks.invalidateCacheByTags,
  withCache: (_key: string, fn: () => Promise<unknown>, _options?: unknown) => {
    mocks.withCache(_key, _options)
    return fn()
  },
  createRedisConnection: vi.fn(() => ({ on: vi.fn() })),
}))

vi.mock("@chatbotx.io/worker-config", async () => {
  const actual = await vi.importActual<
    typeof import("@chatbotx.io/worker-config")
  >("@chatbotx.io/worker-config")
  return {
    ...actual,
    enqueueIntegrationJob: mocks.adsConversionQueueAdd,
  }
})

const { adsConversionService } = await import("../src/ads-conversion/service")

const NOT_SUPPORTED_FOR_INSTAGRAM = /not supported for channel "instagram"/
const NOT_SUPPORTED_FOR_FACEBOOK = /not supported for channel "facebook"/

const validWhatsappInput = {
  workspaceId: "1",
  channel: "whatsapp" as const,
  integrationWhatsappId: "201",
  integrationFacebookAdsId: null,
  adAccountId: null,
  eventType: "lead" as const,
  trigger: { type: "templateSent" as const, templateIds: ["template-1"] },
  markAs: "deal_won",
  enabled: true,
}

describe("AdsConversionService", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.create.mockImplementation(async (values: unknown) => ({
      id: "301",
      createdAt: new Date("2026-08-10T00:00:00.000Z"),
      updatedAt: new Date("2026-08-10T00:00:00.000Z"),
      ...values,
    }))
    mocks.update.mockImplementation(async (input: { values: unknown }) => ({
      id: "301",
      workspaceId: "1",
      channel: "whatsapp",
      integrationWhatsappId: "201",
      integrationFacebookAdsId: null,
      adAccountId: null,
      eventType: "lead",
      trigger: { type: "templateSent", templateIds: ["template-1"] },
      markAs: "deal_won",
      enabled: true,
      createdAt: new Date("2026-08-10T00:00:00.000Z"),
      updatedAt: new Date("2026-08-10T00:00:00.000Z"),
      ...(input.values as Record<string, unknown>),
    }))
    mocks.delete.mockResolvedValue({ id: "301" })
    mocks.findWorkspaceRule.mockResolvedValue({
      id: "301",
      workspaceId: "1",
      channel: "whatsapp",
      integrationWhatsappId: "201",
      integrationFacebookAdsId: null,
      adAccountId: null,
      eventType: "lead",
      trigger: { type: "templateSent", templateIds: ["template-1"] },
      markAs: "deal_won",
      enabled: true,
      createdAt: new Date("2026-08-10T00:00:00.000Z"),
      updatedAt: new Date("2026-08-10T00:00:00.000Z"),
    })
    mocks.findWorkspaceWhatsappIntegration.mockResolvedValue({
      id: "201",
      workspaceId: "1",
    })
    mocks.findWorkspaceFacebookAdsIntegration.mockResolvedValue({
      id: "241",
      workspaceId: "1",
    })
    mocks.findAttributionByCtwaClid.mockResolvedValue({
      id: "101",
      referral: { adId: "ad-1", ctwaClid: "clid-1" },
      wabaId: "waba-1",
    })
    mocks.findAttributionByContactInbox.mockResolvedValue({
      id: "101",
      referral: { adId: "ad-1", ctwaClid: "clid-1" },
      wabaId: "waba-1",
    })
    mocks.listByWorkspace.mockResolvedValue([
      {
        id: "301",
        workspaceId: "1",
        channel: "whatsapp",
        integrationWhatsappId: "201",
        integrationFacebookAdsId: null,
        adAccountId: null,
        eventType: "lead",
        trigger: { type: "templateSent", templateIds: ["template-1"] },
        markAs: null,
        enabled: true,
        createdAt: new Date("2026-08-10T00:00:00.000Z"),
        updatedAt: new Date("2026-08-10T00:00:00.000Z"),
      },
    ])
    mocks.adsConversionQueueAdd.mockResolvedValue(undefined)
    vi.useFakeTimers({
      now: new Date("2026-08-10T12:34:56.000Z"),
    })
    mocks.insertIgnoreDuplicate.mockImplementation(async (values: unknown) => ({
      id: "event-1",
      createdAt: new Date("2026-08-10T00:00:00.000Z"),
      updatedAt: new Date("2026-08-10T00:00:00.000Z"),
      ...values,
    }))
    mocks.findBySourceEventId.mockResolvedValue(null)
    mocks.findWorkspaceIntegrationByInboxId.mockResolvedValue({
      id: "201",
      wabaId: "waba-1",
    })
    mocks.listWhatsappCtwaInboxesByContact.mockResolvedValue([
      { contactInboxId: "101", integrationWhatsappId: "201" },
    ])
  })

  test("evaluateTemplateSent skips rule loading when contact has no CTWA attribution", async () => {
    mocks.findAttributionByContactInbox.mockResolvedValue(null)

    await expect(
      adsConversionService.evaluateTemplateSent({
        workspaceId: "1",
        channel: "whatsapp",
        integrationId: "201",
        contactInboxId: "101",
        templateId: "template-1",
      }),
    ).resolves.toEqual([])

    expect(mocks.findAttributionByContactInbox).toHaveBeenCalledWith(
      {
        workspaceId: "1",
        integrationWhatsappId: "201",
        contactInboxId: "101",
      },
      undefined,
    )
    expect(mocks.listByWorkspace).not.toHaveBeenCalled()
    expect(mocks.insertIgnoreDuplicate).not.toHaveBeenCalled()
  })

  test("evaluateTemplateSent inserts matching rule event and enqueues CAPI send", async () => {
    await expect(
      adsConversionService.evaluateTemplateSent({
        workspaceId: "1",
        channel: "whatsapp",
        integrationId: "201",
        contactInboxId: "101",
        templateId: "template-1",
      }),
    ).resolves.toHaveLength(1)

    expect(mocks.listByWorkspace).toHaveBeenCalledWith(
      "1",
      {
        channel: "whatsapp",
        enabled: true,
        integrationWhatsappId: "201",
      },
      undefined,
    )
    expect(mocks.insertIgnoreDuplicate).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "1",
        channel: "whatsapp",
        integrationWhatsappId: "201",
        wabaId: "waba-1",
        source: "rule",
        eventType: "lead",
        ctwaClid: "clid-1",
        adId: "ad-1",
        contactInboxId: "101",
        currency: null,
        value: null,
        sourceEventId: "rule-301-inbox-101-20260810",
        capiStatus: "pending",
        capiSentAt: null,
      }),
      undefined,
    )
    expect(mocks.adsConversionQueueAdd).toHaveBeenCalledWith(
      {
        type: "sendConversionEvent",
        data: {
          adsConversionEventId: "event-1",
          workspaceId: "1",
        },
      },
      { jobId: "ads-conversion-send-event-1" },
    )
    expect(mocks.adsConversionQueueAdd.mock.calls[0][1].jobId).not.toContain(
      ":",
    )
  })

  test("evaluateTemplateSent recovers a deduped still-pending event and re-enqueues its send", async () => {
    // Insert deduped (a prior run already created the row), and the existing
    // row is still `pending` — a previous enqueue-after-insert failure. The
    // find-or-create recovery must re-enqueue instead of silently dropping
    // the CAPI send.
    mocks.insertIgnoreDuplicate.mockResolvedValueOnce(null)
    mocks.findBySourceEventId.mockResolvedValueOnce({
      id: "event-existing",
      workspaceId: "1",
      capiStatus: "pending",
    })

    await adsConversionService.evaluateTemplateSent({
      workspaceId: "1",
      channel: "whatsapp",
      integrationId: "201",
      contactInboxId: "101",
      templateId: "template-1",
    })

    expect(mocks.findBySourceEventId).toHaveBeenCalledWith(
      {
        workspaceId: "1",
        integrationWhatsappId: "201",
        source: "rule",
        sourceEventId: "rule-301-inbox-101-20260810",
      },
      undefined,
    )
    expect(mocks.adsConversionQueueAdd).toHaveBeenCalledWith(
      {
        type: "sendConversionEvent",
        data: { adsConversionEventId: "event-existing", workspaceId: "1" },
      },
      { jobId: "ads-conversion-send-event-existing" },
    )
  })

  test("evaluateTemplateSent does not re-enqueue a deduped already-sent event", async () => {
    mocks.insertIgnoreDuplicate.mockResolvedValueOnce(null)
    mocks.findBySourceEventId.mockResolvedValueOnce({
      id: "event-existing",
      workspaceId: "1",
      capiStatus: "sent",
    })

    await adsConversionService.evaluateTemplateSent({
      workspaceId: "1",
      channel: "whatsapp",
      integrationId: "201",
      contactInboxId: "101",
      templateId: "template-1",
    })

    expect(mocks.adsConversionQueueAdd).not.toHaveBeenCalled()
  })

  test("evaluateTemplateSent inserts purchase rule events without value", async () => {
    mocks.listByWorkspace.mockResolvedValue([
      {
        id: "307",
        workspaceId: "1",
        channel: "whatsapp",
        integrationWhatsappId: "201",
        integrationFacebookAdsId: null,
        adAccountId: null,
        eventType: "purchase",
        trigger: { type: "templateSent", templateIds: ["template-1"] },
        markAs: null,
        enabled: true,
        createdAt: new Date("2026-08-10T00:00:00.000Z"),
        updatedAt: new Date("2026-08-10T00:00:00.000Z"),
      },
    ])

    await expect(
      adsConversionService.evaluateTemplateSent({
        workspaceId: "1",
        channel: "whatsapp",
        integrationId: "201",
        contactInboxId: "101",
        templateId: "template-1",
      }),
    ).resolves.toMatchObject([
      {
        eventType: "purchase",
        currency: null,
        value: null,
      },
    ])

    expect(mocks.insertIgnoreDuplicate).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "rule",
        eventType: "purchase",
        currency: null,
        value: null,
        sourceEventId: "rule-307-inbox-101-20260810",
      }),
      undefined,
    )
  })

  test("evaluateTemplateSent ignores non-matching template ids", async () => {
    await adsConversionService.evaluateTemplateSent({
      workspaceId: "1",
      channel: "whatsapp",
      integrationId: "201",
      contactInboxId: "101",
      templateId: "template-2",
    })

    expect(mocks.insertIgnoreDuplicate).not.toHaveBeenCalled()
    expect(mocks.adsConversionQueueAdd).not.toHaveBeenCalled()
  })

  test("evaluateTemplateSent does not match disabled rules because repository filters enabled rules", async () => {
    mocks.listByWorkspace.mockResolvedValue([])

    await adsConversionService.evaluateTemplateSent({
      workspaceId: "1",
      channel: "whatsapp",
      integrationId: "201",
      contactInboxId: "101",
      templateId: "template-1",
    })

    expect(mocks.listByWorkspace).toHaveBeenCalledWith(
      "1",
      expect.objectContaining({ enabled: true }),
      undefined,
    )
    expect(mocks.insertIgnoreDuplicate).not.toHaveBeenCalled()
  })

  test("evaluateTemplateSent skips CAPI enqueue when event insert is deduped", async () => {
    mocks.insertIgnoreDuplicate.mockResolvedValue(null)

    await expect(
      adsConversionService.evaluateTemplateSent({
        workspaceId: "1",
        channel: "whatsapp",
        integrationId: "201",
        contactInboxId: "101",
        templateId: "template-1",
      }),
    ).resolves.toEqual([])

    expect(mocks.insertIgnoreDuplicate).toHaveBeenCalledTimes(1)
    expect(mocks.adsConversionQueueAdd).not.toHaveBeenCalled()
  })

  test("evaluateTemplateSent leaves tagApplied rules deferred", async () => {
    mocks.listByWorkspace.mockResolvedValue([
      {
        id: "302",
        workspaceId: "1",
        channel: "whatsapp",
        integrationWhatsappId: "201",
        integrationFacebookAdsId: null,
        adAccountId: null,
        eventType: "lead",
        trigger: { type: "tagApplied", tagIds: ["tag-1"] },
        markAs: null,
        enabled: true,
        createdAt: new Date("2026-08-10T00:00:00.000Z"),
        updatedAt: new Date("2026-08-10T00:00:00.000Z"),
      },
    ])

    await adsConversionService.evaluateTemplateSent({
      workspaceId: "1",
      channel: "whatsapp",
      integrationId: "201",
      contactInboxId: "101",
      templateId: "template-1",
    })

    expect(mocks.insertIgnoreDuplicate).not.toHaveBeenCalled()
  })

  test("rejects channel and integration FK mismatches", async () => {
    await expect(
      adsConversionService.create({
        ...validWhatsappInput,
        integrationWhatsappId: null,
        integrationFacebookAdsId: "241",
      }),
    ).rejects.toThrow("integration must match")

    await expect(
      adsConversionService.create({
        ...validWhatsappInput,
        integrationFacebookAdsId: "241",
      }),
    ).rejects.toThrow("integration must match")

    await expect(
      adsConversionService.create({
        ...validWhatsappInput,
        integrationWhatsappId: null,
      }),
    ).rejects.toThrow("integration must match")

    expect(mocks.create).not.toHaveBeenCalled()
  })

  test("rejects invalid trigger payloads", async () => {
    await expect(
      adsConversionService.create({
        ...validWhatsappInput,
        trigger: { type: "templateSent", templateIds: [] },
      }),
    ).rejects.toThrow()

    await expect(
      adsConversionService.create({
        ...validWhatsappInput,
        trigger: { type: "unknown", templateIds: ["template-1"] },
      }),
    ).rejects.toThrow()

    expect(mocks.create).not.toHaveBeenCalled()
  })

  test("accepts tagApplied, keywordMatched, and contactReplied rules at the create and update boundary", async () => {
    await expect(
      adsConversionService.create({
        ...validWhatsappInput,
        trigger: { type: "tagApplied", tagIds: ["tag-1"] },
      }),
    ).resolves.toMatchObject({
      trigger: { type: "tagApplied", tagIds: ["tag-1"] },
    })

    await expect(
      adsConversionService.create({
        ...validWhatsappInput,
        trigger: {
          type: "keywordMatched",
          automatedResponseIds: ["ar-1"],
        },
      }),
    ).resolves.toMatchObject({
      trigger: { type: "keywordMatched", automatedResponseIds: ["ar-1"] },
    })

    await expect(
      adsConversionService.create({
        ...validWhatsappInput,
        trigger: { type: "contactReplied", firstReplyOnly: true },
      }),
    ).resolves.toMatchObject({
      trigger: { type: "contactReplied", firstReplyOnly: true },
    })

    await expect(
      adsConversionService.update({
        id: "301",
        workspaceId: "1",
        trigger: { type: "tagApplied", tagIds: ["tag-1"] },
      }),
    ).resolves.toMatchObject({
      trigger: { type: "tagApplied", tagIds: ["tag-1"] },
    })

    expect(mocks.create).toHaveBeenCalledTimes(3)
    expect(mocks.update).toHaveBeenCalledTimes(1)
  })

  test("rejects create when WhatsApp integration is not in the workspace", async () => {
    mocks.findWorkspaceWhatsappIntegration.mockResolvedValue(null)

    await expect(
      adsConversionService.create(validWhatsappInput),
    ).rejects.toThrow("integration was not found in this workspace")

    expect(mocks.findWorkspaceWhatsappIntegration).toHaveBeenCalledWith(
      { id: "201", workspaceId: "1" },
      undefined,
    )
    expect(mocks.create).not.toHaveBeenCalled()
  })

  test("rejects update when swapping to a WhatsApp integration outside the workspace", async () => {
    mocks.findWorkspaceWhatsappIntegration.mockResolvedValue(null)

    await expect(
      adsConversionService.update({
        id: "301",
        workspaceId: "1",
        integrationWhatsappId: "202",
      }),
    ).rejects.toThrow("integration was not found in this workspace")

    expect(mocks.findWorkspaceWhatsappIntegration).toHaveBeenCalledWith(
      { id: "202", workspaceId: "1" },
      undefined,
    )
    expect(mocks.update).not.toHaveBeenCalled()
  })

  test("toggles a workspace-scoped rule", async () => {
    await expect(
      adsConversionService.toggleEnabled({
        id: "301",
        workspaceId: "1",
        enabled: false,
      }),
    ).resolves.toMatchObject({ enabled: false })

    expect(mocks.update).toHaveBeenCalledWith(
      {
        id: "301",
        workspaceId: "1",
        values: { enabled: false },
      },
      undefined,
    )
  })

  test("passes workspace scoping through repository calls", async () => {
    await adsConversionService.list({
      workspaceId: "1",
      channel: "whatsapp",
    })
    await adsConversionService.update({
      id: "301",
      workspaceId: "1",
      trigger: { type: "templateSent", templateIds: ["template-2"] },
    })
    await adsConversionService.remove({ id: "301", workspaceId: "1" })

    expect(mocks.listByWorkspace).toHaveBeenCalledWith(
      "1",
      { channel: "whatsapp" },
      undefined,
    )
    expect(mocks.findWorkspaceRule).toHaveBeenCalledWith(
      { id: "301", workspaceId: "1" },
      undefined,
    )
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "301",
        workspaceId: "1",
      }),
      undefined,
    )
    expect(mocks.delete).toHaveBeenCalledWith(
      { id: "301", workspaceId: "1" },
      undefined,
    )
  })

  test("maps automatic LeadSubmitted events to lead rows with attribution", async () => {
    await expect(
      adsConversionService.ingestAutomaticEvent({
        workspaceId: "1",
        integrationWhatsappId: "201",
        wabaId: "waba-1",
        payload: {
          event_name: "LeadSubmitted",
          id: "wamid.lead-1",
          timestamp: "1800000000",
          ctwa_clid: "clid-1",
          custom_data: { currency: "USD", value: "19.99" },
        },
      }),
    ).resolves.toMatchObject({
      eventType: "lead",
      contactInboxId: "101",
      adId: "ad-1",
      capiStatus: "pending",
    })

    expect(mocks.findAttributionByCtwaClid).toHaveBeenCalledWith(
      {
        workspaceId: "1",
        integrationWhatsappId: "201",
        ctwaClid: "clid-1",
      },
      undefined,
    )
    expect(mocks.insertIgnoreDuplicate).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "automatic",
        eventType: "lead",
        sourceEventId: "wamid.lead-1",
        contactInboxId: "101",
        adId: "ad-1",
        currency: "USD",
        value: "19.99",
      }),
      undefined,
    )
  })

  test("passes duplicate automatic event null result through", async () => {
    mocks.insertIgnoreDuplicate.mockResolvedValue(null)

    await expect(
      adsConversionService.ingestAutomaticEvent({
        workspaceId: "1",
        integrationWhatsappId: "201",
        wabaId: "waba-1",
        payload: {
          event_name: "Purchase",
          id: "wamid.purchase-1",
          timestamp: 1_800_000_001,
          ctwa_clid: "clid-1",
        },
      }),
    ).resolves.toBeNull()

    expect(mocks.insertIgnoreDuplicate).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "purchase" }),
      undefined,
    )
  })

  test("inserts automatic events with null attribution when no contact matches", async () => {
    mocks.findAttributionByCtwaClid.mockResolvedValue(null)

    await adsConversionService.ingestAutomaticEvent({
      workspaceId: "1",
      integrationWhatsappId: "201",
      wabaId: "waba-1",
      payload: {
        event_name: "LeadSubmitted",
        id: "wamid.lead-2",
        timestamp: "1800000002",
        ctwa_clid: "clid-missing",
      },
    })

    expect(mocks.insertIgnoreDuplicate).toHaveBeenCalledWith(
      expect.objectContaining({
        contactInboxId: null,
        adId: null,
      }),
      undefined,
    )
  })
})

describe("AdsConversionService.evaluateConversionTrigger", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findAttributionByContactInbox.mockResolvedValue({
      id: "101",
      referral: { adId: "ad-1", ctwaClid: "clid-1" },
      wabaId: "waba-1",
    })
    mocks.listByWorkspace.mockResolvedValue([
      {
        id: "302",
        workspaceId: "1",
        channel: "whatsapp",
        integrationWhatsappId: "201",
        integrationFacebookAdsId: null,
        adAccountId: null,
        eventType: "lead",
        trigger: { type: "tagApplied", tagIds: ["tag-1"] },
        markAs: null,
        enabled: true,
        createdAt: new Date("2026-08-10T00:00:00.000Z"),
        updatedAt: new Date("2026-08-10T00:00:00.000Z"),
      },
    ])
    mocks.insertIgnoreDuplicate.mockImplementation(async (values: unknown) => ({
      id: "event-1",
      capiStatus: "pending",
      createdAt: new Date("2026-08-10T00:00:00.000Z"),
      updatedAt: new Date("2026-08-10T00:00:00.000Z"),
      ...values,
    }))
    mocks.findBySourceEventId.mockResolvedValue(null)
    mocks.adsConversionQueueAdd.mockResolvedValue(undefined)
    vi.useFakeTimers({ now: new Date("2026-08-10T12:34:56.000Z") })
  })

  const tagOccurrenceInput = {
    workspaceId: "1",
    channel: "whatsapp" as const,
    integrationId: "201",
    contactInboxId: "101",
    occurrence: { type: "tagApplied" as const, tagId: "tag-1" },
  }

  test("returns [] and skips rule loading without CTWA attribution", async () => {
    mocks.findAttributionByContactInbox.mockResolvedValue(null)

    await expect(
      adsConversionService.evaluateConversionTrigger(tagOccurrenceInput),
    ).resolves.toEqual([])

    expect(mocks.listByWorkspace).not.toHaveBeenCalled()
    expect(mocks.insertIgnoreDuplicate).not.toHaveBeenCalled()
  })

  test("matches a tagApplied rule, inserts the event, and enqueues the send job", async () => {
    await expect(
      adsConversionService.evaluateConversionTrigger(tagOccurrenceInput),
    ).resolves.toHaveLength(1)

    expect(mocks.insertIgnoreDuplicate).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "1",
        channel: "whatsapp",
        integrationWhatsappId: "201",
        source: "rule",
        eventType: "lead",
        contactInboxId: "101",
        sourceEventId: "rule-302-inbox-101-20260810",
        capiStatus: "pending",
      }),
      undefined,
    )
    expect(mocks.adsConversionQueueAdd).toHaveBeenCalledWith(
      {
        type: "sendConversionEvent",
        data: { adsConversionEventId: "event-1", workspaceId: "1" },
      },
      { jobId: "ads-conversion-send-event-1" },
    )
  })

  test("does not match when occurrence.tagId is not in the rule's tagIds", async () => {
    await expect(
      adsConversionService.evaluateConversionTrigger({
        ...tagOccurrenceInput,
        occurrence: { type: "tagApplied", tagId: "tag-other" },
      }),
    ).resolves.toEqual([])

    expect(mocks.insertIgnoreDuplicate).not.toHaveBeenCalled()
  })

  test("matches a keywordMatched rule via occurrence.automatedResponseId", async () => {
    mocks.listByWorkspace.mockResolvedValue([
      {
        id: "309",
        workspaceId: "1",
        channel: "whatsapp",
        integrationWhatsappId: "201",
        integrationFacebookAdsId: null,
        adAccountId: null,
        eventType: "lead",
        trigger: { type: "keywordMatched", automatedResponseIds: ["ar-1"] },
        markAs: null,
        enabled: true,
        createdAt: new Date("2026-08-10T00:00:00.000Z"),
        updatedAt: new Date("2026-08-10T00:00:00.000Z"),
      },
    ])

    await expect(
      adsConversionService.evaluateConversionTrigger({
        workspaceId: "1",
        channel: "whatsapp",
        integrationId: "201",
        contactInboxId: "101",
        occurrence: { type: "keywordMatched", automatedResponseId: "ar-1" },
      }),
    ).resolves.toHaveLength(1)
  })

  test("contactReplied rule matches any reply when firstReplyOnly is false", async () => {
    mocks.listByWorkspace.mockResolvedValue([
      {
        id: "306",
        workspaceId: "1",
        channel: "whatsapp",
        integrationWhatsappId: "201",
        integrationFacebookAdsId: null,
        adAccountId: null,
        eventType: "lead",
        trigger: { type: "contactReplied", firstReplyOnly: false },
        markAs: null,
        enabled: true,
        createdAt: new Date("2026-08-10T00:00:00.000Z"),
        updatedAt: new Date("2026-08-10T00:00:00.000Z"),
      },
    ])

    await expect(
      adsConversionService.evaluateConversionTrigger({
        workspaceId: "1",
        channel: "whatsapp",
        integrationId: "201",
        contactInboxId: "101",
        occurrence: { type: "contactReplied", isFirstReply: false },
      }),
    ).resolves.toHaveLength(1)
  })

  test("contactReplied rule with firstReplyOnly ignores a non-first reply", async () => {
    mocks.listByWorkspace.mockResolvedValue([
      {
        id: "305",
        workspaceId: "1",
        channel: "whatsapp",
        integrationWhatsappId: "201",
        integrationFacebookAdsId: null,
        adAccountId: null,
        eventType: "lead",
        trigger: { type: "contactReplied", firstReplyOnly: true },
        markAs: null,
        enabled: true,
        createdAt: new Date("2026-08-10T00:00:00.000Z"),
        updatedAt: new Date("2026-08-10T00:00:00.000Z"),
      },
    ])

    await expect(
      adsConversionService.evaluateConversionTrigger({
        workspaceId: "1",
        channel: "whatsapp",
        integrationId: "201",
        contactInboxId: "101",
        occurrence: { type: "contactReplied", isFirstReply: false },
      }),
    ).resolves.toEqual([])

    expect(mocks.insertIgnoreDuplicate).not.toHaveBeenCalled()
  })

  test("dedupe: when insertIgnoreDuplicate is deduped and the existing event is still pending, re-enqueues the send job", async () => {
    mocks.insertIgnoreDuplicate.mockResolvedValue(null)
    mocks.findBySourceEventId.mockResolvedValue({
      id: "event-existing",
      workspaceId: "1",
      capiStatus: "pending",
    })

    await expect(
      adsConversionService.evaluateConversionTrigger(tagOccurrenceInput),
    ).resolves.toEqual([])

    expect(mocks.findBySourceEventId).toHaveBeenCalledWith(
      {
        workspaceId: "1",
        integrationWhatsappId: "201",
        source: "rule",
        sourceEventId: "rule-302-inbox-101-20260810",
      },
      undefined,
    )
    expect(mocks.adsConversionQueueAdd).toHaveBeenCalledWith(
      {
        type: "sendConversionEvent",
        data: { adsConversionEventId: "event-existing", workspaceId: "1" },
      },
      { jobId: "ads-conversion-send-event-existing" },
    )
  })

  test("dedupe: does not re-enqueue when the existing deduped event already sent", async () => {
    mocks.insertIgnoreDuplicate.mockResolvedValue(null)
    mocks.findBySourceEventId.mockResolvedValue({
      id: "event-existing",
      workspaceId: "1",
      capiStatus: "sent",
    })

    await expect(
      adsConversionService.evaluateConversionTrigger(tagOccurrenceInput),
    ).resolves.toEqual([])

    expect(mocks.adsConversionQueueAdd).not.toHaveBeenCalled()
  })
})

describe("AdsConversionService tagApplied/keywordMatched/contactReplied enqueue helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.adsConversionQueueAdd.mockResolvedValue(undefined)
    mocks.findWorkspaceIntegrationByInboxId.mockResolvedValue({
      id: "201",
      wabaId: "waba-1",
    })
    mocks.findMessengerIntegrationByInboxId.mockResolvedValue({ id: "211" })
    mocks.findInstagramIntegrationByInboxId.mockResolvedValue({ id: "231" })
    mocks.listAdEligibleInboxesByContacts.mockResolvedValue([
      {
        contactId: "contact-1",
        contactInboxId: "101",
        integrationId: "201",
        channel: "whatsapp",
      },
      {
        contactId: "contact-1",
        contactInboxId: "102",
        integrationId: "202",
        channel: "whatsapp",
      },
    ])
    vi.useFakeTimers({ now: new Date("2026-08-10T12:34:56.000Z") })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test("enqueueTagAppliedEvaluations fans out one job per ad-eligible inbox of the contact", async () => {
    await adsConversionService.enqueueTagAppliedEvaluations({
      workspaceId: "1",
      contactId: "contact-1",
      tagId: "tag-1",
    })

    expect(mocks.listAdEligibleInboxesByContacts).toHaveBeenCalledWith({
      workspaceId: "1",
      contactIds: ["contact-1"],
    })
    expect(mocks.adsConversionQueueAdd).toHaveBeenCalledTimes(2)
    expect(mocks.adsConversionQueueAdd).toHaveBeenCalledWith(
      {
        type: "evaluateConversionTrigger",
        data: {
          workspaceId: "1",
          channel: "whatsapp",
          integrationId: "201",
          contactInboxId: "101",
          occurrence: { type: "tagApplied", tagId: "tag-1" },
        },
      },
      { jobId: "ads-conversion-evaluate-tag-101-tag-1-20260810" },
    )
    expect(mocks.adsConversionQueueAdd).toHaveBeenCalledWith(
      {
        type: "evaluateConversionTrigger",
        data: {
          workspaceId: "1",
          channel: "whatsapp",
          integrationId: "202",
          contactInboxId: "102",
          occurrence: { type: "tagApplied", tagId: "tag-1" },
        },
      },
      { jobId: "ads-conversion-evaluate-tag-102-tag-1-20260810" },
    )
  })

  test("enqueueTagAppliedEvaluations fans out to a messenger inbox using its own channel/integrationId", async () => {
    mocks.listAdEligibleInboxesByContacts.mockResolvedValue([
      {
        contactId: "contact-1",
        contactInboxId: "103",
        integrationId: "211",
        channel: "messenger",
      },
    ])

    await adsConversionService.enqueueTagAppliedEvaluations({
      workspaceId: "1",
      contactId: "contact-1",
      tagId: "tag-1",
    })

    expect(mocks.adsConversionQueueAdd).toHaveBeenCalledWith(
      {
        type: "evaluateConversionTrigger",
        data: {
          workspaceId: "1",
          channel: "messenger",
          integrationId: "211",
          contactInboxId: "103",
          occurrence: { type: "tagApplied", tagId: "tag-1" },
        },
      },
      { jobId: "ads-conversion-evaluate-tag-103-tag-1-20260810" },
    )
  })

  test("enqueueTagAppliedEvaluations enqueues nothing when the contact has no ad-eligible inbox", async () => {
    mocks.listAdEligibleInboxesByContacts.mockResolvedValue([])

    await adsConversionService.enqueueTagAppliedEvaluations({
      workspaceId: "1",
      contactId: "contact-1",
      tagId: "tag-1",
    })

    expect(mocks.adsConversionQueueAdd).not.toHaveBeenCalled()
  })

  test("enqueueTagAppliedEvaluations swallows a queue enqueue failure", async () => {
    mocks.adsConversionQueueAdd.mockRejectedValueOnce(new Error("redis down"))

    await expect(
      adsConversionService.enqueueTagAppliedEvaluations({
        workspaceId: "1",
        contactId: "contact-1",
        tagId: "tag-1",
      }),
    ).resolves.toBeUndefined()
  })

  test("enqueueTagAppliedEvaluationForInbox resolves the integration then enqueues for that one inbox", async () => {
    await adsConversionService.enqueueTagAppliedEvaluationForInbox({
      workspaceId: "1",
      channel: "whatsapp",
      inboxId: "inbox-1",
      contactInboxId: "101",
      tagId: "tag-1",
    })

    expect(mocks.findWorkspaceIntegrationByInboxId).toHaveBeenCalledWith({
      workspaceId: "1",
      inboxId: "inbox-1",
    })
    expect(mocks.adsConversionQueueAdd).toHaveBeenCalledTimes(1)
    expect(mocks.adsConversionQueueAdd).toHaveBeenCalledWith(
      {
        type: "evaluateConversionTrigger",
        data: {
          workspaceId: "1",
          channel: "whatsapp",
          integrationId: "201",
          contactInboxId: "101",
          occurrence: { type: "tagApplied", tagId: "tag-1" },
        },
      },
      { jobId: "ads-conversion-evaluate-tag-101-tag-1-20260810" },
    )
  })

  test("enqueueTagAppliedEvaluationForInbox resolves a messenger inbox via the messenger resolver", async () => {
    await adsConversionService.enqueueTagAppliedEvaluationForInbox({
      workspaceId: "1",
      channel: "messenger",
      inboxId: "inbox-2",
      contactInboxId: "102",
      tagId: "tag-1",
    })

    expect(mocks.findMessengerIntegrationByInboxId).toHaveBeenCalledWith({
      workspaceId: "1",
      inboxId: "inbox-2",
    })
    expect(mocks.findWorkspaceIntegrationByInboxId).not.toHaveBeenCalled()
    expect(mocks.adsConversionQueueAdd).toHaveBeenCalledWith(
      {
        type: "evaluateConversionTrigger",
        data: {
          workspaceId: "1",
          channel: "messenger",
          integrationId: "211",
          contactInboxId: "102",
          occurrence: { type: "tagApplied", tagId: "tag-1" },
        },
      },
      { jobId: "ads-conversion-evaluate-tag-102-tag-1-20260810" },
    )
  })

  test("enqueueTagAppliedEvaluationForInbox is a no-op when the inbox has no WhatsApp integration", async () => {
    mocks.findWorkspaceIntegrationByInboxId.mockResolvedValue(null)

    await adsConversionService.enqueueTagAppliedEvaluationForInbox({
      workspaceId: "1",
      channel: "whatsapp",
      inboxId: "inbox-1",
      contactInboxId: "101",
      tagId: "tag-1",
    })

    expect(mocks.adsConversionQueueAdd).not.toHaveBeenCalled()
  })

  test("enqueueTagAppliedEvaluationForInbox is a no-op for a non-ads-eligible channel (e.g. telegram)", async () => {
    await adsConversionService.enqueueTagAppliedEvaluationForInbox({
      workspaceId: "1",
      channel: "telegram" as never,
      inboxId: "inbox-1",
      contactInboxId: "101",
      tagId: "tag-1",
    })

    expect(mocks.findWorkspaceIntegrationByInboxId).not.toHaveBeenCalled()
    expect(mocks.findMessengerIntegrationByInboxId).not.toHaveBeenCalled()
    expect(mocks.findInstagramIntegrationByInboxId).not.toHaveBeenCalled()
    expect(mocks.adsConversionQueueAdd).not.toHaveBeenCalled()
  })

  test("enqueueKeywordMatchedEvaluation resolves the integration then enqueues", async () => {
    await adsConversionService.enqueueKeywordMatchedEvaluation({
      workspaceId: "1",
      channel: "whatsapp",
      inboxId: "inbox-1",
      contactInboxId: "101",
      automatedResponseId: "ar-1",
      messageId: "msg-1",
    })

    expect(mocks.findWorkspaceIntegrationByInboxId).toHaveBeenCalledWith({
      workspaceId: "1",
      inboxId: "inbox-1",
    })
    expect(mocks.adsConversionQueueAdd).toHaveBeenCalledWith(
      {
        type: "evaluateConversionTrigger",
        data: {
          workspaceId: "1",
          channel: "whatsapp",
          integrationId: "201",
          contactInboxId: "101",
          occurrence: { type: "keywordMatched", automatedResponseId: "ar-1" },
        },
      },
      { jobId: "ads-conversion-evaluate-keyword-msg-1" },
    )
  })

  test("enqueueKeywordMatchedEvaluation resolves an instagram inbox via the instagram resolver", async () => {
    await adsConversionService.enqueueKeywordMatchedEvaluation({
      workspaceId: "1",
      channel: "instagram",
      inboxId: "inbox-3",
      contactInboxId: "103",
      automatedResponseId: "ar-1",
      messageId: "msg-3",
    })

    expect(mocks.findInstagramIntegrationByInboxId).toHaveBeenCalledWith({
      workspaceId: "1",
      inboxId: "inbox-3",
    })
    expect(mocks.adsConversionQueueAdd).toHaveBeenCalledWith(
      {
        type: "evaluateConversionTrigger",
        data: {
          workspaceId: "1",
          channel: "instagram",
          integrationId: "231",
          contactInboxId: "103",
          occurrence: { type: "keywordMatched", automatedResponseId: "ar-1" },
        },
      },
      { jobId: "ads-conversion-evaluate-keyword-msg-3" },
    )
  })

  test("enqueueKeywordMatchedEvaluation is a no-op when the inbox has no WhatsApp integration", async () => {
    mocks.findWorkspaceIntegrationByInboxId.mockResolvedValue(null)

    await adsConversionService.enqueueKeywordMatchedEvaluation({
      workspaceId: "1",
      channel: "whatsapp",
      inboxId: "inbox-1",
      contactInboxId: "101",
      automatedResponseId: "ar-1",
      messageId: "msg-1",
    })

    expect(mocks.adsConversionQueueAdd).not.toHaveBeenCalled()
  })

  test("enqueueContactRepliedEvaluation enqueues using the caller-supplied channel/integrationId directly", async () => {
    await adsConversionService.enqueueContactRepliedEvaluation({
      workspaceId: "1",
      channel: "whatsapp",
      integrationId: "201",
      contactInboxId: "101",
      isFirstReply: true,
      messageId: "msg-2",
    })

    expect(mocks.findWorkspaceIntegrationByInboxId).not.toHaveBeenCalled()
    expect(mocks.adsConversionQueueAdd).toHaveBeenCalledWith(
      {
        type: "evaluateConversionTrigger",
        data: {
          workspaceId: "1",
          channel: "whatsapp",
          integrationId: "201",
          contactInboxId: "101",
          occurrence: { type: "contactReplied", isFirstReply: true },
        },
      },
      { jobId: "ads-conversion-evaluate-reply-msg-2" },
    )
  })
})

describe("AdsConversionService.enqueueTagAppliedEvaluationsBulk", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.adsConversionQueueAdd.mockResolvedValue(undefined)
    vi.useFakeTimers({ now: new Date("2026-08-10T12:34:56.000Z") })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test("zero-rules workspace short-circuits before the inbox fan-out (no DB fan-out, no enqueue)", async () => {
    mocks.listByWorkspace.mockResolvedValue([])

    await adsConversionService.enqueueTagAppliedEvaluationsBulk({
      workspaceId: "1",
      pairs: [{ contactId: "contact-1", tagId: "tag-1" }],
    })

    expect(mocks.listAdEligibleInboxesByContacts).not.toHaveBeenCalled()
    expect(mocks.adsConversionQueueAdd).not.toHaveBeenCalled()
  })

  test("a workspace with only non-tagApplied rules also short-circuits", async () => {
    mocks.listByWorkspace.mockResolvedValue([
      {
        id: "301",
        trigger: { type: "templateSent", templateIds: ["template-1"] },
        enabled: true,
      },
    ])

    await adsConversionService.enqueueTagAppliedEvaluationsBulk({
      workspaceId: "1",
      pairs: [{ contactId: "contact-1", tagId: "tag-1" }],
    })

    expect(mocks.listAdEligibleInboxesByContacts).not.toHaveBeenCalled()
    expect(mocks.adsConversionQueueAdd).not.toHaveBeenCalled()
  })

  test("gate failure fails OPEN: a rule-lookup error must never drop a conversion", async () => {
    mocks.listByWorkspace.mockRejectedValue(new Error("redis/db down"))
    mocks.listAdEligibleInboxesByContacts.mockResolvedValue([
      {
        contactId: "contact-1",
        contactInboxId: "101",
        integrationId: "201",
        channel: "whatsapp",
      },
    ])

    await adsConversionService.enqueueTagAppliedEvaluationsBulk({
      workspaceId: "1",
      pairs: [{ contactId: "contact-1", tagId: "tag-1" }],
    })

    expect(mocks.listAdEligibleInboxesByContacts).toHaveBeenCalledTimes(1)
    expect(mocks.adsConversionQueueAdd).toHaveBeenCalledTimes(1)
  })

  test("resolves every contact's inboxes in one batch query and enqueues per inbox x tag", async () => {
    mocks.listByWorkspace.mockResolvedValue([
      {
        id: "301",
        trigger: { type: "tagApplied", tagIds: [] },
        enabled: true,
      },
    ])
    mocks.listAdEligibleInboxesByContacts.mockResolvedValue([
      {
        contactId: "contact-1",
        contactInboxId: "101",
        integrationId: "201",
        channel: "whatsapp",
      },
      {
        contactId: "contact-2",
        contactInboxId: "102",
        integrationId: "202",
        channel: "whatsapp",
      },
    ])

    await adsConversionService.enqueueTagAppliedEvaluationsBulk({
      workspaceId: "1",
      pairs: [
        { contactId: "contact-1", tagId: "tag-1" },
        { contactId: "contact-2", tagId: "tag-2" },
      ],
    })

    expect(mocks.listAdEligibleInboxesByContacts).toHaveBeenCalledTimes(1)
    expect(mocks.listAdEligibleInboxesByContacts).toHaveBeenCalledWith({
      workspaceId: "1",
      contactIds: ["contact-1", "contact-2"],
    })
    expect(mocks.adsConversionQueueAdd).toHaveBeenCalledTimes(2)
    expect(mocks.adsConversionQueueAdd).toHaveBeenCalledWith(
      {
        type: "evaluateConversionTrigger",
        data: {
          workspaceId: "1",
          channel: "whatsapp",
          integrationId: "201",
          contactInboxId: "101",
          occurrence: { type: "tagApplied", tagId: "tag-1" },
        },
      },
      { jobId: "ads-conversion-evaluate-tag-101-tag-1-20260810" },
    )
    expect(mocks.adsConversionQueueAdd).toHaveBeenCalledWith(
      {
        type: "evaluateConversionTrigger",
        data: {
          workspaceId: "1",
          channel: "whatsapp",
          integrationId: "202",
          contactInboxId: "102",
          occurrence: { type: "tagApplied", tagId: "tag-2" },
        },
      },
      { jobId: "ads-conversion-evaluate-tag-102-tag-2-20260810" },
    )
  })

  test("resolves a mix of whatsapp and messenger inboxes for the same batch", async () => {
    mocks.listAdEligibleInboxesByContacts.mockResolvedValue([
      {
        contactId: "contact-1",
        contactInboxId: "101",
        integrationId: "201",
        channel: "whatsapp",
      },
      {
        contactId: "contact-1",
        contactInboxId: "104",
        integrationId: "211",
        channel: "messenger",
      },
    ])

    await adsConversionService.enqueueTagAppliedEvaluationsBulk({
      workspaceId: "1",
      pairs: [{ contactId: "contact-1", tagId: "tag-1" }],
    })

    expect(mocks.adsConversionQueueAdd).toHaveBeenCalledTimes(2)
    expect(mocks.adsConversionQueueAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          channel: "whatsapp",
          integrationId: "201",
          contactInboxId: "101",
        }),
      }),
      expect.anything(),
    )
    expect(mocks.adsConversionQueueAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          channel: "messenger",
          integrationId: "211",
          contactInboxId: "104",
        }),
      }),
      expect.anything(),
    )
  })

  test("deduplicates contactIds into a single batch query lookup key list", async () => {
    mocks.listAdEligibleInboxesByContacts.mockResolvedValue([
      {
        contactId: "contact-1",
        contactInboxId: "101",
        integrationId: "201",
        channel: "whatsapp",
      },
    ])

    await adsConversionService.enqueueTagAppliedEvaluationsBulk({
      workspaceId: "1",
      pairs: [
        { contactId: "contact-1", tagId: "tag-1" },
        { contactId: "contact-1", tagId: "tag-2" },
      ],
    })

    expect(mocks.listAdEligibleInboxesByContacts).toHaveBeenCalledWith({
      workspaceId: "1",
      contactIds: ["contact-1"],
    })
    expect(mocks.adsConversionQueueAdd).toHaveBeenCalledTimes(2)
  })

  test("is a no-op for empty pairs without querying", async () => {
    await adsConversionService.enqueueTagAppliedEvaluationsBulk({
      workspaceId: "1",
      pairs: [],
    })

    expect(mocks.listAdEligibleInboxesByContacts).not.toHaveBeenCalled()
    expect(mocks.adsConversionQueueAdd).not.toHaveBeenCalled()
  })

  test("produces no jobs for contacts with no ad-eligible inbox", async () => {
    mocks.listAdEligibleInboxesByContacts.mockResolvedValue([])

    await adsConversionService.enqueueTagAppliedEvaluationsBulk({
      workspaceId: "1",
      pairs: [{ contactId: "contact-non-ctwa", tagId: "tag-1" }],
    })

    expect(mocks.adsConversionQueueAdd).not.toHaveBeenCalled()
  })
})

describe("AdsConversionService.hasEnabledTriggerRule", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("returns true when an enabled rule of the requested trigger type exists", async () => {
    mocks.listByWorkspace.mockResolvedValue([
      {
        id: "301",
        trigger: { type: "contactReplied", firstReplyOnly: false },
      },
    ])

    await expect(
      adsConversionService.hasEnabledTriggerRule({
        workspaceId: "1",
        channel: "whatsapp",
        integrationId: "201",
        triggerType: "contactReplied",
      }),
    ).resolves.toBe(true)

    expect(mocks.listByWorkspace).toHaveBeenCalledWith("1", {
      channel: "whatsapp",
      enabled: true,
      integrationWhatsappId: "201",
    })
  })

  test("returns false when no enabled rule matches the trigger type", async () => {
    mocks.listByWorkspace.mockResolvedValue([
      { id: "301", trigger: { type: "tagApplied", tagIds: ["tag-1"] } },
    ])

    await expect(
      adsConversionService.hasEnabledTriggerRule({
        workspaceId: "1",
        channel: "whatsapp",
        integrationId: "201",
        triggerType: "contactReplied",
      }),
    ).resolves.toBe(false)
  })

  test("returns false when the workspace has no rules at all", async () => {
    mocks.listByWorkspace.mockResolvedValue([])

    await expect(
      adsConversionService.hasEnabledTriggerRule({
        workspaceId: "1",
        channel: "whatsapp",
        integrationId: "201",
        triggerType: "contactReplied",
      }),
    ).resolves.toBe(false)
  })
})

describe("AdsConversionService cache invalidation on rule mutation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.create.mockResolvedValue({ id: "301", workspaceId: "1" })
    mocks.update.mockResolvedValue({ id: "301", workspaceId: "1" })
    mocks.delete.mockResolvedValue({ id: "301", workspaceId: "1" })
    mocks.findWorkspaceWhatsappIntegration.mockResolvedValue({
      id: "201",
      workspaceId: "1",
    })
    mocks.findWorkspaceRule.mockResolvedValue({
      id: "301",
      workspaceId: "1",
      channel: "whatsapp",
      integrationWhatsappId: "201",
      integrationFacebookAdsId: null,
      trigger: { type: "templateSent", templateIds: ["template-1"] },
    })
  })

  test("create invalidates the workspace's has-trigger-rule cache tag", async () => {
    await adsConversionService.create(validWhatsappInput)

    expect(mocks.invalidateCacheByTags).toHaveBeenCalledWith([
      "ads-conversion:has-trigger-rule:1",
    ])
  })

  test("update invalidates the workspace's has-trigger-rule cache tag", async () => {
    await adsConversionService.update({
      id: "301",
      workspaceId: "1",
      trigger: { type: "templateSent", templateIds: ["template-2"] },
    })

    expect(mocks.invalidateCacheByTags).toHaveBeenCalledWith([
      "ads-conversion:has-trigger-rule:1",
    ])
  })

  test("toggleEnabled invalidates the workspace's has-trigger-rule cache tag", async () => {
    await adsConversionService.toggleEnabled({
      id: "301",
      workspaceId: "1",
      enabled: false,
    })

    expect(mocks.invalidateCacheByTags).toHaveBeenCalledWith([
      "ads-conversion:has-trigger-rule:1",
    ])
  })

  test("remove invalidates the workspace's has-trigger-rule cache tag", async () => {
    await adsConversionService.remove({ id: "301", workspaceId: "1" })

    expect(mocks.invalidateCacheByTags).toHaveBeenCalledWith([
      "ads-conversion:has-trigger-rule:1",
    ])
  })
})

describe("AdsConversionService.isEligibleChannel", () => {
  test("returns true for whatsapp/messenger/instagram, false for other channels (Phase 3 flip)", () => {
    expect(adsConversionService.isEligibleChannel("whatsapp")).toBe(true)
    expect(adsConversionService.isEligibleChannel("messenger")).toBe(true)
    expect(adsConversionService.isEligibleChannel("instagram")).toBe(true)
    expect(adsConversionService.isEligibleChannel("facebook")).toBe(false)
    expect(adsConversionService.isEligibleChannel("telegram")).toBe(false)
    expect(adsConversionService.isEligibleChannel(null)).toBe(false)
    expect(adsConversionService.isEligibleChannel(undefined)).toBe(false)
  })
})

describe("AdsConversionService.evaluateConversionTrigger — messenger/instagram ad-referral attribution", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.insertIgnoreDuplicate.mockImplementation(async (values: unknown) => ({
      id: "event-1",
      capiStatus: "pending",
      createdAt: new Date("2026-08-10T00:00:00.000Z"),
      updatedAt: new Date("2026-08-10T00:00:00.000Z"),
      ...values,
    }))
    mocks.findBySourceEventId.mockResolvedValue(null)
    mocks.adsConversionQueueAdd.mockResolvedValue(undefined)
    vi.useFakeTimers({ now: new Date("2026-08-10T12:34:56.000Z") })
  })

  const messengerTagOccurrenceInput = {
    workspaceId: "1",
    channel: "messenger" as const,
    integrationId: "211",
    contactInboxId: "101",
    occurrence: { type: "tagApplied" as const, tagId: "tag-1" },
  }

  test("messenger: attributed contact matches a tagApplied rule, inserts the event, and enqueues CAPI send", async () => {
    mocks.findAttributionByAdReferral.mockResolvedValue({
      id: "101",
      referral: { adId: "ad-1", source: "ADS" },
    })
    mocks.listByWorkspace.mockResolvedValue([
      {
        id: "308",
        workspaceId: "1",
        channel: "messenger",
        integrationMessengerId: "211",
        eventType: "lead",
        trigger: { type: "tagApplied", tagIds: ["tag-1"] },
        enabled: true,
      },
    ])

    await expect(
      adsConversionService.evaluateConversionTrigger(
        messengerTagOccurrenceInput,
      ),
    ).resolves.toHaveLength(1)

    expect(mocks.findAttributionByAdReferral).toHaveBeenCalledWith(
      {
        workspaceId: "1",
        channel: "messenger",
        integrationMessengerId: "211",
        integrationInstagramId: undefined,
        contactInboxId: "101",
      },
      undefined,
    )
    expect(mocks.listByWorkspace).toHaveBeenCalledWith(
      "1",
      {
        channel: "messenger",
        enabled: true,
        integrationMessengerId: "211",
        integrationInstagramId: undefined,
      },
      undefined,
    )
    expect(mocks.insertIgnoreDuplicate).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "1",
        channel: "messenger",
        integrationMessengerId: "211",
        source: "rule",
        eventType: "lead",
        adId: "ad-1",
        contactInboxId: "101",
      }),
      undefined,
    )
    expect(mocks.adsConversionQueueAdd).toHaveBeenCalledWith(
      {
        type: "sendConversionEvent",
        data: { adsConversionEventId: "event-1", workspaceId: "1" },
      },
      { jobId: "ads-conversion-send-event-1" },
    )
  })

  test("messenger: non-attributed contact (no ad-referral) → no event, rules never loaded", async () => {
    mocks.findAttributionByAdReferral.mockResolvedValue(null)

    await expect(
      adsConversionService.evaluateConversionTrigger(
        messengerTagOccurrenceInput,
      ),
    ).resolves.toEqual([])

    expect(mocks.listByWorkspace).not.toHaveBeenCalled()
    expect(mocks.insertIgnoreDuplicate).not.toHaveBeenCalled()
  })

  test("messenger: SHORTLINK (ig.me-style) referral never attributes — repository predicate excludes source !== 'ADS', service sees null", async () => {
    // The `referral->>'source' = 'ADS'` predicate lives in the repository
    // query itself (findAttributionByAdReferral) — from the service's
    // perspective a SHORTLINK-referral contact is indistinguishable from a
    // contact with no referral at all: both resolve null.
    mocks.findAttributionByAdReferral.mockResolvedValue(null)

    await expect(
      adsConversionService.evaluateConversionTrigger(
        messengerTagOccurrenceInput,
      ),
    ).resolves.toEqual([])

    expect(mocks.insertIgnoreDuplicate).not.toHaveBeenCalled()
  })

  test("instagram: attributed contact matches a keywordMatched rule and inserts an event", async () => {
    mocks.findAttributionByAdReferral.mockResolvedValue({
      id: "102",
      referral: { adId: "ad-2", source: "ADS" },
    })
    mocks.listByWorkspace.mockResolvedValue([
      {
        id: "310",
        workspaceId: "1",
        channel: "instagram",
        integrationInstagramId: "221",
        eventType: "lead",
        trigger: { type: "keywordMatched", automatedResponseIds: ["ar-1"] },
        enabled: true,
      },
    ])

    await expect(
      adsConversionService.evaluateConversionTrigger({
        workspaceId: "1",
        channel: "instagram",
        integrationId: "221",
        contactInboxId: "102",
        occurrence: { type: "keywordMatched", automatedResponseId: "ar-1" },
      }),
    ).resolves.toHaveLength(1)

    expect(mocks.insertIgnoreDuplicate).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "instagram",
        integrationInstagramId: "221",
        adId: "ad-2",
        contactInboxId: "102",
      }),
      undefined,
    )
  })

  test("instagram: non-attributed contact → no event", async () => {
    mocks.findAttributionByAdReferral.mockResolvedValue(null)

    await expect(
      adsConversionService.evaluateConversionTrigger({
        workspaceId: "1",
        channel: "instagram",
        integrationId: "221",
        contactInboxId: "102",
        occurrence: { type: "keywordMatched", automatedResponseId: "ar-1" },
      }),
    ).resolves.toEqual([])

    expect(mocks.insertIgnoreDuplicate).not.toHaveBeenCalled()
  })

  test("facebook channel is a permanent no-op — dead channel, no AdsConversionEvent rows ever created for it", async () => {
    await expect(
      adsConversionService.evaluateConversionTrigger({
        workspaceId: "1",
        channel: "facebook",
        integrationId: "241",
        contactInboxId: "101",
        occurrence: { type: "tagApplied", tagId: "tag-1" },
      }),
    ).resolves.toEqual([])

    expect(mocks.findAttributionByContactInbox).not.toHaveBeenCalled()
    expect(mocks.findAttributionByAdReferral).not.toHaveBeenCalled()
  })
})

describe("AdsConversionService.evaluateTemplateSent — messenger/instagram (Amendment A1)", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.insertIgnoreDuplicate.mockImplementation(async (values: unknown) => ({
      id: "event-1",
      capiStatus: "pending",
      createdAt: new Date("2026-08-10T00:00:00.000Z"),
      updatedAt: new Date("2026-08-10T00:00:00.000Z"),
      ...values,
    }))
    mocks.adsConversionQueueAdd.mockResolvedValue(undefined)
    vi.useFakeTimers({ now: new Date("2026-08-10T12:34:56.000Z") })
  })

  test("messenger: attributed contact + matching template rule inserts an event and enqueues CAPI send", async () => {
    mocks.findAttributionByAdReferral.mockResolvedValue({
      id: "101",
      referral: { adId: "ad-1", source: "ADS" },
    })
    mocks.listByWorkspace.mockResolvedValue([
      {
        id: "303",
        workspaceId: "1",
        channel: "messenger",
        integrationMessengerId: "211",
        eventType: "lead",
        trigger: { type: "templateSent", templateIds: ["mt-1"] },
        enabled: true,
      },
    ])

    await expect(
      adsConversionService.evaluateTemplateSent({
        workspaceId: "1",
        channel: "messenger",
        integrationId: "211",
        contactInboxId: "101",
        templateId: "mt-1",
      }),
    ).resolves.toHaveLength(1)

    expect(mocks.findAttributionByAdReferral).toHaveBeenCalledWith(
      {
        workspaceId: "1",
        channel: "messenger",
        integrationMessengerId: "211",
        contactInboxId: "101",
      },
      undefined,
    )
    expect(mocks.insertIgnoreDuplicate).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "1",
        channel: "messenger",
        integrationMessengerId: "211",
        source: "rule",
        eventType: "lead",
        adId: "ad-1",
        contactInboxId: "101",
      }),
      undefined,
    )
    expect(mocks.adsConversionQueueAdd).toHaveBeenCalledWith(
      {
        type: "sendConversionEvent",
        data: { adsConversionEventId: "event-1", workspaceId: "1" },
      },
      { jobId: "ads-conversion-send-event-1" },
    )
  })

  test("messenger: SHORTLINK-referral contact (non-attributed) → no event, rules never loaded", async () => {
    mocks.findAttributionByAdReferral.mockResolvedValue(null)

    await expect(
      adsConversionService.evaluateTemplateSent({
        workspaceId: "1",
        channel: "messenger",
        integrationId: "211",
        contactInboxId: "101",
        templateId: "mt-1",
      }),
    ).resolves.toEqual([])

    expect(mocks.listByWorkspace).not.toHaveBeenCalled()
    expect(mocks.insertIgnoreDuplicate).not.toHaveBeenCalled()
  })

  test("messenger: a rule with a cloned-template id on the wrong integration never matches", async () => {
    mocks.findAttributionByAdReferral.mockResolvedValue({
      id: "101",
      referral: { adId: "ad-1", source: "ADS" },
    })
    mocks.listByWorkspace.mockResolvedValue([
      {
        id: "303",
        workspaceId: "1",
        channel: "messenger",
        integrationMessengerId: "211",
        eventType: "lead",
        trigger: {
          type: "templateSent",
          templateIds: ["mt-owned-by-integration-a"],
        },
        enabled: true,
      },
    ])

    await adsConversionService.evaluateTemplateSent({
      workspaceId: "1",
      channel: "messenger",
      integrationId: "211",
      contactInboxId: "101",
      templateId: "mt-cloned-on-integration-b",
    })

    expect(mocks.insertIgnoreDuplicate).not.toHaveBeenCalled()
  })

  test("instagram: templateSent is rejected — no template entity/step exists for Instagram", async () => {
    await expect(
      adsConversionService.evaluateTemplateSent({
        workspaceId: "1",
        channel: "instagram",
        integrationId: "221",
        contactInboxId: "101",
        templateId: "mt-1",
      }),
    ).rejects.toThrow(NOT_SUPPORTED_FOR_INSTAGRAM)

    expect(mocks.findAttributionByContactInbox).not.toHaveBeenCalled()
    expect(mocks.findAttributionByAdReferral).not.toHaveBeenCalled()
  })

  test("facebook: templateSent is rejected (dead channel)", async () => {
    await expect(
      adsConversionService.evaluateTemplateSent({
        workspaceId: "1",
        channel: "facebook",
        integrationId: "241",
        contactInboxId: "101",
        templateId: "mt-1",
      }),
    ).rejects.toThrow(NOT_SUPPORTED_FOR_FACEBOOK)
  })

  test("whatsapp regression: unchanged ctwaClid-gated behavior still works after the channel dispatch was added", async () => {
    mocks.findAttributionByContactInbox.mockResolvedValue({
      id: "101",
      referral: { adId: "ad-1", ctwaClid: "clid-1" },
      wabaId: "waba-1",
    })
    mocks.listByWorkspace.mockResolvedValue([
      {
        id: "304",
        workspaceId: "1",
        channel: "whatsapp",
        integrationWhatsappId: "201",
        eventType: "lead",
        trigger: { type: "templateSent", templateIds: ["template-1"] },
        enabled: true,
      },
    ])

    await expect(
      adsConversionService.evaluateTemplateSent({
        workspaceId: "1",
        channel: "whatsapp",
        integrationId: "201",
        contactInboxId: "101",
        templateId: "template-1",
      }),
    ).resolves.toHaveLength(1)

    expect(mocks.findAttributionByAdReferral).not.toHaveBeenCalled()
    expect(mocks.insertIgnoreDuplicate).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "whatsapp",
        integrationWhatsappId: "201",
        wabaId: "waba-1",
        ctwaClid: "clid-1",
      }),
      undefined,
    )
  })
})

describe("channel validators (channelConsistencyValidators / channelOwnershipValidators) × 4 channels", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.create.mockImplementation(async (values: unknown) => ({
      id: "301",
      createdAt: new Date("2026-08-10T00:00:00.000Z"),
      updatedAt: new Date("2026-08-10T00:00:00.000Z"),
      ...values,
    }))
    mocks.invalidateCacheByTags.mockResolvedValue(undefined)
    mocks.findWorkspaceWhatsappIntegration.mockResolvedValue({
      id: "201",
      workspaceId: "1",
    })
    mocks.findWorkspaceFacebookAdsIntegration.mockResolvedValue({
      id: "241",
      workspaceId: "1",
    })
    mocks.findWorkspaceMessengerIntegration.mockResolvedValue({
      id: "211",
      workspaceId: "1",
    })
    mocks.findWorkspaceInstagramIntegration.mockResolvedValue({
      id: "221",
      workspaceId: "1",
    })
  })

  test("whatsapp: accepts integrationWhatsappId-only", async () => {
    await expect(
      adsConversionService.create({
        workspaceId: "1",
        channel: "whatsapp",
        integrationWhatsappId: "201",
        eventType: "lead",
        trigger: { type: "tagApplied", tagIds: ["tag-1"] },
      }),
    ).resolves.toMatchObject({ channel: "whatsapp" })
  })

  test("facebook: accepts integrationFacebookAdsId-only", async () => {
    await expect(
      adsConversionService.create({
        workspaceId: "1",
        channel: "facebook",
        integrationFacebookAdsId: "241",
        eventType: "lead",
        trigger: { type: "tagApplied", tagIds: ["tag-1"] },
      }),
    ).resolves.toMatchObject({ channel: "facebook" })
  })

  test("messenger: accepts integrationMessengerId-only and checks workspace ownership", async () => {
    await expect(
      adsConversionService.create({
        workspaceId: "1",
        channel: "messenger",
        integrationMessengerId: "211",
        eventType: "lead",
        trigger: { type: "tagApplied", tagIds: ["tag-1"] },
      }),
    ).resolves.toMatchObject({ channel: "messenger" })

    expect(mocks.findWorkspaceMessengerIntegration).toHaveBeenCalledWith(
      { id: "211", workspaceId: "1" },
      undefined,
    )
  })

  test("messenger: rejects when integrationMessengerId is missing", async () => {
    await expect(
      adsConversionService.create({
        workspaceId: "1",
        channel: "messenger",
        eventType: "lead",
        trigger: { type: "tagApplied", tagIds: ["tag-1"] },
      }),
    ).rejects.toThrow("integration must match")

    expect(mocks.create).not.toHaveBeenCalled()
  })

  test("messenger: rejects when integrationMessengerId isn't found in the workspace", async () => {
    mocks.findWorkspaceMessengerIntegration.mockResolvedValue(null)

    await expect(
      adsConversionService.create({
        workspaceId: "1",
        channel: "messenger",
        integrationMessengerId: "999",
        eventType: "lead",
        trigger: { type: "tagApplied", tagIds: ["tag-1"] },
      }),
    ).rejects.toThrow("integration was not found in this workspace")
  })

  test("instagram: accepts integrationInstagramId-only and checks workspace ownership", async () => {
    await expect(
      adsConversionService.create({
        workspaceId: "1",
        channel: "instagram",
        integrationInstagramId: "221",
        eventType: "lead",
        trigger: { type: "tagApplied", tagIds: ["tag-1"] },
      }),
    ).resolves.toMatchObject({ channel: "instagram" })

    expect(mocks.findWorkspaceInstagramIntegration).toHaveBeenCalledWith(
      { id: "221", workspaceId: "1" },
      undefined,
    )
  })

  test("instagram: rejects when integrationInstagramId isn't found in the workspace", async () => {
    mocks.findWorkspaceInstagramIntegration.mockResolvedValue(null)

    await expect(
      adsConversionService.create({
        workspaceId: "1",
        channel: "instagram",
        integrationInstagramId: "999",
        eventType: "lead",
        trigger: { type: "tagApplied", tagIds: ["tag-1"] },
      }),
    ).rejects.toThrow("integration was not found in this workspace")
  })

  test("cross-channel FK leakage is rejected (messenger channel with a whatsapp FK also set)", async () => {
    await expect(
      adsConversionService.create({
        workspaceId: "1",
        channel: "messenger",
        integrationMessengerId: "211",
        integrationWhatsappId: "201",
        eventType: "lead",
        trigger: { type: "tagApplied", tagIds: ["tag-1"] },
      }),
    ).rejects.toThrow("integration must match")

    expect(mocks.create).not.toHaveBeenCalled()
  })
})

describe("assertSupportedTrigger channel × trigger-type allowlist", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.create.mockImplementation(async (values: unknown) => ({
      id: "301",
      createdAt: new Date("2026-08-10T00:00:00.000Z"),
      updatedAt: new Date("2026-08-10T00:00:00.000Z"),
      ...values,
    }))
    mocks.invalidateCacheByTags.mockResolvedValue(undefined)
    mocks.findWorkspaceWhatsappIntegration.mockResolvedValue({
      id: "201",
      workspaceId: "1",
    })
    mocks.findWorkspaceMessengerIntegration.mockResolvedValue({
      id: "211",
      workspaceId: "1",
    })
    mocks.findWorkspaceInstagramIntegration.mockResolvedValue({
      id: "221",
      workspaceId: "1",
    })
  })

  test("whatsapp accepts templateSent", async () => {
    await expect(
      adsConversionService.create({
        workspaceId: "1",
        channel: "whatsapp",
        integrationWhatsappId: "201",
        eventType: "lead",
        trigger: { type: "templateSent", templateIds: ["t-1"] },
      }),
    ).resolves.toMatchObject({ channel: "whatsapp" })
  })

  test("messenger accepts templateSent (Amendment A1)", async () => {
    await expect(
      adsConversionService.create({
        workspaceId: "1",
        channel: "messenger",
        integrationMessengerId: "211",
        eventType: "lead",
        trigger: { type: "templateSent", templateIds: ["mt-1"] },
      }),
    ).resolves.toMatchObject({ channel: "messenger" })
  })

  test("instagram rejects templateSent — no template entity exists for IG", async () => {
    await expect(
      adsConversionService.create({
        workspaceId: "1",
        channel: "instagram",
        integrationInstagramId: "221",
        eventType: "lead",
        trigger: { type: "templateSent", templateIds: ["t-1"] },
      }),
    ).rejects.toThrow(NOT_SUPPORTED_FOR_INSTAGRAM)

    expect(mocks.create).not.toHaveBeenCalled()
  })

  test("instagram accepts tagApplied/keywordMatched/contactReplied", async () => {
    await expect(
      adsConversionService.create({
        workspaceId: "1",
        channel: "instagram",
        integrationInstagramId: "221",
        eventType: "lead",
        trigger: { type: "tagApplied", tagIds: ["tag-1"] },
      }),
    ).resolves.toMatchObject({ channel: "instagram" })

    await expect(
      adsConversionService.create({
        workspaceId: "1",
        channel: "instagram",
        integrationInstagramId: "221",
        eventType: "lead",
        trigger: {
          type: "keywordMatched",
          automatedResponseIds: ["ar-1"],
        },
      }),
    ).resolves.toMatchObject({ channel: "instagram" })

    await expect(
      adsConversionService.create({
        workspaceId: "1",
        channel: "instagram",
        integrationInstagramId: "221",
        eventType: "lead",
        trigger: { type: "contactReplied", firstReplyOnly: true },
      }),
    ).resolves.toMatchObject({ channel: "instagram" })
  })

  test("update: instagram rejects switching a rule's trigger to templateSent", async () => {
    mocks.findWorkspaceRule.mockResolvedValue({
      id: "301",
      workspaceId: "1",
      channel: "instagram",
      integrationInstagramId: "221",
      trigger: { type: "tagApplied", tagIds: ["tag-1"] },
    })

    await expect(
      adsConversionService.update({
        id: "301",
        workspaceId: "1",
        trigger: { type: "templateSent", templateIds: ["t-1"] },
      }),
    ).rejects.toThrow(NOT_SUPPORTED_FOR_INSTAGRAM)
  })
})
