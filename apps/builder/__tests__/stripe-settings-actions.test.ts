// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const { removeSpy, saveSpy, isSuperAdminSpy, isCloudSpy } = vi.hoisted(() => ({
  removeSpy: vi.fn(),
  saveSpy: vi.fn(),
  isSuperAdminSpy: vi.fn(),
  isCloudSpy: vi.fn(),
}))
vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, any> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (handler: unknown) => handler
  return { authActionClient: chain }
})
vi.mock("@chatbotx.io/business", () => ({
  removePlatformStripe: removeSpy,
  savePlatformStripe: saveSpy,
  isSuperAdmin: isSuperAdminSpy,
  canUseOwnCredentials: vi.fn().mockResolvedValue(true),
}))
vi.mock("@/env", () => ({ isCloud: () => isCloudSpy() }))
vi.mock("@/lib/provider-origin", () => ({
  // A reseller's own app on their domain, the platform's on the broker.
  resolveProviderOriginForCredential: async (credential: {
    userId: string | null
  }) =>
    credential.userId
      ? `https://${credential.userId}.example`
      : "https://broker.example",
}))
const { stripeCredentialUpdateSchema } = await import(
  "@chatbotx.io/database/partials"
)
const { deleteStripeSettingsAction } = await import(
  "../src/features/platform-credentials/stripe/delete-stripe-settings.action"
)
const { updateStripeSettingsAction } = await import(
  "../src/features/platform-credentials/stripe/update-stripe-settings.action"
)
const call = (action: unknown) => action as (args: any) => Promise<unknown>

const input = {
  publishableKey: "publishable",
  verifyToken: "verify",
  secretKey: "secret",
  connectClientId: "ca_123",
}

beforeEach(() => {
  vi.clearAllMocks()
  isCloudSpy.mockReturnValue(true)
  isSuperAdminSpy.mockResolvedValue(false)
})

describe("Stripe credential actions", () => {
  test("a reseller saves their own settings, with the Connect client id", async () => {
    await call(updateStripeSettingsAction)({
      ctx: { user: { id: "user-1" } },
      bindArgsParsedInputs: ["user"],
      parsedInput: input,
    })
    expect(saveSpy).toHaveBeenCalledWith({
      userId: "user-1",
      ...input,
      webhookOrigin: "https://user-1.example",
    })
  })

  test("the Connect client id is required: stores cannot connect without it", () => {
    const { connectClientId: _omitted, ...withoutClientId } = input
    expect(
      stripeCredentialUpdateSchema.safeParse(withoutClientId).success,
    ).toBe(false)
  })

  test("only a super admin writes the platform-wide settings", async () => {
    isCloudSpy.mockReturnValue(false)
    await expect(
      call(updateStripeSettingsAction)({
        ctx: { user: { id: "user-1" } },
        bindArgsParsedInputs: ["user"],
        parsedInput: input,
      }),
    ).rejects.toThrow("Unauthorized")
    expect(saveSpy).not.toHaveBeenCalled()

    isSuperAdminSpy.mockResolvedValue(true)
    await call(updateStripeSettingsAction)({
      ctx: { user: { id: "admin-1" } },
      bindArgsParsedInputs: ["platform"],
      parsedInput: input,
    })
    expect(saveSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: undefined,
        webhookOrigin: "https://broker.example",
      }),
    )
  })

  test.each([
    "publishableKey",
    "verifyToken",
    "secretKey",
    "connectClientId",
  ])("rejects empty %s", (field) => {
    expect(
      stripeCredentialUpdateSchema.safeParse({ ...input, [field]: "" }).success,
    ).toBe(false)
  })

  test("rejects a Connect client id that is not one", () => {
    expect(
      stripeCredentialUpdateSchema.safeParse({
        ...input,
        connectClientId: "pk_live_123",
      }).success,
    ).toBe(false)
  })

  test("deletes the cloud credential", async () => {
    await call(deleteStripeSettingsAction)({
      ctx: { user: { id: "user-1" } },
      bindArgsParsedInputs: ["user"],
    })
    expect(removeSpy).toHaveBeenCalledWith({ userId: "user-1" })
  })
})
