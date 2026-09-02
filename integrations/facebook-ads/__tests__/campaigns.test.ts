import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test } from "vitest"
import { createCampaign, updateCampaignStatus } from "../src/apis/campaigns"
import { DEFAULT_API_VERSION } from "../src/constants"

const BASE = "https://graph.facebook.com"
const ACCESS_TOKEN = "ADS_TOKEN"

describe("createCampaign", () => {
  test("creates a PAUSED, ABO, OUTCOME_ENGAGEMENT campaign", async () => {
    let capturedBody: Record<string, unknown> = {}
    let contentType = ""

    server.use(
      http.post(
        `${BASE}/${DEFAULT_API_VERSION}/act_9/campaigns`,
        async ({ request }) => {
          contentType = request.headers.get("content-type") ?? ""
          capturedBody = (await request.json()) as Record<string, unknown>
          return HttpResponse.json({
            id: "camp_1",
            name: "My Campaign [cbx:op_1]",
            status: "PAUSED",
          })
        },
      ),
    )

    const result = await createCampaign({
      accessToken: ACCESS_TOKEN,
      adAccountId: "act_9",
      name: "My Campaign [cbx:op_1]",
      specialAdCategories: ["NONE"],
    })

    expect(result.id).toBe("camp_1")
    expect(capturedBody).toMatchObject({
      objective: "OUTCOME_ENGAGEMENT",
      buying_type: "AUCTION",
      // Meta requires the documented NONE sentinel for no special category.
      special_ad_categories: ["NONE"],
      is_adset_budget_sharing_enabled: false,
      status: "PAUSED",
    })
    expect(contentType).toContain("application/json")
    expect(capturedBody).not.toHaveProperty("daily_budget")
  })

  test("sends real categories with the NONE marker stripped", async () => {
    let capturedBody: Record<string, unknown> = {}
    server.use(
      http.post(
        `${BASE}/${DEFAULT_API_VERSION}/act_9/campaigns`,
        async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>
          return HttpResponse.json({ id: "camp_2" })
        },
      ),
    )

    await createCampaign({
      accessToken: ACCESS_TOKEN,
      adAccountId: "act_9",
      name: "Housing campaign [cbx:op_2]",
      // A real category mixed with the internal NONE marker → NONE stripped.
      specialAdCategories: ["HOUSING", "NONE"],
    })

    expect(capturedBody.special_ad_categories).toEqual(["HOUSING"])
  })

  test("sends every selected special ad category", async () => {
    let capturedBody: Record<string, unknown> = {}
    server.use(
      http.post(
        `${BASE}/${DEFAULT_API_VERSION}/act_9/campaigns`,
        async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>
          return HttpResponse.json({ id: "camp_3" })
        },
      ),
    )

    await createCampaign({
      accessToken: ACCESS_TOKEN,
      adAccountId: "act_9",
      name: "Housing and employment campaign [cbx:op_3]",
      specialAdCategories: ["HOUSING", "EMPLOYMENT"],
    })

    expect(capturedBody.special_ad_categories).toEqual([
      "HOUSING",
      "EMPLOYMENT",
    ])
  })
})

describe("updateCampaignStatus", () => {
  test("sends the status transition as JSON", async () => {
    let capturedStatus: string | null = null
    server.use(
      http.post(
        `${BASE}/${DEFAULT_API_VERSION}/camp_1`,
        async ({ request }) => {
          capturedStatus =
            ((await request.json()) as { status?: string }).status ?? null
          return HttpResponse.json({ success: true })
        },
      ),
    )

    await updateCampaignStatus({
      accessToken: ACCESS_TOKEN,
      campaignId: "camp_1",
      status: "ACTIVE",
    })

    expect(capturedStatus).toBe("ACTIVE")
  })
})
