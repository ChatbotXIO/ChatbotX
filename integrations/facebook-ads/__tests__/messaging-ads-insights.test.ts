import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test } from "vitest"
import { getMessagingAdsInsightsByAdIds } from "../src/apis/insights"
import { DEFAULT_API_VERSION } from "../src/constants"
import { MESSAGING_CONVERSATION_STARTED_ACTION_TYPE_BY_CHANNEL } from "../src/messaging-ads/constants"

const BASE = "https://graph.facebook.com"
const ACCESS_TOKEN = "ADS_TOKEN"
const ACTION_TYPE =
  MESSAGING_CONVERSATION_STARTED_ACTION_TYPE_BY_CHANNEL.messenger

describe("getMessagingAdsInsightsByAdIds", () => {
  test("returns [] without calling Graph when adIds is empty", async () => {
    server.use(
      http.get(`${BASE}/${DEFAULT_API_VERSION}/act_9/insights`, () => {
        throw new Error("must not call Graph for an empty adIds list")
      }),
    )

    const result = await getMessagingAdsInsightsByAdIds({
      accessToken: ACCESS_TOKEN,
      adAccountId: "act_9",
      adIds: [],
      channel: "messenger",
    })

    expect(result).toEqual([])
  })

  test("makes ONE Graph call filtered by ad.id IN [...] for every ad, level=ad", async () => {
    let capturedParams: URLSearchParams | undefined
    let callCount = 0
    server.use(
      http.get(
        `${BASE}/${DEFAULT_API_VERSION}/act_9/insights`,
        ({ request }) => {
          callCount++
          capturedParams = new URL(request.url).searchParams
          return HttpResponse.json({ data: [] })
        },
      ),
    )

    await getMessagingAdsInsightsByAdIds({
      accessToken: ACCESS_TOKEN,
      adAccountId: "act_9",
      adIds: ["ad_1", "ad_2", "ad_3"],
      channel: "messenger",
    })

    expect(callCount).toBe(1)
    expect(capturedParams?.get("level")).toBe("ad")
    expect(capturedParams?.get("date_preset")).toBe("maximum")
    expect(JSON.parse(capturedParams?.get("filtering") ?? "[]")).toEqual([
      { field: "ad.id", operator: "IN", value: ["ad_1", "ad_2", "ad_3"] },
    ])
  })

  test("passes a custom date_preset through", async () => {
    let capturedParams: URLSearchParams | undefined
    server.use(
      http.get(
        `${BASE}/${DEFAULT_API_VERSION}/act_9/insights`,
        ({ request }) => {
          capturedParams = new URL(request.url).searchParams
          return HttpResponse.json({ data: [] })
        },
      ),
    )

    await getMessagingAdsInsightsByAdIds({
      accessToken: ACCESS_TOKEN,
      adAccountId: "act_9",
      adIds: ["ad_1"],
      channel: "messenger",
      datePreset: "last_7d",
    })

    expect(capturedParams?.get("date_preset")).toBe("last_7d")
  })

  test("parses actions[] into conversations and cost_per_action_type[] into costPerConversation", async () => {
    server.use(
      http.get(`${BASE}/${DEFAULT_API_VERSION}/act_9/insights`, () =>
        HttpResponse.json({
          data: [
            {
              ad_id: "ad_1",
              account_currency: "VND",
              impressions: "1000",
              reach: "800",
              spend: "12.5",
              clicks: "40",
              actions: [
                { action_type: "link_click", value: "40" },
                { action_type: ACTION_TYPE, value: "6" },
              ],
              cost_per_action_type: [
                { action_type: ACTION_TYPE, value: "2.083333" },
              ],
            },
          ],
        }),
      ),
    )

    const result = await getMessagingAdsInsightsByAdIds({
      accessToken: ACCESS_TOKEN,
      adAccountId: "act_9",
      adIds: ["ad_1"],
      channel: "messenger",
    })

    expect(result).toEqual([
      {
        adId: "ad_1",
        currency: "VND",
        impressions: 1000,
        reach: 800,
        spend: 12.5,
        clicks: 40,
        conversations: 6,
        costPerConversation: 2.083_333,
      },
    ])
  })

  test("defaults conversations to 0 and costPerConversation to null when the action_type is absent", async () => {
    server.use(
      http.get(`${BASE}/${DEFAULT_API_VERSION}/act_9/insights`, () =>
        HttpResponse.json({
          data: [
            {
              ad_id: "ad_1",
              impressions: "500",
              spend: "3",
              clicks: "2",
              actions: [{ action_type: "link_click", value: "2" }],
            },
          ],
        }),
      ),
    )

    const result = await getMessagingAdsInsightsByAdIds({
      accessToken: ACCESS_TOKEN,
      adAccountId: "act_9",
      adIds: ["ad_1"],
      channel: "messenger",
    })

    expect(result).toEqual([
      {
        adId: "ad_1",
        currency: null,
        impressions: 500,
        reach: 0,
        spend: 3,
        clicks: 2,
        conversations: 0,
        costPerConversation: null,
      },
    ])
  })

  test("defaults every numeric field to 0 when Meta omits it entirely (e.g. a draft/paused ad with no delivery)", async () => {
    server.use(
      http.get(`${BASE}/${DEFAULT_API_VERSION}/act_9/insights`, () =>
        HttpResponse.json({ data: [{ ad_id: "ad_1" }] }),
      ),
    )

    const result = await getMessagingAdsInsightsByAdIds({
      accessToken: ACCESS_TOKEN,
      adAccountId: "act_9",
      adIds: ["ad_1"],
      channel: "messenger",
    })

    expect(result).toEqual([
      {
        adId: "ad_1",
        currency: null,
        impressions: 0,
        reach: 0,
        spend: 0,
        clicks: 0,
        conversations: 0,
        costPerConversation: null,
      },
    ])
  })

  test("uses the per-channel action_type override", async () => {
    server.use(
      http.get(`${BASE}/${DEFAULT_API_VERSION}/act_9/insights`, () =>
        HttpResponse.json({
          data: [
            {
              ad_id: "ad_1",
              actions: [
                {
                  action_type:
                    MESSAGING_CONVERSATION_STARTED_ACTION_TYPE_BY_CHANNEL.whatsapp,
                  value: "3",
                },
              ],
            },
          ],
        }),
      ),
    )

    const result = await getMessagingAdsInsightsByAdIds({
      accessToken: ACCESS_TOKEN,
      adAccountId: "act_9",
      adIds: ["ad_1"],
      channel: "whatsapp",
    })
    expect(result[0]?.conversations).toBe(3)
  })
})
