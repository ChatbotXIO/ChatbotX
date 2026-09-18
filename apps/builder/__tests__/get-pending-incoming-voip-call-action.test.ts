// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

type ActionHandler = (args: {
  bindArgsParsedInputs: readonly [string]
  parsedInput: Record<string, unknown>
  ctx: { user: { id: string } }
}) => Promise<unknown>

const { listResumableIncomingMock } = vi.hoisted(() => ({
  listResumableIncomingMock: vi.fn(),
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (handler: unknown) => handler
  return { callingActionClient: chain }
})

vi.mock("@chatbotx.io/business", () => ({
  whatsappVoipCallService: { listResumableIncoming: listResumableIncomingMock },
}))

const { getPendingIncomingVoipCallAction } = await import(
  "../src/features/integration-whatsapp/calling/actions/get-pending-incoming-voip-call.action"
)
const action = getPendingIncomingVoipCallAction as unknown as ActionHandler

const ctx = { user: { id: "agent-1" } }

describe("getPendingIncomingVoipCallAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("returns every resumable incoming call for the workspace, scoped to the requesting agent", async () => {
    const pending = [
      {
        whatsappCallId: "call-1",
        wacid: "wacid.ABC",
        conversationId: "conv-1",
        contactInboxId: "ci-1",
        contactName: "Hung Phan",
        offer: { sdpType: "offer" as const, sdp: "v=0..." },
        deadlineAt: "2026-09-14T00:00:00.000Z",
      },
      {
        whatsappCallId: "call-2",
        wacid: "wacid.DEF",
        conversationId: "conv-2",
        contactInboxId: "ci-2",
        contactName: null,
        offer: { sdpType: "offer" as const, sdp: "v=0..." },
        deadlineAt: "2026-09-14T00:00:05.000Z",
      },
    ]
    listResumableIncomingMock.mockResolvedValue(pending)

    const result = await action({
      bindArgsParsedInputs: ["workspace-1"],
      parsedInput: {},
      ctx,
    })

    expect(listResumableIncomingMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      userId: "agent-1",
    })
    expect(result).toEqual(pending)
    expect(Array.isArray(result)).toBe(true)
  })

  test("returns an empty array when there is nothing to resume", async () => {
    listResumableIncomingMock.mockResolvedValue([])

    const result = await action({
      bindArgsParsedInputs: ["workspace-1"],
      parsedInput: {},
      ctx,
    })

    expect(result).toEqual([])
  })
})
