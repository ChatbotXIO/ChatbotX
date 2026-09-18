// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

type ActionHandler = (args: {
  bindArgsParsedInputs: readonly [string]
  ctx: {
    user: { id: string }
    workspaceMemberPermissions: Record<string, boolean>
  }
  parsedInput: { whatsappCallId: string }
}) => Promise<unknown>

const { getTranscriptForCallMock, assertCanReadCallArtifactOrThrowMock } =
  vi.hoisted(() => ({
    getTranscriptForCallMock: vi.fn(),
    assertCanReadCallArtifactOrThrowMock: vi.fn(),
  }))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (handler: unknown) => handler
  return { workspaceActionClientAllowExpired: chain }
})

vi.mock("@chatbotx.io/business", () => ({
  whatsappCallTranscriptService: {
    getTranscriptForCall: getTranscriptForCallMock,
  },
}))

vi.mock(
  "@/features/integration-whatsapp/calling/actions/assert-call-access",
  () => ({
    assertCanReadCallArtifactOrThrow: assertCanReadCallArtifactOrThrowMock,
  }),
)

const { getCallTranscriptAction } = await import(
  "../src/features/messages/actions/get-call-transcript.action"
)
const getAction = getCallTranscriptAction as unknown as ActionHandler

describe("getCallTranscriptAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("delegates to the transcript service with the caller's workspace", async () => {
    const transcript = {
      segments: [{ speaker: "Business", start: 0, end: 2, text: "Hi" }],
      speakerNames: { business: "Agent", customer: "Contact" },
      hasSpeakers: true,
    }
    getTranscriptForCallMock.mockResolvedValue(transcript)

    const result = await getAction({
      bindArgsParsedInputs: ["ws-1"],
      ctx: {
        user: { id: "user-1" },
        workspaceMemberPermissions: { contacts: true },
      },
      parsedInput: { whatsappCallId: "call-1" },
    })

    expect(assertCanReadCallArtifactOrThrowMock).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      whatsappCallId: "call-1",
      member: { userId: "user-1", permissions: { contacts: true } },
    })
    expect(getTranscriptForCallMock).toHaveBeenCalledWith({
      callId: "call-1",
      workspaceId: "ws-1",
    })
    expect(result).toEqual(transcript)
  })

  test("propagates a denial from the D4 artifact-scope check without calling the service", async () => {
    assertCanReadCallArtifactOrThrowMock.mockRejectedValueOnce(
      new Error("callArtifactAccessDenied"),
    )

    await expect(
      getAction({
        bindArgsParsedInputs: ["ws-1"],
        ctx: {
          user: { id: "user-1" },
          workspaceMemberPermissions: { contacts: true },
        },
        parsedInput: { whatsappCallId: "call-1" },
      }),
    ).rejects.toThrow("callArtifactAccessDenied")

    expect(getTranscriptForCallMock).not.toHaveBeenCalled()
  })

  test("propagates a cross-workspace rejection instead of masking it", async () => {
    getTranscriptForCallMock.mockRejectedValue(new Error("Call not found"))

    await expect(
      getAction({
        bindArgsParsedInputs: ["ws-2"],
        ctx: {
          user: { id: "user-1" },
          workspaceMemberPermissions: { contacts: true },
        },
        parsedInput: { whatsappCallId: "call-1" },
      }),
    ).rejects.toThrow("Call not found")
  })
})
