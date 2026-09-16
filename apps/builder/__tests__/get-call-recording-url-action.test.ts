// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

type ActionHandler = (args: {
  bindArgsParsedInputs: readonly [string]
  parsedInput: { whatsappCallId: string }
}) => Promise<{ url: string }>

const { getRecordingUrlForCallMock } = vi.hoisted(() => ({
  getRecordingUrlForCallMock: vi.fn(),
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (handler: unknown) => handler
  return { workspaceActionClientAllowExpired: chain }
})

vi.mock("@chatbotx.io/business", () => ({
  callRecordingService: {
    getRecordingUrlForCall: getRecordingUrlForCallMock,
  },
}))

const { getCallRecordingUrlAction } = await import(
  "../src/features/messages/actions/get-call-recording-url.action"
)
const getAction = getCallRecordingUrlAction as unknown as ActionHandler

describe("getCallRecordingUrlAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("returns a fresh signed URL for a call in the caller's workspace", async () => {
    getRecordingUrlForCallMock.mockResolvedValue("https://signed.example/fresh")

    const result = await getAction({
      bindArgsParsedInputs: ["ws-1"],
      parsedInput: { whatsappCallId: "call-1" },
    })

    expect(getRecordingUrlForCallMock).toHaveBeenCalledWith({
      callId: "call-1",
      workspaceId: "ws-1",
    })
    expect(result).toEqual({ url: "https://signed.example/fresh" })
  })

  test("propagates a cross-workspace rejection from the service instead of masking it", async () => {
    getRecordingUrlForCallMock.mockRejectedValue(
      new Error("Call recording not found"),
    )

    await expect(
      getAction({
        bindArgsParsedInputs: ["ws-2"],
        parsedInput: { whatsappCallId: "call-1" },
      }),
    ).rejects.toThrow("Call recording not found")
  })
})
