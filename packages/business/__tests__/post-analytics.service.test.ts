import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  countPostsPublished: vi.fn(),
  coverage: vi.fn(),
  findChannelPost: vi.fn(),
  findChannelPosts: vi.fn(),
  findInboxIdsOfDestinations: vi.fn(),
  findLatestPoints: vi.fn(),
  findWorkspaceTimezone: vi.fn(),
  listPoints: vi.fn(),
  listSocialPostTargets: vi.fn(),
  sampleBestTimes: vi.fn(),
  summarize: vi.fn(),
  timeseries: vi.fn(),
  topPosts: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  channelPostMetricRepository: mocks,
}))
vi.mock("../src/base.service", () => ({ BaseService: class {} }))

const { postAnalyticsService } = await import("../src/post-analytics/service")

const WORKSPACE = "ws-1"
const FULL_COVERAGE = {
  rows: [
    {
      channel: "messenger",
      posts: 4,
      postsMeasured: 4,
      postsWithHistory: 4,
      trackingSince: "2026-11-01",
    },
  ],
  truncated: false,
}

const zeroGains = {
  comments: 0,
  engagement: 0,
  reactions: 0,
  shares: 0,
  views: 0,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findWorkspaceTimezone.mockResolvedValue("Asia/Ho_Chi_Minh")
  mocks.coverage.mockResolvedValue(FULL_COVERAGE)
  mocks.findLatestPoints.mockResolvedValue(new Map())
  mocks.countPostsPublished.mockResolvedValue(4)
  mocks.summarize.mockResolvedValue({
    available: {
      comments: true,
      engagement: true,
      reactions: true,
      shares: false,
      views: false,
    },
    current: { ...zeroGains, comments: 30, engagement: 30 },
    previous: { ...zeroGains, comments: 20, engagement: 0 },
  })
})

describe("postAnalyticsService range handling", () => {
  test("defaults to the last 30 local days and the same-length period before", async () => {
    const summary = await postAnalyticsService.summary({
      workspaceId: WORKSPACE,
    })

    const { from, to } = summary.range
    expect(
      (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
        86_400_000,
    ).toBe(29)
    expect(summary.previousRange.to).toBe(
      new Date(Date.parse(`${from}T00:00:00Z`) - 86_400_000)
        .toISOString()
        .slice(0, 10),
    )
    expect(summary.timezone).toBe("Asia/Ho_Chi_Minh")
  })

  test("rejects an inverted range, a malformed day and a range over 366 days", async () => {
    await expect(
      postAnalyticsService.summary({
        from: "2026-11-10",
        to: "2026-11-01",
        workspaceId: WORKSPACE,
      }),
    ).rejects.toThrow()
    await expect(
      postAnalyticsService.summary({
        from: "2026-13-40",
        to: "2026-11-01",
        workspaceId: WORKSPACE,
      }),
    ).rejects.toThrow()
    await expect(
      postAnalyticsService.summary({
        from: "2025-01-01",
        to: "2026-11-01",
        workspaceId: WORKSPACE,
      }),
    ).rejects.toThrow()
    expect(mocks.summarize).not.toHaveBeenCalled()
  })

  test("accepts exactly 366 days", async () => {
    await expect(
      postAnalyticsService.summary({
        from: "2025-11-01",
        to: "2026-11-01",
        workspaceId: WORKSPACE,
      }),
    ).resolves.toBeDefined()
  })

  test("falls back to UTC when the stored zone is not usable", async () => {
    mocks.findWorkspaceTimezone.mockResolvedValue("Not/AZone")
    const summary = await postAnalyticsService.summary({
      workspaceId: WORKSPACE,
    })
    expect(summary.timezone).toBe("UTC")
  })
})

describe("postAnalyticsService.summary", () => {
  test("reports unavailable counts as such and computes the change only when it can be told", async () => {
    const summary = await postAnalyticsService.summary({
      workspaceId: WORKSPACE,
    })
    const byMetric = Object.fromEntries(
      summary.metrics.map((item) => [item.metric, item]),
    )

    expect(byMetric.comments).toMatchObject({
      available: true,
      changePercent: 50,
      total: 30,
    })
    // A previous total of zero has no percentage.
    expect(byMetric.engagement?.changePercent).toBeNull()
    expect(byMetric.views).toMatchObject({
      available: false,
      changePercent: null,
      total: 0,
    })
    expect(summary.postsPublished).toBe(4)
    expect(summary.coverage.level).toBe("full")
  })

  test("coverage is partial when a post lacks history and none when nothing was measured", async () => {
    mocks.coverage.mockResolvedValueOnce({
      rows: [
        {
          channel: "messenger",
          posts: 4,
          postsMeasured: 4,
          postsWithHistory: 1,
          trackingSince: "2026-11-20",
        },
      ],
      truncated: false,
    })
    expect(
      (await postAnalyticsService.summary({ workspaceId: WORKSPACE })).coverage,
    ).toMatchObject({
      level: "partial",
      trackingSince: "2026-11-20",
    })

    mocks.coverage.mockResolvedValueOnce({ rows: [], truncated: false })
    expect(
      (await postAnalyticsService.summary({ workspaceId: WORKSPACE })).coverage
        .level,
    ).toBe("none")
  })

  test("destinations resolve to inboxes, intersect an explicit inbox list, and match nothing when empty", async () => {
    mocks.findInboxIdsOfDestinations.mockResolvedValueOnce(["10", "11"])
    await postAnalyticsService.summary({
      destinationIds: ["d1"],
      inboxIds: ["11", "12"],
      workspaceId: WORKSPACE,
    })
    expect(mocks.summarize.mock.calls[0]?.[0].scope.inboxIds).toEqual(["11"])

    mocks.summarize.mockClear()
    mocks.findInboxIdsOfDestinations.mockResolvedValueOnce([])
    const empty = await postAnalyticsService.summary({
      destinationIds: ["tiktok-only"],
      workspaceId: WORKSPACE,
    })
    expect(mocks.summarize).not.toHaveBeenCalled()
    expect(empty.postsPublished).toBe(0)
    expect(empty.coverage.level).toBe("none")
    expect(empty.metrics.every((item) => !item.available)).toBe(true)
  })

  test("every read is scoped to the caller's workspace", async () => {
    await postAnalyticsService.summary({ workspaceId: WORKSPACE })
    expect(mocks.summarize.mock.calls[0]?.[0].scope.workspaceId).toBe(WORKSPACE)
    expect(mocks.coverage.mock.calls[0]?.[0].scope.workspaceId).toBe(WORKSPACE)
  })
})

describe("postAnalyticsService.timeseries", () => {
  test("fills every day of the range with a zero for days without a snapshot", async () => {
    mocks.timeseries.mockResolvedValue({
      available: true,
      rows: [{ day: "2026-11-02", gain: 7, groupKey: "all" }],
    })

    const result = await postAnalyticsService.timeseries({
      from: "2026-11-01",
      groupBy: "none",
      metric: "comments",
      to: "2026-11-03",
      workspaceId: WORKSPACE,
    })

    expect(result.series).toEqual([
      {
        key: "all",
        points: [
          { day: "2026-11-01", gain: 0 },
          { day: "2026-11-02", gain: 7 },
          { day: "2026-11-03", gain: 0 },
        ],
      },
    ])
  })

  test("an empty ungrouped scope still returns a flat series, a grouped one returns none", async () => {
    mocks.timeseries.mockResolvedValue({ available: false, rows: [] })
    const flat = await postAnalyticsService.timeseries({
      from: "2026-11-01",
      groupBy: "none",
      metric: "views",
      to: "2026-11-02",
      workspaceId: WORKSPACE,
    })
    expect(flat.series[0]?.points).toHaveLength(2)
    expect(flat.available).toBe(false)

    const grouped = await postAnalyticsService.timeseries({
      from: "2026-11-01",
      groupBy: "channel",
      metric: "views",
      to: "2026-11-02",
      workspaceId: WORKSPACE,
    })
    expect(grouped.series).toEqual([])
  })
})

describe("postAnalyticsService.topPosts", () => {
  const row = (channelPostId: string, permalink: string | null) => ({
    caption: null,
    channel: "messenger",
    channelPostId,
    contentType: null,
    gained: 1,
    inboxId: "2",
    inboxName: "Page",
    permalink,
    publishedAt: null,
    thumbnail: null,
    total: 2,
  })

  test("hands out only http(s) permalinks, anything else becomes null", async () => {
    mocks.topPosts.mockResolvedValue([
      row("1", "https://example.com/p/1"),
      row("2", ""),
      row("3", "//evil.test"),
      row("4", "javascript:alert(1)"),
      row("5", null),
    ])
    const result = await postAnalyticsService.topPosts({
      limit: 10,
      metric: "comments",
      rankBy: "gained",
      workspaceId: WORKSPACE,
    })
    expect(result.items.map((item) => item.permalink)).toEqual([
      "https://example.com/p/1",
      null,
      null,
      null,
      null,
    ])
  })
})

describe("postAnalyticsService.bestTimes", () => {
  test("ranks the sampled posts in the workspace zone and leaves the heavy coverage read out", async () => {
    // 2026-11-02T02:00Z = Monday 09:00 in Asia/Ho_Chi_Minh.
    const samples = Array.from({ length: 24 }, (_, i) => ({
      engagement: 10,
      inboxId: "1",
      publishedAt: new Date(Date.UTC(2026, 10, 2 + 7 * (i % 4), 2, 0, 0)),
    }))
    mocks.sampleBestTimes.mockResolvedValue({ capped: false, samples })

    const result = await postAnalyticsService.bestTimes({
      workspaceId: WORKSPACE,
    })

    expect(result.status).toBe("ok")
    expect(result.top[0]).toMatchObject({ hour: 9, weekday: 1 })
    expect(result).not.toHaveProperty("coverage")
    expect(mocks.coverage).not.toHaveBeenCalled()
  })

  test("reports insufficient data for a thin sample", async () => {
    mocks.sampleBestTimes.mockResolvedValue({ capped: false, samples: [] })
    const result = await postAnalyticsService.bestTimes({
      workspaceId: WORKSPACE,
    })
    expect(result.status).toBe("insufficientData")
    expect(result.top).toEqual([])
  })
})

/** A post that reports comments only (mask bit 1), with 21 comments now. */
const POST = {
  commentsCount: 21,
  engagementCount: 21,
  id: "9",
  metricsKnownMask: 1,
  reactionsCount: 0,
  removedAt: null,
  sharesCount: 0,
  viewsCount: null,
  viewsKnown: false,
}

describe("postAnalyticsService per-post reads", () => {
  const point = (day: string, total: number | null, gain: number) => ({
    comments: { gain, total },
    day,
    engagement: { gain, total },
    isBaseline: false,
    reactions: { gain: 0, total: null },
    shares: { gain: 0, total: null },
    views: { gain: 0, total: null },
  })

  test("a post outside the workspace or removed is not found", async () => {
    mocks.findChannelPost.mockResolvedValueOnce(null)
    await expect(
      postAnalyticsService.postMetrics({ id: "9", workspaceId: WORKSPACE }),
    ).rejects.toThrow("Post not found")
    mocks.findChannelPost.mockResolvedValueOnce({
      ...POST,
      removedAt: new Date(),
    })
    await expect(
      postAnalyticsService.postMetrics({ id: "9", workspaceId: WORKSPACE }),
    ).rejects.toThrow("Post not found")
  })

  test("a quiet window is 0 gained with the total of the latest snapshot, not unavailable", async () => {
    mocks.findChannelPost.mockResolvedValue(POST)
    mocks.listPoints.mockResolvedValue(new Map())
    mocks.findLatestPoints.mockResolvedValue(
      new Map([["9", point("2026-10-20", 14, 0)]]),
    )

    const report = await postAnalyticsService.postMetrics({
      from: "2026-11-01",
      id: "9",
      to: "2026-11-02",
      workspaceId: WORKSPACE,
    })

    expect(report.firstSnapshotDay).toBeNull()
    expect(report.metrics.comments).toEqual({
      available: true,
      gained: 0,
      total: 14,
    })
    expect(mocks.findLatestPoints.mock.calls[0]?.[0].to).toBe("2026-11-02")
  })

  test("without any snapshot a known count falls back to the post's current count", async () => {
    mocks.findChannelPost.mockResolvedValue(POST)
    mocks.listPoints.mockResolvedValue(new Map())

    const report = await postAnalyticsService.postMetrics({
      id: "9",
      workspaceId: WORKSPACE,
    })

    expect(report.metrics.comments).toEqual({
      available: true,
      gained: 0,
      total: 21,
    })
    expect(report.metrics.views.available).toBe(false)
  })

  test("sums the gains, keeps the latest known total and marks a never-reported count unavailable", async () => {
    mocks.findChannelPost.mockResolvedValue(POST)
    mocks.listPoints.mockResolvedValue(
      new Map([
        ["9", [point("2026-11-01", 10, 0), point("2026-11-02", 14, 4)]],
      ]),
    )
    mocks.findLatestPoints.mockResolvedValue(
      new Map([["9", point("2026-11-02", 14, 4)]]),
    )

    const report = await postAnalyticsService.postMetrics({
      from: "2026-11-01",
      id: "9",
      to: "2026-11-02",
      workspaceId: WORKSPACE,
    })

    expect(report.firstSnapshotDay).toBe("2026-11-01")
    expect(report.metrics.comments).toEqual({
      available: true,
      gained: 4,
      total: 14,
    })
    expect(report.metrics.reactions).toEqual({
      available: false,
      gained: 0,
      total: null,
    })
  })

  test("a composed post explains why a destination has no metrics", async () => {
    mocks.findChannelPosts.mockImplementation(
      async ({ ids }: { ids: string[] }) =>
        ids.map((id) =>
          id === "10"
            ? { ...POST, id, removedAt: new Date() }
            : { ...POST, id },
        ),
    )
    mocks.listSocialPostTargets.mockResolvedValue([
      {
        channel: "messenger",
        channelPostId: "9",
        id: "t1",
        inboxName: "A",
        provider: "facebook",
        publishDestinationId: "d1",
        removedAt: null,
        status: "published",
      },
      {
        channel: "instagram",
        channelPostId: null,
        id: "t2",
        inboxName: "B",
        provider: "instagram",
        publishDestinationId: "d2",
        removedAt: null,
        status: "published",
      },
      {
        channel: null,
        channelPostId: null,
        id: "t3",
        inboxName: null,
        provider: "tiktok",
        publishDestinationId: "d3",
        removedAt: null,
        status: "published",
      },
      {
        channel: "threads",
        channelPostId: null,
        id: "t4",
        inboxName: "D",
        provider: "threads",
        publishDestinationId: "d4",
        removedAt: null,
        status: "scheduled",
      },
      {
        channel: "messenger",
        channelPostId: "10",
        id: "t5",
        inboxName: "E",
        provider: "facebook",
        publishDestinationId: "d5",
        removedAt: new Date(),
        status: "published",
      },
    ])
    mocks.listPoints.mockResolvedValue(
      new Map([["9", [point("2026-11-02", 3, 3)]]]),
    )

    const result = await postAnalyticsService.socialPostMetrics({
      id: "1",
      workspaceId: WORKSPACE,
    })

    expect(
      result.targets.map((target) => [
        target.targetId,
        target.available,
        "reason" in target ? target.reason : null,
      ]),
    ).toEqual([
      ["t1", true, null],
      ["t2", false, "notLinked"],
      ["t3", false, "networkNotSupported"],
      ["t4", false, "notPublished"],
      ["t5", false, "removed"],
    ])
    // One batched read for every linked target, not one per target.
    expect(mocks.findChannelPosts).toHaveBeenCalledTimes(1)
    expect(mocks.findChannelPost).not.toHaveBeenCalled()
    expect(mocks.listPoints).toHaveBeenCalledTimes(1)
    expect(mocks.listPoints.mock.calls[0]?.[0].channelPostIds).toEqual([
      "9",
      "10",
    ])
  })

  test("an unknown composed post is not found", async () => {
    mocks.listSocialPostTargets.mockResolvedValue(null)
    await expect(
      postAnalyticsService.socialPostMetrics({
        id: "1",
        workspaceId: WORKSPACE,
      }),
    ).rejects.toThrow("Post not found")
  })
})
