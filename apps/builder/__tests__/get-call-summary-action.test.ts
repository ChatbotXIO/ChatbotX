// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

type ActionHandler = (args: {
  bindArgsParsedInputs: readonly [string]
  ctx: {
    user: { id: string }
    workspaceMemberPermissions: Record<string, boolean>
  }
  parsedInput: { whatsappCallId: string }
}) => Promise<{ result: unknown }>

const { getSummaryForCallMock, assertCanReadCallArtifactOrThrowMock } =
  vi.hoisted(() => ({
    getSummaryForCallMock: vi.fn(),
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
  whatsappCallSummaryService: { getSummaryForCall: getSummaryForCallMock },
}))

vi.mock(
  "@/features/integration-whatsapp/calling/actions/assert-call-access",
  () => ({
    assertCanReadCallArtifactOrThrow: assertCanReadCallArtifactOrThrowMock,
  }),
)

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
      ctx: {
        user: { id: "user-1" },
        workspaceMemberPermissions: { contacts: true },
      },
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
    expect(getSummaryForCallMock).toHaveBeenCalledWith({
      callId: "call-1",
      workspaceId: "ws-1",
    })
    expect(result).toEqual({ result: summary })
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

    expect(getSummaryForCallMock).not.toHaveBeenCalled()
  })
})
