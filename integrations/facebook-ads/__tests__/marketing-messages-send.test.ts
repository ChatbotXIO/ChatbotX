import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test } from "vitest"
import {
  getMessageDeliveryEstimate,
  listNotificationMessageTokens,
  sendMarketingMessage,
} from "../src/apis/marketing-messages-send"
import { DEFAULT_API_VERSION } from "../src/constants"

const BASE = "https://graph.facebook.com"
const V = DEFAULT_API_VERSION

describe("listNotificationMessageTokens", () => {
  test("follows paging.next and maps fields", async () => {
    const urls: string[] = []
    server.use(
      http.get(
        `${BASE}/${V}/page-1/notification_message_tokens`,
        ({ request }) => {
          urls.push(request.url)
          return HttpResponse.json({
            data: [
              {
                notification_messages_token: "T1",
                topic_title: "Updates and promotions",
                recipient_id: "P1",
                next_eligible_time: 1_760_000_000,
                custom_audience_ids: ["a1", 2],
              },
              { notification_messages_token: "T2" },
            ],
            paging: {
              next: `${BASE}/${V}/page-1/notification_message_tokens_p2?after=X`,
            },
          })
        },
      ),
      http.get(`${BASE}/${V}/page-1/notification_message_tokens_p2`, () =>
        HttpResponse.json({ data: [{ notification_messages_token: "T3" }] }),
      ),
    )

    const tokens = await listNotificationMessageTokens({
      pageAccessToken: "PT",
      pageId: "page-1",
    })

    expect(tokens).toHaveLength(3)
    expect(tokens[0]).toEqual({
      token: "T1",
      topicTitle: "Updates and promotions",
      psid: "P1",
      nextEligibleAt: new Date(1_760_000_000 * 1000),
      customAudienceIds: ["a1", "2"],
    })
    expect(tokens[1]).toEqual({
      token: "T2",
      topicTitle: null,
      psid: null,
      nextEligibleAt: null,
      customAudienceIds: [],
    })
    expect(new URL(urls[0] as string).searchParams.get("limit")).toBe("1000")
  })

  test("passes custom_audience_ids when given", async () => {
    let params: URLSearchParams | undefined
    server.use(
      http.get(
        `${BASE}/${V}/page-1/notification_message_tokens`,
        ({ request }) => {
          params = new URL(request.url).searchParams
          return HttpResponse.json({ data: [] })
        },
      ),
    )
    await listNotificationMessageTokens({
      pageAccessToken: "PT",
      pageId: "page-1",
      customAudienceId: "CA9",
    })
    expect(params?.get("custom_audience_ids")).toBe("CA9")
    expect(params?.get("access_token")).toBe("PT")
  })
})

const SEND_INPUT = {
  accessToken: "GRANT",
  adAccountId: "act_123",
  campaignId: "C1",
  subscriptionToken: "TOK",
  message: { text: "hi" },
}

describe("sendMarketingMessage", () => {
  test("returns trackingId on success", async () => {
    let body: Record<string, any> = {}
    server.use(
      http.post(`${BASE}/${V}/act_123/messages`, async ({ request }) => {
        body = (await request.json()) as Record<string, any>
        return HttpResponse.json({
          success: true,
          marketing_message_tracking_id: "t-1",
        })
      }),
    )
    const result = await sendMarketingMessage(SEND_INPUT)
    expect(result).toEqual({ ok: true, trackingId: "t-1" })
    expect(body.message_id).toBe("C1")
    expect(body.messenger_delivery_data.subscription_token).toBe("TOK")
    expect(body.message).toEqual({ text: "hi" })
  })

  test("maps a Graph 400 to kind meta with code 2300054", async () => {
    server.use(
      http.post(`${BASE}/${V}/act_123/messages`, () =>
        HttpResponse.json(
          { error: { code: 2_300_054, error_subcode: 5, message: "budget" } },
          { status: 400 },
        ),
      ),
    )
    const result = await sendMarketingMessage(SEND_INPUT)
    expect(result).toMatchObject({
      ok: false,
      kind: "meta",
      code: 2_300_054,
      subcode: 5,
    })
  })

  test("maps HTTP 429 without a Graph code to kind meta with httpStatus 429", async () => {
    server.use(
      http.post(`${BASE}/${V}/act_123/messages`, () =>
        HttpResponse.json({}, { status: 429 }),
      ),
    )
    const result = await sendMarketingMessage(SEND_INPUT)
    expect(result).toMatchObject({
      ok: false,
      kind: "meta",
      code: null,
      httpStatus: 429,
    })
  })

  test("maps HTTP 408 to kind uncertain (the send may have landed)", async () => {
    server.use(
      http.post(`${BASE}/${V}/act_123/messages`, () =>
        HttpResponse.json({}, { status: 408 }),
      ),
    )
    const result = await sendMarketingMessage(SEND_INPUT)
    expect(result).toMatchObject({ ok: false, kind: "uncertain" })
  })

  test("maps HTTP 503 to kind uncertain", async () => {
    server.use(
      http.post(`${BASE}/${V}/act_123/messages`, () =>
        HttpResponse.json({}, { status: 503 }),
      ),
    )
    const result = await sendMarketingMessage(SEND_INPUT)
    expect(result).toMatchObject({ ok: false, kind: "uncertain" })
  })

  test("maps a network error to kind uncertain", async () => {
    server.use(
      http.post(`${BASE}/${V}/act_123/messages`, () => HttpResponse.error()),
    )
    const result = await sendMarketingMessage(SEND_INPUT)
    expect(result).toMatchObject({ ok: false, kind: "uncertain" })
  })
})

describe("getMessageDeliveryEstimate", () => {
  test("returns upper/lower", async () => {
    let params: URLSearchParams | undefined
    server.use(
      http.get(
        `${BASE}/${V}/act_123/message_delivery_estimate`,
        ({ request }) => {
          params = new URL(request.url).searchParams
          return HttpResponse.json({
            data: [
              {
                estimate_delivery_lower_bound: 16,
                estimate_delivery_upper_bound: 122,
              },
            ],
          })
        },
      ),
    )
    const result = await getMessageDeliveryEstimate({
      accessToken: "G",
      adAccountId: "123",
      pageId: "PAGE",
      dailyBudgetMinorUnits: 3000,
    })
    expect(result).toEqual({ deliveryLower: 16, deliveryUpper: 122 })
    expect(params?.get("daily_budget")).toBe("3000")
    expect(params?.get("is_direct_send_campaign")).toBe("true")
    expect(params?.get("pacing_type")).toBe("no_pacing")
    expect(JSON.parse(params?.get("promoted_object") ?? "{}")).toEqual({
      page_id: "PAGE",
    })
    expect(JSON.parse(params?.get("targeting_spec") ?? "{}")).toEqual({
      messenger_positions: ["marketing_messages"],
      publisher_platforms: ["messenger"],
    })
  })
})
