import { ChannelError, ChannelErrorCategory } from "@chatbotx.io/sdk"
import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test } from "vitest"
import { API_URL, DEFAULT_API_VERSION } from "../src/constants"
import { postHandlers } from "../src/handlers/post"
import type { InstagramAuthValue } from "../src/schema"

const IG_ID = "ig-account-1"
const MEDIA_ID = "media-1"
const MEDIA_COMMENTS_URL = `${API_URL}/${DEFAULT_API_VERSION}/${MEDIA_ID}/comments`

const ctx = {
  auth: {
    tokens: { accessToken: "IG_TOKEN" },
    metadata: { igId: IG_ID, version: DEFAULT_API_VERSION },
  } as unknown as InstagramAuthValue,
} as never

const comment = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  text: `text ${id}`,
  timestamp: "2026-01-02T03:04:05+0000",
  from: { id: "user-1", username: "ann" },
  ...extra,
})

const paging = (after: string) => ({
  cursors: { after },
  next: `https://graph.example/next?after=${after}`,
})

const listComments = (cursor?: string) =>
  postHandlers.listComments?.({
    ctx,
    data: { postId: MEDIA_ID, cursor },
  } as never)

/** Pages through the handler until the cursor ends, returning every item id. */
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

describe("instagram-facebook listComments", () => {
  test("maps a comment and its nested reply, flagging the account's own", async () => {
    server.use(
      http.get(MEDIA_COMMENTS_URL, ({ request }) => {
        const fields = new URL(request.url).searchParams.get("fields")
        expect(fields).toContain("hidden")
        expect(fields).toContain("replies{")
        return HttpResponse.json({
          data: [
            comment("c1", {
              hidden: true,
              replies: {
                data: [
                  comment("r1", {
                    parent_id: "c1",
                    from: { id: IG_ID, username: "shop" },
                  }),
                ],
              },
            }),
          ],
        })
      }),
    )

    const page = await listComments()

    expect(page).toEqual({
      items: [
        {
          author: { id: "user-1", name: "ann" },
          createdAt: new Date("2026-01-02T03:04:05+0000"),
          fromOwner: false,
          hidden: true,
          id: "c1",
          parentId: null,
          text: "text c1",
        },
        {
          author: { id: IG_ID, name: "shop" },
          createdAt: new Date("2026-01-02T03:04:05+0000"),
          fromOwner: true,
          hidden: null,
          id: "r1",
          parentId: "c1",
          text: "text r1",
        },
      ],
      nextCursor: null,
      pauseMs: null,
    })
  })

  test("returns an empty page for a media without comments", async () => {
    server.use(
      http.get(MEDIA_COMMENTS_URL, () => HttpResponse.json({ data: [] })),
    )

    expect(await listComments()).toEqual({
      items: [],
      nextCursor: null,
      pauseMs: null,
    })
  })

  test("passes the pause the usage headers ask for on a top-level page", async () => {
    server.use(
      http.get(MEDIA_COMMENTS_URL, () =>
        HttpResponse.json(
          { data: [comment("c1")] },
          { headers: { "x-app-usage": JSON.stringify({ call_count: 95 }) } },
        ),
      ),
    )

    expect((await listComments())?.pauseMs).toBe(30_000)
  })

  test("pages top-level comments to the end", async () => {
    server.use(
      http.get(MEDIA_COMMENTS_URL, ({ request }) => {
        const after = new URL(request.url).searchParams.get("after")
        return after === "TOP-2"
          ? HttpResponse.json({ data: [comment("c3")] })
          : HttpResponse.json({
              data: [comment("c1"), comment("c2")],
              paging: paging("TOP-2"),
            })
      }),
    )

    expect(await traverse()).toEqual(["c1", "c2", "c3"])
  })

  test("fully traverses a comment's paged replies before the next top-level page", async () => {
    const calls: string[] = []
    server.use(
      http.get(MEDIA_COMMENTS_URL, ({ request }) => {
        const after = new URL(request.url).searchParams.get("after")
        calls.push(`top:${after}`)
        return after === "TOP-2"
          ? HttpResponse.json({ data: [comment("c2")] })
          : HttpResponse.json({
              data: [
                comment("c1", {
                  replies: {
                    data: [comment("r1", { parent_id: "c1" })],
                    paging: paging("REP-2"),
                  },
                }),
              ],
              paging: paging("TOP-2"),
            })
      }),
      http.get(
        `${API_URL}/${DEFAULT_API_VERSION}/c1/replies`,
        ({ request }) => {
          const after = new URL(request.url).searchParams.get("after")
          calls.push(`replies:${after}`)
          return after === "REP-3"
            ? HttpResponse.json({ data: [comment("r3")] })
            : HttpResponse.json({
                data: [comment("r2")],
                paging: paging("REP-3"),
              })
        },
      ),
    )

    expect(await traverse()).toEqual(["c1", "r1", "r2", "r3", "c2"])
    expect(calls).toEqual([
      "top:null",
      "replies:REP-2",
      "replies:REP-3",
      "top:TOP-2",
    ])
  })

  test("parents replies read from the replies edge to their comment", async () => {
    server.use(
      http.get(MEDIA_COMMENTS_URL, () =>
        HttpResponse.json({
          data: [
            comment("c1", {
              replies: { data: [], paging: paging("REP-2") },
            }),
          ],
        }),
      ),
      http.get(`${API_URL}/${DEFAULT_API_VERSION}/c1/replies`, () =>
        HttpResponse.json({ data: [comment("r2")] }),
      ),
    )

    const first = await listComments()
    const second = await listComments(first?.nextCursor ?? undefined)

    expect(second?.items[0]).toMatchObject({ id: "r2", parentId: "c1" })
    expect(second?.nextCursor).toBeNull()
  })

  test("rejects an invalid cursor as PAYLOAD_INVALID", async () => {
    const error = await listComments("not-a-cursor!!").catch(
      (caught: unknown) => caught,
    )

    expect(error).toBeInstanceOf(ChannelError)
    expect((error as ChannelError).category).toBe(
      ChannelErrorCategory.PAYLOAD_INVALID,
    )
  })

  test("rejects a well-formed cursor of the wrong shape", async () => {
    const cursor = Buffer.from(JSON.stringify({ top: 5 })).toString("base64url")

    await expect(listComments(cursor)).rejects.toBeInstanceOf(ChannelError)
  })

  test("propagates an Instagram error instead of returning a partial page", async () => {
    server.use(
      http.get(MEDIA_COMMENTS_URL, () =>
        HttpResponse.json(
          { error: { message: "Rate limit", code: 4, type: "OAuthException" } },
          { status: 400 },
        ),
      ),
    )

    await expect(listComments()).rejects.toThrow()
  })
})
