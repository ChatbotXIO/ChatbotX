import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test } from "vitest"
import { createAd, findAdByOperationId, updateAdStatus } from "../src/apis/ads"
import { DEFAULT_API_VERSION } from "../src/constants"

const BASE = "https://graph.facebook.com"
const ACCESS_TOKEN = "ADS_TOKEN"

describe("createAd", () => {
  test("creates a PAUSED ad referencing the creative id", async () => {
    let capturedBody: Record<string, string> = {}
    server.use(
      http.post(
        `${BASE}/${DEFAULT_API_VERSION}/act_9/ads`,
        async ({ request }) => {
          capturedBody = Object.fromEntries(
            (await request.formData()).entries(),
          ) as Record<string, string>
          return HttpResponse.json({
            id: "ad_1",
            name: "Ad [cbx:op_1]",
            status: "PAUSED",
          })
        },
      ),
    )

    const result = await createAd({
      accessToken: ACCESS_TOKEN,
      adAccountId: "act_9",
      name: "Ad [cbx:op_1]",
      adSetId: "adset_1",
      creativeId: "creative_1",
    })

    expect(result.id).toBe("ad_1")
    expect(capturedBody).toMatchObject({
      name: "Ad [cbx:op_1]",
      adset_id: "adset_1",
      status: "PAUSED",
    })
    // `creative` is a JSON-string form field
    expect(JSON.parse(capturedBody.creative ?? "{}")).toEqual({
      creative_id: "creative_1",
    })
  })
})

describe("findAdByOperationId", () => {
  test("scopes the reconcile query to the found ad set's ads edge", async () => {
    server.use(
      http.get(`${BASE}/${DEFAULT_API_VERSION}/adset_1/ads`, () =>
        HttpResponse.json({
          data: [{ id: "ad_existing", name: "x [cbx:op_1]", status: "PAUSED" }],
        }),
      ),
    )

    const found = await findAdByOperationId({
      accessToken: ACCESS_TOKEN,
      adSetId: "adset_1",
      operationId: "op_1",
    })

    expect(found?.id).toBe("ad_existing")
  })
})

describe("updateAdStatus", () => {
  test("sends the status transition as a multipart form field", async () => {
    let capturedStatus: string | null = null
    server.use(
      http.post(`${BASE}/${DEFAULT_API_VERSION}/ad_1`, async ({ request }) => {
        capturedStatus = (await request.formData()).get("status") as
          | string
          | null
        return HttpResponse.json({ success: true })
      }),
    )

    await updateAdStatus({
      accessToken: ACCESS_TOKEN,
      adId: "ad_1",
      status: "PAUSED",
    })

    expect(capturedStatus).toBe("PAUSED")
  })
})
