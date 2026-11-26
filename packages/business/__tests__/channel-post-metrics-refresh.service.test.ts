import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findMetricsRefreshCandidates: vi.fn(),
  loggerWarn: vi.fn(),
  lowQueueAdd: vi.fn(),
  claims: new Set<string>(),
  del: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  channelPostSyncRepository: {
    findMetricsRefreshCandidates: mocks.findMetricsRefreshCandidates,
  },
}))
vi.mock("@chatbotx.io/redis", () => ({
  casStore: {
    del: mocks.del,
    // SET NX: only the first call for a key wins.
    setIfAbsent: vi.fn((key: string) => {
      if (mocks.claims.has(key)) {
        return Promise.resolve(false)
      }
      mocks.claims.add(key)
      return Promise.resolve(true)
    }),
  },
}))
vi.mock("@chatbotx.io/worker-config", () => ({
  LowJobAction: { refreshChannelPostMetrics: "refreshChannelPostMetrics" },
  lowQueue: { add: mocks.lowQueueAdd },
}))
vi.mock("../src/logger", () => ({ logger: { warn: mocks.loggerWarn } }))

const { channelPostMetricsRefreshService } = await import(
  "../src/channel-post/metrics-refresh.service"
)
const { CHANNEL_POST_METRICS_STALE_MS } = await import(
  "@chatbotx.io/utils/channel-post"
)

const NOW = new Date("2026-11-25T10:00:00.000Z")
const minutesAgo = (minutes: number) =>
  new Date(NOW.getTime() - minutes * 60_000)

const candidate = (overrides: Record<string, unknown> = {}) => ({
  channel: "messenger",
  eligible: true,
  externalPostId: "ext-1",
  id: "1",
  inboxId: "inbox-1",
  metricsFetchedAt: null,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.claims.clear()
  mocks.del.mockResolvedValue(undefined)
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  mocks.lowQueueAdd.mockResolvedValue(undefined)
})

describe("requestMetricsRefresh", () => {
  test("reads only the workspace's own posts and queues one job per inbox", async () => {
    mocks.findMetricsRefreshCandidates.mockResolvedValue([
      candidate({ id: "1", inboxId: "inbox-1" }),
      candidate({ id: "2", inboxId: "inbox-1" }),
      candidate({ id: "3", inboxId: "inbox-2" }),
    ])

    const result = await channelPostMetricsRefreshService.requestMetricsRefresh(
      { channelPostIds: ["1", "2", "3"], workspaceId: "ws-1" },
    )

    expect(mocks.findMetricsRefreshCandidates).toHaveBeenCalledWith({
      ids: ["1", "2", "3"],
      workspaceId: "ws-1",
    })
    expect(result).toEqual({ fresh: 0, queued: 3, skipped: 0 })
    expect(mocks.lowQueueAdd).toHaveBeenCalledTimes(2)
    expect(mocks.lowQueueAdd).toHaveBeenCalledWith(
      "refreshChannelPostMetrics",
      {
        data: {
          channelPostIds: ["1", "2"],
          inboxId: "inbox-1",
          workspaceId: "ws-1",
        },
        type: "refreshChannelPostMetrics",
      },
      expect.objectContaining({ attempts: 1 }),
    )
  })

  test("a post read less than 5 minutes ago is fresh and not queued", async () => {
    mocks.findMetricsRefreshCandidates.mockResolvedValue([
      candidate({ id: "1", metricsFetchedAt: minutesAgo(4) }),
      candidate({ id: "2", metricsFetchedAt: minutesAgo(6) }),
      candidate({ id: "3", metricsFetchedAt: null }),
    ])

    const result = await channelPostMetricsRefreshService.requestMetricsRefresh(
      { channelPostIds: ["1", "2", "3"], workspaceId: "ws-1" },
    )

    expect(result).toEqual({ fresh: 1, queued: 2, skipped: 0 })
    expect(mocks.lowQueueAdd.mock.calls[0][1].data.channelPostIds).toEqual([
      "2",
      "3",
    ])
  })

  test("the staleness boundary is exactly 5 minutes", async () => {
    mocks.findMetricsRefreshCandidates.mockResolvedValue([
      candidate({
        metricsFetchedAt: new Date(
          NOW.getTime() - CHANNEL_POST_METRICS_STALE_MS,
        ),
      }),
    ])

    const result = await channelPostMetricsRefreshService.requestMetricsRefresh(
      { channelPostIds: ["1"], workspaceId: "ws-1" },
    )

    expect(result.queued).toBe(1)
  })

  test("ids that are not the workspace's, removed posts, ineligible inboxes and channels without a batch read are skipped", async () => {
    mocks.findMetricsRefreshCandidates.mockResolvedValue([
      candidate({ id: "1", eligible: false }),
      candidate({ id: "2", channel: "tiktok" }),
      candidate({ id: "3", channel: "threads" }),
      candidate({ id: "4" }),
    ])

    const result = await channelPostMetricsRefreshService.requestMetricsRefresh(
      // "5" is another workspace's (or removed): the repository returns no row.
      { channelPostIds: ["1", "2", "3", "4", "5"], workspaceId: "ws-1" },
    )

    expect(result).toEqual({ fresh: 0, queued: 1, skipped: 4 })
    expect(mocks.lowQueueAdd).toHaveBeenCalledTimes(1)
  })

  test("repeated and surplus ids are cut to 50 distinct posts", async () => {
    mocks.findMetricsRefreshCandidates.mockResolvedValue([])
    const ids = Array.from({ length: 70 }, (_, index) => String(index + 1))

    await channelPostMetricsRefreshService.requestMetricsRefresh({
      channelPostIds: [...ids, "1", "2"],
      workspaceId: "ws-1",
    })

    const asked = mocks.findMetricsRefreshCandidates.mock.calls[0][0].ids
    expect(asked).toHaveLength(50)
    expect(new Set(asked).size).toBe(50)
  })

  test("overlapping requests never read a post twice in a window", async () => {
    const all = ["1", "2", "3"].map((id) => candidate({ id }))
    mocks.findMetricsRefreshCandidates.mockImplementation(
      ({ ids }: { ids: string[] }) =>
        Promise.resolve(all.filter((c) => ids.includes(c.id))),
    )
    const request = (channelPostIds: string[]) =>
      channelPostMetricsRefreshService.requestMetricsRefresh({
        channelPostIds,
        workspaceId: "ws-1",
      })

    const first = await request(["1", "2"])
    const second = await request(["1", "3"])
    const third = await request(["1", "2", "3"])

    expect(first).toEqual({ fresh: 0, queued: 2, skipped: 0 })
    expect(second).toEqual({ fresh: 1, queued: 1, skipped: 0 })
    expect(third).toEqual({ fresh: 3, queued: 0, skipped: 0 })
    const queuedIds = mocks.lowQueueAdd.mock.calls.flatMap(
      ([, job]) => job.data.channelPostIds as string[],
    )
    expect(queuedIds.sort()).toEqual(["1", "2", "3"])
    expect(mocks.lowQueueAdd).toHaveBeenCalledTimes(2)
  })

  test("a claim is per workspace and per post, with the 5-minute window as its TTL", async () => {
    mocks.findMetricsRefreshCandidates.mockResolvedValue([candidate()])

    await channelPostMetricsRefreshService.requestMetricsRefresh({
      channelPostIds: ["1"],
      workspaceId: "ws-1",
    })

    expect([...mocks.claims]).toEqual(["channel-post-metrics-claim:ws-1:1"])
  })

  test("a Redis failure on the claim leaves the post unread, not read twice", async () => {
    mocks.findMetricsRefreshCandidates.mockResolvedValue([candidate()])
    const { casStore } = await import("@chatbotx.io/redis")
    vi.mocked(casStore.setIfAbsent).mockRejectedValueOnce(
      new Error("redis down"),
    )

    const result = await channelPostMetricsRefreshService.requestMetricsRefresh(
      { channelPostIds: ["1"], workspaceId: "ws-1" },
    )

    expect(result.queued).toBe(0)
    expect(mocks.lowQueueAdd).not.toHaveBeenCalled()
  })

  test("jobs take a generated id (the per-post claims dedupe) and a brief retention", async () => {
    const ids = Array.from({ length: 50 }, (_, index) =>
      String(9_000_000_000_000 + index),
    )
    mocks.findMetricsRefreshCandidates.mockResolvedValue(
      ids.map((id) => candidate({ id })),
    )

    await channelPostMetricsRefreshService.requestMetricsRefresh({
      channelPostIds: ids,
      workspaceId: "ws-1",
    })

    const options = mocks.lowQueueAdd.mock.calls[0][2]
    expect(options.jobId).toBeUndefined()
    expect(options.removeOnComplete).toEqual({ age: 60 })
  })

  test("a failed enqueue is logged, not counted as queued, and does not stop the other inboxes", async () => {
    mocks.findMetricsRefreshCandidates.mockResolvedValue([
      candidate({ id: "1", inboxId: "inbox-1" }),
      candidate({ id: "2", inboxId: "inbox-2" }),
    ])
    mocks.lowQueueAdd.mockRejectedValueOnce(new Error("redis down"))

    const result = await channelPostMetricsRefreshService.requestMetricsRefresh(
      { channelPostIds: ["1", "2"], workspaceId: "ws-1" },
    )

    expect(result.queued).toBe(1)
    expect(mocks.loggerWarn).toHaveBeenCalledOnce()
    // The failed job's claim is given back so a later request can try again.
    expect(mocks.del).toHaveBeenCalledExactlyOnceWith(
      "channel-post-metrics-claim:ws-1:1",
    )
  })
})

describe("findRefreshTargets", () => {
  test("keeps the posts of the job's inbox that can still be read", async () => {
    mocks.findMetricsRefreshCandidates.mockResolvedValue([
      candidate({ id: "1" }),
      candidate({ id: "2", inboxId: "inbox-2" }),
      candidate({ id: "3", eligible: false }),
    ])

    const targets = await channelPostMetricsRefreshService.findRefreshTargets({
      channelPostIds: ["1", "2", "3"],
      inboxId: "inbox-1",
      workspaceId: "ws-1",
    })

    expect(targets).toEqual([
      { channel: "messenger", externalPostId: "ext-1", id: "1" },
    ])
  })
})
