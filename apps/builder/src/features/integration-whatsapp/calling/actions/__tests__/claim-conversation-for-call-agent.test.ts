// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const { claimForCallAgentMock, loggerWarnMock } = vi.hoisted(() => ({
  claimForCallAgentMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  conversationService: { claimForCallAgent: claimForCallAgentMock },
  CALL_ASSIGNMENT_TRIGGER_HANDLERS: {
    answered: "whatsappCallAnswered",
    dialed: "whatsappCallDialed",
  },
}))

vi.mock("@/lib/log", () => ({
  logger: { warn: loggerWarnMock },
}))

const { claimConversationForCallAgent } = await import(
  "../claim-conversation-for-call-agent"
)

const baseInput = {
  workspaceId: "workspace-1",
  conversationId: "conversation-1",
  agentUserId: "agent-1",
  whatsappCallId: "call-1",
  isSupportSession: false,
} as const

describe("claimConversationForCallAgent", () => {
  beforeEach(() => {
    claimForCallAgentMock.mockReset()
    loggerWarnMock.mockReset()
    claimForCallAgentMock.mockResolvedValue([])
  })

  test("claims the conversation with the answered trigger handler", async () => {
    await claimConversationForCallAgent({ ...baseInput, trigger: "answered" })

    expect(claimForCallAgentMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      conversationId: "conversation-1",
      userId: "agent-1",
      triggerHandler: "whatsappCallAnswered",
    })
  })

  test("claims the conversation with the dialed trigger handler", async () => {
    await claimConversationForCallAgent({ ...baseInput, trigger: "dialed" })

    expect(claimForCallAgentMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      conversationId: "conversation-1",
      userId: "agent-1",
      triggerHandler: "whatsappCallDialed",
    })
  })

  test("logs the failure with `err` and swallows it, keyed by trigger", async () => {
    const error = new Error("claim failed")
    claimForCallAgentMock.mockRejectedValue(error)

    await expect(
      claimConversationForCallAgent({ ...baseInput, trigger: "answered" }),
    ).resolves.toBeUndefined()

    expect(loggerWarnMock).toHaveBeenCalledWith(
      { err: error, whatsappCallId: "call-1" },
      "WhatsApp VoIP call: auto-assign on answer failed",
    )
  })

  test("logs a dial-specific message for a dialed-trigger failure", async () => {
    const error = new Error("claim failed")
    claimForCallAgentMock.mockRejectedValue(error)

    await claimConversationForCallAgent({ ...baseInput, trigger: "dialed" })

    expect(loggerWarnMock).toHaveBeenCalledWith(
      { err: error, whatsappCallId: "call-1" },
      "WhatsApp outbound dial: auto-assign failed",
    )
  })

  test("skips the claim entirely for a support session", async () => {
    await claimConversationForCallAgent({
      ...baseInput,
      trigger: "answered",
      isSupportSession: true,
    })

    expect(claimForCallAgentMock).not.toHaveBeenCalled()
  })
})
