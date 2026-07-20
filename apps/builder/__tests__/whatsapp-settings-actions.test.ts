// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const { removeSpy, resolveSpy, upsertSpy } = vi.hoisted(() => ({
  removeSpy: vi.fn(),
  resolveSpy: vi.fn(),
  upsertSpy: vi.fn(),
}))
vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, any> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (handler: unknown) => handler
  return { authActionClient: chain }
})
vi.mock("@chatbotx.io/business", () => ({
  platformCredentialService: { remove: removeSpy, upsert: upsertSpy },
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
