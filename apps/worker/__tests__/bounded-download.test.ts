import ky from "ky"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  assertPublicUrl: vi.fn(),
  kyGet: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  assertPublicUrl: mocks.assertPublicUrl,
}))

vi.mock("ky", () => ({
  default: { get: mocks.kyGet },
}))

const { downloadWithByteLimit } = await import(
  "../src/heavy/handlers/bounded-download"
)
const { ExpectedHeavyStepError } = await import("../src/heavy/handlers/errors")

function responseWithBody(props: {
  body: Uint8Array
  contentLength?: string
  contentType?: string
  status?: number
}) {
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(props.body)
        controller.close()
      },
    }),
    {
      status: props.status ?? 200,
      headers: {
        ...(props.contentLength
          ? { "content-length": props.contentLength }
          : {}),
        ...(props.contentType ? { "content-type": props.contentType } : {}),
      },
    },
  )
}

describe("downloadWithByteLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("rejects an oversized declared content length before reading", async () => {
    mocks.kyGet.mockResolvedValueOnce(
      responseWithBody({
        body: new Uint8Array([1]),
        contentLength: "11",
        contentType: "audio/mpeg",
      }),
    )

    await expect(
      downloadWithByteLimit({
        allowedMimeTypes: new Set(["audio/mpeg"]),
        label: "audio",
        maxBytes: 10,
        signal: new AbortController().signal,
        url: "https://cdn.example.com/audio.mp3",
      }),
    ).rejects.toBeInstanceOf(ExpectedHeavyStepError)
  })

  test("rejects when the streamed body exceeds the byte limit", async () => {
    mocks.kyGet.mockResolvedValueOnce(
      responseWithBody({
        body: new Uint8Array(11),
        contentType: "image/png",
      }),
    )

    await expect(
      downloadWithByteLimit({
        allowedMimeTypes: new Set(["image/png"]),
        label: "image",
        maxBytes: 10,
        signal: new AbortController().signal,
        url: "https://cdn.example.com/image.png",
      }),
    ).rejects.toBeInstanceOf(ExpectedHeavyStepError)
  })

  test("treats 4xx downloads as expected media failures", async () => {
    mocks.kyGet.mockResolvedValueOnce(
      responseWithBody({
        body: new Uint8Array([1]),
        status: 404,
      }),
    )

    await expect(
      downloadWithByteLimit({
        label: "audio",
        maxBytes: 10,
        signal: new AbortController().signal,
        url: "https://cdn.example.com/missing.mp3",
      }),
    ).rejects.toBeInstanceOf(ExpectedHeavyStepError)
  })

  test("throws transient errors for 5xx downloads", async () => {
    mocks.kyGet.mockResolvedValueOnce(
      responseWithBody({
        body: new Uint8Array([1]),
        status: 503,
      }),
    )

    await expect(
      downloadWithByteLimit({
        label: "audio",
        maxBytes: 10,
        signal: new AbortController().signal,
        url: "https://cdn.example.com/audio.mp3",
      }),
    ).rejects.not.toBeInstanceOf(ExpectedHeavyStepError)
  })

  test("returns the bounded buffer and normalized content type", async () => {
    mocks.kyGet.mockResolvedValueOnce(
      responseWithBody({
        body: new Uint8Array([1, 2, 3]),
        contentLength: "3",
        contentType: "audio/mpeg; charset=binary",
      }),
    )

    const result = await downloadWithByteLimit({
      allowedMimeTypes: new Set(["audio/mpeg"]),
      label: "audio",
      maxBytes: 10,
      signal: new AbortController().signal,
      url: "https://cdn.example.com/audio.mp3",
    })

    expect(ky.get).toHaveBeenCalledWith(
      "https://cdn.example.com/audio.mp3",
      expect.objectContaining({
        redirect: "manual",
        throwHttpErrors: false,
      }),
    )
    expect(result.buffer).toEqual(Buffer.from([1, 2, 3]))
    expect(result.contentType).toBe("audio/mpeg")
    expect(result.rawContentType).toBe("audio/mpeg; charset=binary")
  })

  test("validates every redirect target before downloading it", async () => {
    mocks.kyGet
      .mockResolvedValueOnce(
        Response.redirect("https://cdn.example.com/audio.mp3"),
      )
      .mockResolvedValueOnce(
        responseWithBody({
          body: new Uint8Array([1]),
          contentType: "audio/mpeg",
        }),
      )

    await downloadWithByteLimit({
      label: "audio",
      maxBytes: 10,
      signal: new AbortController().signal,
      url: "https://redirect.example.com/file",
    })

    expect(mocks.assertPublicUrl).toHaveBeenNthCalledWith(
      1,
      "https://redirect.example.com/file",
      "audio URL",
    )
    expect(mocks.assertPublicUrl).toHaveBeenNthCalledWith(
      2,
      "https://cdn.example.com/audio.mp3",
      "audio URL",
    )
  })

  test("rejects a redirect target rejected by the SSRF guard", async () => {
    mocks.kyGet.mockResolvedValueOnce(
      Response.redirect("http://127.0.0.1/private"),
    )
    mocks.assertPublicUrl.mockResolvedValueOnce(undefined)
    mocks.assertPublicUrl.mockRejectedValueOnce(new Error("unsafe URL"))

    await expect(
      downloadWithByteLimit({
        label: "audio",
        maxBytes: 10,
        signal: new AbortController().signal,
        url: "https://redirect.example.com/file",
      }),
    ).rejects.toBeInstanceOf(ExpectedHeavyStepError)

    expect(mocks.kyGet).toHaveBeenCalledTimes(1)
  })

  test("rejects a direct URL rejected by the SSRF guard before requesting it", async () => {
    mocks.assertPublicUrl.mockRejectedValueOnce(new Error("unsafe URL"))

    await expect(
      downloadWithByteLimit({
        label: "audio",
        maxBytes: 10,
        signal: new AbortController().signal,
        url: "http://127.0.0.1/private",
      }),
    ).rejects.toBeInstanceOf(ExpectedHeavyStepError)

    expect(mocks.kyGet).not.toHaveBeenCalled()
  })
})
