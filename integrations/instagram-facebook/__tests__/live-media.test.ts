import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test } from "vitest"
import { getLiveState } from "../src/apis/live"
import { listManagedMedia } from "../src/apis/post"
import { API_URL, DEFAULT_API_VERSION } from "../src/constants"
import type { InstagramAuthValue } from "../src/schema"

const auth = {
  tokens: { accessToken: "IG_TOKEN" },
  metadata: { igId: "ig-account-1", version: DEFAULT_API_VERSION },
} as unknown as InstagramAuthValue
const LIVE_URL = `${API_URL}/${DEFAULT_API_VERSION}/ig-account-1/live_media`
const MEDIA_URL = `${API_URL}/${DEFAULT_API_VERSION}/ig-account-1/media`

const liveMedia = (id: string) => ({
  caption: "Going live",
  id,
  media_product_type: "LIVE",
  media_type: "BROADCAST",
  permalink: `https://instagram.com/live/${id}`,
  timestamp: "2026-11-24T09:00:00+0000",
})

describe("Instagram Facebook Login live media listing", () => {
  test("a listing starts on the broadcasts on the air and reports them as live", async () => {
    server.use(
      http.get(LIVE_URL, ({ request }) => {
        expect(request.headers.get("authorization")).toBe("Bearer IG_TOKEN")
        expect(new URL(request.url).searchParams.get("fields")).toContain(
          "media_product_type",
        )
        return HttpResponse.json({ data: [liveMedia("live-1")] })
      }),
    )

    const page = await listManagedMedia({ auth, limit: 40 })

    expect(page.items).toEqual([
      {
        authorExternalId: null,
        authorName: null,
        caption: "Going live",
        commentsCount: null,
        contentType: "live",
        externalPostId: "live-1",
        liveStatus: "live",
        mediaType: "live",
        permalink: "https://instagram.com/live/live-1",
        publishedAt: new Date("2026-11-24T09:00:00+0000"),
        reactionsCount: null,
        sharesCount: null,
        thumbnailUrl: null,
        viewsCount: null,
      },
    ])
    expect(JSON.parse(page.nextCursor ?? "")).toEqual({ edge: "media" })
  })

  test("a cursor saved before the live pass existed resumes on the media edge", async () => {
    server.use(
      http.get(MEDIA_URL, ({ request }) => {
        expect(new URL(request.url).searchParams.get("after")).toBe("OLD-1")
        return HttpResponse.json({ data: [] })
      }),
    )

    const page = await listManagedMedia({ auth, cursor: "OLD-1", limit: 10 })

    expect(page.items).toEqual([])
    expect(page.nextCursor).toBeNull()
  })

  test("an account whose token cannot read live_media still syncs its media", async () => {
    server.use(
      http.get(LIVE_URL, () =>
        HttpResponse.json(
          { error: { code: 10, message: "permission denied" } },
          { status: 400 },
        ),
      ),
    )

    const page = await listManagedMedia({ auth, limit: 10 })

    expect(page.items).toEqual([])
    expect(JSON.parse(page.nextCursor ?? "")).toEqual({ edge: "media" })
  })
})

describe("Instagram Facebook Login getLiveState", () => {
  test("is live while the media is listed", async () => {
    server.use(
      http.get(LIVE_URL, () =>
        HttpResponse.json({ data: [liveMedia("live-1")] }),
      ),
    )

    expect(await getLiveState({ auth, postId: "live-1" })).toBe("live")
  })

  test("is ended only after a successful, fully read answer that does not list it", async () => {
    server.use(http.get(LIVE_URL, () => HttpResponse.json({ data: [] })))

    expect(await getLiveState({ auth, postId: "live-1" })).toBe("ended")
  })

  test("a failed call throws instead of ending the broadcast", async () => {
    server.use(
      http.get(LIVE_URL, () =>
        HttpResponse.json(
          { error: { code: 1, message: "boom" } },
          { status: 500 },
        ),
      ),
    )

    await expect(getLiveState({ auth, postId: "live-1" })).rejects.toThrow()
  })

  test("a list longer than the pages it reads is unknown, not ended", async () => {
    server.use(
      http.get(LIVE_URL, () =>
        HttpResponse.json({
          data: [liveMedia("other")],
          paging: { cursors: { after: "N" }, next: "https://next" },
        }),
      ),
    )

    expect(await getLiveState({ auth, postId: "live-1" })).toBe("unknown")
  })
})
