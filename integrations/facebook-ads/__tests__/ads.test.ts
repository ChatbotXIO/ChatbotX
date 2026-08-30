import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test } from "vitest"
import { createAd, updateAdStatus } from "../src/apis/ads"
import { DEFAULT_API_VERSION } from "../src/constants"

const BASE = "https://graph.facebook.com"
const ACCESS_TOKEN = "ADS_TOKEN"

describe("createAd", () => {
  test("creates a PAUSED ad referencing the creative id", async () => {
    let capturedBody: Record<string, unknown> = {}
    server.use(
      http.post(
        `${BASE}/${DEFAULT_API_VERSION}/act_9/ads`,
        async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>
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
    expect(capturedBody.creative).toEqual({
      creative_id: "creative_1",
    })
  })
})

describe("updateAdStatus", () => {
  test("sends the status transition as JSON", async () => {
    let capturedStatus: string | null = null
    server.use(
      http.post(`${BASE}/${DEFAULT_API_VERSION}/ad_1`, async ({ request }) => {
        capturedStatus =
          ((await request.json()) as { status?: string }).status ?? null
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
