import type { SocialPublishRequest } from "@chatbotx.io/utils/social-publisher"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { instagramPublisher } from "../src/publisher"

const DIGITS = /^\d+$/

const TOKEN = "IGAA-secret-user-token"

type FetchCall = { body: string | undefined; method: string; url: string }

const calls: FetchCall[] = []

const respond = (
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response => new Response(JSON.stringify(body), { headers, status })

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
  overrides: Partial<SocialPublishRequest> = {},
): SocialPublishRequest => ({
  accessToken: TOKEN,
  contentType: "image",
  destinationExternalId: "ig1",
  linkUrl: null,
  media: [
    { altText: "alt", mimeType: "image/jpeg", url: "https://i.example/a.jpg" },
  ],
  options: {},
  text: "caption",
  ...overrides,
})

const statusRequest = {
  accessToken: TOKEN,
  contentType: "image" as const,
  continuation: { containerId: "c1" },
  destinationExternalId: "ig1",
  options: {},
  text: null,
}

const video = {
  altText: null,
  mimeType: "video/mp4",
  url: "https://i.example/v.mp4",
}
const photo = (n: number) => ({
  altText: `alt${n}`,
  mimeType: "image/jpeg",
  url: `https://i.example/${n}.jpg`,
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("instagramPublisher.publish", () => {
  test("creates a container and returns pending with its id", async () => {
    mockFetch(() => respond(200, { id: "c1" }))
    const result = await instagramPublisher.publish(request())
    expect(result).toMatchObject({
      continuation: { containerId: "c1" },
      status: "pending",
    })
    expect(calls[0]?.url).toContain("graph.instagram.com")
    expect(calls[0]?.url).toContain("/ig1/media")
    expect(calls[0]?.body).toContain("image_url=")
    expect(calls[0]?.body).toContain("caption=caption")
    expect(calls[0]?.body).toContain("alt_text=alt")
  })

  test.each([
    "video",
    "text",
  ] as const)("rejects %s as unsupported", async (contentType) => {
    mockFetch(() => respond(200, {}))
    const result = await instagramPublisher.publish(request({ contentType }))
    expect(result).toMatchObject({
      category: "payloadInvalid",
      provablyNotCreated: true,
    })
    expect(calls).toHaveLength(0)
  })

  test("a reel container carries media_type, video_url, share_to_feed and thumb_offset", async () => {
    mockFetch(() => respond(200, { id: "r1" }))
    const result = await instagramPublisher.publish(
      request({
        contentType: "reel",
        media: [video],
        options: { shareToFeed: false, thumbOffsetMs: 1500 },
      }),
    )
    expect(result).toMatchObject({
      continuation: { containerId: "r1" },
      status: "pending",
    })
    const body = new URLSearchParams(calls[0]?.body)
    expect(body.get("media_type")).toBe("REELS")
    expect(body.get("video_url")).toBe(video.url)
    expect(body.get("share_to_feed")).toBe("false")
    expect(body.get("thumb_offset")).toBe("1500")
    expect(body.get("caption")).toBe("caption")
    expect(body.has("alt_text")).toBe(false)
  })

  test("a story sends STORIES with the right url field and no caption", async () => {
    mockFetch(() => respond(200, { id: "s1" }))
    await instagramPublisher.publish(
      request({ contentType: "story", media: [video] }),
    )
    const videoBody = new URLSearchParams(calls[0]?.body)
    expect(videoBody.get("media_type")).toBe("STORIES")
    expect(videoBody.get("video_url")).toBe(video.url)
    expect(videoBody.has("caption")).toBe(false)
    await instagramPublisher.publish(
      request({ contentType: "story", media: [photo(1)] }),
    )
    const imageBody = new URLSearchParams(calls[1]?.body)
    expect(imageBody.get("image_url")).toBe(photo(1).url)
    expect(imageBody.get("media_type")).toBe("STORIES")
  })

  test("a carousel creates one child per file and returns the child ids as continuation", async () => {
    let next = 0
    mockFetch(() => respond(200, { id: `child${++next}` }))
    const result = await instagramPublisher.publish(
      request({ contentType: "carousel", media: [photo(1), video] }),
    )
    expect(result).toMatchObject({
      continuation: { childIds: "child1,child2", phase: "children" },
      status: "pending",
    })
    const first = new URLSearchParams(calls[0]?.body)
    expect(first.get("is_carousel_item")).toBe("true")
    expect(first.get("image_url")).toBe(photo(1).url)
    expect(first.get("alt_text")).toBe("alt1")
    expect(first.has("caption")).toBe(false)
    const second = new URLSearchParams(calls[1]?.body)
    expect(second.get("media_type")).toBe("VIDEO")
    expect(second.get("video_url")).toBe(video.url)
  })

  test("a failing child fails the carousel as retry-safe", async () => {
    let next = 0
    mockFetch(() =>
      ++next === 2
        ? respond(400, {
            error: { code: 36_000, error_subcode: 2_207_004, message: "x" },
          })
        : respond(200, { id: `child${next}` }),
    )
    const result = await instagramPublisher.publish(
      request({ contentType: "carousel", media: [photo(1), photo(2)] }),
    )
    expect(result).toMatchObject({
      category: "mediaInvalid",
      provablyNotCreated: true,
      status: "failed",
    })
  })

  test.each([
    [400, { code: 190 }, "authFailed"],
    [403, { code: 10 }, "permissionDenied"],
    [400, { code: 4 }, "rateLimited"],
    [400, { code: 9, error_subcode: 2_207_042 }, "rateLimited"],
    [400, { code: 17 }, "rateLimited"],
    [400, { code: 368 }, "rateLimited"],
    [400, { code: 341 }, "rateLimited"],
    [400, { code: 80_002 }, "rateLimited"],
    [400, { code: 4, error_subcode: 2_207_051 }, "accountRestricted"],
    [400, { code: 36_000, error_subcode: 2_207_004 }, "mediaInvalid"],
    [400, { code: 9004, error_subcode: 2_207_052 }, "mediaInvalid"],
    [400, { code: 100, error_subcode: 2_207_010 }, "payloadInvalid"],
    [400, { code: 25, error_subcode: 2_207_050 }, "accountRestricted"],
  ])("maps container error %j to %s", async (status, error, category) => {
    mockFetch(() => respond(status, { error: { message: "boom", ...error } }))
    const result = await instagramPublisher.publish(request())
    expect(result).toMatchObject({ category, provablyNotCreated: true })
  })

  test.each([
    [{ code: 17 }, "account"],
    [{ code: 80_001 }, "account"],
    [{ code: 80_002 }, "account"],
    [{ code: 368 }, "account"],
    [{ code: 9, error_subcode: 2_207_042 }, "account"],
    [{ code: 4, error_subcode: 2_207_051 }, "account"],
    [{ code: 25, error_subcode: 2_207_050 }, "account"],
    [{ code: 4 }, "app"],
    [{ code: 32 }, "app"],
    [{ code: 341 }, "app"],
    [{ code: 613 }, "app"],
  ])("limit answer %j is %s-level", async (error, scope) => {
    mockFetch(() => respond(400, { error: { message: "boom", ...error } }))
    expect(await instagramPublisher.publish(request())).toMatchObject({
      scope,
    })
  })

  test("a permission error is not a limit answer and carries no scope", async () => {
    mockFetch(() => respond(403, { error: { code: 10, message: "boom" } }))
    const result = await instagramPublisher.publish(request())
    expect(result).toMatchObject({ category: "permissionDenied" })
    expect(result).not.toHaveProperty("scope")
  })

  test("the reset hint of X-Business-Use-Case-Usage is read in minutes", async () => {
    mockFetch(() =>
      respond(
        400,
        { error: { code: 80_002, message: "boom" } },
        {
          "x-business-use-case-usage": JSON.stringify({
            "111": [
              { estimated_time_to_regain_access: 5, type: "instagram" },
              { estimated_time_to_regain_access: 30, type: "instagram" },
            ],
          }),
        },
      ),
    )
    expect(await instagramPublisher.publish(request())).toMatchObject({
      retryAfterMs: 30 * 60_000,
    })
  })

  test("a hint over a day is capped at 24 hours; an exhausted X-App-Usage backs off 15 minutes", async () => {
    mockFetch(() =>
      respond(
        400,
        { error: { code: 4, message: "boom" } },
        {
          "x-business-use-case-usage": JSON.stringify({
            "111": [{ estimated_time_to_regain_access: 5000 }],
          }),
        },
      ),
    )
    expect(await instagramPublisher.publish(request())).toMatchObject({
      retryAfterMs: 24 * 3_600_000,
    })
    mockFetch(() =>
      respond(
        400,
        { error: { code: 4, message: "boom" } },
        { "x-app-usage": JSON.stringify({ call_count: 100, total_time: 40 }) },
      ),
    )
    expect(await instagramPublisher.publish(request())).toMatchObject({
      retryAfterMs: 15 * 60_000,
    })
  })

  test("a network error creating the container is retry-safe", async () => {
    mockFetch(() => new Error(TOKEN))
    const result = await instagramPublisher.publish(request())
    expect(result).toMatchObject({
      category: "networkError",
      status: "failed",
    })
    expect(JSON.stringify(result)).not.toContain(TOKEN)
  })

  test("never leaks the token in a failure message", async () => {
    mockFetch(() =>
      respond(400, { error: { code: 190, message: `bad ${TOKEN}` } }),
    )
    const result = await instagramPublisher.publish(request())
    expect(JSON.stringify(result)).not.toContain(TOKEN)
  })
})

describe("instagramPublisher.checkStatus", () => {
  test("FINISHED publishes the container and reads the permalink", async () => {
    mockFetch((call) => {
      if (call.url.includes("status_code")) {
        return respond(200, { status_code: "FINISHED" })
      }
      if (call.url.includes("media_publish")) {
        return respond(200, { id: "m1" })
      }
      return respond(200, { permalink: "https://instagram.com/p/abc" })
    })
    const result = await instagramPublisher.checkStatus(statusRequest)
    expect(result).toEqual({
      externalPostId: "m1",
      permalink: "https://instagram.com/p/abc",
      status: "published",
    })
    const publishCall = calls.find((call) => call.url.includes("media_publish"))
    expect(publishCall?.body).toBe("creation_id=c1")
  })

  test("the final publish call is checkpointed first, and never sent when the checkpoint is lost", async () => {
    const order: string[] = []
    mockFetch((call) => {
      order.push(call.url.includes("media_publish") ? "publish" : "read")
      return call.url.includes("status_code")
        ? respond(200, { status_code: "FINISHED" })
        : respond(200, { id: "m1" })
    })
    const checkpoint = vi.fn((continuation: Record<string, string>) => {
      order.push("checkpoint")
      expect(continuation).toMatchObject({
        containerId: "c1",
        finalCallAt: expect.stringMatching(DIGITS),
      })
      return Promise.resolve(true)
    })
    await instagramPublisher.checkStatus({ ...statusRequest, checkpoint })
    expect(order).toEqual(["read", "checkpoint", "publish", "read"])

    mockFetch(() => respond(200, { status_code: "FINISHED" }))
    const lost = await instagramPublisher.checkStatus({
      ...statusRequest,
      checkpoint: () => Promise.resolve(false),
    })
    expect(lost).toMatchObject({ status: "pending" })
    expect(calls.some((call) => call.url.includes("media_publish"))).toBe(false)
  })

  test("a container whose final call was already sent is never published again", async () => {
    mockFetch(() => respond(200, { status_code: "FINISHED" }))
    const result = await instagramPublisher.checkStatus({
      ...statusRequest,
      continuation: { containerId: "c1", finalCallAt: String(Date.now()) },
    })
    expect(result).toMatchObject({
      code: "final_call_unconfirmed",
      provablyNotCreated: false,
      status: "failed",
    })
    expect(calls.some((call) => call.url.includes("media_publish"))).toBe(false)
  })

  test("a failing permalink read still publishes", async () => {
    mockFetch((call) => {
      if (call.url.includes("status_code")) {
        return respond(200, { status_code: "FINISHED" })
      }
      if (call.url.includes("media_publish")) {
        return respond(200, { id: "m1" })
      }
      return respond(500, {})
    })
    const result = await instagramPublisher.checkStatus(statusRequest)
    expect(result).toMatchObject({ permalink: null, status: "published" })
  })

  test("IN_PROGRESS stays pending", async () => {
    mockFetch(() => respond(200, { status_code: "IN_PROGRESS" }))
    const result = await instagramPublisher.checkStatus(statusRequest)
    expect(result).toMatchObject({
      continuation: { containerId: "c1" },
      status: "pending",
    })
  })

  test.each([
    "ERROR",
    "EXPIRED",
  ])("%s is a mediaInvalid failure", async (code) => {
    mockFetch(() => respond(200, { status_code: code }))
    const result = await instagramPublisher.checkStatus(statusRequest)
    expect(result).toMatchObject({
      category: "mediaInvalid",
      provablyNotCreated: true,
    })
  })

  test("media-not-ready on publish stays pending", async () => {
    mockFetch((call) =>
      call.url.includes("status_code")
        ? respond(200, { status_code: "FINISHED" })
        : respond(400, {
            error: { code: 9007, error_subcode: 2_207_027, message: "wait" },
          }),
    )
    const result = await instagramPublisher.checkStatus(statusRequest)
    expect(result).toMatchObject({ status: "pending" })
  })

  test("a network error on media_publish is not provablyNotCreated", async () => {
    mockFetch((call) =>
      call.url.includes("status_code")
        ? respond(200, { status_code: "FINISHED" })
        : new Error("socket hang up"),
    )
    const result = await instagramPublisher.checkStatus(statusRequest)
    expect(result).toMatchObject({
      category: "networkError",
      provablyNotCreated: false,
    })
  })

  test("a missing container id fails", async () => {
    const result = await instagramPublisher.checkStatus({
      ...statusRequest,
      continuation: {},
    })
    expect(result).toMatchObject({ status: "failed" })
  })
})

describe("instagramPublisher.checkStatus (carousel children)", () => {
  const childRequest = {
    ...statusRequest,
    contentType: "carousel" as const,
    continuation: { childIds: "k1,k2", phase: "children" },
    text: "cap",
  }

  test("waits while a child is still processing", async () => {
    mockFetch((call) =>
      respond(200, {
        status_code: call.url.includes("/k1") ? "FINISHED" : "IN_PROGRESS",
      }),
    )
    const result = await instagramPublisher.checkStatus(childRequest)
    expect(result).toMatchObject({
      continuation: { childIds: "k1,k2", phase: "children" },
      status: "pending",
    })
    expect(calls.every((call) => call.method === "GET")).toBe(true)
  })

  test("creates the carousel container once every child is FINISHED", async () => {
    mockFetch((call) =>
      call.method === "GET"
        ? respond(200, { status_code: "FINISHED" })
        : respond(200, { id: "car1" }),
    )
    const result = await instagramPublisher.checkStatus(childRequest)
    expect(result).toMatchObject({
      continuation: { containerId: "car1" },
      retryAfterMs: 60_000,
      status: "pending",
    })
    const post = calls.find((call) => call.method === "POST")
    const body = new URLSearchParams(post?.body)
    expect(body.get("media_type")).toBe("CAROUSEL")
    expect(body.get("children")).toBe("k1,k2")
    expect(body.get("caption")).toBe("cap")
  })

  test("a child in ERROR fails the carousel", async () => {
    mockFetch(() => respond(200, { status_code: "ERROR" }))
    const result = await instagramPublisher.checkStatus(childRequest)
    expect(result).toMatchObject({
      category: "mediaInvalid",
      provablyNotCreated: true,
    })
  })
})

describe("instagramPublisher.delete", () => {
  test("is unsupported", async () => {
    const result = await instagramPublisher.delete({
      accessToken: TOKEN,
      externalPostId: "m1",
    })
    expect(result).toMatchObject({
      category: "payloadInvalid",
      code: "delete_unsupported",
      status: "failed",
    })
  })
})

describe("instagramPublisher.getPublishingLimit", () => {
  test("reads quota_usage and config.quota_total from content_publishing_limit", async () => {
    mockFetch(() =>
      respond(200, {
        data: [
          {
            config: { quota_duration: 86_400, quota_total: 100 },
            quota_usage: 7,
          },
        ],
      }),
    )
    const result = await instagramPublisher.getPublishingLimit?.({
      accessToken: TOKEN,
      destinationExternalId: "ig1",
    })
    expect(result).toEqual({ quotaTotal: 100, quotaUsage: 7 })
    expect(calls[0]?.url).toContain("ig1/content_publishing_limit")
    expect(calls[0]?.url).toContain("fields=quota_usage%2Cconfig")
  })

  test("a failed call or a strange answer is null, so the caller falls back to the documented number", async () => {
    mockFetch(() => respond(400, { error: { code: 190, message: "x" } }))
    expect(
      await instagramPublisher.getPublishingLimit?.({
        accessToken: TOKEN,
        destinationExternalId: "ig1",
      }),
    ).toBeNull()
    mockFetch(() => respond(200, { data: [] }))
    expect(
      await instagramPublisher.getPublishingLimit?.({
        accessToken: TOKEN,
        destinationExternalId: "ig1",
      }),
    ).toBeNull()
  })
})

describe("instagramPublisher container polling", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  test("a new container is first read after 20 seconds, and its clock starts", async () => {
    mockFetch(() => respond(200, { id: "c1" }))
    const result = await instagramPublisher.publish(request())
    expect(result).toMatchObject({ retryAfterMs: 20_000, status: "pending" })
    if (result.status === "pending") {
      expect(Number(result.continuation.pollStartedAt)).toBeGreaterThan(0)
    }
  })

  test("a carousel's children are first read after 20 seconds", async () => {
    mockFetch(() => respond(200, { id: "child" }))
    const result = await instagramPublisher.publish(
      request({ contentType: "carousel", media: [photo(1), photo(2)] }),
    )
    expect(result).toMatchObject({ retryAfterMs: 20_000, status: "pending" })
  })

  test("IN_PROGRESS inside five minutes keeps its clock and waits one minute", async () => {
    mockFetch(() => respond(200, { status_code: "IN_PROGRESS" }))
    const startedAt = String(Date.now() - 4 * 60_000)
    const result = await instagramPublisher.checkStatus({
      ...statusRequest,
      continuation: { containerId: "c1", pollStartedAt: startedAt },
    })
    expect(result).toMatchObject({
      continuation: { pollStartedAt: startedAt },
      retryAfterMs: 60_000,
      status: "pending",
    })
  })

  test("a continuation without a clock gets one", async () => {
    mockFetch(() => respond(200, { status_code: "IN_PROGRESS" }))
    const result = await instagramPublisher.checkStatus(statusRequest)
    expect(result.status).toBe("pending")
    if (result.status === "pending") {
      expect(
        Math.abs(Number(result.continuation.pollStartedAt) - Date.now()),
      ).toBeLessThan(5000)
    }
  })

  test("IN_PROGRESS after five minutes fails as retry-safe", async () => {
    mockFetch(() => respond(200, { status_code: "IN_PROGRESS" }))
    const result = await instagramPublisher.checkStatus({
      ...statusRequest,
      continuation: {
        containerId: "c1",
        pollStartedAt: String(Date.now() - 5 * 60_000 - 1000),
      },
    })
    expect(result).toMatchObject({
      code: "container_poll_timeout",
      provablyNotCreated: true,
      status: "failed",
    })
  })

  test("a carousel child still processing after five minutes fails as retry-safe", async () => {
    mockFetch(() => respond(200, { status_code: "IN_PROGRESS" }))
    const result = await instagramPublisher.checkStatus({
      ...statusRequest,
      contentType: "carousel",
      continuation: {
        childIds: "k1",
        phase: "children",
        pollStartedAt: String(Date.now() - 6 * 60_000),
      },
    })
    expect(result).toMatchObject({
      code: "container_poll_timeout",
      provablyNotCreated: true,
    })
  })

  describe("the five-minute cap", () => {
    const CAP = 5 * 60_000
    const FIXED_NOW = 1_800_000_000_000

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] })
      vi.setSystemTime(FIXED_NOW)
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    test("a FINISHED read after the cap neither reads nor publishes", async () => {
      mockFetch(() => respond(200, { status_code: "FINISHED" }))
      const result = await instagramPublisher.checkStatus({
        ...statusRequest,
        continuation: {
          containerId: "c1",
          pollStartedAt: String(FIXED_NOW - CAP - 1000),
        },
      })
      expect(result).toMatchObject({
        code: "container_poll_timeout",
        provablyNotCreated: true,
        status: "failed",
      })
      expect(calls).toHaveLength(0)
    })

    test("exactly at the cap is already expired", async () => {
      mockFetch(() => respond(200, { status_code: "FINISHED" }))
      const result = await instagramPublisher.checkStatus({
        ...statusRequest,
        continuation: {
          containerId: "c1",
          pollStartedAt: String(FIXED_NOW - CAP),
        },
      })
      expect(result).toMatchObject({ code: "container_poll_timeout" })
      expect(calls).toHaveLength(0)
    })

    test("one millisecond inside the cap still publishes", async () => {
      mockFetch((call) =>
        call.url.includes("status_code")
          ? respond(200, { status_code: "FINISHED" })
          : respond(200, { id: "m1", permalink: "https://ig/p/1" }),
      )
      const result = await instagramPublisher.checkStatus({
        ...statusRequest,
        continuation: {
          containerId: "c1",
          pollStartedAt: String(FIXED_NOW - CAP + 1),
        },
      })
      expect(result.status).toBe("published")
    })

    test("a checkpoint that crosses the deadline sends no publish call", async () => {
      mockFetch(() => respond(200, { status_code: "FINISHED" }))
      const checkpoint = vi.fn(() => {
        vi.setSystemTime(FIXED_NOW + 2000)
        return Promise.resolve(true)
      })
      const result = await instagramPublisher.checkStatus({
        ...statusRequest,
        checkpoint,
        continuation: {
          containerId: "c1",
          pollStartedAt: String(FIXED_NOW - CAP + 1000),
        },
      })
      expect(checkpoint).toHaveBeenCalledTimes(1)
      expect(result).toMatchObject({
        code: "container_poll_timeout",
        status: "failed",
      })
      expect(calls.some((call) => call.url.includes("media_publish"))).toBe(
        false,
      )
    })

    test("a carousel past the cap creates no container", async () => {
      mockFetch(() => respond(200, { status_code: "FINISHED" }))
      const result = await instagramPublisher.checkStatus({
        ...statusRequest,
        contentType: "carousel",
        continuation: {
          childIds: "k1,k2",
          phase: "children",
          pollStartedAt: String(FIXED_NOW - CAP),
        },
      })
      expect(result).toMatchObject({ code: "container_poll_timeout" })
      expect(calls).toHaveLength(0)
    })

    test("children read across the deadline create no carousel container", async () => {
      mockFetch((call) => {
        // The reads end after the five minutes ran out.
        vi.setSystemTime(FIXED_NOW + 2000)
        return call.url.includes("status_code")
          ? respond(200, { status_code: "FINISHED" })
          : respond(200, { id: "parent-1" })
      })
      const result = await instagramPublisher.checkStatus({
        ...statusRequest,
        contentType: "carousel",
        continuation: {
          childIds: "k1,k2",
          phase: "children",
          pollStartedAt: String(FIXED_NOW - CAP + 1000),
        },
      })
      expect(result).toMatchObject({ code: "container_poll_timeout" })
      expect(calls.every((call) => call.url.includes("status_code"))).toBe(true)
    })

    test("the carousel parent keeps the children's clock", async () => {
      const startedAt = String(FIXED_NOW - 60_000)
      mockFetch((call) =>
        call.url.includes("status_code")
          ? respond(200, { status_code: "FINISHED" })
          : respond(200, { id: "parent-1" }),
      )
      const result = await instagramPublisher.checkStatus({
        ...statusRequest,
        contentType: "carousel",
        continuation: {
          childIds: "k1,k2",
          phase: "children",
          pollStartedAt: startedAt,
        },
      })
      expect(result).toMatchObject({
        continuation: { containerId: "parent-1", pollStartedAt: startedAt },
        retryAfterMs: 60_000,
        status: "pending",
      })
    })
  })

  test.each([
    2_207_003, 2_207_006, 2_207_008, 2_207_020,
  ])("subcode %i is a retry-safe transient answer", async (subcode) => {
    mockFetch(() =>
      respond(400, {
        error: { code: 1, error_subcode: subcode, message: "try again" },
      }),
    )
    expect(await instagramPublisher.publish(request())).toMatchObject({
      category: "networkError",
      provablyNotCreated: true,
    })
  })

  test("other media subcodes stay mediaInvalid", async () => {
    mockFetch(() =>
      respond(400, {
        error: { code: 36_000, error_subcode: 2_207_009, message: "bad" },
      }),
    )
    expect(await instagramPublisher.publish(request())).toMatchObject({
      category: "mediaInvalid",
    })
  })

  test.each([
    [24, 2_207_008],
    [-2, 2_207_020],
    [1, 2_207_003],
  ])("a status read that fails with code %i / subcode %i is retry-safe", async (code, subcode) => {
    mockFetch(() =>
      respond(400, {
        error: { code, error_subcode: subcode, message: "try again" },
      }),
    )
    expect(await instagramPublisher.checkStatus(statusRequest)).toMatchObject({
      category: "networkError",
      provablyNotCreated: true,
    })
  })

  test.each([
    [24, 2_207_008],
    [-2, 2_207_020],
  ])("media_publish failing with code %i / subcode %i is retry-safe", async (code, subcode) => {
    mockFetch((call) =>
      call.url.includes("status_code")
        ? respond(200, { status_code: "FINISHED" })
        : respond(400, {
            error: { code, error_subcode: subcode, message: "try again" },
          }),
    )
    expect(await instagramPublisher.checkStatus(statusRequest)).toMatchObject({
      category: "networkError",
      provablyNotCreated: true,
    })
  })

  test("media-not-ready on publish keeps its clock and waits", async () => {
    mockFetch((call) =>
      call.url.includes("status_code")
        ? respond(200, { status_code: "FINISHED" })
        : respond(400, {
            error: { code: 9007, error_subcode: 2_207_027, message: "wait" },
          }),
    )
    const startedAt = String(Date.now() - 60_000)
    const result = await instagramPublisher.checkStatus({
      ...statusRequest,
      continuation: { containerId: "c1", pollStartedAt: startedAt },
    })
    expect(result).toMatchObject({
      continuation: { pollStartedAt: startedAt },
      retryAfterMs: 60_000,
      status: "pending",
    })
  })

  test("media-not-ready on publish after five minutes fails as retry-safe", async () => {
    mockFetch((call) =>
      call.url.includes("status_code")
        ? respond(200, { status_code: "FINISHED" })
        : respond(400, {
            error: { code: 9007, error_subcode: 2_207_027, message: "wait" },
          }),
    )
    const result = await instagramPublisher.checkStatus({
      ...statusRequest,
      continuation: {
        containerId: "c1",
        pollStartedAt: String(Date.now() - 5 * 60_000 - 1000),
      },
    })
    expect(result).toMatchObject({
      code: "container_poll_timeout",
      provablyNotCreated: true,
      status: "failed",
    })
  })
})
