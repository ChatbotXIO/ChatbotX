// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const BROKER_ORIGIN = "https://broker.test"

const {
  removeSpy,
  resolveSpy,
  subscribeSpy,
  upsertSpy,
  mockFindActiveByTenantId,
  mockFindByOwner,
} = vi.hoisted(() => ({
  removeSpy: vi.fn(),
  resolveSpy: vi.fn(),
  subscribeSpy: vi.fn(),
  upsertSpy: vi.fn(),
  mockFindActiveByTenantId: vi.fn(),
  mockFindByOwner: vi.fn(),
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
  customDomainService: { findActiveByTenantId: mockFindActiveByTenantId },
  tenantService: { findByOwner: mockFindByOwner },
}))
vi.mock("@chatbotx.io/integration-tiktok", () => ({
  subscribeWebhook: subscribeSpy,
}))
vi.mock("@/env", () => ({ isCloud: () => true }))
vi.mock("@/lib/oauth-broker", () => ({
  getBrokerOrigin: () => BROKER_ORIGIN,
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
    mockFindByOwner.mockResolvedValue(undefined)
    mockFindActiveByTenantId.mockResolvedValue(undefined)
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

  test("subscribes the webhook on the broker origin for user scope with no active custom domain", async () => {
    await call(updateTiktokSettingAction)({
      ctx: { user: { id: "user-1" } },
      bindArgsParsedInputs: ["user"],
      parsedInput: { clientId: "id", clientSecret: "secret" },
    })

    expect(subscribeSpy).toHaveBeenCalledWith(
      { clientId: "id", clientSecret: "secret" },
      `${BROKER_ORIGIN}/integrations/tiktok/webhook`,
    )
  })

  test("subscribes the webhook on the tenant's active custom domain for user scope", async () => {
    mockFindByOwner.mockResolvedValue({ id: "t1", status: "active" })
    mockFindActiveByTenantId.mockResolvedValue({ domain: "chat.acme.com" })

    await call(updateTiktokSettingAction)({
      ctx: { user: { id: "user-1" } },
      bindArgsParsedInputs: ["user"],
      parsedInput: { clientId: "id", clientSecret: "secret" },
    })

    expect(subscribeSpy).toHaveBeenCalledWith(
      { clientId: "id", clientSecret: "secret" },
      "https://chat.acme.com/integrations/tiktok/webhook",
    )
  })

  test("subscribes the webhook on the broker origin for platform scope, ignoring any tenant domain", async () => {
    resolveSpy.mockReturnValue(undefined)

    await call(updateTiktokSettingAction)({
      ctx: { user: { id: "admin-1" } },
      bindArgsParsedInputs: ["platform"],
      parsedInput: { clientId: "id", clientSecret: "secret" },
    })

    expect(subscribeSpy).toHaveBeenCalledWith(
      { clientId: "id", clientSecret: "secret" },
      `${BROKER_ORIGIN}/integrations/tiktok/webhook`,
    )
    expect(mockFindByOwner).not.toHaveBeenCalled()
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
