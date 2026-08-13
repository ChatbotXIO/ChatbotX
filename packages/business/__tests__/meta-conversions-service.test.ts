import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  enqueueIntegrationJob: vi.fn(),
  findPendingBySourceKey: vi.fn(),
  findWorkspaceEvent: vi.fn(),
  insertIgnoreDuplicate: vi.fn(),
  metaCapiUpdateCapiStatus: vi.fn(),
  messengerFindByInboxId: vi.fn(),
  messengerFindByInboxIdForWorkspace: vi.fn(),
  instagramFindByInboxId: vi.fn(),
  instagramFindByInboxIdForWorkspace: vi.fn(),
  messengerFindWorkspaceIntegration: vi.fn(),
  messengerClaimCapiScopeCacheRefresh: vi.fn(),
  messengerUpdateCapiScopeCache: vi.fn(),
  messengerSetCapiScopeCache: vi.fn(),
  messengerUpdateDatasetIdIfNull: vi.fn(),
  messengerUpdateDatasetId: vi.fn(),
  messengerUpdateCapiAccessToken: vi.fn(),
  messengerClearCapiAccessToken: vi.fn(),
  instagramFindWorkspaceIntegration: vi.fn(),
  instagramClaimCapiScopeCacheRefresh: vi.fn(),
  instagramUpdateCapiScopeCache: vi.fn(),
  instagramSetCapiScopeCache: vi.fn(),
  instagramUpdateDatasetIdIfNull: vi.fn(),
  instagramUpdateDatasetId: vi.fn(),
  instagramUpdateCapiAccessToken: vi.fn(),
  instagramClearCapiAccessToken: vi.fn(),
  encryptedDataParse: vi.fn((value: unknown) => value),
  encryptObject: vi.fn(),
  decryptObject: vi.fn(),
  invalidateCacheByTags: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  metaCapiEventRepository: {
    findPendingBySourceKey: mocks.findPendingBySourceKey,
    findWorkspaceEvent: mocks.findWorkspaceEvent,
    insertIgnoreDuplicate: mocks.insertIgnoreDuplicate,
    updateCapiStatus: mocks.metaCapiUpdateCapiStatus,
  },
  integrationMessengerRepository: {
    findWorkspaceIntegration: mocks.messengerFindWorkspaceIntegration,
    claimCapiScopeCacheRefresh: mocks.messengerClaimCapiScopeCacheRefresh,
    updateCapiScopeCache: mocks.messengerUpdateCapiScopeCache,
    setCapiScopeCache: mocks.messengerSetCapiScopeCache,
    updateDatasetIdIfNull: mocks.messengerUpdateDatasetIdIfNull,
    updateDatasetId: mocks.messengerUpdateDatasetId,
    updateCapiAccessToken: mocks.messengerUpdateCapiAccessToken,
    clearCapiAccessToken: mocks.messengerClearCapiAccessToken,
  },
  integrationInstagramRepository: {
    findWorkspaceIntegration: mocks.instagramFindWorkspaceIntegration,
    claimCapiScopeCacheRefresh: mocks.instagramClaimCapiScopeCacheRefresh,
    updateCapiScopeCache: mocks.instagramUpdateCapiScopeCache,
    setCapiScopeCache: mocks.instagramSetCapiScopeCache,
    updateDatasetIdIfNull: mocks.instagramUpdateDatasetIdIfNull,
    updateDatasetId: mocks.instagramUpdateDatasetId,
    updateCapiAccessToken: mocks.instagramUpdateCapiAccessToken,
    clearCapiAccessToken: mocks.instagramClearCapiAccessToken,
  },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: {
    sendMetaCapiEvent: "sendMetaCapiEvent",
  },
  enqueueIntegrationJob: mocks.enqueueIntegrationJob,
}))

vi.mock("../src/integration-messenger/service", () => ({
  messengerIntegrationService: {
    findByInboxId: mocks.messengerFindByInboxId,
    findByInboxIdForWorkspace: mocks.messengerFindByInboxIdForWorkspace,
  },
}))

vi.mock("../src/integration-instagram/service", () => ({
  instagramIntegrationService: {
    findByInboxId: mocks.instagramFindByInboxId,
    findByInboxIdForWorkspace: mocks.instagramFindByInboxIdForWorkspace,
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: mocks.invalidateCacheByTags,
}))

vi.mock("@chatbotx.io/encryption", () => ({
  encryptedDataSchema: { parse: mocks.encryptedDataParse },
  encryptUtils: {
    decryptObject: mocks.decryptObject,
    encryptObject: mocks.encryptObject,
  },
}))

const { metaConversionsService, resolveCapiAccessToken } = await import(
  "../src/meta-conversions"
)

const messengerIntegration = {
  id: "im-1",
  workspaceId: "ws-1",
  inboxId: "inbox-1",
  pageId: "page-1",
  auth: { tokens: { accessToken: "messenger-token" } },
  capiScopeCheckedAt: null,
  datasetId: null,
  capiAccessToken: null,
}

const instagramFacebookIntegration = {
  id: "ig-1",
  workspaceId: "ws-1",
  inboxId: "inbox-1",
  igId: "ig-user-1",
  pageId: "page-1",
  auth: { tokens: { accessToken: "instagram-token" } },
  capiScopeCheckedAt: null,
  datasetId: null,
  capiAccessToken: null,
  type: "facebook",
}

const instagramBusinessLoginIntegration = {
  ...instagramFacebookIntegration,
  type: "instagram",
}

describe("MetaConversionsService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.enqueueIntegrationJob.mockResolvedValue(undefined)
    mocks.messengerFindByInboxId.mockResolvedValue(messengerIntegration)
    mocks.messengerFindByInboxIdForWorkspace.mockResolvedValue(
      messengerIntegration,
    )
    mocks.instagramFindByInboxId.mockResolvedValue(instagramFacebookIntegration)
    mocks.instagramFindByInboxIdForWorkspace.mockResolvedValue(
      instagramFacebookIntegration,
    )
    mocks.insertIgnoreDuplicate.mockImplementation(
      async (values: Record<string, unknown>) => ({
        id: "event-1",
        createdAt: new Date("2026-08-10T00:00:00.000Z"),
        updatedAt: new Date("2026-08-10T00:00:00.000Z"),
        ...values,
      }),
    )
    mocks.findPendingBySourceKey.mockResolvedValue(null)
    mocks.decryptObject.mockResolvedValue({ accessToken: "manual-token" })
    mocks.encryptObject.mockResolvedValue({ encrypted: true })
    mocks.messengerClaimCapiScopeCacheRefresh.mockImplementation(
      async (input: Record<string, unknown>) => ({
        ...messengerIntegration,
        capiScopeCheckedAt: input.capiScopeCheckedAt,
      }),
    )
    mocks.instagramClaimCapiScopeCacheRefresh.mockImplementation(
      async (input: Record<string, unknown>) => ({
        ...instagramFacebookIntegration,
        capiScopeCheckedAt: input.capiScopeCheckedAt,
      }),
    )
    mocks.messengerUpdateCapiScopeCache.mockImplementation(
      async (input: Record<string, unknown>) => ({
        ...messengerIntegration,
        hasCapiScope: input.hasCapiScope,
        capiScopeCheckedAt: input.capiScopeCheckedAt,
      }),
    )
    mocks.messengerSetCapiScopeCache.mockImplementation(
      async (input: Record<string, unknown>) => ({
        ...messengerIntegration,
        hasCapiScope: input.hasCapiScope,
        capiScopeCheckedAt: input.capiScopeCheckedAt,
      }),
    )
    mocks.instagramUpdateCapiScopeCache.mockImplementation(
      async (input: Record<string, unknown>) => ({
        ...instagramFacebookIntegration,
        hasCapiScope: input.hasCapiScope,
        capiScopeCheckedAt: input.capiScopeCheckedAt,
      }),
    )
    mocks.instagramSetCapiScopeCache.mockImplementation(
      async (input: Record<string, unknown>) => ({
        ...instagramFacebookIntegration,
        hasCapiScope: input.hasCapiScope,
        capiScopeCheckedAt: input.capiScopeCheckedAt,
      }),
    )
    mocks.messengerUpdateDatasetId.mockImplementation(
      async (input: Record<string, unknown>) => ({
        ...messengerIntegration,
        datasetId: input.datasetId,
      }),
    )
    mocks.messengerUpdateCapiAccessToken.mockImplementation(
      async (input: Record<string, unknown>) => ({
        ...messengerIntegration,
        capiAccessToken: input.capiAccessToken,
      }),
    )
    mocks.messengerClearCapiAccessToken.mockResolvedValue({
      ...messengerIntegration,
      capiAccessToken: null,
    })
    mocks.instagramUpdateDatasetId.mockImplementation(
      async (input: Record<string, unknown>) => ({
        ...instagramFacebookIntegration,
        datasetId: input.datasetId,
      }),
    )
    mocks.instagramUpdateCapiAccessToken.mockImplementation(
      async (input: Record<string, unknown>) => ({
        ...instagramFacebookIntegration,
        capiAccessToken: input.capiAccessToken,
      }),
    )
    mocks.instagramClearCapiAccessToken.mockResolvedValue({
      ...instagramFacebookIntegration,
      capiAccessToken: null,
    })
  })

  test("resolves manual CAPI access token before OAuth auth", async () => {
    await expect(
      resolveCapiAccessToken({
        ...messengerIntegration,
        capiAccessToken: { encrypted: true },
      }),
    ).resolves.toEqual({
      accessToken: "manual-token",
      source: "manual",
    })

    expect(mocks.encryptedDataParse).toHaveBeenCalledWith({ encrypted: true })
    expect(mocks.decryptObject).toHaveBeenCalledWith(
      { encrypted: true },
      expect.any(Object),
    )
  })

  test("resolves OAuth CAPI access token when no manual token is saved", async () => {
    await expect(resolveCapiAccessToken(messengerIntegration)).resolves.toEqual(
      {
        accessToken: "messenger-token",
        source: "oauth",
      },
    )

    expect(mocks.decryptObject).not.toHaveBeenCalled()
  })

  test("dedupe: same sourceKey re-enqueues the existing pending row with the same jobId", async () => {
    mocks.insertIgnoreDuplicate.mockResolvedValueOnce(null)
    mocks.findPendingBySourceKey.mockResolvedValueOnce({
      id: "event-existing",
      workspaceId: "ws-1",
      capiStatus: "pending",
    })

    await expect(
      metaConversionsService.enqueueLeadEvent({
        workspaceId: "ws-1",
        channel: "messenger",
        contactInboxId: "ci-1",
        inboxId: "inbox-1",
        sourceKey: "flow:step-1:ci-1:20260810",
        source: "flowStep",
        occurredAt: new Date("2026-08-10T12:00:00.000Z"),
      }),
    ).resolves.toBeNull()

    expect(mocks.messengerFindByInboxIdForWorkspace).toHaveBeenCalledWith({
      inboxId: "inbox-1",
      workspaceId: "ws-1",
    })
    expect(mocks.insertIgnoreDuplicate).toHaveBeenCalledTimes(1)
    expect(mocks.findPendingBySourceKey).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      channel: "messenger",
      sourceKey: "flow:step-1:ci-1:20260810",
    })
    expect(mocks.enqueueIntegrationJob).toHaveBeenCalledWith(
      {
        type: "sendMetaCapiEvent",
        data: {
          metaCapiEventId: "event-existing",
          workspaceId: "ws-1",
        },
      },
      { jobId: "meta-capi-send-event-existing" },
    )
  })

  test("inserts a new event and enqueues one send job", async () => {
    await expect(
      metaConversionsService.enqueueLeadEvent({
        workspaceId: "ws-1",
        channel: "messenger",
        contactInboxId: "ci-1",
        inboxId: "inbox-1",
        sourceKey: "flow:step-1:ci-1:20260810",
        source: "flowStep",
        occurredAt: new Date("2026-08-10T12:00:00.000Z"),
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: "event-1",
        channel: "messenger",
        integrationId: "im-1",
        eventName: "LeadSubmitted",
        capiStatus: "pending",
      }),
    )

    expect(mocks.messengerFindByInboxIdForWorkspace).toHaveBeenCalledWith({
      inboxId: "inbox-1",
      workspaceId: "ws-1",
    })
    expect(mocks.enqueueIntegrationJob).toHaveBeenCalledWith(
      {
        type: "sendMetaCapiEvent",
        data: { metaCapiEventId: "event-1", workspaceId: "ws-1" },
      },
      { jobId: "meta-capi-send-event-1" },
    )
  })

  test("persists optional value and normalized currency on inserted events", async () => {
    await metaConversionsService.enqueueLeadEvent({
      workspaceId: "ws-1",
      channel: "messenger",
      contactInboxId: "ci-1",
      inboxId: "inbox-1",
      sourceKey: "flow:step-1:ci-1:20260810",
      source: "flowStep",
      value: "12.34",
      currency: "usd",
      occurredAt: new Date("2026-08-10T12:00:00.000Z"),
    })

    expect(mocks.insertIgnoreDuplicate).toHaveBeenCalledWith(
      expect.objectContaining({
        value: "12.34",
        currency: "USD",
      }),
    )
  })

  test("does not enqueue when an existing event is no longer pending", async () => {
    mocks.insertIgnoreDuplicate.mockResolvedValueOnce(null)
    mocks.findPendingBySourceKey.mockResolvedValueOnce(null)

    await metaConversionsService.enqueueLeadEvent({
      workspaceId: "ws-1",
      channel: "messenger",
      contactInboxId: "ci-1",
      inboxId: "inbox-1",
      sourceKey: "flow:step-1:ci-1:20260810",
      source: "flowStep",
    })

    expect(mocks.enqueueIntegrationJob).not.toHaveBeenCalled()
  })

  test("throws before creating an event when inbox integration is outside the workspace", async () => {
    mocks.messengerFindByInboxIdForWorkspace.mockRejectedValueOnce(
      new Error("Messenger integration not found for workspace"),
    )

    await expect(
      metaConversionsService.enqueueLeadEvent({
        workspaceId: "ws-other",
        channel: "messenger",
        contactInboxId: "ci-1",
        inboxId: "inbox-1",
        sourceKey: "flow:step-1:ci-1:20260810",
        source: "flowStep",
      }),
    ).rejects.toThrow("Messenger integration not found for workspace")

    expect(mocks.insertIgnoreDuplicate).not.toHaveBeenCalled()
    expect(mocks.enqueueIntegrationJob).not.toHaveBeenCalled()
  })

  test("dispatches readiness refresh through the messenger adapter", async () => {
    const now = new Date("2026-08-10T12:00:00.000Z")
    const checkScope = vi.fn().mockResolvedValue(true)

    await metaConversionsService.refreshCapiScopeCache({
      channel: "messenger",
      integration: messengerIntegration,
      checkScope,
      now,
    })

    expect(checkScope).toHaveBeenCalledWith({
      accessToken: "messenger-token",
      resourceId: "page-1",
    })
    expect(mocks.messengerUpdateCapiScopeCache).toHaveBeenCalledWith(
      {
        id: "im-1",
        workspaceId: "ws-1",
        hasCapiScope: true,
        capiScopeCheckedAt: now,
        expectedCapiScopeCheckedAt: now,
      },
      undefined,
    )
    expect(mocks.instagramUpdateCapiScopeCache).not.toHaveBeenCalled()
  })

  test("scope refresh failure restores the claim and rethrows a retryable error", async () => {
    const now = new Date("2026-08-10T12:00:00.000Z")
    const checkScope = vi.fn().mockRejectedValue(new Error("debug failed"))

    await expect(
      metaConversionsService.refreshCapiScopeCache({
        channel: "messenger",
        integration: { ...messengerIntegration, hasCapiScope: false },
        checkScope,
        now,
      }),
    ).rejects.toMatchObject({
      name: "CapiScopeRefreshError",
      retryable: true,
    })

    expect(mocks.messengerUpdateCapiScopeCache).toHaveBeenCalledWith(
      {
        id: "im-1",
        workspaceId: "ws-1",
        hasCapiScope: false,
        capiScopeCheckedAt: null,
        expectedCapiScopeCheckedAt: now,
      },
      undefined,
    )
  })

  test("public scope-cache update uses the unconditional adapter write", async () => {
    const now = new Date("2026-08-10T12:00:00.000Z")

    await metaConversionsService.updateCapiScopeCache({
      channel: "messenger",
      integration: messengerIntegration,
      hasCapiScope: true,
      capiScopeCheckedAt: now,
    })

    expect(mocks.messengerSetCapiScopeCache).toHaveBeenCalledWith(
      {
        id: "im-1",
        workspaceId: "ws-1",
        hasCapiScope: true,
        capiScopeCheckedAt: now,
      },
      undefined,
    )
    expect(mocks.messengerUpdateCapiScopeCache).not.toHaveBeenCalled()
  })

  test("dispatches dataset provisioning through the instagram adapter", async () => {
    mocks.instagramUpdateDatasetIdIfNull.mockResolvedValueOnce({
      ...instagramFacebookIntegration,
      datasetId: "dataset-1",
    })
    const provisionDataset = vi.fn().mockResolvedValue("dataset-1")

    await expect(
      metaConversionsService.ensureDatasetId({
        channel: "instagram",
        integration: instagramFacebookIntegration,
        provisionDataset,
      }),
    ).resolves.toBe("dataset-1")

    expect(provisionDataset).toHaveBeenCalledWith({
      accessToken: "instagram-token",
      resourceId: "ig-user-1",
    })
    expect(mocks.instagramUpdateDatasetIdIfNull).toHaveBeenCalledWith(
      {
        id: "ig-1",
        workspaceId: "ws-1",
        datasetId: "dataset-1",
      },
      undefined,
    )
    expect(mocks.messengerUpdateDatasetIdIfNull).not.toHaveBeenCalled()
  })

  test("saves a manually entered dataset id after graph validation", async () => {
    const validate = vi.fn().mockResolvedValue("123456789")

    await expect(
      metaConversionsService.saveDatasetId({
        channel: "messenger",
        integration: messengerIntegration,
        datasetId: " 123456789 ",
        validate,
      }),
    ).resolves.toEqual(expect.objectContaining({ datasetId: "123456789" }))

    expect(validate).toHaveBeenCalledWith({
      datasetId: "123456789",
      accessToken: "messenger-token",
    })
    expect(mocks.messengerUpdateDatasetId).toHaveBeenCalledWith(
      {
        id: "im-1",
        workspaceId: "ws-1",
        datasetId: "123456789",
      },
      undefined,
    )
  })

  test("does not encrypt or write manual CAPI token when dataset validation fails", async () => {
    const validate = vi.fn().mockRejectedValue(new Error("invalid dataset"))

    await expect(
      metaConversionsService.saveCapiAccessToken({
        channel: "messenger",
        integration: messengerIntegration,
        accessToken: "manual-token",
        datasetId: "123456789",
        validate,
      }),
    ).rejects.toThrow("invalid dataset")

    expect(validate).toHaveBeenCalledWith({
      datasetId: "123456789",
      accessToken: "manual-token",
    })
    expect(mocks.encryptObject).not.toHaveBeenCalled()
    expect(mocks.messengerUpdateCapiAccessToken).not.toHaveBeenCalled()
  })

  test("encrypts and saves manual CAPI token after dataset validation succeeds", async () => {
    const validate = vi.fn().mockResolvedValue("123456789")

    await expect(
      metaConversionsService.saveCapiAccessToken({
        channel: "messenger",
        integration: messengerIntegration,
        accessToken: " manual-token ",
        datasetId: "123456789",
        validate,
      }),
    ).resolves.toEqual(
      expect.objectContaining({ capiAccessToken: { encrypted: true } }),
    )

    expect(mocks.encryptObject).toHaveBeenCalledWith({
      accessToken: "manual-token",
    })
    expect(mocks.messengerUpdateCapiAccessToken).toHaveBeenCalledWith(
      {
        id: "im-1",
        workspaceId: "ws-1",
        capiAccessToken: { encrypted: true },
      },
      undefined,
    )
  })

  test("rejects instagram business-login rows for CAPI readiness", async () => {
    await expect(
      metaConversionsService.refreshCapiScopeCache({
        channel: "instagram",
        integration: instagramBusinessLoginIntegration,
        checkScope: vi.fn(),
      }),
    ).rejects.toThrow("Instagram Business Login integrations do not support")

    expect(mocks.instagramClaimCapiScopeCacheRefresh).not.toHaveBeenCalled()
  })
})
