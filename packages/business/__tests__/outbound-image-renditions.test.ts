import { randomBytes } from "node:crypto"
import { Readable } from "node:stream"
import sharp from "sharp"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const TIMEOUT_MS = 60_000
const store = new Map<string, unknown>()
const mockGet = vi.fn((key: string) => Promise.resolve(store.get(key) ?? null))
const mockPut = vi.fn((key: string, value: unknown) => {
  store.set(key, value)
  return Promise.resolve()
})

vi.mock("@chatbotx.io/redis", () => ({
  distributedStore: { get: mockGet, put: mockPut },
}))
vi.mock("../src/net/ssrf-guard", () => ({
  assertPublicUrl: vi.fn(async () => undefined),
}))
vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}))
vi.mock("@chatbotx.io/filesystem", async () => {
  const { fetchFollowingSafeRedirects, readBodyWithLimit } = await import(
    "../../filesystem/src/lib/bounded-fetch"
  )
  return { fetchFollowingSafeRedirects, readBodyWithLimit }
})

const {
  OutboundMediaError,
  publicStorageKeyFor,
  resolveOutboundImageRenditions,
  resolveVideoPreviewPlaceholderUrl,
} = await import("../src/outbound-media/image-renditions")

const SIZE = 2000
const ORIGINAL_KEY_RE =
  /^public\/ws\/1\/outbound-media\/images\/.+-original\.jpg$/
const ORIGINAL_URL_RE = /^https:\/\/cdn\.test\/bucket\/.+-original\.jpg$/
const PREVIEW_SUFFIX_RE = /-preview\.jpg$/
const STORAGE_URL = "https://cdn.test/bucket"
const URL_ = "https://img.example.com/big.png"
const noisy = (format: "png" | "jpeg") => {
  const image = sharp(randomBytes(SIZE * SIZE * 3), {
    raw: { width: SIZE, height: SIZE, channels: 3 },
  })
  // PNG takes no `quality`: passing one turns on palette quantization.
  return (
    format === "png" ? image.png() : image.jpeg({ quality: 100 })
  ).toBuffer()
}

const put = vi.fn(async () => ({}))
const input = (url = URL_) => ({
  url,
  originalMaxBytes: 10_000_000,
  previewMaxBytes: 1_000_000,
  storagePrefix: "public/ws/1",
  storageUrl: STORAGE_URL,
  uploader: { putObject: put },
})

const mockFetch = vi.fn<typeof fetch>()
const originalFetch = globalThis.fetch
beforeEach(() => {
  store.clear()
  put.mockClear()
  mockFetch.mockReset()
  globalThis.fetch = mockFetch as typeof fetch
})
afterEach(() => {
  globalThis.fetch = originalFetch
})

const respond = (body: Buffer, status = 200) =>
  new Response(new Uint8Array(body), { status })

describe("resolveOutboundImageRenditions", { timeout: TIMEOUT_MS }, () => {
  test("an 11 MB PNG gets a JPEG original under 10 MB and a preview under 1 MB, both stored", async () => {
    const png = await noisy("png")
    expect(png.length).toBeGreaterThan(10_000_000)
    mockFetch.mockResolvedValue(respond(png))

    const result = await resolveOutboundImageRenditions(input())

    expect(put).toHaveBeenCalledTimes(2)
    const [original, preview] = put.mock.calls as unknown as [
      string,
      Buffer,
      { ContentType: string; ACL: string },
    ][]
    expect(original?.[0]).toMatch(ORIGINAL_KEY_RE)
    expect(original?.[1].length).toBeLessThanOrEqual(10_000_000)
    expect(original?.[2]).toMatchObject({
      ContentType: "image/jpeg",
      ACL: "public-read",
    })
    expect(preview?.[0]).toMatch(PREVIEW_SUFFIX_RE)
    expect(preview?.[1].length).toBeLessThanOrEqual(1_000_000)
    expect(result.originalUrl).toMatch(ORIGINAL_URL_RE)
    expect(result.previewUrl).toMatch(PREVIEW_SUFFIX_RE)
  })

  test("a second send of the same URL reuses the cached result without downloading or storing", async () => {
    mockFetch.mockResolvedValue(respond(await noisy("png")))
    const first = await resolveOutboundImageRenditions(input())
    mockFetch.mockClear()
    put.mockClear()

    expect(await resolveOutboundImageRenditions(input())).toEqual(first)
    expect(mockFetch).not.toHaveBeenCalled()
    expect(put).not.toHaveBeenCalled()
  })

  test("a small HTTPS JPEG is reused as original and preview", async () => {
    const small = await sharp({
      create: { width: 200, height: 200, channels: 3, background: "#336699" },
    })
      .jpeg()
      .toBuffer()
    mockFetch.mockResolvedValue(respond(small))

    expect(await resolveOutboundImageRenditions(input())).toEqual({
      originalUrl: URL_,
      previewUrl: URL_,
    })
    expect(put).not.toHaveBeenCalled()
  })

  test("a 2-10 MB JPEG keeps its original but gets a separate preview", async () => {
    const jpeg = await noisy("jpeg")
    expect(jpeg.length).toBeGreaterThan(1_000_000)
    expect(jpeg.length).toBeLessThan(10_000_000)
    mockFetch.mockResolvedValue(respond(jpeg))

    const result = await resolveOutboundImageRenditions(input())

    expect(result.originalUrl).toBe(URL_)
    expect(result.previewUrl).toMatch(PREVIEW_SUFFIX_RE)
    expect(put).toHaveBeenCalledTimes(1)
  })

  test("a non-image body fails with a non-retryable OutboundMediaError", async () => {
    mockFetch.mockResolvedValue(respond(Buffer.from("<html>nope</html>")))

    const error = await resolveOutboundImageRenditions(input()).catch((e) => e)
    expect(error).toBeInstanceOf(OutboundMediaError)
    expect(error.retryable).toBe(false)
    expect(put).not.toHaveBeenCalled()
  })

  test("a failed download is non-retryable for a 404 and retryable for a 502", async () => {
    mockFetch.mockResolvedValueOnce(respond(Buffer.from(""), 404))
    expect(
      (
        await resolveOutboundImageRenditions(
          input("https://a.test/1.png"),
        ).catch((e) => e)
      ).retryable,
    ).toBe(false)
    mockFetch.mockResolvedValueOnce(respond(Buffer.from(""), 502))
    expect(
      (
        await resolveOutboundImageRenditions(
          input("https://a.test/2.png"),
        ).catch((e) => e)
      ).retryable,
    ).toBe(true)
  })

  test("a storage failure surfaces as a retryable error instead of a URL LINE would drop", async () => {
    mockFetch.mockResolvedValue(respond(await noisy("png")))
    put.mockRejectedValueOnce(new Error("502 error code: 502"))

    const error = await resolveOutboundImageRenditions(input()).catch((e) => e)
    expect(error).toBeInstanceOf(OutboundMediaError)
    expect(error.retryable).toBe(true)
  })

  test("a body over the download cap is rejected before decoding", async () => {
    mockFetch.mockResolvedValue(
      new Response(new Uint8Array(1), {
        headers: { "content-length": String(500 * 1024 * 1024) },
      }),
    )
    const error = await resolveOutboundImageRenditions(input()).catch((e) => e)
    expect(error).toBeInstanceOf(OutboundMediaError)
    expect(error.retryable).toBe(false)
  })
})

const STORED_URL = `${STORAGE_URL}/public/space/1/conversations/c/big.png`

/** A bucket body: `getObjectStream` hands back a Node stream. */
const streamOf = (body: Buffer) => Readable.from([new Uint8Array(body)])

describe("resolveOutboundImageRenditions for a file on our storage", {
  timeout: TIMEOUT_MS,
}, () => {
  test("reads the bucket object instead of fetching the public URL", async () => {
    const png = await noisy("png")
    const getObjectStream = vi.fn(async () => ({
      stream: streamOf(png),
      contentLength: png.length,
    }))

    const result = await resolveOutboundImageRenditions({
      ...input(STORED_URL),
      uploader: { putObject: put, getObjectStream },
    })

    expect(getObjectStream).toHaveBeenCalledWith(
      "public/space/1/conversations/c/big.png",
    )
    expect(mockFetch).not.toHaveBeenCalled()
    expect(result.originalUrl).toMatch(ORIGINAL_URL_RE)
  })

  test("falls back to the public URL when the bucket read fails", async () => {
    const small = await sharp({
      create: { width: 200, height: 200, channels: 3, background: "#336699" },
    })
      .jpeg()
      .toBuffer()
    mockFetch.mockResolvedValue(respond(small))
    const getObjectStream = vi.fn(() => Promise.reject(new Error("NoSuchKey")))

    const result = await resolveOutboundImageRenditions({
      ...input(STORED_URL),
      uploader: { putObject: put, getObjectStream },
    })

    expect(getObjectStream).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ originalUrl: STORED_URL, previewUrl: STORED_URL })
  })

  test("rejects an object over the download cap without reading it", async () => {
    const getObjectStream = vi.fn(async () => ({
      stream: streamOf(Buffer.alloc(16)),
      contentLength: 500 * 1024 * 1024,
    }))

    const error = await resolveOutboundImageRenditions({
      ...input(STORED_URL),
      uploader: { putObject: put, getObjectStream },
    }).catch((e) => e)

    expect(error).toBeInstanceOf(OutboundMediaError)
    expect(error.retryable).toBe(false)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe("publicStorageKeyFor", () => {
  test.each([
    [STORED_URL, "public/space/1/conversations/c/big.png"],
    [`${STORAGE_URL}/public/a%20b.png?v=1`, "public/a b.png"],
    [`${STORAGE_URL}/private/secret.png`, null],
    [`${STORAGE_URL}/public/../private/secret.png`, null],
    [`${STORAGE_URL}/public/%2E%2E/private/secret.png`, null],
    ["https://cdn.test/bucket-other/public/x.png", null],
    ["https://img.example.com/public/x.png", null],
  ])("%s -> %s", (url, key) => {
    expect(publicStorageKeyFor(url, STORAGE_URL)).toBe(key)
  })

  test("an empty storage URL matches nothing", () => {
    expect(publicStorageKeyFor(STORED_URL, "")).toBeNull()
  })
})

describe("resolveVideoPreviewPlaceholderUrl", () => {
  test("stores one fixed-key JPEG per workspace and caches its URL", async () => {
    const args = {
      storagePrefix: "public/ws/1",
      storageUrl: STORAGE_URL,
      uploader: { putObject: put },
    }
    const url = await resolveVideoPreviewPlaceholderUrl(args)
    expect(url).toBe(
      `${STORAGE_URL}/public/ws/1/outbound-media/video-preview-v1.jpg`,
    )
    expect(put).toHaveBeenCalledTimes(1)

    expect(await resolveVideoPreviewPlaceholderUrl(args)).toBe(url)
    expect(put).toHaveBeenCalledTimes(1)
  })
})
