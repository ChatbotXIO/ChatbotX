import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test } from "vitest"
import {
  AudienceUploadError,
  createMarketingMessagesAudience,
  deleteCustomAudience,
  getMarketingMessagesAudiences,
  getNotificationMessageTokenAudienceIds,
  uploadAudienceUsersSession,
} from "../src/apis/marketing-messages-audiences"
import { DEFAULT_API_VERSION } from "../src/constants"

const BASE = `https://graph.facebook.com/${DEFAULT_API_VERSION}`

describe("createMarketingMessagesAudience", () => {
  test("sends the Marketing Messages audience body", async () => {
    let body: unknown
    server.use(
      http.post(`${BASE}/act_9/customaudiences`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ id: "aud_1" })
      }),
    )
    await expect(
      createMarketingMessagesAudience({
        accessToken: "T",
        adAccountId: "act_9",
        pageId: "page_1",
        name: "VIP",
        description: "desc",
      }),
    ).resolves.toEqual({ id: "aud_1" })
    expect(body).toEqual({
      subtype: "CUSTOM",
      customer_file_source: "USER_PROVIDED_ONLY",
      name: "VIP",
      description: "desc",
      use_for_products: ["MARKETING_MESSAGES"],
      subscription_info: ["MESSENGER"],
      marketing_message_channels: { MESSENGER: "page_1" },
    })
  })

  test("accepts the { data: [{ id }] } shape shown in Meta's guide", async () => {
    server.use(
      http.post(`${BASE}/act_9/customaudiences`, () =>
        HttpResponse.json({ data: [{ id: "aud_2" }] }),
      ),
    )
    await expect(
      createMarketingMessagesAudience({
        accessToken: "T",
        adAccountId: "act_9",
        pageId: "p",
        name: "n",
      }),
    ).resolves.toEqual({ id: "aud_2" })
  })
})

describe("uploadAudienceUsersSession", () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => [`h${i}`])

  test("splits into 10k batches inside one session", async () => {
    const bodies: Array<{
      payload: { schema: string[]; data: string[][] }
      session: Record<string, unknown>
    }> = []
    server.use(
      http.post(`${BASE}/aud_1/users`, async ({ request }) => {
        const body = (await request.json()) as (typeof bodies)[number]
        bodies.push(body)
        return HttpResponse.json({
          num_received: body.payload.data.length,
          num_invalid_entries: 1,
        })
      }),
    )
    await expect(
      uploadAudienceUsersSession({
        accessToken: "T",
        customAudienceId: "aud_1",
        schema: ["EMAIL"],
        data: rows(25_000),
        sessionId: 42,
      }),
    ).resolves.toEqual({ received: 25_000, invalid: 3 })
    expect(bodies.map((b) => b.payload.data.length)).toEqual([
      10_000, 10_000, 5000,
    ])
    expect(bodies.map((b) => b.session)).toEqual([
      {
        session_id: 42,
        batch_seq: 1,
        last_batch_flag: false,
        estimated_num_total: 25_000,
      },
      {
        session_id: 42,
        batch_seq: 2,
        last_batch_flag: false,
        estimated_num_total: 25_000,
      },
      {
        session_id: 42,
        batch_seq: 3,
        last_batch_flag: true,
        estimated_num_total: 25_000,
      },
    ])
    expect(bodies.every((b) => b.payload.schema[0] === "EMAIL")).toBe(true)
  })

  test("a failing batch throws AudienceUploadError with the totals so far", async () => {
    let call = 0
    server.use(
      http.post(`${BASE}/aud_1/users`, () => {
        call += 1
        if (call === 2) {
          return HttpResponse.json(
            {
              error: {
                code: 2650,
                message: "Failed to update the custom audience",
              },
            },
            { status: 400 },
          )
        }
        return HttpResponse.json({
          num_received: 10_000,
          num_invalid_entries: 0,
        })
      }),
    )
    const error = await uploadAudienceUsersSession({
      accessToken: "T",
      customAudienceId: "aud_1",
      schema: ["EMAIL"],
      data: rows(25_000),
    }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AudienceUploadError)
    expect(error).toMatchObject({ received: 10_000, invalid: 0 })
  })
})

describe("getMarketingMessagesAudiences", () => {
  test("filters by subtype 1010 and maps fields", async () => {
    let params: URLSearchParams | undefined
    server.use(
      http.get(`${BASE}/act_9/customaudiences`, ({ request }) => {
        params = new URL(request.url).searchParams
        return HttpResponse.json({
          data: [
            {
              id: "aud_1",
              name: "VIP",
              description: "d",
              delivery_status: { code: 300, description: "Audience too small" },
              operation_status: { code: 200, description: "Normal" },
              approximate_count_lower_bound: 1000,
              approximate_count_upper_bound: 1200,
              messenger_marketing_messages_page: { id: "page_1" },
            },
            { id: "aud_2", name: "Empty" },
          ],
        })
      }),
    )
    const result = await getMarketingMessagesAudiences({
      accessToken: "T",
      adAccountId: "act_9",
    })
    expect(JSON.parse(params?.get("filtering") ?? "[]")).toEqual([
      { field: "data_source.subtype", operator: "IN", value: [1010] },
    ])
    expect(params?.get("fields")).toContain("approximate_count_lower_bound")
    expect(result).toEqual([
      {
        id: "aud_1",
        name: "VIP",
        description: "d",
        deliveryStatus: { code: 300, description: "Audience too small" },
        operationStatus: { code: 200, description: "Normal" },
        approximateCountLowerBound: 1000,
        approximateCountUpperBound: 1200,
        pageId: "page_1",
      },
      {
        id: "aud_2",
        name: "Empty",
        description: null,
        deliveryStatus: null,
        operationStatus: null,
        approximateCountLowerBound: null,
        approximateCountUpperBound: null,
        pageId: null,
      },
    ])
  })
})

describe("deleteCustomAudience", () => {
  test("deleted", async () => {
    server.use(
      http.delete(`${BASE}/aud_1`, () => HttpResponse.json({ success: true })),
    )
    await expect(
      deleteCustomAudience({ accessToken: "T", customAudienceId: "aud_1" }),
    ).resolves.toEqual({ status: "deleted" })
  })

  test("Graph 100/33 (object does not exist) is notFound", async () => {
    server.use(
      http.delete(`${BASE}/aud_1`, () =>
        HttpResponse.json(
          {
            error: {
              code: 100,
              error_subcode: 33,
              message: "Unsupported delete request",
            },
          },
          { status: 400 },
        ),
      ),
    )
    await expect(
      deleteCustomAudience({ accessToken: "T", customAudienceId: "aud_1" }),
    ).resolves.toEqual({ status: "notFound" })
  })

  test("other errors throw", async () => {
    server.use(
      http.delete(`${BASE}/aud_1`, () =>
        HttpResponse.json(
          { error: { code: 200, message: "Permissions error" } },
          { status: 403 },
        ),
      ),
    )
    await expect(
      deleteCustomAudience({ accessToken: "T", customAudienceId: "aud_1" }),
    ).rejects.toThrow()
  })
})

describe("getNotificationMessageTokenAudienceIds", () => {
  test("returns custom_audience_ids of the first token as strings", async () => {
    let params: URLSearchParams | undefined
    server.use(
      http.get(`${BASE}/page_1/notification_message_tokens`, ({ request }) => {
        params = new URL(request.url).searchParams
        return HttpResponse.json({
          data: [{ token: "x", custom_audience_ids: [123, "aud_1"] }],
        })
      }),
    )
    await expect(
      getNotificationMessageTokenAudienceIds({
        pageAccessToken: "PAGE",
        pageId: "page_1",
        customAudienceId: "aud_1",
      }),
    ).resolves.toEqual(["123", "aud_1"])
    expect(params?.get("custom_audience_ids")).toBe("aud_1")
    expect(params?.get("limit")).toBe("1")
    expect(params?.get("access_token")).toBe("PAGE")
  })

  test("no tokens yet is an empty list", async () => {
    server.use(
      http.get(`${BASE}/page_1/notification_message_tokens`, () =>
        HttpResponse.json({ data: [] }),
      ),
    )
    await expect(
      getNotificationMessageTokenAudienceIds({
        pageAccessToken: "PAGE",
        pageId: "page_1",
        customAudienceId: "aud_1",
      }),
    ).resolves.toEqual([])
  })
})
