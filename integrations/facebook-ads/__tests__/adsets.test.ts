import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test } from "vitest"
import { createAdSet, findAdSetByOperationId } from "../src/apis/adsets"
import { DEFAULT_API_VERSION } from "../src/constants"
import { buildPromotedObject } from "../src/messaging-ads/constants"

const BASE = "https://graph.facebook.com"
const ACCESS_TOKEN = "ADS_TOKEN"

describe("createAdSet", () => {
  test("sends the daily budget as an integer minor-unit and the derived destination/promoted_object", async () => {
    let capturedBody: Record<string, string> = {}

    server.use(
      http.post(
        `${BASE}/${DEFAULT_API_VERSION}/act_9/adsets`,
        async ({ request }) => {
          capturedBody = Object.fromEntries(
            (await request.formData()).entries(),
          ) as Record<string, string>
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
      // budget is a string minor-unit in the form body
      daily_budget: "2000",
      destination_type: "WHATSAPP",
      status: "PAUSED",
    })
    // objects are JSON-string form fields
    expect(JSON.parse(capturedBody.promoted_object ?? "{}")).toEqual({
      page_id: "pg_1",
      whatsapp_phone_number: "15550001234",
    })
    expect(JSON.parse(capturedBody.targeting ?? "{}")).toEqual({
      geo_locations: { countries: ["US"] },
    })
  })
})

describe("findAdSetByOperationId", () => {
  test("scopes the reconcile query to the found campaign's adsets edge", async () => {
    let hitPath = ""
    server.use(
      http.get(
        `${BASE}/${DEFAULT_API_VERSION}/camp_1/adsets`,
        ({ request }) => {
          hitPath = new URL(request.url).pathname
          return HttpResponse.json({
            data: [
              { id: "adset_existing", name: "x [cbx:op_1]", status: "PAUSED" },
            ],
          })
        },
      ),
    )

    const found = await findAdSetByOperationId({
      accessToken: ACCESS_TOKEN,
      campaignId: "camp_1",
      operationId: "op_1",
    })

    expect(found?.id).toBe("adset_existing")
    expect(hitPath).toContain("/camp_1/adsets")
  })
})
