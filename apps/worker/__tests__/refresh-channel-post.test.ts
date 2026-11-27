import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ runChannelPostRefresh: vi.fn() }))

vi.mock("@chatbotx.io/channel-registry/channel-post-refresh", () => ({
  runChannelPostRefresh: mocks.runChannelPostRefresh,
}))

const { refreshChannelPost } = await import(
  "../src/channel-post-sync/refresh-channel-post"
)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.runChannelPostRefresh.mockResolvedValue("refreshed")
})

describe("refreshChannelPost (the low job)", () => {
  test("runs the one shared refresh with the job's data, publish target included", async () => {
    const data = {
      channelPostId: "9",
      publishedTarget: { socialPostId: "p-1", targetId: "t-1" },
      workspaceId: "ws-1",
    }

    await refreshChannelPost(data)

    expect(mocks.runChannelPostRefresh).toHaveBeenCalledExactlyOnceWith(data)
  })

  test("never throws, whatever the outcome", async () => {
    mocks.runChannelPostRefresh.mockResolvedValue("rateLimited")

    await expect(
      refreshChannelPost({ channelPostId: "9", workspaceId: "ws-1" }),
    ).resolves.toBeUndefined()
  })
})
