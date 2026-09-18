import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  findByWacid: vi.fn(),
  attachTranscript: vi.fn(),
  contactInboxFindBy: vi.fn(),
  emitCallTranscribed: vi.fn(),
  resolveVoipAuthByInboxId: vi.fn(),
  downloadCallMedia: vi.fn(),
  enrichRecordingMessageWithTranscript: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock("@chatbotx.io/business", () => ({
  whatsappCallLifecycleService: { attachTranscript: mocks.attachTranscript },
  contactInboxService: { findBy: mocks.contactInboxFindBy },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  whatsappCallRepository: {
    findById: mocks.findById,
    findByWacid: mocks.findByWacid,
  },
}))

vi.mock("@chatbotx.io/events", () => ({
  emitCallTranscribed: mocks.emitCallTranscribed,
  setWebhookExecutionContext: vi.fn(),
}))

vi.mock("../src/integration/handlers/whatsapp-voip-signaling", () => ({
  resolveVoipAuthByInboxId: mocks.resolveVoipAuthByInboxId,
}))

vi.mock(
  "../src/integration/handlers/shared/whatsapp-call-native-media",
  () => ({
    downloadCallMedia: mocks.downloadCallMedia,
    WhatsappCallMediaGoneError: class WhatsappCallMediaGoneError extends Error {},
    AttachmentTooLargeError: class AttachmentTooLargeError extends Error {},
    WhatsappCallRowNotReadyError: class WhatsappCallRowNotReadyError extends Error {
      constructor(wacid: string) {
        super(`whatsapp-call-row-not-ready: ${wacid}`)
        this.name = "WhatsappCallRowNotReadyError"
      }
    },
  }),
)

vi.mock(
  "../src/integration/handlers/shared/whatsapp-call-recording-enrichment",
  () => ({
    enrichRecordingMessageWithTranscript:
      mocks.enrichRecordingMessageWithTranscript,
  }),
)

vi.mock("../src/integration/handlers/whatsapp-call-recording", () => ({
  externalCorrelationId: (call: {
    wacid: string | null
    attemptId: string | null
    id: string
  }) => call.wacid ?? call.attemptId ?? call.id,
}))

vi.mock("../src/lib/logger", () => ({
  logger: mocks.logger,
}))

const isBlockedWorkspaceMock = vi.hoisted(() => vi.fn())
vi.mock("../src/lib/is-blocked-workspace", () => ({
  isBlockedWorkspace: isBlockedWorkspaceMock,
}))

const { handleWhatsappCallNativeTranscriptFetch } = await import(
  "../src/integration/handlers/whatsapp-call-native-transcript"
)
const { WhatsappCallMediaGoneError: MockMediaGoneError } = await import(
  "../src/integration/handlers/shared/whatsapp-call-native-media"
)

const callRow = {
  id: "call-1",
  wacid: "wacid.ABC",
  attemptId: null as string | null,
  workspaceId: "ws-1",
  inboxId: "inbox-1",
  contactInboxId: "ci-1",
  conversationId: "conv-1",
  recordingPath: "space/ws-1/calls/call-1.ogg",
  recordedAt: new Date(),
  transcript: null as string | null,
}

const jobData = {
  whatsappCallId: "call-1",
  wacid: "wacid.ABC",
  workspaceId: "ws-1",
  documentMediaId: "doc-media-1",
  documentUrl: "https://lookaside.example.com/transcript.json",
}

const documentWith = (transcript: unknown): { bytes: ArrayBuffer } => {
  const text = JSON.stringify({ transcript })
  const encoded = new TextEncoder().encode(text)
  return { bytes: encoded.buffer.slice(0) }
}

describe("handleWhatsappCallNativeTranscriptFetch", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isBlockedWorkspaceMock.mockResolvedValue(false)
    mocks.findById.mockResolvedValue(callRow)
    mocks.resolveVoipAuthByInboxId.mockResolvedValue({
      tokens: { accessToken: "token-1" },
    })
    mocks.attachTranscript.mockResolvedValue({ id: "call-1" })
    mocks.contactInboxFindBy.mockResolvedValue({
      id: "ci-1",
      contactId: "contact-1",
    })
  })

  test("downloads, parses diarized segments, stamps attachTranscript with segments, and emits callTranscribed", async () => {
    mocks.downloadCallMedia.mockResolvedValue(
      documentWith({
        text: "Hello there. Doing well, thanks.",
        language: "en",
        // Meta sends the segment id as an INTEGER — the schema must accept it
        // (a string-only `id` dropped every real transcript as "malformed").
        segments: [
          {
            id: 1,
            speaker: "Business",
            channel: 0,
            start: 0,
            end: 1.2,
            text: "Hello there.",
          },
          {
            id: 2,
            speaker: "Customer",
            channel: 1,
            start: 1.3,
            end: 2.5,
            text: "Doing well, thanks.",
          },
        ],
      }),
    )

    await handleWhatsappCallNativeTranscriptFetch(jobData)

    expect(mocks.resolveVoipAuthByInboxId).toHaveBeenCalledWith("inbox-1")
    expect(mocks.downloadCallMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaId: "doc-media-1",
        url: "https://lookaside.example.com/transcript.json",
      }),
    )
    expect(mocks.attachTranscript).toHaveBeenCalledWith({
      id: "call-1",
      transcript: "Hello there. Doing well, thanks.",
      transcribedAt: expect.any(Date),
      segments: [
        {
          speaker: "Business",
          channel: 0,
          start: 0,
          end: 1.2,
          text: "Hello there.",
        },
        {
          speaker: "Customer",
          channel: 1,
          start: 1.3,
          end: 2.5,
          text: "Doing well, thanks.",
        },
      ],
    })
    expect(mocks.enrichRecordingMessageWithTranscript).toHaveBeenCalledWith({
      call: callRow,
    })
    expect(mocks.emitCallTranscribed).toHaveBeenCalledWith(
      "ws-1",
      "contact-1",
      {
        callId: "wacid.ABC",
        transcript: "Hello there. Doing well, thanks.",
      },
    )
  })

  test("falls back to concatenating segment text when transcript.text is absent", async () => {
    mocks.downloadCallMedia.mockResolvedValue(
      documentWith({
        segments: [
          { start: 0, end: 1, text: "First." },
          { start: 1, end: 2, text: "Second." },
        ],
      }),
    )

    await handleWhatsappCallNativeTranscriptFetch(jobData)

    expect(mocks.attachTranscript).toHaveBeenCalledWith(
      expect.objectContaining({ transcript: "First. Second." }),
    )
  })

  test("empty-segments case (unsupported language): still persists distinct empty segments + flat empty transcript, and still notifies", async () => {
    mocks.downloadCallMedia.mockResolvedValue(
      documentWith({ text: "", language: "unsupported", segments: [] }),
    )

    await handleWhatsappCallNativeTranscriptFetch(jobData)

    expect(mocks.attachTranscript).toHaveBeenCalledWith({
      id: "call-1",
      transcript: "",
      transcribedAt: expect.any(Date),
      segments: [],
    })
    expect(mocks.enrichRecordingMessageWithTranscript).toHaveBeenCalledWith({
      call: callRow,
    })
    expect(mocks.emitCallTranscribed).toHaveBeenCalledWith(
      "ws-1",
      "contact-1",
      {
        callId: "wacid.ABC",
        transcript: "",
      },
    )
  })

  test("empty-segments case with `segments` entirely absent from the document is treated the same as an empty array", async () => {
    mocks.downloadCallMedia.mockResolvedValue(documentWith({ text: "" }))

    await handleWhatsappCallNativeTranscriptFetch(jobData)

    expect(mocks.attachTranscript).toHaveBeenCalledWith(
      expect.objectContaining({ segments: [] }),
    )
  })

  test("is idempotent on redelivery: a non-null transcript (including a previously-persisted empty string) skips re-fetching", async () => {
    mocks.findById.mockResolvedValue({ ...callRow, transcript: "" })

    await handleWhatsappCallNativeTranscriptFetch(jobData)

    expect(mocks.resolveVoipAuthByInboxId).not.toHaveBeenCalled()
    expect(mocks.downloadCallMedia).not.toHaveBeenCalled()
    expect(mocks.attachTranscript).not.toHaveBeenCalled()
  })

  test("call row not found yet (neither by id nor by wacid) throws a retryable error instead of dropping the event", async () => {
    mocks.findById.mockResolvedValue(undefined)
    mocks.findByWacid.mockResolvedValue(undefined)

    await expect(
      handleWhatsappCallNativeTranscriptFetch(jobData),
    ).rejects.toThrow("whatsapp-call-row-not-ready")

    expect(mocks.downloadCallMedia).not.toHaveBeenCalled()
  })

  test("a job without workspaceId (enqueued before the row existed) skips a blocked workspace once the row resolves", async () => {
    mocks.findByWacid.mockResolvedValue(callRow)
    isBlockedWorkspaceMock.mockResolvedValue(true)

    await handleWhatsappCallNativeTranscriptFetch({
      ...jobData,
      whatsappCallId: undefined,
      workspaceId: undefined,
    })

    expect(isBlockedWorkspaceMock).toHaveBeenCalledWith("ws-1")
    expect(mocks.downloadCallMedia).not.toHaveBeenCalled()
  })

  test("no whatsappCallId in the job data resolves the row by wacid instead", async () => {
    mocks.findByWacid.mockResolvedValue(callRow)

    await handleWhatsappCallNativeTranscriptFetch({
      ...jobData,
      whatsappCallId: undefined,
    })

    expect(mocks.findById).not.toHaveBeenCalled()
    expect(mocks.findByWacid).toHaveBeenCalledWith("wacid.ABC")
    expect(mocks.downloadCallMedia).toHaveBeenCalled()
  })

  test("media gone: logs and returns without throwing or retrying", async () => {
    mocks.downloadCallMedia.mockRejectedValue(new MockMediaGoneError("gone"))

    await expect(
      handleWhatsappCallNativeTranscriptFetch(jobData),
    ).resolves.toBeUndefined()

    expect(mocks.attachTranscript).not.toHaveBeenCalled()
  })

  test("a transient download failure throws so BullMQ retries", async () => {
    mocks.downloadCallMedia.mockRejectedValue(new Error("network blip"))

    await expect(
      handleWhatsappCallNativeTranscriptFetch(jobData),
    ).rejects.toThrow("network blip")

    expect(mocks.attachTranscript).not.toHaveBeenCalled()
  })

  test("a malformed document is skipped (logged, no throw) rather than retried forever", async () => {
    const text = JSON.stringify({ not: "a transcript document" })
    mocks.downloadCallMedia.mockResolvedValue({
      bytes: new TextEncoder().encode(text).buffer.slice(0),
    })

    await expect(
      handleWhatsappCallNativeTranscriptFetch(jobData),
    ).resolves.toBeUndefined()

    expect(mocks.attachTranscript).not.toHaveBeenCalled()
    expect(mocks.logger.error).toHaveBeenCalled()
  })

  test("attachTranscript losing its CAS race (already stamped by a concurrent redelivery) does not double-notify", async () => {
    mocks.downloadCallMedia.mockResolvedValue(
      documentWith({ text: "hi", segments: [] }),
    )
    mocks.attachTranscript.mockResolvedValue(undefined)

    await handleWhatsappCallNativeTranscriptFetch(jobData)

    expect(mocks.enrichRecordingMessageWithTranscript).not.toHaveBeenCalled()
    expect(mocks.emitCallTranscribed).not.toHaveBeenCalled()
  })

  test("never chains SIP/Whisper transcription logic — this handler has no AI/audio dependency", async () => {
    mocks.downloadCallMedia.mockResolvedValue(documentWith({ text: "hi" }))

    await handleWhatsappCallNativeTranscriptFetch(jobData)

    expect(mocks.attachTranscript).toHaveBeenCalledTimes(1)
  })
})
