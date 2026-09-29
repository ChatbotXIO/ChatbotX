// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const { removeSpy, resolveSpy, upsertSpy, ensureAppWebhookFieldsSpy } =
  vi.hoisted(() => ({
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
  platformCredentialService: { remove: removeSpy, upsert: upsertSpy },
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
    "clientSecret",
    "systemUserToken",
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
