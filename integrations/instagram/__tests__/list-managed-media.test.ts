import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test } from "vitest"
import { getManagedMedia, listManagedMedia } from "../src/apis/post"
import { API_URL, DEFAULT_API_VERSION } from "../src/constants"
import { isUnsupportedFieldError } from "../src/exception"
import type { InstagramAuthValue } from "../src/schema"

const auth = {
  tokens: { accessToken: "IG_TOKEN" },
  metadata: { version: DEFAULT_API_VERSION },
} as unknown as InstagramAuthValue
const MEDIA_URL = `${API_URL}/${DEFAULT_API_VERSION}/me/media`

const media = (overrides: Record<string, unknown> = {}) => ({
  caption: "Hello",
  comments_count: 3,
  id: "m1",
  like_count: 12,
  media_product_type: "FEED",
  media_type: "IMAGE",
  media_url: "https://cdn.example/m.jpg",
  permalink: "https://instagram.com/p/abc",
  timestamp: "2026-11-20T08:00:00+0000",
  ...overrides,
})

describe("Instagram Login listManagedMedia", () => {
  test("lists the account's media with its counts and maps it to the neutral item", async () => {
    server.use(
      http.get(MEDIA_URL, ({ request }) => {
        const url = new URL(request.url)
        expect(request.headers.get("authorization")).toBe("Bearer IG_TOKEN")
        expect(url.searchParams.get("fields")).toContain("comments_count")
        expect(url.searchParams.get("fields")).toContain("like_count")
        expect(url.searchParams.get("limit")).toBe("40")
        expect(url.searchParams.has("after")).toBe(false)
        return HttpResponse.json({ data: [media()] })
      }),
    )

    const page = await listManagedMedia({ auth, limit: 40 })

    expect(page.items).toEqual([
      {
        authorExternalId: null,
        authorName: null,
        caption: "Hello",
        commentsCount: 3,
        contentType: "photo",
        externalPostId: "m1",
        liveStatus: null,
        mediaType: "FEED",
        permalink: "https://instagram.com/p/abc",
        publishedAt: new Date("2026-11-20T08:00:00+0000"),
        reactionsCount: 12,
        sharesCount: null,
        thumbnailUrl: "https://cdn.example/m.jpg",
        viewsCount: null,
      },
    ])
    expect(page.nextCursor).toBeNull()
  })

  test.each([
    [{ media_product_type: "REELS", media_type: "VIDEO" }, "reel"],
    [{ media_product_type: "STORY", media_type: "IMAGE" }, "story"],
    [{ media_product_type: "FEED", media_type: "VIDEO" }, "video"],
    [{ media_product_type: "FEED", media_type: "CAROUSEL_ALBUM" }, "carousel"],
    [{ media_product_type: "AD", media_type: "IMAGE" }, "photo"],
    [{ media_product_type: undefined, media_type: undefined }, "other"],
  ])("media %j is a %s post", async (fields, contentType) => {
    server.use(
      http.get(MEDIA_URL, () => HttpResponse.json({ data: [media(fields)] })),
    )

    const [item] = (await listManagedMedia({ auth, limit: 10 })).items

    expect(item?.contentType).toBe(contentType)
  })

  test("counts the owner hid are unknown, not zero, and a video uses its thumbnail", async () => {
    server.use(
      http.get(MEDIA_URL, () =>
        HttpResponse.json({
          data: [
            media({
              comments_count: undefined,
              like_count: undefined,
              media_type: "VIDEO",
              thumbnail_url: "https://cdn.example/t.jpg",
            }),
          ],
        }),
      ),
    )

    const [item] = (await listManagedMedia({ auth, limit: 10 })).items

    expect(item?.commentsCount).toBeNull()
    expect(item?.reactionsCount).toBeNull()
    expect(item?.thumbnailUrl).toBe("https://cdn.example/t.jpg")
  })

  test("hands on the after cursor only while Instagram says there is a next page", async () => {
    server.use(
      http.get(MEDIA_URL, ({ request }) =>
        new URL(request.url).searchParams.get("after") === "A1"
          ? HttpResponse.json({
              data: [],
              paging: { cursors: { after: "A2" } },
            })
          : HttpResponse.json({
              data: [media()],
              paging: { cursors: { after: "A1" }, next: "https://next" },
            }),
      ),
    )

    const first = await listManagedMedia({ auth, limit: 10 })
    const last = await listManagedMedia({
      auth,
      cursor: first.nextCursor ?? undefined,
      limit: 10,
    })

    expect(first.nextCursor).toBe("A1")
    expect(last.nextCursor).toBeNull()
  })

  test("never asks for more than a hundred media", async () => {
    server.use(
      http.get(MEDIA_URL, ({ request }) => {
        expect(new URL(request.url).searchParams.get("limit")).toBe("100")
        return HttpResponse.json({ data: [] })
      }),
    )

    await listManagedMedia({ auth, limit: 1000 })
  })
})

describe("Instagram Login getManagedMedia", () => {
  test("reads one media object with the listing's fields", async () => {
    server.use(
      http.get(`${API_URL}/${DEFAULT_API_VERSION}/m1`, ({ request }) => {
        expect(new URL(request.url).searchParams.get("fields")).toContain(
          "like_count",
        )
        return HttpResponse.json(media())
      }),
    )

    const item = await getManagedMedia({ auth, postId: "m1" })

    expect(item.externalPostId).toBe("m1")
    expect(item.reactionsCount).toBe(12)
  })
})

describe("Instagram Login without media_product_type", () => {
  const fieldError = () =>
    HttpResponse.json(
      { error: { code: 100, message: "Tried accessing nonexisting field" } },
      { status: 400 },
    )

  test("a Graph error 100 retries the same page without the field", async () => {
    const asked: string[] = []
    server.use(
      http.get(MEDIA_URL, ({ request }) => {
        const url = new URL(request.url)
        const fields = url.searchParams.get("fields") ?? ""
        asked.push(fields)
        expect(url.searchParams.get("after")).toBe("A0")
        return fields.includes("media_product_type")
          ? fieldError()
          : HttpResponse.json({
              data: [media({ media_product_type: undefined })],
            })
      }),
    )

    const page = await listManagedMedia({ auth, cursor: "A0", limit: 10 })

    expect(asked).toHaveLength(2)
    expect(asked[1]).not.toContain("media_product_type")
    expect(asked[1]).toContain("comments_count")
    expect(page.items).toHaveLength(1)
  })

  test("a video with a reel permalink is a reel, a feed video is not", async () => {
    server.use(
      http.get(MEDIA_URL, ({ request }) =>
        new URL(request.url).searchParams
          .get("fields")
          ?.includes("media_product_type")
          ? fieldError()
          : HttpResponse.json({
              data: [
                media({
                  media_product_type: undefined,
                  media_type: "VIDEO",
                  permalink: "https://www.instagram.com/reel/abc/",
                }),
                media({
                  id: "m2",
                  media_product_type: undefined,
                  media_type: "VIDEO",
                  permalink: "https://www.instagram.com/p/def/",
                }),
              ],
            }),
      ),
    )

    const items = (await listManagedMedia({ auth, limit: 10 })).items

    expect(items.map((item) => item.contentType)).toEqual(["reel", "video"])
  })

  test("another error is not retried", async () => {
    let calls = 0
    server.use(
      http.get(MEDIA_URL, () => {
        calls += 1
        return HttpResponse.json(
          { error: { code: 190, message: "bad token" } },
          { status: 401 },
        )
      }),
    )

    await expect(listManagedMedia({ auth, limit: 10 })).rejects.toBeDefined()
    expect(calls).toBe(1)
  })

  test("getManagedMedia falls back the same way", async () => {
    server.use(
      http.get(`${API_URL}/${DEFAULT_API_VERSION}/m1`, ({ request }) =>
        new URL(request.url).searchParams
          .get("fields")
          ?.includes("media_product_type")
          ? fieldError()
          : HttpResponse.json(media({ media_product_type: undefined })),
      ),
    )

    const item = await getManagedMedia({ auth, postId: "m1" })

    expect(item.externalPostId).toBe("m1")
  })
})

describe("isUnsupportedFieldError", () => {
  test.each([
    [{ code: 100 }, true],
    [
      {
        code: 100,
        message: "(#100) Tried accessing nonexisting field",
        subCode: 1,
      },
      true,
    ],
    [{ code: 100, message: "Unsupported get request", subCode: 33 }, true],
    [{ code: 100, message: "Object does not exist", subCode: 33 }, false],
    [{ code: 190 }, false],
  ])("%j is %s", (source, expected) => {
    expect(isUnsupportedFieldError(source)).toBe(expected)
  })

  test("a code 100 with a subcode is not retried without the field", async () => {
    let calls = 0
    server.use(
      http.get(MEDIA_URL, () => {
        calls += 1
        return HttpResponse.json(
          {
            error: {
              code: 100,
              error_subcode: 33,
              message: "Object does not exist",
            },
          },
          { status: 400 },
        )
      }),
    )
    await expect(listManagedMedia({ auth, limit: 10 })).rejects.toBeDefined()
    expect(calls).toBe(1)
  })
})
