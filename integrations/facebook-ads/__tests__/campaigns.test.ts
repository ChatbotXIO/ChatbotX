import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test } from "vitest"
import {
  createCampaign,
  findCampaignByOperationId,
  updateCampaignStatus,
} from "../src/apis/campaigns"
import { DEFAULT_API_VERSION } from "../src/constants"

const BASE = "https://graph.facebook.com"
const ACCESS_TOKEN = "ADS_TOKEN"

describe("createCampaign", () => {
  test("creates a PAUSED, ABO, OUTCOME_ENGAGEMENT campaign", async () => {
    let capturedBody: Record<string, string> = {}

    server.use(
      http.post(
        `${BASE}/${DEFAULT_API_VERSION}/act_9/campaigns`,
        async ({ request }) => {
          // Meta create endpoints are multipart/form-data (not JSON) —
          // array/object params are JSON-string field values.
          capturedBody = Object.fromEntries(
            (await request.formData()).entries(),
          ) as Record<string, string>
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
      // "no category" -> ["NONE"] (Meta REQUIRES a non-empty value; `[]` is
      // rejected as "not provided" with "(#100) … is required").
      special_ad_categories: JSON.stringify(["NONE"]),
      status: "PAUSED",
    })
    expect(capturedBody).not.toHaveProperty("daily_budget")
  })

  test("sends real categories with the NONE marker stripped", async () => {
    let capturedBody: Record<string, string> = {}
    server.use(
      http.post(
        `${BASE}/${DEFAULT_API_VERSION}/act_9/campaigns`,
        async ({ request }) => {
          capturedBody = Object.fromEntries(
            (await request.formData()).entries(),
          ) as Record<string, string>
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

    expect(capturedBody.special_ad_categories).toBe(JSON.stringify(["HOUSING"]))
  })
})

describe("findCampaignByOperationId", () => {
  test("filters by the correlation name marker and returns the first match", async () => {
    let capturedFilter: string | null = null

    server.use(
      http.get(
        `${BASE}/${DEFAULT_API_VERSION}/act_9/campaigns`,
        ({ request }) => {
          capturedFilter = new URL(request.url).searchParams.get("filtering")
          return HttpResponse.json({
            data: [
              {
                id: "camp_existing",
                name: "Resumed [cbx:op_1]",
                status: "PAUSED",
                effective_status: "PAUSED",
              },
            ],
          })
        },
      ),
    )

    const found = await findCampaignByOperationId({
      accessToken: ACCESS_TOKEN,
      adAccountId: "act_9",
      operationId: "op_1",
    })

    expect(found?.id).toBe("camp_existing")
    expect(capturedFilter).toContain("[cbx:op_1]")
  })

  test("returns null when nothing matches (fresh operation)", async () => {
    server.use(
      http.get(`${BASE}/${DEFAULT_API_VERSION}/act_9/campaigns`, () =>
        HttpResponse.json({ data: [] }),
      ),
    )

    const found = await findCampaignByOperationId({
      accessToken: ACCESS_TOKEN,
      adAccountId: "act_9",
      operationId: "op_new",
    })

    expect(found).toBeNull()
  })
})

describe("updateCampaignStatus", () => {
  test("sends the status transition as a multipart form field", async () => {
    let capturedStatus: string | null = null
    server.use(
      http.post(
        `${BASE}/${DEFAULT_API_VERSION}/camp_1`,
        async ({ request }) => {
          capturedStatus = (await request.formData()).get("status") as
            | string
            | null
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
