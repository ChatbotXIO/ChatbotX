import { ChannelError, ChannelErrorCategory } from "@chatbotx.io/sdk"
import { beforeEach, describe, expect, test, vi } from "vitest"

const get = vi.fn()
const refreshTiktokAuth = vi.fn()

vi.mock("../src/lib/http-client", () => ({
  createTiktokBusinessClient: () => ({ get, post: vi.fn() }),
}))
vi.mock("../src/lib/refresh-auth", () => ({ refreshTiktokAuth }))

const { postHandlers } = await import("../src/handlers/post")
const { TIKTOK_COMMENT_DEDUPE_WINDOW } = await import(
  "../src/lib/post-comments"
)
const { integration } = await import("../src/integration")

const auth = {
  authType: "oauth2",
  metadata: { openId: "biz-1" },
  tokens: { accessToken: "token" },
} as never
const ctx = { auth } as never

const comment = (id: string, extra: Record<string, unknown> = {}) => ({
  comment_id: id,
  video_id: "v1",
  user_id: "user-1",
  unique_identifier: "uid-1",
  create_time: 1_793_577_600,
  text: `text ${id}`,
  display_name: "Ann",
  username: "ann",
  status: "PUBLIC",
  owner: false,
  replies: 0,
  ...extra,
})

const ok = (data: Record<string, unknown>) => ({ code: 0, data })

const listComments = (cursor?: string) =>
  postHandlers.listComments?.({ ctx, data: { postId: "v1", cursor } } as never)

const traverse = async (): Promise<string[]> => {
  const ids: string[] = []
  let cursor: string | undefined
  do {
    const page = await listComments(cursor)
    ids.push(...(page?.items.map((item) => item.id) ?? []))
    cursor = page?.nextCursor ?? undefined
  } while (cursor)
  return ids
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("tiktok listComments", () => {
  test("maps comment, nested reply, owner and hidden flags", async () => {
    get.mockResolvedValueOnce(
      ok({
        comments: [
          comment("c1", {
            status: "HIDDEN",
            owner: true,
            replies: 1,
            reply_list: [
              comment("r1", {
                parent_comment_id: "c1",
                display_name: undefined,
              }),
            ],
          }),
        ],
        has_more: false,
      }),
    )

    const page = await listComments()

    expect(page?.items).toEqual([
      {
        author: { id: "uid-1", name: "Ann" },
        createdAt: new Date(1_793_577_600 * 1000),
        fromOwner: true,
        hidden: true,
        id: "c1",
        parentId: null,
        text: "text c1",
      },
      {
        author: { id: "uid-1", name: "ann" },
        createdAt: new Date(1_793_577_600 * 1000),
        fromOwner: false,
        hidden: false,
        id: "r1",
        parentId: "c1",
        text: "text r1",
      },
    ])
    expect(page?.nextCursor).toBeNull()
    expect(get.mock.calls[0][1].searchParams).toMatchObject({
      include_replies: "true",
      max_count: "30",
      status: "ALL",
      video_id: "v1",
    })
  })

  test("ignores parent_comment_id: top-level is null even when TikTok sends 0", async () => {
    get.mockResolvedValueOnce(
      ok({
        comments: [
          comment("c1", {
            parent_comment_id: "0",
            replies: 1,
            reply_list: [comment("r1", { parent_comment_id: "0" })],
          }),
        ],
        has_more: false,
      }),
    )

    const page = await listComments()

    expect(page?.items.map((item) => [item.id, item.parentId])).toEqual([
      ["c1", null],
      ["r1", "c1"],
    ])
  })

  test("reads the replies edge when the reply count is missing and the nested list is full", async () => {
    get
      .mockResolvedValueOnce(
        ok({
          comments: [
            comment("c1", {
              replies: undefined,
              reply_list: [comment("r1"), comment("r2"), comment("r3")],
            }),
          ],
          has_more: false,
        }),
      )
      .mockResolvedValueOnce(
        ok({
          comments: [
            comment("r1"),
            comment("r2"),
            comment("r3"),
            comment("r4"),
          ],
          has_more: false,
        }),
      )

    expect(await traverse()).toEqual(["c1", "r1", "r2", "r3", "r4"])
    expect(get.mock.calls[1][0]).toBe("business/comment/reply/list/")
  })

  test("trusts a short nested list when the reply count is missing", async () => {
    get.mockResolvedValueOnce(
      ok({
        comments: [
          comment("c1", { replies: undefined, reply_list: [comment("r1")] }),
        ],
        has_more: false,
      }),
    )

    expect(await traverse()).toEqual(["c1", "r1"])
    expect(get).toHaveBeenCalledTimes(1)
  })

  test("reports a missing create_time as null, not epoch 0", async () => {
    get.mockResolvedValueOnce(
      ok({
        comments: [comment("c1", { create_time: undefined })],
        has_more: false,
      }),
    )

    expect((await listComments())?.items[0]?.createdAt).toBeNull()
  })

  test("returns an empty page for a video without comments", async () => {
    get.mockResolvedValueOnce(ok({ comments: [], has_more: false }))

    expect(await listComments()).toEqual({ items: [], nextCursor: null })
  })

  test("pages top-level comments by the numeric cursor to the end", async () => {
    get
      .mockResolvedValueOnce(
        ok({ comments: [comment("c1")], has_more: true, cursor: 30 }),
      )
      .mockResolvedValueOnce(ok({ comments: [comment("c2")], has_more: false }))

    expect(await traverse()).toEqual(["c1", "c2"])
    expect(get.mock.calls[1][1].searchParams).toMatchObject({ cursor: "30" })
  })

  test("reads the replies edge of a comment with more than the nested three, once", async () => {
    get
      .mockResolvedValueOnce(
        ok({
          comments: [
            comment("c1", {
              replies: 4,
              reply_list: [comment("r1"), comment("r2"), comment("r3")],
            }),
          ],
          has_more: true,
          cursor: 30,
        }),
      )
      .mockResolvedValueOnce(
        ok({
          comments: [comment("r1"), comment("r2")],
          has_more: true,
          cursor: 2,
        }),
      )
      .mockResolvedValueOnce(
        ok({ comments: [comment("r3"), comment("r4")], has_more: false }),
      )
      .mockResolvedValueOnce(ok({ comments: [comment("c2")], has_more: false }))

    expect(await traverse()).toEqual(["c1", "r1", "r2", "r3", "r4", "c2"])
    expect(get.mock.calls.map(([path]) => path)).toEqual([
      "business/comment/list/",
      "business/comment/reply/list/",
      "business/comment/reply/list/",
      "business/comment/list/",
    ])
    expect(get.mock.calls[2][1].searchParams).toMatchObject({
      comment_id: "c1",
      cursor: "2",
    })
  })

  test("past 500 top-level comments a repeated one is skipped: exported once, its replies read once", async () => {
    const firstFive = Array.from({ length: 500 }, (_, index) =>
      index === 2
        ? comment("c3", {
            replies: 4,
            reply_list: [comment("r1"), comment("r2"), comment("r3")],
          })
        : comment(`c${index + 1}`),
    )
    get
      .mockResolvedValueOnce(
        ok({ comments: firstFive, has_more: true, cursor: 500 }),
      )
      // The replies edge of c3, read once.
      .mockResolvedValueOnce(
        ok({ comments: [comment("r1"), comment("r4")], has_more: false }),
      )
      // Beyond the first 500 TikTok repeats c3 (and c1) and adds a new comment.
      .mockResolvedValueOnce(
        ok({
          comments: [
            comment("c3", {
              replies: 4,
              reply_list: [comment("r1"), comment("r2"), comment("r3")],
            }),
            comment("c1"),
            comment("c501"),
          ],
          has_more: false,
        }),
      )

    const ids = await traverse()

    expect(ids.filter((id) => id === "c3")).toHaveLength(1)
    expect(ids.filter((id) => id === "c1")).toHaveLength(1)
    expect(ids.filter((id) => id === "r1")).toHaveLength(1)
    expect(ids).toContain("c501")
    expect(new Set(ids).size).toBe(ids.length)
    expect(get.mock.calls.map(([path]) => path)).toEqual([
      "business/comment/list/",
      "business/comment/reply/list/",
      "business/comment/list/",
    ])
  })

  test("keeps at most the dedupe window of ids in the cursor and accepts a cursor made without them", async () => {
    get.mockResolvedValueOnce(
      ok({
        comments: Array.from({ length: 520 }, (_, index) =>
          comment(`c${index}`),
        ),
        has_more: true,
        cursor: 520,
      }),
    )

    const page = await listComments()
    const state = JSON.parse(
      Buffer.from(page?.nextCursor ?? "", "base64url").toString("utf8"),
    ) as { seen: string[] }

    expect(state.seen).toHaveLength(TIKTOK_COMMENT_DEDUPE_WINDOW)
    expect(page?.items).toHaveLength(520)

    get.mockResolvedValueOnce(ok({ comments: [], has_more: false }))
    const legacy = Buffer.from(
      JSON.stringify({ pending: [], top: 30 }),
      "utf8",
    ).toString("base64url")
    await expect(listComments(legacy)).resolves.toMatchObject({
      nextCursor: null,
    })
  })

  test("rejects an invalid cursor as PAYLOAD_INVALID", async () => {
    const error = await listComments("garbage!!").catch(
      (caught: unknown) => caught,
    )

    expect(error).toBeInstanceOf(ChannelError)
    expect((error as ChannelError).category).toBe(
      ChannelErrorCategory.PAYLOAD_INVALID,
    )
    expect(get).not.toHaveBeenCalled()
  })

  test("propagates a Business API rejection", async () => {
    get.mockResolvedValueOnce({ code: 40_002, message: "Video not found" })

    await expect(listComments()).rejects.toMatchObject({ code: 40_002 })
  })

  test("refreshes an expired token and retries once through runChannelHandler", async () => {
    const refreshed = {
      ...(auth as object),
      tokens: { accessToken: "fresh" },
    }
    refreshTiktokAuth.mockResolvedValueOnce(refreshed)
    get
      .mockResolvedValueOnce({
        code: 40_105,
        message: "Access token is incorrect or has been revoked.",
      })
      .mockResolvedValueOnce(ok({ comments: [comment("c1")], has_more: false }))

    const page = await integration.runChannelHandler("post", "listComments", {
      ctx,
      data: { postId: "v1" },
    } as never)

    expect(refreshTiktokAuth).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledTimes(2)
    expect(page.items.map((item) => item.id)).toEqual(["c1"])
  })
})
