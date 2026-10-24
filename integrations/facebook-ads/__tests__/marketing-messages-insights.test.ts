import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test } from "vitest"
import {
  getMarketingMessagesAdInsights,
  getMarketingMessagesAggregateInsights,
} from "../src/apis/marketing-messages-insights"
import { DEFAULT_API_VERSION } from "../src/constants"
import { FacebookAdsException } from "../src/exception"

const BASE = "https://graph.facebook.com"
const ENDPOINT = `${BASE}/${DEFAULT_API_VERSION}/act_9/insights`

const input = {
  accessToken: "MM_TOKEN",
  adAccountId: "act_9",
  adIds: ["c1", "c2"],
  since: "2026-09-21",
  until: "2026-10-20",
}

const METRIC_FIELDS = [
  "marketing_messages_delivered",
  "marketing_messages_read_rate",
  "marketing_messages_link_btn_click",
  "marketing_messages_link_btn_click_rate",
  "marketing_messages_cost_per_link_btn_click",
  "marketing_messages_cost_per_delivered",
  "marketing_messages_spend",
]

const ALL_NULL = {
  delivered: null,
  readRate: null,
  linkClicks: null,
  linkClickRate: null,
  costPerClick: null,
  costPerDelivery: null,
  spend: null,
}

function captureRequests(data: unknown[] = []) {
  const requests: URLSearchParams[] = []
  server.use(
    http.get(ENDPOINT, ({ request }) => {
      requests.push(new URL(request.url).searchParams)
      return HttpResponse.json({ data })
    }),
  )
  return requests
}

describe("getMarketingMessagesAdInsights", () => {
  test("returns [] without calling Graph when adIds is empty", async () => {
    server.use(
      http.get(ENDPOINT, () => {
        throw new Error("must not call Graph for an empty adIds list")
      }),
    )

    await expect(
      getMarketingMessagesAdInsights({ ...input, adIds: [] }),
    ).resolves.toEqual([])
  })

  test("makes ONE request at level=ad filtered by ad.id IN and every effective status", async () => {
    const requests = captureRequests()

    await getMarketingMessagesAdInsights(input)

    expect(requests).toHaveLength(1)
    const params = requests[0]
    expect(params?.get("level")).toBe("ad")
    expect(params?.get("date_preset")).toBeNull()
    expect(JSON.parse(params?.get("time_range") ?? "{}")).toEqual({
      since: "2026-09-21",
      until: "2026-10-20",
    })
    const filtering = JSON.parse(params?.get("filtering") ?? "[]")
    expect(filtering[0]).toEqual({
      field: "ad.id",
      operator: "IN",
      value: ["c1", "c2"],
    })
    // Without this, Meta silently drops paused/archived/deleted ads.
    expect(filtering[1].field).toBe("ad.effective_status")
    expect(filtering[1].value).toEqual(
      expect.arrayContaining(["ACTIVE", "PAUSED", "ARCHIVED", "DELETED"]),
    )
    const fields = params?.get("fields")?.split(",") ?? []
    expect(fields).toEqual(
      expect.arrayContaining(["ad_id", "account_currency", ...METRIC_FIELDS]),
    )
  })

  test("parses string metrics to numbers", async () => {
    captureRequests([
      {
        ad_id: "c1",
        account_currency: "VND",
        marketing_messages_delivered: "428",
        marketing_messages_read_rate: "24.766355",
        marketing_messages_link_btn_click: "9",
        marketing_messages_link_btn_click_rate: "2.102804",
        marketing_messages_cost_per_link_btn_click: "13729",
        marketing_messages_cost_per_delivered: "288",
        marketing_messages_spend: "123566",
      },
    ])

    await expect(getMarketingMessagesAdInsights(input)).resolves.toEqual([
      {
        adId: "c1",
        currency: "VND",
        delivered: 428,
        readRate: 24.766_355,
        linkClicks: 9,
        linkClickRate: 2.102_804,
        costPerClick: 13_729,
        costPerDelivery: 288,
        spend: 123_566,
      },
    ])
  })

  test("maps absent marketing_messages_* fields to null, not 0", async () => {
    captureRequests([
      { ad_id: "c1", marketing_messages_spend: "290" },
      { ad_id: "c2", marketing_messages_delivered: "0" },
    ])

    const [first, second] = await getMarketingMessagesAdInsights(input)

    expect(first).toEqual({
      ...ALL_NULL,
      adId: "c1",
      currency: null,
      spend: 290,
    })
    expect(second?.delivered).toBe(0)
    expect(second?.readRate).toBeNull()
  })

  test("a non-scalar metric becomes null without failing the other rows", async () => {
    captureRequests([
      {
        ad_id: "c1",
        marketing_messages_delivered: [{ action_type: "x", value: "3" }],
        marketing_messages_spend: "10",
      },
      { ad_id: "c2", marketing_messages_delivered: "5" },
    ])

    const [first, second] = await getMarketingMessagesAdInsights(input)

    expect(first?.delivered).toBeNull()
    expect(first?.spend).toBe(10)
    expect(second?.delivered).toBe(5)
  })

  test("rejects with FacebookAdsException on a Graph error", async () => {
    server.use(
      http.get(ENDPOINT, () =>
        HttpResponse.json(
          { error: { message: "bad", type: "OAuthException", code: 100 } },
          { status: 400 },
        ),
      ),
    )

    await expect(getMarketingMessagesAdInsights(input)).rejects.toBeInstanceOf(
      FacebookAdsException,
    )
  })
})

describe("getMarketingMessagesAggregateInsights", () => {
  test("returns null without calling Graph when adIds is empty", async () => {
    server.use(
      http.get(ENDPOINT, () => {
        throw new Error("must not call Graph for an empty adIds list")
      }),
    )

    await expect(
      getMarketingMessagesAggregateInsights({ ...input, adIds: [] }),
    ).resolves.toBeNull()
  })

  test("uses level=account with the same filter and returns the single row", async () => {
    const requests = captureRequests([
      {
        account_currency: "USD",
        marketing_messages_delivered: "513",
        marketing_messages_read_rate: "29.6",
        marketing_messages_spend: "38.87",
      },
    ])

    const result = await getMarketingMessagesAggregateInsights(input)

    expect(requests).toHaveLength(1)
    expect(requests[0]?.get("level")).toBe("account")
    expect(requests[0]?.get("fields")?.split(",")).not.toContain("ad_id")
    expect(JSON.parse(requests[0]?.get("filtering") ?? "[]")[0].value).toEqual([
      "c1",
      "c2",
    ])
    expect(result).toEqual({
      ...ALL_NULL,
      currency: "USD",
      delivered: 513,
      readRate: 29.6,
      spend: 38.87,
    })
  })

  test("returns null when Meta returns no rows", async () => {
    captureRequests([])

    await expect(
      getMarketingMessagesAggregateInsights(input),
    ).resolves.toBeNull()
  })
})
