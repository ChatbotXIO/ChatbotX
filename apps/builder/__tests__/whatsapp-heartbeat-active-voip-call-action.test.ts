// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

type ActionHandler = (args: {
  bindArgsParsedInputs: readonly [string]
  parsedInput: Record<string, unknown>
  ctx: { user: { id: string } }
}) => Promise<unknown>

const { heartbeatActiveCallMock } = vi.hoisted(() => ({
  heartbeatActiveCallMock: vi.fn(),
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (handler: unknown) => handler
  return { workspaceActionClient: chain }
})

vi.mock("@chatbotx.io/business", () => ({
  whatsappVoipCallService: { heartbeatActiveCall: heartbeatActiveCallMock },
}))

const { heartbeatActiveVoipCallAction } = await import(
  "../src/features/integration-whatsapp/calling/actions/heartbeat-active-voip-call.action"
)
const action = heartbeatActiveVoipCallAction as unknown as ActionHandler

describe("heartbeatActiveVoipCallAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("delegates to whatsappVoipCallService.heartbeatActiveCall with the workspace-scoped caller and reports ok:true on success", async () => {
    heartbeatActiveCallMock.mockResolvedValue(true)

    const result = await action({
      bindArgsParsedInputs: ["workspace-1"],
      parsedInput: { wacid: "wacid-1" },
      ctx: { user: { id: "agent-1" } },
    })

    expect(heartbeatActiveCallMock).toHaveBeenCalledWith({
      wacid: "wacid-1",
      workspaceId: "workspace-1",
      userId: "agent-1",
    })
    expect(result).toEqual({ ok: true })
  })

  test("reports ok:false when the call is not applicable (not owned/not accepted)", async () => {
    heartbeatActiveCallMock.mockResolvedValue(false)

    const result = await action({
      bindArgsParsedInputs: ["workspace-1"],
      parsedInput: { wacid: "wacid-2" },
      ctx: { user: { id: "agent-1" } },
    })

    expect(result).toEqual({ ok: false })
  })
})
