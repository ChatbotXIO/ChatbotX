// @vitest-environment node

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
} = vi.hoisted(() => ({
  findByIdMock: vi.fn(),
  finalizeEndedCallMock: vi.fn(),
  findByInboxIdForWorkspaceMock: vi.fn(),
  readControlMock: vi.fn(),
  endCallMock: vi.fn(),
  deleteOfferMock: vi.fn(),
  rejectCallMock: vi.fn(),
  terminateCallMock: vi.fn(),
}))

vi.mock("@/lib/log", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

vi.mock("@chatbotx.io/business", () => ({
  whatsappVoipCallService: {
    readControl: readControlMock,
    endCall: endCallMock,
    deleteOffer: deleteOfferMock,
    finalizeEndedCall: finalizeEndedCallMock,
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

  test("a row with wacid === null (not yet dialed) is finalized directly with no Graph call, no control read", async () => {
    findByIdMock.mockResolvedValue({
      id: "call-1",
      workspaceId: "workspace-1",
      wacid: null,
      inboxId: "inbox-1",
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
})
