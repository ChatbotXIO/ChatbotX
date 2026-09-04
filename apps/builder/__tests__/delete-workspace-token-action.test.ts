import { beforeEach, describe, expect, test, vi } from "vitest"

const SUPER_ADMIN_ERROR_PATTERN = /super admin/

const mocks = vi.hoisted(() => ({
  deleteToken: vi.fn(),
  requireWorkspaceTokenSuperAdmin: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  workspaceApiTokenService: { deleteToken: mocks.deleteToken },
}))

const returnValidationErrors = vi.fn((_schema: unknown, errors: unknown) => ({
  validationErrors: errors,
}))
vi.mock("next-safe-action", () => ({ returnValidationErrors }))

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
  deleteWorkspaceTokenRequest: {},
}))

const { deleteWorkspaceTokenAction } = await import(
  "../src/features/workspaces/actions/delete-workspace-token-action"
)

const callAction = (workspaceId: string, id: string) =>
  (
    deleteWorkspaceTokenAction as unknown as (input: {
      bindArgsParsedInputs: [string]
      parsedInput: { id: string }
    }) => Promise<unknown>
  )({
    bindArgsParsedInputs: [workspaceId],
    parsedInput: { id },
  })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireWorkspaceTokenSuperAdmin.mockResolvedValue(undefined)
})

describe("deleteWorkspaceTokenAction", () => {
  test("deletes the token scoped to the workspace", async () => {
    mocks.deleteToken.mockResolvedValue(true)

    await callAction("ws-1", "token-1")

    expect(mocks.deleteToken).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "token-1",
    })
    expect(returnValidationErrors).not.toHaveBeenCalled()
  })

  test("returns a validation error when no row was deleted", async () => {
    mocks.deleteToken.mockResolvedValue(false)

    await callAction("ws-1", "stale-token")

    expect(returnValidationErrors).toHaveBeenCalledTimes(1)
  })

  test("rejects a non-superAdmin member before deleting a token", async () => {
    mocks.requireWorkspaceTokenSuperAdmin.mockRejectedValue(
      new Error("You need to be a super admin to manage workspace API tokens"),
    )

    await expect(callAction("ws-1", "token-1")).rejects.toThrow(
      SUPER_ADMIN_ERROR_PATTERN,
    )
    expect(mocks.deleteToken).not.toHaveBeenCalled()
  })
})
