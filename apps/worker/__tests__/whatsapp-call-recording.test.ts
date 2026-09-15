import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const ENRICHMENT_PENDING_RE = /whatsapp-call-enrichment-pending/

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

  describe("finalize-message race (B4): the recording webhook's job reaches attachRecordingAndNotify before finalizeCallSideEffects wrote the message", () => {
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

    test("gives up attaching the audio (but still enriches/emits) once the bounded wait is exhausted", async () => {
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
      await vi.advanceTimersByTimeAsync(10_000)
      await promise

      expect(mocks.bulkCreateAttachments).not.toHaveBeenCalled()
      expect(mocks.logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ callId: "call-1" }),
        expect.stringContaining("still not found after bounded wait"),
      )
      // The enrichment flag/emit still complete independently — this test's
      // `findBySourceId` mock (set in beforeEach) resolves the finalize
      // message immediately, unaffected by the attachment-side wait above.
      expect(mocks.mergeContentAttributesBySourceId).toHaveBeenCalled()
      expect(mocks.emitCallRecorded).toHaveBeenCalled()
    })

    // Real timers here (not fake) and no messageId on the call row, so
    // `bulkCreateAttachments`/`createId()` never runs in this test — the
    // bounded wait is only ~3.5s, so a real wait is cheap enough.
    test("throws WhatsappCallEnrichmentPendingError when the finalize message never shows up, so BullMQ retries", async () => {
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
      ).rejects.toThrow(ENRICHMENT_PENDING_RE)

      expect(mocks.bulkCreateAttachments).not.toHaveBeenCalled()
      expect(mocks.emitCallRecorded).not.toHaveBeenCalled()
    }, 10_000)
  })
})
