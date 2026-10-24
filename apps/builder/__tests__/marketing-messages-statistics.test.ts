import { beforeEach, describe, expect, test, vi } from "vitest"

class FakeFacebookAdsException extends Error {}

const listAdAccountsByWorkspaceId = vi.fn()
const listForStatistics = vi.fn()
const getMarketingMessagesAdAccounts = vi.fn()
const getMarketingMessagesAdInsights = vi.fn()
const getMarketingMessagesAggregateInsights = vi.fn()
const cacheCalls: { key: string; ttl?: number }[] = []

vi.mock("@chatbotx.io/business", () => ({
  facebookMarketingMessagesService: {
    listAdAccountsByWorkspaceId,
    listForStatistics,
  },
}))
vi.mock("@chatbotx.io/integration-facebook-ads", () => ({
  FacebookAdsException: FakeFacebookAdsException,
  getMarketingMessagesAdAccounts,
  getMarketingMessagesAdInsights,
  getMarketingMessagesAggregateInsights,
}))
vi.mock("@chatbotx.io/redis", () => ({
  withCache: (key: string, fn: () => unknown, options?: { ttl?: number }) => {
    cacheCalls.push({ key, ttl: options?.ttl })
    return fn()
  },
}))
const requireValidGrant = vi.fn(() =>
  Promise.resolve({ state: "valid", accessToken: "TOKEN", version: "v25.0" }),
)
vi.mock("@/features/facebook-marketing-messages/lib/grant", () => ({
  requireValidGrant,
}))
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
}))

const { getMarketingMessagesStatistics } = await import(
  "@/features/facebook-marketing-messages/lib/statistics-operations"
)
const { statisticsPresetRange } = await import(
  "@/features/facebook-marketing-messages/lib/statistics-range"
)
const { statisticsInputSchema } = await import(
  "@/features/facebook-marketing-messages/schema/statistics"
)

const workspace = { id: "w1" } as Parameters<
  typeof getMarketingMessagesStatistics
>[0]
const now = new Date("2026-10-20T20:00:00Z")
const parse = (input: Record<string, unknown> = {}) =>
  statisticsInputSchema.parse(input)

const ALL_NULL = {
  delivered: null,
  readRate: null,
  linkClicks: null,
  linkClickRate: null,
  costPerClick: null,
  costPerDelivery: null,
  spend: null,
}

const campaignRow = (campaignId: string) => ({
  id: `row-${campaignId}`,
  campaignId,
  name: `Campaign ${campaignId}`,
  pageId: "page-1",
  currency: "VND",
})

beforeEach(() => {
  vi.clearAllMocks()
  cacheCalls.length = 0
  listAdAccountsByWorkspaceId.mockResolvedValue([
    { adAccountId: "act_2", currency: "VND", timezoneName: "Asia/Ho_Chi_Minh" },
    { adAccountId: "act_1", currency: "USD", timezoneName: null },
  ])
  getMarketingMessagesAdAccounts.mockResolvedValue([
    {
      id: "act_2",
      accountId: "2",
      name: "Shop VN",
      currency: "VND",
      timezoneName: "Asia/Ho_Chi_Minh",
      tosAccepted: {},
    },
  ])
  listForStatistics.mockResolvedValue({
    data: [campaignRow("c1"), campaignRow("c2"), campaignRow("c3")],
    total: 3,
    pageCount: 1,
  })
  getMarketingMessagesAdInsights.mockResolvedValue([
    { ...ALL_NULL, adId: "c1", currency: "VND", delivered: 16, spend: 4605 },
  ])
  getMarketingMessagesAggregateInsights.mockResolvedValue({
    ...ALL_NULL,
    currency: "VND",
    delivered: 16,
    spend: 4605,
  })
})

describe("getMarketingMessagesStatistics", () => {
  test("returns an empty result when the workspace has no campaigns", async () => {
    listAdAccountsByWorkspaceId.mockResolvedValue([])

    const result = await getMarketingMessagesStatistics(workspace, parse(), now)

    expect(result).toMatchObject({
      adAccountId: null,
      adAccounts: [],
      rows: [],
      aggregate: null,
      aggregateUnavailable: false,
    })
    expect(listForStatistics).not.toHaveBeenCalled()
    expect(getMarketingMessagesAdInsights).not.toHaveBeenCalled()
  })

  test("defaults to the newest campaign's ad account and last 30 days in its timezone", async () => {
    const result = await getMarketingMessagesStatistics(workspace, parse(), now)

    const expected = statisticsPresetRange("last30", "Asia/Ho_Chi_Minh", now)
    expect(result.adAccountId).toBe("act_2")
    expect(result.timezone).toBe("Asia/Ho_Chi_Minh")
    expect({ since: result.since, until: result.until }).toEqual(expected)
    expect(getMarketingMessagesAdInsights).toHaveBeenCalledWith(
      expect.objectContaining({ adAccountId: "act_2", ...expected }),
    )
  })

  test("uses Meta timezone when the grant sees the account, else the stored one, else UTC", async () => {
    getMarketingMessagesAdAccounts.mockResolvedValue([
      {
        id: "act_2",
        accountId: "2",
        currency: "VND",
        timezoneName: "America/Los_Angeles",
        tosAccepted: {},
      },
    ])
    const fromMeta = await getMarketingMessagesStatistics(
      workspace,
      parse(),
      now,
    )
    expect(fromMeta.timezone).toBe("America/Los_Angeles")

    getMarketingMessagesAdAccounts.mockResolvedValue([])
    const fromStored = await getMarketingMessagesStatistics(
      workspace,
      parse(),
      now,
    )
    expect(fromStored.timezone).toBe("Asia/Ho_Chi_Minh")

    const fallback = await getMarketingMessagesStatistics(
      workspace,
      parse({ adAccountId: "act_1" }),
      now,
    )
    expect(fallback.timezone).toBe("UTC")
  })

  test("rejects an adAccountId the workspace has no campaigns on", async () => {
    await expect(
      getMarketingMessagesStatistics(
        workspace,
        parse({ adAccountId: "act_999" }),
        now,
      ),
    ).rejects.toMatchObject({ httpStatusCode: 400 })
    expect(getMarketingMessagesAdInsights).not.toHaveBeenCalled()
  })

  test("rejects since after until and ranges over 37 months", async () => {
    await expect(
      getMarketingMessagesStatistics(
        workspace,
        parse({ since: "2026-10-21", until: "2026-10-20" }),
        now,
      ),
    ).rejects.toMatchObject({ httpStatusCode: 400 })
    await expect(
      getMarketingMessagesStatistics(
        workspace,
        parse({ since: "2020-01-01", until: "2026-10-20" }),
        now,
      ),
    ).rejects.toMatchObject({ httpStatusCode: 400 })
    expect(getMarketingMessagesAdInsights).not.toHaveBeenCalled()
  })

  test("returns empty rows and null aggregate without calling Graph when the page is empty", async () => {
    listForStatistics.mockResolvedValue({ data: [], total: 0, pageCount: 0 })

    const result = await getMarketingMessagesStatistics(
      workspace,
      parse({ search: "nothing" }),
      now,
    )

    expect(result.rows).toEqual([])
    expect(result.aggregate).toBeNull()
    expect(getMarketingMessagesAdInsights).not.toHaveBeenCalled()
    expect(getMarketingMessagesAggregateInsights).not.toHaveBeenCalled()
  })

  test("merges insights onto every page row; campaigns without insights get all-null metrics", async () => {
    const result = await getMarketingMessagesStatistics(workspace, parse(), now)

    expect(result.rows.map((row) => row.campaignId)).toEqual(["c1", "c2", "c3"])
    expect(result.rows[0]).toEqual({
      ...ALL_NULL,
      id: "row-c1",
      campaignId: "c1",
      name: "Campaign c1",
      pageId: "page-1",
      delivered: 16,
      spend: 4605,
    })
    expect(result.rows[1]).toMatchObject(ALL_NULL)
    expect(result.aggregate).toEqual({
      ...ALL_NULL,
      delivered: 16,
      spend: 4605,
    })
  })

  test("passes only the current page's campaign ids to both insights calls, and search/sort/paging to the listing", async () => {
    await getMarketingMessagesStatistics(
      workspace,
      parse({
        search: "hi",
        page: 2,
        perPage: 10,
        sort: "name",
        order: "desc",
      }),
      now,
    )

    expect(listForStatistics).toHaveBeenCalledWith({
      workspaceId: "w1",
      adAccountId: "act_2",
      search: "hi",
      page: 2,
      perPage: 10,
      sort: [{ id: "name", desc: true }],
    })
    for (const fn of [
      getMarketingMessagesAdInsights,
      getMarketingMessagesAggregateInsights,
    ]) {
      expect(fn).toHaveBeenCalledWith(
        expect.objectContaining({ adIds: ["c1", "c2", "c3"] }),
      )
    }
  })

  test("aggregate failure is a partial success; a rows failure fails the whole read", async () => {
    getMarketingMessagesAggregateInsights.mockRejectedValue(
      new FakeFacebookAdsException("throttled"),
    )
    const partial = await getMarketingMessagesStatistics(
      workspace,
      parse(),
      now,
    )
    expect(partial.aggregate).toBeNull()
    expect(partial.aggregateUnavailable).toBe(true)
    expect(partial.rows).toHaveLength(3)

    getMarketingMessagesAdInsights.mockRejectedValue(
      new FakeFacebookAdsException("down"),
    )
    await expect(
      getMarketingMessagesStatistics(workspace, parse(), now),
    ).rejects.toBeInstanceOf(FakeFacebookAdsException)
  })

  test("cache keys include workspaceId and the sorted campaign ids", async () => {
    await getMarketingMessagesStatistics(workspace, parse(), now)
    const first = cacheCalls.filter((call) => call.key.includes(":ad:"))

    listForStatistics.mockResolvedValue({
      data: [campaignRow("c3"), campaignRow("c2"), campaignRow("c1")],
      total: 3,
      pageCount: 1,
    })
    cacheCalls.length = 0
    await getMarketingMessagesStatistics(workspace, parse(), now)
    const second = cacheCalls.filter((call) => call.key.includes(":ad:"))

    expect(first[0]?.key).toBe(second[0]?.key)
    expect(first[0]?.key).toContain("w1")
    expect(first[0]?.key).toContain("act_2")
    expect(first[0]?.ttl).toBe(600)
    expect(cacheCalls.some((call) => call.key.includes(":account:"))).toBe(true)
  })

  test("currency comes from Meta account_currency, else the stored campaign currency", async () => {
    const fromMeta = await getMarketingMessagesStatistics(
      workspace,
      parse(),
      now,
    )
    expect(fromMeta.currency).toBe("VND")

    getMarketingMessagesAdInsights.mockResolvedValue([])
    getMarketingMessagesAggregateInsights.mockResolvedValue(null)
    const fromStored = await getMarketingMessagesStatistics(
      workspace,
      parse({ adAccountId: "act_1" }),
      now,
    )
    expect(fromStored.currency).toBe("USD")
  })

  test("adAccounts lists every workspace account with Meta name when visible, else null name", async () => {
    const result = await getMarketingMessagesStatistics(workspace, parse(), now)

    expect(result.adAccounts).toEqual([
      { id: "act_2", name: "Shop VN" },
      { id: "act_1", name: null },
    ])
  })

  test("no campaigns: empty result without touching the grant or Meta", async () => {
    listAdAccountsByWorkspaceId.mockResolvedValue([])

    const result = await getMarketingMessagesStatistics(workspace, parse(), now)

    expect(result.adAccountId).toBeNull()
    expect(requireValidGrant).not.toHaveBeenCalled()
    expect(getMarketingMessagesAdAccounts).not.toHaveBeenCalled()
  })

  test("an invalid range is a 400 before the grant or Meta is touched, even with no campaigns", async () => {
    listAdAccountsByWorkspaceId.mockResolvedValue([])

    await expect(
      getMarketingMessagesStatistics(
        workspace,
        parse({ since: "2026-10-21", until: "2026-10-20" }),
        now,
      ),
    ).rejects.toMatchObject({ httpStatusCode: 400 })
    expect(requireValidGrant).not.toHaveBeenCalled()
  })

  test("a failing ad-accounts lookup falls back to stored timezone and null names", async () => {
    getMarketingMessagesAdAccounts.mockRejectedValue(
      new FakeFacebookAdsException("down"),
    )

    const result = await getMarketingMessagesStatistics(workspace, parse(), now)

    expect(result.timezone).toBe("Asia/Ho_Chi_Minh")
    expect(result.adAccounts).toEqual([
      { id: "act_2", name: null },
      { id: "act_1", name: null },
    ])
    expect(result.rows).toHaveLength(3)
  })
})
