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

const {
  getLiveState,
  LIVE_STATE_MAX_PAGES,
  liveVideoBroadcastStatus,
  readLiveBroadcast,
} = await import("../src/apis/live-video")
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

  test("is unknown when the post is not among the broadcasts", async () => {
    mockGet.mockResolvedValue({
      data: [{ id: "l", status: "LIVE_NOW", video: { post_id: "other" } }],
    })

    expect(await getLiveState({ auth, postId: "page-1_555" })).toBe("unknown")
  })

  const broadcast = (postId: string) => ({
    id: `l-${postId}`,
    status: "VOD",
    video: { post_id: postId },
  })
  const pageWith = (postId: string, after?: string) => ({
    data: [broadcast(postId)],
    ...(after
      ? {
          paging: {
            cursors: { after },
            next: `https://graph/next?after=${after}`,
          },
        }
      : {}),
  })

  test("finds a broadcast on a later page by following the cursor", async () => {
    mockGet
      .mockResolvedValueOnce(pageWith("other-1", "c1"))
      .mockResolvedValueOnce(pageWith("page-1_555"))

    expect(await getLiveState({ auth, postId: "page-1_555" })).toBe("ended")
    expect(mockGet).toHaveBeenCalledTimes(2)
    expect(mockGet.mock.calls[0]?.[1].searchParams.after).toBeUndefined()
    expect(mockGet.mock.calls[1]?.[1].searchParams.after).toBe("c1")
  })

  test("is unknown after the last page does not hold the post", async () => {
    mockGet
      .mockResolvedValueOnce(pageWith("other-1", "c1"))
      .mockResolvedValueOnce(pageWith("other-2"))

    expect(await getLiveState({ auth, postId: "page-1_555" })).toBe("unknown")
    expect(mockGet).toHaveBeenCalledTimes(2)
  })

  test("stops at the page cap and answers unknown", async () => {
    let n = 0
    mockGet.mockImplementation(() => {
      n += 1
      return Promise.resolve(pageWith(`other-${n}`, `c${n}`))
    })

    expect(await getLiveState({ auth, postId: "page-1_555" })).toBe("unknown")
    expect(mockGet).toHaveBeenCalledTimes(LIVE_STATE_MAX_PAGES)
  })

  test("a cursor that repeats ends the walk as unknown", async () => {
    mockGet.mockResolvedValue(pageWith("other-1", "same"))

    expect(await getLiveState({ auth, postId: "page-1_555" })).toBe("unknown")
    expect(mockGet).toHaveBeenCalledTimes(2)
  })

  test("a next link without a cursor ends the walk as unknown", async () => {
    mockGet.mockResolvedValue({
      data: [broadcast("other-1")],
      paging: { next: "https://graph/next" },
    })

    expect(await getLiveState({ auth, postId: "page-1_555" })).toBe("unknown")
    expect(mockGet).toHaveBeenCalledTimes(1)
  })

  test("a failure on a later page propagates and never ends the broadcast", async () => {
    mockGet
      .mockResolvedValueOnce(pageWith("other-1", "c1"))
      .mockRejectedValueOnce(new Error("boom"))

    await expect(getLiveState({ auth, postId: "page-1_555" })).rejects.toThrow()
  })

  test("a failed read propagates instead of ending the broadcast", async () => {
    mockGet.mockRejectedValue(new Error("boom"))

    await expect(getLiveState({ auth, postId: "page-1_555" })).rejects.toThrow()
  })
})
