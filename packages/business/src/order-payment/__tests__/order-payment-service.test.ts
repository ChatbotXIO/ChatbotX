import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  findOrder: vi.fn(),
  findOrderForUpdate: vi.fn(),
  markPaid: vi.fn(),
  listAttempts: vi.fn(),
  findAttemptByReference: vi.fn(),
  findAttemptForUpdate: vi.fn(),
  insertAttempt: vi.fn(),
  updateAttempt: vi.fn(),
  listOverdue: vi.fn(),
  postponeExpiry: vi.fn(),
  loadGateway: vi.fn(),
  afterPaid: vi.fn(),
  transition: vi.fn(),
  invalidate: vi.fn(),
  findWorkspace: vi.fn(),
  resolveWorkspaceAppUrl: vi.fn(),
  signShopToken: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  gateway: {
    provider: "stripe" as const,
    toMinorUnits: vi.fn(),
    createCheckout: vi.fn(),
    getCheckoutStatus: vi.fn(),
    expireCheckout: vi.fn(),
    refund: vi.fn(),
  },
}))

const tx = { name: "tx" }

vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: (...args: unknown[]) => mocks.transaction(...args) },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  orderRepository: {
    find: (...args: unknown[]) => mocks.findOrder(...args),
    findForUpdate: (...args: unknown[]) => mocks.findOrderForUpdate(...args),
    markPaid: (...args: unknown[]) => mocks.markPaid(...args),
  },
  orderPaymentRepository: {
    listByOrder: (...args: unknown[]) => mocks.listAttempts(...args),
    findByReference: (...args: unknown[]) =>
      mocks.findAttemptByReference(...args),
    findForUpdate: (...args: unknown[]) => mocks.findAttemptForUpdate(...args),
    insert: (...args: unknown[]) => mocks.insertAttempt(...args),
    updateStatus: (...args: unknown[]) => mocks.updateAttempt(...args),
  },
  orderPaymentDueRepository: {
    listOverdue: (...args: unknown[]) => mocks.listOverdue(...args),
    postponeExpiry: (...args: unknown[]) => mocks.postponeExpiry(...args),
  },
}))

vi.mock("../../payment-provider/service", () => ({
  paymentProviderService: {
    loadGateway: (...args: unknown[]) => mocks.loadGateway(...args),
  },
}))

vi.mock("../../order/service", () => ({
  orderService: {
    afterPaid: (...args: unknown[]) => mocks.afterPaid(...args),
    transition: (...args: unknown[]) => mocks.transition(...args),
  },
}))

vi.mock("../../workspace/service", () => ({
  workspaceService: {
    findById: (...args: unknown[]) => mocks.findWorkspace(...args),
  },
}))

vi.mock("../../platform/settings", () => ({
  resolveWorkspaceAppUrl: (...args: unknown[]) =>
    mocks.resolveWorkspaceAppUrl(...args),
}))

vi.mock("@chatbotx.io/encryption/shop-token", () => ({
  signShopToken: (...args: unknown[]) => mocks.signShopToken(...args),
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: (...args: unknown[]) => mocks.invalidate(...args),
}))

vi.mock("../../audit/dispatcher", () => ({ dispatchAuditRecord: vi.fn() }))

vi.mock("../../logger", () => ({
  logger: {
    warn: (...args: unknown[]) => mocks.warn(...args),
    error: (...args: unknown[]) => mocks.error(...args),
  },
}))

const { orderPaymentService } = await import("../service")

/** One key per capture try: a declined one never replays for the next. */
const CAPTURE_KEY = /^capture-pay1-[0-9a-f-]{36}$/

const FUTURE = new Date(Date.now() + 20 * 60_000)
const PAST = new Date(Date.now() - 60_000)

const order = (overrides: Record<string, unknown> = {}) => ({
  id: "o1",
  workspaceId: "ws1",
  number: 12,
  status: "pending",
  paymentMethod: "stripe",
  paymentStatus: "unpaid",
  paymentExpiresAt: FUTURE,
  total: 12.5,
  currency: "USD",
  contactId: "c1",
  contactInboxId: "ci1",
  conversationId: "conv1",
  customerEmail: "buyer@example.com",
  ...overrides,
})

const attempt = (overrides: Record<string, unknown> = {}) => ({
  id: "pay1",
  orderId: "o1",
  workspaceId: "ws1",
  provider: "stripe",
  providerReference: "cs_1",
  transactionId: null,
  amount: 12.5,
  currency: "USD",
  status: "open",
  livemode: false,
  checkoutUrl: "https://checkout.stripe.com/c/pay/cs_1",
  expiresAt: new Date(Date.now() + 30 * 60_000),
  ...overrides,
})

const paid = (overrides: Record<string, unknown> = {}) => ({
  state: "paid",
  transactionId: "pi_1",
  amountMinor: 1250,
  currency: "USD",
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.transaction.mockImplementation(
    async (callback: (client: typeof tx) => unknown) => await callback(tx),
  )
  mocks.loadGateway.mockResolvedValue({
    gateway: mocks.gateway,
    livemode: false,
  })
  mocks.gateway.toMinorUnits.mockImplementation((amount: number) =>
    Math.round(amount * 100),
  )
  mocks.gateway.refund.mockResolvedValue({ refundId: "re_1" })
  mocks.findOrderForUpdate.mockResolvedValue(order())
  mocks.findOrder.mockResolvedValue(order())
  mocks.findAttemptForUpdate.mockResolvedValue(attempt())
  mocks.findAttemptByReference.mockResolvedValue(attempt())
  mocks.listAttempts.mockResolvedValue([])
  mocks.markPaid.mockImplementation(async () => ({
    ...order(),
    paymentStatus: "paid",
  }))
  mocks.updateAttempt.mockResolvedValue({})
  mocks.findWorkspace.mockResolvedValue({ id: "ws1", name: "Shop" })
  mocks.resolveWorkspaceAppUrl.mockResolvedValue("https://app.test/")
  mocks.signShopToken.mockResolvedValue("tok+/=")
})

const webhook = (overrides: Record<string, unknown> = {}) =>
  orderPaymentService.handleWebhookEvent({
    provider: "stripe",
    workspaceId: "ws1",
    reference: "cs_1",
    metadata: { workspaceId: "ws1", orderId: "o1", orderPaymentId: "pay1" },
    ...overrides,
  })

describe("orderPaymentService.startCheckout", () => {
  test("opens a page for exactly the order total, back to the customer's order", async () => {
    mocks.gateway.createCheckout.mockResolvedValue({
      reference: "cs_new",
      url: "https://checkout.stripe.com/c/pay/cs_new",
    })
    const result = await orderPaymentService.startCheckout({
      workspaceId: "ws1",
      orderId: "o1",
    })

    expect(result).toEqual({
      url: "https://checkout.stripe.com/c/pay/cs_new",
      expiresAt: FUTURE,
    })
    const [input] = mocks.gateway.createCheckout.mock.calls[0] as [
      Record<string, unknown> & {
        metadata: { orderPaymentId: string }
        idempotencyKey: string
        expiresAt: Date
      },
    ]
    expect(input).toMatchObject({
      amount: 12.5,
      currency: "USD",
      description: "Shop #12",
      customerEmail: "buyer@example.com",
      returnUrl:
        "https://app.test/shop/ws1/orders/o1?shopToken=tok%2B%2F%3D&payment=return",
      cancelUrl:
        "https://app.test/shop/ws1/orders/o1?shopToken=tok%2B%2F%3D&payment=cancelled",
      metadata: { workspaceId: "ws1", orderId: "o1" },
    })
    expect(input.idempotencyKey).toBe(
      `order-payment-${input.metadata.orderPaymentId}`,
    )
    // Stripe insists on 30 minutes; the scan closes it at the deadline.
    expect(input.expiresAt.getTime()).toBeGreaterThanOrEqual(
      Date.now() + 30 * 60_000,
    )
    expect(mocks.insertAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        id: input.metadata.orderPaymentId,
        orderId: "o1",
        provider: "stripe",
        providerReference: "cs_new",
        amount: 12.5,
        currency: "USD",
        status: "open",
      }),
      tx,
    )
    expect(mocks.signShopToken).toHaveBeenCalledWith({
      workspaceId: "ws1",
      contactId: "c1",
      contactInboxId: "ci1",
      conversationId: "conv1",
    })
  })

  test("offers an open page again instead of opening a second one", async () => {
    mocks.listAttempts.mockResolvedValue([attempt()])
    await expect(
      orderPaymentService.startCheckout({ workspaceId: "ws1", orderId: "o1" }),
    ).resolves.toEqual({
      url: "https://checkout.stripe.com/c/pay/cs_1",
      expiresAt: FUTURE,
    })
    expect(mocks.gateway.createCheckout).not.toHaveBeenCalled()
  })

  test.each([
    [{ paymentMethod: "cod" }, "notPaidOnline"],
    [{ paymentStatus: "paid" }, "paid"],
    [{ status: "cancelled" }, "expired"],
    [{ paymentExpiresAt: PAST }, "expired"],
  ])("refuses an order %o (%s)", async (fields, reason) => {
    mocks.findOrderForUpdate.mockResolvedValue(order(fields))
    await expect(
      orderPaymentService.startCheckout({ workspaceId: "ws1", orderId: "o1" }),
    ).rejects.toMatchObject({ code: "orderPaymentNotOpen", data: { reason } })
    expect(mocks.gateway.createCheckout).not.toHaveBeenCalled()
  })
})

describe("orderPaymentService.handleWebhookEvent", () => {
  test("money that matches marks the order paid, then announces it", async () => {
    mocks.gateway.getCheckoutStatus.mockResolvedValue(paid())
    await webhook()

    expect(mocks.markPaid).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws1", orderId: "o1" }),
      tx,
    )
    expect(mocks.updateAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "pay1",
        from: ["open", "expired"],
        values: expect.objectContaining({
          status: "paid",
          transactionId: "pi_1",
        }),
      }),
      tx,
    )
    expect(mocks.afterPaid).toHaveBeenCalledWith(
      expect.objectContaining({ id: "o1", paymentStatus: "paid" }),
    )
    expect(mocks.gateway.refund).not.toHaveBeenCalled()
    // Stripe takes the money on its page: an order waiting for it is captured.
    expect(mocks.gateway.getCheckoutStatus).toHaveBeenCalledWith("cs_1", {
      capture: { idempotencyKey: expect.stringMatching(CAPTURE_KEY) },
    })
  })

  test.each([
    ["a different amount", paid({ amountMinor: 1249 })],
    ["another currency", paid({ currency: "EUR" })],
  ])("money in %s is refunded, never kept", async (_label, status) => {
    mocks.gateway.getCheckoutStatus.mockResolvedValue(status)
    await webhook()

    expect(mocks.markPaid).not.toHaveBeenCalled()
    expect(mocks.afterPaid).not.toHaveBeenCalled()
    expect(mocks.gateway.refund).toHaveBeenCalledWith({
      transactionId: "pi_1",
      idempotencyKey: "refund-pay1",
    })
    expect(mocks.updateAttempt).toHaveBeenLastCalledWith(
      expect.objectContaining({
        values: expect.objectContaining({
          status: "refunded",
          refundId: "re_1",
        }),
      }),
      expect.anything(),
    )
  })

  test.each([
    ["cancelled", { status: "cancelled" }],
    ["already paid by another page", { paymentStatus: "paid" }],
  ])("money for an order %s is refunded, and nothing is captured", async (_label, fields) => {
    mocks.findOrderForUpdate.mockResolvedValue(order(fields))
    mocks.gateway.getCheckoutStatus.mockResolvedValue(paid())
    await webhook()

    expect(mocks.gateway.getCheckoutStatus).toHaveBeenCalledWith(
      "cs_1",
      undefined,
    )
    expect(mocks.markPaid).not.toHaveBeenCalled()
    expect(mocks.gateway.refund).toHaveBeenCalledWith({
      transactionId: "pi_1",
      idempotencyKey: "refund-pay1",
    })
  })

  test("a webhook delivered again changes nothing", async () => {
    mocks.findAttemptForUpdate.mockResolvedValue(attempt({ status: "paid" }))
    await webhook()
    expect(mocks.gateway.getCheckoutStatus).not.toHaveBeenCalled()
    expect(mocks.markPaid).not.toHaveBeenCalled()
    expect(mocks.gateway.refund).not.toHaveBeenCalled()
  })

  test("a refund that fails throws, so the job is retried with the same key", async () => {
    mocks.findOrderForUpdate.mockResolvedValue(order({ status: "cancelled" }))
    mocks.gateway.getCheckoutStatus.mockResolvedValue(paid())
    mocks.gateway.refund.mockRejectedValue(new Error("stripe down"))
    await expect(webhook()).rejects.toMatchObject({ code: "orderRefundFailed" })
    expect(mocks.updateAttempt).not.toHaveBeenCalledWith(
      expect.objectContaining({
        values: expect.objectContaining({ status: "refunded" }),
      }),
      expect.anything(),
    )
  })

  test("a closed page marks the attempt expired", async () => {
    mocks.gateway.getCheckoutStatus.mockResolvedValue({ state: "closed" })
    await webhook()
    expect(mocks.updateAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        from: ["open"],
        values: { status: "expired" },
      }),
      tx,
    )
    expect(mocks.markPaid).not.toHaveBeenCalled()
  })

  test("an attempt of another workspace is ignored", async () => {
    mocks.findAttemptByReference.mockResolvedValue(
      attempt({ workspaceId: "ws2" }),
    )
    await webhook()
    expect(mocks.loadGateway).not.toHaveBeenCalled()
  })

  test("money for an order that was deleted is reported, never refunded blindly", async () => {
    // The order may have been delivered and deleted afterwards.
    mocks.findAttemptByReference.mockResolvedValue(undefined)
    await webhook()
    expect(mocks.loadGateway).not.toHaveBeenCalled()
    expect(mocks.gateway.refund).not.toHaveBeenCalled()
    expect(mocks.warn).toHaveBeenCalled()
  })

  test("a payment ChatbotX did not make is never touched", async () => {
    mocks.findAttemptByReference.mockResolvedValue(undefined)
    await webhook({ metadata: null })
    await webhook({
      metadata: { workspaceId: "ws2", orderId: "o9", orderPaymentId: "p9" },
    })
    expect(mocks.loadGateway).not.toHaveBeenCalled()
    expect(mocks.gateway.refund).not.toHaveBeenCalled()
  })
})

describe("orderPaymentService.expireOrder", () => {
  beforeEach(() => {
    mocks.findOrder.mockResolvedValue(order({ paymentExpiresAt: PAST }))
    mocks.findOrderForUpdate.mockResolvedValue(
      order({ paymentExpiresAt: PAST }),
    )
    mocks.listAttempts.mockResolvedValue([attempt()])
  })

  test("a payment that came in after all keeps the order", async () => {
    mocks.gateway.getCheckoutStatus.mockResolvedValue(paid())
    await expect(
      orderPaymentService.expireOrder({ workspaceId: "ws1", orderId: "o1" }),
    ).resolves.toBe("paid")
    expect(mocks.transition).not.toHaveBeenCalled()
    expect(mocks.afterPaid).toHaveBeenCalled()
  })

  test("nothing paid cancels the order as expired", async () => {
    mocks.gateway.getCheckoutStatus.mockResolvedValue({ state: "open" })
    await expect(
      orderPaymentService.expireOrder({ workspaceId: "ws1", orderId: "o1" }),
    ).resolves.toBe("cancelled")
    expect(mocks.transition).toHaveBeenCalledWith({
      workspaceId: "ws1",
      orderId: "o1",
      to: "cancelled",
      actor: { type: "system" },
      reason: "paymentExpired",
    })
  })

  test("a page paid just as it is closed keeps the order, marked paid, instead of a refund", async () => {
    const { LatePaymentArrivedError } = await import("../settle")
    // Open when read, paid by the time the cancel closes the page.
    mocks.gateway.getCheckoutStatus
      .mockResolvedValueOnce({ state: "open" })
      .mockResolvedValueOnce(paid())
    mocks.transition.mockRejectedValueOnce(new LatePaymentArrivedError())
    await expect(
      orderPaymentService.expireOrder({ workspaceId: "ws1", orderId: "o1" }),
    ).resolves.toBe("paid")
    expect(mocks.afterPaid).toHaveBeenCalled()
    expect(mocks.gateway.refund).not.toHaveBeenCalled()
  })

  test("a page paid at the deadline that cannot be recorded yet is tried again soon", async () => {
    const { LatePaymentArrivedError } = await import("../settle")
    mocks.gateway.getCheckoutStatus
      .mockResolvedValueOnce({ state: "open" })
      .mockRejectedValueOnce(new Error("timeout"))
    mocks.transition.mockRejectedValueOnce(new LatePaymentArrivedError())
    await expect(
      orderPaymentService.expireOrder({ workspaceId: "ws1", orderId: "o1" }),
    ).resolves.toBe("retryLater")
    expect(mocks.postponeExpiry).toHaveBeenCalled()
    expect(mocks.gateway.refund).not.toHaveBeenCalled()
  })

  test("a payment still settling is looked at again later", async () => {
    mocks.gateway.getCheckoutStatus.mockResolvedValue({ state: "processing" })
    await expect(
      orderPaymentService.expireOrder({ workspaceId: "ws1", orderId: "o1" }),
    ).resolves.toBe("processing")
    expect(mocks.transition).not.toHaveBeenCalled()
    expect(mocks.postponeExpiry).toHaveBeenCalled()
  })

  test("a provider that does not answer moves the deadline on", async () => {
    mocks.gateway.getCheckoutStatus.mockRejectedValue(new Error("timeout"))
    await expect(
      orderPaymentService.expireOrder({ workspaceId: "ws1", orderId: "o1" }),
    ).resolves.toBe("retryLater")
    expect(mocks.transition).not.toHaveBeenCalled()
    expect(mocks.postponeExpiry).toHaveBeenCalled()
  })

  test("an order not yet due is left alone", async () => {
    mocks.findOrder.mockResolvedValue(order())
    await expect(
      orderPaymentService.expireOrder({ workspaceId: "ws1", orderId: "o1" }),
    ).resolves.toBe("skipped")
    expect(mocks.loadGateway).not.toHaveBeenCalled()
  })
})

describe("orderPaymentService.settleStaleAttempt", () => {
  const stale = () => attempt({ expiresAt: PAST })

  test("a page still open, for an order paid by another page, is expired", async () => {
    mocks.findOrderForUpdate.mockResolvedValue(order({ paymentStatus: "paid" }))
    mocks.gateway.getCheckoutStatus.mockResolvedValue({ state: "open" })
    await orderPaymentService.settleStaleAttempt(stale() as never)

    // Never captured: the order no longer waits for the money.
    expect(mocks.gateway.getCheckoutStatus).toHaveBeenCalledWith(
      "cs_1",
      undefined,
    )
    expect(mocks.updateAttempt).toHaveBeenCalledWith({
      workspaceId: "ws1",
      id: "pay1",
      from: ["open"],
      values: { status: "expired" },
    })
  })

  test("one still settling is moved behind the others, keeping its page's real end", async () => {
    mocks.gateway.getCheckoutStatus.mockResolvedValue({ state: "processing" })
    await orderPaymentService.settleStaleAttempt(stale() as never)

    // Only touched: `expiresAt` must stay the page's end, or startCheckout
    // would offer a page the provider already closed.
    expect(mocks.updateAttempt).toHaveBeenCalledWith({
      workspaceId: "ws1",
      id: "pay1",
      from: ["open"],
      values: {},
    })
  })
})
