// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const { removeSpy, resolveScopedUserIdSpy, upsertSpy } = vi.hoisted(() => ({
  removeSpy: vi.fn(),
  resolveScopedUserIdSpy: vi.fn(),
  upsertSpy: vi.fn(),
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (handler: unknown) => handler
  return { authActionClient: chain }
})

vi.mock("@chatbotx.io/business", () => ({
  platformCredentialService: {
    remove: removeSpy,
    upsert: upsertSpy,
  },
}))

vi.mock("../src/features/platform-credentials/scope", () => ({
  credentialScopeSchema: {},
  resolveCredentialScopedUserId: resolveScopedUserIdSpy,
}))

const { googleCredentialUpdateSchema } = await import(
  "@chatbotx.io/database/partials"
)
const { deleteGoogleSettingsAction } = await import(
  "../src/features/platform-credentials/google/delete-google-settings.action"
)
const { updateGoogleSettingsAction } = await import(
  "../src/features/platform-credentials/google/update-google-settings.action"
)

type ActionContext = {
  ctx: { user: { id: string } }
  bindArgsParsedInputs: ["user" | "platform"]
}

const callDelete = deleteGoogleSettingsAction as unknown as (
  args: ActionContext,
) => Promise<unknown>
const callUpdate = updateGoogleSettingsAction as unknown as (
  args: ActionContext & {
    parsedInput: {
      clientId: string
      clientSecret: string
      verifyToken: string
    }
  },
) => Promise<unknown>

describe("Google credential actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    upsertSpy.mockResolvedValue(undefined)
    removeSpy.mockResolvedValue(undefined)
    resolveScopedUserIdSpy.mockReturnValue("user-1")
  })

  test("upserts all submitted Google credential fields", async () => {
    await callUpdate({
      ctx: { user: { id: "user-1" } },
      bindArgsParsedInputs: ["user"],
      parsedInput: {
        clientId: "client-id",
        clientSecret: "client-secret",
        verifyToken: "verify-token",
      },
    })

    expect(upsertSpy).toHaveBeenCalledWith({
      userId: "user-1",
      type: "google",
      config: {
        clientId: "client-id",
        clientSecret: "client-secret",
        verifyToken: "verify-token",
      },
    })
  })

  test.each([
    "clientId",
    "clientSecret",
    "verifyToken",
  ])("rejects an empty %s during schema validation", (field) => {
    const input = {
      clientId: "client-id",
      clientSecret: "client-secret",
      verifyToken: "verify-token",
      [field]: "",
    }

    expect(googleCredentialUpdateSchema.safeParse(input).success).toBe(false)
  })

  test("removes the user-scoped Google credential", async () => {
    await callDelete({
      ctx: { user: { id: "user-1" } },
      bindArgsParsedInputs: ["user"],
    })

    expect(removeSpy).toHaveBeenCalledWith({
      userId: "user-1",
      type: "google",
    })
  })

  test("removes the platform-scoped Google credential", async () => {
    resolveScopedUserIdSpy.mockReturnValue(undefined)

    await callDelete({
      ctx: { user: { id: "admin-1" } },
      bindArgsParsedInputs: ["platform"],
    })

    expect(removeSpy).toHaveBeenCalledWith({
      userId: undefined,
      type: "google",
    })
  })
})
