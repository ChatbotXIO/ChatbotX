import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  delete: vi.fn(),
  adsConversionQueueAdd: vi.fn(),
  findAttributionByContactInbox: vi.fn(),
  findAttributionByCtwaClid: vi.fn(),
  findBySourceEventId: vi.fn(),
  findWorkspaceRule: vi.fn(),
  findWorkspaceFacebookAdsIntegration: vi.fn(),
  findWorkspaceWhatsappIntegration: vi.fn(),
  findWorkspaceIntegrationByInboxId: vi.fn(),
  listWhatsappCtwaInboxesByContact: vi.fn(),
  listWhatsappCtwaInboxesByContacts: vi.fn(),
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
  },
  integrationFacebookAdsRepository: {
    findWorkspaceIntegration: mocks.findWorkspaceFacebookAdsIntegration,
  },
  integrationWhatsappRepository: {
    findByIdForWorkspace: mocks.findWorkspaceWhatsappIntegration,
    findWorkspaceIntegrationByInboxId: mocks.findWorkspaceIntegrationByInboxId,
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

const validWhatsappInput = {
  workspaceId: "ws-1",
  channel: "whatsapp" as const,
  integrationWhatsappId: "iw-1",
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
      id: "rule-1",
      createdAt: new Date("2026-08-10T00:00:00.000Z"),
      updatedAt: new Date("2026-08-10T00:00:00.000Z"),
      ...values,
    }))
    mocks.update.mockImplementation(async (input: { values: unknown }) => ({
      id: "rule-1",
      workspaceId: "ws-1",
      channel: "whatsapp",
      integrationWhatsappId: "iw-1",
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
    mocks.delete.mockResolvedValue({ id: "rule-1" })
    mocks.findWorkspaceRule.mockResolvedValue({
      id: "rule-1",
      workspaceId: "ws-1",
      channel: "whatsapp",
      integrationWhatsappId: "iw-1",
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
      id: "iw-1",
      workspaceId: "ws-1",
    })
    mocks.findWorkspaceFacebookAdsIntegration.mockResolvedValue({
      id: "ifa-1",
      workspaceId: "ws-1",
    })
    mocks.findAttributionByCtwaClid.mockResolvedValue({
      id: "ci-1",
      referral: { adId: "ad-1", ctwaClid: "clid-1" },
      wabaId: "waba-1",
    })
    mocks.findAttributionByContactInbox.mockResolvedValue({
      id: "ci-1",
      referral: { adId: "ad-1", ctwaClid: "clid-1" },
      wabaId: "waba-1",
    })
    mocks.listByWorkspace.mockResolvedValue([
      {
        id: "rule-1",
        workspaceId: "ws-1",
        channel: "whatsapp",
        integrationWhatsappId: "iw-1",
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
      id: "iw-1",
      wabaId: "waba-1",
    })
    mocks.listWhatsappCtwaInboxesByContact.mockResolvedValue([
      { contactInboxId: "ci-1", integrationWhatsappId: "iw-1" },
    ])
  })

  test("evaluateTemplateSent skips rule loading when contact has no CTWA attribution", async () => {
    mocks.findAttributionByContactInbox.mockResolvedValue(null)

    await expect(
      adsConversionService.evaluateTemplateSent({
        workspaceId: "ws-1",
        integrationWhatsappId: "iw-1",
        contactInboxId: "ci-1",
        templateId: "template-1",
      }),
    ).resolves.toEqual([])

    expect(mocks.findAttributionByContactInbox).toHaveBeenCalledWith(
      {
        workspaceId: "ws-1",
        integrationWhatsappId: "iw-1",
        contactInboxId: "ci-1",
      },
      undefined,
    )
    expect(mocks.listByWorkspace).not.toHaveBeenCalled()
    expect(mocks.insertIgnoreDuplicate).not.toHaveBeenCalled()
  })

  test("evaluateTemplateSent inserts matching rule event and enqueues CAPI send", async () => {
    await expect(
      adsConversionService.evaluateTemplateSent({
        workspaceId: "ws-1",
        integrationWhatsappId: "iw-1",
        contactInboxId: "ci-1",
        templateId: "template-1",
      }),
    ).resolves.toHaveLength(1)

    expect(mocks.listByWorkspace).toHaveBeenCalledWith(
      "ws-1",
      {
        channel: "whatsapp",
        enabled: true,
        integrationWhatsappId: "iw-1",
      },
      undefined,
    )
    expect(mocks.insertIgnoreDuplicate).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        integrationWhatsappId: "iw-1",
        wabaId: "waba-1",
        source: "rule",
        eventType: "lead",
        ctwaClid: "clid-1",
        adId: "ad-1",
        contactInboxId: "ci-1",
        currency: null,
        value: null,
        sourceEventId: "rule-rule-1-inbox-ci-1-20260810",
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
          workspaceId: "ws-1",
        },
      },
      { jobId: "ads-conversion-send-event-1" },
    )
    expect(mocks.adsConversionQueueAdd.mock.calls[0][1].jobId).not.toContain(
      ":",
    )
  })

  test("evaluateTemplateSent inserts purchase rule events without value", async () => {
    mocks.listByWorkspace.mockResolvedValue([
      {
        id: "rule-purchase",
        workspaceId: "ws-1",
        channel: "whatsapp",
        integrationWhatsappId: "iw-1",
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
        workspaceId: "ws-1",
        integrationWhatsappId: "iw-1",
        contactInboxId: "ci-1",
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
        sourceEventId: "rule-rule-purchase-inbox-ci-1-20260810",
      }),
      undefined,
    )
  })

  test("evaluateTemplateSent ignores non-matching template ids", async () => {
    await adsConversionService.evaluateTemplateSent({
      workspaceId: "ws-1",
      integrationWhatsappId: "iw-1",
      contactInboxId: "ci-1",
      templateId: "template-2",
    })

    expect(mocks.insertIgnoreDuplicate).not.toHaveBeenCalled()
    expect(mocks.adsConversionQueueAdd).not.toHaveBeenCalled()
  })

  test("evaluateTemplateSent does not match disabled rules because repository filters enabled rules", async () => {
    mocks.listByWorkspace.mockResolvedValue([])

    await adsConversionService.evaluateTemplateSent({
      workspaceId: "ws-1",
      integrationWhatsappId: "iw-1",
      contactInboxId: "ci-1",
      templateId: "template-1",
    })

    expect(mocks.listByWorkspace).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({ enabled: true }),
      undefined,
    )
    expect(mocks.insertIgnoreDuplicate).not.toHaveBeenCalled()
  })

  test("evaluateTemplateSent skips CAPI enqueue when event insert is deduped", async () => {
    mocks.insertIgnoreDuplicate.mockResolvedValue(null)

    await expect(
      adsConversionService.evaluateTemplateSent({
        workspaceId: "ws-1",
        integrationWhatsappId: "iw-1",
        contactInboxId: "ci-1",
        templateId: "template-1",
      }),
    ).resolves.toEqual([])

    expect(mocks.insertIgnoreDuplicate).toHaveBeenCalledTimes(1)
    expect(mocks.adsConversionQueueAdd).not.toHaveBeenCalled()
  })

  test("evaluateTemplateSent leaves tagApplied rules deferred", async () => {
    mocks.listByWorkspace.mockResolvedValue([
      {
        id: "rule-tag",
        workspaceId: "ws-1",
        channel: "whatsapp",
        integrationWhatsappId: "iw-1",
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
      workspaceId: "ws-1",
      integrationWhatsappId: "iw-1",
      contactInboxId: "ci-1",
      templateId: "template-1",
    })

    expect(mocks.insertIgnoreDuplicate).not.toHaveBeenCalled()
  })

  test("rejects channel and integration FK mismatches", async () => {
    await expect(
      adsConversionService.create({
        ...validWhatsappInput,
        integrationWhatsappId: null,
        integrationFacebookAdsId: "ifa-1",
      }),
    ).rejects.toThrow("integration must match")

    await expect(
      adsConversionService.create({
        ...validWhatsappInput,
        integrationFacebookAdsId: "ifa-1",
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
        id: "rule-1",
        workspaceId: "ws-1",
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
      { id: "iw-1", workspaceId: "ws-1" },
      undefined,
    )
    expect(mocks.create).not.toHaveBeenCalled()
  })

  test("rejects update when swapping to a WhatsApp integration outside the workspace", async () => {
    mocks.findWorkspaceWhatsappIntegration.mockResolvedValue(null)

    await expect(
      adsConversionService.update({
        id: "rule-1",
        workspaceId: "ws-1",
        integrationWhatsappId: "iw-2",
      }),
    ).rejects.toThrow("integration was not found in this workspace")

    expect(mocks.findWorkspaceWhatsappIntegration).toHaveBeenCalledWith(
      { id: "iw-2", workspaceId: "ws-1" },
      undefined,
    )
    expect(mocks.update).not.toHaveBeenCalled()
  })

  test("toggles a workspace-scoped rule", async () => {
    await expect(
      adsConversionService.toggleEnabled({
        id: "rule-1",
        workspaceId: "ws-1",
        enabled: false,
      }),
    ).resolves.toMatchObject({ enabled: false })

    expect(mocks.update).toHaveBeenCalledWith(
      {
        id: "rule-1",
        workspaceId: "ws-1",
        values: { enabled: false },
      },
      undefined,
    )
  })

  test("passes workspace scoping through repository calls", async () => {
    await adsConversionService.list({
      workspaceId: "ws-1",
      channel: "whatsapp",
    })
    await adsConversionService.update({
      id: "rule-1",
      workspaceId: "ws-1",
      trigger: { type: "templateSent", templateIds: ["template-2"] },
    })
    await adsConversionService.remove({ id: "rule-1", workspaceId: "ws-1" })

    expect(mocks.listByWorkspace).toHaveBeenCalledWith(
      "ws-1",
      { channel: "whatsapp" },
      undefined,
    )
    expect(mocks.findWorkspaceRule).toHaveBeenCalledWith(
      { id: "rule-1", workspaceId: "ws-1" },
      undefined,
    )
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "rule-1",
        workspaceId: "ws-1",
      }),
      undefined,
    )
    expect(mocks.delete).toHaveBeenCalledWith(
      { id: "rule-1", workspaceId: "ws-1" },
      undefined,
    )
  })

  test("maps automatic LeadSubmitted events to lead rows with attribution", async () => {
    await expect(
      adsConversionService.ingestAutomaticEvent({
        workspaceId: "ws-1",
        integrationWhatsappId: "iw-1",
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
      contactInboxId: "ci-1",
      adId: "ad-1",
      capiStatus: "pending",
    })

    expect(mocks.findAttributionByCtwaClid).toHaveBeenCalledWith(
      {
        workspaceId: "ws-1",
        integrationWhatsappId: "iw-1",
        ctwaClid: "clid-1",
      },
      undefined,
    )
    expect(mocks.insertIgnoreDuplicate).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "automatic",
        eventType: "lead",
        sourceEventId: "wamid.lead-1",
        contactInboxId: "ci-1",
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
        workspaceId: "ws-1",
        integrationWhatsappId: "iw-1",
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
      workspaceId: "ws-1",
      integrationWhatsappId: "iw-1",
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
      id: "ci-1",
      referral: { adId: "ad-1", ctwaClid: "clid-1" },
      wabaId: "waba-1",
    })
    mocks.listByWorkspace.mockResolvedValue([
      {
        id: "rule-tag",
        workspaceId: "ws-1",
        channel: "whatsapp",
        integrationWhatsappId: "iw-1",
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
    workspaceId: "ws-1",
    integrationWhatsappId: "iw-1",
    contactInboxId: "ci-1",
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
        workspaceId: "ws-1",
        integrationWhatsappId: "iw-1",
        source: "rule",
        eventType: "lead",
        contactInboxId: "ci-1",
        sourceEventId: "rule-rule-tag-inbox-ci-1-20260810",
        capiStatus: "pending",
      }),
      undefined,
    )
    expect(mocks.adsConversionQueueAdd).toHaveBeenCalledWith(
      {
        type: "sendConversionEvent",
        data: { adsConversionEventId: "event-1", workspaceId: "ws-1" },
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
        id: "rule-keyword",
        workspaceId: "ws-1",
        channel: "whatsapp",
        integrationWhatsappId: "iw-1",
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
        workspaceId: "ws-1",
        integrationWhatsappId: "iw-1",
        contactInboxId: "ci-1",
        occurrence: { type: "keywordMatched", automatedResponseId: "ar-1" },
      }),
    ).resolves.toHaveLength(1)
  })

  test("contactReplied rule matches any reply when firstReplyOnly is false", async () => {
    mocks.listByWorkspace.mockResolvedValue([
      {
        id: "rule-reply",
        workspaceId: "ws-1",
        channel: "whatsapp",
        integrationWhatsappId: "iw-1",
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
        workspaceId: "ws-1",
        integrationWhatsappId: "iw-1",
        contactInboxId: "ci-1",
        occurrence: { type: "contactReplied", isFirstReply: false },
      }),
    ).resolves.toHaveLength(1)
  })

  test("contactReplied rule with firstReplyOnly ignores a non-first reply", async () => {
    mocks.listByWorkspace.mockResolvedValue([
      {
        id: "rule-reply-first",
        workspaceId: "ws-1",
        channel: "whatsapp",
        integrationWhatsappId: "iw-1",
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
        workspaceId: "ws-1",
        integrationWhatsappId: "iw-1",
        contactInboxId: "ci-1",
        occurrence: { type: "contactReplied", isFirstReply: false },
      }),
    ).resolves.toEqual([])

    expect(mocks.insertIgnoreDuplicate).not.toHaveBeenCalled()
  })

  test("dedupe: when insertIgnoreDuplicate is deduped and the existing event is still pending, re-enqueues the send job", async () => {
    mocks.insertIgnoreDuplicate.mockResolvedValue(null)
    mocks.findBySourceEventId.mockResolvedValue({
      id: "event-existing",
      workspaceId: "ws-1",
      capiStatus: "pending",
    })

    await expect(
      adsConversionService.evaluateConversionTrigger(tagOccurrenceInput),
    ).resolves.toEqual([])

    expect(mocks.findBySourceEventId).toHaveBeenCalledWith(
      {
        workspaceId: "ws-1",
        integrationWhatsappId: "iw-1",
        source: "rule",
        sourceEventId: "rule-rule-tag-inbox-ci-1-20260810",
      },
      undefined,
    )
    expect(mocks.adsConversionQueueAdd).toHaveBeenCalledWith(
      {
        type: "sendConversionEvent",
        data: { adsConversionEventId: "event-existing", workspaceId: "ws-1" },
      },
      { jobId: "ads-conversion-send-event-existing" },
    )
  })

  test("dedupe: does not re-enqueue when the existing deduped event already sent", async () => {
    mocks.insertIgnoreDuplicate.mockResolvedValue(null)
    mocks.findBySourceEventId.mockResolvedValue({
      id: "event-existing",
      workspaceId: "ws-1",
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
      id: "iw-1",
      wabaId: "waba-1",
    })
    mocks.listWhatsappCtwaInboxesByContacts.mockResolvedValue([
      {
        contactId: "contact-1",
        contactInboxId: "ci-1",
        integrationWhatsappId: "iw-1",
      },
      {
        contactId: "contact-1",
        contactInboxId: "ci-2",
        integrationWhatsappId: "iw-2",
      },
    ])
    vi.useFakeTimers({ now: new Date("2026-08-10T12:34:56.000Z") })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test("enqueueTagAppliedEvaluations fans out one job per WhatsApp-CTWA inbox of the contact", async () => {
    await adsConversionService.enqueueTagAppliedEvaluations({
      workspaceId: "ws-1",
      contactId: "contact-1",
      tagId: "tag-1",
    })

    expect(mocks.listWhatsappCtwaInboxesByContacts).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactIds: ["contact-1"],
    })
    expect(mocks.adsConversionQueueAdd).toHaveBeenCalledTimes(2)
    expect(mocks.adsConversionQueueAdd).toHaveBeenCalledWith(
      {
        type: "evaluateConversionTrigger",
        data: {
          workspaceId: "ws-1",
          integrationWhatsappId: "iw-1",
          contactInboxId: "ci-1",
          occurrence: { type: "tagApplied", tagId: "tag-1" },
        },
      },
      { jobId: "ads-conversion-evaluate-tag-ci-1-tag-1-20260810" },
    )
    expect(mocks.adsConversionQueueAdd).toHaveBeenCalledWith(
      {
        type: "evaluateConversionTrigger",
        data: {
          workspaceId: "ws-1",
          integrationWhatsappId: "iw-2",
          contactInboxId: "ci-2",
          occurrence: { type: "tagApplied", tagId: "tag-1" },
        },
      },
      { jobId: "ads-conversion-evaluate-tag-ci-2-tag-1-20260810" },
    )
  })

  test("enqueueTagAppliedEvaluations enqueues nothing when the contact has no WhatsApp-CTWA inbox", async () => {
    mocks.listWhatsappCtwaInboxesByContacts.mockResolvedValue([])

    await adsConversionService.enqueueTagAppliedEvaluations({
      workspaceId: "ws-1",
      contactId: "contact-1",
      tagId: "tag-1",
    })

    expect(mocks.adsConversionQueueAdd).not.toHaveBeenCalled()
  })

  test("enqueueTagAppliedEvaluations swallows a queue enqueue failure", async () => {
    mocks.adsConversionQueueAdd.mockRejectedValueOnce(new Error("redis down"))

    await expect(
      adsConversionService.enqueueTagAppliedEvaluations({
        workspaceId: "ws-1",
        contactId: "contact-1",
        tagId: "tag-1",
      }),
    ).resolves.toBeUndefined()
  })

  test("enqueueTagAppliedEvaluationForInbox resolves the integration then enqueues for that one inbox", async () => {
    await adsConversionService.enqueueTagAppliedEvaluationForInbox({
      workspaceId: "ws-1",
      inboxId: "inbox-1",
      contactInboxId: "ci-1",
      tagId: "tag-1",
    })

    expect(mocks.findWorkspaceIntegrationByInboxId).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      inboxId: "inbox-1",
    })
    expect(mocks.adsConversionQueueAdd).toHaveBeenCalledTimes(1)
    expect(mocks.adsConversionQueueAdd).toHaveBeenCalledWith(
      {
        type: "evaluateConversionTrigger",
        data: {
          workspaceId: "ws-1",
          integrationWhatsappId: "iw-1",
          contactInboxId: "ci-1",
          occurrence: { type: "tagApplied", tagId: "tag-1" },
        },
      },
      { jobId: "ads-conversion-evaluate-tag-ci-1-tag-1-20260810" },
    )
  })

  test("enqueueTagAppliedEvaluationForInbox is a no-op when the inbox has no WhatsApp integration", async () => {
    mocks.findWorkspaceIntegrationByInboxId.mockResolvedValue(null)

    await adsConversionService.enqueueTagAppliedEvaluationForInbox({
      workspaceId: "ws-1",
      inboxId: "inbox-1",
      contactInboxId: "ci-1",
      tagId: "tag-1",
    })

    expect(mocks.adsConversionQueueAdd).not.toHaveBeenCalled()
  })

  test("enqueueKeywordMatchedEvaluation resolves the integration then enqueues", async () => {
    await adsConversionService.enqueueKeywordMatchedEvaluation({
      workspaceId: "ws-1",
      inboxId: "inbox-1",
      contactInboxId: "ci-1",
      automatedResponseId: "ar-1",
      messageId: "msg-1",
    })

    expect(mocks.findWorkspaceIntegrationByInboxId).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      inboxId: "inbox-1",
    })
    expect(mocks.adsConversionQueueAdd).toHaveBeenCalledWith(
      {
        type: "evaluateConversionTrigger",
        data: {
          workspaceId: "ws-1",
          integrationWhatsappId: "iw-1",
          contactInboxId: "ci-1",
          occurrence: { type: "keywordMatched", automatedResponseId: "ar-1" },
        },
      },
      { jobId: "ads-conversion-evaluate-keyword-msg-1" },
    )
  })

  test("enqueueKeywordMatchedEvaluation is a no-op when the inbox has no WhatsApp integration", async () => {
    mocks.findWorkspaceIntegrationByInboxId.mockResolvedValue(null)

    await adsConversionService.enqueueKeywordMatchedEvaluation({
      workspaceId: "ws-1",
      inboxId: "inbox-1",
      contactInboxId: "ci-1",
      automatedResponseId: "ar-1",
      messageId: "msg-1",
    })

    expect(mocks.adsConversionQueueAdd).not.toHaveBeenCalled()
  })

  test("enqueueContactRepliedEvaluation enqueues using the caller-supplied integrationWhatsappId directly", async () => {
    await adsConversionService.enqueueContactRepliedEvaluation({
      workspaceId: "ws-1",
      integrationWhatsappId: "iw-1",
      contactInboxId: "ci-1",
      isFirstReply: true,
      messageId: "msg-2",
    })

    expect(mocks.findWorkspaceIntegrationByInboxId).not.toHaveBeenCalled()
    expect(mocks.adsConversionQueueAdd).toHaveBeenCalledWith(
      {
        type: "evaluateConversionTrigger",
        data: {
          workspaceId: "ws-1",
          integrationWhatsappId: "iw-1",
          contactInboxId: "ci-1",
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

  test("resolves every contact's inboxes in one batch query and enqueues per inbox x tag", async () => {
    mocks.listWhatsappCtwaInboxesByContacts.mockResolvedValue([
      {
        contactId: "contact-1",
        contactInboxId: "ci-1",
        integrationWhatsappId: "iw-1",
      },
      {
        contactId: "contact-2",
        contactInboxId: "ci-2",
        integrationWhatsappId: "iw-2",
      },
    ])

    await adsConversionService.enqueueTagAppliedEvaluationsBulk({
      workspaceId: "ws-1",
      pairs: [
        { contactId: "contact-1", tagId: "tag-1" },
        { contactId: "contact-2", tagId: "tag-2" },
      ],
    })

    expect(mocks.listWhatsappCtwaInboxesByContacts).toHaveBeenCalledTimes(1)
    expect(mocks.listWhatsappCtwaInboxesByContacts).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactIds: ["contact-1", "contact-2"],
    })
    expect(mocks.adsConversionQueueAdd).toHaveBeenCalledTimes(2)
    expect(mocks.adsConversionQueueAdd).toHaveBeenCalledWith(
      {
        type: "evaluateConversionTrigger",
        data: {
          workspaceId: "ws-1",
          integrationWhatsappId: "iw-1",
          contactInboxId: "ci-1",
          occurrence: { type: "tagApplied", tagId: "tag-1" },
        },
      },
      { jobId: "ads-conversion-evaluate-tag-ci-1-tag-1-20260810" },
    )
    expect(mocks.adsConversionQueueAdd).toHaveBeenCalledWith(
      {
        type: "evaluateConversionTrigger",
        data: {
          workspaceId: "ws-1",
          integrationWhatsappId: "iw-2",
          contactInboxId: "ci-2",
          occurrence: { type: "tagApplied", tagId: "tag-2" },
        },
      },
      { jobId: "ads-conversion-evaluate-tag-ci-2-tag-2-20260810" },
    )
  })

  test("deduplicates contactIds into a single batch query lookup key list", async () => {
    mocks.listWhatsappCtwaInboxesByContacts.mockResolvedValue([
      {
        contactId: "contact-1",
        contactInboxId: "ci-1",
        integrationWhatsappId: "iw-1",
      },
    ])

    await adsConversionService.enqueueTagAppliedEvaluationsBulk({
      workspaceId: "ws-1",
      pairs: [
        { contactId: "contact-1", tagId: "tag-1" },
        { contactId: "contact-1", tagId: "tag-2" },
      ],
    })

    expect(mocks.listWhatsappCtwaInboxesByContacts).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactIds: ["contact-1"],
    })
    expect(mocks.adsConversionQueueAdd).toHaveBeenCalledTimes(2)
  })

  test("is a no-op for empty pairs without querying", async () => {
    await adsConversionService.enqueueTagAppliedEvaluationsBulk({
      workspaceId: "ws-1",
      pairs: [],
    })

    expect(mocks.listWhatsappCtwaInboxesByContacts).not.toHaveBeenCalled()
    expect(mocks.adsConversionQueueAdd).not.toHaveBeenCalled()
  })

  test("produces no jobs for contacts with no WhatsApp-CTWA inbox", async () => {
    mocks.listWhatsappCtwaInboxesByContacts.mockResolvedValue([])

    await adsConversionService.enqueueTagAppliedEvaluationsBulk({
      workspaceId: "ws-1",
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
        id: "rule-1",
        trigger: { type: "contactReplied", firstReplyOnly: false },
      },
    ])

    await expect(
      adsConversionService.hasEnabledTriggerRule({
        workspaceId: "ws-1",
        integrationWhatsappId: "iw-1",
        triggerType: "contactReplied",
      }),
    ).resolves.toBe(true)

    expect(mocks.listByWorkspace).toHaveBeenCalledWith("ws-1", {
      channel: "whatsapp",
      enabled: true,
      integrationWhatsappId: "iw-1",
    })
  })

  test("returns false when no enabled rule matches the trigger type", async () => {
    mocks.listByWorkspace.mockResolvedValue([
      { id: "rule-1", trigger: { type: "tagApplied", tagIds: ["tag-1"] } },
    ])

    await expect(
      adsConversionService.hasEnabledTriggerRule({
        workspaceId: "ws-1",
        integrationWhatsappId: "iw-1",
        triggerType: "contactReplied",
      }),
    ).resolves.toBe(false)
  })

  test("returns false when the workspace has no rules at all", async () => {
    mocks.listByWorkspace.mockResolvedValue([])

    await expect(
      adsConversionService.hasEnabledTriggerRule({
        workspaceId: "ws-1",
        integrationWhatsappId: "iw-1",
        triggerType: "contactReplied",
      }),
    ).resolves.toBe(false)
  })
})

describe("AdsConversionService cache invalidation on rule mutation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.create.mockResolvedValue({ id: "rule-1", workspaceId: "ws-1" })
    mocks.update.mockResolvedValue({ id: "rule-1", workspaceId: "ws-1" })
    mocks.delete.mockResolvedValue({ id: "rule-1", workspaceId: "ws-1" })
    mocks.findWorkspaceWhatsappIntegration.mockResolvedValue({
      id: "iw-1",
      workspaceId: "ws-1",
    })
    mocks.findWorkspaceRule.mockResolvedValue({
      id: "rule-1",
      workspaceId: "ws-1",
      channel: "whatsapp",
      integrationWhatsappId: "iw-1",
      integrationFacebookAdsId: null,
      trigger: { type: "templateSent", templateIds: ["template-1"] },
    })
  })

  test("create invalidates the workspace's has-trigger-rule cache tag", async () => {
    await adsConversionService.create(validWhatsappInput)

    expect(mocks.invalidateCacheByTags).toHaveBeenCalledWith([
      "ads-conversion:has-trigger-rule:ws-1",
    ])
  })

  test("update invalidates the workspace's has-trigger-rule cache tag", async () => {
    await adsConversionService.update({
      id: "rule-1",
      workspaceId: "ws-1",
      trigger: { type: "templateSent", templateIds: ["template-2"] },
    })

    expect(mocks.invalidateCacheByTags).toHaveBeenCalledWith([
      "ads-conversion:has-trigger-rule:ws-1",
    ])
  })

  test("toggleEnabled invalidates the workspace's has-trigger-rule cache tag", async () => {
    await adsConversionService.toggleEnabled({
      id: "rule-1",
      workspaceId: "ws-1",
      enabled: false,
    })

    expect(mocks.invalidateCacheByTags).toHaveBeenCalledWith([
      "ads-conversion:has-trigger-rule:ws-1",
    ])
  })

  test("remove invalidates the workspace's has-trigger-rule cache tag", async () => {
    await adsConversionService.remove({ id: "rule-1", workspaceId: "ws-1" })

    expect(mocks.invalidateCacheByTags).toHaveBeenCalledWith([
      "ads-conversion:has-trigger-rule:ws-1",
    ])
  })
})

describe("AdsConversionService.isEligibleChannel", () => {
  test("returns true only for whatsapp", () => {
    expect(adsConversionService.isEligibleChannel("whatsapp")).toBe(true)
    expect(adsConversionService.isEligibleChannel("messenger")).toBe(false)
    expect(adsConversionService.isEligibleChannel(null)).toBe(false)
    expect(adsConversionService.isEligibleChannel(undefined)).toBe(false)
  })
})
