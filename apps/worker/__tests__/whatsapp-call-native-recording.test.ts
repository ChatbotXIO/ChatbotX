import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  attachRecording: vi.fn(),
  bulkCreateAttachments: vi.fn(),
  findBySourceId: vi.fn(),
  updateContentBySourceId: vi.fn(),
  mergeContentAttributesBySourceId: vi.fn(),
  broadcastToWorkspaceParty: vi.fn(),
  contactInboxFindBy: vi.fn(),
  getRecordingSignedUrl: vi.fn(),
  uploadRecording: vi.fn(),
  emitCallRecorded: vi.fn(),
  resolveVoipAuthByInboxId: vi.fn(),
  downloadCallMedia: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock("@chatbotx.io/business", () => ({
  broadcastToWorkspaceParty: mocks.broadcastToWorkspaceParty,
  contactInboxService: { findBy: mocks.contactInboxFindBy },
  callRecordingService: {
    getRecordingSignedUrl: mocks.getRecordingSignedUrl,
    uploadRecording: mocks.uploadRecording,
  },
  isAllowedRecordingContentType: (value: string) =>
    ["audio/ogg", "audio/webm", "audio/mp4", "audio/mpeg"].includes(value),
  DEFAULT_RECORDING_CONTENT_TYPE: "audio/ogg",
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  whatsappCallRepository: {
    findById: mocks.findById,
    attachRecording: mocks.attachRecording,
  },
  integrationWhatsappRepository: {
    findByInboxIdForWorkspace: vi.fn(async () => ({
      callTranscriptionEnabled: false,
    })),
  },
  createMessageRepository: vi.fn(async () => ({
    bulkCreateAttachments: mocks.bulkCreateAttachments,
    findBySourceId: mocks.findBySourceId,
    updateContentBySourceId: mocks.updateContentBySourceId,
    mergeContentAttributesBySourceId: mocks.mergeContentAttributesBySourceId,
  })),
}))

vi.mock("@chatbotx.io/events", () => ({
  emitCallRecorded: mocks.emitCallRecorded,
  setWebhookExecutionContext: vi.fn(),
}))

vi.mock("../src/integration/handlers/whatsapp-voip-signaling", () => ({
  resolveVoipAuthByInboxId: mocks.resolveVoipAuthByInboxId,
}))

// `whatsapp-call-recording.ts` (the shared `attachRecordingAndNotify` this
// handler reuses) also imports the transcription queue for the SIP chaining
// path — mocked here purely so the real BullMQ queue never gets
// instantiated in this unit test; this handler never touches it.
vi.mock("@chatbotx.io/worker-config", () => ({
  callTranscriptionJobId: (callId: string) => `transcribe-${callId}`,
  callTranscriptionQueue: { add: vi.fn() },
}))

vi.mock(
  "../src/integration/handlers/shared/whatsapp-call-native-media",
  () => ({
    downloadCallMedia: mocks.downloadCallMedia,
    WhatsappCallMediaGoneError: class WhatsappCallMediaGoneError extends Error {},
    AttachmentTooLargeError: class AttachmentTooLargeError extends Error {},
  }),
)

vi.mock("../src/lib/logger", () => ({
  logger: mocks.logger,
}))

const { handleWhatsappCallNativeRecordingFetch } = await import(
  "../src/integration/handlers/whatsapp-call-native-recording"
)
const {
  WhatsappCallMediaGoneError: MockMediaGoneError,
  AttachmentTooLargeError: MockTooLargeError,
} = await import(
  "../src/integration/handlers/shared/whatsapp-call-native-media"
)

const endedAt = new Date("2026-01-01T00:00:00.000Z")

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
  recordedAt: null as Date | null,
  transcript: null as string | null,
  messageId: "msg-1",
  createdAt: new Date("2025-12-31T23:58:00.000Z"),
  endedAt,
}

const jobData = {
  whatsappCallId: "call-1",
  wacid: "wacid.ABC",
  workspaceId: "ws-1",
  audioMediaId: "media-1",
  audioUrl: "https://lookaside.example.com/audio.ogg",
  mimeType: "audio/ogg; codecs=opus",
}

describe("handleWhatsappCallNativeRecordingFetch", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findById.mockResolvedValue(callRow)
    mocks.resolveVoipAuthByInboxId.mockResolvedValue({
      tokens: { accessToken: "token-1" },
    })
    mocks.downloadCallMedia.mockResolvedValue({
      bytes: new ArrayBuffer(8),
      mimeType: "audio/ogg; codecs=opus",
      size: 8,
    })
    mocks.uploadRecording.mockResolvedValue({
      recordingPath: "space/ws-1/calls/call-1.ogg",
    })
    mocks.attachRecording.mockResolvedValue({
      ...callRow,
      recordingPath: "space/ws-1/calls/call-1.ogg",
    })
    mocks.bulkCreateAttachments.mockResolvedValue([{ id: "att-1" }])
    mocks.findBySourceId.mockResolvedValue({
      id: "msg-1",
      contentAttributes: {
        type: "whatsapp_call",
        direction: "userInitiated",
        status: "completed",
        callId: "call-1",
        hasRecording: false,
        transcriptionRequested: false,
        hasTranscript: false,
        hasSummary: false,
        recordingExpired: false,
      },
    })
    mocks.updateContentBySourceId.mockResolvedValue({ id: "msg-1" })
    mocks.mergeContentAttributesBySourceId.mockResolvedValue({
      id: "msg-1",
      contentAttributes: {
        type: "whatsapp_call",
        direction: "userInitiated",
        status: "completed",
        callId: "call-1",
        hasRecording: true,
        transcriptionRequested: false,
        hasTranscript: false,
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

  test("downloads via the media-id path, stores the recording, and enriches the finalize activity message in place", async () => {
    await handleWhatsappCallNativeRecordingFetch(jobData)

    expect(mocks.resolveVoipAuthByInboxId).toHaveBeenCalledWith("inbox-1")
    expect(mocks.downloadCallMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaId: "media-1",
        url: "https://lookaside.example.com/audio.ogg",
        fallbackMime: "audio/ogg; codecs=opus",
      }),
    )
    expect(mocks.uploadRecording).toHaveBeenCalledWith({
      callId: "call-1",
      workspaceId: "ws-1",
      body: expect.any(Uint8Array),
      // The webhook mime type carries codec params; the allow-list only
      // knows the base type.
      contentType: "audio/ogg",
    })
    expect(mocks.attachRecording).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "call-1",
        recordingPath: "space/ws-1/calls/call-1.ogg",
      }),
    )
    // Attaches to the SAME finalize message — never a second message.
    expect(mocks.bulkCreateAttachments).toHaveBeenCalledWith([
      expect.objectContaining({
        fileType: "audio",
        originPath: "space/ws-1/calls/call-1.ogg",
        messageId: "msg-1",
        messageCreatedAt: endedAt,
      }),
    ])
    expect(mocks.mergeContentAttributesBySourceId).toHaveBeenCalledWith(
      "wacall-call-1",
      "ws-1",
      { hasRecording: true },
    )
    expect(mocks.emitCallRecorded).toHaveBeenCalledWith("ws-1", "contact-1", {
      callId: "wacid.ABC",
      recordingUrl:
        "https://signed.example.com/space/ws-1/calls/call-1.ogg?sig=abc",
    })
  })

  test("falls back to the DEFAULT content type for a mime type outside the allow-list", async () => {
    mocks.downloadCallMedia.mockResolvedValue({
      bytes: new ArrayBuffer(4),
      mimeType: "audio/x-unknown",
      size: 4,
    })

    await handleWhatsappCallNativeRecordingFetch(jobData)

    expect(mocks.uploadRecording).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: "audio/ogg" }),
    )
  })

  test("is idempotent on redelivery: recordedAt already set skips the whole pipeline", async () => {
    mocks.findById.mockResolvedValue({
      ...callRow,
      recordedAt: new Date(),
      recordingPath: "space/ws-1/calls/call-1.ogg",
    })

    await handleWhatsappCallNativeRecordingFetch(jobData)

    expect(mocks.resolveVoipAuthByInboxId).not.toHaveBeenCalled()
    expect(mocks.downloadCallMedia).not.toHaveBeenCalled()
    expect(mocks.uploadRecording).not.toHaveBeenCalled()
    expect(mocks.bulkCreateAttachments).not.toHaveBeenCalled()
    expect(mocks.emitCallRecorded).not.toHaveBeenCalled()
  })

  test("loses the attachRecording CAS: skips attachment/enrichment/emit without throwing", async () => {
    mocks.attachRecording.mockResolvedValue(undefined)

    await expect(
      handleWhatsappCallNativeRecordingFetch(jobData),
    ).resolves.toBeUndefined()

    expect(mocks.bulkCreateAttachments).not.toHaveBeenCalled()
    expect(mocks.updateContentBySourceId).not.toHaveBeenCalled()
    expect(mocks.emitCallRecorded).not.toHaveBeenCalled()
  })

  test("call row not found: logs and returns without throwing", async () => {
    mocks.findById.mockResolvedValue(undefined)

    await expect(
      handleWhatsappCallNativeRecordingFetch(jobData),
    ).resolves.toBeUndefined()

    expect(mocks.downloadCallMedia).not.toHaveBeenCalled()
    expect(mocks.logger.warn).toHaveBeenCalled()
  })

  test("media gone (past Meta's 7-day retention): logs and returns without throwing or retrying", async () => {
    mocks.downloadCallMedia.mockRejectedValue(new MockMediaGoneError("gone"))

    await expect(
      handleWhatsappCallNativeRecordingFetch(jobData),
    ).resolves.toBeUndefined()

    expect(mocks.uploadRecording).not.toHaveBeenCalled()
    expect(mocks.attachRecording).not.toHaveBeenCalled()
  })

  test("oversized recording: logs and returns without throwing (permanent, not retryable)", async () => {
    mocks.downloadCallMedia.mockRejectedValue(new MockTooLargeError("too big"))

    await expect(
      handleWhatsappCallNativeRecordingFetch(jobData),
    ).resolves.toBeUndefined()

    expect(mocks.uploadRecording).not.toHaveBeenCalled()
  })

  test("a transient download failure throws so BullMQ retries within the 7-day window", async () => {
    mocks.downloadCallMedia.mockRejectedValue(new Error("network blip"))

    await expect(
      handleWhatsappCallNativeRecordingFetch(jobData),
    ).rejects.toThrow("network blip")

    expect(mocks.uploadRecording).not.toHaveBeenCalled()
  })

  test("never chains SIP-style Whisper transcription — the native transcript arrives via its own job", async () => {
    await handleWhatsappCallNativeRecordingFetch(jobData)

    // No callTranscription queue dependency at all in this handler.
    expect(mocks.bulkCreateAttachments).toHaveBeenCalledTimes(1)
  })
})
