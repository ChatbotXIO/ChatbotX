import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  attachTranscript: vi.fn(),
  findByInboxIdForWorkspace: vi.fn(),
  contactInboxFindBy: vi.fn(),
  getRecordingSignedUrl: vi.fn(),
  emitCallTranscribed: vi.fn(),
  aiFindBy: vi.fn(),
  transcribe: vi.fn(),
  kyGet: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock("@chatbotx.io/business", () => ({
  contactInboxService: { findBy: mocks.contactInboxFindBy },
  callRecordingService: { getRecordingSignedUrl: mocks.getRecordingSignedUrl },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  whatsappCallRepository: {
    findById: mocks.findById,
    attachTranscript: mocks.attachTranscript,
  },
  integrationWhatsappRepository: {
    findByInboxIdForWorkspace: mocks.findByInboxIdForWorkspace,
  },
}))

vi.mock("@chatbotx.io/events", () => ({
  emitCallTranscribed: mocks.emitCallTranscribed,
  setWebhookExecutionContext: vi.fn(),
}))

vi.mock("@chatbotx.io/ai", () => ({
  aiTimeouts: { aiTotal: 60_000 },
}))

vi.mock("@chatbotx.io/ai/server", () => ({
  aiIntegrationService: { findBy: mocks.aiFindBy },
  getAIModel: vi.fn(() => ({
    transcription: vi.fn(() => "whisper-model"),
  })),
}))

vi.mock("ai", () => ({
  experimental_transcribe: mocks.transcribe,
}))

vi.mock("ky", () => ({
  default: { get: mocks.kyGet },
}))

vi.mock("../src/lib/logger", () => ({
  logger: mocks.logger,
}))

const { handleWhatsappCallTranscribe } = await import(
  "../src/integration/handlers/whatsapp-call-transcribe"
)

const callRow = {
  id: "call-1",
  wacid: "wacid.ABC",
  attemptId: null as string | null,
  workspaceId: "ws-1",
  inboxId: "inbox-1",
  contactInboxId: "ci-1",
  recordingPath: null as string | null,
  transcript: null as string | null,
  recordedAt: null as Date | null,
}

describe("handleWhatsappCallTranscribe", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findById.mockResolvedValue({
      ...callRow,
      recordingPath: "space/ws-1/calls/call-1.ogg",
      recordedAt: new Date(),
    })
    mocks.findByInboxIdForWorkspace.mockResolvedValue({
      id: "iw-1",
      callTranscriptionEnabled: true,
    })
    mocks.aiFindBy.mockResolvedValue({ id: "ai-1" })
    mocks.kyGet.mockReturnValue({
      arrayBuffer: async () => new ArrayBuffer(8),
    })
    mocks.transcribe.mockResolvedValue({ text: "hello from the call" })
    mocks.attachTranscript.mockResolvedValue({ id: "call-1" })
    mocks.getRecordingSignedUrl.mockResolvedValue(
      "https://signed.example.com/space/ws-1/calls/call-1.ogg?sig=abc",
    )
    mocks.contactInboxFindBy.mockResolvedValue({
      id: "ci-1",
      contactId: "contact-1",
    })
  })

  const call = (props: {
    channel: "whatsapp"
    callId: string
    workspaceId: string
  }) => handleWhatsappCallTranscribe(props)

  test("transcribes and stamps the transcript by id, then emits callTranscribed with the external correlation id", async () => {
    await call({ channel: "whatsapp", callId: "call-1", workspaceId: "ws-1" })

    expect(mocks.transcribe).toHaveBeenCalled()
    expect(mocks.attachTranscript).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "call-1",
        transcript: "hello from the call",
      }),
    )
    expect(mocks.emitCallTranscribed).toHaveBeenCalledWith(
      "ws-1",
      "contact-1",
      { callId: "wacid.ABC", transcript: "hello from the call" },
    )
  })

  test("skipped when the integration has not opted into transcription", async () => {
    mocks.findByInboxIdForWorkspace.mockResolvedValue({
      id: "iw-1",
      callTranscriptionEnabled: false,
    })

    await call({ channel: "whatsapp", callId: "call-1", workspaceId: "ws-1" })

    expect(mocks.transcribe).not.toHaveBeenCalled()
  })

  test("skips silently when the workspace has no OpenAI integration", async () => {
    mocks.aiFindBy.mockResolvedValue(null)

    await call({ channel: "whatsapp", callId: "call-1", workspaceId: "ws-1" })

    expect(mocks.transcribe).not.toHaveBeenCalled()
    expect(mocks.attachTranscript).not.toHaveBeenCalled()
  })

  test("skips when the call has no recording", async () => {
    mocks.findById.mockResolvedValue({ ...callRow, recordingPath: null })

    await call({ channel: "whatsapp", callId: "call-1", workspaceId: "ws-1" })

    expect(mocks.transcribe).not.toHaveBeenCalled()
  })

  test("transcribes even when recordedAt has not been stamped yet (enqueue precedes the stamp)", async () => {
    mocks.findById.mockResolvedValue({
      ...callRow,
      recordingPath: "space/ws-1/calls/call-1.ogg",
      recordedAt: null,
    })

    await call({ channel: "whatsapp", callId: "call-1", workspaceId: "ws-1" })

    expect(mocks.transcribe).toHaveBeenCalled()
  })

  test("reads the recording via a signed URL, never a public one", async () => {
    await call({ channel: "whatsapp", callId: "call-1", workspaceId: "ws-1" })

    expect(mocks.getRecordingSignedUrl).toHaveBeenCalledWith({
      recordingPath: "space/ws-1/calls/call-1.ogg",
    })
  })
})
