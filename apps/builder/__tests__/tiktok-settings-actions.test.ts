// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const BROKER_ORIGIN = "https://broker.test"

const {
  createIdSpy,
  findForUserSpy,
  removeSpy,
  resolveSpy,
  subscribeSpy,
  upsertSpy,
  mockFindActiveByTenantId,
  mockFindByOwner,
} = vi.hoisted(() => ({
  createIdSpy: vi.fn(() => "generated-credential-id"),
  findForUserSpy: vi.fn(),
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
    findDecryptedForUser: vi.fn(),
    findForUser: findForUserSpy,
    remove: removeSpy,
    upsert: upsertSpy,
  },
  customDomainService: { findActiveByTenantId: mockFindActiveByTenantId },
  tenantService: { findByOwner: mockFindByOwner },
}))
vi.mock("@chatbotx.io/integration-tiktok", () => ({
  subscribeTiktokWebhooks: subscribeSpy,
}))
vi.mock("@chatbotx.io/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/utils")>()),
  createId: createIdSpy,
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
    createIdSpy.mockReturnValue("generated-credential-id")
    resolveSpy.mockReturnValue("user-1")
    findForUserSpy.mockResolvedValue(undefined)
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

  test("subscribes before saving a new credential with its generated id", async () => {
    await call(updateTiktokSettingAction)({
      ctx: { user: { id: "user-1" } },
      bindArgsParsedInputs: ["user"],
      parsedInput: { clientId: "id", clientSecret: "secret", features },
    })

    expect(subscribeSpy).toHaveBeenCalledWith(
      { clientId: "id", clientSecret: "secret" },
      `${BROKER_ORIGIN}/integrations/tiktok/webhook/c/generated-credential-id`,
      expect.any(Function),
    )
    expect(upsertSpy).toHaveBeenCalledWith({
      id: "generated-credential-id",
      userId: "user-1",
      type: "tiktok",
      config: { clientId: "id", clientSecret: "secret", features },
    })
    expect(subscribeSpy.mock.invocationCallOrder[0]).toBeLessThan(
      upsertSpy.mock.invocationCallOrder[0],
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

  test("subscribes an active tenant without a custom domain at the broker URL", async () => {
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
    expect(subscribeSpy).toHaveBeenCalledWith(
      { clientId: "id", clientSecret: "secret" },
      `${BROKER_ORIGIN}/integrations/tiktok/webhook`,
      expect.any(Function),
    )
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

  test("does not save when a broker-scoped subscription fails", async () => {
    subscribeSpy.mockRejectedValueOnce(new Error("subscription failed"))

    await expect(
      call(updateTiktokSettingAction)({
        ctx: { user: { id: "user-1" } },
        bindArgsParsedInputs: ["user"],
        parsedInput: { clientId: "id", clientSecret: "secret" },
      }),
    ).rejects.toThrow("subscription failed")

    expect(upsertSpy).not.toHaveBeenCalled()
    expect(removeSpy).not.toHaveBeenCalled()
  })

  test("reuses an existing credential id before saving", async () => {
    findForUserSpy.mockResolvedValue({ id: "existing-credential-id" })

    await call(updateTiktokSettingAction)({
      ctx: { user: { id: "user-1" } },
      bindArgsParsedInputs: ["user"],
      parsedInput: { clientId: "id", clientSecret: "secret" },
    })

    expect(subscribeSpy).toHaveBeenCalledWith(
      { clientId: "id", clientSecret: "secret" },
      `${BROKER_ORIGIN}/integrations/tiktok/webhook/c/existing-credential-id`,
      expect.any(Function),
    )
    expect(upsertSpy).toHaveBeenCalledWith({
      id: "existing-credential-id",
      userId: "user-1",
      type: "tiktok",
      config: { clientId: "id", clientSecret: "secret" },
    })
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
