import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test, vi } from "vitest"
import { getAdInsights } from "../src/apis/insights"
import { DEFAULT_API_VERSION, MAX_GRAPH_PAGES } from "../src/constants"
import { facebookAdsLogger } from "../src/logger"

const BASE = "https://graph.facebook.com"
const ACCESS_TOKEN = "ADS_TOKEN"

describe("getAdInsights", () => {
  test("parses string spend/impressions/clicks and sends the ad-level time range", async () => {
    let capturedTimeRange: string | null = null
    let capturedFields: string | null = null
    let capturedLevel: string | null = null

    server.use(
      http.get(
        `${BASE}/${DEFAULT_API_VERSION}/act_9/insights`,
        ({ request }) => {
          const url = new URL(request.url)
          capturedTimeRange = url.searchParams.get("time_range")
          capturedFields = url.searchParams.get("fields")
          capturedLevel = url.searchParams.get("level")

          return HttpResponse.json({
            data: [
              {
                ad_id: "ad-1",
                ad_name: "Spring",
                spend: "12.34",
                impressions: "1000",
                clicks: "40",
              },
            ],
          })
        },
      ),
    )

    const insights = await getAdInsights({
      accessToken: ACCESS_TOKEN,
      adAccountId: "act_9",
      since: "2026-08-01",
      until: "2026-08-10",
    })

    expect(insights).toEqual([
      {
        ad_id: "ad-1",
        ad_name: "Spring",
        spend: 12.34,
        impressions: 1000,
        clicks: 40,
      },
    ])
    expect(capturedFields).toBe("ad_id,ad_name,spend,impressions,clicks")
    expect(capturedLevel).toBe("ad")
    expect(capturedTimeRange).toBe(
      JSON.stringify({ since: "2026-08-01", until: "2026-08-10" }),
    )
  })

  test("adds date_start to fields and time_increment=1 when timeIncrement is requested", async () => {
    let capturedFields: string | null = null
    let capturedTimeIncrement: string | null = null

    server.use(
      http.get(
        `${BASE}/${DEFAULT_API_VERSION}/act_9/insights`,
        ({ request }) => {
          const url = new URL(request.url)
          capturedFields = url.searchParams.get("fields")
          capturedTimeIncrement = url.searchParams.get("time_increment")

          return HttpResponse.json({
            data: [
              {
                ad_id: "ad-1",
                spend: "1.00",
                impressions: "10",
                clicks: "1",
                date_start: "2026-08-01",
              },
            ],
          })
        },
      ),
    )

    const insights = await getAdInsights({
      accessToken: ACCESS_TOKEN,
      adAccountId: "act_9",
      since: "2026-08-01",
      until: "2026-08-10",
      timeIncrement: 1,
    })

    expect(capturedFields).toBe(
      "ad_id,ad_name,spend,impressions,clicks,date_start",
    )
    expect(capturedTimeIncrement).toBe("1")
    expect(insights[0]?.date_start).toBe("2026-08-01")
  })

  test("warns when pagination is truncated at MAX_GRAPH_PAGES with paging.next still present", async () => {
    const warnSpy = vi
      .spyOn(facebookAdsLogger, "warn")
      .mockImplementation(() => undefined)

    server.use(
      http.get(
        `${BASE}/${DEFAULT_API_VERSION}/act_truncated/insights`,
        ({ request }) => {
          const url = new URL(request.url)
          const after = url.searchParams.get("after")
          return HttpResponse.json({
            data: [{ ad_id: "ad-1", spend: "1.00" }],
            paging: {
              cursors: { after: `cursor-${after ?? "0"}-next` },
              next: `${BASE}/${DEFAULT_API_VERSION}/act_truncated/insights?after=cursor-${after ?? "0"}-next`,
            },
          })
        },
      ),
    )

    const insights = await getAdInsights({
      accessToken: ACCESS_TOKEN,
      adAccountId: "act_truncated",
      since: "2026-08-01",
      until: "2026-08-10",
    })

    // Every page reports a `next` cursor, so fetchAllPages exhausts
    // MAX_GRAPH_PAGES without the caller observing an error — the warning is
    // the only trace that daily-chart data may be incomplete.
    expect(insights).toHaveLength(MAX_GRAPH_PAGES)
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ maxPages: MAX_GRAPH_PAGES }),
      expect.stringContaining("truncated"),
    )

    warnSpy.mockRestore()
  })

  test("follows paging cursors and merges all pages", async () => {
    const afterParams: (string | null)[] = []

    server.use(
      http.get(
        `${BASE}/${DEFAULT_API_VERSION}/act_9/insights`,
        ({ request }) => {
          const url = new URL(request.url)
          afterParams.push(url.searchParams.get("after"))

          if (!url.searchParams.get("after")) {
            return HttpResponse.json({
              data: [{ ad_id: "ad-1", ad_name: "First", spend: "1.00" }],
              paging: {
                cursors: { after: "cursor-1" },
                next: `${BASE}/${DEFAULT_API_VERSION}/act_9/insights?after=cursor-1`,
              },
            })
          }

          return HttpResponse.json({
            data: [{ ad_id: "ad-2", ad_name: "Second", spend: "2.50" }],
            paging: { cursors: { after: "cursor-2" } },
          })
        },
      ),
    )

    const insights = await getAdInsights({
      accessToken: ACCESS_TOKEN,
      adAccountId: "act_9",
      since: "2026-08-01",
      until: "2026-08-10",
    })

    expect(insights).toEqual([
      { ad_id: "ad-1", ad_name: "First", spend: 1, impressions: 0, clicks: 0 },
      {
        ad_id: "ad-2",
        ad_name: "Second",
        spend: 2.5,
        impressions: 0,
        clicks: 0,
      },
    ])
    expect(afterParams).toEqual([null, "cursor-1"])
  })
})
