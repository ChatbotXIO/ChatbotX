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

const { getManagedPost, listPagePosts } = await import("../src/apis/post")
const { MessengerAPIException } = await import("../src/exception")
const { facebookGraphClient } = await import("../src/lib/http-client")

const mockGet = facebookGraphClient.get as MockInstance

const auth = {
  metadata: { pageId: "page-1" },
  tokens: { accessToken: "page-token" },
} as never

/** Where a listing is on the posts edge (a listing starts on the Reels edge). */
const POSTS_CURSOR = JSON.stringify({ edge: "posts" })

const feedPost = (overrides: Record<string, unknown> = {}) => ({
  comments: { summary: { total_count: 4 } },
  created_time: "2026-11-20T08:00:00+0000",
  full_picture: "https://cdn.example/p.jpg",
  id: "page-1_100",
  is_published: true,
  message: "Hello",
  permalink_url: "https://facebook.com/page-1/posts/100",
  reactions: { summary: { total_count: 9 } },
  shares: { count: 2 },
  status_type: "added_photos",
  ...overrides,
})

describe("listPagePosts", () => {
  beforeEach(() => {
    mockGet.mockReset()
  })

  test("maps a Page post to the neutral item with its counts", async () => {
    mockGet.mockResolvedValue({ data: [feedPost()] })

    const page = await listPagePosts({ auth, cursor: POSTS_CURSOR, limit: 50 })

    expect(page.items).toEqual([
      {
        authorExternalId: null,
        authorName: null,
        caption: "Hello",
        commentsCount: 4,
        contentType: "photo",
        externalPostId: "page-1_100",
        liveStatus: null,
        mediaType: "added_photos",
        permalink: "https://facebook.com/page-1/posts/100",
        publishedAt: new Date("2026-11-20T08:00:00+0000"),
        reactionsCount: 9,
        sharesCount: 2,
        thumbnailUrl: "https://cdn.example/p.jpg",
        viewsCount: null,
      },
    ])
    expect(mockGet).toHaveBeenCalledWith(
      expect.stringContaining("/page-1/posts"),
      expect.objectContaining({
        headers: { Authorization: "Bearer page-token" },
        searchParams: expect.objectContaining({
          // `filter(stream)`: Graph's default is `toplevel`, which leaves replies out.
          fields: expect.stringContaining(
            "comments.limit(0).summary(true).filter(stream)",
          ),
          limit: "50",
        }),
      }),
    )
  })

  test("a single-post read asks for the same all-levels comment count", async () => {
    mockGet.mockResolvedValue(feedPost())

    await getManagedPost({ auth, postId: "page-1_100" })

    expect(mockGet).toHaveBeenCalledWith(
      expect.stringContaining("page-1_100"),
      expect.objectContaining({
        searchParams: {
          fields: expect.stringContaining(".filter(stream)"),
        },
      }),
    )
  })

  test("a count the Page edge leaves out is unknown, and a post nobody shared has zero shares", async () => {
    mockGet.mockResolvedValue({
      data: [
        feedPost({
          comments: undefined,
          reactions: undefined,
          shares: undefined,
        }),
      ],
    })

    const [item] = (
      await listPagePosts({ auth, cursor: POSTS_CURSOR, limit: 10 })
    ).items

    expect(item?.commentsCount).toBeNull()
    expect(item?.reactionsCount).toBeNull()
    expect(item?.sharesCount).toBe(0)
  })

  test.each([
    ["added_video", "video"],
    ["shared_story", "link"],
    ["mobile_status_update", "text"],
    ["wall_post", "text"],
    ["added_photos", "photo"],
    ["published_story", "text"],
    ["app_created_story", "other"],
    ["approved_friend", "other"],
    ["created_event", "other"],
    ["created_group", "other"],
    ["created_note", "other"],
    ["tagged_in_photo", "other"],
    ["something_new", "other"],
    [undefined, "other"],
  ])("status %s is a %s post", async (statusType, contentType) => {
    mockGet.mockResolvedValue({ data: [feedPost({ status_type: statusType })] })

    const [item] = (
      await listPagePosts({ auth, cursor: POSTS_CURSOR, limit: 10 })
    ).items

    expect(item?.contentType).toBe(contentType)
  })

  test("leaves scheduled (unpublished) posts out", async () => {
    mockGet.mockResolvedValue({
      data: [feedPost({ id: "a" }), feedPost({ id: "b", is_published: false })],
    })

    const page = await listPagePosts({ auth, cursor: POSTS_CURSOR, limit: 10 })

    expect(page.items.map((item) => item.externalPostId)).toEqual(["a"])
  })

  test("lists only the Page's own posts edge, never the feed that also carries visitors' posts", async () => {
    mockGet.mockResolvedValue({ data: [] })

    await listPagePosts({ auth, cursor: POSTS_CURSOR, limit: 10 })

    expect(mockGet.mock.calls[0]?.[0]).not.toContain("/feed")
  })

  test.each([
    0,
    -5,
    2.7,
    Number.NaN,
  ])("keeps a limit of %s inside what Facebook accepts", async (limit) => {
    mockGet.mockResolvedValue({ data: [] })

    await listPagePosts({ auth, limit })

    const sent = Number(mockGet.mock.calls[0]?.[1].searchParams.limit)
    expect(sent).toBeGreaterThanOrEqual(1)
    expect(sent).toBeLessThanOrEqual(100)
  })

  test("never asks Facebook for more than a hundred posts", async () => {
    mockGet.mockResolvedValue({ data: [] })

    await listPagePosts({ auth, cursor: POSTS_CURSOR, limit: 500 })

    expect(mockGet.mock.calls[0]?.[1].searchParams.limit).toBe("100")
  })

  test("the Reels edge is read first, so a long post history can never starve it", async () => {
    mockGet.mockResolvedValue({ data: [] })

    await listPagePosts({ auth, limit: 10 })

    expect(mockGet.mock.calls[0]?.[0]).toContain("/page-1/video_reels")
  })

  test("the end of the Reels continues on the live broadcasts, then the posts edge, and the end of the posts ends the listing", async () => {
    mockGet.mockResolvedValueOnce({
      data: [
        {
          created_time: "2026-11-19T08:00:00+0000",
          description: "My reel",
          id: "video-1",
          picture: "https://cdn.example/r.jpg",
          post_id: "page-1_reel",
        },
      ],
    })
    const reels = await listPagePosts({ auth, limit: 10 })

    mockGet.mockResolvedValueOnce({ data: [] })
    const live = await listPagePosts({
      auth,
      cursor: reels.nextCursor ?? undefined,
      limit: 10,
    })

    mockGet.mockResolvedValueOnce({ data: [feedPost()] })
    const posts = await listPagePosts({
      auth,
      cursor: live.nextCursor ?? undefined,
      limit: 10,
    })

    expect(reels.items[0]).toMatchObject({
      commentsCount: null,
      contentType: "reel",
      externalPostId: "page-1_reel",
      reactionsCount: null,
      sharesCount: null,
    })
    expect(JSON.parse(reels.nextCursor ?? "")).toEqual({ edge: "live" })
    expect(mockGet.mock.calls[1]?.[0]).toContain("/page-1/live_videos")
    expect(JSON.parse(live.nextCursor ?? "")).toEqual({ edge: "posts" })
    expect(mockGet.mock.calls[2]?.[0]).toContain("/page-1/posts")
    expect(posts.items).toHaveLength(1)
    expect(posts.nextCursor).toBeNull()
  })

  test("an edge with more pages hands on its cursor and resumes from it", async () => {
    mockGet.mockResolvedValueOnce({
      data: [feedPost()],
      paging: { cursors: { after: "AFTER-1" }, next: "https://next" },
    })
    const first = await listPagePosts({
      auth,
      cursor: POSTS_CURSOR,
      limit: 10,
    })
    mockGet.mockResolvedValueOnce({ data: [] })
    await listPagePosts({
      auth,
      cursor: first.nextCursor ?? undefined,
      limit: 10,
    })

    expect(JSON.parse(first.nextCursor ?? "")).toEqual({
      after: "AFTER-1",
      edge: "posts",
    })
    expect(mockGet.mock.calls[1]?.[1].searchParams.after).toBe("AFTER-1")
    expect(mockGet.mock.calls[1]?.[0]).toContain("/page-1/posts")
  })

  test("a Reels page with more pages keeps its own cursor", async () => {
    mockGet.mockResolvedValue({
      data: [],
      paging: { cursors: { after: "R-2" }, next: "https://next" },
    })

    const page = await listPagePosts({ auth, limit: 10 })

    expect(JSON.parse(page.nextCursor ?? "")).toEqual({
      after: "R-2",
      edge: "reels",
    })
  })

  test("rejects a cursor it did not issue", async () => {
    await expect(
      listPagePosts({
        auth,
        cursor: JSON.stringify({ edge: "stories" }),
        limit: 10,
      }),
    ).rejects.toMatchObject({ category: "payload_invalid" })
    expect(mockGet).not.toHaveBeenCalled()
  })

  test("reports a cursor that is not JSON as an invalid payload too", async () => {
    await expect(
      listPagePosts({ auth, cursor: "not json", limit: 10 }),
    ).rejects.toMatchObject({ category: "payload_invalid" })
  })
})

describe("getManagedPost", () => {
  test("reads one post with the listing's fields", async () => {
    mockGet.mockReset()
    mockGet.mockResolvedValue(feedPost({ id: "page-1_7" }))

    const item = await getManagedPost({ auth, postId: "page-1_7" })

    expect(item.externalPostId).toBe("page-1_7")
    expect(item.commentsCount).toBe(4)
    expect(mockGet.mock.calls[0]?.[0]).toContain("/page-1_7")
    expect(mockGet.mock.calls[0]?.[1].searchParams.fields).toContain("shares")
  })
})

const graphError = (code: number) =>
  new MessengerAPIException("Graph failed", 400, code, null, undefined, {
    errorBody: { error: { code } },
    httpStatus: 400,
  })

const fieldsOfCall = (index: number): string =>
  mockGet.mock.calls[index]?.[1].searchParams.fields

describe("post author (admin_creator)", () => {
  beforeEach(() => {
    mockGet.mockReset()
  })

  test("asks the posts edge for the admin creator and maps it to the author", async () => {
    mockGet.mockResolvedValue({
      data: [feedPost({ admin_creator: { id: "u-1", name: "Mai" } })],
    })

    const [item] = (
      await listPagePosts({ auth, cursor: POSTS_CURSOR, limit: 10 })
    ).items

    expect(fieldsOfCall(0)).toContain("admin_creator{id,name}")
    expect(item).toMatchObject({ authorExternalId: "u-1", authorName: "Mai" })
  })

  test.each([
    ["missing", undefined],
    ["null", null],
    ["malformed", { name: 5 }],
  ])("a %s creator leaves the author empty", async (_label, creator) => {
    mockGet.mockResolvedValue({
      data: [feedPost({ admin_creator: creator })],
    })

    const [item] = (
      await listPagePosts({ auth, cursor: POSTS_CURSOR, limit: 10 })
    ).items

    expect(item).toMatchObject({ authorExternalId: null, authorName: null })
  })

  test("a creator without a name still gives the id to filter by", async () => {
    mockGet.mockResolvedValue({
      data: [feedPost({ admin_creator: { id: "u-2" } })],
    })

    const [item] = (
      await listPagePosts({ auth, cursor: POSTS_CURSOR, limit: 10 })
    ).items

    expect(item).toMatchObject({ authorExternalId: "u-2", authorName: null })
  })

  test.each([
    100, 200, 283,
  ])("error %s retries the same page without the field and keeps the cursor", async (code) => {
    mockGet.mockRejectedValueOnce(graphError(code))
    mockGet.mockResolvedValueOnce({
      data: [feedPost()],
      paging: { cursors: { after: "AFTER-9" }, next: "https://next" },
    })

    const page = await listPagePosts({
      auth,
      cursor: JSON.stringify({ after: "AFTER-1", edge: "posts" }),
      limit: 10,
    })

    expect(mockGet).toHaveBeenCalledTimes(2)
    expect(fieldsOfCall(0)).toContain("admin_creator")
    expect(fieldsOfCall(1)).not.toContain("admin_creator")
    expect(mockGet.mock.calls[1]?.[1].searchParams.after).toBe("AFTER-1")
    expect(page.items).toHaveLength(1)
    expect(JSON.parse(page.nextCursor ?? "")).toEqual({
      after: "AFTER-9",
      edge: "posts",
    })
  })

  test("another error propagates without a retry", async () => {
    mockGet.mockRejectedValue(graphError(190))

    await expect(
      listPagePosts({ auth, cursor: POSTS_CURSOR, limit: 10 }),
    ).rejects.toMatchObject({ code: 190 })
    expect(mockGet).toHaveBeenCalledTimes(1)
  })

  test("an error that repeats without the field propagates", async () => {
    mockGet.mockRejectedValue(graphError(200))

    await expect(
      listPagePosts({ auth, cursor: POSTS_CURSOR, limit: 10 }),
    ).rejects.toMatchObject({ code: 200 })
    expect(mockGet).toHaveBeenCalledTimes(2)
  })

  test("the Reels edge is never asked for the field", async () => {
    mockGet.mockResolvedValue({ data: [] })

    await listPagePosts({ auth, limit: 10 })

    expect(fieldsOfCall(0)).not.toContain("admin_creator")
  })

  test("a single post carries the creator too, and retries without the field on a permission error", async () => {
    mockGet.mockResolvedValueOnce(
      feedPost({ admin_creator: { id: "u-1", name: "Mai" } }),
    )
    const withCreator = await getManagedPost({ auth, postId: "page-1_7" })

    mockGet.mockRejectedValueOnce(graphError(283))
    mockGet.mockResolvedValueOnce(feedPost())
    const without = await getManagedPost({ auth, postId: "page-1_7" })

    expect(withCreator.authorName).toBe("Mai")
    expect(fieldsOfCall(0)).toContain("admin_creator{id,name}")
    expect(fieldsOfCall(2)).not.toContain("admin_creator")
    expect(without.authorExternalId).toBeNull()
  })
})

describe("listPagePosts live broadcasts", () => {
  const LIVE_CURSOR = JSON.stringify({ edge: "live" })
  const liveVideo = (overrides: Record<string, unknown> = {}) => ({
    broadcast_start_time: "2026-11-24T09:00:00+0000",
    description: "Evening live",
    id: "live-1",
    permalink_url: "https://facebook.com/page-1/videos/live-1",
    status: "LIVE_NOW",
    video: { id: "video-1", live_status: "LIVE", post_id: "page-1_555" },
    ...overrides,
  })

  beforeEach(() => {
    mockGet.mockReset()
  })

  test("a broadcast on the air is a live post on the id the feed reports", async () => {
    mockGet.mockResolvedValue({ data: [liveVideo()] })

    const page = await listPagePosts({ auth, cursor: LIVE_CURSOR, limit: 10 })

    expect(page.items).toEqual([
      {
        authorExternalId: null,
        authorName: null,
        caption: "Evening live",
        commentsCount: null,
        contentType: "live",
        externalPostId: "page-1_555",
        liveStatus: "live",
        mediaType: "live",
        permalink: "https://facebook.com/page-1/videos/live-1",
        publishedAt: new Date("2026-11-24T09:00:00+0000"),
        reactionsCount: null,
        sharesCount: null,
        thumbnailUrl: null,
        viewsCount: null,
      },
    ])
    expect(mockGet.mock.calls[0]?.[1].searchParams.fields).toContain(
      "video{id,post_id,live_status}",
    )
    expect(mockGet.mock.calls[0]?.[1].searchParams.broadcast_status).toBe(
      '["LIVE","LIVE_STOPPED","VOD","PROCESSING"]',
    )
  })

  test("a past broadcast is listed as ended", async () => {
    mockGet.mockResolvedValue({
      data: [
        liveVideo({
          id: "live-old",
          status: "VOD",
          video: { post_id: "page-1_400" },
        }),
      ],
    })

    const page = await listPagePosts({ auth, cursor: LIVE_CURSOR, limit: 10 })

    expect(page.items).toHaveLength(1)
    expect(page.items[0]).toMatchObject({
      contentType: "live",
      externalPostId: "page-1_400",
      liveStatus: "ended",
    })
  })

  test.each([
    "LIVE_STOPPED",
    "VOD",
    "PROCESSING",
  ])("a %s broadcast is ended", async (status) => {
    mockGet.mockResolvedValue({ data: [liveVideo({ status })] })

    const page = await listPagePosts({ auth, cursor: LIVE_CURSOR, limit: 10 })

    expect(page.items[0]?.liveStatus).toBe("ended")
  })

  test("a broadcast the filter names LIVE is live", async () => {
    mockGet.mockResolvedValue({ data: [liveVideo({ status: "LIVE" })] })

    const page = await listPagePosts({ auth, cursor: LIVE_CURSOR, limit: 10 })

    expect(page.items[0]?.liveStatus).toBe("live")
  })

  test.each([
    "SCHEDULED_UNPUBLISHED",
    "SCHEDULED_LIVE",
    "SCHEDULED_CANCELED",
    "SCHEDULED_EXPIRED",
    "UNPUBLISHED",
    "SOMETHING_NEW",
  ])("leaves a %s broadcast out", async (status) => {
    mockGet.mockResolvedValue({ data: [liveVideo({ status })] })

    const page = await listPagePosts({ auth, cursor: LIVE_CURSOR, limit: 10 })

    expect(page.items).toEqual([])
  })

  test("skips a broadcast with no post id and never builds one from other ids", async () => {
    mockGet.mockResolvedValue({
      data: [liveVideo({ video: { id: "video-1", live_status: "LIVE" } })],
    })

    const page = await listPagePosts({ auth, cursor: LIVE_CURSOR, limit: 10 })

    expect(page.items).toEqual([])
  })

  test("pages through the past broadcasts with its own cursor", async () => {
    mockGet.mockResolvedValue({
      data: [],
      paging: { cursors: { after: "L-2" }, next: "https://next" },
    })

    const page = await listPagePosts({ auth, cursor: LIVE_CURSOR, limit: 10 })

    expect(JSON.parse(page.nextCursor ?? "")).toEqual({
      after: "L-2",
      edge: "live",
    })
  })

  test("a token that cannot read the live edge still lists the posts", async () => {
    mockGet.mockRejectedValue(new Error("(#200) permission"))

    const page = await listPagePosts({ auth, cursor: LIVE_CURSOR, limit: 10 })

    expect(page.items).toEqual([])
    expect(JSON.parse(page.nextCursor ?? "")).toEqual({ edge: "posts" })
  })
})
