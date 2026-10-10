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

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}))

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

const { googleAdsCredentialPublicSchema } = await import(
  "@chatbotx.io/database/partials"
)
const { deleteGoogleAdsSettingsAction } = await import(
  "../src/features/platform-credentials/google-ads/delete-google-ads-settings.action"
)
const { clearGoogleAdsDeveloperTokenAction } = await import(
  "../src/features/platform-credentials/google-ads/clear-google-ads-developer-token.action"
)
const { updateGoogleAdsSettingsAction } = await import(
  "../src/features/platform-credentials/google-ads/update-google-ads-settings.action"
)

type ActionContext = {
  ctx: { user: { id: string } }
  bindArgsParsedInputs: ["user" | "platform"]
}
type UpdateInput = {
  clientId: string
  clientSecret?: string
  developerToken?: string
  uploadMethod?: "dataManager" | "legacy"
}

const callDelete = deleteGoogleAdsSettingsAction as unknown as (
  args: ActionContext,
) => Promise<unknown>
const callClear = clearGoogleAdsDeveloperTokenAction as unknown as (
  args: ActionContext,
) => Promise<unknown>
const callUpdate = updateGoogleAdsSettingsAction as unknown as (
  args: ActionContext & { parsedInput: UpdateInput },
) => Promise<unknown>

const STORED = {
  clientId: "stored-client",
  clientSecret: "stored-secret",
  developerToken: "stored-token",
}
const CTX = { ctx: { user: { id: "user-1" } } }
const update = (
  parsedInput: UpdateInput,
  scope: "user" | "platform" = "platform",
) => callUpdate({ ...CTX, bindArgsParsedInputs: [scope], parsedInput })

describe("Google Ads credential actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    upsertSpy.mockResolvedValue(undefined)
    findDecryptedSpy.mockResolvedValue({ config: STORED })
    removeSpy.mockResolvedValue(undefined)
    resolveScopedUserIdSpy.mockReturnValue("user-1")
  })

  test("upserts a fully submitted credential without reading the stored one", async () => {
    await update({
      clientId: "client-id",
      clientSecret: "client-secret",
      developerToken: "dev-token",
    })

    expect(findDecryptedSpy).not.toHaveBeenCalled()
    expect(upsertSpy).toHaveBeenCalledWith({
      userId: "user-1",
      type: "googleAds",
      config: {
        clientId: "client-id",
        clientSecret: "client-secret",
        developerToken: "dev-token",
      },
    })
  })

  test("a fully submitted credential overwrites an undecryptable stored row", async () => {
    findDecryptedSpy.mockRejectedValue(new Error("decrypt failed"))

    await update({ clientId: "c", clientSecret: "s", developerToken: "d" })

    expect(upsertSpy).toHaveBeenCalledTimes(1)
  })

  test.each([
    ["omitted", undefined],
    ["blank", ""],
  ])("keeps the stored secrets when they are %s", async (_name, blank) => {
    await update({
      clientId: "new-client",
      clientSecret: blank,
      developerToken: blank,
    })

    expect(findDecryptedSpy).toHaveBeenCalledWith({
      userId: "user-1",
      type: "googleAds",
      strict: true,
    })
    expect(upsertSpy.mock.calls[0]?.[0].config).toEqual({
      clientId: "new-client",
      clientSecret: "stored-secret",
      developerToken: "stored-token",
    })
  })

  test("replaces only the secret that was re-entered", async () => {
    await update({ clientId: "c", developerToken: "new-token" })

    expect(upsertSpy.mock.calls[0]?.[0].config).toEqual({
      clientId: "c",
      clientSecret: "stored-secret",
      developerToken: "new-token",
    })
  })

  test("saves with a client secret and no developer token when none is stored", async () => {
    findDecryptedSpy.mockResolvedValue(undefined)

    await update({ clientId: "c", clientSecret: "s" })

    expect(upsertSpy.mock.calls[0]?.[0].config).toEqual({
      clientId: "c",
      clientSecret: "s",
    })
  })

  test("refuses to save when the client secret is blank and none is stored", async () => {
    findDecryptedSpy.mockResolvedValue(undefined)

    await expect(update({ clientId: "c" })).rejects.toThrow(
      "googleAds.errors.credentialSecretsRequired",
    )
    expect(upsertSpy).not.toHaveBeenCalled()
  })

  test("a stored credential without a developer token stays token-less", async () => {
    findDecryptedSpy.mockResolvedValue({
      config: { clientId: "c", clientSecret: "stored-secret" },
    })

    await update({ clientId: "c" })

    expect(upsertSpy.mock.calls[0]?.[0].config).toEqual({
      clientId: "c",
      clientSecret: "stored-secret",
    })
  })

  test.each([
    "dataManager",
    "legacy",
  ] as const)("saves the chosen upload method %s", async (uploadMethod) => {
    await update({
      clientId: "c",
      clientSecret: "s",
      developerToken: "d",
      uploadMethod,
    })

    expect(upsertSpy.mock.calls[0]?.[0].config).toEqual({
      clientId: "c",
      clientSecret: "s",
      developerToken: "d",
      uploadMethod,
    })
  })

  test("keeps the stored upload method when the input omits it", async () => {
    findDecryptedSpy.mockResolvedValue({
      config: { ...STORED, uploadMethod: "legacy" },
    })

    await update({ clientId: "c" })

    expect(upsertSpy.mock.calls[0]?.[0].config).toMatchObject({
      uploadMethod: "legacy",
    })
  })

  test("a new choice overrides the stored upload method", async () => {
    findDecryptedSpy.mockResolvedValue({
      config: { ...STORED, uploadMethod: "legacy" },
    })

    await update({ clientId: "c", uploadMethod: "dataManager" })

    expect(upsertSpy.mock.calls[0]?.[0].config).toMatchObject({
      uploadMethod: "dataManager",
    })
  })

  test("does not save when the stored credential cannot be read", async () => {
    findDecryptedSpy.mockRejectedValue(new Error("decrypt failed"))

    await expect(update({ clientId: "c" })).rejects.toThrow("decrypt failed")
    expect(upsertSpy).not.toHaveBeenCalled()
  })

  test("resolves the tenant-aware owner for the read and the write", async () => {
    resolveScopedUserIdSpy.mockReturnValue("tenant-owner")

    await update({ clientId: "c" }, "user")

    expect(findDecryptedSpy).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "tenant-owner" }),
    )
    expect(upsertSpy.mock.calls[0]?.[0].userId).toBe("tenant-owner")
  })

  test("rejects a non-superadmin on the platform scope before touching storage", async () => {
    resolveScopedUserIdSpy.mockImplementation(() => {
      throw new Error("Unauthorized")
    })

    await expect(
      update({ clientId: "c", clientSecret: "s", developerToken: "d" }),
    ).rejects.toThrow("Unauthorized")
    await expect(
      callDelete({ ...CTX, bindArgsParsedInputs: ["platform"] }),
    ).rejects.toThrow("Unauthorized")
    expect(findDecryptedSpy).not.toHaveBeenCalled()
    expect(upsertSpy).not.toHaveBeenCalled()
    expect(removeSpy).not.toHaveBeenCalled()
  })

  test("the action returns nothing, so secrets never reach the client", async () => {
    expect(
      await update({ clientId: "c", clientSecret: "s", developerToken: "d" }),
    ).toBeUndefined()
  })

  test("the public projection exposes the client id and upload method, never a secret", () => {
    expect(
      googleAdsCredentialPublicSchema.parse({
        ...STORED,
        uploadMethod: "legacy",
      }),
    ).toEqual({
      clientId: "stored-client",
      uploadMethod: "legacy",
      hasDeveloperToken: true,
    })
  })

  test("the public projection flags a missing developer token and never carries it", () => {
    const { developerToken: _omitted, ...withoutToken } = STORED
    const withToken = googleAdsCredentialPublicSchema.parse(STORED)

    expect(googleAdsCredentialPublicSchema.parse(withoutToken)).toEqual({
      clientId: "stored-client",
      hasDeveloperToken: false,
    })
    expect(JSON.stringify(withToken)).not.toContain("stored-token")
    expect(withToken).not.toHaveProperty("developerToken")
    expect(withToken).not.toHaveProperty("clientSecret")
  })

  describe("clearGoogleAdsDeveloperTokenAction", () => {
    const clear = (scope: "user" | "platform" = "platform") =>
      callClear({ ...CTX, bindArgsParsedInputs: [scope] })

    test("drops the stored developer token and keeps every other field", async () => {
      findDecryptedSpy.mockResolvedValue({
        config: { ...STORED, uploadMethod: "legacy" },
      })

      expect(await clear()).toBeUndefined()

      expect(findDecryptedSpy).toHaveBeenCalledWith({
        userId: "user-1",
        type: "googleAds",
        strict: true,
      })
      expect(upsertSpy).toHaveBeenCalledWith({
        userId: "user-1",
        type: "googleAds",
        config: {
          clientId: "stored-client",
          clientSecret: "stored-secret",
          uploadMethod: "legacy",
        },
      })
    })

    test("rejects when no credential is stored", async () => {
      findDecryptedSpy.mockResolvedValue(undefined)

      await expect(clear()).rejects.toThrow(
        "googleAds.errors.credentialSecretsRequired",
      )
      expect(upsertSpy).not.toHaveBeenCalled()
    })

    test("does not write when the stored credential cannot be read", async () => {
      findDecryptedSpy.mockRejectedValue(new Error("decrypt failed"))

      await expect(clear()).rejects.toThrow("decrypt failed")
      expect(upsertSpy).not.toHaveBeenCalled()
    })

    test("resolves the tenant-aware owner for the read and the write", async () => {
      resolveScopedUserIdSpy.mockReturnValue("tenant-owner")

      await clear("user")

      expect(findDecryptedSpy).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "tenant-owner" }),
      )
      expect(upsertSpy.mock.calls[0]?.[0].userId).toBe("tenant-owner")
    })

    test("rejects a non-superadmin on the platform scope before touching storage", async () => {
      resolveScopedUserIdSpy.mockImplementation(() => {
        throw new Error("Unauthorized")
      })

      await expect(clear()).rejects.toThrow("Unauthorized")
      expect(findDecryptedSpy).not.toHaveBeenCalled()
      expect(upsertSpy).not.toHaveBeenCalled()
    })
  })

  test("removes the user-scoped credential", async () => {
    await callDelete({ ...CTX, bindArgsParsedInputs: ["user"] })

    expect(removeSpy).toHaveBeenCalledWith({
      userId: "user-1",
      type: "googleAds",
    })
  })

  test("removes the platform-scoped credential", async () => {
    resolveScopedUserIdSpy.mockReturnValue(undefined)

    await callDelete({ ...CTX, bindArgsParsedInputs: ["platform"] })

    expect(removeSpy).toHaveBeenCalledWith({
      userId: undefined,
      type: "googleAds",
    })
  })
})
