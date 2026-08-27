import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// graph-reads — the cached Graph reads for a messaging-ads box. This suite
// pins the `withTokenInvalidation` contract: a Graph 190 (expired token) on a
// cached read flips the connection to `invalid` (so the box shows "reconnect
// needed") and rethrows, on both the cold-miss path and the detached
// background refresh. `getOrRevalidate` is mocked to invoke the fetch directly
// so the wrapper is exercised without Redis.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  runAction: vi.fn(),
  getGraphErrorCode: vi.fn(() => undefined as number | undefined),
  buildMessagingAdsContext: vi.fn(() => Promise.resolve({ ctx: true })),
  markInvalid: vi.fn(() => Promise.resolve()),
  getOrRevalidate: vi.fn(
    (input: { key?: string; fetch: () => Promise<unknown> }) => input.fetch(),
  ),
}))

vi.mock("@chatbotx.io/integration-facebook-ads", () => ({
  integration: { runAction: mocks.runAction },
  getGraphErrorCode: mocks.getGraphErrorCode,
}))

vi.mock("../context", () => ({
  buildMessagingAdsContext: mocks.buildMessagingAdsContext,
}))

vi.mock("../graph-cache", () => ({
  getOrRevalidate: mocks.getOrRevalidate,
  messagingAdsCacheTag: (scope: string) => `msgads:${scope}`,
}))

vi.mock("../service", () => ({
  messagingAdsConnectionService: { markInvalid: mocks.markInvalid },
}))

const {
  listCachedMessagingAdsEffectiveStatus,
  listCachedMessagingAdAccounts,
  listCachedMessagingAdsInsights,
} = await import("../graph-reads")

const ref = {
  workspaceId: "ws_1",
  channel: "messenger" as const,
  integrationId: "im_1",
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getGraphErrorCode.mockReturnValue(undefined)
  mocks.buildMessagingAdsContext.mockResolvedValue({ ctx: true })
  mocks.getOrRevalidate.mockImplementation(
    (input: { key?: string; fetch: () => Promise<unknown> }) => input.fetch(),
  )
})

describe("withTokenInvalidation via cached reads", () => {
  test("marks the connection invalid AND rethrows on a Graph 190", async () => {
    mocks.getGraphErrorCode.mockReturnValue(190)
    mocks.runAction.mockRejectedValue(new Error("token expired"))

    await expect(
      listCachedMessagingAdsEffectiveStatus({ ...ref, adIds: ["ad_1"] }),
    ).rejects.toThrow("token expired")
    expect(mocks.markInvalid).toHaveBeenCalledWith(ref)
  })

  test("does NOT mark invalid on a non-190 error", async () => {
    mocks.getGraphErrorCode.mockReturnValue(100)
    mocks.runAction.mockRejectedValue(new Error("some other error"))

    await expect(listCachedMessagingAdAccounts(ref)).rejects.toThrow(
      "some other error",
    )
    expect(mocks.markInvalid).not.toHaveBeenCalled()
  })

  test("background refresh (getOrRevalidate swallows the throw) still marks invalid exactly once on a 190", async () => {
    // Simulate the stale-serve path: getOrRevalidate serves a stale value and
    // runs the fetch as a detached refresh whose rejection it swallows+logs.
    // The 190->markInvalid must still fire (inside the fetch, before the swallow).
    const staleValue = [{ id: "ad_1", effective_status: "PAUSED" }]
    mocks.getOrRevalidate.mockImplementation(
      async (input: { key?: string; fetch: () => Promise<unknown> }) => {
        try {
          await input.fetch()
        } catch {
          // getOrRevalidate's background-refresh .catch — swallowed here.
        }
        return staleValue
      },
    )
    mocks.getGraphErrorCode.mockReturnValue(190)
    mocks.runAction.mockRejectedValue(new Error("token expired"))

    const result = await listCachedMessagingAdsEffectiveStatus({
      ...ref,
      adIds: ["ad_1"],
    })

    // Stale value is still served (no throw into the request path)...
    expect(result).toEqual(staleValue)
    // ...and the connection was flagged invalid exactly once.
    expect(mocks.markInvalid).toHaveBeenCalledTimes(1)
    expect(mocks.markInvalid).toHaveBeenCalledWith(ref)
  })

  test("passes through the value on success without marking invalid", async () => {
    mocks.runAction.mockResolvedValue([
      { id: "ad_1", effective_status: "ACTIVE" },
    ])

    const result = await listCachedMessagingAdsEffectiveStatus({
      ...ref,
      adIds: ["ad_1"],
    })
    expect(result).toEqual([{ id: "ad_1", effective_status: "ACTIVE" }])
    expect(mocks.markInvalid).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// listCachedMessagingAdsInsights — the separate "Ads Insights" panel read
// (never merged into listCachedMessagingAdsEffectiveStatus / listMessagingAds
// — a SEPARATE call so the ads LIST stays fast).
// ---------------------------------------------------------------------------

describe("listCachedMessagingAdsInsights", () => {
  test("returns [] and never calls getOrRevalidate/Graph when adIds is empty", async () => {
    const result = await listCachedMessagingAdsInsights({
      ...ref,
      adAccountId: "act_9",
      adIds: [],
    })

    expect(result).toEqual([])
    expect(mocks.getOrRevalidate).not.toHaveBeenCalled()
    expect(mocks.runAction).not.toHaveBeenCalled()
  })

  test("runs getMessagingAdsInsights with adAccountId/channel/adIds/datePreset, defaulting datePreset to maximum", async () => {
    mocks.runAction.mockResolvedValue([
      {
        adId: "ad_1",
        impressions: 100,
        reach: 80,
        spend: 5,
        clicks: 3,
        conversations: 1,
        costPerConversation: 5,
      },
    ])

    const result = await listCachedMessagingAdsInsights({
      ...ref,
      adAccountId: "act_9",
      adIds: ["ad_1"],
    })

    expect(result).toEqual([
      {
        adId: "ad_1",
        impressions: 100,
        reach: 80,
        spend: 5,
        clicks: 3,
        conversations: 1,
        costPerConversation: 5,
      },
    ])
    expect(mocks.runAction).toHaveBeenCalledWith("getMessagingAdsInsights", {
      ctx: { ctx: true },
      props: {
        adAccountId: "act_9",
        adIds: ["ad_1"],
        channel: ref.channel,
        datePreset: "maximum",
      },
    })
  })

  test("passes a custom datePreset through", async () => {
    mocks.runAction.mockResolvedValue([])

    await listCachedMessagingAdsInsights({
      ...ref,
      adAccountId: "act_9",
      adIds: ["ad_1"],
      datePreset: "last_7d",
    })

    expect(mocks.runAction).toHaveBeenCalledWith(
      "getMessagingAdsInsights",
      expect.objectContaining({
        props: expect.objectContaining({ datePreset: "last_7d" }),
      }),
    )
  })

  test("cache key is stable regardless of adId input order (sorted before joining)", async () => {
    mocks.runAction.mockResolvedValue([])
    let capturedKeyA: string | undefined
    let capturedKeyB: string | undefined
    mocks.getOrRevalidate.mockImplementationOnce(
      (input: { key?: string; fetch: () => Promise<unknown> }) => {
        capturedKeyA = input.key
        return input.fetch()
      },
    )
    mocks.getOrRevalidate.mockImplementationOnce(
      (input: { key?: string; fetch: () => Promise<unknown> }) => {
        capturedKeyB = input.key
        return input.fetch()
      },
    )

    await listCachedMessagingAdsInsights({
      ...ref,
      adAccountId: "act_9",
      adIds: ["ad_2", "ad_1"],
    })
    await listCachedMessagingAdsInsights({
      ...ref,
      adAccountId: "act_9",
      adIds: ["ad_1", "ad_2"],
    })

    expect(capturedKeyA).toBe(capturedKeyB)
  })

  test("marks the connection invalid on a Graph 190", async () => {
    mocks.getGraphErrorCode.mockReturnValue(190)
    mocks.runAction.mockRejectedValue(new Error("token expired"))

    await expect(
      listCachedMessagingAdsInsights({
        ...ref,
        adAccountId: "act_9",
        adIds: ["ad_1"],
      }),
    ).rejects.toThrow("token expired")
    expect(mocks.markInvalid).toHaveBeenCalledWith(ref)
  })
})

describe("cache scope tenancy", () => {
  test("the cache key embeds the workspaceId — two workspaces NEVER share a channel:integrationId cache entry", async () => {
    // Regression guard for the cross-workspace warm-cache leak: with a key of
    // only `channel:integrationId`, workspace B could read workspace A's
    // cached ad-account list by guessing/replaying the integration id.
    mocks.runAction.mockResolvedValue([])

    await listCachedMessagingAdAccounts({ ...ref, workspaceId: "ws_A" })
    await listCachedMessagingAdAccounts({ ...ref, workspaceId: "ws_B" })

    const keys = mocks.getOrRevalidate.mock.calls.map(
      ([input]: [{ key?: string }]) => input.key,
    )
    expect(keys[0]).toContain("ws_A:")
    expect(keys[1]).toContain("ws_B:")
    expect(keys[0]).not.toBe(keys[1])
  })
})
