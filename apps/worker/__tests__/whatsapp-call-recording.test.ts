import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findByWacid: vi.fn(),
  attachRecording: vi.fn(),
  attachTranscript: vi.fn(),
  createOrUpdateWithAttachments: vi.fn(),
  broadcastToWorkspaceParty: vi.fn(),
  contactInboxFindBy: vi.fn(),
  resolveTenantSettings: vi.fn(),
  emitCallRecorded: vi.fn(),
  emitCallTranscribed: vi.fn(),
  queueAdd: vi.fn(),
  aiFindBy: vi.fn(),
  transcribe: vi.fn(),
  kyGet: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock("@chatbotx.io/business", () => ({
  broadcastToWorkspaceParty: mocks.broadcastToWorkspaceParty,
  contactInboxService: { findBy: mocks.contactInboxFindBy },
  resolveTenantSettings: mocks.resolveTenantSettings,
}))

vi.mock("@chatbotx.io/business/utils", () => ({
  getPublicFileUrl: (path: string, storageUrl: string) =>
    `${storageUrl}/${path}`,
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  whatsappCallRepository: {
    findByWacid: mocks.findByWacid,
    attachRecording: mocks.attachRecording,
    attachTranscript: mocks.attachTranscript,
  },
  createMessageRepository: vi.fn(async () => ({
    createOrUpdateWithAttachments: mocks.createOrUpdateWithAttachments,
  })),
}))

vi.mock("@chatbotx.io/events", () => ({
  emitCallRecorded: mocks.emitCallRecorded,
  emitCallTranscribed: mocks.emitCallTranscribed,
  setWebhookExecutionContext: vi.fn(),
}))

vi.mock("@chatbotx.io/worker-config", async () => {
  const actual = await vi.importActual<
    typeof import("@chatbotx.io/worker-config")
  >("@chatbotx.io/worker-config")
  return {
    ...actual,
    integrationQueue: { add: mocks.queueAdd },
  }
})

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

const { handleWhatsappCallRecordingReady, handleWhatsappCallTranscribe } =
  await import("../src/integration/handlers/whatsapp-call-recording")

const callRow = {
  id: "call-1",
  wacid: "wacid.ABC",
  direction: "userInitiated" as const,
  status: "completed" as const,
  workspaceId: "ws-1",
  inboxId: "inbox-1",
  contactInboxId: "ci-1",
  conversationId: "conv-1",
  recordingPath: null as string | null,
  transcript: null as string | null,
}

describe("handleWhatsappCallRecordingReady", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findByWacid.mockResolvedValue(callRow)
    mocks.attachRecording.mockResolvedValue({
      ...callRow,
      recordingPath: "public/space/ws-1/calls/wacid.ABC.ogg",
    })
    mocks.createOrUpdateWithAttachments.mockResolvedValue({
      isNew: true,
      result: { id: "msg-1", createdAt: new Date(), attachments: [] },
    })
    mocks.resolveTenantSettings.mockResolvedValue({
      storageUrl: "https://cdn.example.com",
    })
    mocks.contactInboxFindBy.mockResolvedValue({
      id: "ci-1",
      contactId: "contact-1",
    })
  })

  test("stamps the recording, drops the audio message, emits, and chains transcription", async () => {
    await handleWhatsappCallRecordingReady({
      wacid: "wacid.ABC",
      workspaceId: "ws-1",
      recordingPath: "public/space/ws-1/calls/wacid.ABC.ogg",
      sizeBytes: 1234,
    })

    expect(mocks.attachRecording).toHaveBeenCalledWith(
      expect.objectContaining({
        wacid: "wacid.ABC",
        recordingPath: "public/space/ws-1/calls/wacid.ABC.ogg",
      }),
    )
    expect(mocks.createOrUpdateWithAttachments).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: "wacall-rec-wacid.ABC",
        messageType: "activity",
        senderType: "system",
      }),
      [
        expect.objectContaining({
          fileType: "audio",
          originPath: "public/space/ws-1/calls/wacid.ABC.ogg",
        }),
      ],
    )
    expect(mocks.emitCallRecorded).toHaveBeenCalledWith("ws-1", "contact-1", {
      callId: "wacid.ABC",
      recordingUrl:
        "https://cdn.example.com/public/space/ws-1/calls/wacid.ABC.ogg",
    })
    expect(mocks.queueAdd).toHaveBeenCalledWith(
      "whatsappCallTranscribe",
      expect.objectContaining({
        data: { wacid: "wacid.ABC", workspaceId: "ws-1" },
      }),
      { jobId: "wa-call-transcribe-wacid.ABC" },
    )
  })

  test("redelivered egress webhook is a no-op after post-processing completed", async () => {
    mocks.findByWacid.mockResolvedValue({
      ...callRow,
      recordingPath: "public/space/ws-1/calls/wacid.ABC.ogg",
      recordedAt: new Date(),
    })

    await handleWhatsappCallRecordingReady({
      wacid: "wacid.ABC",
      workspaceId: "ws-1",
      recordingPath: "public/space/ws-1/calls/wacid.ABC.ogg",
    })

    expect(mocks.createOrUpdateWithAttachments).not.toHaveBeenCalled()
    expect(mocks.emitCallRecorded).not.toHaveBeenCalled()
    expect(mocks.queueAdd).not.toHaveBeenCalled()
  })

  test("a retry after a mid-pipeline crash re-runs without duplicating the message events", async () => {
    // The message already exists from the first attempt (isNew: false) but
    // recordedAt was never stamped — the retry must still chain
    // transcription and finish the stamp, without re-broadcasting.
    mocks.createOrUpdateWithAttachments.mockResolvedValue({
      isNew: false,
      result: { id: "msg-1", createdAt: new Date(), attachments: [] },
    })

    await handleWhatsappCallRecordingReady({
      wacid: "wacid.ABC",
      workspaceId: "ws-1",
      recordingPath: "public/space/ws-1/calls/wacid.ABC.ogg",
    })

    expect(mocks.broadcastToWorkspaceParty).not.toHaveBeenCalled()
    expect(mocks.emitCallRecorded).not.toHaveBeenCalled()
    expect(mocks.queueAdd).toHaveBeenCalled()
    expect(mocks.attachRecording).toHaveBeenCalled()
  })
})

describe("handleWhatsappCallTranscribe", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findByWacid.mockResolvedValue({
      ...callRow,
      recordingPath: "public/space/ws-1/calls/wacid.ABC.ogg",
      recordedAt: new Date(),
    })
    mocks.aiFindBy.mockResolvedValue({ id: "ai-1" })
    mocks.kyGet.mockReturnValue({
      arrayBuffer: async () => new ArrayBuffer(8),
    })
    mocks.transcribe.mockResolvedValue({ text: "hello from the call" })
    mocks.attachTranscript.mockResolvedValue({ id: "call-1" })
    mocks.resolveTenantSettings.mockResolvedValue({
      storageUrl: "https://cdn.example.com",
    })
    mocks.contactInboxFindBy.mockResolvedValue({
      id: "ci-1",
      contactId: "contact-1",
    })
  })

  test("transcribes and stamps the transcript, then emits callTranscribed", async () => {
    await handleWhatsappCallTranscribe({
      wacid: "wacid.ABC",
      workspaceId: "ws-1",
    })

    expect(mocks.transcribe).toHaveBeenCalled()
    expect(mocks.attachTranscript).toHaveBeenCalledWith(
      expect.objectContaining({
        wacid: "wacid.ABC",
        transcript: "hello from the call",
      }),
    )
    expect(mocks.emitCallTranscribed).toHaveBeenCalledWith(
      "ws-1",
      "contact-1",
      { callId: "wacid.ABC", transcript: "hello from the call" },
    )
  })

  test("skips silently when the workspace has no OpenAI integration", async () => {
    mocks.aiFindBy.mockResolvedValue(null)

    await handleWhatsappCallTranscribe({
      wacid: "wacid.ABC",
      workspaceId: "ws-1",
    })

    expect(mocks.transcribe).not.toHaveBeenCalled()
    expect(mocks.attachTranscript).not.toHaveBeenCalled()
  })

  test("skips when the call has no recording", async () => {
    mocks.findByWacid.mockResolvedValue({ ...callRow, recordingPath: null })

    await handleWhatsappCallTranscribe({
      wacid: "wacid.ABC",
      workspaceId: "ws-1",
    })

    expect(mocks.transcribe).not.toHaveBeenCalled()
  })

  test("transcribes even when recordedAt has not been stamped yet (enqueue precedes the stamp)", async () => {
    mocks.findByWacid.mockResolvedValue({
      ...callRow,
      recordingPath: "public/space/ws-1/calls/wacid.ABC.ogg",
      recordedAt: null,
    })

    await handleWhatsappCallTranscribe({
      wacid: "wacid.ABC",
      workspaceId: "ws-1",
    })

    expect(mocks.transcribe).toHaveBeenCalled()
  })
})
