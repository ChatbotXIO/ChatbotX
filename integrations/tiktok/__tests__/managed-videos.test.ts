import { beforeEach, describe, expect, test, vi } from "vitest"

const get = vi.fn()

vi.mock("../src/lib/http-client", () => ({
  createTiktokBusinessClient: () => ({ get }),
}))

const { getManagedVideo, listManagedVideos } = await import("../src/apis/video")

const auth = (scopes: string[] = ["video.list"]) =>
  ({
    metadata: { openId: "biz-1", scopes },
    tokens: { accessToken: "token" },
  }) as never

const video = (overrides: Record<string, unknown> = {}) => ({
  caption: "My video",
  comments: 5,
  create_time: 1_793_577_600,
  item_id: "7203946942097902849",
  share_url: "https://www.tiktok.com/@shop/video/7203946942097902849",
  thumbnail_url: "https://cdn.example/t.jpg",
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe("listManagedVideos", () => {
  test("maps a video to the neutral item with unknown reactions, shares and views", async () => {
    get.mockResolvedValueOnce({ code: 0, data: { videos: [video()] } })

    const page = await listManagedVideos({ auth: auth(), limit: 10 })

    expect(page.items).toEqual([
      {
        authorExternalId: null,
        authorName: null,
        caption: "My video",
        commentsCount: 5,
        contentType: "video",
        externalPostId: "7203946942097902849",
        liveStatus: null,
        mediaType: null,
        permalink: "https://www.tiktok.com/@shop/video/7203946942097902849",
        publishedAt: new Date(1_793_577_600 * 1000),
        reactionsCount: null,
        sharesCount: null,
        thumbnailUrl: "https://cdn.example/t.jpg",
        viewsCount: null,
      },
    ])
    expect(page.nextCursor).toBeNull()
    expect(get).toHaveBeenCalledWith(
      "business/videos/list/",
      expect.objectContaining({
        searchParams: expect.objectContaining({
          business_id: "biz-1",
          max_count: "10",
        }),
      }),
    )
  })

  test("a page asks for at most twenty videos", async () => {
    get.mockResolvedValueOnce({ code: 0, data: { videos: [] } })

    await listManagedVideos({ auth: auth(), limit: 500 })

    expect(get.mock.calls[0]?.[1].searchParams.max_count).toBe("20")
  })

  test("hands on the numeric cursor as a string while TikTok has more, and sends it back as a number", async () => {
    get.mockResolvedValueOnce({
      code: 0,
      data: { cursor: 1_793_000_000, has_more: true, videos: [video()] },
    })
    const first = await listManagedVideos({ auth: auth(), limit: 10 })

    get.mockResolvedValueOnce({
      code: 0,
      data: { cursor: 1_792_000_000, has_more: false, videos: [] },
    })
    const last = await listManagedVideos({
      auth: auth(),
      cursor: first.nextCursor ?? undefined,
      limit: 10,
    })

    expect(first.nextCursor).toBe("1793000000")
    expect(get.mock.calls[1]?.[1].searchParams.cursor).toBe("1793000000")
    expect(last.nextCursor).toBeNull()
  })

  test("a connection without the video.list permission fails as an authorization error", async () => {
    await expect(
      listManagedVideos({ auth: auth([]), limit: 10 }),
    ).rejects.toMatchObject({ category: "auth_failed" })
    expect(get).not.toHaveBeenCalled()
  })

  test.each([
    "abc",
    "-1",
    "1.5",
    "",
  ])("rejects the cursor %j it did not issue", async (cursor) => {
    await expect(
      listManagedVideos({ auth: auth(), cursor, limit: 10 }),
    ).rejects.toMatchObject({ category: "payload_invalid" })
    expect(get).not.toHaveBeenCalled()
  })

  test.each([
    0, -3, 2.9,
  ])("keeps a limit of %s inside what TikTok accepts", async (limit) => {
    get.mockResolvedValueOnce({ code: 0, data: { videos: [] } })

    await listManagedVideos({ auth: auth(), limit })

    const sent = Number(get.mock.calls[0]?.[1].searchParams.max_count)
    expect(sent).toBeGreaterThanOrEqual(1)
    expect(sent).toBeLessThanOrEqual(20)
  })

  test("a rejected response is an error, not an empty page", async () => {
    get.mockResolvedValueOnce({ code: 40_001, message: "bad" })

    await expect(
      listManagedVideos({ auth: auth(), limit: 10 }),
    ).rejects.toThrow()
  })
})

describe("getManagedVideo", () => {
  test("reads one video by id", async () => {
    get.mockResolvedValueOnce({
      code: 0,
      data: { videos: [video({ item_id: "42" })] },
    })

    const item = await getManagedVideo({ auth: auth(), postId: "42" })

    expect(item.externalPostId).toBe("42")
  })

  test("an empty answer to the id lookup proves the video is gone", async () => {
    get.mockResolvedValueOnce({ code: 0, data: { videos: [] } })

    await expect(
      getManagedVideo({ auth: auth(), postId: "42" }),
    ).rejects.toMatchObject({ category: "not_found" })
  })

  test("a video list without the requested id means the filter was ignored, which proves nothing", async () => {
    get.mockResolvedValueOnce({
      code: 0,
      data: { videos: [video({ item_id: "newest" })] },
    })

    await expect(
      getManagedVideo({ auth: auth(), postId: "42" }),
    ).rejects.toMatchObject({ category: "unknown" })
  })

  test("needs the video.list permission", async () => {
    await expect(
      getManagedVideo({ auth: auth([]), postId: "42" }),
    ).rejects.toMatchObject({ category: "auth_failed" })
  })
})
