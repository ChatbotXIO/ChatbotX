import type { SocialPublishRequest } from "@chatbotx.io/utils/social-publisher"
import { afterEach, describe, expect, test, vi } from "vitest"
import { threadsPublisher } from "../src/publisher"

const DIGITS = /^\d+$/

const TOKEN = "THAA-secret-token"

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
  overrides: Partial<SocialPublishRequest> = {},
): SocialPublishRequest => ({
  accessToken: TOKEN,
  contentType: "text",
  destinationExternalId: "u1",
  linkUrl: null,
  media: [],
  options: {},
  text: "hello",
  ...overrides,
})

const statusRequest = {
  accessToken: TOKEN,
  contentType: "text" as const,
  continuation: { containerId: "c1" },
  destinationExternalId: "u1",
  options: {},
  text: null,
}

const video = {
  altText: "clip",
  mimeType: "video/mp4",
  url: "https://i.example/v.mp4",
}
const photo = {
  altText: null,
  mimeType: "image/png",
  url: "https://i.example/a.png",
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("threadsPublisher.publish", () => {
  test("creates a TEXT container and waits about 30s", async () => {
    mockFetch(() => respond(200, { id: "c1" }))
    const result = await threadsPublisher.publish(request())
    expect(result).toEqual({
      continuation: {
        containerId: "c1",
        pollStartedAt: expect.stringMatching(DIGITS),
      },
      retryAfterMs: 30_000,
      status: "pending",
    })
    expect(calls[0]?.url).toContain("graph.threads.com")
    expect(calls[0]?.url).toContain("/u1/threads")
    expect(calls[0]?.body).toContain("media_type=TEXT")
    expect(calls[0]?.body).toContain("text=hello")
  })

  test("creates an IMAGE container with image_url", async () => {
    mockFetch(() => respond(200, { id: "c2" }))
    const result = await threadsPublisher.publish(
      request({
        contentType: "image",
        media: [
          {
            altText: null,
            mimeType: "image/png",
            url: "https://i.example/a.png",
          },
        ],
        text: null,
      }),
    )
    expect(result).toMatchObject({ status: "pending" })
    expect(calls[0]?.body).toContain("media_type=IMAGE")
    expect(calls[0]?.body).toContain("image_url=")
  })

  test("a video container carries VIDEO, video_url, text and alt_text", async () => {
    mockFetch(() => respond(200, { id: "v1" }))
    const result = await threadsPublisher.publish(
      request({ contentType: "video", media: [video] }),
    )
    expect(result).toMatchObject({
      continuation: { containerId: "v1" },
      status: "pending",
    })
    const body = new URLSearchParams(calls[0]?.body)
    expect(body.get("media_type")).toBe("VIDEO")
    expect(body.get("video_url")).toBe(video.url)
    expect(body.get("text")).toBe("hello")
    expect(body.get("alt_text")).toBe("clip")
  })

  test("a carousel creates an item container per file and keeps the ids as continuation", async () => {
    let next = 0
    mockFetch(() => respond(200, { id: `i${++next}` }))
    const result = await threadsPublisher.publish(
      request({ contentType: "carousel", media: [photo, video] }),
    )
    expect(result).toMatchObject({
      continuation: { childIds: "i1,i2", phase: "children" },
      status: "pending",
    })
    const first = new URLSearchParams(calls[0]?.body)
    expect(first.get("is_carousel_item")).toBe("true")
    expect(first.get("media_type")).toBe("IMAGE")
    expect(first.has("text")).toBe(false)
  })

  test("a failing carousel item fails the post as retry-safe", async () => {
    mockFetch(() =>
      respond(400, { error: { code: 100, message: `bad ${TOKEN}` } }),
    )
    const result = await threadsPublisher.publish(
      request({ contentType: "carousel", media: [photo, video] }),
    )
    expect(result).toMatchObject({
      provablyNotCreated: true,
      status: "failed",
    })
    expect(JSON.stringify(result)).not.toContain(TOKEN)
  })

  test.each([
    "link",
    "reel",
  ] as const)("rejects %s as unsupported", async (contentType) => {
    mockFetch(() => respond(200, {}))
    const result = await threadsPublisher.publish(request({ contentType }))
    expect(result).toMatchObject({
      category: "payloadInvalid",
      provablyNotCreated: true,
    })
    expect(calls).toHaveLength(0)
  })

  test.each([
    [400, { code: 190 }, "authFailed"],
    [403, { code: 10 }, "permissionDenied"],
    [400, { code: 4 }, "rateLimited"],
    [400, { code: 100 }, "payloadInvalid"],
  ])("maps container error %j to %s", async (status, error, category) => {
    mockFetch(() => respond(status, { error: { message: "boom", ...error } }))
    const result = await threadsPublisher.publish(request())
    expect(result).toMatchObject({ category, provablyNotCreated: true })
  })

  test("THREADS_API__LINK_LIMIT_EXCEEDED is a payloadInvalid failure that created nothing", async () => {
    mockFetch(() =>
      respond(500, {
        error: {
          code: 1,
          message: "THREADS_API__LINK_LIMIT_EXCEEDED: too many links",
        },
      }),
    )
    const result = await threadsPublisher.publish(request())
    expect(result).toMatchObject({
      category: "payloadInvalid",
      provablyNotCreated: true,
    })
  })

  test("network error on container creation maps to networkError", async () => {
    mockFetch(() => new Error(TOKEN))
    const result = await threadsPublisher.publish(request())
    expect(result).toMatchObject({ category: "networkError", status: "failed" })
    expect(JSON.stringify(result)).not.toContain(TOKEN)
  })

  test("never leaks the token in a failure message", async () => {
    mockFetch(() =>
      respond(400, { error: { code: 190, message: `bad ${TOKEN}` } }),
    )
    const result = await threadsPublisher.publish(request())
    expect(JSON.stringify(result)).not.toContain(TOKEN)
  })
})

describe("threadsPublisher.checkStatus", () => {
  test("FINISHED publishes and reads the permalink", async () => {
    mockFetch((call) => {
      if (call.url.includes("fields=status")) {
        return respond(200, { status: "FINISHED" })
      }
      if (call.url.includes("threads_publish")) {
        return respond(200, { id: "m1" })
      }
      return respond(200, { permalink: "https://threads.com/@u/post/x" })
    })
    const result = await threadsPublisher.checkStatus(statusRequest)
    expect(result).toEqual({
      externalPostId: "m1",
      permalink: "https://threads.com/@u/post/x",
      status: "published",
    })
    const publishCall = calls.find((call) =>
      call.url.includes("threads_publish"),
    )
    expect(publishCall?.body).toContain("creation_id=c1")
  })

  test("the publish call is checkpointed first, and never sent twice", async () => {
    mockFetch((call) =>
      call.method === "GET"
        ? respond(200, { status: "FINISHED" })
        : respond(200, { id: "m1" }),
    )
    const checkpoint = vi.fn(() => Promise.resolve(true))
    await threadsPublisher.checkStatus({ ...statusRequest, checkpoint })
    expect(checkpoint).toHaveBeenCalledWith(
      expect.objectContaining({
        containerId: "c1",
        finalCallAt: expect.stringMatching(DIGITS),
      }),
    )

    mockFetch(() => respond(200, { status: "FINISHED" }))
    const again = await threadsPublisher.checkStatus({
      ...statusRequest,
      continuation: { containerId: "c1", finalCallAt: String(Date.now()) },
    })
    expect(again).toMatchObject({
      code: "final_call_unconfirmed",
      provablyNotCreated: false,
      status: "failed",
    })
    expect(calls.some((call) => call.url.includes("threads_publish"))).toBe(
      false,
    )
  })

  test("IN_PROGRESS stays pending", async () => {
    mockFetch(() => respond(200, { status: "IN_PROGRESS" }))
    const result = await threadsPublisher.checkStatus(statusRequest)
    expect(result).toMatchObject({ status: "pending" })
  })

  test("IN_PROGRESS is read again after a minute, not 30 seconds", async () => {
    mockFetch(() => respond(200, { status: "IN_PROGRESS" }))
    const result = await threadsPublisher.checkStatus(statusRequest)
    expect(result).toMatchObject({ retryAfterMs: 60_000, status: "pending" })
  })

  test("IN_PROGRESS after five minutes fails as retry-safe", async () => {
    mockFetch(() => respond(200, { status: "IN_PROGRESS" }))
    const result = await threadsPublisher.checkStatus({
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

  test("IN_PROGRESS within five minutes keeps its clock", async () => {
    mockFetch(() => respond(200, { status: "IN_PROGRESS" }))
    const startedAt = String(Date.now() - 2 * 60_000)
    const result = await threadsPublisher.checkStatus({
      ...statusRequest,
      continuation: { containerId: "c1", pollStartedAt: startedAt },
    })
    expect(result).toMatchObject({
      continuation: { containerId: "c1", pollStartedAt: startedAt },
      status: "pending",
    })
  })

  test("ERROR carries the provider message and is provablyNotCreated", async () => {
    mockFetch(() =>
      respond(200, { error_message: "INVALID_DURATION", status: "ERROR" }),
    )
    const result = await threadsPublisher.checkStatus(statusRequest)
    expect(result).toMatchObject({
      category: "mediaInvalid",
      provablyNotCreated: true,
    })
    expect((result as { message: string }).message).toContain(
      "INVALID_DURATION",
    )
  })

  test("a network error on threads_publish is not provablyNotCreated", async () => {
    mockFetch((call) =>
      call.url.includes("fields=status")
        ? respond(200, { status: "FINISHED" })
        : new Error("timeout"),
    )
    const result = await threadsPublisher.checkStatus(statusRequest)
    expect(result).toMatchObject({
      category: "networkError",
      provablyNotCreated: false,
    })
  })
})

describe("threadsPublisher.delete", () => {
  test("deletes a post with DELETE /{media-id}", async () => {
    mockFetch(() => respond(200, { success: true }))
    const result = await threadsPublisher.delete({
      accessToken: TOKEN,
      externalPostId: "m1",
    })
    expect(result).toEqual({ deleted: true })
    expect(calls[0]).toMatchObject({ method: "DELETE" })
    expect(calls[0]?.url).toContain("/m1?")
  })

  test("maps a delete error", async () => {
    mockFetch(() => respond(403, { error: { code: 10, message: "no" } }))
    const result = await threadsPublisher.delete({
      accessToken: TOKEN,
      externalPostId: "m1",
    })
    expect(result).toMatchObject({ category: "permissionDenied" })
  })

  test.each([
    [400, { code: 803 }, "notFound"],
    [400, { code: 100, error_subcode: 33 }, "permissionDenied"],
    [400, { code: 21 }, "permissionDenied"],
  ])("maps a delete error HTTP %i %j to %s (100/33 and 21 never prove the post is gone)", async (status, error, category) => {
    mockFetch(() => respond(status, { error: { message: "x", ...error } }))
    const result = await threadsPublisher.delete({
      accessToken: TOKEN,
      externalPostId: "m1",
    })
    expect(result).toMatchObject({ category })
  })
})

describe("threadsPublisher.checkStatus (carousel items)", () => {
  const childRequest = {
    ...statusRequest,
    contentType: "carousel" as const,
    continuation: { childIds: "i1,i2", phase: "children" },
    text: "hello",
  }

  test("waits while an item is processing", async () => {
    mockFetch((call) =>
      respond(200, {
        status: call.url.includes("/i1?") ? "FINISHED" : "IN_PROGRESS",
      }),
    )
    const result = await threadsPublisher.checkStatus(childRequest)
    expect(result).toMatchObject({
      continuation: { childIds: "i1,i2", phase: "children" },
      status: "pending",
    })
  })

  test("an item still processing after five minutes fails as retry-safe", async () => {
    mockFetch(() => respond(200, { status: "IN_PROGRESS" }))
    const result = await threadsPublisher.checkStatus({
      ...childRequest,
      continuation: {
        ...childRequest.continuation,
        pollStartedAt: String(Date.now() - 6 * 60_000),
      },
    })
    expect(result).toMatchObject({
      code: "container_poll_timeout",
      provablyNotCreated: true,
      status: "failed",
    })
  })

  test("creates the carousel container with the text when every item is FINISHED", async () => {
    mockFetch((call) =>
      call.method === "GET"
        ? respond(200, { status: "FINISHED" })
        : respond(200, { id: "car1" }),
    )
    const result = await threadsPublisher.checkStatus(childRequest)
    expect(result).toMatchObject({
      continuation: { containerId: "car1" },
      status: "pending",
    })
    const body = new URLSearchParams(
      calls.find((call) => call.method === "POST")?.body,
    )
    expect(body.get("media_type")).toBe("CAROUSEL")
    expect(body.get("children")).toBe("i1,i2")
    expect(body.get("text")).toBe("hello")
  })

  test("an item in ERROR fails the carousel", async () => {
    mockFetch(() => respond(200, { status: "ERROR", error_message: "x" }))
    const result = await threadsPublisher.checkStatus(childRequest)
    expect(result).toMatchObject({
      category: "mediaInvalid",
      provablyNotCreated: true,
    })
  })
})

describe("threadsPublisher.publishPart", () => {
  const partRequest = {
    accessToken: TOKEN,
    destinationExternalId: "u1",
    kind: "threadPart" as const,
    replyToExternalPostId: "m9",
    text: "  the next part  ",
  }

  test("creates a TEXT container that replies to the given post, and leaves it pending", async () => {
    mockFetch(() => respond(200, { id: "c-reply" }))

    const result = await threadsPublisher.publishPart?.(partRequest)

    expect(result).toEqual({
      continuation: {
        containerId: "c-reply",
        pollStartedAt: expect.stringMatching(DIGITS),
      },
      retryAfterMs: 30_000,
      status: "pending",
    })
    expect(calls).toHaveLength(1)
    const [call] = calls
    expect(call?.url).toContain("/u1/threads")
    const sent = new URLSearchParams(
      call?.body ?? new URL(call?.url ?? "").search,
    )
    expect(sent.get("media_type")).toBe("TEXT")
    expect(sent.get("reply_to_id")).toBe("m9")
    expect(sent.get("text")).toBe("the next part")
  })

  test("a failure before the container exists is provably not created", async () => {
    mockFetch(() => respond(500, { error: { code: 2, message: "oops" } }))

    const result = await threadsPublisher.publishPart?.(partRequest)

    expect(result).toMatchObject({ provablyNotCreated: true, status: "failed" })
  })

  test("an empty text is refused without a call", async () => {
    mockFetch(() => respond(200, { id: "x" }))

    const result = await threadsPublisher.publishPart?.({
      ...partRequest,
      text: "   ",
    })

    expect(result).toMatchObject({
      category: "payloadInvalid",
      status: "failed",
    })
    expect(calls).toHaveLength(0)
  })

  test("the container is read and published by the same status call as a head", async () => {
    mockFetch((call) => {
      if (call.url.includes("threads_publish")) {
        return respond(200, { id: "m10" })
      }
      if (call.url.includes("c-reply")) {
        return respond(200, { status: "FINISHED" })
      }
      return respond(200, { permalink: "https://threads.test/m10" })
    })

    const result = await threadsPublisher.checkStatus({
      ...statusRequest,
      continuation: { containerId: "c-reply" },
    })

    expect(result).toMatchObject({ externalPostId: "m10", status: "published" })
  })
})

describe("threadsPublisher.getPublishingLimit", () => {
  test("reads threads_publishing_limit (250 posts per rolling 24 hours)", async () => {
    mockFetch(() =>
      respond(200, {
        data: [
          {
            config: { quota_duration: 86_400, quota_total: 250 },
            quota_usage: 12,
            reply_config: { quota_total: 1000 },
            reply_quota_usage: 3,
          },
        ],
      }),
    )
    expect(
      await threadsPublisher.getPublishingLimit?.({
        accessToken: TOKEN,
        destinationExternalId: "u1",
      }),
    ).toEqual({ quotaTotal: 250, quotaUsage: 12 })
    expect(calls[0]?.url).toContain("u1/threads_publishing_limit")
  })

  test("a failed call is null", async () => {
    mockFetch(() => respond(500, {}))
    expect(
      await threadsPublisher.getPublishingLimit?.({
        accessToken: TOKEN,
        destinationExternalId: "u1",
      }),
    ).toBeNull()
  })
})

describe("threadsPublisher reply and delete quotas", () => {
  const body = {
    data: [
      {
        delete_config: { quota_duration: 86_400, quota_total: 100 },
        delete_quota_usage: 100,
        reply_config: { quota_duration: 86_400, quota_total: 1000 },
        reply_quota_usage: 40,
      },
    ],
  }

  test("getReplyLimit reads only the documented reply fields", async () => {
    mockFetch(() => respond(200, body))
    expect(
      await threadsPublisher.getReplyLimit?.({
        accessToken: TOKEN,
        destinationExternalId: "u1",
      }),
    ).toEqual({ quotaTotal: 1000, quotaUsage: 40 })
    const url = new URL(calls[0]?.url ?? "")
    expect(url.pathname).toContain("u1/threads_publishing_limit")
    expect(url.searchParams.get("fields")).toBe(
      "reply_quota_usage,reply_config",
    )
  })

  test("getDeleteLimit reads delete_quota_usage and delete_config", async () => {
    mockFetch(() => respond(200, body))
    expect(
      await threadsPublisher.getDeleteLimit?.({
        accessToken: TOKEN,
        destinationExternalId: "u1",
      }),
    ).toEqual({ quotaTotal: 100, quotaUsage: 100 })
    expect(new URL(calls[0]?.url ?? "").searchParams.get("fields")).toBe(
      "delete_quota_usage,delete_config",
    )
  })

  test("an unreadable answer is null", async () => {
    mockFetch(() => respond(200, { data: [{}] }))
    expect(
      await threadsPublisher.getReplyLimit?.({
        accessToken: TOKEN,
        destinationExternalId: "u1",
      }),
    ).toBeNull()
    mockFetch(() => respond(500, {}))
    expect(
      await threadsPublisher.getDeleteLimit?.({
        accessToken: TOKEN,
        destinationExternalId: "u1",
      }),
    ).toBeNull()
  })
})
