// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

type ActionHandler = (args: {
  bindArgsParsedInputs: readonly [string]
  parsedInput: Record<string, unknown>
  ctx: { user: { id: string } }
}) => Promise<unknown>

const { issueCredentialsMock, pinWorkspaceToNodeMock } = vi.hoisted(() => ({
  issueCredentialsMock: vi.fn(),
  pinWorkspaceToNodeMock: vi.fn(),
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (handler: unknown) => handler
  return { workspaceActionClient: chain }
})

// A mutable object reference — individual tests flip `TURN_STATIC_SECRET`
// rather than re-mocking the module, since the action module is imported
// once at the top of this file.
const mockedEnv: { FS_NODES?: string; TURN_STATIC_SECRET?: string } = {
  FS_NODES: undefined,
  TURN_STATIC_SECRET: "turn-secret",
}
vi.mock("@/env", () => ({
  get env() {
    return mockedEnv
  },
}))

vi.mock("@chatbotx.io/business", () => ({
  softphoneCredentialService: {
    issueCredentials: issueCredentialsMock,
  },
  pinWorkspaceToNode: pinWorkspaceToNodeMock,
  parseFreeswitchNodes: (json: string | undefined, fallback: unknown) =>
    json ? JSON.parse(json) : { default: fallback },
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {},
}))

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}))

const { getSoftphoneCredentialsAction } = await import(
  "../src/features/integration-whatsapp/calling/actions/softphone-credentials.action"
)
const getAction = getSoftphoneCredentialsAction as unknown as ActionHandler

const ctx = { user: { id: "user-1" } }

describe("getSoftphoneCredentialsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedEnv.FS_NODES = undefined
    mockedEnv.TURN_STATIC_SECRET = "turn-secret"
    pinWorkspaceToNodeMock.mockResolvedValue({ nodeId: "default" })
    issueCredentialsMock.mockResolvedValue({
      sipUsername: "ag-workspace-1-user-1",
      password: "super-secret-password",
      sipDomain: "sip.example.com",
      wssUrl: "wss://sip.example.com",
      turn: { urls: "turn:sip.example.com", username: "u", credential: "c" },
    })
  })

  test("throws when TURN_STATIC_SECRET is not configured", async () => {
    mockedEnv.TURN_STATIC_SECRET = undefined
    await expect(
      getAction({
        bindArgsParsedInputs: ["workspace-1"],
        parsedInput: {},
        ctx,
      }),
    ).rejects.toThrow("whatsapp.calls.errors.inAppCallingUnavailable")
    expect(issueCredentialsMock).not.toHaveBeenCalled()
  })

  test("issues credentials scoped to the caller and the workspace's pinned node", async () => {
    const result = await getAction({
      bindArgsParsedInputs: ["workspace-1"],
      parsedInput: {},
      ctx,
    })

    expect(pinWorkspaceToNodeMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      nodeIds: ["default"],
    })
    expect(issueCredentialsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        userId: "user-1",
        nodeId: "default",
      }),
    )
    expect(result).toEqual(
      expect.objectContaining({ sipUsername: "ag-workspace-1-user-1" }),
    )
  })

  test("never logs the issued password", async () => {
    const consoleSpy = vi.spyOn(console, "log")
    await getAction({
      bindArgsParsedInputs: ["workspace-1"],
      parsedInput: {},
      ctx,
    })
    const loggedText = JSON.stringify(consoleSpy.mock.calls)
    expect(loggedText).not.toContain("super-secret-password")
    consoleSpy.mockRestore()
  })
})
