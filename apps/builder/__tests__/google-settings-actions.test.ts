// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const { findDecryptedSpy, removeSpy, resolveScopedUserIdSpy, upsertSpy } =
  vi.hoisted(() => ({
    findDecryptedSpy: vi.fn(),
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
    findDecrypted: findDecryptedSpy,
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

const BASE_INPUT = {
  clientId: "client-id",
  clientSecret: "client-secret",
  verifyToken: "verify-token",
}
const STORED = { ...BASE_INPUT, adsDeveloperToken: "legacy-token" }
const CTX = { ctx: { user: { id: "user-1" } } }

describe("Google credential actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    upsertSpy.mockResolvedValue(undefined)
    findDecryptedSpy.mockResolvedValue({ config: STORED })
    removeSpy.mockResolvedValue(undefined)
    resolveScopedUserIdSpy.mockReturnValue("user-1")
  })

  test("upserts all submitted Google credential fields", async () => {
    findDecryptedSpy.mockResolvedValue(undefined)
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

  test("saves only the Google fields and never reads the stored credential", async () => {
    await callUpdate({
      ...CTX,
      bindArgsParsedInputs: ["platform"],
      parsedInput: BASE_INPUT,
    })

    expect(findDecryptedSpy).not.toHaveBeenCalled()
    expect(upsertSpy.mock.calls[0]?.[0].config).toEqual(BASE_INPUT)
  })

  test("rejects a non-superadmin on the platform scope before touching storage", async () => {
    resolveScopedUserIdSpy.mockImplementation(() => {
      throw new Error("Unauthorized")
    })

    await expect(
      callUpdate({
        ...CTX,
        bindArgsParsedInputs: ["platform"],
        parsedInput: BASE_INPUT,
      }),
    ).rejects.toThrow("Unauthorized")
    expect(findDecryptedSpy).not.toHaveBeenCalled()
    expect(upsertSpy).not.toHaveBeenCalled()
  })

  test("the action returns nothing, so secrets never reach the client", async () => {
    const result = await callUpdate({
      ...CTX,
      bindArgsParsedInputs: ["platform"],
      parsedInput: BASE_INPUT,
    })

    expect(result).toBeUndefined()
  })

  test("the public projection exposes only the client id", async () => {
    const { googleCredentialPublicSchema } = await import(
      "@chatbotx.io/database/partials"
    )

    expect(googleCredentialPublicSchema.parse(STORED)).toEqual({
      clientId: "client-id",
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
