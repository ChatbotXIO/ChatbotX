// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

type ActionHandler = (args: {
  bindArgsParsedInputs: readonly [string]
  parsedInput: Record<string, unknown>
  ctx: { user: { id: string } }
}) => Promise<unknown>

const {
  findByIdMock,
  findByInboxIdForWorkspaceMock,
  finalizeEndedCallMock,
  readControlMock,
  endCallMock,
  deleteOfferMock,
  terminateCallMock,
  rejectCallMock,
} = vi.hoisted(() => ({
  findByIdMock: vi.fn(),
  findByInboxIdForWorkspaceMock: vi.fn(),
  finalizeEndedCallMock: vi.fn(),
  readControlMock: vi.fn(),
  endCallMock: vi.fn(),
  deleteOfferMock: vi.fn(),
  terminateCallMock: vi.fn(),
  rejectCallMock: vi.fn(),
}))

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
  terminateCall: terminateCallMock,
  rejectCall: rejectCallMock,
}))

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}))

const { hangupWhatsappVoipCallAction } = await import(
  "../src/features/integration-whatsapp/calling/actions/hangup-voip-call.action"
)
const action = hangupWhatsappVoipCallAction as unknown as ActionHandler

const ctx = { user: { id: "agent-1" } }

const call = (whatsappCallId = "call-1") =>
  action({
    bindArgsParsedInputs: ["workspace-1"],
    parsedInput: { whatsappCallId },
    ctx,
  })

describe("hangupWhatsappVoipCallAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findByIdMock.mockResolvedValue({
      id: "call-1",
      workspaceId: "workspace-1",
      inboxId: "inbox-1",
      wacid: "wacid-1",
    })
    findByInboxIdForWorkspaceMock.mockResolvedValue({
      id: "integration-1",
      auth: { tokens: { accessToken: "tok" } },
    })
    readControlMock.mockResolvedValue({
      reservedUserId: "agent-1",
      phase: "accepted",
    })
    endCallMock.mockResolvedValue({
      fromPhase: "accepted",
      graphAction: "terminate",
      terminalStatus: "completed",
    })
    terminateCallMock.mockResolvedValue(undefined)
    rejectCallMock.mockResolvedValue(undefined)
  })

  test("denies a cross-workspace call id", async () => {
    findByIdMock.mockResolvedValue({
      id: "call-1",
      workspaceId: "workspace-2",
      inboxId: "inbox-1",
      wacid: "wacid-1",
    })
    await expect(call()).rejects.toThrow("whatsapp.calls.errors.callNotFound")
  })

  test("terminates on Meta, finalizes the row as completed, and clears the offer", async () => {
    const result = await call()

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
        status: "completed",
      }),
    )
    expect(deleteOfferMock).toHaveBeenCalledWith("wacid-1")
    expect(result).toEqual({ hungUp: true })
  })

  test("honors endCall's graphAction and terminalStatus: a never-accepted (reserved) call uses reject + status rejected, not terminate/completed", async () => {
    endCallMock.mockResolvedValue({
      fromPhase: "reserved",
      graphAction: "reject",
      terminalStatus: "rejected",
    })

    await call()

    expect(rejectCallMock).toHaveBeenCalledWith(
      expect.objectContaining({ callId: "wacid-1" }),
    )
    expect(terminateCallMock).not.toHaveBeenCalled()
    expect(finalizeEndedCallMock).toHaveBeenCalledWith(
      expect.objectContaining({ whatsappCallId: "call-1", status: "rejected" }),
    )
  })

  test("still finalizes locally (success) when the Graph terminate fails — Meta reclaims on timeout", async () => {
    terminateCallMock.mockRejectedValue(new Error("graph 500"))

    const result = await call()

    expect(result).toEqual({ hungUp: true })
    expect(finalizeEndedCallMock).toHaveBeenCalledWith(
      expect.objectContaining({
        whatsappCallId: "call-1",
        status: "completed",
      }),
    )
    expect(deleteOfferMock).toHaveBeenCalledWith("wacid-1")
  })

  test("is a no-op success when the call is already terminal", async () => {
    endCallMock.mockResolvedValue(null)

    const result = await call()

    expect(result).toEqual({ hungUp: true })
    expect(terminateCallMock).not.toHaveBeenCalled()
    expect(finalizeEndedCallMock).not.toHaveBeenCalled()
  })
})
