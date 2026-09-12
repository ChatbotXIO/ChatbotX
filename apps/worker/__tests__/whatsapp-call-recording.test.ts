import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  attachRecording: vi.fn(),
  createOrUpdateWithAttachments: vi.fn(),
  broadcastToWorkspaceParty: vi.fn(),
  contactInboxFindBy: vi.fn(),
  getRecordingSignedUrl: vi.fn(),
  emitCallRecorded: vi.fn(),
  callTranscriptionAdd: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock("@chatbotx.io/business", () => ({
  broadcastToWorkspaceParty: mocks.broadcastToWorkspaceParty,
  contactInboxService: { findBy: mocks.contactInboxFindBy },
  callRecordingService: { getRecordingSignedUrl: mocks.getRecordingSignedUrl },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  whatsappCallRepository: {
    findById: mocks.findById,
    attachRecording: mocks.attachRecording,
  },
  createMessageRepository: vi.fn(async () => ({
    createOrUpdateWithAttachments: mocks.createOrUpdateWithAttachments,
  })),
}))

vi.mock("@chatbotx.io/events", () => ({
  emitCallRecorded: mocks.emitCallRecorded,
  setWebhookExecutionContext: vi.fn(),
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  callTranscriptionJobId: (callId: string) => `transcribe-${callId}`,
  callTranscriptionQueue: { add: mocks.callTranscriptionAdd },
}))

vi.mock("../src/lib/logger", () => ({
  logger: mocks.logger,
}))

const { handleWhatsappCallRecordingReady } = await import(
  "../src/integration/handlers/whatsapp-call-recording"
)

const callRow = {
  id: "call-1",
  wacid: "wacid.ABC",
  attemptId: null as string | null,
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
    mocks.findById.mockResolvedValue(callRow)
    mocks.attachRecording.mockResolvedValue({
      ...callRow,
      recordingPath: "space/ws-1/calls/call-1.ogg",
    })
    mocks.createOrUpdateWithAttachments.mockResolvedValue({
      isNew: true,
      result: { id: "msg-1", createdAt: new Date(), attachments: [] },
    })
    mocks.getRecordingSignedUrl.mockResolvedValue(
      "https://signed.example.com/space/ws-1/calls/call-1.ogg?sig=abc",
    )
    mocks.contactInboxFindBy.mockResolvedValue({
      id: "ci-1",
      contactId: "contact-1",
    })
  })

  test("stamps the recording by id, drops the audio message, emits a signed URL, and chains transcription on the dedicated queue", async () => {
    await handleWhatsappCallRecordingReady({
      callId: "call-1",
      workspaceId: "ws-1",
      recordingPath: "space/ws-1/calls/call-1.ogg",
      sizeBytes: 1234,
    })

    expect(mocks.attachRecording).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "call-1",
        recordingPath: "space/ws-1/calls/call-1.ogg",
      }),
    )
    expect(mocks.createOrUpdateWithAttachments).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: "wacall-rec-call-1",
        messageType: "activity",
        senderType: "system",
      }),
      [
        expect.objectContaining({
          fileType: "audio",
          originPath: "space/ws-1/calls/call-1.ogg",
        }),
      ],
    )
    // External correlation is the wacid/attemptId, never the DB id.
    expect(mocks.emitCallRecorded).toHaveBeenCalledWith("ws-1", "contact-1", {
      callId: "wacid.ABC",
      recordingUrl:
        "https://signed.example.com/space/ws-1/calls/call-1.ogg?sig=abc",
    })
    // Enqueued on the dedicated, rate-limited callTranscription queue —
    // never the shared integration queue.
    expect(mocks.callTranscriptionAdd).toHaveBeenCalledWith(
      "transcribeCall",
      expect.objectContaining({
        data: { channel: "whatsapp", callId: "call-1", workspaceId: "ws-1" },
      }),
      { jobId: "transcribe-call-1" },
    )
  })

  test("falls back to the DB id as correlationId for an outbound call with no wacid yet", async () => {
    mocks.findById.mockResolvedValue({
      ...callRow,
      wacid: null,
      attemptId: "att-1",
    })

    await handleWhatsappCallRecordingReady({
      callId: "call-1",
      workspaceId: "ws-1",
      recordingPath: "space/ws-1/calls/call-1.ogg",
    })

    expect(mocks.emitCallRecorded).toHaveBeenCalledWith(
      "ws-1",
      "contact-1",
      expect.objectContaining({ callId: "att-1" }),
    )
  })

  test("redelivery after post-processing completed is a no-op", async () => {
    mocks.findById.mockResolvedValue({
      ...callRow,
      recordingPath: "space/ws-1/calls/call-1.ogg",
      recordedAt: new Date(),
    })

    await handleWhatsappCallRecordingReady({
      callId: "call-1",
      workspaceId: "ws-1",
      recordingPath: "space/ws-1/calls/call-1.ogg",
    })

    expect(mocks.createOrUpdateWithAttachments).not.toHaveBeenCalled()
    expect(mocks.emitCallRecorded).not.toHaveBeenCalled()
    // The transcription chain is re-enqueued (deterministic jobId → no-op
    // duplicate) so a crash between attachRecording and the enqueue can
    // never strand the call without a transcript.
    expect(mocks.callTranscriptionAdd).toHaveBeenCalledTimes(1)
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
      callId: "call-1",
      workspaceId: "ws-1",
      recordingPath: "space/ws-1/calls/call-1.ogg",
    })

    expect(mocks.broadcastToWorkspaceParty).not.toHaveBeenCalled()
    expect(mocks.emitCallRecorded).not.toHaveBeenCalled()
    expect(mocks.callTranscriptionAdd).toHaveBeenCalled()
    expect(mocks.attachRecording).toHaveBeenCalled()
  })

  test("no public URL is ever emitted — only signed reads", async () => {
    await handleWhatsappCallRecordingReady({
      callId: "call-1",
      workspaceId: "ws-1",
      recordingPath: "space/ws-1/calls/call-1.ogg",
    })

    expect(mocks.getRecordingSignedUrl).toHaveBeenCalledWith({
      recordingPath: "space/ws-1/calls/call-1.ogg",
    })
  })
})
