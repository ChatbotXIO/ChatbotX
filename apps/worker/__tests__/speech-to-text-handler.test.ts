import { AISpeechToTextDefaultFn } from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  aiFindBy: vi.fn(),
  downloadWithByteLimit: vi.fn(),
  env: {
    HEAVY_JOB_WAIT_TIMEOUT_MS: 120_000,
    HEAVY_MAX_AUDIO_BYTES: 25 * 1024 * 1024,
    MUSE_TRANSCRIBE_MAX_AUDIO_BYTES: 32 * 1024 * 1024 - 64 * 1024,
    MUSE_TRANSCRIBE_TIMEOUT_MS: 540_000,
  },
  getAIModel: vi.fn(),
  loggerInfo: vi.fn(),
  readCustomFieldValue: vi.fn(),
  transcribe: vi.fn(),
  transcribeWithMuse: vi.fn(),
}))

vi.mock("@chatbotx.io/ai", () => ({ aiTimeouts: { aiTotal: 120_000 } }))
vi.mock("@chatbotx.io/ai/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/ai/server")>()),
  aiIntegrationService: { findBy: mocks.aiFindBy },
  getAIModel: mocks.getAIModel,
  transcribeWithMuse: mocks.transcribeWithMuse,
}))
vi.mock("ai", () => ({ transcribe: mocks.transcribe }))
vi.mock("../src/env", () => ({ env: mocks.env }))
vi.mock("../src/integration/utils/contact", () => ({
  readCustomFieldValue: mocks.readCustomFieldValue,
}))
vi.mock("../src/heavy/handlers/bounded-download", () => ({
  downloadWithByteLimit: mocks.downloadWithByteLimit,
}))
vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), info: mocks.loggerInfo, warn: vi.fn() },
}))

const { MuseTranscribeError } = await import("@chatbotx.io/ai/server")
const { speechToTextOutput } = await import(
  "../src/heavy/handlers/speech-to-text"
)
const { ExpectedHeavyStepError, isRetryableHeavyError } = await import(
  "../src/heavy/handlers/errors"
)

const conversation = { id: "conv-1", workspaceId: "ws-1", contactId: "c-1" }
const museIntegration = {
  auth: { authType: "secretText", secretText: "muse-key" },
}

function makeWav({
  channels = 1,
  offset = 0,
}: {
  channels?: number
  offset?: number
} = {}): Buffer {
  const dataBytes = 3200 * channels
  const total = 44 + dataBytes
  const backing = Buffer.alloc(total + offset)
  const wav = backing.subarray(offset)
  wav.write("RIFF", 0, "ascii")
  wav.writeUInt32LE(total - 8, 4)
  wav.write("WAVE", 8, "ascii")
  wav.write("fmt ", 12, "ascii")
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(channels, 22)
  wav.writeUInt32LE(16_000, 24)
  wav.writeUInt32LE(16_000 * 2 * channels, 28)
  wav.writeUInt16LE(2 * channels, 32)
  wav.writeUInt16LE(16, 34)
  wav.write("data", 36, "ascii")
  wav.writeUInt32LE(dataBytes, 40)
  return wav
}

function museStep(overrides: Record<string, unknown> = {}) {
  return {
    ...AISpeechToTextDefaultFn({
      provider: "muse",
      inputFieldId: "field-in",
      outputFieldId: "field-out",
    }),
    ...overrides,
  } as ReturnType<typeof AISpeechToTextDefaultFn>
}

function run(step = museStep()) {
  return speechToTextOutput({
    contactInbox: { id: "ci-1" },
    conversation,
    sessionId: "heavy-job-1",
    step,
  } as never)
}

// Mirrors `downloadWithByteLimit`'s header check (covered by
// bounded-download.test.ts) so the caller's `allowedMimeTypes` is exercised.
function serveAudio(buffer: Buffer, contentType: string) {
  mocks.downloadWithByteLimit.mockImplementation(
    ({ allowedMimeTypes }: { allowedMimeTypes?: ReadonlySet<string> }) => {
      if (allowedMimeTypes && !allowedMimeTypes.has(contentType)) {
        throw new ExpectedHeavyStepError(
          `Unsupported audio format: ${contentType || "unknown"}`,
        )
      }
      return Promise.resolve({
        buffer,
        contentType,
        rawContentType: contentType,
      })
    },
  )
}

async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error("Expected a rejection")
}

describe("speechToTextOutput", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.aiFindBy.mockResolvedValue(museIntegration)
    mocks.readCustomFieldValue.mockResolvedValue("https://cdn/audio.wav")
    mocks.downloadWithByteLimit.mockResolvedValue({ buffer: makeWav() })
    mocks.transcribeWithMuse.mockResolvedValue({
      text: "  xin chào  ",
      sessionId: "meta-session",
      audioDurationMs: 100,
    })
  })

  test("keeps the OpenAI path on transcribe() with the step model", async () => {
    const transcription = vi.fn(() => "whisper-model")
    mocks.aiFindBy.mockResolvedValue({ auth: {} })
    mocks.getAIModel.mockReturnValue({ transcription })
    mocks.transcribe.mockResolvedValue({ text: "hello" })

    const step = AISpeechToTextDefaultFn({
      inputFieldId: "field-in",
      outputFieldId: "field-out",
    })
    await expect(run(step)).resolves.toBe("hello")
    expect(transcription).toHaveBeenCalledWith("whisper-1")
    expect(mocks.downloadWithByteLimit).toHaveBeenCalledWith(
      expect.objectContaining({ maxBytes: mocks.env.HEAVY_MAX_AUDIO_BYTES }),
    )
    expect(mocks.transcribeWithMuse).not.toHaveBeenCalled()
  })

  test("returns the trimmed Muse transcript", async () => {
    await expect(run()).resolves.toBe("xin chào")
    expect(mocks.aiFindBy).toHaveBeenCalledWith({
      provider: "muse",
      workspaceId: "ws-1",
    })
    expect(mocks.downloadWithByteLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        maxBytes: mocks.env.MUSE_TRANSCRIBE_MAX_AUDIO_BYTES,
      }),
    )
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "muse",
        sessionId: "heavy-job-1",
        transcriptChars: 8,
      }),
      "Muse speech-to-text completed",
    )
  })

  test("passes languageBias, keywords, the job session and Muse timeout", async () => {
    await run(museStep({ languageBias: ["Vietnamese"], keywords: ["Aha"] }))

    expect(mocks.transcribeWithMuse).toHaveBeenCalledWith(
      expect.objectContaining({
        integration: museIntegration,
        keywords: ["Aha"],
        languageBias: ["Vietnamese"],
        model: "muse-voice-transcribe-1.0",
        sessionId: "heavy-job-1",
        timeoutMs: 540_000,
      }),
    )
  })

  test("inspects and uploads only a Buffer view's own bytes", async () => {
    const wav = makeWav({ offset: 24 })
    mocks.downloadWithByteLimit.mockResolvedValue({ buffer: wav })

    await run()

    const [{ audio }] = mocks.transcribeWithMuse.mock.calls[0] ?? []
    expect(audio.byteLength).toBe(wav.byteLength)
    expect(audio.byteOffset).toBe(wav.byteOffset)
  })

  test.each([
    ["binary/octet-stream", "binary/octet-stream"],
    ["no content-type", ""],
  ])("transcribes WAV served with %s", async (_name, contentType) => {
    serveAudio(makeWav(), contentType)

    await expect(run()).resolves.toBe("xin chào")
    expect(mocks.transcribeWithMuse).toHaveBeenCalled()
  })

  test("rejects an HTML body by its bytes, not its content-type", async () => {
    serveAudio(Buffer.from("<!doctype html><html></html>"), "text/html")

    const error = await captureError(run())
    expect(error).toBeInstanceOf(ExpectedHeavyStepError)
    expect(String(error)).toContain("WAV PCM 16-bit mono 16/24 kHz")
    expect(mocks.transcribeWithMuse).not.toHaveBeenCalled()
  })

  test("keeps the OpenAI content-type allowlist", async () => {
    mocks.aiFindBy.mockResolvedValue({ auth: {} })
    mocks.getAIModel.mockReturnValue({ transcription: vi.fn() })
    serveAudio(makeWav(), "binary/octet-stream")

    const error = await captureError(
      run(
        AISpeechToTextDefaultFn({
          inputFieldId: "field-in",
          outputFieldId: "field-out",
        }),
      ),
    )
    expect(error).toBeInstanceOf(ExpectedHeavyStepError)
    expect(String(error)).toContain("Unsupported audio format")
    expect(mocks.transcribe).not.toHaveBeenCalled()
  })

  test("sends ogg audio to the error state with reason notWav", async () => {
    mocks.downloadWithByteLimit.mockResolvedValue({
      buffer: Buffer.from("OggS\0\x02voice-note-page"),
    })

    const error = await captureError(run())
    expect(error).toBeInstanceOf(ExpectedHeavyStepError)
    expect(String(error)).toContain("WAV PCM 16-bit mono 16/24 kHz")
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "notWav" }),
      "Muse speech-to-text rejected the audio format",
    )
    expect(mocks.transcribeWithMuse).not.toHaveBeenCalled()
  })

  test("sends stereo WAV to the error state", async () => {
    mocks.downloadWithByteLimit.mockResolvedValue({
      buffer: makeWav({ channels: 2 }),
    })

    const error = await captureError(run())
    expect(error).toBeInstanceOf(ExpectedHeavyStepError)
    expect(String(error)).toContain("2 channels")
  })

  test("errors when the Muse integration is missing", async () => {
    mocks.aiFindBy.mockResolvedValue(undefined)
    await expect(run()).rejects.toThrow("AI integration not found")
  })

  test("errors when no audio URL is stored", async () => {
    mocks.readCustomFieldValue.mockResolvedValue(undefined)
    const error = await captureError(run())
    expect(error).toBeInstanceOf(ExpectedHeavyStepError)
    expect(String(error)).toContain("No audio URL provided")
  })

  test.each([
    ["invalid credentials", "invalid_auth", undefined],
    ["a 400", "http_error", 400],
    ["an invalid response", "invalid_response", undefined],
  ])("routes %s from the client to the error state", async (_name, code, status) => {
    mocks.transcribeWithMuse.mockRejectedValue(
      new MuseTranscribeError("rejected", {
        code: code as "http_error",
        retryable: false,
        sessionId: "heavy-job-1",
        status,
      }),
    )

    const error = await captureError(run())
    expect(error).toBeInstanceOf(ExpectedHeavyStepError)
    expect(isRetryableHeavyError(error)).toBe(false)
  })

  test.each([429, 503])("keeps a Muse %i retryable", async (status) => {
    mocks.transcribeWithMuse.mockRejectedValue(
      new MuseTranscribeError("busy", {
        code: "http_error",
        retryable: true,
        sessionId: "heavy-job-1",
        status,
      }),
    )

    const error = await captureError(run())
    expect(error).not.toBeInstanceOf(ExpectedHeavyStepError)
    expect(isRetryableHeavyError(error)).toBe(true)
  })

  test("treats an empty transcript as an expected error", async () => {
    mocks.transcribeWithMuse.mockResolvedValue({
      text: "   ",
      sessionId: "meta-session",
      audioDurationMs: 100,
    })

    const error = await captureError(run())
    expect(error).toBeInstanceOf(ExpectedHeavyStepError)
    expect(String(error)).toContain("empty transcript")
  })
})
