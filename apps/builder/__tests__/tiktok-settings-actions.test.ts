// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const BROKER_ORIGIN = "https://broker.test"

const {
  findDecryptedForUserSpy,
  removeSpy,
  resolveSpy,
  subscribeSpy,
  upsertSpy,
  mockFindActiveByTenantId,
  mockFindByOwner,
} = vi.hoisted(() => ({
  findDecryptedForUserSpy: vi.fn(),
  removeSpy: vi.fn(),
  resolveSpy: vi.fn(),
  subscribeSpy: vi.fn().mockResolvedValue({ comments: false }),
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
  platformCredentialService: {
    findDecryptedForUser: findDecryptedForUserSpy,
    remove: removeSpy,
    upsert: upsertSpy,
  },
  customDomainService: { findActiveByTenantId: mockFindActiveByTenantId },
  tenantService: { findByOwner: mockFindByOwner },
}))
vi.mock("@chatbotx.io/integration-tiktok", () => ({
  subscribeTiktokWebhooks: subscribeSpy,
}))
vi.mock("@/lib/log", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
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
const features = { messaging: true, comments: true }
describe("TikTok credential actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveSpy.mockReturnValue("user-1")
    findDecryptedForUserSpy.mockResolvedValue(undefined)
    upsertSpy.mockResolvedValue({ id: "credential-1" })
    subscribeSpy.mockResolvedValue({ comments: false })
    mockFindByOwner.mockResolvedValue(undefined)
    mockFindActiveByTenantId.mockResolvedValue(undefined)
  })
  test("upserts all fields and subscribes webhook", async () => {
    await call(updateTiktokSettingAction)({
      ctx: { user: { id: "user-1" } },
      bindArgsParsedInputs: ["user"],
      parsedInput: { clientId: "id", clientSecret: "secret", features },
    })
    expect(upsertSpy).toHaveBeenCalledWith({
      userId: "user-1",
      type: "tiktok",
      config: { clientId: "id", clientSecret: "secret", features },
    })
    expect(subscribeSpy).toHaveBeenCalled()
  })

  // What an app for EEA, Swiss or UK accounts saves: the switch has to reach
  // both the stored credential and the webhook subscription.
  test("stores and subscribes with messaging off", async () => {
    const commentsOnly = { messaging: false, comments: true }
    subscribeSpy.mockResolvedValueOnce({ messaging: false, comments: true })

    await call(updateTiktokSettingAction)({
      ctx: { user: { id: "user-1" } },
      bindArgsParsedInputs: ["user"],
      parsedInput: {
        clientId: "id",
        clientSecret: "secret",
        features: commentsOnly,
      },
    })

    expect(subscribeSpy).toHaveBeenCalledWith(
      { clientId: "id", clientSecret: "secret" },
      `${BROKER_ORIGIN}/integrations/tiktok/webhook`,
      expect.objectContaining({ features: commentsOnly }),
    )
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        config: {
          clientId: "id",
          clientSecret: "secret",
          features: commentsOnly,
        },
      }),
    )
  })

  test("rejects a credential with both features off", () => {
    expect(
      tiktokCredentialUpdateSchema.safeParse({
        clientId: "id",
        clientSecret: "secret",
        features: { messaging: false, comments: false },
      }).success,
    ).toBe(false)
  })

  test("saves an entitled user's credential before subscribing at its broker-scoped webhook URL", async () => {
    await call(updateTiktokSettingAction)({
      ctx: { user: { id: "user-1" } },
      bindArgsParsedInputs: ["user"],
      parsedInput: { clientId: "id", clientSecret: "secret", features },
    })

    expect(upsertSpy).toHaveBeenCalledWith({
      userId: "user-1",
      type: "tiktok",
      config: { clientId: "id", clientSecret: "secret", features },
    })
    expect(subscribeSpy).toHaveBeenCalledWith(
      { clientId: "id", clientSecret: "secret" },
      `${BROKER_ORIGIN}/integrations/tiktok/webhook/c/credential-1`,
      expect.objectContaining({ features }),
    )
    expect(upsertSpy.mock.invocationCallOrder[0]).toBeLessThan(
      subscribeSpy.mock.invocationCallOrder[0],
    )
  })

  test("subscribes the webhook on the tenant's active custom domain for user scope", async () => {
    mockFindByOwner.mockResolvedValue({ id: "t1", status: "active" })
    mockFindActiveByTenantId.mockResolvedValue({ domain: "chat.acme.com" })

    await call(updateTiktokSettingAction)({
      ctx: { user: { id: "user-1" } },
      bindArgsParsedInputs: ["user"],
      parsedInput: { clientId: "id", clientSecret: "secret", features },
    })

    expect(subscribeSpy).toHaveBeenCalledWith(
      { clientId: "id", clientSecret: "secret" },
      "https://chat.acme.com/integrations/tiktok/webhook",
      expect.objectContaining({ features }),
    )
  })

  test("saves an active tenant credential without subscribing the broker URL when no custom domain is active", async () => {
    mockFindByOwner.mockResolvedValue({ id: "t1", status: "active" })

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
    expect(subscribeSpy).not.toHaveBeenCalled()
  })

  test("subscribes the webhook on the broker origin for platform scope, ignoring any tenant domain", async () => {
    resolveSpy.mockReturnValue(undefined)

    await call(updateTiktokSettingAction)({
      ctx: { user: { id: "admin-1" } },
      bindArgsParsedInputs: ["platform"],
      parsedInput: { clientId: "id", clientSecret: "secret", features },
    })

    expect(subscribeSpy).toHaveBeenCalledWith(
      { clientId: "id", clientSecret: "secret" },
      `${BROKER_ORIGIN}/integrations/tiktok/webhook`,
      expect.objectContaining({ features }),
    )
    expect(mockFindByOwner).not.toHaveBeenCalled()
  })

  test("removes a newly saved credential when its broker-scoped subscription fails", async () => {
    subscribeSpy.mockRejectedValueOnce(new Error("subscription failed"))

    await expect(
      call(updateTiktokSettingAction)({
        ctx: { user: { id: "user-1" } },
        bindArgsParsedInputs: ["user"],
        parsedInput: { clientId: "id", clientSecret: "secret" },
      }),
    ).rejects.toThrow("subscription failed")

    expect(removeSpy).toHaveBeenCalledWith({
      userId: "user-1",
      type: "tiktok",
    })
  })

  test("restores an existing credential when its broker-scoped subscription fails", async () => {
    findDecryptedForUserSpy.mockResolvedValue({
      config: { clientId: "old-id", clientSecret: "old-secret" },
    })
    subscribeSpy.mockRejectedValueOnce(new Error("subscription failed"))

    await expect(
      call(updateTiktokSettingAction)({
        ctx: { user: { id: "user-1" } },
        bindArgsParsedInputs: ["user"],
        parsedInput: { clientId: "id", clientSecret: "secret" },
      }),
    ).rejects.toThrow("subscription failed")

    expect(upsertSpy).toHaveBeenLastCalledWith({
      userId: "user-1",
      type: "tiktok",
      config: { clientId: "old-id", clientSecret: "old-secret" },
    })
    expect(removeSpy).not.toHaveBeenCalled()
  })

  test.each(["clientId", "clientSecret"])("rejects empty %s", (field) => {
    expect(
      tiktokCredentialUpdateSchema.safeParse({
        clientId: "id",
        clientSecret: "secret",
        features,
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
