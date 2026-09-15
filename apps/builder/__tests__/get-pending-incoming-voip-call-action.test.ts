// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

type ActionHandler = (args: {
  bindArgsParsedInputs: readonly [string]
  parsedInput: Record<string, unknown>
}) => Promise<unknown>

const { getResumableIncomingMock } = vi.hoisted(() => ({
  getResumableIncomingMock: vi.fn(),
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (handler: unknown) => handler
  return { workspaceActionClient: chain }
})

vi.mock("@chatbotx.io/business", () => ({
  whatsappVoipCallService: { getResumableIncoming: getResumableIncomingMock },
}))

const { getPendingIncomingVoipCallAction } = await import(
  "../src/features/integration-whatsapp/calling/actions/get-pending-incoming-voip-call.action"
)
const action = getPendingIncomingVoipCallAction as unknown as ActionHandler

describe("getPendingIncomingVoipCallAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("returns the resumable incoming call for the workspace", async () => {
    const pending = {
      whatsappCallId: "call-1",
      wacid: "wacid.ABC",
      conversationId: "conv-1",
      contactInboxId: "ci-1",
      contactName: "Hung Phan",
      offer: { sdpType: "offer" as const, sdp: "v=0..." },
      deadlineAt: "2026-09-14T00:00:00.000Z",
    }
    getResumableIncomingMock.mockResolvedValue(pending)

    const result = await action({
      bindArgsParsedInputs: ["workspace-1"],
      parsedInput: {},
    })

    expect(getResumableIncomingMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
    })
    expect(result).toEqual(pending)
  })

  test("returns null when there is nothing to resume", async () => {
    getResumableIncomingMock.mockResolvedValue(null)

    const result = await action({
      bindArgsParsedInputs: ["workspace-1"],
      parsedInput: {},
    })

    expect(result).toBeNull()
  })
})
