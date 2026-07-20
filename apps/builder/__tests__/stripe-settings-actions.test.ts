// @vitest-environment node
import { describe, expect, test, vi } from "vitest"

const { removeSpy, upsertSpy } = vi.hoisted(() => ({
  removeSpy: vi.fn(),
  upsertSpy: vi.fn(),
}))
vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, any> = {}
  chain.inputSchema = () => chain
  chain.action = (handler: unknown) => handler
  return { authActionClient: chain }
})
vi.mock("@chatbotx.io/business", () => ({
  platformCredentialService: { remove: removeSpy, upsert: upsertSpy },
}))
vi.mock("@/env", () => ({ isCloud: () => true }))
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
describe("Stripe credential actions", () => {
  test("upserts all fields", async () => {
    await call(updateStripeSettingsAction)({
      ctx: { user: { id: "user-1" } },
      parsedInput: {
        publishableKey: "publishable",
        verifyToken: "verify",
        secretKey: "secret",
      },
    })
    expect(upsertSpy).toHaveBeenCalledWith({
      userId: "user-1",
      type: "stripe",
      config: {
        publishableKey: "publishable",
        verifyToken: "verify",
        secretKey: "secret",
      },
    })
  })
  test.each([
    "publishableKey",
    "verifyToken",
    "secretKey",
  ])("rejects empty %s", (field) => {
    expect(
      stripeCredentialUpdateSchema.safeParse({
        publishableKey: "publishable",
        verifyToken: "verify",
        secretKey: "secret",
        [field]: "",
      }).success,
    ).toBe(false)
  })
  test("deletes the cloud credential", async () => {
    await call(deleteStripeSettingsAction)({ ctx: { user: { id: "user-1" } } })
    expect(removeSpy).toHaveBeenCalledWith({ userId: "user-1", type: "stripe" })
  })
})
