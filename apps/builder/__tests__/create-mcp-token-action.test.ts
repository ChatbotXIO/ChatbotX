import { beforeEach, describe, expect, test, vi } from "vitest"

const WORKSPACE_TOKEN_PREFIX_PATTERN = /^cbx_ws_/
const SUPER_ADMIN_ERROR_PATTERN = /super admin/

const mocks = vi.hoisted(() => ({
  createToken: vi.fn(),
  requireWorkspaceTokenSuperAdmin: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  workspaceApiTokenService: { createToken: mocks.createToken },
}))

vi.mock("@/features/common/schema", () => ({
  workspaceIdrequestParams: {},
}))

vi.mock("@/lib/safe-action", () => ({
  workspaceActionClient: {
    bindArgsSchemas: () => ({ action: (fn: unknown) => fn }),
  },
}))

vi.mock(
  "../src/features/workspaces/lib/require-workspace-token-super-admin",
  () => ({
    requireWorkspaceTokenSuperAdmin: mocks.requireWorkspaceTokenSuperAdmin,
  }),
)

const { createMcpTokenAction } = await import(
  "../src/features/workspaces/actions/create-mcp-token-action"
)

type McpActionInput = { bindArgsParsedInputs: [string] }
const run = (input: McpActionInput) =>
  (
    createMcpTokenAction as unknown as (
      input: McpActionInput,
    ) => Promise<{ token: string }>
  )(input)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireWorkspaceTokenSuperAdmin.mockResolvedValue(undefined)
  mocks.createToken.mockResolvedValue({ id: "token-1" })
})

describe("createMcpTokenAction", () => {
  test("mints a full-permission, all-scope token named MCP and returns plaintext once", async () => {
    const result = await run({ bindArgsParsedInputs: ["ws-1"] })

    expect(result.token).toMatch(WORKSPACE_TOKEN_PREFIX_PATTERN)
    expect(mocks.requireWorkspaceTokenSuperAdmin).toHaveBeenCalledWith("ws-1")
    const call = mocks.createToken.mock.calls[0][0]
    expect(call).toMatchObject({
      workspaceId: "ws-1",
      name: "MCP",
      permission: "full",
      scopes: null,
    })
    expect(call.tokenHash).not.toBe(result.token)
    expect(JSON.stringify(result)).not.toContain(call.tokenHash)
  })

  test("rejects a non-superAdmin before minting", async () => {
    mocks.requireWorkspaceTokenSuperAdmin.mockRejectedValue(
      new Error("You need to be a super admin to manage workspace API tokens"),
    )

    await expect(run({ bindArgsParsedInputs: ["ws-1"] })).rejects.toThrow(
      SUPER_ADMIN_ERROR_PATTERN,
    )
    expect(mocks.createToken).not.toHaveBeenCalled()
  })
})
