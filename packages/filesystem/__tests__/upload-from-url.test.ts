import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mockPutObject = vi.fn(async () => undefined)

vi.mock("../src/lib/uploader", () => ({
  uploader: { putObject: mockPutObject },
}))

vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}))

const { uploadFileFromUrl, UploadValidationError } = await import(
  "../src/lib/upload"
)

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

const originalFetch = globalThis.fetch

beforeEach(() => {
  mockPutObject.mockClear()
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe("uploadFileFromUrl byte cap and redirect handling", () => {
  test("throws when the body exceeds maxBytes even though content-length lies small", async () => {
    const bigChunk = new Uint8Array(20)
    globalThis.fetch = vi.fn(async () =>
      streamResponse([bigChunk], {
        headers: { "content-length": "1", "content-type": "text/plain" },
      }),
    ) as unknown as typeof fetch

    await expect(
      uploadFileFromUrl(
        "https://example.com/file.txt",
        "path/to/file",
        "private",
        10,
      ),
    ).rejects.toThrow(UploadValidationError)
  })

  test("records the real streamed byte count as size on the success path", async () => {
    const chunk = new TextEncoder().encode("hello world")
    globalThis.fetch = vi.fn(async () =>
      streamResponse([chunk], {
        headers: {
          "content-length": "1",
          "content-type": "text/plain",
        },
      }),
    ) as unknown as typeof fetch

    const result = await uploadFileFromUrl(
      "https://example.com/file.txt",
      "path/to/file",
      "private",
      1000,
    )

    expect(result.size).toBe(chunk.byteLength)
    expect(mockPutObject).toHaveBeenCalledWith(
      "path/to/file",
      expect.anything(),
      expect.objectContaining({ ContentLength: chunk.byteLength }),
    )
  })

  test("re-invokes validateUrl on each redirect hop, including the final one", async () => {
    const validateUrl = vi.fn(async () => undefined)
    const hop1 = "https://example.com/hop1"
    const hop2 = "https://example.com/hop2"
    const final = "https://example.com/final"

    let call = 0
    globalThis.fetch = vi.fn(() => {
      call += 1
      if (call === 1) {
        return Promise.resolve(
          new Response(null, { status: 302, headers: { location: hop2 } }),
        )
      }
      if (call === 2) {
        return Promise.resolve(
          new Response(null, { status: 302, headers: { location: final } }),
        )
      }
      return Promise.resolve(
        streamResponse([new TextEncoder().encode("ok")], {
          headers: { "content-type": "text/plain" },
        }),
      )
    }) as unknown as typeof fetch

    await uploadFileFromUrl(hop1, "path/to/file", "private", 1000, validateUrl)

    expect(validateUrl).toHaveBeenCalledTimes(3)
    expect(validateUrl).toHaveBeenNthCalledWith(1, hop1)
    expect(validateUrl).toHaveBeenNthCalledWith(2, hop2)
    expect(validateUrl).toHaveBeenNthCalledWith(3, final)
  })

  test("throws 'Too many redirects' past hop 6", async () => {
    const validateUrl = vi.fn(async () => undefined)
    let call = 0
    globalThis.fetch = vi.fn(() => {
      call += 1
      return Promise.resolve(
        new Response(null, {
          status: 302,
          headers: { location: `https://example.com/hop${call}` },
        }),
      )
    }) as unknown as typeof fetch

    await expect(
      uploadFileFromUrl(
        "https://example.com/hop0",
        "path/to/file",
        "private",
        1000,
        validateUrl,
      ),
    ).rejects.toThrow("Too many redirects")
  })

  test("throws when a redirect response has no Location header", async () => {
    const validateUrl = vi.fn(async () => undefined)
    globalThis.fetch = vi.fn(
      async () => new Response(null, { status: 302 }),
    ) as unknown as typeof fetch

    await expect(
      uploadFileFromUrl(
        "https://example.com/file",
        "path/to/file",
        "private",
        1000,
        validateUrl,
      ),
    ).rejects.toThrow("Redirect response has no Location header")
  })
})
