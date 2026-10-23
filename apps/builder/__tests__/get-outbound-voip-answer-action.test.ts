// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

type ActionHandler = (args: {
  bindArgsParsedInputs: readonly [string]
  parsedInput: { whatsappCallId: string }
  ctx: { user: { id: string } }
}) => Promise<unknown>

const { readOutboundAnswerForInitiatorMock } = vi.hoisted(() => ({
  readOutboundAnswerForInitiatorMock: vi.fn(),
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (handler: unknown) => handler
  return { callingActionClient: chain }
})

vi.mock("@chatbotx.io/business", () => ({
  whatsappVoipCallService: {
    readOutboundAnswerForInitiator: readOutboundAnswerForInitiatorMock,
  },
}))

const { getOutboundVoipAnswerAction } = await import(
  "../src/features/integration-whatsapp/calling/actions/get-outbound-voip-answer.action"
)
const action = getOutboundVoipAnswerAction as unknown as ActionHandler

const callAction = () =>
  action({
    bindArgsParsedInputs: ["workspace-1"],
    parsedInput: { whatsappCallId: "call-1" },
    ctx: { user: { id: "agent-1" } },
  })

describe("getOutboundVoipAnswerAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("asks the service for the caller's own call, scoped to the workspace, and returns the SDP", async () => {
    readOutboundAnswerForInitiatorMock.mockResolvedValue({ sdp: "v=0 answer" })

    const result = await callAction()

    expect(readOutboundAnswerForInitiatorMock).toHaveBeenCalledWith({
      userId: "agent-1",
      whatsappCallId: "call-1",
      workspaceId: "workspace-1",
    })
    expect(result).toEqual({ sdp: "v=0 answer" })
  })

  test("returns a null sdp, not an error, when there is no answer to give", async () => {
    readOutboundAnswerForInitiatorMock.mockResolvedValue(null)

    expect(await callAction()).toEqual({ sdp: null })
  })
})
