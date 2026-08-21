// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"
import {
  getCachedAdAccounts,
  getCachedAdInsights,
  getCachedCustomAudiences,
  getCachedDailyAdInsights,
  getFacebookAdsContext,
} from "../src/features/integration-facebook-ads/queries"

const mocks = vi.hoisted(() => ({
  buildContext: vi.fn(),
  decryptObject: vi.fn(),
  findByWorkspaceIdOrFail: vi.fn(),
  runAction: vi.fn(),
  cache: new Map<string, unknown>(),
  cacheKeys: [] as string[],
}))

vi.mock("@chatbotx.io/business", () => ({
  buildContext: mocks.buildContext,
  integrationFacebookAdsService: {
    findByWorkspaceIdOrFail: mocks.findByWorkspaceIdOrFail,
  },
}))

vi.mock("@chatbotx.io/encryption", () => ({
  encryptedDataSchema: {
    parse: (value: unknown) => value,
  },
  encryptUtils: {
    decryptObject: mocks.decryptObject,
  },
}))

vi.mock("@chatbotx.io/integration-facebook-ads", () => ({
  facebookAdsAuthSchema: {},
  integration: {
    runAction: mocks.runAction,
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  withCache: async <T>(
    key: string,
    loader: () => Promise<T>,
    _options: { ttl: number },
  ) => {
    mocks.cacheKeys.push(key)
    if (mocks.cache.has(key)) {
      return mocks.cache.get(key) as T
    }

    const value = await loader()
    mocks.cache.set(key, value)
    return value
  },
}))

describe("Facebook Ads cached queries", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.cache.clear()
    mocks.cacheKeys.length = 0
    mocks.buildContext.mockImplementation((input) => ({ ctx: input }))
    mocks.decryptObject.mockResolvedValue({ accessToken: "token" })
    mocks.findByWorkspaceIdOrFail.mockImplementation((workspaceId: string) =>
      Promise.resolve({
        id: `facebook-ads-${workspaceId}`,
        workspaceId,
        auth: { encrypted: true },
      }),
    )
    mocks.runAction.mockImplementation((action: string) => {
      if (action === "getAdAccounts") {
        return Promise.resolve([{ id: "act_1", name: "One" }])
      }
      if (action === "getAdInsights") {
        return Promise.resolve([{ ad_id: "ad-1", spend: "1.00" }])
      }
      if (action === "getCustomAudiences") {
        return Promise.resolve([{ id: "aud-1", name: "Audience" }])
      }
      throw new Error(`Unexpected action: ${action}`)
    })
  })

  test("caches ad accounts for the same workspace", async () => {
    await getCachedAdAccounts("ws-1")
    await getCachedAdAccounts("ws-1")

    expect(mocks.cacheKeys).toEqual([
      "fb-ads:ad-accounts:ws-1",
      "fb-ads:ad-accounts:ws-1",
    ])
    expect(mocks.runAction).toHaveBeenCalledTimes(1)
    expect(mocks.runAction).toHaveBeenCalledWith("getAdAccounts", {
      ctx: expect.objectContaining({
        ctx: expect.objectContaining({ workspaceId: "ws-1" }),
      }),
    })
  })

  test("scopes ad account and insight cache keys by workspace", async () => {
    await getCachedAdAccounts("ws-1")
    await getCachedAdAccounts("ws-2")
    await getCachedAdInsights({
      workspaceId: "ws-1",
      adAccountId: "act_1",
      since: "2026-08-01",
      until: "2026-08-11",
      getContext: () => getFacebookAdsContext("ws-1"),
    })
    await getCachedAdInsights({
      workspaceId: "ws-2",
      adAccountId: "act_1",
      since: "2026-08-01",
      until: "2026-08-11",
      getContext: () => getFacebookAdsContext("ws-2"),
    })

    expect(mocks.cacheKeys).toContain("fb-ads:ad-accounts:ws-1")
    expect(mocks.cacheKeys).toContain("fb-ads:ad-accounts:ws-2")
    expect(mocks.cacheKeys).toContain(
      "fb-ads:insights:v2:ws-1:act_1:2026-08-01:2026-08-11",
    )
    expect(mocks.cacheKeys).toContain(
      "fb-ads:insights:v2:ws-2:act_1:2026-08-01:2026-08-11",
    )
    expect(new Set(mocks.cacheKeys).size).toBe(mocks.cacheKeys.length)
    expect(mocks.runAction).toHaveBeenCalledTimes(4)
  })

  test("uses a separate cache key namespace for daily insights and forwards timeIncrement", async () => {
    await getCachedAdInsights({
      workspaceId: "ws-1",
      adAccountId: "act_1",
      since: "2026-08-01",
      until: "2026-08-11",
      getContext: () => getFacebookAdsContext("ws-1"),
    })
    await getCachedDailyAdInsights({
      workspaceId: "ws-1",
      adAccountId: "act_1",
      since: "2026-08-01",
      until: "2026-08-11",
      getContext: () => getFacebookAdsContext("ws-1"),
    })

    expect(mocks.cacheKeys).toEqual([
      "fb-ads:insights:v2:ws-1:act_1:2026-08-01:2026-08-11",
      "fb-ads:insights-daily:v1:ws-1:act_1:2026-08-01:2026-08-11",
    ])
    expect(mocks.runAction).toHaveBeenCalledWith("getAdInsights", {
      ctx: expect.objectContaining({
        ctx: expect.objectContaining({ workspaceId: "ws-1" }),
      }),
      props: {
        adAccountId: "act_1",
        since: "2026-08-01",
        until: "2026-08-11",
        timeIncrement: 1,
      },
    })
  })

  test("scopes custom audience cache keys by workspace and ad account", async () => {
    await getCachedCustomAudiences({
      workspaceId: "ws-1",
      adAccountId: "act_1",
    })
    await getCachedCustomAudiences({
      workspaceId: "ws-1",
      adAccountId: "act_2",
    })

    expect(mocks.cacheKeys).toEqual([
      "fb-ads:custom-audiences:ws-1:act_1",
      "fb-ads:custom-audiences:ws-1:act_2",
    ])
    expect(mocks.runAction).toHaveBeenCalledTimes(2)
  })
})
