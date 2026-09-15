// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

type ActionHandler = (args: {
  bindArgsParsedInputs: readonly [string]
  parsedInput: Record<string, unknown>
  ctx: { user: { id: string } }
}) => Promise<unknown>

const {
  findByMock,
  findInboxMock,
  findContactMock,
  findByInboxIdForWorkspaceMock,
  createOutboundAttemptMock,
  attachMetaCallIdMock,
  finalizeEndedCallMock,
  getCallPermissionsMock,
  connectCallMock,
  terminateCallMock,
  assertNoActiveCallForContactMock,
  startOutboundDialMock,
  enqueueOutboundDialExpiryMock,
  endCallMock,
  isCallEndedMock,
} = vi.hoisted(() => ({
  findByMock: vi.fn(),
  findInboxMock: vi.fn(),
  findContactMock: vi.fn(),
  findByInboxIdForWorkspaceMock: vi.fn(),
  createOutboundAttemptMock: vi.fn(),
  attachMetaCallIdMock: vi.fn(),
  finalizeEndedCallMock: vi.fn(),
  getCallPermissionsMock: vi.fn(),
  connectCallMock: vi.fn(),
  terminateCallMock: vi.fn(),
  assertNoActiveCallForContactMock: vi.fn(),
  startOutboundDialMock: vi.fn(),
  enqueueOutboundDialExpiryMock: vi.fn(),
  endCallMock: vi.fn(),
  isCallEndedMock: vi.fn(),
}))

class InProgressError extends Error {}
class PendingOutboundExistsError extends Error {}

class FakeWhatsappException extends Error {
  code: string | number
  httpStatusCode: number
  constructor(message: string, code: string | number, httpStatusCode = 400) {
    super(message)
    this.code = code
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
  return { workspaceActionClient: chain }
})

vi.mock("@/lib/log", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

vi.mock("@chatbotx.io/business", () => ({
  conversationService: { findBy: findByMock },
  contactInboxService: { findBy: findInboxMock },
  contactService: { findBy: findContactMock },
  whatsappVoipCallService: {
    assertNoActiveCallForContact: assertNoActiveCallForContactMock,
    startOutboundDial: startOutboundDialMock,
    enqueueOutboundDialExpiry: enqueueOutboundDialExpiryMock,
    createOutboundAttempt: createOutboundAttemptMock,
    attachMetaCallId: attachMetaCallIdMock,
    finalizeEndedCall: finalizeEndedCallMock,
    endCall: endCallMock,
    isCallEnded: isCallEndedMock,
  },
  WhatsappCallInProgressError: InProgressError,
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {},
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  channelTypes: { enum: { whatsapp: "whatsapp" } },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  integrationWhatsappRepository: {
    findByInboxIdForWorkspace: findByInboxIdForWorkspaceMock,
  },
  WhatsappCallPendingOutboundExistsError: PendingOutboundExistsError,
}))

vi.mock("@chatbotx.io/integration-whatsapp/api/calling", () => ({
  getCallPermissions: getCallPermissionsMock,
  connectCall: connectCallMock,
  terminateCall: terminateCallMock,
  canPerformCallAction: (
    response: {
      actions: { action_name: string; can_perform_action?: boolean }[]
    },
    name: string,
  ) =>
    response.actions.find((a) => a.action_name === name)?.can_perform_action ===
    true,
  resolveAnnouncementLanguage: (input: string | undefined) =>
    input && SUPPORTED_ANNOUNCEMENT_LANGUAGES.has(input) ? input : "en_US",
}))

vi.mock("@chatbotx.io/integration-whatsapp/exception", () => ({
  WhatsappException: FakeWhatsappException,
}))

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}))

const { initiateOutboundVoipCallAction } = await import(
  "../src/features/integration-whatsapp/calling/actions/initiate-outbound-voip-call.action"
)
const action = initiateOutboundVoipCallAction as unknown as ActionHandler

const ctx = { user: { id: "agent-1" } }

const call = (input: Record<string, unknown> = {}) =>
  action({
    bindArgsParsedInputs: ["workspace-1"],
    parsedInput: {
      conversationId: "conversation-1",
      sdpOffer: "v=0...",
      ...input,
    },
    ctx,
  })

describe("initiateOutboundVoipCallAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findByMock.mockResolvedValue({
      id: "conversation-1",
      contactId: "contact-1",
      inboxId: "inbox-1",
    })
    findInboxMock.mockResolvedValue({
      id: "contact-inbox-1",
      inboxId: "inbox-1",
      channel: "whatsapp",
      sourceId: "+15551234567",
    })
    findByInboxIdForWorkspaceMock.mockResolvedValue({
      id: "integration-1",
      auth: {},
      displayPhoneNumber: "+44 20 7946 0958",
      callRecordingEnabled: true,
      callTranscriptionEnabled: false,
      callRecordingMode: "browserWhisper",
      callTranscriptionMode: "browserWhisper",
      callAnnouncementLanguage: null,
      callRecordingPurpose: null,
    })
    findContactMock.mockResolvedValue({ id: "contact-1", locale: null })
    getCallPermissionsMock.mockResolvedValue({
      messaging_product: "whatsapp",
      permission: { status: "permanent" },
      actions: [{ action_name: "start_call", can_perform_action: true }],
    })
    assertNoActiveCallForContactMock.mockResolvedValue(undefined)
    createOutboundAttemptMock.mockResolvedValue({ id: "call-1" })
    finalizeEndedCallMock.mockResolvedValue({ id: "call-1", status: "failed" })
    connectCallMock.mockResolvedValue({ wacid: "wacid-1" })
    terminateCallMock.mockResolvedValue(undefined)
    attachMetaCallIdMock.mockResolvedValue({ id: "call-1", wacid: "wacid-1" })
    startOutboundDialMock.mockResolvedValue({
      reservedUserId: "agent-1",
      phase: "dialing",
    })
    enqueueOutboundDialExpiryMock.mockResolvedValue(undefined)
    endCallMock.mockResolvedValue({ graphAction: "terminate" })
    isCallEndedMock.mockImplementation(({ status }: { status?: string }) =>
      ["completed", "failed", "rejected"].includes(status ?? ""),
    )
  })

  test("returns ineligibleNumber when the business number's country is blocked (VN)", async () => {
    findByInboxIdForWorkspaceMock.mockResolvedValue({
      id: "integration-1",
      auth: {},
      displayPhoneNumber: "+84 912 345 678",
      callRecordingEnabled: false,
    })
    await expect(call()).resolves.toEqual({ outcome: "ineligibleNumber" })
    expect(getCallPermissionsMock).not.toHaveBeenCalled()
  })

  // R11: TR is not on Meta's blocked-business-country list (only VN, US, CA,
  // EG, NG) — a TR business number must dial normally, not be blocked.
  test("does NOT block a TR business number (R11: TR removed from BLOCKED_OUTBOUND_COUNTRIES)", async () => {
    findByInboxIdForWorkspaceMock.mockResolvedValue({
      id: "integration-1",
      auth: {},
      displayPhoneNumber: "+90 532 123 4567",
      callRecordingEnabled: true,
      callRecordingMode: "browserWhisper",
    })
    const result = await call()
    expect(result).not.toEqual({ outcome: "ineligibleNumber" })
    expect(getCallPermissionsMock).toHaveBeenCalled()
  })

  test("returns needsPermission when Meta reports no start_call permission", async () => {
    getCallPermissionsMock.mockResolvedValue({
      messaging_product: "whatsapp",
      permission: { status: "no_permission" },
      actions: [{ action_name: "start_call", can_perform_action: false }],
    })
    await expect(call()).resolves.toEqual({ outcome: "needsPermission" })
    expect(createOutboundAttemptMock).not.toHaveBeenCalled()
  })

  test("returns permissionCheckFailed (not needsPermission) when the permissions GET itself throws", async () => {
    getCallPermissionsMock.mockRejectedValue(new Error("network"))
    await expect(call()).resolves.toEqual({ outcome: "permissionCheckFailed" })
    expect(createOutboundAttemptMock).not.toHaveBeenCalled()
  })

  test("returns callAlreadyInProgress on the glare guard", async () => {
    assertNoActiveCallForContactMock.mockRejectedValue(
      new InProgressError("contact-inbox-1"),
    )
    await expect(call()).resolves.toEqual({ outcome: "callAlreadyInProgress" })
    expect(createOutboundAttemptMock).not.toHaveBeenCalled()
  })

  test("returns callAlreadyInProgress when createPendingOutbound races and loses", async () => {
    createOutboundAttemptMock.mockRejectedValue(
      new PendingOutboundExistsError("contact-inbox-1"),
    )
    await expect(call()).resolves.toEqual({ outcome: "callAlreadyInProgress" })
    expect(connectCallMock).not.toHaveBeenCalled()
  })

  test("propagates an unexpected createPendingOutbound error", async () => {
    createOutboundAttemptMock.mockRejectedValue(new Error("db down"))
    await expect(call()).rejects.toThrow("db down")
  })

  test("C1: compensates when a post-connect write throws after Meta connect succeeded", async () => {
    startOutboundDialMock.mockRejectedValue(new Error("redis down"))

    const result = await call()

    expect(result).toEqual({ outcome: "callFailed" })
    expect(terminateCallMock).toHaveBeenCalledWith(
      expect.objectContaining({ callId: "wacid-1" }),
    )
    expect(finalizeEndedCallMock).toHaveBeenCalledWith(
      expect.objectContaining({
        whatsappCallId: "call-1",
        status: "failed",
        lastError: "outbound-setup-failed",
      }),
    )
  })

  test("C1: a failing best-effort terminateCall never surfaces — still returns callFailed", async () => {
    startOutboundDialMock.mockRejectedValue(new Error("redis down"))
    terminateCallMock.mockRejectedValue(new Error("meta down"))

    await expect(call()).resolves.toEqual({ outcome: "callFailed" })
    expect(finalizeEndedCallMock).toHaveBeenCalledWith(
      expect.objectContaining({ whatsappCallId: "call-1", status: "failed" }),
    )
  })

  test("creates the call control before the row exposes the wacid, so a racing hangup always finds one", async () => {
    await call()

    expect(startOutboundDialMock.mock.invocationCallOrder[0]).toBeLessThan(
      attachMetaCallIdMock.mock.invocationCallOrder[0],
    )
  })

  test("a hangup that closed the row while Meta was connecting wins: the leg is hung up and never dialed", async () => {
    attachMetaCallIdMock.mockResolvedValue({
      id: "call-1",
      wacid: "wacid-1",
      status: "failed",
    })

    await expect(call()).resolves.toEqual({ outcome: "callFailed" })

    expect(endCallMock).toHaveBeenCalledWith({
      wacid: "wacid-1",
      allowFromAccepted: true,
    })
    expect(terminateCallMock).toHaveBeenCalledWith(
      expect.objectContaining({ callId: "wacid-1" }),
    )
    expect(enqueueOutboundDialExpiryMock).not.toHaveBeenCalled()
    // The row is already closed by the hangup — never overwritten here.
    expect(finalizeEndedCallMock).not.toHaveBeenCalled()
  })

  test("treats a vanished attempt row the same as a cancelled one", async () => {
    attachMetaCallIdMock.mockResolvedValue(undefined)

    await expect(call()).resolves.toEqual({ outcome: "callFailed" })
    expect(terminateCallMock).toHaveBeenCalledWith(
      expect.objectContaining({ callId: "wacid-1" }),
    )
    expect(enqueueOutboundDialExpiryMock).not.toHaveBeenCalled()
  })

  test("C1: a failing attach after the control exists ends the control, hangs up and finalizes", async () => {
    attachMetaCallIdMock.mockRejectedValue(new Error("db down"))

    await expect(call()).resolves.toEqual({ outcome: "callFailed" })
    expect(endCallMock).toHaveBeenCalledWith({
      wacid: "wacid-1",
      allowFromAccepted: true,
    })
    expect(terminateCallMock).toHaveBeenCalledWith(
      expect.objectContaining({ callId: "wacid-1" }),
    )
    expect(finalizeEndedCallMock).toHaveBeenCalledWith(
      expect.objectContaining({
        whatsappCallId: "call-1",
        status: "failed",
        lastError: "outbound-setup-failed",
      }),
    )
  })

  test("C1: teardown failures never surface — still finalizes and returns callFailed", async () => {
    startOutboundDialMock.mockRejectedValue(new Error("redis down"))
    endCallMock.mockRejectedValue(new Error("redis still down"))
    terminateCallMock.mockRejectedValue(new Error("meta down"))

    await expect(call()).resolves.toEqual({ outcome: "callFailed" })
    expect(finalizeEndedCallMock).toHaveBeenCalledWith(
      expect.objectContaining({ whatsappCallId: "call-1", status: "failed" }),
    )
  })

  test("on success: creates the pending row, connects, attaches wacid, starts the dial, and returns dialing", async () => {
    const result = await call()

    expect(createOutboundAttemptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        inboxId: "inbox-1",
        contactInboxId: "contact-inbox-1",
        conversationId: "conversation-1",
        agentUserId: "agent-1",
      }),
    )
    expect(connectCallMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: "15551234567", sdpOffer: "v=0..." }),
    )
    expect(attachMetaCallIdMock).toHaveBeenCalledWith({
      whatsappCallId: "call-1",
      wacid: "wacid-1",
    })
    expect(startOutboundDialMock).toHaveBeenCalledWith(
      expect.objectContaining({ wacid: "wacid-1", initiatorUserId: "agent-1" }),
    )
    expect(enqueueOutboundDialExpiryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        whatsappCallId: "call-1",
        wacid: "wacid-1",
        workspaceId: "workspace-1",
      }),
    )
    expect(result).toEqual(
      expect.objectContaining({
        outcome: "dialing",
        whatsappCallId: "call-1",
        wacid: "wacid-1",
        // The default mock integration has callRecordingEnabled: true and
        // callRecordingMode: "browserWhisper" — browser recording is
        // enabled, and no Meta-native announcement was attached.
        browserRecordingEnabled: true,
        recordingRequested: true,
      }),
    )
  })

  test("R2: a Username/BSUID-only contact (empty sourceId, known sourceUserId) dials via `recipient`, never `to`", async () => {
    findInboxMock.mockResolvedValue({
      id: "contact-inbox-1",
      inboxId: "inbox-1",
      channel: "whatsapp",
      sourceId: "",
      sourceUserId: "bsuid-123",
    })

    const result = await call()

    expect(connectCallMock).toHaveBeenCalledWith(
      expect.objectContaining({ recipient: "bsuid-123", sdpOffer: "v=0..." }),
    )
    const connectArgs = connectCallMock.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >
    expect(connectArgs.to).toBeUndefined()
    // The permissions GET must use the SAME identity shape as the dial —
    // Meta's `recipient=<BSUID>`, never a BSUID stuffed into `user_wa_id`.
    expect(getCallPermissionsMock).toHaveBeenCalledWith(expect.anything(), {
      recipient: "bsuid-123",
    })
    expect(result).toEqual(expect.objectContaining({ outcome: "dialing" }))
  })

  test("a phone-number contact looks its permissions up by user_wa_id", async () => {
    await call()

    expect(getCallPermissionsMock).toHaveBeenCalledWith(expect.anything(), {
      userWaId: "15551234567",
    })
  })

  test("metaNative recording never enables the browser recorder, but still reports recordingRequested", async () => {
    findByInboxIdForWorkspaceMock.mockResolvedValue({
      id: "integration-1",
      auth: {},
      displayPhoneNumber: "+44 20 7946 0958",
      callRecordingEnabled: true,
      callTranscriptionEnabled: false,
      callRecordingMode: "metaNative",
      callTranscriptionMode: "metaNative",
      callAnnouncementLanguage: null,
      callRecordingPurpose: null,
    })

    const result = await call()

    expect(result).toEqual(
      expect.objectContaining({
        outcome: "dialing",
        browserRecordingEnabled: false,
        recordingRequested: true,
      }),
    )
  })

  test("recording disabled entirely reports both flags false", async () => {
    findByInboxIdForWorkspaceMock.mockResolvedValue({
      id: "integration-1",
      auth: {},
      displayPhoneNumber: "+44 20 7946 0958",
      callRecordingEnabled: false,
      callTranscriptionEnabled: false,
      callRecordingMode: "browserWhisper",
      callTranscriptionMode: "browserWhisper",
      callAnnouncementLanguage: null,
      callRecordingPurpose: null,
    })

    const result = await call()

    expect(result).toEqual(
      expect.objectContaining({
        outcome: "dialing",
        browserRecordingEnabled: false,
        recordingRequested: false,
      }),
    )
  })

  test.each([
    [138_006, "needsPermission"],
    [138_000, "callingNotEnabled"],
    [138_003, "callAlreadyInProgress"],
    [138_012, "dailyLimitReached"],
    [138_013, "ineligibleNumber"],
    [138_001, "recipientUncallable"],
    [138_014, "temporarilyDisabled"],
    [138_005, "rateLimited"],
    [138_002, "rateLimited"],
    [131_044, "paymentIssue"],
    [999_999, "callFailed"],
  ])("maps Meta error code %s to outcome %s and finalizes the pending row as failed", async (code, outcome) => {
    connectCallMock.mockRejectedValue(
      new FakeWhatsappException("Meta rejected the call", code),
    )
    const result = await call()

    expect(result).toEqual({ outcome })
    expect(finalizeEndedCallMock).toHaveBeenCalledWith(
      expect.objectContaining({
        whatsappCallId: "call-1",
        status: "failed",
        lastError: String(code),
      }),
    )
    expect(attachMetaCallIdMock).not.toHaveBeenCalled()
    expect(startOutboundDialMock).not.toHaveBeenCalled()
  })

  test("a non-WhatsappException connect failure still finalizes the row and returns callFailed", async () => {
    connectCallMock.mockRejectedValue(new Error("boom"))
    const result = await call()

    expect(result).toEqual({ outcome: "callFailed" })
    expect(finalizeEndedCallMock).toHaveBeenCalledWith(
      expect.objectContaining({ whatsappCallId: "call-1", status: "failed" }),
    )
  })

  test("never logs the SDP offer", async () => {
    const consoleSpy = vi.spyOn(console, "log")
    await call({ sdpOffer: "v=0 SECRET_SDP_CONTENT" })
    const loggedText = JSON.stringify(consoleSpy.mock.calls)
    expect(loggedText).not.toContain("SECRET_SDP_CONTENT")
    consoleSpy.mockRestore()
  })

  describe("Meta-native recording/transcription announcement options", () => {
    const metaNativeIntegration = {
      id: "integration-1",
      auth: {},
      displayPhoneNumber: "+44 20 7946 0958",
      callRecordingEnabled: true,
      callTranscriptionEnabled: true,
      callRecordingMode: "metaNative",
      callTranscriptionMode: "metaNative",
      callAnnouncementLanguage: "fr",
      callRecordingPurpose: "Quality assurance",
    }

    test("passes recording/transcription options to connectCall when both are metaNative", async () => {
      findByInboxIdForWorkspaceMock.mockResolvedValue(metaNativeIntegration)

      await call()

      const expectedAnnouncement = {
        status: "ENABLED",
        purpose: "Quality assurance",
        announcementLanguage: "fr",
      }
      expect(connectCallMock).toHaveBeenCalledWith(
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

      const connectArgs = connectCallMock.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >
      expect(connectArgs.recording).toBeUndefined()
      expect(connectArgs.transcription).toBeUndefined()
    })

    test("retries connectCall once without announcement options after a Meta 4xx", async () => {
      findByInboxIdForWorkspaceMock.mockResolvedValue(metaNativeIntegration)
      connectCallMock
        .mockRejectedValueOnce(
          new FakeWhatsappException("invalid purpose", "invalidParameter", 400),
        )
        .mockResolvedValueOnce({ wacid: "wacid-1" })
      const { logger } = await import("@/lib/log")

      const result = await call()

      expect(result).toEqual(expect.objectContaining({ outcome: "dialing" }))
      expect(connectCallMock).toHaveBeenCalledTimes(2)
      const secondCallArgs = connectCallMock.mock.calls[1]?.[0] as Record<
        string,
        unknown
      >
      expect(secondCallArgs.recording).toBeUndefined()
      expect(secondCallArgs.transcription).toBeUndefined()
      expect(logger.warn).toHaveBeenCalled()
    })

    test("does not retry, and finalizes as failed, when connectCall fails with a non-4xx error", async () => {
      findByInboxIdForWorkspaceMock.mockResolvedValue(metaNativeIntegration)
      connectCallMock.mockRejectedValue(
        new FakeWhatsappException("Meta is down", "serverError", 500),
      )

      const result = await call()

      expect(result).toEqual({ outcome: "callFailed" })
      expect(connectCallMock).toHaveBeenCalledTimes(1)
    })

    test("uses the contact's locale for the announcement language when the integration has none configured", async () => {
      findByInboxIdForWorkspaceMock.mockResolvedValue({
        ...metaNativeIntegration,
        callAnnouncementLanguage: null,
      })
      findContactMock.mockResolvedValue({ id: "contact-1", locale: "es" })

      await call()

      expect(connectCallMock).toHaveBeenCalledWith(
        expect.objectContaining({
          recording: expect.objectContaining({ announcementLanguage: "es" }),
        }),
      )
    })
  })
})
