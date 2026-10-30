import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  parseStripe: vi.fn(),
  parseStripeAccount: vi.fn(),
  loadStripeAccountWebhook: vi.fn(),
  parsePaypal: vi.fn(),
  loadStripeConnectWebhook: vi.fn(),
  loadPaypalSecret: vi.fn(),
  findByStripeAccount: vi.fn(),
  handleStripeDeauthorized: vi.fn(),
  queueAdd: vi.fn(),
  warn: vi.fn(),
}))

class FakeProviderError extends Error {
  readonly kind: string

  constructor(kind: string) {
    super(kind)
    this.kind = kind
  }
}

vi.mock("@chatbotx.io/payments", () => ({
  parseStripeConnectWebhook: (...args: unknown[]) => mocks.parseStripe(...args),
  parseStripeAccountWebhook: (...args: unknown[]) =>
    mocks.parseStripeAccount(...args),
  parsePaypalWebhook: (...args: unknown[]) => mocks.parsePaypal(...args),
  isPaymentProviderError: (error: unknown) =>
    error instanceof FakeProviderError,
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: { confirmOrderPayment: "confirmOrderPayment" },
  getOrderPaymentEventJobId: (provider: string, eventId: string) =>
    `order-payment-event-${provider}-${eventId}`,
  integrationQueue: { add: (...args: unknown[]) => mocks.queueAdd(...args) },
}))

vi.mock("../../payment-provider/service", () => ({
  paymentProviderService: {
    loadStripeConnectWebhook: (...args: unknown[]) =>
      mocks.loadStripeConnectWebhook(...args),
    loadPaypalSecret: (...args: unknown[]) => mocks.loadPaypalSecret(...args),
    loadStripeAccountWebhook: (...args: unknown[]) =>
      mocks.loadStripeAccountWebhook(...args),
    findByStripeAccount: (...args: unknown[]) =>
      mocks.findByStripeAccount(...args),
    handleStripeDeauthorized: (...args: unknown[]) =>
      mocks.handleStripeDeauthorized(...args),
  },
}))

vi.mock("../../logger", () => ({
  logger: { warn: (...args: unknown[]) => mocks.warn(...args) },
}))

const {
  receivePaypalWebhook,
  receiveStripeAccountWebhook,
  receiveStripeWebhook,
} = await import("../webhooks")

const request = { rawBody: "{}", headers: new Headers() }
const metadata = { workspaceId: "ws1", orderId: "o1", orderPaymentId: "pay1" }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.loadStripeConnectWebhook.mockResolvedValue({
    platformSecretKey: "sk",
    webhookSecret: "whsec",
  })
  mocks.loadPaypalSecret.mockResolvedValue({ webhookId: "WH-1" })
  mocks.loadStripeAccountWebhook.mockResolvedValue({
    secretKey: "sk_test_store",
    webhookSecret: "whsec_store",
  })
  mocks.findByStripeAccount.mockResolvedValue({ workspaceId: "ws1" })
})

describe("receiveStripeWebhook", () => {
  test("queues a signed payment event once per Stripe event", async () => {
    mocks.parseStripe.mockResolvedValue({
      kind: "checkout",
      eventId: "evt_1",
      reference: "cs_1",
      metadata,
      account: "acct_1",
    })
    await expect(
      receiveStripeWebhook({ platformCredentialId: "cred1", ...request }),
    ).resolves.toEqual({ status: 200 })
    expect(mocks.findByStripeAccount).toHaveBeenCalledWith({
      platformCredentialId: "cred1",
      accountId: "acct_1",
    })
    expect(mocks.queueAdd).toHaveBeenCalledWith(
      "confirmOrderPayment",
      {
        type: "confirmOrderPayment",
        data: {
          provider: "stripe",
          workspaceId: "ws1",
          reference: "cs_1",
          metadata,
        },
      },
      { jobId: "order-payment-event-stripe-evt_1" },
    )
  })

  test("a bad signature is 400 and queues nothing", async () => {
    mocks.parseStripe.mockRejectedValue(
      new FakeProviderError("signatureInvalid"),
    )
    await expect(
      receiveStripeWebhook({ platformCredentialId: "cred1", ...request }),
    ).resolves.toEqual({ status: 400 })
    expect(mocks.queueAdd).not.toHaveBeenCalled()
  })

  test("an unknown platform credential is 404", async () => {
    mocks.loadStripeConnectWebhook.mockResolvedValue(null)
    await expect(
      receiveStripeWebhook({ platformCredentialId: "cred9", ...request }),
    ).resolves.toEqual({ status: 404 })
  })

  test("an event naming another workspace than the account's is ignored", async () => {
    mocks.parseStripe.mockResolvedValue({
      kind: "checkout",
      eventId: "evt_1",
      reference: "cs_1",
      metadata: { ...metadata, workspaceId: "ws2" },
      account: "acct_1",
    })
    await receiveStripeWebhook({ platformCredentialId: "cred1", ...request })
    expect(mocks.queueAdd).not.toHaveBeenCalled()
  })

  test("the platform's own events and unknown accounts are ignored", async () => {
    mocks.parseStripe.mockResolvedValue({
      kind: "checkout",
      eventId: "evt_1",
      reference: "cs_1",
      metadata: null,
      account: null,
    })
    await receiveStripeWebhook({ platformCredentialId: "cred1", ...request })
    mocks.parseStripe.mockResolvedValue({
      kind: "checkout",
      eventId: "evt_2",
      reference: "cs_2",
      metadata: null,
      account: "acct_unknown",
    })
    mocks.findByStripeAccount.mockResolvedValue(undefined)
    await receiveStripeWebhook({ platformCredentialId: "cred1", ...request })
    expect(mocks.queueAdd).not.toHaveBeenCalled()
  })

  test("a store disconnecting from Stripe's side is applied", async () => {
    mocks.parseStripe.mockResolvedValue({
      kind: "deauthorized",
      eventId: "evt_3",
      account: "acct_1",
    })
    await receiveStripeWebhook({ platformCredentialId: "cred1", ...request })
    expect(mocks.handleStripeDeauthorized).toHaveBeenCalledWith({
      platformCredentialId: "cred1",
      accountId: "acct_1",
    })
  })
})

describe("receivePaypalWebhook", () => {
  test("queues a PayPal-verified event for the workspace", async () => {
    mocks.parsePaypal.mockResolvedValue({
      kind: "checkout",
      eventId: "WH-EVT-1",
      reference: "ORDER-1",
      metadata,
      account: null,
    })
    await expect(
      receivePaypalWebhook({ workspaceId: "ws1", ...request }),
    ).resolves.toEqual({ status: 200 })
    expect(mocks.queueAdd).toHaveBeenCalledWith(
      "confirmOrderPayment",
      expect.objectContaining({
        data: expect.objectContaining({
          provider: "paypal",
          workspaceId: "ws1",
          reference: "ORDER-1",
        }),
      }),
      { jobId: "order-payment-event-paypal-WH-EVT-1" },
    )
  })

  test("a workspace without PayPal is 404; a bad signature 400", async () => {
    mocks.loadPaypalSecret.mockResolvedValueOnce(null)
    await expect(
      receivePaypalWebhook({ workspaceId: "ws1", ...request }),
    ).resolves.toEqual({ status: 404 })
    mocks.parsePaypal.mockRejectedValue(
      new FakeProviderError("signatureInvalid"),
    )
    await expect(
      receivePaypalWebhook({ workspaceId: "ws1", ...request }),
    ).resolves.toEqual({ status: 400 })
    expect(mocks.queueAdd).not.toHaveBeenCalled()
  })
})

describe("receiveStripeAccountWebhook", () => {
  test("queues an event of this workspace's attempt", async () => {
    mocks.parseStripeAccount.mockResolvedValue({
      kind: "checkout",
      eventId: "evt_1",
      reference: "cs_1",
      metadata,
      account: null,
    })
    await expect(
      receiveStripeAccountWebhook({ workspaceId: "ws1", ...request }),
    ).resolves.toEqual({ status: 200 })
    expect(mocks.parseStripeAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        secretKey: "sk_test_store",
        webhookSecret: "whsec_store",
      }),
    )
    expect(mocks.queueAdd).toHaveBeenCalledWith(
      "confirmOrderPayment",
      expect.objectContaining({
        data: expect.objectContaining({
          provider: "stripe",
          workspaceId: "ws1",
          reference: "cs_1",
        }),
      }),
      { jobId: "order-payment-event-stripe-evt_1" },
    )
  })

  test.each([
    ["another workspace's attempt", { ...metadata, workspaceId: "ws2" }],
    ["a payment made outside the shop", null],
  ])("ignores %s on the same account", async (_, eventMetadata) => {
    mocks.parseStripeAccount.mockResolvedValue({
      kind: "checkout",
      eventId: "evt_1",
      reference: "cs_1",
      metadata: eventMetadata,
      account: null,
    })
    await expect(
      receiveStripeAccountWebhook({ workspaceId: "ws1", ...request }),
    ).resolves.toEqual({ status: 200 })
    expect(mocks.queueAdd).not.toHaveBeenCalled()
  })

  test("a workspace without a key connection is 404; a bad signature 400", async () => {
    mocks.loadStripeAccountWebhook.mockResolvedValueOnce(null)
    await expect(
      receiveStripeAccountWebhook({ workspaceId: "ws1", ...request }),
    ).resolves.toEqual({ status: 404 })
    mocks.parseStripeAccount.mockRejectedValue(
      new FakeProviderError("signatureInvalid"),
    )
    await expect(
      receiveStripeAccountWebhook({ workspaceId: "ws1", ...request }),
    ).resolves.toEqual({ status: 400 })
    expect(mocks.queueAdd).not.toHaveBeenCalled()
  })
})
