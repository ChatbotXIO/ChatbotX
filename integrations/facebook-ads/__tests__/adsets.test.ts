import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test } from "vitest"
import { createAdSet } from "../src/apis/adsets"
import { DEFAULT_API_VERSION } from "../src/constants"
import { buildPromotedObject } from "../src/messaging-ads/constants"

const BASE = "https://graph.facebook.com"
const ACCESS_TOKEN = "ADS_TOKEN"

describe("createAdSet", () => {
  test("sends the daily budget as an integer minor-unit and the derived destination/promoted_object", async () => {
    let capturedBody: Record<string, unknown> = {}

    server.use(
      http.post(
        `${BASE}/${DEFAULT_API_VERSION}/act_9/adsets`,
        async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>
          return HttpResponse.json({
            id: "adset_1",
            name: "AdSet [cbx:op_1]",
            status: "PAUSED",
          })
        },
      ),
    )

    const result = await createAdSet({
      accessToken: ACCESS_TOKEN,
      adAccountId: "act_9",
      campaignId: "camp_1",
      name: "AdSet [cbx:op_1]",
      dailyBudgetMinorUnits: 2000,
      destinationType: "WHATSAPP",
      promotedObject: buildPromotedObject("whatsapp", {
        pageId: "pg_1",
        whatsappPhoneNumber: "15550001234",
      }),
      targeting: { geo_locations: { countries: ["US"] } },
    })

    expect(result.id).toBe("adset_1")
    expect(capturedBody).toMatchObject({
      campaign_id: "camp_1",
      daily_budget: 2000,
      destination_type: "WHATSAPP",
      status: "PAUSED",
    })
    expect(capturedBody.promoted_object).toEqual({
      page_id: "pg_1",
      whatsapp_phone_number: "15550001234",
    })
    expect(capturedBody.targeting).toEqual({
      geo_locations: { countries: ["US"] },
    })
  })
})
