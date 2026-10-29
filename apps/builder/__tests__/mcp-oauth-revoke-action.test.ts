import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ revokeGrant: vi.fn() }))
const returnValidationErrors = vi.fn((_schema: unknown, errors: unknown) => ({
  validationErrors: errors,
}))

vi.mock("@chatbotx.io/business", () => ({
  mcpOAuthService: { revokeGrant: mocks.revokeGrant },
}))
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}))
vi.mock("next-safe-action", () => ({ returnValidationErrors }))
vi.mock("@/features/common/schema", () => ({ workspaceIdrequestParams: {} }))
vi.mock("@/lib/safe-action", () => ({
  workspaceActionClientAllowExpired: {
    bindArgsSchemas: () => ({
      inputSchema: () => ({ action: (handler: unknown) => handler }),
    }),
  },
}))
vi.mock("@/features/mcp-oauth/schema/action", async () => {
  const { z } = await import("zod")
  return {
    revokeMcpOAuthGrantRequest: z.object({ clientId: z.string().min(1) }),
  }
})

const [{ revokeMcpOAuthGrantAction }, { revokeMcpOAuthGrantRequest }] =
  await Promise.all([
    import("../src/features/mcp-oauth/actions/revoke-mcp-oauth-grant.action"),
    import("../src/features/mcp-oauth/schema/action"),
  ])

const callAction = (clientId: string) =>
  (
    revokeMcpOAuthGrantAction as unknown as (input: {
      ctx: { user: { id: string } }
      parsedInput: { clientId: string }
    }) => Promise<unknown>
  )({
    ctx: { user: { id: "user-1" } },
    parsedInput: { clientId },
  })

describe("revokeMcpOAuthGrantAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("revokes the current user's matching grant", async () => {
    mocks.revokeGrant.mockResolvedValue(true)

    await callAction("claude")

    expect(mocks.revokeGrant).toHaveBeenCalledWith({
      clientId: "claude",
      userId: "user-1",
    })
  })

  test("returns a localized validation error when the grant is absent", async () => {
    mocks.revokeGrant.mockResolvedValue(false)

    await expect(callAction("missing")).resolves.toEqual({
      validationErrors: { _errors: ["chatbotxMcp.grants.notFound"] },
    })
  })

  test("rejects an empty client ID", () => {
    expect(() => revokeMcpOAuthGrantRequest.parse({ clientId: "" })).toThrow()
  })
})
