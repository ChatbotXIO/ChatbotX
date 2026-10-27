import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listAttempts: vi.fn(),
  updateAttempt: vi.fn(),
  loadGateway: vi.fn(),
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

const db = { name: "db" }

vi.mock("@chatbotx.io/database/client", () => ({ db }))

vi.mock("@chatbotx.io/database/repositories", () => ({
  orderPaymentRepository: {
    listByOrder: (...args: unknown[]) => mocks.listAttempts(...args),
    updateStatus: (...args: unknown[]) => mocks.updateAttempt(...args),
  },
}))

vi.mock("../../payment-provider/service", () => ({
  paymentProviderService: {
    loadGateway: (...args: unknown[]) => mocks.loadGateway(...args),
  },
}))

vi.mock("../../logger", () => ({
  logger: {
    warn: (...args: unknown[]) => mocks.warn(...args),
    error: (...args: unknown[]) => mocks.error(...args),
  },
}))

const { ChatbotXException } = await import("../../errors")
const { assertDeletableWithPayments, settlePaymentsForCancel } = await import(
  "../settle"
)

const tx = { name: "tx" } as never

const order = (overrides: Record<string, unknown> = {}) =>
  ({
    id: "o1",
    workspaceId: "ws1",
    status: "pending",
    paymentMethod: "stripe",
    paymentStatus: "unpaid",
    ...overrides,
  }) as never

const attempt = (overrides: Record<string, unknown> = {}) => ({
  id: "pay1",
  orderId: "o1",
  workspaceId: "ws1",
  provider: "stripe",
  providerReference: "cs_1",
  transactionId: null,
  status: "open",
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.loadGateway.mockResolvedValue({
    gateway: mocks.gateway,
    livemode: false,
  })
  mocks.gateway.refund.mockResolvedValue({ refundId: "re_1" })
})

describe("settlePaymentsForCancel", () => {
  test("cash on delivery has nothing to settle", async () => {
    await expect(
      settlePaymentsForCancel(order({ paymentMethod: "cod" }), tx),
    ).resolves.toEqual({ refunded: false })
    expect(mocks.listAttempts).not.toHaveBeenCalled()
  })

  test("a paid attempt is refunded in full, once per attempt", async () => {
    mocks.listAttempts.mockResolvedValue([
      attempt({ status: "paid", transactionId: "pi_1" }),
    ])
    await expect(
      settlePaymentsForCancel(order({ paymentStatus: "paid" }), tx),
    ).resolves.toEqual({ refunded: true })
    expect(mocks.gateway.refund).toHaveBeenCalledWith({
      transactionId: "pi_1",
      idempotencyKey: "refund-pay1",
    })
    // Recorded at once, outside the cancel's transaction: a later failure
    // that rolls the cancel back cannot lose it.
    expect(mocks.updateAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "pay1",
        values: expect.objectContaining({
          status: "refunded",
          refundId: "re_1",
          transactionId: "pi_1",
        }),
      }),
      db,
    )
  })

  test("every page is closed before any money goes back", async () => {
    mocks.listAttempts.mockResolvedValue([
      attempt({ id: "pay1", status: "paid", transactionId: "pi_1" }),
      attempt({ id: "pay2", providerReference: "cs_2" }),
    ])
    mocks.gateway.expireCheckout.mockRejectedValue(new Error("stripe down"))
    await expect(settlePaymentsForCancel(order(), tx)).rejects.toBeDefined()
    expect(mocks.gateway.refund).not.toHaveBeenCalled()
  })

  test("a refund made by an earlier try still marks the order refunded", async () => {
    mocks.listAttempts.mockResolvedValue([attempt({ status: "refunded" })])
    await expect(settlePaymentsForCancel(order(), tx)).resolves.toEqual({
      refunded: true,
    })
    expect(mocks.gateway.refund).not.toHaveBeenCalled()
  })

  test("an open page is closed; one paid meanwhile is refunded", async () => {
    mocks.listAttempts.mockResolvedValue([
      attempt({ id: "pay1" }),
      attempt({ id: "pay2", providerReference: "cs_2" }),
    ])
    mocks.gateway.expireCheckout
      .mockResolvedValueOnce({ state: "closed" })
      .mockResolvedValueOnce({
        state: "paid",
        transactionId: "pi_2",
        amountMinor: 100,
        currency: "USD",
      })
    await expect(settlePaymentsForCancel(order(), tx)).resolves.toEqual({
      refunded: true,
    })
    expect(mocks.updateAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ id: "pay1", values: { status: "expired" } }),
      tx,
    )
    expect(mocks.gateway.refund).toHaveBeenCalledWith({
      transactionId: "pi_2",
      idempotencyKey: "refund-pay2",
    })
  })

  test("a refund that fails refuses the cancel", async () => {
    mocks.listAttempts.mockResolvedValue([
      attempt({ status: "paid", transactionId: "pi_1" }),
    ])
    mocks.gateway.refund.mockRejectedValue(new Error("declined"))
    await expect(settlePaymentsForCancel(order(), tx)).rejects.toMatchObject({
      code: "orderRefundFailed",
    })
    expect(mocks.updateAttempt).not.toHaveBeenCalled()
  })

  test("a payment still settling refuses the cancel", async () => {
    mocks.listAttempts.mockResolvedValue([attempt()])
    mocks.gateway.expireCheckout.mockResolvedValue({ state: "processing" })
    await expect(settlePaymentsForCancel(order(), tx)).rejects.toMatchObject({
      code: "orderPaymentProcessing",
    })
  })

  test("a disconnected provider lets open pages go, but keeps a paid order", async () => {
    mocks.loadGateway.mockRejectedValue(
      new ChatbotXException("not connected", "paymentProviderNotConnected"),
    )
    mocks.listAttempts.mockResolvedValue([attempt()])
    await expect(settlePaymentsForCancel(order(), tx)).resolves.toEqual({
      refunded: false,
    })
    expect(mocks.updateAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ values: { status: "expired" } }),
      tx,
    )

    mocks.listAttempts.mockResolvedValue([
      attempt({ status: "paid", transactionId: "pi_1" }),
    ])
    await expect(settlePaymentsForCancel(order(), tx)).rejects.toMatchObject({
      code: "paymentProviderNotConnected",
    })
  })
})

describe("assertDeletableWithPayments", () => {
  test("an open order paid online cannot be deleted", async () => {
    await expect(
      assertDeletableWithPayments(order({ paymentStatus: "paid" }), tx),
    ).rejects.toMatchObject({ code: "orderPaidOnline" })
  })

  test("a page paid meanwhile refuses the delete", async () => {
    mocks.listAttempts.mockResolvedValue([attempt()])
    mocks.gateway.expireCheckout.mockResolvedValue({
      state: "paid",
      transactionId: "pi_1",
      amountMinor: 100,
      currency: "USD",
    })
    await expect(
      assertDeletableWithPayments(order(), tx),
    ).rejects.toMatchObject({ code: "orderPaidOnline" })
  })

  test("a completed or cancelled order is deleted whatever its payment", async () => {
    await assertDeletableWithPayments(
      order({ status: "concluded", paymentStatus: "paid" }),
      tx,
    )
    await assertDeletableWithPayments(order({ status: "cancelled" }), tx)
    expect(mocks.listAttempts).not.toHaveBeenCalled()
  })
})
