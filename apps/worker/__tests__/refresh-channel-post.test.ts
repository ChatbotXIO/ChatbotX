import { ChannelError, ChannelErrorCategory } from "@chatbotx.io/sdk"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  emitSocialPostChanged: vi.fn(),
  findPostRefreshTarget: vi.fn(),
  getPost: vi.fn(),
  hasChannelHandler: vi.fn(),
  recordLiveObservation: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  markPostRemoved: vi.fn(),
  reconcilePhoneCount: vi.fn(),
  recordPage: vi.fn(),
  resolvePostIntegration: vi.fn(),
  workspaceTimezone: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  channelPostService: { recordLiveObservation: mocks.recordLiveObservation },
  emitSocialPostChanged: mocks.emitSocialPostChanged,
  channelPostSyncService: {
    findPostRefreshTarget: mocks.findPostRefreshTarget,
    markPostRemoved: mocks.markPostRemoved,
    reconcilePhoneCount: mocks.reconcilePhoneCount,
    recordPage: mocks.recordPage,
    workspaceTimezone: mocks.workspaceTimezone,
  },
}))
vi.mock("../src/lib/logger", () => ({
  logger: { info: mocks.loggerInfo, warn: mocks.loggerWarn },
}))
vi.mock("../src/channel-post-sync/resolve-post-integration", () => ({
  resolvePostIntegration: mocks.resolvePostIntegration,
}))

const { refreshChannelPost } = await import(
  "../src/channel-post-sync/refresh-channel-post"
)

const data = { channelPostId: "9", workspaceId: "ws-1" }
const target = {
  channel: "messenger",
  externalPostId: "ext-9",
  id: "9",
  inboxId: "11",
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findPostRefreshTarget.mockResolvedValue(target)
  mocks.resolvePostIntegration.mockResolvedValue({
    channel: "messenger",
    ctx: { kind: "ctx" },
    integration: {
      hasChannelHandler: mocks.hasChannelHandler,
      runChannelHandler: mocks.getPost,
    },
    integrationId: "5",
    sourceAccountId: "page-1",
  })
  mocks.recordPage.mockResolvedValue(undefined)
  mocks.workspaceTimezone.mockResolvedValue("Asia/Ho_Chi_Minh")
  mocks.reconcilePhoneCount.mockResolvedValue({
    count: 0,
    repaired: false,
    skipped: false,
  })
  mocks.markPostRemoved.mockResolvedValue(undefined)
  mocks.hasChannelHandler.mockReturnValue(true)
  mocks.recordLiveObservation.mockResolvedValue(true)
})

describe("refreshChannelPost", () => {
  test("does nothing for a post that no longer exists", async () => {
    mocks.findPostRefreshTarget.mockResolvedValue(null)

    await refreshChannelPost(data)

    expect(mocks.getPost).not.toHaveBeenCalled()
  })

  test("reads the post by its external id and writes the fresh counts", async () => {
    const item = { externalPostId: "ext-9", commentsCount: 8 }
    mocks.getPost.mockResolvedValue(item)

    await refreshChannelPost(data)

    expect(mocks.getPost).toHaveBeenCalledWith("post", "getPost", {
      ctx: { kind: "ctx" },
      data: { postId: "ext-9" },
    })
    expect(mocks.recordPage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "messenger",
        inboxId: "11",
        integrationId: "5",
        items: [item],
        observedAt: expect.any(Date),
        sourceAccountId: "page-1",
        timezone: "Asia/Ho_Chi_Minh",
        workspaceId: "ws-1",
      }),
    )
    expect(mocks.markPostRemoved).not.toHaveBeenCalled()
  })

  test("a refresh that follows a publish from Posts tells the open Posts pages once the counts are written", async () => {
    mocks.getPost.mockResolvedValue({ externalPostId: "ext-9" })

    await refreshChannelPost({
      ...data,
      publishedTarget: { socialPostId: "p-1", targetId: "t-1" },
    })

    expect(mocks.recordPage).toHaveBeenCalledTimes(1)
    expect(mocks.emitSocialPostChanged).toHaveBeenCalledWith({
      socialPostId: "p-1",
      status: "published",
      targetId: "t-1",
      workspaceId: "ws-1",
    })
  })

  test("a plain refresh (sync, refresh button) announces nothing", async () => {
    mocks.getPost.mockResolvedValue({ externalPostId: "ext-9" })

    await refreshChannelPost(data)

    expect(mocks.emitSocialPostChanged).not.toHaveBeenCalled()
  })

  test("repairs the phone-comment count from the comments, before asking the channel", async () => {
    const order: string[] = []
    mocks.reconcilePhoneCount.mockImplementation(() => {
      order.push("reconcile")
      return Promise.resolve({ count: 5, repaired: true, skipped: false })
    })
    mocks.getPost.mockImplementation(() => {
      order.push("channel")
      return Promise.resolve({ externalPostId: "ext-9" })
    })

    await refreshChannelPost(data)

    expect(order).toEqual(["reconcile", "channel"])
    expect(mocks.reconcilePhoneCount).toHaveBeenCalledWith({
      id: "9",
      workspaceId: "ws-1",
    })
    expect(mocks.loggerInfo).toHaveBeenCalledTimes(1)
  })

  test("a post the channel says is gone still gets its count repaired", async () => {
    mocks.getPost.mockRejectedValue(
      new ChannelError("gone", ChannelErrorCategory.NOT_FOUND),
    )

    await refreshChannelPost(data)

    expect(mocks.reconcilePhoneCount).toHaveBeenCalledTimes(1)
    expect(mocks.markPostRemoved).toHaveBeenCalledTimes(1)
  })

  test("a failing repair is logged and does not stop the refresh", async () => {
    mocks.reconcilePhoneCount.mockRejectedValue(new Error("shard down"))
    mocks.getPost.mockResolvedValue({ externalPostId: "ext-9" })

    await expect(refreshChannelPost(data)).resolves.toBeUndefined()

    expect(mocks.loggerWarn).toHaveBeenCalledTimes(1)
    expect(mocks.recordPage).toHaveBeenCalledTimes(1)
  })

  test("only the one-post refresh repairs the count: the periodic sync never does", async () => {
    mocks.findPostRefreshTarget.mockResolvedValue(null)

    await refreshChannelPost(data)

    expect(mocks.reconcilePhoneCount).not.toHaveBeenCalled()
  })

  test("hides the post only when the channel confirms it is gone", async () => {
    mocks.getPost.mockRejectedValue(
      new ChannelError("gone", ChannelErrorCategory.NOT_FOUND),
    )

    await refreshChannelPost(data)

    expect(mocks.markPostRemoved).toHaveBeenCalledWith({
      id: "9",
      workspaceId: "ws-1",
    })
    expect(mocks.recordPage).not.toHaveBeenCalled()
  })

  test.each([
    [
      "an unknown channel error",
      new ChannelError("?", ChannelErrorCategory.UNKNOWN),
    ],
    [
      "a permission error",
      new ChannelError("no", ChannelErrorCategory.PERMISSION_DENIED),
    ],
    ["a plain error", new Error("network")],
  ])("%s leaves the post as it was, logs, and never throws", async (_label, err) => {
    mocks.getPost.mockRejectedValue(err)

    await expect(refreshChannelPost(data)).resolves.toBeUndefined()

    expect(mocks.markPostRemoved).not.toHaveBeenCalled()
    expect(mocks.loggerWarn).toHaveBeenCalled()
  })

  test("a missing integration is logged, not thrown", async () => {
    mocks.resolvePostIntegration.mockRejectedValue(
      new ChannelError("no auth", ChannelErrorCategory.AUTH_FAILED),
    )

    await expect(refreshChannelPost(data)).resolves.toBeUndefined()
    expect(mocks.markPostRemoved).not.toHaveBeenCalled()
  })
})

describe("refreshChannelPost on a post stored as live", () => {
  const liveTarget = { ...target, liveStatus: "live" }
  const askedLiveState = (call: unknown[]) => call[1] === "getLiveState"

  beforeEach(() => {
    mocks.findPostRefreshTarget.mockResolvedValue(liveTarget)
    mocks.getPost.mockImplementation((_group, name) =>
      Promise.resolve(
        name === "getLiveState" ? "ended" : { externalPostId: "ext-9" },
      ),
    )
  })

  test("records the end of a broadcast whose end event was missed", async () => {
    await refreshChannelPost(data)

    expect(mocks.recordLiveObservation).toHaveBeenCalledWith({
      channel: "messenger",
      externalPostId: "ext-9",
      inboxId: "11",
      integrationId: "5",
      observedAt: expect.any(Date),
      source: "reread",
      sourceAccountId: "page-1",
      status: "ended",
      workspaceId: "ws-1",
    })
  })

  test("records a broadcast that is still on the air as a fresh live observation", async () => {
    mocks.getPost.mockImplementation((_group, name) =>
      Promise.resolve(
        name === "getLiveState" ? "live" : { externalPostId: "ext-9" },
      ),
    )

    await refreshChannelPost(data)

    expect(mocks.recordLiveObservation).toHaveBeenCalledWith(
      expect.objectContaining({ status: "live", source: "reread" }),
    )
  })

  test("leaves the status alone when the channel cannot tell", async () => {
    mocks.getPost.mockImplementation((_group, name) =>
      Promise.resolve(
        name === "getLiveState" ? "unknown" : { externalPostId: "ext-9" },
      ),
    )

    await refreshChannelPost(data)

    expect(mocks.recordLiveObservation).not.toHaveBeenCalled()
  })

  test("a failing live read is logged and still refreshes the counts", async () => {
    mocks.getPost.mockImplementation((_group, name) =>
      name === "getLiveState"
        ? Promise.reject(new Error("graph down"))
        : Promise.resolve({ externalPostId: "ext-9" }),
    )

    await refreshChannelPost(data)

    expect(mocks.recordLiveObservation).not.toHaveBeenCalled()
    expect(mocks.recordPage).toHaveBeenCalledTimes(1)
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      expect.stringContaining("live state"),
    )
  })

  test("a channel without a live read is not asked", async () => {
    mocks.hasChannelHandler.mockReturnValue(false)

    await refreshChannelPost(data)

    expect(mocks.getPost.mock.calls.some(askedLiveState)).toBe(false)
    expect(mocks.recordLiveObservation).not.toHaveBeenCalled()
  })

  test("a post that is not stored as live is never asked", async () => {
    mocks.findPostRefreshTarget.mockResolvedValue({
      ...target,
      liveStatus: "ended",
    })

    await refreshChannelPost(data)

    expect(mocks.getPost.mock.calls.some(askedLiveState)).toBe(false)
  })
})
