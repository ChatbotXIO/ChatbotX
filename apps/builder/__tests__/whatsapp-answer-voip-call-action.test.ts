// @vitest-environment node

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

type ActionHandler = (args: {
  bindArgsParsedInputs: readonly [string]
  parsedInput: Record<string, unknown>
  ctx: { user: { id: string }; isSupportSession: boolean }
}) => Promise<unknown>

const {
  markRecordingArrangementMock,
  logProviderErrorMock,
  findByIdMock,
  findByInboxIdForWorkspaceMock,
  findContactInboxMock,
  findContactMock,
  markAcceptedByAgentMock,
  readControlMock,
  claimForAnswerMock,
  commitAcceptedMock,
  releaseClaimMock,
  preAcceptCallMock,
  acceptCallMock,
  terminateCallMock,
  broadcastToWorkspacePartyMock,
  claimForCallAgentMock,
  canCallConversationMock,
} = vi.hoisted(() => ({
  markRecordingArrangementMock: vi.fn(),
  logProviderErrorMock: vi.fn(),
  findByIdMock: vi.fn(),
  findByInboxIdForWorkspaceMock: vi.fn(),
  findContactInboxMock: vi.fn(),
  findContactMock: vi.fn(),
  markAcceptedByAgentMock: vi.fn(),
  readControlMock: vi.fn(),
  claimForAnswerMock: vi.fn(),
  commitAcceptedMock: vi.fn(),
  releaseClaimMock: vi.fn(),
  preAcceptCallMock: vi.fn(),
  acceptCallMock: vi.fn(),
  terminateCallMock: vi.fn(),
  broadcastToWorkspacePartyMock: vi.fn(),
  claimForCallAgentMock: vi.fn(),
  canCallConversationMock: vi.fn(),
}))

const DEADLINE_SAFETY_MARGIN_MS = 3000

class FakeWhatsappException extends Error {
  httpStatusCode: number
  constructor(message: string, httpStatusCode = 400) {
    super(message)
    this.httpStatusCode = httpStatusCode
  }
}

const SUPPORTED_ANNOUNCEMENT_LANGUAGES = new Set([
  "en",
  "en_US",
  "en_AU",
  "en_CA",
  "en_GB",
  "en_IN",
  "en_NZ",
  "nl",
  "fr",
  "de",
  "hi",
  "it",
  "kn",
  "pt",
  "es",
  "es_ES",
  "te",
  "vi",
])

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (handler: unknown) => handler
  return { callingActionClient: chain }
})

vi.mock("@/lib/log", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

const {
  canSendAudio: actualCanSendAudio,
  diagnoseAnswerShape: actualDiagnoseAnswerShape,
  summarizeIceCandidates: actualSummarizeIceCandidates,
} = await vi.importActual<typeof import("@chatbotx.io/business")>(
  "@chatbotx.io/business",
)

vi.mock("@chatbotx.io/business", () => ({
  canCallConversation: canCallConversationMock,
  whatsappCallLifecycleService: {
    markRecordingArrangement: markRecordingArrangementMock,
  },
  logProviderErrorForChannel: logProviderErrorMock,
  whatsappVoipCallService: {
    readControl: readControlMock,
    claimForAnswer: claimForAnswerMock,
    commitAccepted: commitAcceptedMock,
    releaseClaim: releaseClaimMock,
    markAcceptedByAgent: markAcceptedByAgentMock,
  },
  // Real implementation (not a stub) so the deadline tests exercise the
  // actual deadline-margin logic instead of a hard-coded true/false.
  isAnswerDeadlineExpired: (deadlineAt: number) =>
    Date.now() + DEADLINE_SAFETY_MARGIN_MS >= deadlineAt,
  // Real implementations too — they only read the SDP string the test passes
  // in, and stubbing them would hide a wrong diagnosis in the answer log.
  summarizeIceCandidates: actualSummarizeIceCandidates,
  canSendAudio: actualCanSendAudio,
  diagnoseAnswerShape: actualDiagnoseAnswerShape,
  contactInboxService: { findBy: findContactInboxMock },
  contactService: { findBy: findContactMock },
  broadcastToWorkspaceParty: broadcastToWorkspacePartyMock,
  conversationService: { claimForCallAgent: claimForCallAgentMock },
  CALL_ASSIGNMENT_TRIGGER_HANDLERS: {
    answered: "whatsappCallAnswered",
    dialed: "whatsappCallDialed",
  },
}))

vi.mock("@chatbotx.io/partysocket-config", () => ({
  RealtimeEventType: {
    whatsappCallClaimedElsewhere: "whatsappCallClaimedElsewhere",
  },
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {},
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  integrationWhatsappRepository: {
    findByInboxIdForWorkspace: findByInboxIdForWorkspaceMock,
  },
  whatsappCallRepository: {
    findById: findByIdMock,
  },
}))

vi.mock("@chatbotx.io/integration-whatsapp/api/calling", () => ({
  preAcceptCall: preAcceptCallMock,
  acceptCall: acceptCallMock,
  terminateCall: terminateCallMock,
  resolveAnnouncementLanguage: (input: string | undefined) =>
    input && SUPPORTED_ANNOUNCEMENT_LANGUAGES.has(input) ? input : "en_US",
}))

vi.mock("@chatbotx.io/integration-whatsapp/exception", () => ({
  WhatsappException: FakeWhatsappException,
}))

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}))

const { answerWhatsappVoipCallAction } = await import(
  "../src/features/integration-whatsapp/calling/actions/answer-voip-call.action"
)
const { logger } = await import("@/lib/log")
const action = answerWhatsappVoipCallAction as unknown as ActionHandler

const ctx = { user: { id: "agent-1" }, isSupportSession: false }

const call = (whatsappCallId = "call-1", sdpAnswer = "v=0 answer") =>
  action({
    bindArgsParsedInputs: ["workspace-1"],
    parsedInput: { whatsappCallId, sdpAnswer },
    ctx,
  })

describe("answerWhatsappVoipCallAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    canCallConversationMock.mockResolvedValue(true)
    findByIdMock.mockResolvedValue({
      id: "call-1",
      workspaceId: "workspace-1",
      inboxId: "inbox-1",
      contactInboxId: "contact-inbox-1",
      conversationId: "conversation-1",
      wacid: "wacid-1",
    })
    findByInboxIdForWorkspaceMock.mockResolvedValue({
      id: "integration-1",
      auth: { tokens: { accessToken: "tok" } },
      callRecordingEnabled: false,
      callTranscriptionEnabled: false,
      callRecordingMode: "browserWhisper",
      callTranscriptionMode: "browserWhisper",
      callAnnouncementLanguage: null,
      callRecordingPurpose: null,
    })
    findContactInboxMock.mockResolvedValue({
      id: "contact-inbox-1",
      contactId: "contact-1",
    })
    findContactMock.mockResolvedValue({ id: "contact-1", locale: null })
    readControlMock.mockResolvedValue({
      reservedUserId: "agent-1",
      phase: "reserved",
      deadlineAt: Date.now() + 60_000,
      fenceToken: "fence-1",
    })
    claimForAnswerMock.mockResolvedValue("fence-1")
    preAcceptCallMock.mockResolvedValue(undefined)
    acceptCallMock.mockResolvedValue(undefined)
    commitAcceptedMock.mockResolvedValue(true)
    markAcceptedByAgentMock.mockResolvedValue(true)
    terminateCallMock.mockResolvedValue(undefined)
    releaseClaimMock.mockResolvedValue(true)
    broadcastToWorkspacePartyMock.mockResolvedValue(undefined)
    claimForCallAgentMock.mockResolvedValue([])
  })

  test("denies a cross-workspace call id", async () => {
    findByIdMock.mockResolvedValue({
      id: "call-1",
      workspaceId: "workspace-2",
      inboxId: "inbox-1",
      wacid: "wacid-1",
    })
    await expect(call()).rejects.toThrow("whatsapp.calls.errors.callNotFound")
    expect(claimForAnswerMock).not.toHaveBeenCalled()
  })

  test("answer refused BEFORE claim when the agent is ineligible — canCallConversation checked directly, no throw/catch dance", async () => {
    canCallConversationMock.mockResolvedValueOnce(false)

    await expect(call()).resolves.toEqual({ outcome: "cannotAnswer" })

    expect(canCallConversationMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      conversationId: "conversation-1",
      userId: "agent-1",
    })
    expect(claimForAnswerMock).not.toHaveBeenCalled()
  })

  test("answer refused AFTER a successful claim (reassignment/removal), releases the claim", async () => {
    // First check (before claim) passes; the second (after claim, before
    // pre_accept) catches a reassignment that happened in between.
    canCallConversationMock
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)

    await expect(call()).resolves.toEqual({ outcome: "cannotAnswer" })

    expect(claimForAnswerMock).toHaveBeenCalledWith({
      wacid: "wacid-1",
      userId: "agent-1",
    })
    expect(releaseClaimMock).toHaveBeenCalledWith({
      wacid: "wacid-1",
      fenceToken: "fence-1",
    })
    expect(preAcceptCallMock).not.toHaveBeenCalled()
  })

  test("answers successfully: pre_accept then accept then guarded persist", async () => {
    findByIdMock.mockResolvedValue({
      id: "call-1",
      workspaceId: "workspace-1",
      inboxId: "inbox-1",
      wacid: "wacid-1",
    })

    const result = await call()

    expect(claimForAnswerMock).toHaveBeenCalledWith({
      wacid: "wacid-1",
      userId: "agent-1",
    })
    const preOrder = preAcceptCallMock.mock.invocationCallOrder[0]
    const acceptOrder = acceptCallMock.mock.invocationCallOrder[0]
    expect(preOrder).toBeLessThan(acceptOrder)
    expect(preAcceptCallMock).toHaveBeenCalledWith(
      expect.objectContaining({ callId: "wacid-1", sdpAnswer: "v=0 answer" }),
    )
    expect(commitAcceptedMock).toHaveBeenCalledWith({
      wacid: "wacid-1",
      fenceToken: "fence-1",
    })
    expect(markAcceptedByAgentMock).toHaveBeenCalledWith({
      whatsappCallId: "call-1",
      agentUserId: "agent-1",
    })
    expect(terminateCallMock).not.toHaveBeenCalled()
    expect(result).toEqual({
      outcome: "accepted",
      browserRecordingEnabled: false,
      recordingRequested: false,
    })
    expect(broadcastToWorkspacePartyMock).toHaveBeenCalledWith("workspace-1", {
      eventType: "whatsappCallClaimedElsewhere",
      data: {
        whatsappCallId: "call-1",
        wacid: "wacid-1",
        answeredByUserId: "agent-1",
      },
    })
  })

  test("auto-assigns the conversation to the answering agent only after markAcceptedByAgent succeeds", async () => {
    await call()

    expect(claimForCallAgentMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      conversationId: "conversation-1",
      userId: "agent-1",
      triggerHandler: "whatsappCallAnswered",
    })
  })

  test("a claimForCallAgent failure is logged with `err` and does not change the accepted outcome", async () => {
    const claimError = new Error("claim failed")
    claimForCallAgentMock.mockRejectedValue(claimError)

    const result = await call()

    expect(result).toEqual({
      outcome: "accepted",
      browserRecordingEnabled: false,
      recordingRequested: false,
    })
    expect(logger.warn).toHaveBeenCalledWith(
      { err: claimError, whatsappCallId: "call-1" },
      "WhatsApp VoIP call: auto-assign on answer failed",
    )
  })

  test("does not auto-assign when the call ends before markAcceptedByAgent succeeds", async () => {
    markAcceptedByAgentMock.mockResolvedValue(false)

    await call()

    expect(claimForCallAgentMock).not.toHaveBeenCalled()
  })

  // The auto-assign claim must never delay the "claimed elsewhere"
  // broadcast that tells every other rung agent to stop ringing — it runs
  // strictly after both markAcceptedByAgent and that broadcast, as the last
  // best-effort step before the action returns.
  test("claims the conversation after markAcceptedByAgent AND after the claimed-elsewhere broadcast", async () => {
    await call()

    const markOrder = markAcceptedByAgentMock.mock.invocationCallOrder[0]
    const broadcastOrder =
      broadcastToWorkspacePartyMock.mock.invocationCallOrder[0]
    const claimOrder = claimForCallAgentMock.mock.invocationCallOrder[0]
    expect(markOrder).toBeLessThan(claimOrder)
    expect(broadcastOrder).toBeLessThan(claimOrder)
  })

  test("skips auto-assign entirely for a support session", async () => {
    await action({
      bindArgsParsedInputs: ["workspace-1"],
      parsedInput: { whatsappCallId: "call-1", sdpAnswer: "v=0 answer" },
      ctx: { user: { id: "agent-1" }, isSupportSession: true },
    })

    expect(claimForCallAgentMock).not.toHaveBeenCalled()
  })

  test("releases the fenced claim (compensation) and does not swallow the accept error when Graph accept fails", async () => {
    findByIdMock.mockResolvedValue({
      id: "call-1",
      workspaceId: "workspace-1",
      inboxId: "inbox-1",
      wacid: "wacid-1",
    })
    acceptCallMock.mockRejectedValue(new Error("graph accept 500"))

    await expect(call()).rejects.toThrow(
      "whatsapp.calls.errors.voipAnswerFailed",
    )

    expect(releaseClaimMock).toHaveBeenCalledWith({
      wacid: "wacid-1",
      fenceToken: "fence-1",
    })
    expect(commitAcceptedMock).not.toHaveBeenCalled()
    expect(broadcastToWorkspacePartyMock).not.toHaveBeenCalled()
  })

  test("a releaseClaim failure never masks the original accept error", async () => {
    findByIdMock.mockResolvedValue({
      id: "call-1",
      workspaceId: "workspace-1",
      inboxId: "inbox-1",
      wacid: "wacid-1",
    })
    acceptCallMock.mockRejectedValue(new Error("graph accept 500"))
    releaseClaimMock.mockRejectedValue(new Error("redis down"))

    await expect(call()).rejects.toThrow(
      "whatsapp.calls.errors.voipAnswerFailed",
    )

    expect(releaseClaimMock).toHaveBeenCalledWith({
      wacid: "wacid-1",
      fenceToken: "fence-1",
    })
  })

  test("returns browserRecordingEnabled+recordingRequested true when recording is on and mode is browserWhisper", async () => {
    findByIdMock.mockResolvedValue({
      id: "call-1",
      workspaceId: "workspace-1",
      inboxId: "inbox-1",
      wacid: "wacid-1",
    })
    findByInboxIdForWorkspaceMock.mockResolvedValue({
      id: "integration-1",
      auth: { tokens: { accessToken: "tok" } },
      callRecordingEnabled: true,
      callRecordingMode: "browserWhisper",
    })

    const result = await call()

    expect(result).toEqual({
      outcome: "accepted",
      browserRecordingEnabled: true,
      recordingRequested: true,
    })
  })

  test("records that a recording IS coming when Meta accepted the announcement", async () => {
    findByIdMock.mockResolvedValue({
      id: "call-1",
      workspaceId: "workspace-1",
      inboxId: "inbox-1",
      wacid: "wacid-1",
    })
    findByInboxIdForWorkspaceMock.mockResolvedValue({
      id: "integration-1",
      auth: { tokens: { accessToken: "tok" } },
      callRecordingEnabled: true,
      callRecordingMode: "metaNative",
      callAnnouncementLanguage: "en_US",
      callRecordingPurpose: "QA",
    })

    await call()

    expect(markRecordingArrangementMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recordingRequested: true,
        recordingFailureReason: null,
      }),
    )
    expect(logProviderErrorMock).not.toHaveBeenCalled()
  })

  test("metaNative recording never enables the browser recorder, but still reports recordingRequested", async () => {
    findByIdMock.mockResolvedValue({
      id: "call-1",
      workspaceId: "workspace-1",
      inboxId: "inbox-1",
      wacid: "wacid-1",
    })
    findByInboxIdForWorkspaceMock.mockResolvedValue({
      id: "integration-1",
      auth: { tokens: { accessToken: "tok" } },
      callRecordingEnabled: true,
      callRecordingMode: "metaNative",
      callAnnouncementLanguage: "en_US",
      callRecordingPurpose: "QA",
    })

    const result = await call()

    expect(result).toEqual({
      outcome: "accepted",
      browserRecordingEnabled: false,
      recordingRequested: true,
    })
  })

  test("returns cannotAnswer when the claim is lost, without touching Graph or the DB", async () => {
    findByIdMock.mockResolvedValue({
      id: "call-1",
      workspaceId: "workspace-1",
      inboxId: "inbox-1",
      wacid: "wacid-1",
    })
    claimForAnswerMock.mockResolvedValue(null)

    const result = await call()

    expect(result).toEqual({ outcome: "cannotAnswer" })
    expect(preAcceptCallMock).not.toHaveBeenCalled()
    expect(acceptCallMock).not.toHaveBeenCalled()
    expect(markAcceptedByAgentMock).not.toHaveBeenCalled()
  })

  test("compensates with terminate and never persists accepted when the commit is lost", async () => {
    findByIdMock.mockResolvedValue({
      id: "call-1",
      workspaceId: "workspace-1",
      inboxId: "inbox-1",
      wacid: "wacid-1",
    })
    commitAcceptedMock.mockResolvedValue(false)

    const result = await call()

    expect(result).toEqual({ outcome: "callEnded" })
    expect(terminateCallMock).toHaveBeenCalledWith(
      expect.objectContaining({ callId: "wacid-1" }),
    )
    expect(markAcceptedByAgentMock).not.toHaveBeenCalled()
    // A lost commit never reaches the claim at all (not just that
    // markAcceptedByAgent was skipped).
    expect(claimForCallAgentMock).not.toHaveBeenCalled()
  })

  test("compensates with terminate when the guarded DB persist matches 0 rows (row already terminal)", async () => {
    findByIdMock.mockResolvedValue({
      id: "call-1",
      workspaceId: "workspace-1",
      inboxId: "inbox-1",
      wacid: "wacid-1",
    })
    // Redis commit won, but a concurrent hangup finalized the row first.
    markAcceptedByAgentMock.mockResolvedValue(false)

    const result = await call()

    expect(result).toEqual({ outcome: "callEnded" })
    expect(terminateCallMock).toHaveBeenCalledWith(
      expect.objectContaining({ callId: "wacid-1" }),
    )
  })

  test("never logs the SDP answer on a Graph failure", async () => {
    findByIdMock.mockResolvedValue({
      id: "call-1",
      workspaceId: "workspace-1",
      inboxId: "inbox-1",
      wacid: "wacid-1",
    })
    preAcceptCallMock.mockRejectedValue(new Error("graph failed"))
    const { logger } = await import("@/lib/log")

    await expect(call()).rejects.toThrow(
      "whatsapp.calls.errors.voipAnswerFailed",
    )

    const loggedText = JSON.stringify(
      (logger.error as ReturnType<typeof vi.fn>).mock.calls,
    )
    expect(loggedText).not.toContain("v=0 answer")
    expect(commitAcceptedMock).not.toHaveBeenCalled()
  })

  describe("server-side answer-deadline enforcement", () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    test("before claim: an already-expired deadline returns cannotAnswer without calling claimForAnswer or Graph", async () => {
      readControlMock.mockResolvedValue({
        reservedUserId: "",
        phase: "reserved",
        deadlineAt: Date.now() - 1,
        fenceToken: "fence-1",
      })

      const result = await call()

      expect(result).toEqual({ outcome: "cannotAnswer" })
      expect(claimForAnswerMock).not.toHaveBeenCalled()
      expect(preAcceptCallMock).not.toHaveBeenCalled()
      expect(acceptCallMock).not.toHaveBeenCalled()
    })

    test("before claim: a deadline within the 3s safety margin returns cannotAnswer", async () => {
      readControlMock.mockResolvedValue({
        reservedUserId: "",
        phase: "reserved",
        deadlineAt: Date.now() + 2000,
        fenceToken: "fence-1",
      })

      const result = await call()

      expect(result).toEqual({ outcome: "cannotAnswer" })
      expect(claimForAnswerMock).not.toHaveBeenCalled()
    })

    test("before pre_accept: the deadline expires between claim and pre_accept, releases the claim, never calls Graph", async () => {
      const deadlineAt = Date.now() + 3500
      readControlMock.mockResolvedValue({
        reservedUserId: "",
        phase: "reserved",
        deadlineAt,
        fenceToken: "fence-1",
      })
      claimForAnswerMock.mockImplementation(() => {
        vi.advanceTimersByTime(1000)
        return Promise.resolve("fence-1")
      })

      const result = await call()

      expect(result).toEqual({ outcome: "cannotAnswer" })
      expect(releaseClaimMock).toHaveBeenCalledWith({
        wacid: "wacid-1",
        fenceToken: "fence-1",
      })
      expect(preAcceptCallMock).not.toHaveBeenCalled()
      expect(acceptCallMock).not.toHaveBeenCalled()
    })

    test("before accept: the deadline expires between pre_accept and accept, releases the claim, never calls accept", async () => {
      const deadlineAt = Date.now() + 4000
      readControlMock.mockResolvedValue({
        reservedUserId: "",
        phase: "reserved",
        deadlineAt,
        fenceToken: "fence-1",
      })
      preAcceptCallMock.mockImplementation(() => {
        vi.advanceTimersByTime(1500)
        return Promise.resolve()
      })

      const result = await call()

      expect(result).toEqual({ outcome: "cannotAnswer" })
      expect(preAcceptCallMock).toHaveBeenCalledTimes(1)
      expect(acceptCallMock).not.toHaveBeenCalled()
      expect(releaseClaimMock).toHaveBeenCalledWith({
        wacid: "wacid-1",
        fenceToken: "fence-1",
      })
    })

    test("maps a Graph accept failure that races past the deadline to cannotAnswer instead of throwing", async () => {
      const deadlineAt = Date.now() + 4000
      readControlMock.mockResolvedValue({
        reservedUserId: "",
        phase: "reserved",
        deadlineAt,
        fenceToken: "fence-1",
      })
      acceptCallMock.mockImplementation(() => {
        vi.advanceTimersByTime(1500)
        return Promise.reject(new Error("graph accept timed out"))
      })

      const result = await call()

      expect(result).toEqual({ outcome: "cannotAnswer" })
      expect(releaseClaimMock).toHaveBeenCalledWith({
        wacid: "wacid-1",
        fenceToken: "fence-1",
      })
    })

    test("well within the deadline: answers normally", async () => {
      readControlMock.mockResolvedValue({
        reservedUserId: "",
        phase: "reserved",
        deadlineAt: Date.now() + 55_000,
        fenceToken: "fence-1",
      })

      const result = await call()

      expect(result).toMatchObject({ outcome: "accepted" })
    })
  })

  describe("Meta-native recording/transcription announcement options", () => {
    const metaNativeIntegration = {
      id: "integration-1",
      auth: { tokens: { accessToken: "tok" } },
      callRecordingEnabled: true,
      callTranscriptionEnabled: true,
      callRecordingMode: "metaNative",
      callTranscriptionMode: "metaNative",
      callAnnouncementLanguage: "fr",
      callRecordingPurpose: "Quality assurance",
    }

    test("passes recording/transcription options to acceptCall when both are metaNative", async () => {
      findByInboxIdForWorkspaceMock.mockResolvedValue(metaNativeIntegration)

      await call()

      const expectedAnnouncement = {
        status: "ENABLED",
        purpose: "Quality assurance",
        announcementLanguage: "fr",
      }
      expect(acceptCallMock).toHaveBeenCalledWith(
        expect.objectContaining({
          recording: expectedAnnouncement,
          transcription: expectedAnnouncement,
        }),
      )
    })

    test("omits both options in browserWhisper mode even when the toggles are on", async () => {
      findByInboxIdForWorkspaceMock.mockResolvedValue({
        ...metaNativeIntegration,
        callRecordingMode: "browserWhisper",
        callTranscriptionMode: "browserWhisper",
      })

      await call()

      const acceptArgs = acceptCallMock.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >
      expect(acceptArgs.recording).toBeUndefined()
      expect(acceptArgs.transcription).toBeUndefined()
    })

    test("retries acceptCall once without announcement options after a Meta 4xx", async () => {
      findByInboxIdForWorkspaceMock.mockResolvedValue(metaNativeIntegration)
      acceptCallMock
        .mockRejectedValueOnce(
          new FakeWhatsappException("invalid purpose", 400),
        )
        .mockResolvedValueOnce(undefined)
      const { logger } = await import("@/lib/log")

      const result = await call()

      // Meta accepted without the announcement, so no recording is coming —
      // the card must not promise one.
      expect(result).toEqual({
        outcome: "accepted",
        browserRecordingEnabled: false,
        recordingRequested: false,
      })
      expect(acceptCallMock).toHaveBeenCalledTimes(2)
      // The call is connected but Meta is NOT recording it: the row must say
      // so, and the workspace must see the failure in its error log.
      expect(markRecordingArrangementMock).toHaveBeenCalledWith(
        expect.objectContaining({
          recordingRequested: false,
          recordingFailureReason: "meta-rejected-recording-announcement",
        }),
      )
      expect(logProviderErrorMock).toHaveBeenCalledWith(
        "whatsapp",
        expect.objectContaining({ workspaceId: "workspace-1" }),
      )
      const secondCallArgs = acceptCallMock.mock.calls[1]?.[0] as Record<
        string,
        unknown
      >
      expect(secondCallArgs.recording).toBeUndefined()
      expect(secondCallArgs.transcription).toBeUndefined()
      expect(logger.warn).toHaveBeenCalled()
      expect(commitAcceptedMock).toHaveBeenCalled()
    })

    test("does not retry, and surfaces the failure, when acceptCall fails with a non-4xx error", async () => {
      findByInboxIdForWorkspaceMock.mockResolvedValue(metaNativeIntegration)
      acceptCallMock.mockRejectedValue(
        new FakeWhatsappException("Meta is down", 502),
      )

      await expect(call()).rejects.toThrow(
        "whatsapp.calls.errors.voipAnswerFailed",
      )
      expect(acceptCallMock).toHaveBeenCalledTimes(1)
    })

    test("uses the contact's locale for the announcement language when the integration has none configured", async () => {
      findByInboxIdForWorkspaceMock.mockResolvedValue({
        ...metaNativeIntegration,
        callAnnouncementLanguage: null,
      })
      findContactMock.mockResolvedValue({ id: "contact-1", locale: "es" })

      await call()

      expect(acceptCallMock).toHaveBeenCalledWith(
        expect.objectContaining({
          recording: expect.objectContaining({ announcementLanguage: "es" }),
        }),
      )
    })

    test("prefers the per-channel ContactInbox.language (the contact panel's 'Language' field) over the derived Contact.locale", async () => {
      findByInboxIdForWorkspaceMock.mockResolvedValue({
        ...metaNativeIntegration,
        callAnnouncementLanguage: null,
      })
      // Agent set the contact's Language to English; the auto-derived locale is
      // still the WhatsApp profile's other language — English must win.
      findContactInboxMock.mockResolvedValue({
        id: "contact-inbox-1",
        contactId: "contact-1",
        language: "en",
      })
      findContactMock.mockResolvedValue({ id: "contact-1", locale: "fr" })

      await call()

      expect(acceptCallMock).toHaveBeenCalledWith(
        expect.objectContaining({
          recording: expect.objectContaining({ announcementLanguage: "en" }),
        }),
      )
    })
  })
})
