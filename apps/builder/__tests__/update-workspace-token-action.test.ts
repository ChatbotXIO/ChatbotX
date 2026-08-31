// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockUpdate,
  mockReturnValidationErrors,
  mockUpdateWorkspaceTokenRequest,
} = vi.hoisted(() => ({
  mockUpdate: vi.fn().mockResolvedValue(undefined),
  mockReturnValidationErrors: vi
    .fn()
    .mockReturnValue({ __validationError: true }),
  mockUpdateWorkspaceTokenRequest: { __schema: "updateWorkspaceTokenRequest" },
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (fn: unknown) => fn
  return { workspaceActionClient: chain }
})

vi.mock("@chatbotx.io/business", () => ({
  workspaceService: { update: mockUpdate },
}))

vi.mock("next-safe-action", () => ({
  returnValidationErrors: mockReturnValidationErrors,
}))

vi.mock("@/features/common/schema", () => ({
  workspaceIdrequestParams: [],
}))

vi.mock("../src/features/workspaces/schema/action", () => ({
  updateWorkspaceTokenRequest: mockUpdateWorkspaceTokenRequest,
}))

const { updateWorkspaceTokenAction } = await import(
  "../src/features/workspaces/actions/update-workspace-token-action"
)
const { hashToken } = await import(
  "../src/features/integration-api/lib/token-hash"
)

// With the safe-action chain mock, the exported action IS the raw handler.
type Handler = (args: {
  bindArgsParsedInputs: [string]
  parsedInput: { token: string }
}) => Promise<unknown>

const callAction = updateWorkspaceTokenAction as unknown as Handler

const WORKSPACE_ID = "ws-123"

describe("updateWorkspaceTokenAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdate.mockResolvedValue(undefined)
    mockReturnValidationErrors.mockReturnValue({ __validationError: true })
  })

  test("rotation writes token and tokenHash together, computed via the real hashToken", async () => {
    const token = `${WORKSPACE_ID}_newtoken`
    const expectedHash = await hashToken(token)

    await callAction({
      bindArgsParsedInputs: [WORKSPACE_ID],
      parsedInput: { token },
    })

    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(mockUpdate).toHaveBeenCalledWith({
      id: WORKSPACE_ID,
      data: { token, tokenHash: expectedHash },
    })
  })

  test("rejects a token that does not start with the workspace id and does not call update", async () => {
    const token = "other-prefix_token"

    await callAction({
      bindArgsParsedInputs: [WORKSPACE_ID],
      parsedInput: { token },
    })

    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockReturnValidationErrors).toHaveBeenCalledTimes(1)

    const [schema, errors] = mockReturnValidationErrors.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
    ]
    expect(schema).toBe(mockUpdateWorkspaceTokenRequest)
    expect(errors).toHaveProperty("_errors")
    expect(errors).toHaveProperty("token._errors")
  })
})
