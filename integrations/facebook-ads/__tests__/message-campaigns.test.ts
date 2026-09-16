import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test } from "vitest"
import {
  createMessageCampaign,
  getMessageCampaignAdSetId,
  updateMessageCampaign,
} from "../src/apis/message-campaigns"
import { DEFAULT_API_VERSION } from "../src/constants"

const BASE = "https://graph.facebook.com"
const ACCESS_TOKEN = "MM_TOKEN"
// Hoisted: Biome's useTopLevelRegex forbids a regex literal inside a function.
// `formatGraphError` reads `error_user_msg ?? error_user_title` — the title is a
// FALLBACK for the message, not a prefix — and prefixes Meta's numeric code.
const BUDGET_TOO_LOW = /^\(#100\) Increase the daily budget\.$/
const BUDGET_TITLE_ONLY = /^\(#100\) Budget too low$/

describe("createMessageCampaign", () => {
  test("posts a daily budget in minor units and returns the campaign id", async () => {
    let body: Record<string, unknown> = {}

    server.use(
      http.post(
        `${BASE}/${DEFAULT_API_VERSION}/act_123/message_campaign`,
        async ({ request }) => {
          body = (await request.json()) as Record<string, unknown>
          return HttpResponse.json({ id: "campaign-1" })
        },
      ),
    )

    const result = await createMessageCampaign({
      accessToken: ACCESS_TOKEN,
      adAccountId: "act_123",
      name: "Spring promo",
      pageId: "page-1",
      budgetType: "daily",
      budgetMinorUnits: 3000,
    })

    expect(result).toEqual({ id: "campaign-1" })
    expect(body).toMatchObject({
      name: "Spring promo",
      page_id: "page-1",
      daily_budget: 3000,
      access_token: ACCESS_TOKEN,
    })
    expect(body).not.toHaveProperty("lifetime_budget")
  })

  test("sends lifetime_budget when that budget type is chosen", async () => {
    let body: Record<string, unknown> = {}

    server.use(
      http.post(
        `${BASE}/${DEFAULT_API_VERSION}/act_123/message_campaign`,
        async ({ request }) => {
          body = (await request.json()) as Record<string, unknown>
          return HttpResponse.json({ id: "campaign-2" })
        },
      ),
    )

    await createMessageCampaign({
      accessToken: ACCESS_TOKEN,
      adAccountId: "act_123",
      name: "Lifetime promo",
      pageId: "page-1",
      budgetType: "lifetime",
      budgetMinorUnits: 90_000,
    })

    expect(body).toMatchObject({ lifetime_budget: 90_000 })
    expect(body).not.toHaveProperty("daily_budget")
  })

  test("never sends pixel_id, start_time or end_time", async () => {
    let body: Record<string, unknown> = {}

    server.use(
      http.post(
        `${BASE}/${DEFAULT_API_VERSION}/act_123/message_campaign`,
        async ({ request }) => {
          body = (await request.json()) as Record<string, unknown>
          return HttpResponse.json({ id: "campaign-3" })
        },
      ),
    )

    await createMessageCampaign({
      accessToken: ACCESS_TOKEN,
      adAccountId: "act_123",
      name: "Promo",
      pageId: "page-1",
      budgetType: "daily",
      budgetMinorUnits: 100,
    })

    expect(Object.keys(body).sort()).toEqual(
      ["access_token", "daily_budget", "name", "page_id"].sort(),
    )
  })

  test("surfaces Meta's human-readable error", async () => {
    server.use(
      http.post(`${BASE}/${DEFAULT_API_VERSION}/act_123/message_campaign`, () =>
        HttpResponse.json(
          {
            error: {
              code: 100,
              error_user_title: "Budget too low",
              error_user_msg: "Increase the daily budget.",
            },
          },
          { status: 400 },
        ),
      ),
    )

    await expect(
      createMessageCampaign({
        accessToken: ACCESS_TOKEN,
        adAccountId: "act_123",
        name: "Promo",
        pageId: "page-1",
        budgetType: "daily",
        budgetMinorUnits: 1,
      }),
    ).rejects.toThrow(BUDGET_TOO_LOW)
  })

  test("falls back to Meta's title when it sent no user message", async () => {
    server.use(
      http.post(`${BASE}/${DEFAULT_API_VERSION}/act_123/message_campaign`, () =>
        HttpResponse.json(
          { error: { code: 100, error_user_title: "Budget too low" } },
          { status: 400 },
        ),
      ),
    )

    await expect(
      createMessageCampaign({
        accessToken: ACCESS_TOKEN,
        adAccountId: "act_123",
        name: "Promo",
        pageId: "page-1",
        budgetType: "daily",
        budgetMinorUnits: 1,
      }),
    ).rejects.toThrow(BUDGET_TITLE_ONLY)
  })

  test("rejects a response with no campaign id instead of storing an empty one", async () => {
    server.use(
      http.post(`${BASE}/${DEFAULT_API_VERSION}/act_123/message_campaign`, () =>
        HttpResponse.json({ warning: "budget below reference" }),
      ),
    )

    await expect(
      createMessageCampaign({
        accessToken: ACCESS_TOKEN,
        adAccountId: "act_123",
        name: "Promo",
        pageId: "page-1",
        budgetType: "daily",
        budgetMinorUnits: 100,
      }),
    ).rejects.toThrow()
  })
})

describe("getMessageCampaignAdSetId", () => {
  test("reads the ad set nested under the message campaign node", async () => {
    let url: URL | undefined

    server.use(
      http.get(`${BASE}/${DEFAULT_API_VERSION}/campaign-1`, ({ request }) => {
        url = new URL(request.url)
        return HttpResponse.json({ id: "campaign-1", adset: { id: "set-9" } })
      }),
    )

    const adSetId = await getMessageCampaignAdSetId({
      accessToken: ACCESS_TOKEN,
      campaignId: "campaign-1",
    })

    expect(adSetId).toBe("set-9")
    expect(url?.searchParams.get("fields")).toBe("adset{id}")
  })

  test("throws when the node carries no ad set", async () => {
    server.use(
      http.get(`${BASE}/${DEFAULT_API_VERSION}/campaign-1`, () =>
        HttpResponse.json({ id: "campaign-1" }),
      ),
    )

    await expect(
      getMessageCampaignAdSetId({
        accessToken: ACCESS_TOKEN,
        campaignId: "campaign-1",
      }),
    ).rejects.toThrow()
  })
})

describe("updateMessageCampaign", () => {
  /**
   * The regression this guards: the budget used to be POSTed to the message
   * campaign id, which is an AD node and silently drops it. It must land on
   * the ad set the node points at.
   */
  function stubNodes(): {
    adSetBody: Record<string, unknown>
    nodeBody: Record<string, unknown>
  } {
    const captured = { adSetBody: {}, nodeBody: {} }

    server.use(
      http.get(`${BASE}/${DEFAULT_API_VERSION}/campaign-1`, () =>
        HttpResponse.json({ id: "campaign-1", adset: { id: "set-9" } }),
      ),
      http.post(`${BASE}/${DEFAULT_API_VERSION}/set-9`, async ({ request }) => {
        captured.adSetBody = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ success: true })
      }),
      http.post(
        `${BASE}/${DEFAULT_API_VERSION}/campaign-1`,
        async ({ request }) => {
          captured.nodeBody = (await request.json()) as Record<string, unknown>
          return HttpResponse.json({ success: true })
        },
      ),
    )

    return captured
  }

  test("posts the budget to the ad set, not to the message campaign node", async () => {
    const captured = stubNodes()

    await updateMessageCampaign({
      accessToken: ACCESS_TOKEN,
      campaignId: "campaign-1",
      name: "Renamed",
      budgetType: "lifetime",
      budgetMinorUnits: 50_000,
    })

    expect(captured.adSetBody).toMatchObject({
      lifetime_budget: 50_000,
      access_token: ACCESS_TOKEN,
    })
    expect(captured.adSetBody).not.toHaveProperty("name")
  })

  test("posts a daily budget to the ad set", async () => {
    const captured = stubNodes()

    await updateMessageCampaign({
      accessToken: ACCESS_TOKEN,
      campaignId: "campaign-1",
      name: "Renamed",
      budgetType: "daily",
      budgetMinorUnits: 2500,
    })

    expect(captured.adSetBody).toMatchObject({ daily_budget: 2500 })
  })

  test("posts the name to the message campaign node without any budget field", async () => {
    const captured = stubNodes()

    await updateMessageCampaign({
      accessToken: ACCESS_TOKEN,
      campaignId: "campaign-1",
      name: "Renamed",
      budgetType: "lifetime",
      budgetMinorUnits: 50_000,
    })

    expect(captured.nodeBody).toMatchObject({
      name: "Renamed",
      access_token: ACCESS_TOKEN,
    })
    expect(captured.nodeBody).not.toHaveProperty("lifetime_budget")
    expect(captured.nodeBody).not.toHaveProperty("daily_budget")
  })

  test("does not rename when Meta rejects the budget", async () => {
    let renamed = false

    server.use(
      http.get(`${BASE}/${DEFAULT_API_VERSION}/campaign-1`, () =>
        HttpResponse.json({ id: "campaign-1", adset: { id: "set-9" } }),
      ),
      http.post(`${BASE}/${DEFAULT_API_VERSION}/set-9`, () =>
        HttpResponse.json(
          { error: { message: "Budget too low", code: 100 } },
          { status: 400 },
        ),
      ),
      http.post(`${BASE}/${DEFAULT_API_VERSION}/campaign-1`, () => {
        renamed = true
        return HttpResponse.json({ success: true })
      }),
    )

    await expect(
      updateMessageCampaign({
        accessToken: ACCESS_TOKEN,
        campaignId: "campaign-1",
        name: "Renamed",
        budgetType: "daily",
        budgetMinorUnits: 1,
      }),
    ).rejects.toThrow()
    expect(renamed).toBe(false)
  })
})
