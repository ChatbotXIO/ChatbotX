// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

type Handler = (args: unknown) => Promise<unknown>
type McpSpecFn = (current: Record<string, unknown>) => {
  "x-mcp"?: { visibility?: string }
}
type RouteConfig = { method: string; path: string; spec?: McpSpecFn }
type CapturedProcedure = { handler?: Handler; route: RouteConfig }

const { capturedProcedures, scopes, workspaceTokenAuthAPIForScope } =
  vi.hoisted(() => {
    const capturedProcedures: CapturedProcedure[] = []
    const scopes: string[] = []
    const makeProcedure = () => {
      let route: RouteConfig = { method: "", path: "" }
      const chain = {
        errors: vi.fn(() => chain),
        input: vi.fn(() => chain),
        output: vi.fn(() => chain),
        route: vi.fn((config: RouteConfig) => {
          route = config
          return chain
        }),
        use: vi.fn(() => chain),
        handler: vi.fn((handler: Handler) => {
          capturedProcedures.push({ handler, route })
          return { handler }
        }),
      }
      return chain
    }
    return {
      capturedProcedures,
      scopes,
      workspaceTokenAuthAPIForScope: vi.fn((scope: string) => {
        scopes.push(scope)
        return makeProcedure()
      }),
    }
  })

const service = {
  bestTimes: vi.fn(),
  postMetrics: vi.fn(),
  socialPostMetrics: vi.fn(),
  summary: vi.fn(),
  timeseries: vi.fn(),
  topPosts: vi.fn(),
}

vi.mock("@chatbotx.io/business", () => ({
  MAX_BULK_UPDATE_POSTS: 100,
  MAX_EXPORT_ROWS: 20_000,
  MAX_MERGE_VIEW_POSTS: 20,
  MAX_TOPICS_PER_POST: 20,
  POST_COMMENT_SENDERS: ["contact", "page"],
  channelPostCommentExportKinds: ["comments", "phones", "emails"],
  channelPostExportKinds: ["comments", "phones", "emails", "rows"],
  postAnalyticsService: service,
}))
vi.mock("@/orpc", () => ({ workspaceTokenAuthAPIForScope }))

await import("@/features/post-analytics/api/public")
const {
  postAnalyticsBestTimesRequest,
  postAnalyticsFiltersRequest,
  postAnalyticsSummaryResponse,
  postAnalyticsTimeseriesRequest,
  postAnalyticsTopPostsRequest,
  postMetricsRequest,
  socialPostMetricsResponse,
} = await import("@/features/post-analytics/schema")

const procedure = (method: string, path: string): CapturedProcedure => {
  const found = capturedProcedures.find(
    (candidate) =>
      candidate.route.method === method && candidate.route.path === path,
  )
  if (!found?.handler) {
    throw new Error(`Missing ${method} ${path}`)
  }
  return found
}

const call = async (path: string, input: unknown) =>
  await procedure("GET", path).handler?.({
    context: { workspace: { id: "ws-1" } },
    input,
  })

beforeEach(() => {
  vi.clearAllMocks()
})

describe("post analytics public API surface", () => {
  test("every route is a GET behind the posts scope", () => {
    expect(new Set(scopes)).toEqual(new Set(["posts"]))
    expect(
      capturedProcedures.map(({ route }) => `${route.method} ${route.path}`),
    ).toEqual([
      "GET /v1/post-analytics/summary",
      "GET /v1/post-analytics/timeseries",
      "GET /v1/post-analytics/top-posts",
      "GET /v1/post-analytics/best-times",
    ])
  })

  test("only the summary is in the default MCP tool set", () => {
    expect(
      capturedProcedures
        .filter(
          ({ route }) => route.spec?.({})["x-mcp"]?.visibility === "default",
        )
        .map(({ route }) => route.path),
    ).toEqual(["/v1/post-analytics/summary"])
  })

  test.each([
    ["/v1/post-analytics/summary", "summary"],
    ["/v1/post-analytics/timeseries", "timeseries"],
    ["/v1/post-analytics/top-posts", "topPosts"],
    ["/v1/post-analytics/best-times", "bestTimes"],
  ] as const)("%s calls the service for the token's workspace only", async (path, method) => {
    service[method].mockResolvedValue({ ok: true })

    await call(path, { channels: ["messenger"] })

    expect(service[method]).toHaveBeenCalledWith(
      expect.objectContaining({ channels: ["messenger"], workspaceId: "ws-1" }),
    )
  })
})

describe("post analytics request schemas", () => {
  test("wrap a lone query value into an array and default the metric and grouping", () => {
    expect(
      postAnalyticsTimeseriesRequest.parse({
        channels: "messenger",
        inboxIds: "12",
      }),
    ).toMatchObject({
      channels: ["messenger"],
      groupBy: "none",
      inboxIds: ["12"],
      metric: "engagement",
    })
  })

  test("rejects an unknown channel, metric, grouping, rank and a malformed day", () => {
    expect(
      postAnalyticsFiltersRequest.safeParse({ channels: ["fax"] }).success,
    ).toBe(false)
    expect(
      postAnalyticsTimeseriesRequest.safeParse({ metric: "likes" }).success,
    ).toBe(false)
    expect(
      postAnalyticsTimeseriesRequest.safeParse({ groupBy: "post" }).success,
    ).toBe(false)
    expect(
      postAnalyticsTopPostsRequest.safeParse({ rankBy: "newest" }).success,
    ).toBe(false)
    expect(
      postAnalyticsFiltersRequest.safeParse({ from: "2026-1-5" }).success,
    ).toBe(false)
  })

  test("caps top posts at 50 and defaults to 10", () => {
    expect(postAnalyticsTopPostsRequest.parse({}).limit).toBe(10)
    expect(postAnalyticsTopPostsRequest.safeParse({ limit: 51 }).success).toBe(
      false,
    )
    expect(postAnalyticsTopPostsRequest.safeParse({ limit: 0 }).success).toBe(
      false,
    )
  })

  test("best times takes the scope but no range", () => {
    expect(
      Object.keys(postAnalyticsBestTimesRequest.shape).sort(),
    ).not.toContain("from")
  })

  test("a post id must be a signed bigint", () => {
    expect(postMetricsRequest.safeParse({ id: "abc" }).success).toBe(false)
    expect(postMetricsRequest.safeParse({ id: "123" }).success).toBe(true)
  })
})

describe("post analytics response schemas", () => {
  test("a destination answers either with metrics or with a reason, never both shapes", () => {
    const range = { from: "2026-11-01", to: "2026-11-02" }
    const base = {
      channel: "messenger",
      inboxName: "A",
      publishDestinationId: "1",
      targetId: "2",
    }
    expect(
      socialPostMetricsResponse.safeParse({
        range,
        socialPostId: "9",
        targets: [{ ...base, available: false, reason: "notLinked" }],
        timezone: "UTC",
      }).success,
    ).toBe(true)
    expect(
      socialPostMetricsResponse.safeParse({
        range,
        socialPostId: "9",
        targets: [{ ...base, available: false, reason: "mystery" }],
        timezone: "UTC",
      }).success,
    ).toBe(false)
  })

  test("a summary metric can be unavailable with no change percentage", () => {
    expect(
      postAnalyticsSummaryResponse.safeParse({
        coverage: {
          byChannel: [],
          level: "none",
          posts: 0,
          postsMeasured: 0,
          postsWithHistory: 0,
          trackingSince: null,
          truncated: false,
        },
        metrics: [
          {
            available: false,
            changePercent: null,
            metric: "views",
            previousTotal: 0,
            total: 0,
          },
        ],
        postsPublished: 0,
        previousRange: { from: "2026-10-02", to: "2026-10-31" },
        range: { from: "2026-11-01", to: "2026-11-30" },
        timezone: "UTC",
        today: "2026-11-30",
      }).success,
    ).toBe(true)
  })
})

describe("post analytics request schemas are strict", () => {
  test("a wrong filter key is rejected instead of silently ignored", async () => {
    const {
      postAnalyticsBestTimesRequest,
      postAnalyticsFiltersRequest,
      postAnalyticsTimeseriesRequest,
      postAnalyticsTopPostsRequest,
      postMetricsRequest,
      socialPostMetricsRequest,
    } = await import("@/features/post-analytics/schema")
    const wrong = { channel: "messenger" }
    expect(postAnalyticsFiltersRequest.safeParse(wrong).success).toBe(false)
    expect(postAnalyticsFiltersRequest.safeParse({}).success).toBe(true)
    expect(postAnalyticsBestTimesRequest.safeParse(wrong).success).toBe(false)
    expect(postAnalyticsTimeseriesRequest.safeParse(wrong).success).toBe(false)
    expect(postAnalyticsTopPostsRequest.safeParse(wrong).success).toBe(false)
    expect(postMetricsRequest.safeParse({ id: "9", ...wrong }).success).toBe(
      false,
    )
    expect(
      socialPostMetricsRequest.safeParse({ id: "9", ...wrong }).success,
    ).toBe(false)
    expect(
      postAnalyticsTimeseriesRequest.safeParse({ channels: "messenger" })
        .success,
    ).toBe(true)
  })
})
