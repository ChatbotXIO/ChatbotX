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
      undefined,
    )
  })

  test("stores and returns image/jpeg when the host serves the non-standard image/jpg", async () => {
    // 1x1 baseline JPEG, so the dimension probe succeeds and keeps the type.
    const jpeg = Uint8Array.from(
      Buffer.from(
        "/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKpAB//Z",
        "base64",
      ),
    )
    globalThis.fetch = vi.fn(async () =>
      streamResponse([jpeg], {
        headers: { "content-type": "image/jpg; charset=binary" },
      }),
    ) as unknown as typeof fetch

    const result = await uploadFileFromUrl(
      "https://example.com/photo.jpg",
      "path/to/photo",
    )

    expect(result.mimeType).toBe("image/jpeg")
    expect(result.fileType).toBe("image")
    expect(mockPutObject).toHaveBeenCalledWith(
      "path/to/photo",
      expect.anything(),
      expect.objectContaining({ ContentType: "image/jpeg" }),
      undefined,
    )
  })

  test("forwards the abort signal to both the download and the upload", async () => {
    const chunk = new TextEncoder().encode("hi")
    const fetchMock = vi.fn(async () =>
      streamResponse([chunk], {
        headers: { "content-length": "1", "content-type": "text/plain" },
      }),
    )
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const controller = new AbortController()

    await uploadFileFromUrl(
      "https://example.com/file.txt",
      "path/to/file",
      "private",
      1000,
      undefined,
      controller.signal,
    )

    // The deadline must bound both halves: the download fetch and the S3 put.
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/file.txt",
      expect.objectContaining({ signal: controller.signal }),
    )
    expect(mockPutObject).toHaveBeenCalledWith(
      "path/to/file",
      expect.anything(),
      expect.anything(),
      controller.signal,
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

  test("never echoes an invalid Location header into the message", async () => {
    const validateUrl = vi.fn(async () => undefined)
    globalThis.fetch = vi.fn(
      async () =>
        // biome-ignore lint/suspicious/useStaticResponseMethods: Response.redirect() rejects the malformed Location this test needs
        new Response(null, {
          status: 302,
          headers: { location: "https://[secret-token" },
        }),
    ) as unknown as typeof fetch

    const error = await uploadFileFromUrl(
      "https://example.com/file",
      "path/to/file",
      "private",
      1000,
      validateUrl,
    ).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(UploadValidationError)
    expect((error as Error).message).toBe(
      "Redirect response has an invalid Location header",
    )
    expect((error as InstanceType<typeof UploadValidationError>).reason).toBe(
      "invalidRedirect",
    )
  })
})

describe("uploadFileFromUrl error reasons", () => {
  test.each([
    [
      "an HTTP error",
      () => new Response("nope", { status: 404 }),
      "downloadFailed",
    ],
    [
      "an oversized content-length",
      () =>
        streamResponse([new Uint8Array(1)], {
          headers: { "content-length": "5000" },
        }),
      "fileTooLarge",
    ],
    [
      "a missing Location",
      () => new Response(null, { status: 302 }),
      "invalidRedirect",
    ],
  ])("tags %s", async (_label, respond, reason) => {
    globalThis.fetch = vi.fn(async () => respond()) as unknown as typeof fetch

    await expect(
      uploadFileFromUrl(
        "https://example.com/file",
        "path/to/file",
        "private",
        1000,
        vi.fn(async () => undefined),
      ),
    ).rejects.toMatchObject({ reason })
  })

  test("tags too many redirects", async () => {
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
        vi.fn(async () => undefined),
      ),
    ).rejects.toMatchObject({ reason: "tooManyRedirects" })
  })
})

describe("uploadFileFromUrl validateResponse", () => {
  test.each([
    ["with validateUrl", vi.fn(async () => undefined)],
    ["without validateUrl", undefined],
  ])("sees the final response before the body is read (%s)", async (_label, validateUrl) => {
    let call = 0
    globalThis.fetch = vi.fn(() => {
      call += 1
      if (validateUrl && call === 1) {
        return Promise.resolve(
          Response.redirect("https://cdn.example.com/final.bin", 302),
        )
      }
      return Promise.resolve(
        streamResponse([new TextEncoder().encode("%PDF")], {
          headers: {
            "content-type": "application/octet-stream",
            "content-length": "4",
            "content-disposition": 'attachment; filename="a.pdf"',
          },
        }),
      )
    }) as unknown as typeof fetch
    const validateResponse = vi.fn(async () => ({
      mimeType: "application/pdf",
      name: "a.pdf",
    }))

    const result = await uploadFileFromUrl(
      "https://example.com/start",
      "path/to/file",
      "private",
      1000,
      validateUrl,
      undefined,
      validateResponse,
    )

    expect(validateResponse).toHaveBeenCalledWith({
      finalUrl: validateUrl
        ? "https://cdn.example.com/final.bin"
        : "https://example.com/start",
      mimeType: "application/octet-stream",
      contentDisposition: 'attachment; filename="a.pdf"',
      contentLength: 4,
    })
    expect(result).toEqual(
      expect.objectContaining({ name: "a.pdf", mimeType: "application/pdf" }),
    )
    expect(mockPutObject).toHaveBeenCalledWith(
      "path/to/file",
      expect.anything(),
      expect.objectContaining({ ContentType: "application/pdf" }),
      undefined,
    )
  })

  test("a rejection stores nothing and leaves the body unread", async () => {
    const response = streamResponse([new TextEncoder().encode("<html>")], {
      headers: { "content-type": "text/html" },
    })
    globalThis.fetch = vi.fn(async () => response) as unknown as typeof fetch

    await expect(
      uploadFileFromUrl(
        "https://example.com/start",
        "path/to/file",
        "private",
        1000,
        undefined,
        undefined,
        () => {
          throw new UploadValidationError("nope", "unsupportedFileType")
        },
      ),
    ).rejects.toMatchObject({ reason: "unsupportedFileType" })

    expect(response.bodyUsed).toBe(false)
    expect(mockPutObject).not.toHaveBeenCalled()
  })
})
