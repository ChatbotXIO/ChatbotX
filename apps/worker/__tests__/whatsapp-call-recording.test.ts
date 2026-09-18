import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const FINALIZE_NOT_READY_RE = /whatsapp-call-recording-finalize-not-ready/

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  attachRecording: vi.fn(),
  releaseRecordingStamp: vi.fn(),
  bulkCreateAttachments: vi.fn(),
  hasAttachmentOfType: vi.fn(),
  findBySourceId: vi.fn(),
  updateContentBySourceId: vi.fn(),
  mergeContentAttributesBySourceId: vi.fn(),
  broadcastToWorkspaceParty: vi.fn(),
  contactInboxFindBy: vi.fn(),
  getRecordingSignedUrl: vi.fn(),
  emitCallRecorded: vi.fn(),
  callTranscriptionAdd: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock("@chatbotx.io/business", () => ({
  whatsappCallLifecycleService: {
    attachRecording: mocks.attachRecording,
    releaseRecordingStamp: mocks.releaseRecordingStamp,
  },
  broadcastToWorkspaceParty: mocks.broadcastToWorkspaceParty,
  contactInboxService: { findBy: mocks.contactInboxFindBy },
  callRecordingService: { getRecordingSignedUrl: mocks.getRecordingSignedUrl },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  whatsappCallRepository: {
    findById: mocks.findById,
  },
  createMessageRepository: vi.fn(async () => ({
    bulkCreateAttachments: mocks.bulkCreateAttachments,
    hasAttachmentOfType: mocks.hasAttachmentOfType,
    findBySourceId: mocks.findBySourceId,
    updateContentBySourceId: mocks.updateContentBySourceId,
    mergeContentAttributesBySourceId: mocks.mergeContentAttributesBySourceId,
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

const endedAt = new Date("2026-01-01T00:00:00.000Z")

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
  messageId: "msg-1",
  // `enrichCallActivityMessage` derives the sharded-message lookback window
  // from `createdAt`, so the finalize row must carry it.
  createdAt: new Date("2025-12-31T23:58:00.000Z"),
  endedAt,
}

describe("handleWhatsappCallRecordingReady", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findById.mockResolvedValue(callRow)
    mocks.attachRecording.mockResolvedValue({
      ...callRow,
      recordingPath: "space/ws-1/calls/call-1.ogg",
    })
    mocks.bulkCreateAttachments.mockResolvedValue([{ id: "att-1" }])
    mocks.hasAttachmentOfType.mockResolvedValue(false)
    mocks.releaseRecordingStamp.mockResolvedValue(undefined)
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

  test("stamps the recording by id, attaches the audio to the finalize message, emits a signed URL, and chains transcription on the dedicated queue", async () => {
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
    // Attaches the audio onto the EXISTING finalize message — never a
    // second message.
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
    mocks.attachRecording.mockResolvedValue({
      ...callRow,
      wacid: null,
      attemptId: "att-1",
      recordingPath: "space/ws-1/calls/call-1.ogg",
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

    expect(mocks.bulkCreateAttachments).not.toHaveBeenCalled()
    expect(mocks.emitCallRecorded).not.toHaveBeenCalled()
    // The transcription chain is re-enqueued (deterministic jobId → no-op
    // duplicate) so a crash between attachRecording and the enqueue can
    // never strand the call without a transcript.
    expect(mocks.callTranscriptionAdd).toHaveBeenCalledTimes(1)
  })

  test("losing the attachRecording CAS to a concurrent redelivery skips attach/enrich/emit without throwing", async () => {
    mocks.attachRecording.mockResolvedValue(undefined)

    await handleWhatsappCallRecordingReady({
      callId: "call-1",
      workspaceId: "ws-1",
      recordingPath: "space/ws-1/calls/call-1.ogg",
    })

    expect(mocks.bulkCreateAttachments).not.toHaveBeenCalled()
    expect(mocks.updateContentBySourceId).not.toHaveBeenCalled()
    expect(mocks.emitCallRecorded).not.toHaveBeenCalled()
    // Transcription is still chained — the crash-between-stamp-and-enqueue
    // guarantee is unaffected by who won the CAS.
    expect(mocks.callTranscriptionAdd).toHaveBeenCalled()
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

  test("a retry after a released stamp does not attach the audio twice", async () => {
    mocks.hasAttachmentOfType.mockResolvedValue(true)

    await handleWhatsappCallRecordingReady({
      callId: "call-1",
      workspaceId: "ws-1",
      recordingPath: "space/ws-1/calls/call-1.ogg",
    })

    expect(mocks.bulkCreateAttachments).not.toHaveBeenCalled()
    // The rest of the pipeline still runs — only the attach step is skipped.
    expect(mocks.mergeContentAttributesBySourceId).toHaveBeenCalled()
    expect(mocks.emitCallRecorded).toHaveBeenCalled()
  })

  test("a failure after the stamp releases it and rethrows, instead of marking the call recorded with nothing attached", async () => {
    mocks.emitCallRecorded.mockRejectedValueOnce(new Error("bus down"))

    await expect(
      handleWhatsappCallRecordingReady({
        callId: "call-1",
        workspaceId: "ws-1",
        recordingPath: "space/ws-1/calls/call-1.ogg",
      }),
    ).rejects.toThrow("bus down")

    expect(mocks.releaseRecordingStamp).toHaveBeenCalledWith(
      expect.objectContaining({ id: "call-1" }),
    )
  })

  describe("finalize-message race: the recording webhook's job reaches attachRecordingAndNotify before finalizeCallSideEffects wrote the message", () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    test("recovers the audio attachment via the bounded wait once the finalize message lands slightly late", async () => {
      vi.useFakeTimers()
      const pendingCall = { ...callRow, messageId: null, endedAt: null }
      mocks.findById
        .mockResolvedValueOnce(pendingCall) // top-level fetch in the handler
        .mockResolvedValueOnce(pendingCall) // waitUntilReady's first (immediate) read
        .mockResolvedValueOnce(callRow) // finalize has landed by the next read
      mocks.attachRecording.mockResolvedValue({
        ...pendingCall,
        recordingPath: "space/ws-1/calls/call-1.ogg",
      })

      const promise = handleWhatsappCallRecordingReady({
        callId: "call-1",
        workspaceId: "ws-1",
        recordingPath: "space/ws-1/calls/call-1.ogg",
      })
      await vi.advanceTimersByTimeAsync(600)
      await promise

      expect(mocks.bulkCreateAttachments).toHaveBeenCalledWith([
        expect.objectContaining({
          messageId: "msg-1",
          messageCreatedAt: endedAt,
        }),
      ])
      expect(mocks.emitCallRecorded).toHaveBeenCalled()
    })

    // Used to give up here and still stamp `recordedAt`, which made the
    // recording unreachable forever: the stamp is one-shot, so no retry
    // could ever attach the audio to the finalize message.
    test("the bounded wait running out releases the stamp and rethrows, so the retry can attach the audio", async () => {
      vi.useFakeTimers()
      const pendingCall = { ...callRow, messageId: null, endedAt: null }
      mocks.findById.mockResolvedValue(pendingCall)
      mocks.attachRecording.mockResolvedValue({
        ...pendingCall,
        recordingPath: "space/ws-1/calls/call-1.ogg",
      })

      const promise = handleWhatsappCallRecordingReady({
        callId: "call-1",
        workspaceId: "ws-1",
        recordingPath: "space/ws-1/calls/call-1.ogg",
      })
      const assertion = expect(promise).rejects.toThrow(FINALIZE_NOT_READY_RE)
      await vi.advanceTimersByTimeAsync(10_000)
      await assertion

      expect(mocks.bulkCreateAttachments).not.toHaveBeenCalled()
      expect(mocks.releaseRecordingStamp).toHaveBeenCalledWith(
        expect.objectContaining({ id: "call-1" }),
      )
    })

    // Real timers here (not fake) and no messageId on the call row, so
    // `bulkCreateAttachments`/`createId()` never runs in this test — the
    // bounded wait is only ~3.5s, so a real wait is cheap enough.
    test("throws when the finalize message never shows up, so BullMQ retries", async () => {
      mocks.findBySourceId.mockResolvedValue(null)
      mocks.findById.mockResolvedValue({
        ...callRow,
        messageId: null,
        endedAt: null,
      })
      mocks.attachRecording.mockResolvedValue({
        ...callRow,
        messageId: null,
        endedAt: null,
        recordingPath: "space/ws-1/calls/call-1.ogg",
      })

      await expect(
        handleWhatsappCallRecordingReady({
          callId: "call-1",
          workspaceId: "ws-1",
          recordingPath: "space/ws-1/calls/call-1.ogg",
        }),
      ).rejects.toThrow(FINALIZE_NOT_READY_RE)

      expect(mocks.bulkCreateAttachments).not.toHaveBeenCalled()
      expect(mocks.emitCallRecorded).not.toHaveBeenCalled()
    }, 10_000)
  })
})
