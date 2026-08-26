import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// messagingAdCampaignService — the operation-record orchestrator. Mocks the
// repository, the Facebook Ads context/dispatcher, and the channel-asset
// resolver at the module boundary so the create-with-reconcile chain and the
// publish compensation logic are asserted without touching a real DB or
// Graph API.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  createOp: vi.fn(),
  findByIdForWorkspace: vi.fn(),
  updateCreateProgress: vi.fn(),
  updatePublishState: vi.fn(),
  setCleanupError: vi.fn(),
  listByWorkspaceId: vi.fn(),
  claimForRetry: vi.fn(),
  runAction: vi.fn(),
  getGraphErrorCode: vi.fn(() => undefined as number | undefined),
  buildMessagingAdsContext: vi.fn(() => Promise.resolve({ ctx: true })),
  invalidateMessagingAdsCache: vi.fn(() => Promise.resolve()),
  listCachedMessagingAdsEffectiveStatus: vi.fn(
    () =>
      Promise.resolve([]) as Promise<
        { id: string; effective_status: string }[]
      >,
  ),
  listCachedMessagingAdsInsights: vi.fn(
    () => Promise.resolve([]) as Promise<{ adId: string; currency: string }[]>,
  ),
  markInvalid: vi.fn(() => Promise.resolve()),
  resolveMessagingAdChannelAssets: vi.fn(() =>
    Promise.resolve({ pageId: "pg_1" }),
  ),
  createId: vi.fn(() => "op_generated"),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  messagingAdOperationRepository: {
    create: mocks.createOp,
    findByIdForWorkspace: mocks.findByIdForWorkspace,
    updateCreateProgress: mocks.updateCreateProgress,
    updatePublishState: mocks.updatePublishState,
    setCleanupError: mocks.setCleanupError,
    listByWorkspaceId: mocks.listByWorkspaceId,
    claimForRetry: mocks.claimForRetry,
  },
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return { ...actual, createId: mocks.createId }
})

// Real `buildCorrelationName`/`buildPromotedObject`/`META_STATUS`/
// `messagingAdConfigByChannel` are pure and exercised for real; only the
// Graph dispatcher (`integration`) and `getGraphErrorCode` are mocked.
vi.mock("@chatbotx.io/integration-facebook-ads", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@chatbotx.io/integration-facebook-ads")
    >()
  return {
    ...actual,
    integration: { runAction: mocks.runAction },
    getGraphErrorCode: mocks.getGraphErrorCode,
  }
})

vi.mock("../../messaging-ads-connection", () => ({
  buildMessagingAdsContext: mocks.buildMessagingAdsContext,
  invalidateMessagingAdsCache: mocks.invalidateMessagingAdsCache,
  listCachedMessagingAdsEffectiveStatus:
    mocks.listCachedMessagingAdsEffectiveStatus,
  listCachedMessagingAdsInsights: mocks.listCachedMessagingAdsInsights,
  messagingAdsConnectionService: { markInvalid: mocks.markInvalid },
}))

vi.mock("../resolve-channel-assets", () => ({
  resolveMessagingAdChannelAssets: mocks.resolveMessagingAdChannelAssets,
}))

const { messagingAdCampaignService } = await import("../service")

function baseRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "op_generated",
    workspaceId: "ws_1",
    channel: "messenger",
    integrationMessengerId: "im_1",
    adAccountId: "act_9",
    name: "My ad",
    createState: "pending",
    publishState: "draft",
    metaCampaignId: null,
    metaAdSetId: null,
    metaAdCreativeId: null,
    metaAdId: null,
    input: {
      adAccountId: "act_9",
      campaign: { name: "My ad", specialAdCategories: ["NONE"] },
      adSet: {
        dailyBudgetMinorUnits: 2000,
        targeting: { countries: ["US"] },
      },
      creative: {
        media: { kind: "image", imageHash: "hash", link: "https://x.com" },
        welcomeMessage: { type: "default" },
      },
    },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.createId.mockReturnValue("op_generated")
  mocks.getGraphErrorCode.mockReturnValue(undefined)
  mocks.buildMessagingAdsContext.mockResolvedValue({ ctx: true })
  mocks.invalidateMessagingAdsCache.mockResolvedValue(undefined)
  mocks.listCachedMessagingAdsEffectiveStatus.mockResolvedValue([])
  mocks.listCachedMessagingAdsInsights.mockResolvedValue([])
  mocks.markInvalid.mockResolvedValue(undefined)
  mocks.resolveMessagingAdChannelAssets.mockResolvedValue({ pageId: "pg_1" })
})

/** Makes `updateCreateProgress` accumulate onto a running row, matching the real repository's UPDATE semantics (each call merges onto the CURRENT row, not the original). */
function accumulateCreateProgress(record: Record<string, unknown>) {
  let current = { ...record }
  mocks.updateCreateProgress.mockImplementation((input) => {
    current = { ...current, ...input }
    return Promise.resolve(current)
  })
}

describe("createDraft", () => {
  test("creates campaign -> adSet -> creative -> ad in order, persisting after each step", async () => {
    const record = baseRecord()
    mocks.createOp.mockResolvedValue(record)
    accumulateCreateProgress(record)
    mocks.runAction.mockImplementation((action: string) => {
      if (action === "findMessagingCampaignByOperationId") {
        return null
      }
      if (action === "createMessagingCampaign") {
        return { id: "camp_1" }
      }
      if (action === "findMessagingAdSetByOperationId") {
        return null
      }
      if (action === "createMessagingAdSet") {
        return { id: "adset_1" }
      }
      if (action === "findMessagingAdCreativeByOperationId") {
        return null
      }
      if (action === "createMessagingAdCreative") {
        return { id: "creative_1" }
      }
      if (action === "findMessagingAdByOperationId") {
        return null
      }
      if (action === "createMessagingAd") {
        return { id: "ad_1" }
      }
      throw new Error(`unexpected action ${action}`)
    })

    const result = await messagingAdCampaignService.createDraft({
      workspaceId: "ws_1",
      channel: "messenger",
      integrationId: "im_1",
      adAccountId: "act_9",
      name: "My ad",
      campaign: { specialAdCategories: ["NONE"] },
      adSet: { dailyBudgetMinorUnits: 2000, targeting: { countries: ["US"] } },
      creative: {
        media: { kind: "image", imageHash: "hash", link: "https://x.com" },
        welcomeMessage: { type: "default" },
      },
    })

    expect(result.metaAdId).toBe("ad_1")
    const calledActions = mocks.runAction.mock.calls.map((call) => call[0])
    expect(calledActions).toEqual([
      "findMessagingCampaignByOperationId",
      "createMessagingCampaign",
      "findMessagingAdSetByOperationId",
      "createMessagingAdSet",
      "findMessagingAdCreativeByOperationId",
      "createMessagingAdCreative",
      "findMessagingAdByOperationId",
      "createMessagingAd",
    ])
    // v3 correction #8: every mutation invalidates the Graph-read cache for
    // this integration's connection scope.
    expect(mocks.invalidateMessagingAdsCache).toHaveBeenCalledWith(
      "messenger:im_1",
    )
  })

  test("marks the connection invalid on a Graph 190 (expired token) error", async () => {
    const record = baseRecord()
    mocks.createOp.mockResolvedValue(record)
    mocks.getGraphErrorCode.mockReturnValue(190)
    mocks.runAction.mockImplementation((action: string) => {
      if (action === "findMessagingCampaignByOperationId") {
        return null
      }
      if (action === "createMessagingCampaign") {
        throw new Error("token expired")
      }
      throw new Error(`unexpected action ${action}`)
    })
    mocks.updateCreateProgress.mockResolvedValue(record)

    await expect(
      messagingAdCampaignService.createDraft({
        workspaceId: "ws_1",
        channel: "messenger",
        integrationId: "im_1",
        adAccountId: "act_9",
        name: "My ad",
        campaign: { specialAdCategories: ["NONE"] },
        adSet: {
          dailyBudgetMinorUnits: 2000,
          targeting: { countries: ["US"] },
        },
        creative: {
          media: { kind: "image", imageHash: "hash", link: "https://x.com" },
          welcomeMessage: { type: "default" },
        },
      }),
    ).rejects.toThrow()

    expect(mocks.markInvalid).toHaveBeenCalledWith({
      workspaceId: "ws_1",
      channel: "messenger",
      integrationId: "im_1",
    })
    // A failed create must not be treated as a successful mutation.
    expect(mocks.invalidateMessagingAdsCache).not.toHaveBeenCalled()
  })

  test("reconcile: adopts an already-created campaign instead of duplicating it", async () => {
    const record = baseRecord()
    mocks.createOp.mockResolvedValue(record)
    accumulateCreateProgress(record)
    mocks.runAction.mockImplementation((action: string) => {
      if (action === "findMessagingCampaignByOperationId") {
        return { id: "camp_existing" }
      }
      if (action === "createMessagingCampaign") {
        throw new Error("should not create a duplicate campaign")
      }
      if (action.startsWith("find")) {
        return null
      }
      if (action === "createMessagingAdSet") {
        return { id: "adset_1" }
      }
      if (action === "createMessagingAdCreative") {
        return { id: "creative_1" }
      }
      if (action === "createMessagingAd") {
        return { id: "ad_1" }
      }
      throw new Error(`unexpected action ${action}`)
    })

    await messagingAdCampaignService.createDraft({
      workspaceId: "ws_1",
      channel: "messenger",
      integrationId: "im_1",
      adAccountId: "act_9",
      name: "My ad",
      campaign: { specialAdCategories: ["NONE"] },
      adSet: { dailyBudgetMinorUnits: 2000, targeting: { countries: ["US"] } },
      creative: {
        media: { kind: "image", imageHash: "hash", link: "https://x.com" },
        welcomeMessage: { type: "default" },
      },
    })

    expect(mocks.updateCreateProgress).toHaveBeenCalledWith(
      expect.objectContaining({ metaCampaignId: "camp_existing" }),
    )
  })

  test("on failure, persists lastError without losing already-made progress", async () => {
    const record = baseRecord({
      createState: "campaignCreated",
      metaCampaignId: "camp_1",
    })
    mocks.createOp.mockResolvedValue(record)
    mocks.updateCreateProgress.mockImplementation((input) =>
      Promise.resolve({ ...record, ...input }),
    )
    mocks.runAction.mockImplementation((action: string) => {
      if (action === "findMessagingAdSetByOperationId") {
        return null
      }
      if (action === "createMessagingAdSet") {
        throw new Error("Graph API rejected the ad set")
      }
      throw new Error(`unexpected action ${action}`)
    })

    await expect(
      messagingAdCampaignService.createDraft({
        workspaceId: "ws_1",
        channel: "messenger",
        integrationId: "im_1",
        adAccountId: "act_9",
        name: "My ad",
        campaign: { specialAdCategories: ["NONE"] },
        adSet: {
          dailyBudgetMinorUnits: 2000,
          targeting: { countries: ["US"] },
        },
        creative: {
          media: { kind: "image", imageHash: "hash", link: "https://x.com" },
          welcomeMessage: { type: "default" },
        },
      }),
    ).rejects.toThrow()

    const failureCall = mocks.updateCreateProgress.mock.calls.at(-1)?.[0]
    // On failure the op is marked "failed" so the list view offers Retry; the
    // failure write does NOT clear metaCampaignId, so the already-made progress
    // (camp_1) survives on the record and retry resumes from it.
    expect(failureCall.createState).toBe("failed")
    expect(failureCall.lastError).toBeTruthy()
    expect(failureCall.metaCampaignId).toBeUndefined()
  })
})

describe("publish", () => {
  test("activates campaign -> adSet -> ad in order", async () => {
    const record = baseRecord({
      metaCampaignId: "camp_1",
      metaAdSetId: "adset_1",
      metaAdId: "ad_1",
    })
    mocks.findByIdForWorkspace.mockResolvedValue(record)
    mocks.updatePublishState.mockImplementation((input) =>
      Promise.resolve({ ...record, ...input }),
    )
    mocks.runAction.mockResolvedValue(undefined)

    await messagingAdCampaignService.publish({
      workspaceId: "ws_1",
      operationId: "op_1",
    })

    const calls = mocks.runAction.mock.calls.map((call) => [
      call[0],
      call[1].props.status,
    ])
    expect(calls).toEqual([
      ["updateMessagingCampaignStatus", "ACTIVE"],
      ["updateMessagingAdSetStatus", "ACTIVE"],
      ["updateMessagingAdStatus", "ACTIVE"],
    ])
    expect(mocks.updatePublishState).toHaveBeenLastCalledWith(
      expect.objectContaining({ publishState: "published" }),
    )
    expect(mocks.invalidateMessagingAdsCache).toHaveBeenCalledWith(
      "messenger:im_1",
    )
  })

  test("marks the connection invalid on a Graph 190 error while activating", async () => {
    const record = baseRecord({
      metaCampaignId: "camp_1",
      metaAdSetId: "adset_1",
      metaAdId: "ad_1",
    })
    mocks.findByIdForWorkspace.mockResolvedValue(record)
    mocks.updatePublishState.mockImplementation((input) =>
      Promise.resolve({ ...record, ...input }),
    )
    mocks.getGraphErrorCode.mockReturnValue(190)
    mocks.runAction.mockImplementation((action: string) => {
      if (action === "updateMessagingCampaignStatus") {
        throw new Error("token expired")
      }
      return Promise.resolve(undefined)
    })

    await messagingAdCampaignService.publish({
      workspaceId: "ws_1",
      operationId: "op_1",
    })

    expect(mocks.markInvalid).toHaveBeenCalledWith({
      workspaceId: "ws_1",
      channel: "messenger",
      integrationId: "im_1",
    })
    expect(mocks.updatePublishState).toHaveBeenLastCalledWith(
      expect.objectContaining({ publishState: "publishFailed" }),
    )
  })

  test("compensates by reverting already-activated levels when a later activation fails", async () => {
    const record = baseRecord({
      metaCampaignId: "camp_1",
      metaAdSetId: "adset_1",
      metaAdId: "ad_1",
    })
    mocks.findByIdForWorkspace.mockResolvedValue(record)
    mocks.updatePublishState.mockImplementation((input) =>
      Promise.resolve({ ...record, ...input }),
    )
    mocks.runAction.mockImplementation((action: string, _args) => {
      if (action === "updateMessagingAdStatus") {
        throw new Error("ad activation rejected")
      }
      return Promise.resolve(undefined)
    })

    await messagingAdCampaignService.publish({
      workspaceId: "ws_1",
      operationId: "op_1",
    })

    const calls = mocks.runAction.mock.calls.map((call) => [
      call[0],
      call[1].props.status,
    ])
    // campaign ACTIVE, adSet ACTIVE, ad ACTIVE (fails), then compensation
    // reverts adSet and campaign back to PAUSED.
    expect(calls).toEqual([
      ["updateMessagingCampaignStatus", "ACTIVE"],
      ["updateMessagingAdSetStatus", "ACTIVE"],
      ["updateMessagingAdStatus", "ACTIVE"],
      ["updateMessagingAdSetStatus", "PAUSED"],
      ["updateMessagingCampaignStatus", "PAUSED"],
    ])
    expect(mocks.updatePublishState).toHaveBeenLastCalledWith(
      expect.objectContaining({ publishState: "publishFailed" }),
    )
  })
})

describe("pause", () => {
  test("best-effort pauses ad, adSet, and campaign even when one call fails", async () => {
    const record = baseRecord({
      metaCampaignId: "camp_1",
      metaAdSetId: "adset_1",
      metaAdId: "ad_1",
    })
    mocks.findByIdForWorkspace.mockResolvedValue(record)
    mocks.updatePublishState.mockImplementation((input) =>
      Promise.resolve({ ...record, ...input }),
    )
    mocks.runAction.mockImplementation((action: string) => {
      if (action === "updateMessagingAdSetStatus") {
        throw new Error("rate limited")
      }
      return Promise.resolve(undefined)
    })

    await messagingAdCampaignService.pause({
      workspaceId: "ws_1",
      operationId: "op_1",
    })

    const calledActions = mocks.runAction.mock.calls.map((call) => call[0])
    // All three are attempted despite the ad set failing.
    expect(calledActions).toEqual([
      "updateMessagingAdStatus",
      "updateMessagingAdSetStatus",
      "updateMessagingCampaignStatus",
    ])
    // The thrown error text is sanitized (toPublicErrorMessage) before
    // persisting — only the failing level/id prefix is asserted here.
    expect(mocks.updatePublishState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        publishState: "paused",
        lastError: expect.stringContaining("adSet(adset_1):"),
      }),
    )
  })
})

describe("retryDraft", () => {
  test("throws (and never touches Graph) when the op cannot be claimed", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(
      baseRecord({ integrationMessengerId: "im_1", metaAdId: null }),
    )
    // A concurrent retry already claimed it (CAS returned null).
    mocks.claimForRetry.mockResolvedValue(null)

    await expect(
      messagingAdCampaignService.retryDraft({
        workspaceId: "ws_1",
        operationId: "op_1",
      }),
    ).rejects.toThrow("retryable")
    // Read-only resolution may run, but NO Graph reconcile/create is attempted —
    // the race is stopped before any Meta object is created.
    expect(mocks.runAction).not.toHaveBeenCalled()
  })

  test("invalidates the Graph-read cache on a successful resume (v3 correction #8)", async () => {
    const record = baseRecord({
      integrationMessengerId: "im_1",
      metaCampaignId: "camp_1",
      createState: "campaignCreated",
    })
    mocks.findByIdForWorkspace.mockResolvedValue(record)
    mocks.claimForRetry.mockResolvedValue(record)
    accumulateCreateProgress(record)
    mocks.runAction.mockImplementation((action: string) => {
      if (action.startsWith("find")) {
        return null
      }
      if (action === "createMessagingAdSet") {
        return { id: "adset_1" }
      }
      if (action === "createMessagingAdCreative") {
        return { id: "creative_1" }
      }
      if (action === "createMessagingAd") {
        return { id: "ad_1" }
      }
      throw new Error(`unexpected action ${action}`)
    })

    await messagingAdCampaignService.retryDraft({
      workspaceId: "ws_1",
      operationId: "op_1",
    })

    expect(mocks.invalidateMessagingAdsCache).toHaveBeenCalledWith(
      "messenger:im_1",
    )
  })
})

describe("list", () => {
  test("reports the AD's effective_status and scopes the query to the tab's channel/integration", async () => {
    const row = baseRecord({
      channel: "messenger",
      integrationMessengerId: "im_1",
      metaAdId: "ad_1",
      createState: "adCreated",
    })
    mocks.listByWorkspaceId.mockResolvedValue([row])
    mocks.listCachedMessagingAdsEffectiveStatus.mockResolvedValue([
      { id: "ad_1", effective_status: "DISAPPROVED" },
    ])

    const result = await messagingAdCampaignService.list({
      workspaceId: "ws_1",
      channel: "messenger",
      integrationId: "im_1",
    })

    // Ad-level status (rejection) surfaces — never the campaign's.
    expect(result[0]?.effectiveStatus).toBe("DISAPPROVED")
    // The repository query is scoped to this integration, not the whole workspace.
    expect(mocks.listByWorkspaceId).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws_1",
        channel: "messenger",
        integrationMessengerId: "im_1",
      }),
    )
  })

  test("degrades to a null effectiveStatus when the cached status read throws, WITHOUT re-marking invalid", async () => {
    const row = baseRecord({
      channel: "messenger",
      integrationMessengerId: "im_1",
      metaAdId: "ad_1",
      createState: "adCreated",
    })
    mocks.listByWorkspaceId.mockResolvedValue([row])
    mocks.getGraphErrorCode.mockReturnValue(190)
    mocks.listCachedMessagingAdsEffectiveStatus.mockRejectedValue(
      new Error("token expired"),
    )

    const result = await messagingAdCampaignService.list({
      workspaceId: "ws_1",
      channel: "messenger",
      integrationId: "im_1",
    })

    // List degrades to "status unknown" on any Graph read failure.
    expect(result[0]?.effectiveStatus).toBeNull()
    // The cached read (`listCachedMessagingAdsEffectiveStatus`) owns 190 ->
    // markInvalid via its own `withTokenInvalidation` wrapper; `list()` must
    // NOT re-mark it (that produced a redundant double DB write).
    expect(mocks.markInvalid).not.toHaveBeenCalled()
  })
})

describe("listInsights (ownership scoping)", () => {
  test("only forwards ad ids that belong to THIS workspace's own operations for the requested ad account", async () => {
    // The workspace owns ad_1 and ad_2 in act_9; ad_2b is in a DIFFERENT ad
    // account, and ad_evil was never created here.
    mocks.listByWorkspaceId.mockResolvedValue([
      baseRecord({ metaAdId: "ad_1", adAccountId: "act_9" }),
      baseRecord({ metaAdId: "ad_2", adAccountId: "act_9" }),
      baseRecord({ metaAdId: "ad_2b", adAccountId: "act_other" }),
      baseRecord({ metaAdId: null, adAccountId: "act_9" }),
    ])
    mocks.listCachedMessagingAdsInsights.mockResolvedValue([
      { adId: "ad_1", currency: "USD" },
    ])

    await messagingAdCampaignService.listInsights({
      workspaceId: "ws_1",
      channel: "messenger",
      integrationId: "im_1",
      adAccountId: "act_9",
      // A caller trying to read someone else's ad (ad_evil) and an ad from a
      // different account (ad_2b) — both must be filtered out.
      adIds: ["ad_1", "ad_evil", "ad_2b"],
    })

    expect(mocks.listCachedMessagingAdsInsights).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws_1",
        channel: "messenger",
        integrationId: "im_1",
        adAccountId: "act_9",
        adIds: ["ad_1"],
      }),
    )
  })

  test("returns [] and never hits Graph when NONE of the requested ids belong to the workspace", async () => {
    mocks.listByWorkspaceId.mockResolvedValue([
      baseRecord({ metaAdId: "ad_1", adAccountId: "act_9" }),
    ])

    const result = await messagingAdCampaignService.listInsights({
      workspaceId: "ws_1",
      channel: "messenger",
      integrationId: "im_1",
      adAccountId: "act_9",
      adIds: ["ad_evil"],
    })

    expect(result).toEqual([])
    expect(mocks.listCachedMessagingAdsInsights).not.toHaveBeenCalled()
  })
})
