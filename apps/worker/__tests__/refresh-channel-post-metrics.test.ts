import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  emitSocialPostChanged: vi.fn(),
  findRefreshTargets: vi.fn(),
  getPostsMetrics: vi.fn(),
  hasChannelHandler: vi.fn(),
  loggerWarn: vi.fn(),
  recordPage: vi.fn(),
  resolvePostIntegration: vi.fn(),
  workspaceTimezone: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  channelPostMetricsRefreshService: {
    findRefreshTargets: mocks.findRefreshTargets,
  },
  channelPostSyncService: {
    recordPage: mocks.recordPage,
    workspaceTimezone: mocks.workspaceTimezone,
  },
  emitSocialPostChanged: mocks.emitSocialPostChanged,
}))
vi.mock("../src/lib/logger", () => ({ logger: { warn: mocks.loggerWarn } }))
vi.mock("../src/channel-post-sync/resolve-post-integration", () => ({
  resolvePostIntegration: mocks.resolvePostIntegration,
}))

const { refreshChannelPostMetrics } = await import(
  "../src/channel-post-sync/refresh-channel-post-metrics"
)

const data = {
  channelPostIds: ["1", "2"],
  inboxId: "11",
  workspaceId: "ws-1",
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findRefreshTargets.mockResolvedValue([
    { channel: "messenger", externalPostId: "ext-1", id: "1" },
    { channel: "messenger", externalPostId: "ext-2", id: "2" },
  ])
  mocks.hasChannelHandler.mockReturnValue(true)
  mocks.resolvePostIntegration.mockResolvedValue({
    channel: "messenger",
    ctx: { kind: "ctx" },
    integration: {
      hasChannelHandler: mocks.hasChannelHandler,
      runChannelHandler: mocks.getPostsMetrics,
    },
    integrationId: "5",
    sourceAccountId: "page-1",
  })
  mocks.recordPage.mockResolvedValue(undefined)
  mocks.workspaceTimezone.mockResolvedValue("Asia/Ho_Chi_Minh")
  mocks.getPostsMetrics.mockResolvedValue([
    {
      commentsCount: 7,
      externalPostId: "ext-1",
      reactionsCount: 3,
      sharesCount: 0,
      viewsCount: null,
    },
  ])
})

describe("refreshChannelPostMetrics", () => {
  test("reads all the inbox's posts in one batch call", async () => {
    await refreshChannelPostMetrics(data)

    expect(mocks.getPostsMetrics).toHaveBeenCalledExactlyOnceWith(
      "post",
      "getPostsMetrics",
      { ctx: { kind: "ctx" }, data: { postIds: ["ext-1", "ext-2"] } },
    )
  })

  test("writes through the fenced recordPage with the time taken before the read, and only the counts set", async () => {
    await refreshChannelPostMetrics(data)

    expect(mocks.recordPage).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        channel: "messenger",
        inboxId: "11",
        integrationId: "5",
        // Counts only: the metadata the comment path owns is never stamped.
        mode: "metricsOnly",
        observedAt: expect.any(Date),
        sourceAccountId: "page-1",
        timezone: "Asia/Ho_Chi_Minh",
        workspaceId: "ws-1",
      }),
    )
    const [{ items }] = mocks.recordPage.mock.calls[0]
    expect(items).toEqual([
      expect.objectContaining({
        caption: null,
        commentsCount: 7,
        externalPostId: "ext-1",
        publishedAt: null,
        reactionsCount: 3,
        sharesCount: 0,
        thumbnailUrl: null,
      }),
    ])
  })

  test("a post missing from the answer is not written (so never zeroed or removed)", async () => {
    await refreshChannelPostMetrics(data)

    const [{ items }] = mocks.recordPage.mock.calls[0]
    expect(
      items.map((item: { externalPostId: string }) => item.externalPostId),
    ).toEqual(["ext-1"])
  })

  test("tells the open Posts pages the list changed", async () => {
    await refreshChannelPostMetrics(data)

    expect(mocks.emitSocialPostChanged).toHaveBeenCalledExactlyOnceWith({
      socialPostId: "",
      status: "metricsRefreshed",
      workspaceId: "ws-1",
    })
  })

  test("an empty answer writes and announces nothing", async () => {
    mocks.getPostsMetrics.mockResolvedValue([])

    await refreshChannelPostMetrics(data)

    expect(mocks.recordPage).not.toHaveBeenCalled()
    expect(mocks.emitSocialPostChanged).not.toHaveBeenCalled()
  })

  test("posts that can no longer be read end the job quietly", async () => {
    mocks.findRefreshTargets.mockResolvedValue([])

    await refreshChannelPostMetrics(data)

    expect(mocks.resolvePostIntegration).not.toHaveBeenCalled()
    expect(mocks.getPostsMetrics).not.toHaveBeenCalled()
  })

  test("a channel without a batch read is not asked", async () => {
    mocks.hasChannelHandler.mockReturnValue(false)

    await refreshChannelPostMetrics(data)

    expect(mocks.getPostsMetrics).not.toHaveBeenCalled()
  })

  test.each([
    ["a rate limit", new Error("rate limited")],
    ["an expired token", new Error("auth")],
  ])("%s is logged and ends the job without a throw, a write or an announcement", async (_label, err) => {
    mocks.getPostsMetrics.mockRejectedValue(err)

    await expect(refreshChannelPostMetrics(data)).resolves.toBeUndefined()

    expect(mocks.loggerWarn).toHaveBeenCalledOnce()
    expect(mocks.recordPage).not.toHaveBeenCalled()
    expect(mocks.emitSocialPostChanged).not.toHaveBeenCalled()
  })
})
