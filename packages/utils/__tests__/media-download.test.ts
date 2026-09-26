import { afterEach, describe, expect, test, vi } from "vitest"
import {
  fetchMediaWithLimits,
  MediaEmptyBodyError,
  MediaTooLargeError,
  readBodyWithCap,
} from "../src/media-download"

const DECLARED_SIZE_ERROR = /^Media exceeds size limit/
const BODY_SIZE_ERROR = /body exceeds size limit/

type ReaderScript = Uint8Array[]

/**
 * Build a `Response`-shaped stub whose body streams the given chunks through a
 * `getReader()` interface, mirroring how `fetchMediaWithLimits` consumes it.
 * `cancel` is a spy so tests can assert the stream was aborted at the cap.
 */
const buildResponse = (
  chunks: ReaderScript | null,
  init: { ok?: boolean; headers?: Record<string, string> } = {},
): { response: Response; cancel: ReturnType<typeof vi.fn> } => {
  const headers = new Headers(init.headers)
  const cancel = vi.fn(() => Promise.resolve())
  let index = 0
  const body = chunks
    ? {
        getReader: () => ({
          read: () => {
            if (index >= chunks.length) {
              return Promise.resolve({ done: true, value: undefined })
            }
            const value = chunks[index]
            index += 1
            return Promise.resolve({ done: false, value })
          },
          cancel,
        }),
        cancel,
      }
    : null
  const response = {
    ok: init.ok ?? true,
    body,
    headers,
  } as unknown as Response
  return { response, cancel }
}

const stubFetch = (response: Response) => {
  const fetchMock = vi.fn().mockResolvedValue(response)
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("readBodyWithCap", () => {
  test("streams chunks into a single ArrayBuffer", async () => {
    const { response } = buildResponse([
      new Uint8Array([1, 2]),
      new Uint8Array([3, 4]),
    ])

    const bytes = await readBodyWithCap(response, { maxBytes: 100, label: "x" })

    expect(new Uint8Array(bytes)).toEqual(new Uint8Array([1, 2, 3, 4]))
  })

  test("rejects up front and releases the body when declared content-length exceeds the cap", async () => {
    const read = vi.fn()
    const { response, cancel } = buildResponse([new Uint8Array([1])], {
      headers: { "content-length": "50" },
    })
    // Replace the reader with a spy to prove the body is never read.
    ;(response.body as unknown as { getReader: () => unknown }).getReader =
      () => ({ read, cancel: vi.fn() })

    await expect(
      readBodyWithCap(response, { maxBytes: 8, label: "Media" }),
    ).rejects.toBeInstanceOf(MediaTooLargeError)
    expect(read).not.toHaveBeenCalled()
    // The connection is released rather than left open until timeout.
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  test("throws MediaTooLargeError even when the reader cancel rejects", async () => {
    const headers = new Headers()
    let done = false
    const response = {
      ok: true,
      headers,
      body: {
        getReader: () => ({
          read: () => {
            if (done) {
              return Promise.resolve({ done: true, value: undefined })
            }
            done = true
            return Promise.resolve({ done: false, value: new Uint8Array(20) })
          },
          // A cancellation failure must not escape in place of the size error.
          cancel: () => Promise.reject(new Error("socket already destroyed")),
        }),
      },
    } as unknown as Response

    await expect(
      readBodyWithCap(response, { maxBytes: 8, label: "Media" }),
    ).rejects.toBeInstanceOf(MediaTooLargeError)
  })

  test("aborts a streamed body without content-length when it crosses the cap", async () => {
    const { response, cancel } = buildResponse([
      new Uint8Array(6),
      new Uint8Array(6),
    ])

    await expect(
      readBodyWithCap(response, { maxBytes: 8, label: "Media" }),
    ).rejects.toThrow(BODY_SIZE_ERROR)
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  test("throws MediaEmptyBodyError when there is no body", async () => {
    const { response } = buildResponse(null)

    await expect(
      readBodyWithCap(response, { maxBytes: 8, label: "Media" }),
    ).rejects.toBeInstanceOf(MediaEmptyBodyError)
  })

  test("ignores a NaN content-length and streams the body", async () => {
    const { response } = buildResponse([new Uint8Array([9])], {
      headers: { "content-length": "not-a-number" },
    })

    const bytes = await readBodyWithCap(response, { maxBytes: 8, label: "x" })

    expect(new Uint8Array(bytes)).toEqual(new Uint8Array([9]))
  })
})

describe("fetchMediaWithLimits", () => {
  test("returns bytes and content-type for a successful response", async () => {
    stubFetch(
      buildResponse([new Uint8Array([1, 2, 3, 4])], {
        headers: { "content-type": "image/jpeg", "content-length": "4" },
      }).response,
    )

    const result = await fetchMediaWithLimits("https://cdn.example/pic.jpg")

    expect(result?.mimeType).toBe("image/jpeg")
    expect(new Uint8Array(result?.bytes ?? new ArrayBuffer(0))).toEqual(
      new Uint8Array([1, 2, 3, 4]),
    )
  })

  test("falls back to the default mime type when content-type is absent", async () => {
    stubFetch(buildResponse([new Uint8Array([1, 2])]).response)

    const result = await fetchMediaWithLimits("https://cdn.example/pic")

    expect(result?.mimeType).toBe("image/png")
  })

  test("honours a custom fallback mime type", async () => {
    stubFetch(buildResponse([new Uint8Array([1, 2])]).response)

    const result = await fetchMediaWithLimits("https://cdn.example/pic", {
      fallbackMimeType: "image/webp",
    })

    expect(result?.mimeType).toBe("image/webp")
  })

  test("returns null and cancels the body on a non-2xx response", async () => {
    const { response, cancel } = buildResponse([new Uint8Array([1])], {
      ok: false,
    })
    stubFetch(response)

    expect(await fetchMediaWithLimits("https://cdn.example/pic")).toBeNull()
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  test("returns null when the response has no body", async () => {
    stubFetch(buildResponse(null).response)

    expect(await fetchMediaWithLimits("https://cdn.example/pic")).toBeNull()
  })

  test("throws when the declared content-length exceeds the cap", async () => {
    stubFetch(
      buildResponse([new Uint8Array([1, 2])], {
        headers: { "content-length": String(20) },
      }).response,
    )

    await expect(
      fetchMediaWithLimits("https://cdn.example/pic", { maxBytes: 8 }),
    ).rejects.toThrow(DECLARED_SIZE_ERROR)
  })

  test("throws when the streamed body exceeds the cap without a declared length", async () => {
    stubFetch(buildResponse([new Uint8Array(6), new Uint8Array(6)]).response)

    await expect(
      fetchMediaWithLimits("https://cdn.example/pic", { maxBytes: 8 }),
    ).rejects.toThrow(BODY_SIZE_ERROR)
  })

  test("forwards headers and an abort signal to fetch", async () => {
    const fetchMock = stubFetch(buildResponse([new Uint8Array([1])]).response)

    await fetchMediaWithLimits("https://cdn.example/pic", {
      headers: { Authorization: "Bearer token" },
    })

    expect(fetchMock).toHaveBeenCalledWith(
      "https://cdn.example/pic",
      expect.objectContaining({
        headers: { Authorization: "Bearer token" },
        signal: expect.any(AbortSignal),
      }),
    )
  })
})
