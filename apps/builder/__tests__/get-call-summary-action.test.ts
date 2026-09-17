// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

type ActionHandler = (args: {
  bindArgsParsedInputs: readonly [string]
  parsedInput: { whatsappCallId: string }
}) => Promise<{ result: unknown }>

const { getSummaryForCallMock } = vi.hoisted(() => ({
  getSummaryForCallMock: vi.fn(),
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (handler: unknown) => handler
  return { workspaceActionClientAllowExpired: chain }
})

vi.mock("@chatbotx.io/business", () => ({
  whatsappCallSummaryService: { getSummaryForCall: getSummaryForCallMock },
}))

const { getCallSummaryAction } = await import(
  "../src/features/messages/actions/get-call-summary.action"
)
const getAction = getCallSummaryAction as unknown as ActionHandler

describe("getCallSummaryAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("returns undefined (not an error) when no summary exists yet", async () => {
    getSummaryForCallMock.mockResolvedValue(undefined)

    const result = await getAction({
      bindArgsParsedInputs: ["ws-1"],
      parsedInput: { whatsappCallId: "call-1" },
    })

    expect(result).toEqual({ result: undefined })
  })

  test("returns the persisted summary", async () => {
    const summary = {
      aiSummary: { summary: "Recap" },
      aiSummaryProvider: "openai",
    }
    getSummaryForCallMock.mockResolvedValue(summary)

    const result = await getAction({
      bindArgsParsedInputs: ["ws-1"],
      parsedInput: { whatsappCallId: "call-1" },
    })

    expect(getSummaryForCallMock).toHaveBeenCalledWith({
      callId: "call-1",
      workspaceId: "ws-1",
    })
    expect(result).toEqual({ result: summary })
  })
})
