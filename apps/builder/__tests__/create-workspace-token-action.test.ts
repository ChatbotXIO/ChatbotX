import { beforeEach, describe, expect, test, vi } from "vitest"

const TOKEN_CAP_ERROR_PATTERN = /maximum/
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
    bindArgsSchemas: () => ({
      inputSchema: () => ({ action: (fn: unknown) => fn }),
    }),
  },
}))

vi.mock(
  "../src/features/workspaces/lib/require-workspace-token-super-admin",
  () => ({
    requireWorkspaceTokenSuperAdmin: mocks.requireWorkspaceTokenSuperAdmin,
  }),
)

vi.mock("../src/features/workspaces/schema/action", () => ({
  createWorkspaceTokenRequest: {},
}))

const { createWorkspaceTokenAction } = await import(
  "../src/features/workspaces/actions/create-workspace-token-action"
)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireWorkspaceTokenSuperAdmin.mockResolvedValue(undefined)
  mocks.createToken.mockResolvedValue({
    id: "token-1",
    workspaceId: "ws-1",
    name: "My token",
    permission: "full",
    tokenPrefix: "cbx_ws_abcd",
  })
})

type CreateWorkspaceTokenActionInput = {
  bindArgsParsedInputs: [string]
  parsedInput: {
    name: string
    permission: "full" | "read_only"
    allScopes: boolean
    scopes: string[]
  }
}

describe("createWorkspaceTokenAction", () => {
  test("mints a cbx_ws_ token, hashes it, and never returns the hash", async () => {
    const result = await (
      createWorkspaceTokenAction as unknown as (
        input: CreateWorkspaceTokenActionInput,
      ) => Promise<{ token: string }>
    )({
      bindArgsParsedInputs: ["ws-1"],
      parsedInput: {
        name: "My token",
        permission: "full",
        allScopes: true,
        scopes: [],
      },
    })

    expect(result.token).toMatch(WORKSPACE_TOKEN_PREFIX_PATTERN)

    expect(mocks.requireWorkspaceTokenSuperAdmin).toHaveBeenCalledWith("ws-1")
    expect(mocks.createToken).toHaveBeenCalledTimes(1)
    const call = mocks.createToken.mock.calls[0][0]
    expect(call.workspaceId).toBe("ws-1")
    expect(call.name).toBe("My token")
    expect(call.permission).toBe("full")
    expect(call.tokenHash).not.toBe(result.token)
    expect(call.tokenPrefix).toBe(result.token.slice(0, 12))
    expect(JSON.stringify(result)).not.toContain(call.tokenHash)
  })

  test("allScopes: true persists null scopes", async () => {
    await (
      createWorkspaceTokenAction as unknown as (
        input: CreateWorkspaceTokenActionInput,
      ) => Promise<{ token: string }>
    )({
      bindArgsParsedInputs: ["ws-1"],
      parsedInput: {
        name: "Unrestricted token",
        permission: "full",
        allScopes: true,
        scopes: ["contacts"],
      },
    })

    const call = mocks.createToken.mock.calls[0][0]
    expect(call.scopes).toBeNull()
  })

  test("allScopes: false persists the explicit scopes array", async () => {
    await (
      createWorkspaceTokenAction as unknown as (
        input: CreateWorkspaceTokenActionInput,
      ) => Promise<{ token: string }>
    )({
      bindArgsParsedInputs: ["ws-1"],
      parsedInput: {
        name: "Scoped token",
        permission: "full",
        allScopes: false,
        scopes: ["contacts", "inbox"],
      },
    })

    const call = mocks.createToken.mock.calls[0][0]
    expect(call.scopes).toEqual(["contacts", "inbox"])
  })

  test("rejects a non-superAdmin member before minting a token", async () => {
    mocks.requireWorkspaceTokenSuperAdmin.mockRejectedValue(
      new Error("You need to be a super admin to manage workspace API tokens"),
    )

    await expect(
      (
        createWorkspaceTokenAction as unknown as (
          input: CreateWorkspaceTokenActionInput,
        ) => Promise<unknown>
      )({
        bindArgsParsedInputs: ["ws-1"],
        parsedInput: {
          name: "My token",
          permission: "full",
          allScopes: true,
          scopes: [],
        },
      }),
    ).rejects.toThrow(SUPER_ADMIN_ERROR_PATTERN)
    expect(mocks.createToken).not.toHaveBeenCalled()
  })

  test("propagates the workspace API token cap error", async () => {
    mocks.createToken.mockRejectedValue(
      new Error("Workspace has reached the maximum of 10 API tokens"),
    )

    await expect(
      (
        createWorkspaceTokenAction as unknown as (
          input: CreateWorkspaceTokenActionInput,
        ) => Promise<unknown>
      )({
        bindArgsParsedInputs: ["ws-1"],
        parsedInput: {
          name: "Overflow",
          permission: "full",
          allScopes: true,
          scopes: [],
        },
      }),
    ).rejects.toThrow(TOKEN_CAP_ERROR_PATTERN)
  })

  test("allScopes: false persists a newly named resource-area scope", async () => {
    await (
      createWorkspaceTokenAction as unknown as (
        input: CreateWorkspaceTokenActionInput,
      ) => Promise<{ token: string }>
    )({
      bindArgsParsedInputs: ["ws-1"],
      parsedInput: {
        name: "Members-scoped token",
        permission: "full",
        allScopes: false,
        scopes: ["members"],
      },
    })

    const call = mocks.createToken.mock.calls[0][0]
    expect(call.scopes).toEqual(["members"])
  })
})
