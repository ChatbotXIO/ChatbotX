// @vitest-environment node

import { CALL_CANCELED_BY_BUSINESS_LAST_ERROR } from "@chatbotx.io/sdk"
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  findByIdMock,
  finalizeEndedCallMock,
  findByInboxIdForWorkspaceMock,
  readControlMock,
  endCallMock,
  deleteOfferMock,
  rejectCallMock,
  terminateCallMock,
  resolveEndOutcomeWithoutControlMock,
} = vi.hoisted(() => ({
  findByIdMock: vi.fn(),
  finalizeEndedCallMock: vi.fn(),
  findByInboxIdForWorkspaceMock: vi.fn(),
  readControlMock: vi.fn(),
  endCallMock: vi.fn(),
  deleteOfferMock: vi.fn(),
  rejectCallMock: vi.fn(),
  terminateCallMock: vi.fn(),
  resolveEndOutcomeWithoutControlMock: vi.fn(),
}))

vi.mock("@/lib/log", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

vi.mock("@chatbotx.io/business", () => ({
  whatsappVoipCallService: {
    readControl: readControlMock,
    endCall: endCallMock,
    finalizeEndedCall: finalizeEndedCallMock,
    resolveEndOutcomeWithoutControl: resolveEndOutcomeWithoutControlMock,
  },
  whatsappVoipSignalingService: {
    deleteOffer: deleteOfferMock,
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
  rejectCall: rejectCallMock,
  terminateCall: terminateCallMock,
}))

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}))

const { endVoipCallAsAgent } = await import(
  "../src/features/integration-whatsapp/calling/actions/end-voip-call-as-agent"
)

const baseInput = {
  whatsappCallId: "call-1",
  workspaceId: "workspace-1",
  userId: "agent-1",
  graphFailureLog: "graph failed",
}

describe("endVoipCallAsAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    finalizeEndedCallMock.mockResolvedValue({ id: "call-1", status: "failed" })
    findByInboxIdForWorkspaceMock.mockResolvedValue({
      id: "integration-1",
      auth: {},
    })
    readControlMock.mockResolvedValue({ reservedUserId: "agent-1" })
    endCallMock.mockResolvedValue({
      graphAction: "terminate",
      terminalStatus: "failed",
    })
    deleteOfferMock.mockResolvedValue(undefined)
    rejectCallMock.mockResolvedValue(undefined)
    terminateCallMock.mockResolvedValue(undefined)
    resolveEndOutcomeWithoutControlMock.mockReturnValue(null)
  })

  test("throws callNotFound when the row does not exist", async () => {
    findByIdMock.mockResolvedValue(undefined)
    await expect(endVoipCallAsAgent(baseInput)).rejects.toThrow(
      "whatsapp.calls.errors.callNotFound",
    )
  })

  test("throws callNotFound when the row belongs to a different workspace", async () => {
    findByIdMock.mockResolvedValue({
      id: "call-1",
      workspaceId: "other-workspace",
      wacid: "wacid-1",
      inboxId: "inbox-1",
    })
    await expect(endVoipCallAsAgent(baseInput)).rejects.toThrow(
      "whatsapp.calls.errors.callNotFound",
    )
  })

  test("refuses to cancel another agent's undialed call, before any write", async () => {
    findByIdMock.mockResolvedValue({
      id: "call-1",
      workspaceId: "workspace-1",
      wacid: null,
      inboxId: "inbox-1",
      direction: "businessInitiated",
      initiatedByUserId: "agent-2",
      answeredByUserId: "agent-2",
    })

    await expect(endVoipCallAsAgent(baseInput)).rejects.toThrow(
      "whatsapp.calls.errors.voipNotReservedAgent",
    )
    expect(finalizeEndedCallMock).not.toHaveBeenCalled()
  })

  test("a row with wacid === null (not yet dialed) is finalized directly with no Graph call, no control read", async () => {
    findByIdMock.mockResolvedValue({
      id: "call-1",
      workspaceId: "workspace-1",
      wacid: null,
      inboxId: "inbox-1",
      initiatedByUserId: "agent-1",
    })

    const result = await endVoipCallAsAgent(baseInput)

    expect(result).toBe(true)
    expect(finalizeEndedCallMock).toHaveBeenCalledWith(
      expect.objectContaining({ whatsappCallId: "call-1", status: "failed" }),
    )
    expect(readControlMock).not.toHaveBeenCalled()
    expect(endCallMock).not.toHaveBeenCalled()
    expect(rejectCallMock).not.toHaveBeenCalled()
    expect(terminateCallMock).not.toHaveBeenCalled()
    expect(deleteOfferMock).not.toHaveBeenCalled()
    expect(findByInboxIdForWorkspaceMock).not.toHaveBeenCalled()
  })

  test("a row WITH a wacid keeps the existing behavior byte-for-byte: reservation check, endCall, Graph action, finalize, delete offer", async () => {
    findByIdMock.mockResolvedValue({
      id: "call-1",
      workspaceId: "workspace-1",
      wacid: "wacid-1",
      inboxId: "inbox-1",
    })

    const result = await endVoipCallAsAgent(baseInput)

    expect(result).toBe(true)
    expect(readControlMock).toHaveBeenCalledWith("wacid-1")
    expect(endCallMock).toHaveBeenCalledWith({
      wacid: "wacid-1",
      allowFromAccepted: true,
    })
    expect(terminateCallMock).toHaveBeenCalledWith(
      expect.objectContaining({ callId: "wacid-1" }),
    )
    expect(finalizeEndedCallMock).toHaveBeenCalledWith(
      expect.objectContaining({ whatsappCallId: "call-1", status: "failed" }),
    )
    expect(deleteOfferMock).toHaveBeenCalledWith("wacid-1")
  })

  test("a row WITH a wacid throws when reserved by a different agent", async () => {
    findByIdMock.mockResolvedValue({
      id: "call-1",
      workspaceId: "workspace-1",
      wacid: "wacid-1",
      inboxId: "inbox-1",
    })
    readControlMock.mockResolvedValue({ reservedUserId: "other-agent" })

    await expect(endVoipCallAsAgent(baseInput)).rejects.toThrow(
      "whatsapp.calls.errors.voipNotReservedAgent",
    )
  })

  test("a row WITH a wacid returns false when the control was already terminal", async () => {
    findByIdMock.mockResolvedValue({
      id: "call-1",
      workspaceId: "workspace-1",
      wacid: "wacid-1",
      inboxId: "inbox-1",
    })
    endCallMock.mockResolvedValue(undefined)

    await expect(endVoipCallAsAgent(baseInput)).resolves.toBe(false)
    expect(finalizeEndedCallMock).not.toHaveBeenCalled()
  })

  test("a failing Graph action never surfaces for a wacid row", async () => {
    findByIdMock.mockResolvedValue({
      id: "call-1",
      workspaceId: "workspace-1",
      wacid: "wacid-1",
      inboxId: "inbox-1",
    })
    terminateCallMock.mockRejectedValue(new Error("meta down"))

    await expect(endVoipCallAsAgent(baseInput)).resolves.toBe(true)
    expect(finalizeEndedCallMock).toHaveBeenCalled()
  })

  describe("a row with a wacid but no call control", () => {
    const boundOutboundRow = (overrides: Record<string, unknown> = {}) => ({
      id: "call-1",
      workspaceId: "workspace-1",
      wacid: "wacid-1",
      inboxId: "inbox-1",
      direction: "businessInitiated",
      status: "ringing",
      initiatedByUserId: "agent-1",
      answeredByUserId: "agent-1",
      ...overrides,
    })

    beforeEach(() => {
      readControlMock.mockResolvedValue(null)
    })

    test("the owner's hangup still ends the call at Meta and closes the row as cancelled", async () => {
      const row = boundOutboundRow()
      findByIdMock.mockResolvedValue(row)
      resolveEndOutcomeWithoutControlMock.mockReturnValue({
        fromPhase: "dialing",
        graphAction: "terminate",
        terminalStatus: "failed",
      })

      await expect(endVoipCallAsAgent(baseInput)).resolves.toBe(true)

      expect(resolveEndOutcomeWithoutControlMock).toHaveBeenCalledWith(row)
      expect(endCallMock).not.toHaveBeenCalled()
      expect(terminateCallMock).toHaveBeenCalledWith(
        expect.objectContaining({ callId: "wacid-1" }),
      )
      expect(finalizeEndedCallMock).toHaveBeenCalledWith(
        expect.objectContaining({
          whatsappCallId: "call-1",
          status: "failed",
          lastError: CALL_CANCELED_BY_BUSINESS_LAST_ERROR,
        }),
      )
    })

    test("rejects a hangup from someone who neither placed nor answered the call", async () => {
      findByIdMock.mockResolvedValue(
        boundOutboundRow({
          initiatedByUserId: "agent-2",
          answeredByUserId: "agent-2",
        }),
      )

      await expect(endVoipCallAsAgent(baseInput)).rejects.toThrow(
        "whatsapp.calls.errors.voipNotReservedAgent",
      )
      expect(terminateCallMock).not.toHaveBeenCalled()
      expect(finalizeEndedCallMock).not.toHaveBeenCalled()
    })

    test("a row that is already terminal is a no-op success", async () => {
      findByIdMock.mockResolvedValue(boundOutboundRow({ status: "failed" }))

      await expect(endVoipCallAsAgent(baseInput)).resolves.toBe(false)
      expect(terminateCallMock).not.toHaveBeenCalled()
      expect(rejectCallMock).not.toHaveBeenCalled()
      expect(finalizeEndedCallMock).not.toHaveBeenCalled()
    })
  })
})
