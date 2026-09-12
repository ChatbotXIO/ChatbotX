import { describe, expect, test, vi } from "vitest"
import {
  fetchFollowingSafeRedirects,
  readBodyWithLimit,
} from "../src/lib/bounded-fetch"

function streamResponse(
  chunks: Uint8Array[],
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk)
      }
      controller.close()
    },
  })
  return new Response(stream, {
    status: init.status ?? 200,
    headers: init.headers,
  })
}

describe("readBodyWithLimit", () => {
  test("returns the full buffer under the limit", async () => {
    const chunk = new TextEncoder().encode("hello")
    const result = await readBodyWithLimit(
      streamResponse([chunk]),
      1000,
      (limit) => new Error(`exceeded ${limit}`),
    )
    expect(result.byteLength).toBe(chunk.byteLength)
  })

  test("invokes onLimitExceeded once the running total crosses maxBytes", async () => {
    const chunk = new Uint8Array(20)
    await expect(
      readBodyWithLimit(
        streamResponse([chunk]),
        10,
        (limit) => new Error(`exceeded ${limit}`),
      ),
    ).rejects.toThrow("exceeded 10")
  })

  test("falls back to arrayBuffer when the response has no body stream", async () => {
    const response = new Response(null, { status: 204 })
    const result = await readBodyWithLimit(
      response,
      10,
      (limit) => new Error(`exceeded ${limit}`),
    )
    expect(result.byteLength).toBe(0)
  })
})

describe("fetchFollowingSafeRedirects", () => {
  const errors = {
    tooManyRedirects: () => new Error("too many redirects"),
    noLocationHeader: () => new Error("no location"),
    invalidRedirectLocation: () => new Error("invalid location"),
  }

  test("re-validates on every hop and returns the final response", async () => {
    const validateUrl = vi.fn(async () => undefined)
    let call = 0
    const fetchImpl = vi.fn(() => {
      call += 1
      if (call === 1) {
        return Promise.resolve(Response.redirect("https://example.com/b", 302))
      }
      return Promise.resolve(new Response("ok", { status: 200 }))
    })

    const result = await fetchFollowingSafeRedirects({
      errors,
      fetchImpl,
      url: "https://example.com/a",
      validateUrl,
    })

    expect(result.finalUrl).toBe("https://example.com/b")
    expect(validateUrl).toHaveBeenCalledTimes(2)
    expect(validateUrl).toHaveBeenNthCalledWith(1, "https://example.com/a")
    expect(validateUrl).toHaveBeenNthCalledWith(2, "https://example.com/b")
  })

  test("throws tooManyRedirects past the configured hop limit", async () => {
    const validateUrl = vi.fn(async () => undefined)
    const fetchImpl = vi.fn(() =>
      Promise.resolve(Response.redirect("https://example.com/next", 302)),
    )

    await expect(
      fetchFollowingSafeRedirects({
        errors,
        fetchImpl,
        maxRedirectHops: 2,
        url: "https://example.com/a",
        validateUrl,
      }),
    ).rejects.toThrow("too many redirects")
  })

  test("throws noLocationHeader when a redirect carries no Location", async () => {
    const validateUrl = vi.fn(async () => undefined)
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response(null, { status: 302 })),
    )

    await expect(
      fetchFollowingSafeRedirects({
        errors,
        fetchImpl,
        url: "https://example.com/a",
        validateUrl,
      }),
    ).rejects.toThrow("no location")
  })

  test("propagates a validateUrl rejection without fetching", async () => {
    const validateUrl = vi.fn(() => Promise.reject(new Error("blocked")))
    const fetchImpl = vi.fn()

    await expect(
      fetchFollowingSafeRedirects({
        errors,
        fetchImpl,
        url: "https://example.com/a",
        validateUrl,
      }),
    ).rejects.toThrow("blocked")
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
