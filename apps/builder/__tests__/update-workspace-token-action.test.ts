// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockReplaceToken,
  mockReturnValidationErrors,
  mockUpdateWorkspaceTokenRequest,
} = vi.hoisted(() => ({
  mockReplaceToken: vi.fn().mockResolvedValue(undefined),
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
  workspaceApiTokenService: { replaceToken: mockReplaceToken },
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
// 43 chars of base64url — what randomUrlSafeString(32) produces in the UI.
const VALID_SUFFIX = "Ab1-_".repeat(8).padEnd(43, "Z").slice(0, 43)

describe("updateWorkspaceTokenAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReplaceToken.mockResolvedValue(undefined)
    mockReturnValidationErrors.mockReturnValue({ __validationError: true })
  })

  test("rotation persists only the token digest via replaceToken", async () => {
    const token = `${WORKSPACE_ID}.${VALID_SUFFIX}`
    const expectedHash = await hashToken(token)

    await callAction({
      bindArgsParsedInputs: [WORKSPACE_ID],
      parsedInput: { token },
    })

    expect(mockReplaceToken).toHaveBeenCalledTimes(1)
    expect(mockReplaceToken).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      tokenHash: expectedHash,
    })
  })

  test("rejects a token that does not start with the workspace id and writes nothing", async () => {
    const token = `other-prefix.${VALID_SUFFIX}`

    await callAction({
      bindArgsParsedInputs: [WORKSPACE_ID],
      parsedInput: { token },
    })

    expect(mockReplaceToken).not.toHaveBeenCalled()
    expect(mockReturnValidationErrors).toHaveBeenCalledTimes(1)

    const [schema, errors] = mockReturnValidationErrors.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
    ]
    expect(schema).toBe(mockUpdateWorkspaceTokenRequest)
    expect(errors).toHaveProperty("_errors")
    expect(errors).toHaveProperty("token._errors")
  })

  test("rejects a short, brute-forceable suffix even with the right prefix", async () => {
    await callAction({
      bindArgsParsedInputs: [WORKSPACE_ID],
      parsedInput: { token: `${WORKSPACE_ID}.1234` },
    })

    expect(mockReplaceToken).not.toHaveBeenCalled()
    expect(mockReturnValidationErrors).toHaveBeenCalledTimes(1)
  })

  test("rejects a suffix with characters outside the base64url alphabet", async () => {
    await callAction({
      bindArgsParsedInputs: [WORKSPACE_ID],
      parsedInput: { token: `${WORKSPACE_ID}.${"$".repeat(43)}` },
    })

    expect(mockReplaceToken).not.toHaveBeenCalled()
    expect(mockReturnValidationErrors).toHaveBeenCalledTimes(1)
  })
})
