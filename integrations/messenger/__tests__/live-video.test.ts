import {
  beforeEach,
  describe,
  expect,
  type MockInstance,
  test,
  vi,
} from "vitest"

vi.mock("../src/lib/http-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/http-client")>()),
  facebookGraphClient: { get: vi.fn() },
}))

const { getLiveState, liveVideoBroadcastStatus, readLiveBroadcast } =
  await import("../src/apis/live-video")
const { facebookGraphClient } = await import("../src/lib/http-client")

const mockGet = facebookGraphClient.get as MockInstance

const auth = {
  metadata: { pageId: "page-1" },
  tokens: { accessToken: "page-token" },
} as never

describe("liveVideoBroadcastStatus", () => {
  test.each([
    ["LIVE", "live"],
    ["LIVE_NOW", "live"],
    ["LIVE_STOPPED", "ended"],
    ["VOD", "ended"],
    ["PROCESSING", "ended"],
    ["SCHEDULED_LIVE", null],
    ["SCHEDULED_UNPUBLISHED", null],
    ["SCHEDULED_EXPIRED", null],
    ["SCHEDULED_CANCELED", null],
    ["UNPUBLISHED", null],
    ["SOMETHING_NEW", null],
    [undefined, null],
  ] as const)("%s is %s", (status, expected) => {
    expect(liveVideoBroadcastStatus({ status })).toBe(expected)
  })
})

describe("readLiveBroadcast", () => {
  beforeEach(() => {
    mockGet.mockReset()
  })

  test("reads the broadcast with the page token and maps it to its post", async () => {
    mockGet.mockResolvedValue({
      broadcast_start_time: "2026-11-24T09:00:00+0000",
      description: "Live!",
      id: "live-1",
      permalink_url: "https://facebook.com/live-1",
      status: "LIVE_NOW",
      video: { live_status: "LIVE", post_id: "page-1_555" },
    })

    const broadcast = await readLiveBroadcast({ auth, liveVideoId: "live-1" })

    expect(broadcast).toEqual({
      caption: "Live!",
      externalPostId: "page-1_555",
      liveStatus: "live",
      permalink: "https://facebook.com/live-1",
      publishedAt: new Date("2026-11-24T09:00:00+0000"),
    })
    expect(mockGet).toHaveBeenCalledWith(
      expect.stringContaining("/live-1"),
      expect.objectContaining({
        headers: { Authorization: "Bearer page-token" },
        searchParams: {
          fields: expect.stringContaining("video{id,post_id,live_status}"),
        },
      }),
    )
  })

  test("a broadcast that ended is ended", async () => {
    mockGet.mockResolvedValue({
      id: "live-1",
      status: "VOD",
      video: { post_id: "page-1_555" },
    })

    expect(
      (await readLiveBroadcast({ auth, liveVideoId: "live-1" }))?.liveStatus,
    ).toBe("ended")
  })

  test.each([
    "SCHEDULED_LIVE",
    "SCHEDULED_EXPIRED",
    "UNPUBLISHED",
    "SOMETHING_NEW",
  ])("a %s broadcast records nothing", async (status) => {
    mockGet.mockResolvedValue({
      id: "live-1",
      status,
      video: { post_id: "page-1_555" },
    })

    expect(await readLiveBroadcast({ auth, liveVideoId: "live-1" })).toBeNull()
  })

  test("a broadcast without a post id records nothing", async () => {
    mockGet.mockResolvedValue({
      id: "live-1",
      status: "LIVE_NOW",
      video: { id: "video-1" },
    })

    expect(await readLiveBroadcast({ auth, liveVideoId: "live-1" })).toBeNull()
  })
})

describe("getLiveState", () => {
  beforeEach(() => {
    mockGet.mockReset()
  })

  test("is live while the post's broadcast is on the air", async () => {
    mockGet.mockResolvedValue({
      data: [{ id: "l", status: "LIVE_NOW", video: { post_id: "page-1_555" } }],
    })

    expect(await getLiveState({ auth, postId: "page-1_555" })).toBe("live")
  })

  test("is ended when the broadcast is over", async () => {
    mockGet.mockResolvedValue({
      data: [{ id: "l", status: "VOD", video: { post_id: "page-1_555" } }],
    })

    expect(await getLiveState({ auth, postId: "page-1_555" })).toBe("ended")
  })

  test("asks only for the broadcasts that happened", async () => {
    mockGet.mockResolvedValue({ data: [] })

    await getLiveState({ auth, postId: "page-1_555" })

    expect(mockGet.mock.calls[0]?.[1].searchParams.broadcast_status).toBe(
      '["LIVE","LIVE_STOPPED","VOD","PROCESSING"]',
    )
  })

  test("is unknown when the post is not among the newest broadcasts", async () => {
    mockGet.mockResolvedValue({
      data: [{ id: "l", status: "LIVE_NOW", video: { post_id: "other" } }],
    })

    expect(await getLiveState({ auth, postId: "page-1_555" })).toBe("unknown")
  })

  test("a failed read propagates instead of ending the broadcast", async () => {
    mockGet.mockRejectedValue(new Error("boom"))

    await expect(getLiveState({ auth, postId: "page-1_555" })).rejects.toThrow()
  })
})
