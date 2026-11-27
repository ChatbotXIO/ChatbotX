// @vitest-environment node
import {
  type EmbeddedVideo,
  toEmbeddedVideoView,
} from "@chatbotx.io/utils/embedded-video"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ warn: vi.fn() }))
vi.mock("../src/logger", () => ({ logger: { warn: mocks.warn } }))

const { embeddedVideoService } = await import("../src/embedded-video/service")

const VIMEO = "https://vimeo.com/76979871"
const STREAMABLE = "https://streamable.com/hn8hq"
const mockFetch = vi.fn<typeof fetch>()

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status })

const streamOf = (chunks: Uint8Array[], onCancel = vi.fn()) =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk)
        }
        controller.close()
      },
      cancel: onCancel,
    }),
  )

const resolvedRatio = async (
  source: string,
  current: EmbeddedVideo | null = null,
) => {
  const result = await embeddedVideoService.resolve(source, current)
  if (!result.ok) {
    throw new Error(`unexpected failure ${result.reason}`)
  }
  return result.video.aspectRatio
}

describe("embeddedVideoService.resolve", () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mocks.warn.mockReset()
    vi.stubGlobal("fetch", mockFetch)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test("returns the parse failure without touching the network", async () => {
    expect(
      await embeddedVideoService.resolve("https://evil.example/x", null),
    ).toEqual({ ok: false, reason: "unsupportedProvider" })
    expect(await embeddedVideoService.resolve("javascript:1", null)).toEqual({
      ok: false,
      reason: "invalidUrl",
    })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test("reads the ratio from Vimeo oEmbed with the canonical url and safe options", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ width: 480, height: 270 }))

    expect(await resolvedRatio(VIMEO)).toBeCloseTo(480 / 270)

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, init] = mockFetch.mock.calls[0] ?? []
    expect(String(url)).toBe(
      `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(VIMEO)}`,
    )
    expect(init?.redirect).toBe("error")
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  test("a portrait Vimeo video gets a portrait ratio", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ width: 240, height: 426 }))
    expect(await resolvedRatio("https://vimeo.com/750414770")).toBeLessThan(1)
  })

  test("Streamable is asked with the canonical url even for an embed link", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ width: 960, height: 540 }))

    expect(await resolvedRatio("https://streamable.com/e/hn8hq")).toBeCloseTo(
      16 / 9,
    )

    expect(String(mockFetch.mock.calls[0]?.[0])).toBe(
      `https://api.streamable.com/oembed.json?url=${encodeURIComponent(STREAMABLE)}`,
    )
  })

  test("a failed lookup leaves the ratio null, warns and never throws", async () => {
    const onCancel404 = vi.fn()
    const failures: Array<() => Promise<Response>> = [
      () => Promise.reject(new DOMException("timed out", "TimeoutError")),
      () => Promise.reject(new TypeError("redirect mode is error")),
      () => {
        const response = streamOf(
          [new TextEncoder().encode("nope")],
          onCancel404,
        )
        return Promise.resolve(new Response(response.body, { status: 404 }))
      },
      () => Promise.resolve(new Response("<html>", { status: 200 })),
      () => Promise.resolve(jsonResponse({ width: 0, height: 10 })),
      () => Promise.resolve(jsonResponse({ width: "a", height: 10 })),
      () => Promise.resolve(new Response(null, { status: 200 })),
    ]
    for (const failure of failures) {
      mockFetch.mockReset()
      mocks.warn.mockReset()
      mockFetch.mockImplementation(failure)

      expect(await resolvedRatio(VIMEO)).toBeNull()
      expect(mocks.warn).toHaveBeenCalledTimes(1)
      const logged = mocks.warn.mock.calls[0]?.[0]
      expect(logged).toMatchObject({ provider: "vimeo" })
      expect(logged.err).toBeDefined()
      expect(logged.err).toBeInstanceOf(Error)
    }
    expect(onCancel404).toHaveBeenCalledTimes(1)
  })

  test("a body over 64 KB is cancelled and discarded", async () => {
    const onCancel = vi.fn()
    const chunk = new Uint8Array(40 * 1024).fill(32)
    mockFetch.mockResolvedValue(streamOf([chunk, chunk, chunk], onCancel))

    expect(await resolvedRatio(VIMEO)).toBeNull()

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(mocks.warn).toHaveBeenCalledTimes(1)
  })

  test("a body split across chunks (even mid multi-byte char) still parses", async () => {
    const bytes = new TextEncoder().encode(
      JSON.stringify({ title: "é video", width: 100, height: 100 }),
    )
    mockFetch.mockResolvedValue(
      streamOf([bytes.slice(0, 11), bytes.slice(11, 12), bytes.slice(12)]),
    )
    expect(await resolvedRatio(VIMEO)).toBe(1)
  })

  test("an absurd oEmbed ratio is clamped", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ width: 10_000, height: 10 }))
    expect(await resolvedRatio(VIMEO)).toBe(4)
    mockFetch.mockResolvedValue(jsonResponse({ width: 10, height: 10_000 }))
    expect(await resolvedRatio(VIMEO)).toBe(0.25)
  })

  test("the same video with a stored ratio keeps it and makes no request", async () => {
    const current: EmbeddedVideo = {
      provider: "vimeo",
      videoId: "76979871",
      aspectRatio: 0.5,
    }
    expect(await resolvedRatio(VIMEO, current)).toBe(0.5)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test("a hint from the embed code beats the stored ratio of the same video", async () => {
    const current: EmbeddedVideo = {
      provider: "vimeo",
      videoId: "1085116418",
      privacyHash: "ad0e59b079",
      aspectRatio: 0.5,
    }
    const embed =
      '<iframe src="https://player.vimeo.com/video/1085116418?h=ad0e59b079" width="320" height="240"></iframe>'
    expect(await resolvedRatio(embed, current)).toBeCloseTo(320 / 240)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test("the same video whose stored ratio is null is looked up again", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ width: 100, height: 50 }))
    const current: EmbeddedVideo = {
      provider: "vimeo",
      videoId: "76979871",
      aspectRatio: null,
    }
    expect(await resolvedRatio(VIMEO, current)).toBe(2)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  test("a different video does not inherit the stored ratio", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ width: 100, height: 100 }))
    const current: EmbeddedVideo = {
      provider: "vimeo",
      videoId: "111",
      aspectRatio: 0.5,
    }
    expect(await resolvedRatio(VIMEO, current)).toBe(1)
  })

  test("embed code width/height beats the oEmbed lookup", async () => {
    const embed =
      '<iframe src="https://player.vimeo.com/video/1085116418?h=ad0e59b079" width="320" height="240"></iframe>'
    expect(await resolvedRatio(embed)).toBeCloseTo(320 / 240)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test("a Shorts link hint beats any lookup and needs no network", async () => {
    expect(
      await resolvedRatio("https://www.youtube.com/shorts/2CkofPRY3V4"),
    ).toBeLessThan(1)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test("a stored non-9:16 portrait YouTube ratio survives its own view source", async () => {
    const stored = {
      provider: "youtube",
      videoId: "2CkofPRY3V4",
      aspectRatio: 0.75,
    } satisfies EmbeddedVideo
    const { source } = toEmbeddedVideoView(stored)
    expect(await resolvedRatio(source, stored)).toBe(0.75)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test("a stored 9/16 YouTube ratio survives its own /shorts/ source", async () => {
    const stored = {
      provider: "youtube",
      videoId: "2CkofPRY3V4",
      aspectRatio: 9 / 16,
    } satisfies EmbeddedVideo
    const { source } = toEmbeddedVideoView(stored)
    expect(source).toContain("/shorts/")
    expect(await resolvedRatio(source, stored)).toBe(9 / 16)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test("YouTube and Cloudinary never fetch and stay null without a hint", async () => {
    expect(await resolvedRatio("https://youtu.be/dQw4w9WgXcQ")).toBeNull()
    expect(
      await resolvedRatio(
        "https://res.cloudinary.com/demo/video/upload/dog.mp4",
      ),
    ).toBeNull()
    expect(
      await resolvedRatio(
        "https://player.cloudinary.com/embed/?cloud_name=demo&public_id=elephants",
      ),
    ).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
