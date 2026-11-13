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
const { audioSniffer } = await import("../src/heavy/handlers/audio-signature")

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

describe("downloadWithByteLimit content sniffing", () => {
  const audioTypes = new Set(["audio/mp4", "audio/mpeg", "audio/wav"])
  const options = {
    allowedMimeTypes: audioTypes,
    label: "audio",
    maxBytes: 1024,
    signal: new AbortController().signal,
    sniffer: audioSniffer,
    url: "https://cdn.example.com/voice",
  }
  // `ftyp` after a 4-byte box size, like the Messenger voice clip.
  const mp4 = Uint8Array.from([
    0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32, 0, 0, 0, 0,
    1, 2, 3,
  ])
  const html = new TextEncoder().encode("<!doctype html><html></html>")

  // A stream that serves `chunks` and counts how many were requested.
  function streamOf(chunks: Uint8Array[], contentType?: string) {
    const state = { pulled: 0, cancelled: false }
    const response = new Response(
      new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            const chunk = chunks[state.pulled]
            state.pulled += 1
            if (chunk) {
              controller.enqueue(chunk)
            } else {
              controller.close()
            }
          },
          cancel() {
            state.cancelled = true
          },
        },
        { highWaterMark: 0 },
      ),
      { headers: contentType ? { "content-type": contentType } : {} },
    )
    return { response, state }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  test.each([
    ["application/octet-stream"],
    ["binary/octet-stream"],
    ["application/octet-stream; charset=binary"],
    [undefined],
  ])("accepts audio served as %s by its bytes", async (contentType) => {
    mocks.kyGet.mockResolvedValueOnce(streamOf([mp4], contentType).response)

    const result = await downloadWithByteLimit(options)

    expect(result.contentType).toBe("audio/mp4")
    expect(result.rawContentType).toBe(contentType ?? "")
    expect(result.buffer).toEqual(Buffer.from(mp4))
  })

  test("returns every byte, even when the stream arrives in tiny chunks", async () => {
    const chunks = [
      mp4.slice(0, 2),
      mp4.slice(2, 3),
      mp4.slice(3, 9),
      mp4.slice(9),
    ]
    mocks.kyGet.mockResolvedValueOnce(
      streamOf(chunks, "application/octet-stream").response,
    )

    const result = await downloadWithByteLimit(options)

    expect(result.contentType).toBe("audio/mp4")
    expect(result.buffer).toEqual(Buffer.from(mp4))
  })

  test("recognises a file shorter than the sniffing window", async () => {
    const wav = Uint8Array.from([
      0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45,
    ])
    mocks.kyGet.mockResolvedValueOnce(
      streamOf([wav], "application/octet-stream").response,
    )

    const result = await downloadWithByteLimit(options)

    expect(result.contentType).toBe("audio/wav")
    expect(result.buffer).toEqual(Buffer.from(wav))
  })

  test("drops a generic file that is not audio after its first chunk", async () => {
    // A long body: only the first chunk may be read before giving up.
    const chunks = Array.from({ length: 50 }, () => html)
    const { response, state } = streamOf(chunks, "application/octet-stream")
    mocks.kyGet.mockResolvedValueOnce(response)

    await expect(downloadWithByteLimit(options)).rejects.toThrow(
      "Unsupported audio format: application/octet-stream",
    )

    expect(state.cancelled).toBe(true)
    expect(state.pulled).toBeLessThanOrEqual(2)
  })

  test("rejects a specific but wrong content type without reading the body", async () => {
    const { response, state } = streamOf([mp4], "text/html")
    mocks.kyGet.mockResolvedValueOnce(response)

    await expect(downloadWithByteLimit(options)).rejects.toBeInstanceOf(
      ExpectedHeavyStepError,
    )

    expect(state.pulled).toBe(0)
    // The unread body is released, not left holding the connection open.
    expect(state.cancelled).toBe(true)
  })

  test("keeps rejecting a generic type when the caller gives no sniffer", async () => {
    const { response, state } = streamOf([mp4], "application/octet-stream")
    mocks.kyGet.mockResolvedValueOnce(response)

    await expect(
      downloadWithByteLimit({ ...options, sniffer: undefined }),
    ).rejects.toThrow("Unsupported audio format")

    expect(state.pulled).toBe(0)
    expect(state.cancelled).toBe(true)
  })

  test("rejects when the sniffed type is not allowed", async () => {
    const ogg = Uint8Array.from([
      0x4f, 0x67, 0x67, 0x53, 0, 2, 0, 0, 0, 0, 0, 0,
    ])
    mocks.kyGet.mockResolvedValueOnce(
      streamOf([ogg], "application/octet-stream").response,
    )

    await expect(downloadWithByteLimit(options)).rejects.toThrow(
      "Unsupported audio format",
    )
  })

  test("still enforces the byte limit on a sniffed file", async () => {
    const big = new Uint8Array(40)
    big.set(mp4)
    mocks.kyGet.mockResolvedValueOnce(
      streamOf([big.slice(0, 20), big.slice(20)], "application/octet-stream")
        .response,
    )

    await expect(
      downloadWithByteLimit({ ...options, maxBytes: 30 }),
    ).rejects.toBeInstanceOf(ExpectedHeavyStepError)
  })

  test("does not sniff when the content type is already allowed", async () => {
    // The bytes are not an MP4, but the declared type is trusted as before.
    const { response } = streamOf([Uint8Array.from([1, 2, 3, 4])], "audio/mpeg")
    mocks.kyGet.mockResolvedValueOnce(response)

    const result = await downloadWithByteLimit(options)

    expect(result.contentType).toBe("audio/mpeg")
    expect(result.buffer).toEqual(Buffer.from([1, 2, 3, 4]))
  })

  test("rejects a HEIC image served as octet-stream and cancels the download", async () => {
    const heic = Uint8Array.from([
      0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0, 0, 0, 0,
    ])
    const { response, state } = streamOf(
      [heic, new Uint8Array(64)],
      "application/octet-stream",
    )
    mocks.kyGet.mockResolvedValueOnce(response)

    await expect(downloadWithByteLimit(options)).rejects.toThrow(
      "Unsupported audio format",
    )

    expect(state.cancelled).toBe(true)
  })

  test("releases the stream when the sniffer throws", async () => {
    const { response, state } = streamOf(
      [mp4, new Uint8Array(64)],
      "application/octet-stream",
    )
    mocks.kyGet.mockResolvedValueOnce(response)

    await expect(
      downloadWithByteLimit({
        ...options,
        sniffer: {
          bytes: 16,
          sniff: () => {
            throw new Error("sniffer bug")
          },
        },
      }),
    ).rejects.toThrow("sniffer bug")

    expect(state.cancelled).toBe(true)
  })

  test("releases the stream when the sniffed type is not allowed", async () => {
    const { response, state } = streamOf(
      [mp4, new Uint8Array(64)],
      "application/octet-stream",
    )
    mocks.kyGet.mockResolvedValueOnce(response)

    await expect(
      downloadWithByteLimit({
        ...options,
        sniffer: { bytes: 16, sniff: () => "audio/ogg" },
      }),
    ).rejects.toThrow("Unsupported audio format")

    expect(state.cancelled).toBe(true)
  })

  test("gives the sniffer as many bytes as it asked for", async () => {
    const heads: number[] = []
    const head20 = new Uint8Array(20).fill(7)
    mocks.kyGet.mockResolvedValueOnce(
      streamOf(
        [head20.slice(0, 6), head20.slice(6)],
        "application/octet-stream",
      ).response,
    )

    const result = await downloadWithByteLimit({
      ...options,
      sniffer: {
        bytes: 20,
        sniff: (head) => {
          heads.push(head.length)
          return "audio/mp4"
        },
      },
    })

    expect(heads).toEqual([20])
    expect(result.buffer.length).toBe(20)
  })
})
