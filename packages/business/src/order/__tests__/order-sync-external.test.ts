import { ECOMMERCE_SETTINGS_DEFAULTS } from "@chatbotx.io/database/partials"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  nextOrderNumber: vi.fn(),
  findByExternalIdForUpdate: vi.fn(),
  insertOrder: vi.fn(),
  updateOrder: vi.fn(),
  insertItems: vi.fn(),
  deleteItems: vi.fn(),
  insertHistory: vi.fn(),
  findDetail: vi.fn(),
  findProductsByIds: vi.fn(),
  invalidate: vi.fn(),
  emitOrderStatus: vi.fn(),
  emitProductOrdered: vi.fn(),
  queueAdd: vi.fn(),
  resolveContactInboxForSend: vi.fn(),
  createOutgoing: vi.fn(),
  getSettings: vi.fn(),
  findContact: vi.fn(),
  findWorkspace: vi.fn(),
  listOrders: vi.fn(),
}))

vi.mock("@chatbotx.io/events", () => ({
  emitOrderStatus: (...args: unknown[]) => mocks.emitOrderStatus(...args),
  emitProductOrdered: (...args: unknown[]) => mocks.emitProductOrdered(...args),
}))
vi.mock("../../discount-code/service", () => ({ discountCodeService: {} }))
vi.mock("../../order-payment/settle", () => ({}))
vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: (...args: unknown[]) => mocks.transaction(...args) },
  isUniqueViolationError: (error: unknown, constraint?: string) =>
    (error as { constraint?: string } | null)?.constraint === constraint,
}))
vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: (...args: unknown[]) => mocks.invalidate(...args),
  withCache: (_key: string, fn: () => unknown) => fn(),
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  ecommerceSettingsRepository: {
    nextOrderNumber: (...args: unknown[]) => mocks.nextOrderNumber(...args),
  },
  orderRepository: {
    findByExternalIdForUpdate: (...args: unknown[]) =>
      mocks.findByExternalIdForUpdate(...args),
    insert: (...args: unknown[]) => mocks.insertOrder(...args),
    update: (...args: unknown[]) => mocks.updateOrder(...args),
    insertItems: (...args: unknown[]) => mocks.insertItems(...args),
    deleteItems: (...args: unknown[]) => mocks.deleteItems(...args),
    insertHistory: (...args: unknown[]) => mocks.insertHistory(...args),
    findDetail: (...args: unknown[]) => mocks.findDetail(...args),
    list: (...args: unknown[]) => mocks.listOrders(...args),
  },
  productRepository: {
    findByIds: (...args: unknown[]) => mocks.findProductsByIds(...args),
  },
}))
vi.mock("../../ecommerce-settings/service", () => ({
  ecommerceSettingsService: {
    get: (...args: unknown[]) => mocks.getSettings(...args),
    storeSource: async () => "chatbotx",
  },
}))
vi.mock("@chatbotx.io/worker-config", () => ({
  NotificationJobAction: { notifyNewOrder: "notifyNewOrder" },
  getNewOrderNotificationJobId: (orderId: string) => `new-order-${orderId}`,
  notificationQueue: { add: (...args: unknown[]) => mocks.queueAdd(...args) },
  IntegrationJobAction: { sendFlow: "sendFlow" },
  integrationQueue: { add: vi.fn() },
}))
vi.mock("../../conversation/service", () => ({
  conversationService: {
    resolveContactInboxForSend: (...args: unknown[]) =>
      mocks.resolveContactInboxForSend(...args),
  },
}))
vi.mock("../../message/service", () => ({
  messageService: {
    createOutgoing: (...args: unknown[]) => mocks.createOutgoing(...args),
  },
}))
vi.mock("../../contact/service", () => ({
  contactService: {
    findById: (...args: unknown[]) => mocks.findContact(...args),
  },
}))
vi.mock("../../workspace/service", () => ({
  workspaceService: {
    findById: (...args: unknown[]) => mocks.findWorkspace(...args),
  },
}))
vi.mock("../../logger", () => ({ logger: { warn: vi.fn() } }))

const { orderService } = await import("../service")
const { nextMirroredStatus } = await import("../../shopify/mappers")

const tx = { name: "tx" }

const values = (overrides: Record<string, unknown> = {}) => ({
  externalName: "#1004",
  contactId: "c1",
  contactInboxId: "ci1",
  conversationId: "conv1",
  inboxId: "in1",
  channel: "messenger",
  paymentMethod: "cod" as const,
  paymentStatus: "unpaid" as const,
  paidAt: null,
  fulfillmentStatus: "unfulfilled" as const,
  currency: "USD",
  subtotal: 129,
  discountTotal: 0,
  couponDiscount: 0,
  shippingTotal: 0,
  serviceFeeTotal: 0,
  taxTotal: 0,
  total: 129,
  ...overrides,
})

const sync = (
  status: "pending" | "accepted" | "shipped",
  extra = {},
  announce = true,
) =>
  orderService.syncExternal({
    workspaceId: "ws1",
    externalId: "gid://shopify/Order/1",
    announce,
    status,
    nextStatus: nextMirroredStatus,
    values: values(extra),
    items: [],
  })

const emittedEvents = () =>
  mocks.emitOrderStatus.mock.calls.map((call) => call[0])

beforeEach(() => {
  vi.clearAllMocks()
  mocks.transaction.mockImplementation(
    async (callback: (client: typeof tx) => unknown) => await callback(tx),
  )
  mocks.nextOrderNumber.mockResolvedValue(12)
  mocks.queueAdd.mockResolvedValue(undefined)
  mocks.insertOrder.mockImplementation(async (row: object) => ({
    id: "o1",
    ...row,
  }))
  mocks.updateOrder.mockImplementation(async (input: { values: object }) => ({
    id: "o1",
    workspaceId: "ws1",
    ...input.values,
  }))
  mocks.findDetail.mockResolvedValue({ id: "o1", number: 12, items: [] })
  mocks.findProductsByIds.mockResolvedValue([])
  mocks.getSettings.mockResolvedValue(ECOMMERCE_SETTINGS_DEFAULTS)
  mocks.findWorkspace.mockResolvedValue({ language: "en" })
  mocks.findContact.mockResolvedValue({ id: "c1" })
  mocks.resolveContactInboxForSend.mockResolvedValue({
    conversation: { id: "conv1", contactInboxes: [] },
    contactInbox: { id: "ci1", inboxId: "in1", channel: "messenger" },
  })
})

describe("orderService.syncExternal", () => {
  test("a new mirrored order is announced once, as placed here", async () => {
    mocks.findByExternalIdForUpdate.mockResolvedValue(undefined)
    const { created } = await sync("pending")
    expect(created).toBe(true)
    expect(mocks.insertOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "shopify",
        externalId: "gid://shopify/Order/1",
        number: 12,
        status: "pending",
      }),
      tx,
    )
    expect(emittedEvents()).toEqual(["newOrder"])
    expect(mocks.emitProductOrdered).toHaveBeenCalledTimes(1)
  })

  test("a re-sync with nothing new fires nothing", async () => {
    mocks.findByExternalIdForUpdate.mockResolvedValue({
      id: "o1",
      workspaceId: "ws1",
      status: "accepted",
      paymentStatus: "paid",
      paidAt: new Date("2026-11-01"),
      contactId: "c1",
    })
    const { created } = await sync("accepted", {
      paymentStatus: "paid",
      paidAt: new Date("2026-11-03"),
    })
    expect(created).toBe(false)
    expect(mocks.insertHistory).not.toHaveBeenCalled()
    expect(emittedEvents()).toEqual([])
    // The first payment time is kept.
    expect(mocks.updateOrder.mock.calls[0]?.[0].values.paidAt).toEqual(
      new Date("2026-11-01"),
    )
  })

  test("a move fires its event, and a payment fires orderPaid", async () => {
    mocks.findByExternalIdForUpdate.mockResolvedValue({
      id: "o1",
      workspaceId: "ws1",
      status: "pending",
      paymentStatus: "unpaid",
      paidAt: null,
      contactId: "c1",
    })
    await sync("accepted", { paymentStatus: "paid", paidAt: new Date() })
    expect(mocks.insertHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        fromStatus: "pending",
        toStatus: "accepted",
        actorType: "system",
      }),
      tx,
    )
    expect(emittedEvents()).toEqual(["orderAccepted", "orderPaid"])
  })

  test("a finished order does not step back", async () => {
    mocks.findByExternalIdForUpdate.mockResolvedValue({
      id: "o1",
      workspaceId: "ws1",
      status: "shipped",
      paymentStatus: "paid",
      paidAt: new Date(),
      contactId: "c1",
    })
    await sync("accepted", { paymentStatus: "paid" })
    expect(mocks.updateOrder.mock.calls[0]?.[0].values.status).toBe("shipped")
    expect(emittedEvents()).toEqual([])
  })

  test("history pulled without announce is written but tells nobody", async () => {
    mocks.findByExternalIdForUpdate.mockResolvedValue(undefined)
    const { created } = await sync(
      "accepted",
      { paymentStatus: "paid", paidAt: new Date() },
      false,
    )
    expect(created).toBe(true)
    expect(mocks.insertOrder).toHaveBeenCalledTimes(1)
    expect(emittedEvents()).toEqual([])
    expect(mocks.emitProductOrdered).not.toHaveBeenCalled()
    expect(mocks.queueAdd).not.toHaveBeenCalled()
    expect(mocks.createOutgoing).not.toHaveBeenCalled()
    expect(mocks.invalidate).toHaveBeenCalled()
  })

  test("losing the race to create the order updates the winner's row", async () => {
    mocks.findByExternalIdForUpdate
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        id: "o1",
        workspaceId: "ws1",
        status: "pending",
        paymentStatus: "unpaid",
        paidAt: null,
        contactId: "c1",
      })
    mocks.insertOrder.mockRejectedValueOnce({
      constraint: "Order_workspaceId_externalId_key",
    })
    const { created, order } = await sync("pending")
    expect(created).toBe(false)
    expect(order.id).toBe("o1")
    expect(mocks.updateOrder).toHaveBeenCalledTimes(1)
  })

  test("any other insert failure is not retried", async () => {
    mocks.findByExternalIdForUpdate.mockResolvedValue(undefined)
    mocks.insertOrder.mockRejectedValueOnce(new Error("boom"))
    await expect(sync("pending")).rejects.toThrow("boom")
    expect(mocks.transaction).toHaveBeenCalledTimes(1)
  })
})

describe("orderService.exportCsv", () => {
  const PAGE_SIZE = 50
  /** A store holding `total` orders, served as the repository pages them. */
  const storeWith = (total: number) => {
    mocks.listOrders.mockImplementation(
      (input: { page: number; perPage: number }) => {
        const limit = Math.min(input.perPage, PAGE_SIZE)
        const start = (input.page - 1) * limit
        const count = Math.max(0, Math.min(limit, total - start))
        return Promise.resolve({
          data: Array.from({ length: count }, (_, index) => ({
            number: start + index + 1,
            externalName: null,
            createdAt: new Date("2026-11-01"),
            status: "pending",
            paymentStatus: "unpaid",
            fulfillmentStatus: null,
            customerName: null,
            customerEmail: null,
            customerPhone: null,
            itemCount: 1,
            currency: "USD",
            total: 10,
          })),
          pageCount: Math.ceil(total / limit),
        })
      },
    )
  }

  test("exports every order, not just the first page", async () => {
    storeWith(120)
    const result = await orderService.exportCsv({ workspaceId: "ws1" })
    expect(result.rowCount).toBe(120)
    expect(result.truncated).toBe(false)
    expect(result.csv.split("\r\n")).toHaveLength(121)
  })

  test("stops at the export limit and says so", async () => {
    storeWith(5001)
    const result = await orderService.exportCsv({ workspaceId: "ws1" })
    expect(result.rowCount).toBe(5000)
    expect(result.truncated).toBe(true)
  })
})
