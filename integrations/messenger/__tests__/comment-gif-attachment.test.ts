import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test, vi } from "vitest"
import {
  getCommentAttachment,
  unwrapFacebookRedirectUrl,
} from "../src/apis/comment"

const AUTH = {
  clientId: "app-123",
  tokens: { accessToken: "page-token" },
  version: "v23.0",
  metadata: { pageId: "page-123", version: "v23.0" },
} as never

const COMMENT_ID = "page-123_comment-1"
const GIF_URL = "https://media.giphy.test/media/abc/giphy.gif"
const PREVIEW_URL = "https://external.fbcdn.test/emg1/preview.jpg"

function buildCtx() {
  return {
    storagePrefix: "workspace-1",
    uploader: { putObject: vi.fn(async () => undefined) },
    auth: AUTH,
  } as never
}

function mockGraphAttachment(attachment: Record<string, unknown>) {
  server.use(
    http.get(`https://graph.facebook.com/v23.0/${COMMENT_ID}`, () =>
      HttpResponse.json({ attachment, id: COMMENT_ID }),
    ),
  )
}

const redirect = (url: string) =>
  `https://l.facebook.com/l.php?u=${encodeURIComponent(url)}&h=AT0`

describe("unwrapFacebookRedirectUrl", () => {
  test("returns the wrapped https URL", () => {
    expect(unwrapFacebookRedirectUrl(redirect(GIF_URL))).toBe(GIF_URL)
  })

  test("ignores links that are not Facebook redirects or not https", () => {
    expect(unwrapFacebookRedirectUrl(GIF_URL)).toBeNull()
    expect(
      unwrapFacebookRedirectUrl(redirect("http://media.giphy.test/a.gif")),
    ).toBeNull()
    expect(unwrapFacebookRedirectUrl(undefined)).toBeNull()
  })
})

describe("getCommentAttachment GIF comments", () => {
  test("downloads the original GIF without sending the page token", async () => {
    let authorizationHeader: string | null = "unset"
    mockGraphAttachment({
      type: "animated_image_share",
      url: redirect(GIF_URL),
      media: { image: { src: PREVIEW_URL } },
    })
    server.use(
      http.get(GIF_URL, ({ request }) => {
        authorizationHeader = request.headers.get("authorization")
        return new HttpResponse(new Uint8Array([1, 2, 3]), {
          headers: { "content-type": "image/gif" },
        })
      }),
    )

    const result = await getCommentAttachment({
      ctx: buildCtx(),
      input: { commentId: COMMENT_ID },
    })

    expect(result.type).toBe("animated_image_share")
    expect(result.attachment).toEqual(
      expect.objectContaining({ fileType: "image", mimeType: "image/gif" }),
    )
    expect(authorizationHeader).toBeNull()
  })

  test("prefers Facebook's resolved unshimmed_url over the redirect link", async () => {
    const unshimmedGifUrl = "https://media.giphy.test/media/unshimmed.gif"
    mockGraphAttachment({
      type: "animated_image_share",
      unshimmed_url: unshimmedGifUrl,
      url: redirect(GIF_URL),
      media: { image: { src: PREVIEW_URL } },
    })
    const requested: string[] = []
    server.use(
      http.get(unshimmedGifUrl, ({ request }) => {
        requested.push(request.url)
        return new HttpResponse(new Uint8Array([1, 2, 3]), {
          headers: { "content-type": "image/gif" },
        })
      }),
    )

    const result = await getCommentAttachment({
      ctx: buildCtx(),
      input: { commentId: COMMENT_ID },
    })

    expect(requested).toEqual([unshimmedGifUrl])
    expect(result.attachment).toEqual(
      expect.objectContaining({ mimeType: "image/gif" }),
    )
  })

  test("falls back to the preview when the original link is not media", async () => {
    mockGraphAttachment({
      type: "animated_image_share",
      url: redirect(GIF_URL),
      media: { image: { src: PREVIEW_URL } },
    })
    server.use(
      http.get(GIF_URL, () => HttpResponse.text("<html></html>")),
      http.get(
        PREVIEW_URL,
        () =>
          new HttpResponse(new Uint8Array([1, 2, 3]), {
            headers: { "content-type": "image/jpeg" },
          }),
      ),
    )

    const result = await getCommentAttachment({
      ctx: buildCtx(),
      input: { commentId: COMMENT_ID },
    })

    expect(result.attachment).toEqual(
      expect.objectContaining({ mimeType: "image/jpeg" }),
    )
  })

  test("returns no attachment when every candidate fails", async () => {
    mockGraphAttachment({
      type: "animated_image_share",
      media: { image: { src: PREVIEW_URL } },
    })
    server.use(
      http.get(PREVIEW_URL, () => HttpResponse.text("gone", { status: 404 })),
    )

    const result = await getCommentAttachment({
      ctx: buildCtx(),
      input: { commentId: COMMENT_ID },
    })

    expect(result).toEqual({
      type: "animated_image_share",
      attachment: undefined,
      isLive: false,
    })
  })
})

describe("getCommentAttachment live comments", () => {
  const LIVE_VIDEO_FIELDS = "object{live_status}"

  /**
   * One Graph endpoint answers both lookups: the comment fields, and — only
   * for a timestamped comment — the commented video's live status.
   */
  function mockGraphComment(props: {
    comment: Record<string, unknown>
    video?: Record<string, unknown> | "error"
  }) {
    const requestedFields: string[] = []
    server.use(
      http.get(
        `https://graph.facebook.com/v23.0/${COMMENT_ID}`,
        ({ request }) => {
          const fields = new URL(request.url).searchParams.get("fields") ?? ""
          requestedFields.push(fields)
          if (fields !== LIVE_VIDEO_FIELDS) {
            return HttpResponse.json({ id: COMMENT_ID, ...props.comment })
          }
          if (props.video === "error") {
            return HttpResponse.json(
              { error: { message: "boom", code: 1 } },
              { status: 500 },
            )
          }
          return HttpResponse.json({ id: COMMENT_ID, ...props.video })
        },
      ),
    )
    return requestedFields
  }

  const lookup = () =>
    getCommentAttachment({
      ctx: buildCtx(),
      input: { commentId: COMMENT_ID },
    })

  test("asks for live_broadcast_timestamp and flags a comment on a live video", async () => {
    const requestedFields = mockGraphComment({
      comment: { live_broadcast_timestamp: 42 },
      video: { object: { id: "video-1", live_status: "LIVE" } },
    })

    const result = await lookup()

    expect(requestedFields[0]).toContain("live_broadcast_timestamp")
    expect(requestedFields).toContain(LIVE_VIDEO_FIELDS)
    expect(result).toEqual({ type: null, isLive: true })
  })

  test("a comment on an ended live broadcast is still live", async () => {
    mockGraphComment({
      comment: { live_broadcast_timestamp: 42 },
      video: { object: { id: "video-1", live_status: "LIVE_STOPPED" } },
    })

    expect(await lookup()).toEqual({ type: null, isLive: true })
  })

  test.each([
    0,
    null,
  ])("a reel comment with live_broadcast_timestamp %s is not live and skips the video lookup", async (timestamp) => {
    const requestedFields = mockGraphComment({
      comment: { live_broadcast_timestamp: timestamp },
    })

    expect(await lookup()).toEqual({ type: null, isLive: false })
    expect(requestedFields).not.toContain(LIVE_VIDEO_FIELDS)
  })

  test("a timestamped comment on a video with no live status is not live", async () => {
    mockGraphComment({
      comment: { live_broadcast_timestamp: 42 },
      video: { object: { id: "reel-video-1" } },
    })

    expect(await lookup()).toEqual({ type: null, isLive: false })
  })

  test("trusts the broadcast timestamp when the video lookup fails", async () => {
    mockGraphComment({
      comment: { live_broadcast_timestamp: 42 },
      video: "error",
    })

    expect(await lookup()).toEqual({ type: null, isLive: true })
  })

  test("a comment without live_broadcast_timestamp is not live", async () => {
    server.use(
      http.get(`https://graph.facebook.com/v23.0/${COMMENT_ID}`, () =>
        HttpResponse.json({ id: COMMENT_ID }),
      ),
    )

    const result = await getCommentAttachment({
      ctx: buildCtx(),
      input: { commentId: COMMENT_ID },
    })

    expect(result).toEqual({ type: null, isLive: false })
  })
})
