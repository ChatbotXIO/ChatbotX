// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const { removeSpy, resolveSpy, subscribeSpy, upsertSpy } = vi.hoisted(() => ({
  removeSpy: vi.fn(),
  resolveSpy: vi.fn(),
  subscribeSpy: vi.fn(),
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
vi.mock("@chatbotx.io/integration-tiktok", () => ({
  subscribeWebhook: subscribeSpy,
}))
vi.mock("@/env", () => ({ isCloud: () => true }))
vi.mock("@/lib/oauth-broker", () => ({
  buildBrokerCallbackUrl: (path: string) => path,
}))
vi.mock("../src/features/platform-credentials/scope", () => ({
  credentialScopeSchema: {},
  resolveCredentialScopedUserId: resolveSpy,
}))
const { tiktokCredentialUpdateSchema } = await import(
  "@chatbotx.io/database/partials"
)
const { deleteTiktokSettingsAction } = await import(
  "../src/features/platform-credentials/tiktok/delete-tiktok-settings.action"
)
const { updateTiktokSettingAction } = await import(
  "../src/features/platform-credentials/tiktok/update-tiktok-settings.action"
)
const call = (action: unknown) => action as (args: any) => Promise<unknown>
describe("TikTok credential actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveSpy.mockReturnValue("user-1")
  })
  test("upserts all fields and subscribes webhook", async () => {
    await call(updateTiktokSettingAction)({
      ctx: { user: { id: "user-1" } },
      bindArgsParsedInputs: ["user"],
      parsedInput: { clientId: "id", clientSecret: "secret" },
    })
    expect(upsertSpy).toHaveBeenCalledWith({
      userId: "user-1",
      type: "tiktok",
      config: { clientId: "id", clientSecret: "secret" },
    })
    expect(subscribeSpy).toHaveBeenCalled()
  })
  test.each(["clientId", "clientSecret"])("rejects empty %s", (field) => {
    expect(
      tiktokCredentialUpdateSchema.safeParse({
        clientId: "id",
        clientSecret: "secret",
        [field]: "",
      }).success,
    ).toBe(false)
  })
  test("deletes user and platform credentials", async () => {
    await call(deleteTiktokSettingsAction)({
      ctx: { user: { id: "u" } },
      bindArgsParsedInputs: ["user"],
    })
    expect(removeSpy).toHaveBeenCalledWith({ userId: "user-1", type: "tiktok" })
    resolveSpy.mockReturnValue(undefined)
    await call(deleteTiktokSettingsAction)({
      ctx: { user: { id: "a" } },
      bindArgsParsedInputs: ["platform"],
    })
    expect(removeSpy).toHaveBeenCalledWith({
      userId: undefined,
      type: "tiktok",
    })
  })
})
