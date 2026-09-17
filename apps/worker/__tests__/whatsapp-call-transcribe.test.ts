import { beforeEach, describe, expect, test, vi } from "vitest"

const ENRICHMENT_PENDING_RE = /whatsapp-call-enrichment-pending/

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
  broadcastToWorkspaceParty: vi.fn(),
  findBySourceId: vi.fn(),
  updateContentBySourceId: vi.fn(),
  mergeContentAttributesBySourceId: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock("@chatbotx.io/business", () => ({
  whatsappCallLifecycleService: { attachTranscript: mocks.attachTranscript },
  contactInboxService: { findBy: mocks.contactInboxFindBy },
  callRecordingService: { getRecordingSignedUrl: mocks.getRecordingSignedUrl },
  broadcastToWorkspaceParty: mocks.broadcastToWorkspaceParty,
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  whatsappCallRepository: {
    findById: mocks.findById,
  },
  integrationWhatsappRepository: {
    findByInboxIdForWorkspace: mocks.findByInboxIdForWorkspace,
  },
  createMessageRepository: vi.fn(async () => ({
    findBySourceId: mocks.findBySourceId,
    updateContentBySourceId: mocks.updateContentBySourceId,
    mergeContentAttributesBySourceId: mocks.mergeContentAttributesBySourceId,
  })),
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
  conversationId: "conv-1",
  direction: "userInitiated" as const,
  recordingPath: null as string | null,
  transcript: null as string | null,
  recordedAt: null as Date | null,
  // `enrichCallActivityMessage` derives the sharded-message lookback window
  // from `createdAt`, so the finalize row must carry it.
  createdAt: new Date("2025-12-31T23:58:00.000Z"),
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
      callRecordingEnabled: true,
      callTranscriptionEnabled: true,
    })
    mocks.aiFindBy.mockResolvedValue({ id: "ai-1" })
    mocks.kyGet.mockReturnValue({
      arrayBuffer: async () => new ArrayBuffer(8),
    })
    mocks.transcribe.mockResolvedValue({ text: "hello from the call" })
    mocks.attachTranscript.mockResolvedValue({ id: "call-1" })
    mocks.findBySourceId.mockResolvedValue({
      id: "message-1",
      contentAttributes: {
        type: "whatsapp_call",
        direction: "userInitiated",
        status: "completed",
        callId: "call-1",
        hasRecording: true,
        transcriptionRequested: true,
        hasTranscript: false,
        hasSummary: false,
        recordingExpired: false,
      },
    })
    mocks.updateContentBySourceId.mockResolvedValue({ id: "message-1" })
    mocks.mergeContentAttributesBySourceId.mockResolvedValue({
      id: "message-1",
      contentAttributes: {
        type: "whatsapp_call",
        direction: "userInitiated",
        status: "completed",
        callId: "call-1",
        hasRecording: true,
        transcriptionRequested: true,
        hasTranscript: true,
        hasSummary: false,
        recordingExpired: false,
      },
    })
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

  test("skipped when the number has since stopped recording calls, even with transcription still on", async () => {
    mocks.findByInboxIdForWorkspace.mockResolvedValue({
      id: "iw-1",
      callRecordingEnabled: false,
      callTranscriptionEnabled: true,
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

  describe("finalize activity message enrichment", () => {
    test("enriches the finalize message in place (hasTranscript: true) by sourceId and broadcasts the update", async () => {
      await call({ channel: "whatsapp", callId: "call-1", workspaceId: "ws-1" })

      expect(mocks.mergeContentAttributesBySourceId).toHaveBeenCalledWith(
        "wacall-call-1",
        "ws-1",
        { hasTranscript: true },
      )
      expect(mocks.broadcastToWorkspaceParty).toHaveBeenCalledWith("ws-1", {
        eventType: "messageContentUpdated",
        data: {
          messageId: "message-1",
          contentAttributes: expect.objectContaining({
            hasTranscript: true,
          }),
        },
      })
    })

    // Behavior change: the shared `enrichCallActivityMessage` used to
    // silently skip and let the job "succeed" when the finalize message
    // hadn't landed yet — losing the `hasTranscript` flag forever, since
    // this handler's own `call.transcript` CAS guard means a caller-level
    // BullMQ retry never re-reaches this code path. It now throws
    // `WhatsappCallEnrichmentPendingError` after a bounded in-process wait
    // so the failure is at least observable, propagating through this
    // handler's own catch-and-rethrow — `callTranscribed` is never emitted
    // on this path since enrichment runs before it.
    test("throws (and never emits callTranscribed) when the finalize message never shows up after the bounded wait", async () => {
      mocks.findBySourceId.mockResolvedValue(null)

      await expect(
        call({ channel: "whatsapp", callId: "call-1", workspaceId: "ws-1" }),
      ).rejects.toThrow(ENRICHMENT_PENDING_RE)

      expect(mocks.mergeContentAttributesBySourceId).not.toHaveBeenCalled()
      expect(mocks.emitCallTranscribed).not.toHaveBeenCalled()
    }, 10_000)

    test("a broadcast failure is swallowed and does not fail the job or block callTranscribed", async () => {
      mocks.broadcastToWorkspaceParty.mockRejectedValueOnce(
        new Error("realtime down"),
      )

      await expect(
        call({ channel: "whatsapp", callId: "call-1", workspaceId: "ws-1" }),
      ).resolves.toBeUndefined()

      expect(mocks.emitCallTranscribed).toHaveBeenCalled()
    })
  })
})
