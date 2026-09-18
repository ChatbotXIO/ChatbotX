// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

type ActionHandler = (args: {
  bindArgsParsedInputs: readonly [string]
  ctx: {
    user: { id: string }
    workspaceMemberPermissions: Record<string, boolean>
    isSupportSession?: boolean
  }
  parsedInput: { whatsappCallId: string }
}) => Promise<{ url: string }>

const { getRecordingUrlForCallMock, assertCanReadCallArtifactOrThrowMock } =
  vi.hoisted(() => ({
    getRecordingUrlForCallMock: vi.fn(),
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
  callRecordingService: {
    getRecordingUrlForCall: getRecordingUrlForCallMock,
  },
}))

vi.mock(
  "@/features/integration-whatsapp/calling/actions/assert-call-access",
  () => ({
    assertCanReadCallArtifactOrThrow: assertCanReadCallArtifactOrThrowMock,
  }),
)

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
      ctx: {
        user: { id: "user-1" },
        workspaceMemberPermissions: { contacts: true },
      },
      parsedInput: { whatsappCallId: "call-1" },
    })

    expect(getRecordingUrlForCallMock).toHaveBeenCalledWith({
      callId: "call-1",
      workspaceId: "ws-1",
    })
    expect(result).toEqual({ url: "https://signed.example/fresh" })
  })

  test("runs the D4 artifact-scope check BEFORE resolving the recording URL", async () => {
    getRecordingUrlForCallMock.mockResolvedValue("https://signed.example/fresh")

    await getAction({
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

    expect(getRecordingUrlForCallMock).not.toHaveBeenCalled()
  })

  test("a platform support session (synthetic superAdmin membership, isSupportSession true) is forwarded the same as any other member — C1/D4", async () => {
    getRecordingUrlForCallMock.mockResolvedValue("https://signed.example/fresh")

    const result = await getAction({
      bindArgsParsedInputs: ["ws-1"],
      ctx: {
        user: { id: "support-user-1" },
        workspaceMemberPermissions: { superAdmin: true },
        isSupportSession: true,
      },
      parsedInput: { whatsappCallId: "call-1" },
    })

    expect(assertCanReadCallArtifactOrThrowMock).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      whatsappCallId: "call-1",
      member: {
        userId: "support-user-1",
        permissions: { superAdmin: true },
      },
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
        ctx: {
          user: { id: "user-1" },
          workspaceMemberPermissions: { contacts: true },
        },
        parsedInput: { whatsappCallId: "call-1" },
      }),
    ).rejects.toThrow("Call recording not found")
  })
})
