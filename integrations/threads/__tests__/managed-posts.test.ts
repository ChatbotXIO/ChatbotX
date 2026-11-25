import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test } from "vitest"
import { getManagedPost, listManagedPosts } from "../src/apis/post"
import { API_URL } from "../src/constants"
import type { ThreadsAuthValue } from "../src/schema"

const auth = {
  tokens: { accessToken: "threads-token" },
  metadata: { threadsUserId: "u1", username: "shop", version: "v1.0" },
} as ThreadsAuthValue

const post = (overrides: Record<string, unknown> = {}) => ({
  id: "1001",
  media_type: "TEXT_POST",
  permalink: "https://www.threads.com/@shop/post/abc",
  text: "Hello",
  timestamp: "2026-11-20T08:00:00+0000",
  username: "shop",
  ...overrides,
})

describe("listManagedPosts", () => {
  test("maps posts to the neutral item, with unknown counts and no individual author", async () => {
    server.use(
      http.get(`${API_URL}/v1.0/me/threads`, ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get("fields")).not.toContain("username")
        expect(url.searchParams.get("limit")).toBe("25")
        expect(url.searchParams.has("after")).toBe(false)
        return HttpResponse.json({ data: [post()] })
      }),
    )

    const page = await listManagedPosts({ auth, limit: 25 })

    expect(page.items).toEqual([
      {
        authorExternalId: null,
        authorName: null,
        caption: "Hello",
        commentsCount: null,
        contentType: "text",
        externalPostId: "1001",
        liveStatus: null,
        mediaType: "TEXT_POST",
        permalink: "https://www.threads.com/@shop/post/abc",
        publishedAt: new Date("2026-11-20T08:00:00+0000"),
        reactionsCount: null,
        sharesCount: null,
        thumbnailUrl: null,
        viewsCount: null,
      },
    ])
    expect(page.nextCursor).toBeNull()
  })

  test.each([
    ["IMAGE", "photo"],
    ["VIDEO", "video"],
    ["CAROUSEL_ALBUM", "carousel"],
    ["AUDIO", "audio"],
    ["SOMETHING_NEW", "other"],
  ])("media type %s is a %s post", async (mediaType, contentType) => {
    server.use(
      http.get(`${API_URL}/v1.0/me/threads`, () =>
        HttpResponse.json({ data: [post({ media_type: mediaType })] }),
      ),
    )

    const [item] = (await listManagedPosts({ auth, limit: 10 })).items

    expect(item?.contentType).toBe(contentType)
  })

  test("drops reposts but still pages past them", async () => {
    server.use(
      http.get(`${API_URL}/v1.0/me/threads`, () =>
        HttpResponse.json({
          data: [post({ id: "r1", media_type: "REPOST_FACADE" })],
          paging: { cursors: { after: "NEXT" } },
        }),
      ),
    )

    const page = await listManagedPosts({ auth, limit: 10 })

    expect(page.items).toEqual([])
    expect(page.nextCursor).toBe("NEXT")
  })

  test("a page with posts and an after cursor continues; the first empty page ends it", async () => {
    server.use(
      http.get(`${API_URL}/v1.0/me/threads`, ({ request }) => {
        const after = new URL(request.url).searchParams.get("after")
        return after === "NEXT"
          ? HttpResponse.json({
              data: [],
              paging: { cursors: { after: "END" } },
            })
          : HttpResponse.json({
              data: [post()],
              paging: { cursors: { after: "NEXT" } },
            })
      }),
    )

    const first = await listManagedPosts({ auth, limit: 10 })
    const second = await listManagedPosts({
      auth,
      cursor: first.nextCursor ?? undefined,
      limit: 10,
    })

    expect(first.nextCursor).toBe("NEXT")
    expect(second.items).toEqual([])
    expect(second.nextCursor).toBeNull()
  })

  test("a page that hands back the cursor it was asked with ends the listing", async () => {
    server.use(
      http.get(`${API_URL}/v1.0/me/threads`, () =>
        HttpResponse.json({
          data: [post()],
          paging: { cursors: { after: "STUCK" } },
        }),
      ),
    )

    const page = await listManagedPosts({ auth, cursor: "STUCK", limit: 10 })

    expect(page.items).toHaveLength(1)
    expect(page.nextCursor).toBeNull()
  })

  test("never asks for more than a hundred posts", async () => {
    server.use(
      http.get(`${API_URL}/v1.0/me/threads`, ({ request }) => {
        expect(new URL(request.url).searchParams.get("limit")).toBe("100")
        return HttpResponse.json({ data: [] })
      }),
    )

    await listManagedPosts({ auth, limit: 1000 })
  })
})

describe("getManagedPost", () => {
  test("reads one post with the listing's fields", async () => {
    server.use(
      http.get(`${API_URL}/v1.0/1001`, ({ request }) => {
        expect(new URL(request.url).searchParams.get("fields")).not.toContain(
          "username",
        )
        return HttpResponse.json(post())
      }),
    )

    const item = await getManagedPost({ auth, postId: "1001" })

    expect(item.externalPostId).toBe("1001")
    expect(item.authorName).toBeNull()
  })
})
