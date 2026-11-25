import type { SocialPublishRequest } from "@chatbotx.io/utils/social-publisher"
import { afterEach, describe, expect, test, vi } from "vitest"
import { INSTAGRAM_BUSINESS_SCOPES } from "../src/constants"
import {
  instagramFacebookPublisher,
  instagramPublisher,
} from "../src/publisher"

const TOKEN = "page-or-user-token"

type FetchCall = { body: string | undefined; method: string; url: string }
const calls: FetchCall[] = []

const respond = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status })

const mockFetch = (handler: (call: FetchCall) => Response): void => {
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
      return Promise.resolve(handler(call))
    }),
  )
}

const video = { altText: null, mimeType: "video/mp4", url: "https://i/v.mp4" }
const photo = { altText: "a", mimeType: "image/jpeg", url: "https://i/a.jpg" }

const request = (
  overrides: Partial<SocialPublishRequest>,
): SocialPublishRequest => ({
  accessToken: TOKEN,
  contentType: "image",
  destinationExternalId: "ig1",
  linkUrl: null,
  media: [photo],
  options: {},
  text: "caption",
  ...overrides,
})

const flavours = [
  ["instagram", instagramPublisher, "https://graph.instagram.com/v22.0/"],
  [
    "instagramFacebook",
    instagramFacebookPublisher,
    "https://graph.facebook.com/v23.0/",
  ],
] as const

afterEach(() => {
  vi.unstubAllGlobals()
})

describe.each(flavours)("%s transport parity", (via, publisher, base) => {
  const cases: [string, Partial<SocialPublishRequest>, string][] = [
    ["image", {}, "image_url"],
    [
      "reel",
      { contentType: "reel", media: [video], options: { shareToFeed: true } },
      "video_url",
    ],
    ["story", { contentType: "story", media: [photo] }, "image_url"],
  ]

  test.each(
    cases,
  )("%s creates a container on the right host with via", async (_n, overrides, field) => {
    mockFetch(() => respond(200, { id: "c1" }))
    const result = await publisher.publish(request(overrides))
    expect(result).toMatchObject({
      continuation: { containerId: "c1", via },
      status: "pending",
    })
    expect(calls[0]?.url).toBe(`${base}ig1/media`)
    expect(new URLSearchParams(calls[0]?.body).has(field)).toBe(true)
  })

  test("carousel carries via on the children continuation", async () => {
    let n = 0
    mockFetch(() => respond(200, { id: `k${++n}` }))
    const result = await publisher.publish(
      request({ contentType: "carousel", media: [photo, video] }),
    )
    expect(result).toMatchObject({
      continuation: { childIds: "k1,k2", phase: "children", via },
    })
  })

  test("FINISHED publishes through media_publish on the same host", async () => {
    mockFetch((call) => {
      if (call.url.includes("status_code")) {
        return respond(200, { status_code: "FINISHED" })
      }
      if (call.url.includes("media_publish")) {
        return respond(200, { id: "m1" })
      }
      return respond(200, { permalink: "https://ig/p/m1" })
    })
    const result = await publisher.checkStatus({
      accessToken: TOKEN,
      contentType: "image",
      continuation: { containerId: "c1", via },
      destinationExternalId: "ig1",
      options: {},
      text: null,
    })
    expect(result).toMatchObject({ externalPostId: "m1", status: "published" })
    expect(calls.every((call) => call.url.startsWith(base))).toBe(true)
  })

  test("maps auth failures and never leaks the token", async () => {
    mockFetch(() =>
      respond(400, { error: { code: 190, message: `bad ${TOKEN}` } }),
    )
    const result = await publisher.publish(request({}))
    expect(result).toMatchObject({
      category: "authFailed",
      provablyNotCreated: true,
    })
    expect(JSON.stringify(result)).not.toContain(TOKEN)
  })

  test.runIf(via === "instagram")("delete is unsupported", async () => {
    expect(
      await publisher.delete({ accessToken: TOKEN, externalPostId: "m1" }),
    ).toMatchObject({ code: "delete_unsupported" })
  })
})

describe("instagramFacebookPublisher.delete", () => {
  test("sends DELETE /{media-id} on graph.facebook.com and reports deleted", async () => {
    mockFetch(() => respond(200, { success: true }))
    const result = await instagramFacebookPublisher.delete({
      accessToken: TOKEN,
      externalPostId: "m1",
    })
    expect(result).toEqual({ deleted: true })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.method).toBe("DELETE")
    expect(calls[0]?.url).toBe("https://graph.facebook.com/v23.0/m1")
  })

  test("success false is a rejection that may not be retried as created", async () => {
    mockFetch(() => respond(200, { success: false }))
    expect(
      await instagramFacebookPublisher.delete({
        accessToken: TOKEN,
        externalPostId: "m1",
      }),
    ).toMatchObject({ code: "delete_rejected", status: "failed" })
  })

  test("a missing permission answer maps to permissionDenied", async () => {
    mockFetch(() =>
      respond(403, { error: { code: 10, message: "Permission denied" } }),
    )
    expect(
      await instagramFacebookPublisher.delete({
        accessToken: TOKEN,
        externalPostId: "m1",
      }),
    ).toMatchObject({ category: "permissionDenied", status: "failed" })
  })

  test("100/33 on DELETE with a readable media is a missing permission", async () => {
    mockFetch((call) =>
      call.method === "DELETE"
        ? respond(400, {
            error: { code: 100, error_subcode: 33, message: "x" },
          })
        : respond(200, { id: "m1" }),
    )
    expect(
      await instagramFacebookPublisher.delete({
        accessToken: TOKEN,
        externalPostId: "m1",
      }),
    ).toMatchObject({ category: "permissionDenied" })
    expect(calls.map((call) => call.method)).toEqual(["DELETE", "GET"])
    expect(calls[1]?.url).toBe("https://graph.facebook.com/v23.0/m1?fields=id")
  })

  test("100/33 on DELETE and on the read probe means the media is already gone", async () => {
    mockFetch(() =>
      respond(400, { error: { code: 100, error_subcode: 33, message: "x" } }),
    )
    expect(
      await instagramFacebookPublisher.delete({
        accessToken: TOKEN,
        externalPostId: "m1",
      }),
    ).toMatchObject({ category: "notFound", status: "failed" })
    expect(calls.map((call) => call.method)).toEqual(["DELETE", "GET"])
  })

  test("a failing probe that is not 'missing' keeps permissionDenied and never retries the DELETE", async () => {
    mockFetch((call) =>
      call.method === "DELETE"
        ? respond(400, {
            error: { code: 100, error_subcode: 33, message: "x" },
          })
        : respond(500, { error: { code: 2, message: "temporary" } }),
    )
    expect(
      await instagramFacebookPublisher.delete({
        accessToken: TOKEN,
        externalPostId: "m1",
      }),
    ).toMatchObject({ category: "permissionDenied" })
    expect(calls.filter((call) => call.method === "DELETE")).toHaveLength(1)
  })

  test("a network error is not retried", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("boom"))),
    )
    const result = await instagramFacebookPublisher.delete({
      accessToken: TOKEN,
      externalPostId: "m1",
    })
    expect(result).toMatchObject({ category: "networkError" })
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
  })

  test("the Instagram Login publisher never calls the network for a delete", async () => {
    mockFetch(() => respond(200, { success: true }))
    await instagramPublisher.delete({
      accessToken: TOKEN,
      externalPostId: "m1",
    })
    expect(calls).toHaveLength(0)
  })
})

describe("scopes", () => {
  test("Instagram Login requests the content publish scope", () => {
    expect(INSTAGRAM_BUSINESS_SCOPES).toContain(
      "instagram_business_content_publish",
    )
  })
})
