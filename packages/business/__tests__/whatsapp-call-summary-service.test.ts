import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  attachAiSummary: vi.fn(),
  overwriteAiSummary: vi.fn(),
  findNameAndEmail: vi.fn(),
  workspaceFind: vi.fn(),
  contactInboxFindBy: vi.fn(),
  contactFindById: vi.fn(),
  messageRepositoryFindBySourceId: vi.fn(),
  messageRepositoryUpdateContentBySourceId: vi.fn(),
  messageRepositoryMergeContentAttributesBySourceId: vi.fn(),
  createMessageRepository: vi.fn(),
  broadcastToWorkspaceParty: vi.fn(),
  runExclusive: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  whatsappCallRepository: {
    findByIdForWorkspace: mocks.findById,
    attachAiSummary: mocks.attachAiSummary,
    overwriteAiSummary: mocks.overwriteAiSummary,
  },
  createMessageRepository: mocks.createMessageRepository,
}))

class MockLockAcquisitionError extends Error {}

vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: { runExclusive: mocks.runExclusive },
  LockAcquisitionError: MockLockAcquisitionError,
}))

vi.mock("../src/user/service", () => ({
  userService: { findNameAndEmail: mocks.findNameAndEmail },
}))

vi.mock("../src/workspace/service", () => ({
  workspaceService: { find: mocks.workspaceFind },
}))

vi.mock("../src/contact-inbox/service", () => ({
  contactInboxService: { findBy: mocks.contactInboxFindBy },
}))

vi.mock("../src/contact/service", () => ({
  contactService: { findById: mocks.contactFindById },
}))

vi.mock("../src/platform/realtime-broadcast", () => ({
  broadcastToWorkspaceParty: mocks.broadcastToWorkspaceParty,
}))

const { whatsappCallTranscriptService, whatsappCallSummaryService } =
  await import("../src/whatsapp-call/call-summary-service")

const baseCall = {
  id: "call-1",
  workspaceId: "ws-1",
  conversationId: "conv-1",
  contactInboxId: "contact-inbox-1",
  direction: "userInitiated" as const,
  answeredByUserId: "agent-1",
  initiatedByUserId: null,
  transcriptSegments: null,
  transcript: null,
  aiSummary: null,
  aiSummaryProvider: null,
  aiSummarizedAt: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.contactInboxFindBy.mockResolvedValue({ contactId: "contact-1" })
  mocks.contactFindById.mockResolvedValue({
    fullName: "Ada Lovelace",
    phoneNumber: "+15551234567",
  })
  mocks.findNameAndEmail.mockResolvedValue({ name: "Agent Smith" })
  mocks.workspaceFind.mockResolvedValue({ name: "Acme Workspace" })
  mocks.createMessageRepository.mockResolvedValue({
    findBySourceId: mocks.messageRepositoryFindBySourceId,
    updateContentBySourceId: mocks.messageRepositoryUpdateContentBySourceId,
    mergeContentAttributesBySourceId:
      mocks.messageRepositoryMergeContentAttributesBySourceId,
  })
  mocks.messageRepositoryFindBySourceId.mockResolvedValue(null)
  mocks.messageRepositoryMergeContentAttributesBySourceId.mockResolvedValue(
    null,
  )
  // Non-blocking lock: run `fn` immediately, as if it always won the lock.
  mocks.runExclusive.mockImplementation(
    async ({ fn }: { fn: () => Promise<unknown> }) => await fn(),
  )
})

describe("whatsappCallTranscriptService.getTranscriptForCall", () => {
  test("empty segments is a valid unavailable result, not an error", async () => {
    mocks.findById.mockResolvedValue({ ...baseCall, transcriptSegments: [] })

    const result = await whatsappCallTranscriptService.getTranscriptForCall({
      callId: "call-1",
      workspaceId: "ws-1",
    })

    expect(result.segments).toEqual([])
    expect(result.hasSpeakers).toBe(false)
  })

  test("maps Business -> the answering agent for an inbound call, Customer -> the contact", async () => {
    mocks.findById.mockResolvedValue({
      ...baseCall,
      direction: "userInitiated",
      answeredByUserId: "agent-1",
      transcriptSegments: [
        { speaker: "Business", start: 0, end: 2, text: "Hello" },
        { speaker: "Customer", start: 2, end: 4, text: "Hi there" },
      ],
    })

    const result = await whatsappCallTranscriptService.getTranscriptForCall({
      callId: "call-1",
      workspaceId: "ws-1",
    })

    expect(mocks.findNameAndEmail).toHaveBeenCalledWith("agent-1")
    expect(result.speakerNames).toEqual({
      business: "Agent Smith",
      customer: "Ada Lovelace",
    })
    expect(result.hasSpeakers).toBe(true)
    expect(result.segments).toHaveLength(2)
  })

  test("maps Business -> the initiating agent for an outbound call", async () => {
    mocks.findById.mockResolvedValue({
      ...baseCall,
      direction: "businessInitiated",
      answeredByUserId: null,
      initiatedByUserId: "agent-2",
      transcriptSegments: [
        { speaker: "Business", start: 0, end: 2, text: "Hello" },
      ],
    })

    await whatsappCallTranscriptService.getTranscriptForCall({
      callId: "call-1",
      workspaceId: "ws-1",
    })

    expect(mocks.findNameAndEmail).toHaveBeenCalledWith("agent-2")
  })

  test("hasSpeakers is false for a SIP/Whisper transcript with no speaker field", async () => {
    mocks.findById.mockResolvedValue({
      ...baseCall,
      transcriptSegments: [{ start: 0, end: 2, text: "Hello there" }],
    })

    const result = await whatsappCallTranscriptService.getTranscriptForCall({
      callId: "call-1",
      workspaceId: "ws-1",
    })

    expect(result.hasSpeakers).toBe(false)
  })

  test("rejects a call belonging to a different workspace", async () => {
    mocks.findById.mockResolvedValue({ ...baseCall, workspaceId: "ws-other" })

    await expect(
      whatsappCallTranscriptService.getTranscriptForCall({
        callId: "call-1",
        workspaceId: "ws-1",
      }),
    ).rejects.toThrow("Call not found")
  })
})

describe("whatsappCallSummaryService.attachSummary", () => {
  const aiSummary = { summary: "They discussed pricing." }

  test("uses the CAS-guarded first write when no summary exists yet", async () => {
    mocks.findById.mockResolvedValue({ ...baseCall, aiSummarizedAt: null })
    mocks.attachAiSummary.mockResolvedValue({ id: "call-1" })

    await whatsappCallSummaryService.attachSummary({
      callId: "call-1",
      workspaceId: "ws-1",
      aiSummary,
      provider: "openai",
    })

    expect(mocks.attachAiSummary).toHaveBeenCalledWith({
      id: "call-1",
      aiSummary,
      aiSummaryProvider: "openai",
    })
    expect(mocks.overwriteAiSummary).not.toHaveBeenCalled()
  })

  test("uses the unconditional overwrite when a summary already exists (Regenerate)", async () => {
    mocks.findById.mockResolvedValue({
      ...baseCall,
      aiSummarizedAt: new Date(),
    })
    mocks.overwriteAiSummary.mockResolvedValue({ id: "call-1" })

    await whatsappCallSummaryService.attachSummary({
      callId: "call-1",
      workspaceId: "ws-1",
      aiSummary,
      provider: "claude",
    })

    expect(mocks.overwriteAiSummary).toHaveBeenCalledWith({
      id: "call-1",
      aiSummary,
      aiSummaryProvider: "claude",
    })
    expect(mocks.attachAiSummary).not.toHaveBeenCalled()
  })

  test("enriches the finalize activity message and broadcasts when it exists", async () => {
    mocks.findById.mockResolvedValue({ ...baseCall, aiSummarizedAt: null })
    mocks.attachAiSummary.mockResolvedValue({ id: "call-1" })
    mocks.messageRepositoryMergeContentAttributesBySourceId.mockResolvedValue({
      id: "msg-1",
      contentAttributes: {
        type: "whatsapp_call",
        direction: "userInitiated",
        status: "completed",
        callId: "call-1",
        transcriptionRequested: true,
        hasRecording: true,
        hasTranscript: true,
        hasSummary: true,
        recordingExpired: false,
      },
    })

    await whatsappCallSummaryService.attachSummary({
      callId: "call-1",
      workspaceId: "ws-1",
      aiSummary,
      provider: "openai",
    })

    // Atomic merge of ONLY `hasSummary` — never a full-column overwrite
    // that could clobber a concurrent hasRecording/hasTranscript writer.
    expect(
      mocks.messageRepositoryMergeContentAttributesBySourceId,
    ).toHaveBeenCalledWith("wacall-call-1", "ws-1", { hasSummary: true })
    expect(mocks.broadcastToWorkspaceParty).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({
        data: expect.objectContaining({ messageId: "msg-1" }),
      }),
    )
  })

  test("is a no-op enrichment (never throws) when the finalize message does not exist yet", async () => {
    mocks.findById.mockResolvedValue({ ...baseCall, aiSummarizedAt: null })
    mocks.attachAiSummary.mockResolvedValue({ id: "call-1" })
    mocks.messageRepositoryMergeContentAttributesBySourceId.mockResolvedValue(
      null,
    )

    await expect(
      whatsappCallSummaryService.attachSummary({
        callId: "call-1",
        workspaceId: "ws-1",
        aiSummary,
        provider: "openai",
      }),
    ).resolves.toBeUndefined()

    expect(mocks.broadcastToWorkspaceParty).not.toHaveBeenCalled()
  })

  test("a second concurrent Regenerate for the SAME call fails fast with 'already generating' instead of calling the provider twice", async () => {
    mocks.findById.mockResolvedValue({ ...baseCall, aiSummarizedAt: null })
    mocks.runExclusive.mockRejectedValueOnce(
      new MockLockAcquisitionError("locked"),
    )

    await expect(
      whatsappCallSummaryService.attachSummary({
        callId: "call-1",
        workspaceId: "ws-1",
        aiSummary,
        provider: "openai",
      }),
    ).rejects.toMatchObject({ code: "summaryAlreadyGenerating" })

    expect(mocks.attachAiSummary).not.toHaveBeenCalled()
    expect(mocks.overwriteAiSummary).not.toHaveBeenCalled()
  })

  test("propagates a non-lock error from the generation itself instead of masking it as 'already generating'", async () => {
    mocks.findById.mockResolvedValue({ ...baseCall, aiSummarizedAt: null })
    mocks.attachAiSummary.mockRejectedValue(new Error("db down"))

    await expect(
      whatsappCallSummaryService.attachSummary({
        callId: "call-1",
        workspaceId: "ws-1",
        aiSummary,
        provider: "openai",
      }),
    ).rejects.toThrow("db down")
  })
})

describe("whatsappCallSummaryService.getSummaryForCall", () => {
  test("returns undefined when no summary has been generated yet", async () => {
    mocks.findById.mockResolvedValue({ ...baseCall, aiSummary: null })

    const result = await whatsappCallSummaryService.getSummaryForCall({
      callId: "call-1",
      workspaceId: "ws-1",
    })

    expect(result).toBeUndefined()
  })

  test("returns the persisted summary and provider", async () => {
    mocks.findById.mockResolvedValue({
      ...baseCall,
      aiSummary: { summary: "Recap" },
      aiSummaryProvider: "gemini",
    })

    const result = await whatsappCallSummaryService.getSummaryForCall({
      callId: "call-1",
      workspaceId: "ws-1",
    })

    expect(result).toEqual({
      aiSummary: { summary: "Recap" },
      aiSummaryProvider: "gemini",
    })
  })
})
