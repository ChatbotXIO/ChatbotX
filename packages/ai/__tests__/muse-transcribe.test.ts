import { describe, expect, test, vi } from "vitest"
import {
  inspectMuseWav,
  MUSE_TRANSCRIBE_MAX_REQUEST_BYTES,
  MUSE_TRANSCRIBE_URL,
  MuseTranscribeError,
  MuseWavFormatError,
  transcribeWithMuse,
} from "../src/server/muse-transcribe"

type WavOptions = {
  bits?: number
  channels?: number
  /** Overrides the data chunk's declared size. */
  dataSize?: number
  extraChunks?: { id: string; body: Uint8Array }[]
  format?: number
  riffSize?: number
  sampleRate?: number
  seconds?: number
}

function chunk(id: string, body: Uint8Array): Uint8Array {
  const padded = body.length + (body.length % 2)
  const out = new Uint8Array(8 + padded)
  const view = new DataView(out.buffer)
  for (let index = 0; index < 4; index++) {
    out[index] = id.charCodeAt(index)
  }
  view.setUint32(4, body.length, true)
  out.set(body, 8)
  return out
}

function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function makeWav(options: WavOptions = {}): Uint8Array<ArrayBuffer> {
  const {
    bits = 16,
    channels = 1,
    extraChunks = [],
    format = 1,
    sampleRate = 16_000,
    seconds = 0.01,
  } = options
  const fmt = new Uint8Array(16)
  const fmtView = new DataView(fmt.buffer)
  fmtView.setUint16(0, format, true)
  fmtView.setUint16(2, channels, true)
  fmtView.setUint32(4, sampleRate, true)
  fmtView.setUint32(8, (sampleRate * channels * bits) / 8, true)
  fmtView.setUint16(12, (channels * bits) / 8, true)
  fmtView.setUint16(14, bits, true)

  const samples = new Uint8Array(
    Math.round(seconds * sampleRate) * channels * (bits / 8),
  )
  const data = chunk("data", samples)
  if (options.dataSize !== undefined) {
    new DataView(data.buffer).setUint32(4, options.dataSize, true)
  }

  const body = concat([
    new TextEncoder().encode("WAVE"),
    chunk("fmt ", fmt),
    ...extraChunks.map((extra) => chunk(extra.id, extra.body)),
    data,
  ])
  const header = new Uint8Array(8)
  header.set(new TextEncoder().encode("RIFF"))
  new DataView(header.buffer).setUint32(
    4,
    options.riffSize ?? body.length,
    true,
  )
  return concat([header, body])
}

function reasonOf(bytes: Uint8Array): string | undefined {
  try {
    inspectMuseWav(bytes)
    return
  } catch (error) {
    if (error instanceof MuseWavFormatError) {
      return error.reason
    }
    throw error
  }
}

describe("inspectMuseWav", () => {
  test("accepts mono PCM16 at 16 and 24 kHz", () => {
    expect(inspectMuseWav(makeWav({ sampleRate: 16_000, seconds: 1 }))).toEqual(
      { sampleRate: 16_000, dataBytes: 32_000, durationSeconds: 1 },
    )
    expect(inspectMuseWav(makeWav({ sampleRate: 24_000 })).sampleRate).toBe(
      24_000,
    )
  })

  test("skips a LIST chunk before data", () => {
    const wav = makeWav({
      extraChunks: [{ id: "LIST", body: new Uint8Array(26) }],
    })
    expect(reasonOf(wav)).toBeUndefined()
  })

  test("honours padding after an odd-sized chunk", () => {
    const wav = makeWav({
      extraChunks: [{ id: "bext", body: new Uint8Array(7) }],
    })
    expect(reasonOf(wav)).toBeUndefined()
  })

  test("reads a view with a non-zero byte offset", () => {
    const wav = makeWav()
    const backing = new Uint8Array(wav.length + 10)
    backing.set(wav, 10)
    expect(reasonOf(backing.subarray(10))).toBeUndefined()
  })

  test.each([
    ["stereo", makeWav({ channels: 2 }), "notMono"],
    ["44.1 kHz", makeWav({ sampleRate: 44_100 }), "unsupportedSampleRate"],
    ["24-bit", makeWav({ bits: 24 }), "not16Bit"],
    ["float", makeWav({ format: 3, bits: 32 }), "notPcm"],
    ["extensible", makeWav({ format: 0xff_fe }), "notPcm"],
    ["empty data", makeWav({ seconds: 0 }), "noAudioData"],
    ["601 seconds", makeWav({ seconds: 601 }), "tooLong"],
  ])("rejects %s", (_name, wav, reason) => {
    expect(reasonOf(wav)).toBe(reason)
  })

  test("names the actual value in the message", () => {
    expect(() => inspectMuseWav(makeWav({ channels: 2 }))).toThrow(
      "WAV has 2 channels; Muse requires mono",
    )
  })

  test("rejects ogg and mp3 bytes as not WAV", () => {
    expect(reasonOf(new TextEncoder().encode("OggS\0\x02rest-of-page"))).toBe(
      "notWav",
    )
    expect(reasonOf(new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0]))).toBe(
      "notWav",
    )
  })

  test("rejects a truncated header", () => {
    expect(reasonOf(makeWav().subarray(0, 10))).toBe("malformed")
    expect(reasonOf(makeWav().subarray(0, 30))).toBe("malformed")
  })

  test("rejects a data chunk declared past the end of the file", () => {
    const wav = makeWav({ dataSize: 1_000_000, riffSize: 0xff_ff_ff_ff })
    expect(reasonOf(wav)).toBe("malformed")
  })

  test("uses the remaining bytes for a streaming data size", () => {
    const wav = makeWav({
      dataSize: 0xff_ff_ff_ff,
      riffSize: 0xff_ff_ff_ff,
      seconds: 1,
    })
    expect(inspectMuseWav(wav).dataBytes).toBe(32_000)
  })

  test("stops after 64 chunks instead of looping", () => {
    const extraChunks = Array.from({ length: 70 }, () => ({
      id: "junk",
      body: new Uint8Array(0),
    }))
    expect(reasonOf(makeWav({ extraChunks }))).toBe("malformed")
  })
})

const integration = {
  auth: { authType: "secretText", secretText: "muse-key" },
}

const okBody = {
  sessionId: "session-1",
  transcript: "xin chào",
  audioDurationMs: 1000,
  turns: [{ turnId: 0, startMs: 0, endMs: 1000, transcript: "xin chào" }],
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  })
}

function run(
  response: Response | ((request: Request) => Promise<Response>),
  overrides: Partial<Parameters<typeof transcribeWithMuse>[0]> = {},
) {
  const forms: FormData[] = []
  const fetchMock = vi.fn(async (request: Request) => {
    // Drain the body in the mock, as a real server would, so the multipart
    // stream is never left half-read.
    forms.push(await request.clone().formData())
    return typeof response === "function" ? response(request) : response
  })
  return {
    fetchMock,
    forms,
    result: transcribeWithMuse({
      audio: makeWav(),
      fetch: fetchMock,
      integration,
      model: "muse-voice-transcribe-1.0",
      sessionId: "job-1",
      signal: new AbortController().signal,
      timeoutMs: 5000,
      ...overrides,
    }),
  }
}

async function captureError(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    if (error instanceof MuseTranscribeError) {
      return error
    }
    throw error
  }
  throw new Error("Expected MuseTranscribeError")
}

describe("transcribeWithMuse", () => {
  test("posts a multipart request with auth and session id", async () => {
    const { fetchMock, forms, result } = run(jsonResponse(okBody))

    await expect(result).resolves.toEqual({
      text: "xin chào",
      sessionId: "session-1",
      audioDurationMs: 1000,
    })
    const request = fetchMock.mock.calls[0]?.[0]
    if (!(request instanceof Request)) {
      throw new Error("Expected a Request")
    }
    const url = new URL(request.url)
    expect(`${url.origin}${url.pathname}`).toBe(MUSE_TRANSCRIBE_URL)
    expect(url.searchParams.get("sessionId")).toBe("job-1")
    expect(request.headers.get("authorization")).toBe("Bearer muse-key")

    const form = forms[0]
    if (!form) {
      throw new Error("Expected a multipart body")
    }
    const audio = form.get("audio")
    expect(audio).toBeInstanceOf(Blob)
    expect(audio instanceof File ? audio.name : undefined).toBe("audio.wav")
    const requestPart = form.get("request")
    if (!(requestPart instanceof Blob)) {
      throw new Error("Expected request part")
    }
    expect(JSON.parse(await requestPart.text())).toEqual({
      model: "muse-voice-transcribe-1.0",
      audioEncoding: "WAV",
      mode: "PUSH_TO_TALK",
    })
  })

  test("sends languageBias and keywords only when given", async () => {
    const { forms, result } = run(jsonResponse(okBody), {
      keywords: ["ChatbotX"],
      languageBias: ["Vietnamese"],
    })
    await result
    const requestPart = forms[0]?.get("request")
    if (!(requestPart instanceof Blob)) {
      throw new Error("Expected request part")
    }
    expect(JSON.parse(await requestPart.text())).toMatchObject({
      keywords: ["ChatbotX"],
      languageBias: ["Vietnamese"],
    })
  })

  test("uploads only the bytes of a view with an offset", async () => {
    const wav = makeWav()
    const backing = new Uint8Array(wav.length + 32)
    backing.set(wav, 32)
    const { forms, result } = run(jsonResponse(okBody), {
      audio: backing.subarray(32),
    })
    await result
    const audio = forms[0]?.get("audio")
    if (!(audio instanceof Blob)) {
      throw new Error("Expected audio part")
    }
    expect(audio.size).toBe(wav.length)
  })

  test.each([
    ["missing transcript", { ...okBody, transcript: undefined }],
    ["non-string transcript", { ...okBody, transcript: 42 }],
  ])("does not retry a response with %s", async (_name, body) => {
    const error = await captureError(run(jsonResponse(body)).result)
    expect(error).toMatchObject({
      code: "invalid_response",
      retryable: false,
      sessionId: "job-1",
    })
  })

  test.each([
    ["negative duration", { ...okBody, audioDurationMs: -1 }],
    ["turn missing endMs", { ...okBody, turns: [{ turnId: 0, startMs: 0 }] }],
    [
      "turn with string startMs",
      {
        ...okBody,
        turns: [{ turnId: 0, startMs: "0", endMs: 1, transcript: "" }],
      },
    ],
    ["missing turns", { ...okBody, turns: undefined }],
  ])("keeps the transcript of a response with %s", async (_name, body) => {
    await expect(run(jsonResponse(body)).result).resolves.toMatchObject({
      text: "xin chào",
      sessionId: "session-1",
    })
  })

  test("falls back to the request session id when Meta omits it", async () => {
    await expect(
      run(jsonResponse({ ...okBody, sessionId: undefined })).result,
    ).resolves.toEqual({
      text: "xin chào",
      sessionId: "job-1",
      audioDurationMs: 1000,
    })
  })

  test.each([
    [400, false],
    [413, false],
    [429, true],
    [503, true],
  ])("maps HTTP %i to retryable=%s", async (status, retryable) => {
    const error = await captureError(
      run(
        jsonResponse(
          {
            error: { message: "bad", type: "invalid_request", param: "audio" },
          },
          status,
        ),
      ).result,
    )
    expect(error).toMatchObject({ code: "http_error", retryable, status })
    expect(error.message).toContain("bad")
    expect(error.message).toContain("param=audio")
  })

  test("rejects invalid credentials without calling Meta", async () => {
    const { fetchMock, result } = run(jsonResponse(okBody), {
      integration: { auth: { authType: "secretText", secretText: "" } },
    })
    const error = await captureError(result)
    expect(error).toMatchObject({ code: "invalid_auth", retryable: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test("blocks audio over the request limit before calling Meta", async () => {
    const { fetchMock, result } = run(jsonResponse(okBody), {
      audio: new Uint8Array(MUSE_TRANSCRIBE_MAX_REQUEST_BYTES - 1024),
    })
    const error = await captureError(result)
    expect(error).toMatchObject({
      code: "request_too_large",
      retryable: false,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test("surfaces an aborted request as a retryable transport error", async () => {
    const controller = new AbortController()
    const { result } = run(
      (request) =>
        new Promise((_resolve, reject) => {
          request.signal.addEventListener("abort", () =>
            reject(request.signal.reason),
          )
        }),
      { signal: controller.signal },
    )
    controller.abort()
    const error = await captureError(result)
    expect(error).toMatchObject({ code: "network_error", retryable: true })
  })
})
