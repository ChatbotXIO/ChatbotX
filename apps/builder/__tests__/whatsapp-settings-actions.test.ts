// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  findDecryptedSpy,
  removeSpy,
  resolveSpy,
  upsertSpy,
  ensureAppWebhookFieldsSpy,
} = vi.hoisted(() => ({
  findDecryptedSpy: vi.fn(),
  removeSpy: vi.fn(),
  resolveSpy: vi.fn(),
  upsertSpy: vi.fn(),
  ensureAppWebhookFieldsSpy: vi.fn(),
}))
vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, any> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (handler: unknown) => handler
  return { authActionClient: chain }
})
vi.mock("@/lib/log", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock("@chatbotx.io/business", () => ({
  platformCredentialService: {
    findDecrypted: findDecryptedSpy,
    remove: removeSpy,
    upsert: upsertSpy,
  },
}))
vi.mock("@chatbotx.io/integration-whatsapp/api/app-subscriptions", () => ({
  ensureAppWebhookFields: ensureAppWebhookFieldsSpy,
  WHATSAPP_APP_SUBSCRIPTION_OBJECT: {
    WHATSAPP_BUSINESS_ACCOUNT: "whatsapp_business_account",
  },
  WHATSAPP_APP_WEBHOOK_FIELDS: {
    CALLS: "calls",
    ACCOUNT_SETTINGS_UPDATE: "account_settings_update",
  },
}))
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}))
vi.mock("../src/features/platform-credentials/scope", () => ({
  credentialScopeSchema: {},
  resolveCredentialScopedUserId: resolveSpy,
}))
const { whatsappCredentialUpdateSchema } = await import(
  "@chatbotx.io/database/partials"
)
const { deleteWhatsappSettingsAction } = await import(
  "../src/features/platform-credentials/whatsapp/delete-whatsapp-settings.action"
)
const { updateWhatsappSettingsAction } = await import(
  "../src/features/platform-credentials/whatsapp/update-whatsapp-settings.action"
)
const call = (action: unknown) => action as (args: any) => Promise<unknown>
const valid = {
  clientId: "id",
  version: "v1",
  configId: "config",
  systemUserId: "system",
  businessName: "business",
  verifyToken: "verify",
  clientSecret: "secret",
  systemUserToken: "token",
  businessId: "",
}
describe("WhatsApp credential actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveSpy.mockReturnValue("user-1")
    ensureAppWebhookFieldsSpy.mockResolvedValue({
      status: "already-subscribed",
      fields: ["calls"],
    })
  })
  test("upserts all fields", async () => {
    await call(updateWhatsappSettingsAction)({
      ctx: { user: { id: "user-1" } },
      bindArgsParsedInputs: ["user"],
      parsedInput: valid,
    })
    expect(upsertSpy).toHaveBeenCalledWith({
      userId: "user-1",
      type: "whatsapp",
      config: valid,
    })
  })
  test("persists the Conversions API config id when the admin sets one", async () => {
    await call(updateWhatsappSettingsAction)({
      ctx: { user: { id: "user-1" } },
      bindArgsParsedInputs: ["user"],
      parsedInput: { ...valid, capiConfigId: "capi-config" },
    })
    expect(upsertSpy).toHaveBeenCalledWith({
      userId: "user-1",
      type: "whatsapp",
      config: { ...valid, capiConfigId: "capi-config" },
    })
  })
  describe("write-only secrets", () => {
    const stored = {
      ...valid,
      clientSecret: "old-secret",
      systemUserToken: "old-token",
    }
    const run = (parsedInput: Record<string, unknown>) =>
      call(updateWhatsappSettingsAction)({
        ctx: { user: { id: "user-1" } },
        bindArgsParsedInputs: ["user"],
        parsedInput,
      })

    test("a blank secret keeps the stored one, read strictly", async () => {
      findDecryptedSpy.mockResolvedValue({ config: stored })

      await run({ ...valid, clientSecret: "", systemUserToken: "" })

      expect(findDecryptedSpy).toHaveBeenCalledWith({
        userId: "user-1",
        type: "whatsapp",
        strict: true,
      })
      expect(upsertSpy).toHaveBeenCalledWith({
        userId: "user-1",
        type: "whatsapp",
        config: expect.objectContaining({
          clientSecret: "old-secret",
          systemUserToken: "old-token",
        }),
      })
    })

    test("only the secret that was typed replaces the stored one", async () => {
      findDecryptedSpy.mockResolvedValue({ config: stored })

      await run({ ...valid, clientSecret: "new-secret", systemUserToken: "" })

      expect(upsertSpy).toHaveBeenCalledWith({
        userId: "user-1",
        type: "whatsapp",
        config: expect.objectContaining({
          clientSecret: "new-secret",
          systemUserToken: "old-token",
        }),
      })
    })

    test("re-submitting both secrets never reads the stored credential", async () => {
      await run(valid)

      expect(findDecryptedSpy).not.toHaveBeenCalled()
    })

    test("rejects a first save that leaves a secret blank, storing nothing", async () => {
      findDecryptedSpy.mockResolvedValue(undefined)

      await expect(
        run({ ...valid, clientSecret: "", systemUserToken: "" }),
      ).rejects.toThrow("whatsapp.credentialSecretsRequired")

      expect(upsertSpy).not.toHaveBeenCalled()
    })

    test("a failed read of the stored credential aborts the save", async () => {
      findDecryptedSpy.mockRejectedValue(new Error("decrypt failed"))

      await expect(run({ ...valid, clientSecret: "" })).rejects.toThrow(
        "decrypt failed",
      )

      expect(upsertSpy).not.toHaveBeenCalled()
    })
  })

  test("subscribes the app-level 'calls' webhook field after saving", async () => {
    const result = (await call(updateWhatsappSettingsAction)({
      ctx: { user: { id: "user-1" } },
      bindArgsParsedInputs: ["user"],
      parsedInput: valid,
    })) as { callsSubscriptionWarning?: string }

    expect(ensureAppWebhookFieldsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: valid.clientId,
        appSecret: valid.clientSecret,
        verifyToken: valid.verifyToken,
        requiredFields: ["calls"],
      }),
    )
    expect(result.callsSubscriptionWarning).toBeUndefined()
  })
  test("returns a warning (but still saves) when no app subscription exists", async () => {
    ensureAppWebhookFieldsSpy.mockResolvedValue({
      status: "no-subscription",
      fields: [],
    })

    const result = (await call(updateWhatsappSettingsAction)({
      ctx: { user: { id: "user-1" } },
      bindArgsParsedInputs: ["user"],
      parsedInput: valid,
    })) as { callsSubscriptionWarning?: string }

    expect(upsertSpy).toHaveBeenCalled()
    expect(result.callsSubscriptionWarning).toBe(
      "whatsapp.calls.preflight.appSubscriptionMissing",
    )
  })
  test("returns a warning (but still saves) when the subscription call throws", async () => {
    ensureAppWebhookFieldsSpy.mockRejectedValue(new Error("network error"))

    const result = (await call(updateWhatsappSettingsAction)({
      ctx: { user: { id: "user-1" } },
      bindArgsParsedInputs: ["user"],
      parsedInput: valid,
    })) as { callsSubscriptionWarning?: string }

    expect(upsertSpy).toHaveBeenCalled()
    expect(result.callsSubscriptionWarning).toBe(
      "whatsapp.calls.preflight.appSubscriptionFailed",
    )
  })
  test.each([
    "clientId",
    "version",
    "configId",
    "systemUserId",
    "businessName",
    "verifyToken",
  ])("rejects empty %s", (field) => {
    expect(
      whatsappCredentialUpdateSchema.safeParse({ ...valid, [field]: "" })
        .success,
    ).toBe(false)
  })
  test("deletes user and platform credentials", async () => {
    await call(deleteWhatsappSettingsAction)({
      ctx: { user: { id: "u" } },
      bindArgsParsedInputs: ["user"],
    })
    expect(removeSpy).toHaveBeenCalledWith({
      userId: "user-1",
      type: "whatsapp",
    })
    resolveSpy.mockReturnValue(undefined)
    await call(deleteWhatsappSettingsAction)({
      ctx: { user: { id: "a" } },
      bindArgsParsedInputs: ["platform"],
    })
    expect(removeSpy).toHaveBeenCalledWith({
      userId: undefined,
      type: "whatsapp",
    })
  })
})
