import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const store = new Map<string, unknown>()
const mockPut = vi.fn((key: string, value: unknown) => {
  store.set(key, value)
  return Promise.resolve()
})
const mockGet = vi.fn((key: string) => Promise.resolve(store.get(key) ?? null))
const REHOSTED_PATH_RE = /^public\/ws\/ws_1\/2026\/11\/05\/outbound-media\//
const mockUploadFileFromUrl = vi.fn()
const mockAssertPublicUrl = vi.fn(async () => undefined)

vi.mock("@chatbotx.io/redis", () => ({
  distributedStore: { get: mockGet, put: mockPut },
}))

vi.mock("@chatbotx.io/filesystem", async () => {
  const { normalizeMimeType } = await import(
    "../../filesystem/src/lib/mime-type"
  )
  const { fetchFollowingSafeRedirects } = await import(
    "../../filesystem/src/lib/bounded-fetch"
  )
  class UploadValidationError extends Error {}
  return {
    fetchFollowingSafeRedirects,
    normalizeMimeType,
    UploadValidationError,
    uploadFileFromUrl: mockUploadFileFromUrl,
  }
})

vi.mock("../src/net/ssrf-guard", () => ({
  assertPublicUrl: mockAssertPublicUrl,
}))

vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}))

const { resolveOutboundMediaUrl } = await import(
  "../src/outbound-media/service"
)

const STORAGE_URL = "https://cdn.chatbotx.test/bucket"
const IMAGE_RULES = {
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  maxBytes: 5 * 1024 * 1024,
}
const baseInput = {
  ...IMAGE_RULES,
  storagePrefix: "public/ws/ws_1/2026/11/05",
  storageUrl: STORAGE_URL,
}

const headResponse = (contentType: string | null, status = 200) =>
  new Response(null, {
    status,
    headers: contentType ? { "content-type": contentType } : {},
  })

const originalFetch = globalThis.fetch
const mockFetch = vi.fn<typeof fetch>()

beforeEach(() => {
  store.clear()
  vi.clearAllMocks()
  globalThis.fetch = mockFetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe("resolveOutboundMediaUrl", () => {
  test("returns a link on our own storage unchanged without probing", async () => {
    const url = `${STORAGE_URL}/public/ws/ws_1/photo`

    await expect(resolveOutboundMediaUrl({ ...baseInput, url })).resolves.toBe(
      url,
    )
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test("probes a sibling path that only shares the storage URL as a prefix", async () => {
    mockFetch.mockResolvedValue(headResponse("image/png"))
    const url = `${STORAGE_URL}-public/a.jpg`

    await expect(resolveOutboundMediaUrl({ ...baseInput, url })).resolves.toBe(
      url,
    )
    expect(mockFetch).toHaveBeenCalledWith(
      url,
      expect.objectContaining({ method: "HEAD" }),
    )
  })

  test("returns a non-http value (e.g. an unresolved variable) unchanged", async () => {
    await expect(
      resolveOutboundMediaUrl({ ...baseInput, url: "{{image}}" }),
    ).resolves.toBe("{{image}}")
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test("keeps an external link whose host serves an accepted type", async () => {
    mockFetch.mockResolvedValue(headResponse("image/png"))
    const url = "https://images.example.com/a.png"

    await expect(resolveOutboundMediaUrl({ ...baseInput, url })).resolves.toBe(
      url,
    )
    expect(mockFetch).toHaveBeenCalledWith(
      url,
      expect.objectContaining({ method: "HEAD", redirect: "manual" }),
    )
    expect(mockUploadFileFromUrl).not.toHaveBeenCalled()
  })

  test("re-hosts an external link served as image/jpg and returns the copy", async () => {
    mockFetch.mockResolvedValue(headResponse("image/jpg"))
    mockUploadFileFromUrl.mockResolvedValue({ mimeType: "image/jpeg" })
    const url = "https://images.example.com/a.jpg"

    const resolved = await resolveOutboundMediaUrl({ ...baseInput, url })

    expect(resolved).toMatch(
      new RegExp(
        `^${STORAGE_URL}/public/ws/ws_1/2026/11/05/outbound-media/[0-9a-f]{64}$`,
      ),
    )
    expect(mockUploadFileFromUrl).toHaveBeenCalledWith(
      url,
      expect.stringMatching(REHOSTED_PATH_RE),
      "public-read",
      IMAGE_RULES.maxBytes,
      expect.any(Function),
      expect.any(AbortSignal),
    )
  })

  test("re-hosts when the host does not answer HEAD", async () => {
    mockFetch.mockResolvedValue(headResponse(null, 405))
    mockUploadFileFromUrl.mockResolvedValue({ mimeType: "image/png" })

    const resolved = await resolveOutboundMediaUrl({
      ...baseInput,
      url: "https://images.example.com/no-head",
    })

    expect(resolved.startsWith(STORAGE_URL)).toBe(true)
  })

  test("keeps the original link when the downloaded file is still not an accepted type", async () => {
    mockFetch.mockResolvedValue(headResponse("text/html"))
    mockUploadFileFromUrl.mockResolvedValue({ mimeType: "text/html" })
    const url = "https://images.example.com/not-an-image"

    await expect(resolveOutboundMediaUrl({ ...baseInput, url })).resolves.toBe(
      url,
    )
  })

  test("falls back to the original link when the probe fails", async () => {
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"))
    const url = "https://down.example.com/a.jpg"

    await expect(resolveOutboundMediaUrl({ ...baseInput, url })).resolves.toBe(
      url,
    )
    expect(mockPut).toHaveBeenCalledWith(expect.any(String), { url }, 300)
  })

  test("never fetches a URL the SSRF guard rejects", async () => {
    mockAssertPublicUrl.mockRejectedValueOnce(new Error("[ssrf-guard] blocked"))
    const url = "https://internal.example.com/a.jpg"

    await expect(resolveOutboundMediaUrl({ ...baseInput, url })).resolves.toBe(
      url,
    )
    expect(mockFetch).not.toHaveBeenCalled()
    expect(mockUploadFileFromUrl).not.toHaveBeenCalled()
  })

  test("caches the result so repeated sends probe the host once", async () => {
    mockFetch.mockResolvedValue(headResponse("image/jpg"))
    mockUploadFileFromUrl.mockResolvedValue({ mimeType: "image/jpeg" })
    const url = "https://images.example.com/broadcast.jpg"

    const first = await resolveOutboundMediaUrl({ ...baseInput, url })
    const second = await resolveOutboundMediaUrl({ ...baseInput, url })

    expect(second).toBe(first)
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockUploadFileFromUrl).toHaveBeenCalledTimes(1)
  })

  test("downloads once for concurrent sends of the same link", async () => {
    mockFetch.mockResolvedValue(headResponse("image/jpg"))
    mockUploadFileFromUrl.mockResolvedValue({ mimeType: "image/jpeg" })
    const url = "https://images.example.com/concurrent.jpg"

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        resolveOutboundMediaUrl({ ...baseInput, url }),
      ),
    )

    expect(new Set(results).size).toBe(1)
    expect(mockUploadFileFromUrl).toHaveBeenCalledTimes(1)
  })
})
