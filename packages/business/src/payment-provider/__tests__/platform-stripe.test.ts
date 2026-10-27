import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findDecrypted: vi.fn(),
  find: vi.fn(),
  upsert: vi.fn(),
  remove: vi.fn(),
  countByPlatformCredential: vi.fn(),
  readPlatformStripeAccountId: vi.fn(),
  ensureStripeConnectWebhook: vi.fn(),
  deleteStripeConnectWebhook: vi.fn(),
  warn: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  paymentProviderRepository: {
    countByPlatformCredential: (...args: unknown[]) =>
      mocks.countByPlatformCredential(...args),
  },
}))

vi.mock("@chatbotx.io/payments", () => ({
  readPlatformStripeAccountId: (...args: unknown[]) =>
    mocks.readPlatformStripeAccountId(...args),
  ensureStripeConnectWebhook: (...args: unknown[]) =>
    mocks.ensureStripeConnectWebhook(...args),
  deleteStripeConnectWebhook: (...args: unknown[]) =>
    mocks.deleteStripeConnectWebhook(...args),
  isPaymentProviderError: () => false,
}))

vi.mock("../../platform-credential/service", () => ({
  platformCredentialService: {
    findDecrypted: (...args: unknown[]) => mocks.findDecrypted(...args),
    find: (...args: unknown[]) => mocks.find(...args),
    upsert: (...args: unknown[]) => mocks.upsert(...args),
    remove: (...args: unknown[]) => mocks.remove(...args),
  },
}))

vi.mock("../service", () => ({
  stripeConnectWebhookPath: (id: string) =>
    `/api/payments/stripe/webhook/${id}`,
}))

vi.mock("../../logger", () => ({
  logger: { warn: (...args: unknown[]) => mocks.warn(...args) },
}))

const { removePlatformStripe, savePlatformStripe } = await import(
  "../platform-stripe"
)

const input = {
  userId: undefined,
  publishableKey: "pk_test_1",
  verifyToken: "verify",
  secretKey: "sk_test_new",
  connectClientId: "ca_1",
  webhookOrigin: "https://app.test",
}

const existing = {
  id: "cred1",
  config: {
    publishableKey: "pk_test_1",
    verifyToken: "verify",
    secretKey: "sk_test_old",
    connectClientId: "ca_1",
    platformAccountId: "acct_platform",
    connectWebhookEndpointId: "we_1",
    connectWebhookSecret: "whsec_1",
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findDecrypted.mockResolvedValue(existing)
  mocks.find.mockResolvedValue({ id: "cred1" })
  mocks.countByPlatformCredential.mockResolvedValue(0)
  mocks.ensureStripeConnectWebhook.mockResolvedValue({
    endpointId: "we_1",
    secret: "whsec_1",
  })
})

describe("savePlatformStripe", () => {
  test("a new key of the same account keeps the Connect webhook", async () => {
    mocks.readPlatformStripeAccountId.mockResolvedValue("acct_platform")
    await savePlatformStripe(input)
    expect(mocks.ensureStripeConnectWebhook).toHaveBeenCalledWith({
      platformSecretKey: "sk_test_new",
      url: "https://app.test/api/payments/stripe/webhook/cred1",
      existing: { endpointId: "we_1", secret: "whsec_1" },
    })
    expect(mocks.deleteStripeConnectWebhook).not.toHaveBeenCalled()
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          platformAccountId: "acct_platform",
          connectWebhookSecret: "whsec_1",
        }),
      }),
    )
  })

  test("a key of another Stripe account is refused while stores are connected", async () => {
    mocks.readPlatformStripeAccountId.mockResolvedValue("acct_other")
    mocks.countByPlatformCredential.mockResolvedValue(3)
    await expect(savePlatformStripe(input)).rejects.toMatchObject({
      code: "stripePlatformAccountInUse",
      data: { count: 3 },
    })
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  test("a key Stripe refuses is never saved", async () => {
    mocks.readPlatformStripeAccountId.mockRejectedValue(
      new Error("Invalid API Key"),
    )
    await expect(savePlatformStripe(input)).rejects.toBeDefined()
    expect(mocks.upsert).not.toHaveBeenCalled()
  })
})

describe("removePlatformStripe", () => {
  test("is refused while stores are connected through it", async () => {
    mocks.countByPlatformCredential.mockResolvedValue(1)
    await expect(
      removePlatformStripe({ userId: undefined }),
    ).rejects.toMatchObject({ code: "stripePlatformAccountInUse" })
    expect(mocks.remove).not.toHaveBeenCalled()
  })
})
