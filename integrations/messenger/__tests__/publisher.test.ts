import type {
  SocialPublishRequest,
  SocialPublishStatusRequest,
} from "@chatbotx.io/utils/social-publisher"
import { afterEach, describe, expect, test, vi } from "vitest"
import { facebookPublisher } from "../src/publisher"

const TOKEN = "EAAB-secret-page-token"

type FetchCall = { body: string | undefined; method: string; url: string }

const calls: FetchCall[] = []

const respond = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status })

const mockFetch = (handler: (call: FetchCall) => Response | Error): void => {
  calls.length = 0
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: RequestInit) => {
      const call: FetchCall = {
        body: init.body as string | undefined,
        method: init.method ?? "GET",
        url,
      }
      calls.push(call)
      const result = handler(call)
      return result instanceof Error
        ? Promise.reject(result)
        : Promise.resolve(result)
    }),
  )
}

const request = (
  overrides: Partial<SocialPublishRequest>,
): SocialPublishRequest => ({
  accessToken: TOKEN,
  contentType: "text",
  destinationExternalId: "page1",
  linkUrl: null,
  media: [],
  options: {},
  text: "hello",
  ...overrides,
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("facebookPublisher.publish", () => {
  test("publishes a text post to /feed", async () => {
    mockFetch(() => respond(200, { id: "page1_99" }))
    const result = await facebookPublisher.publish(request({}))
    expect(result).toEqual({
      externalPostId: "page1_99",
      permalink: "https://www.facebook.com/page1_99",
      status: "published",
    })
    expect(calls[0]?.url).toContain("/page1/feed")
    expect(calls[0]?.body).toBe("message=hello")
  })

  test("publishes a link post with link and optional message", async () => {
    mockFetch(() => respond(200, { id: "page1_1" }))
    await facebookPublisher.publish(
      request({
        contentType: "link",
        linkUrl: "https://a.example",
        text: null,
      }),
    )
    expect(calls[0]?.body).toBe("link=https%3A%2F%2Fa.example")
  })

  test("publishes an image through /photos and returns the post id", async () => {
    mockFetch(() => respond(200, { id: "photo1", post_id: "page1_7" }))
    const result = await facebookPublisher.publish(
      request({
        contentType: "image",
        media: [
          {
            altText: null,
            mimeType: "image/png",
            url: "https://i.example/a.png",
          },
        ],
        text: "cap",
      }),
    )
    expect(result).toMatchObject({
      externalPostId: "page1_7",
      status: "published",
    })
    expect(calls[0]?.url).toContain("/page1/photos")
    expect(calls[0]?.body).toContain("caption=cap")
  })

  test("rejects an unsupported content type without calling the network", async () => {
    mockFetch(() => respond(200, {}))
    const result = await facebookPublisher.publish(
      request({ contentType: "video" }),
    )
    expect(result).toMatchObject({
      category: "payloadInvalid",
      provablyNotCreated: true,
      status: "failed",
    })
    expect(calls).toHaveLength(0)
  })

  test.each([
    [400, { code: 190 }, "authFailed", true],
    [403, { code: 200 }, "permissionDenied", true],
    [403, { code: 10 }, "permissionDenied", true],
    [400, { code: 17 }, "rateLimited", true],
    [400, { code: 4 }, "rateLimited", true],
    [400, { code: 100, error_subcode: 1_366_046 }, "payloadInvalid", true],
    [400, { code: 100, error_subcode: 33 }, "notFound", true],
    [500, { code: 1 }, "unknown", false],
    [500, { code: 100 }, "payloadInvalid", false],
  ])("maps HTTP %i %j to %s (provablyNotCreated=%s)", async (status, error, category, provable) => {
    mockFetch(() => respond(status, { error: { message: "boom", ...error } }))
    const result = await facebookPublisher.publish(request({}))
    expect(result).toMatchObject({
      category,
      provablyNotCreated: provable,
      status: "failed",
    })
  })

  test("a network error after the request was sent is not provablyNotCreated", async () => {
    mockFetch(() => new Error(`fetch failed ${TOKEN}`))
    const result = await facebookPublisher.publish(request({}))
    expect(result).toMatchObject({
      category: "networkError",
      provablyNotCreated: false,
      status: "failed",
    })
  })

  test("never leaks the token into a failure message", async () => {
    mockFetch(() =>
      respond(400, { error: { code: 190, message: `Invalid token ${TOKEN}` } }),
    )
    const result = await facebookPublisher.publish(request({}))
    expect(JSON.stringify(result)).not.toContain(TOKEN)
  })

  test("sends the token in the Authorization header, not the URL", async () => {
    mockFetch(() => respond(200, { id: "x" }))
    await facebookPublisher.publish(request({}))
    expect(calls[0]?.url).not.toContain(TOKEN)
    const init = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${TOKEN}`,
    )
  })

  test("a success without an id is an unknown, possibly created failure", async () => {
    mockFetch(() => respond(200, {}))
    const result = await facebookPublisher.publish(request({}))
    expect(result).toMatchObject({
      provablyNotCreated: false,
      status: "failed",
    })
  })
})

describe("facebookPublisher.delete / checkStatus", () => {
  test("deletes a post", async () => {
    mockFetch(() => respond(200, { success: true }))
    const result = await facebookPublisher.delete({
      accessToken: TOKEN,
      externalPostId: "page1_99",
    })
    expect(result).toEqual({ deleted: true })
    expect(calls[0]).toMatchObject({ method: "DELETE" })
    expect(calls[0]?.url).toContain("/page1_99")
  })

  test.each([
    [400, { code: 803 }, "notFound"],
    [400, { code: 100, error_subcode: 33 }, "permissionDenied"],
    [400, { code: 21 }, "permissionDenied"],
  ])("maps a delete error HTTP %i %j to %s (100/33 and 21 never prove the post is gone)", async (status, error, category) => {
    mockFetch(() => respond(status, { error: { message: "x", ...error } }))
    const result = await facebookPublisher.delete({
      accessToken: TOKEN,
      externalPostId: "x",
    })
    expect(result).toMatchObject({ category, status: "failed" })
  })

  test("has no pending state", async () => {
    const result = await facebookPublisher.checkStatus(statusRequest({}))
    expect(result).toMatchObject({ status: "failed" })
  })
})

const statusRequest = (
  overrides: Partial<SocialPublishStatusRequest>,
): SocialPublishStatusRequest => ({
  accessToken: TOKEN,
  contentType: "reel",
  continuation: {},
  destinationExternalId: "page1",
  options: {},
  text: null,
  ...overrides,
})

const clip = {
  altText: null,
  mimeType: "video/mp4",
  url: "https://i.example/v.mp4",
}
const photo = (n: number) => ({
  altText: `alt${n}`,
  mimeType: "image/jpeg",
  url: `https://i.example/${n}.jpg`,
})

describe("facebookPublisher multi-photo and stories", () => {
  test("a multi-photo post uploads unpublished photos, then one feed call", async () => {
    let next = 0
    mockFetch((call) =>
      call.url.includes("/photos")
        ? respond(200, { id: `p${++next}` })
        : respond(200, { id: "page1_55" }),
    )
    const result = await facebookPublisher.publish(
      request({
        contentType: "carousel",
        media: [photo(1), photo(2)],
        text: "hi",
      }),
    )
    expect(result).toMatchObject({
      externalPostId: "page1_55",
      status: "published",
    })
    const photoBody = new URLSearchParams(calls[0]?.body)
    expect(photoBody.get("published")).toBe("false")
    expect(photoBody.get("alt_text_custom")).toBe("alt1")
    const feed = new URLSearchParams(calls[2]?.body)
    expect(calls[2]?.url).toContain("/page1/feed")
    expect(feed.get("attached_media[0]")).toBe('{"media_fbid":"p1"}')
    expect(feed.get("attached_media[1]")).toBe('{"media_fbid":"p2"}')
    expect(feed.get("message")).toBe("hi")
  })

  test("a failing photo upload is retry-safe and makes no feed call", async () => {
    mockFetch(() => respond(400, { error: { code: 324, message: "bad file" } }))
    const result = await facebookPublisher.publish(
      request({ contentType: "carousel", media: [photo(1), photo(2)] }),
    )
    expect(result).toMatchObject({ provablyNotCreated: true, status: "failed" })
    expect(calls.some((call) => call.url.includes("/feed"))).toBe(false)
  })

  test("a feed call that fails ambiguously ends in review, not a retry", async () => {
    mockFetch((call) =>
      call.url.includes("/photos")
        ? respond(200, { id: "p1" })
        : new Error(`socket ${TOKEN}`),
    )
    const result = await facebookPublisher.publish(
      request({ contentType: "carousel", media: [photo(1), photo(2)] }),
    )
    expect(result).toMatchObject({
      provablyNotCreated: false,
      status: "failed",
    })
    expect(JSON.stringify(result)).not.toContain(TOKEN)
  })

  test("a photo story uploads an unpublished photo then posts it to photo_stories", async () => {
    mockFetch((call) =>
      call.url.includes("/photos")
        ? respond(200, { id: "p1" })
        : respond(200, { post_id: "st1", success: true }),
    )
    const result = await facebookPublisher.publish(
      request({ contentType: "story", media: [photo(1)] }),
    )
    expect(result).toEqual({
      externalPostId: "st1",
      permalink: null,
      status: "published",
    })
    expect(calls[1]?.url).toContain("/page1/photo_stories")
    expect(new URLSearchParams(calls[1]?.body).get("photo_id")).toBe("p1")
  })

  test("a story with two files is refused without a call", async () => {
    mockFetch(() => respond(200, {}))
    const result = await facebookPublisher.publish(
      request({ contentType: "story", media: [photo(1), photo(2)] }),
    )
    expect(result).toMatchObject({ status: "failed" })
    expect(calls).toHaveLength(0)
  })
})

describe("facebookPublisher video, reel and video story", () => {
  test("a feed video posts file_url to the video host and returns the video id as continuation", async () => {
    mockFetch(() => respond(200, { id: "vid1" }))
    const result = await facebookPublisher.publish(
      request({
        contentType: "video",
        media: [clip],
        options: { title: "T" },
        text: "desc",
      }),
    )
    expect(result).toMatchObject({
      continuation: { flow: "video", videoId: "vid1" },
      status: "pending",
    })
    expect(calls[0]?.url).toContain("graph-video.facebook.com")
    expect(calls[0]?.url).toContain("/page1/videos")
    const body = new URLSearchParams(calls[0]?.body)
    expect(body.get("file_url")).toBe(clip.url)
    expect(body.get("description")).toBe("desc")
    expect(body.get("title")).toBe("T")
  })

  test("a reel starts a session, hands over the hosted file and returns the video id", async () => {
    mockFetch((call) =>
      call.url.includes("rupload.facebook.com")
        ? respond(200, { success: true })
        : respond(200, { video_id: "vr1" }),
    )
    const result = await facebookPublisher.publish(
      request({ contentType: "reel", media: [clip] }),
    )
    expect(result).toMatchObject({
      continuation: { flow: "reel", phase: "uploaded", videoId: "vr1" },
      status: "pending",
    })
    expect(calls[0]?.url).toContain("/page1/video_reels")
    expect(new URLSearchParams(calls[0]?.body).get("upload_phase")).toBe(
      "start",
    )
    expect(calls[1]?.url).toContain("/video-upload/")
    const init = vi.mocked(fetch).mock.calls[1]?.[1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers.file_url).toBe(clip.url)
    expect(headers.Authorization).toBe(`OAuth ${TOKEN}`)
  })

  test("a rejected upload is retry-safe and does not leak the token", async () => {
    mockFetch((call) =>
      call.url.includes("rupload.facebook.com")
        ? respond(400, {
            debug_info: { message: `no ${TOKEN}`, retriable: false },
          })
        : respond(200, { video_id: "vr1" }),
    )
    const result = await facebookPublisher.publish(
      request({ contentType: "reel", media: [clip] }),
    )
    expect(result).toMatchObject({
      category: "mediaInvalid",
      provablyNotCreated: true,
    })
    expect(JSON.stringify(result)).not.toContain(TOKEN)
  })

  test("a reel is finished once the upload is complete, then waits for publishing", async () => {
    mockFetch((call) =>
      call.method === "GET"
        ? respond(200, {
            status: {
              uploading_phase: { status: "complete" },
              video_status: "processing",
            },
          })
        : respond(200, { success: true }),
    )
    const result = await facebookPublisher.checkStatus(
      statusRequest({
        continuation: { flow: "reel", phase: "uploaded", videoId: "vr1" },
        options: { title: "T" },
        text: "desc",
      }),
    )
    expect(result).toMatchObject({
      continuation: { flow: "reel", phase: "finishing", videoId: "vr1" },
      status: "pending",
    })
    const body = new URLSearchParams(
      calls.find((call) => call.method === "POST")?.body,
    )
    expect(body.get("upload_phase")).toBe("finish")
    expect(body.get("video_state")).toBe("PUBLISHED")
    expect(body.get("video_id")).toBe("vr1")
    expect(body.get("description")).toBe("desc")
  })

  test("a rate-limited status read keeps polling the same continuation", async () => {
    mockFetch(() => respond(400, { error: { code: 4, message: "limit" } }))
    const continuation = { flow: "video", videoId: "v1" }
    const result = await facebookPublisher.checkStatus(
      statusRequest({ continuation, contentType: "video" }),
    )
    expect(result).toMatchObject({ continuation, status: "pending" })
  })

  test("another failed status read of a video that publishes on its own is never provably not created", async () => {
    mockFetch(() => respond(400, { error: { code: 803, message: "gone" } }))
    for (const continuation of [
      { flow: "video", videoId: "v1" },
      { flow: "reel", phase: "finishing", videoId: "v1" },
    ]) {
      const result = await facebookPublisher.checkStatus(
        statusRequest({ continuation }),
      )
      expect(result).toMatchObject({
        provablyNotCreated: false,
        status: "failed",
      })
    }
  })

  test("a reel still uploading stays pending without a finish call", async () => {
    mockFetch(() =>
      respond(200, { status: { uploading_phase: { status: "in_progress" } } }),
    )
    const result = await facebookPublisher.checkStatus(
      statusRequest({
        continuation: { flow: "reel", phase: "uploaded", videoId: "vr1" },
      }),
    )
    expect(result).toMatchObject({ status: "pending" })
    expect(calls.every((call) => call.method === "GET")).toBe(true)
  })

  test("a finishing reel is published once the publishing phase says so", async () => {
    mockFetch(() =>
      respond(200, {
        permalink_url: "/reel/vr1",
        status: {
          publishing_phase: { publish_status: "published", status: "complete" },
        },
      }),
    )
    const result = await facebookPublisher.checkStatus(
      statusRequest({
        continuation: { flow: "reel", phase: "finishing", videoId: "vr1" },
      }),
    )
    expect(result).toEqual({
      externalPostId: "vr1",
      permalink: "https://www.facebook.com/reel/vr1",
      status: "published",
    })
  })

  test("a processing error before finish is retry-safe, after finish it needs review", async () => {
    mockFetch(() =>
      respond(200, {
        status: {
          processing_phase: { error: { message: "Resolution too low" } },
          video_status: "processing",
        },
      }),
    )
    const before = await facebookPublisher.checkStatus(
      statusRequest({
        continuation: { flow: "reel", phase: "uploaded", videoId: "vr1" },
      }),
    )
    expect(before).toMatchObject({
      category: "mediaInvalid",
      provablyNotCreated: true,
    })
    const after = await facebookPublisher.checkStatus(
      statusRequest({
        continuation: { flow: "reel", phase: "finishing", videoId: "vr1" },
      }),
    )
    expect(after).toMatchObject({ provablyNotCreated: false, status: "failed" })
  })

  test("a video story finishes with video_stories and returns the story post id", async () => {
    mockFetch((call) =>
      call.method === "GET"
        ? respond(200, { status: { uploading_phase: { status: "complete" } } })
        : respond(200, { post_id: "st9", success: true }),
    )
    const result = await facebookPublisher.checkStatus(
      statusRequest({
        contentType: "story",
        continuation: { flow: "videoStory", phase: "uploaded", videoId: "vs1" },
      }),
    )
    expect(result).toMatchObject({ externalPostId: "st9", status: "published" })
    expect(calls.find((call) => call.method === "POST")?.url).toContain(
      "/page1/video_stories",
    )
  })

  test.each([
    ["reel", "reel", "vr1"],
    ["videoStory", "story", "vs1"],
  ])("a %s whose finish call was already sent is never finished again", async (flow, contentType, videoId) => {
    mockFetch(() =>
      respond(200, { status: { uploading_phase: { status: "complete" } } }),
    )
    const result = await facebookPublisher.checkStatus(
      statusRequest({
        contentType: contentType as "reel" | "story",
        continuation: {
          finalCallAt: String(Date.now()),
          flow,
          phase: "uploaded",
          videoId,
        },
      }),
    )
    expect(result).toMatchObject({
      code: "final_call_unconfirmed",
      provablyNotCreated: false,
      status: "failed",
    })
    expect(calls.some((call) => call.method === "POST")).toBe(false)
  })

  test("the finish call is checkpointed first and skipped when the checkpoint is lost", async () => {
    mockFetch((call) =>
      call.method === "GET"
        ? respond(200, { status: { uploading_phase: { status: "complete" } } })
        : respond(200, { post_id: "st9", success: true }),
    )
    const order: string[] = []
    const checkpoint = (continuation: Record<string, string>) => {
      order.push(`checkpoint:${continuation.finalCallAt ? "marked" : "bare"}`)
      return Promise.resolve(true)
    }
    await facebookPublisher.checkStatus(
      statusRequest({
        checkpoint,
        contentType: "story",
        continuation: { flow: "videoStory", phase: "uploaded", videoId: "vs1" },
      }),
    )
    expect(order).toEqual(["checkpoint:marked"])
    expect(calls.map((call) => call.method)).toEqual(["GET", "POST", "GET"])

    mockFetch(() =>
      respond(200, { status: { uploading_phase: { status: "complete" } } }),
    )
    const lost = await facebookPublisher.checkStatus(
      statusRequest({
        checkpoint: () => Promise.resolve(false),
        contentType: "story",
        continuation: { flow: "videoStory", phase: "uploaded", videoId: "vs1" },
      }),
    )
    expect(lost).toMatchObject({ status: "pending" })
    expect(calls.some((call) => call.method === "POST")).toBe(false)
  })

  test("a feed video is published once its status is ready", async () => {
    mockFetch(() => respond(200, { status: { video_status: "ready" } }))
    const result = await facebookPublisher.checkStatus(
      statusRequest({
        contentType: "video",
        continuation: { flow: "video", videoId: "vid1" },
      }),
    )
    expect(result).toMatchObject({
      externalPostId: "vid1",
      status: "published",
    })
  })

  test("a feed video still processing stays pending", async () => {
    mockFetch(() => respond(200, { status: { video_status: "processing" } }))
    const result = await facebookPublisher.checkStatus(
      statusRequest({
        contentType: "video",
        continuation: { flow: "video", videoId: "vid1" },
      }),
    )
    expect(result).toMatchObject({ status: "pending" })
  })
})

const FALLBACK_UPLOAD_URL =
  /^https:\/\/rupload\.facebook\.com\/video-upload\/v[\d.]+\/vr1$/

const storyFetch = (onGet: () => Response): void =>
  mockFetch((call) => {
    if (call.method === "GET") {
      return onGet()
    }
    return call.url.includes("/photos")
      ? respond(200, { id: "p1" })
      : respond(200, { post_id: "st1", success: true })
  })

describe("facebookPublisher upload_url and story permalink", () => {
  const UPLOAD_URL = "https://rupload.facebook.com/video-upload/v99.0/vr1"
  const startWith = (data: Record<string, unknown>) =>
    mockFetch((call) =>
      call.url.includes("rupload.facebook.com")
        ? respond(200, { success: true })
        : respond(200, data),
    )

  test("the upload_url of the start call is used for the hosted file", async () => {
    startWith({ upload_url: UPLOAD_URL, video_id: "vr1" })
    const result = await facebookPublisher.publish(
      request({ contentType: "reel", media: [clip] }),
    )
    expect(result).toMatchObject({ status: "pending" })
    expect(calls[1]?.url).toBe(UPLOAD_URL)
  })

  test.each([
    "http://rupload.facebook.com/video-upload/vr1",
    "https://evil.example.com/video-upload/vr1",
    "https://rupload.facebook.com.evil.example/vr1",
    "not a url",
    "",
    123,
    { url: "https://rupload.facebook.com/x" },
    true,
  ])("an upload_url %s is rejected before anything is uploaded", async (uploadUrl) => {
    startWith({ upload_url: uploadUrl, video_id: "vr1" })
    const result = await facebookPublisher.publish(
      request({ contentType: "reel", media: [clip] }),
    )
    expect(result).toMatchObject({
      provablyNotCreated: true,
      status: "failed",
    })
    expect(calls).toHaveLength(1)
  })

  test("a start answer without upload_url falls back to the documented path", async () => {
    startWith({ video_id: "vr1" })
    await facebookPublisher.publish(
      request({ contentType: "reel", media: [clip] }),
    )
    expect(calls[1]?.url).toMatch(FALLBACK_UPLOAD_URL)
  })

  test("a continuation stored by the old code (no upload url) still resumes", async () => {
    mockFetch((call) =>
      call.method === "GET"
        ? respond(200, { status: { uploading_phase: { status: "complete" } } })
        : respond(200, { post_id: "st9", success: true }),
    )
    const result = await facebookPublisher.checkStatus(
      statusRequest({
        contentType: "story",
        continuation: { flow: "videoStory", phase: "uploaded", videoId: "vs1" },
      }),
    )
    expect(result).toMatchObject({ externalPostId: "st9", status: "published" })
  })

  const stories = (data: unknown[]) => respond(200, { data })

  test("a story permalink is the url of the listed story with our post id", async () => {
    storyFetch(() =>
      stories([
        { post_id: "other", url: "https://facebook.com/stories/1" },
        { post_id: "st1", url: "https://facebook.com/stories/2" },
      ]),
    )
    const result = await facebookPublisher.publish(
      request({ contentType: "story", media: [photo(1)] }),
    )
    expect(result).toEqual({
      externalPostId: "st1",
      permalink: "https://facebook.com/stories/2",
      status: "published",
    })
    const reads = calls.filter((call) => call.method === "GET")
    expect(reads).toHaveLength(1)
    expect(reads[0]?.url).toContain("/page1/stories?")
    expect(reads[0]?.url).toContain("since=")
  })

  test.each([
    [
      "our story is not listed",
      () => stories([{ post_id: "x", url: "https://facebook.com/stories/1" }]),
    ],
    ["the read fails", () => respond(400, { error: { message: "x" } })],
    [
      "the error body is malformed",
      () => respond(400, { error: { message: 123 } }),
    ],
    ["the list is missing", () => respond(200, {})],
    [
      "the url is not https",
      () => stories([{ post_id: "st1", url: "http://facebook.com/stories/2" }]),
    ],
    [
      "the url is relative",
      () => stories([{ post_id: "st1", url: "/stories/2" }]),
    ],
  ])("a story stays published with a null permalink when %s", async (_name, onGet) => {
    storyFetch(onGet)
    const result = await facebookPublisher.publish(
      request({ contentType: "story", media: [photo(1)] }),
    )
    expect(result).toEqual({
      externalPostId: "st1",
      permalink: null,
      status: "published",
    })
  })
})
