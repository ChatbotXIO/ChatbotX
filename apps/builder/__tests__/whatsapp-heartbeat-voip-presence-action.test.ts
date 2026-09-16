// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

type ActionHandler = (args: {
  bindArgsParsedInputs: readonly [string]
  parsedInput: Record<string, unknown>
  ctx: { user: { id: string } }
}) => Promise<unknown>

const { heartbeatMock } = vi.hoisted(() => ({ heartbeatMock: vi.fn() }))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (handler: unknown) => handler
  return { workspaceActionClient: chain }
})

vi.mock("@chatbotx.io/business", () => ({
  whatsappVoipPresenceService: { heartbeat: heartbeatMock },
}))

const { heartbeatVoipPresenceAction } = await import(
  "../src/features/integration-whatsapp/calling/actions/heartbeat-voip-presence.action"
)
const action = heartbeatVoipPresenceAction as unknown as ActionHandler

describe("heartbeatVoipPresenceAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    heartbeatMock.mockResolvedValue(undefined)
  })

  test("marks the calling agent present in their workspace", async () => {
    const result = await action({
      bindArgsParsedInputs: ["workspace-1"],
      parsedInput: {},
      ctx: { user: { id: "agent-1" } },
    })

    expect(heartbeatMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      userId: "agent-1",
    })
    expect(result).toEqual({ ok: true })
  })
})
