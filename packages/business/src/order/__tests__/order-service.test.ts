import { ECOMMERCE_SETTINGS_DEFAULTS } from "@chatbotx.io/database/partials"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  getFresh: vi.fn(),
  findForOrder: vi.fn(),
  lockForStock: vi.fn(),
  adjustInventory: vi.fn(),
  nextOrderNumber: vi.fn(),
  findSettings: vi.fn(),
  insertOrder: vi.fn(),
  insertItems: vi.fn(),
  insertHistory: vi.fn(),
  findDetail: vi.fn(),
  findOrder: vi.fn(),
  transitionStatus: vi.fn(),
  listItems: vi.fn(),
  deleteOrder: vi.fn(),
  invalidate: vi.fn(),
  resolveContactInboxForSend: vi.fn(),
  createOutgoing: vi.fn(),
  warn: vi.fn(),
  getSettings: vi.fn(),
  queueAdd: vi.fn(),
  findContact: vi.fn(),
  findWorkspace: vi.fn(),
  resolveDiscount: vi.fn(),
  redeemDiscount: vi.fn(),
  releaseDiscount: vi.fn(),
  emitOrderStatus: vi.fn(),
  emitProductOrdered: vi.fn(),
}))

vi.mock("@chatbotx.io/events", () => ({
  emitOrderStatus: (...args: unknown[]) => mocks.emitOrderStatus(...args),
  emitProductOrdered: (...args: unknown[]) => mocks.emitProductOrdered(...args),
}))

vi.mock("../../discount-code/service", () => ({
  discountCodeService: {
    resolve: (...args: unknown[]) => mocks.resolveDiscount(...args),
    redeem: (...args: unknown[]) => mocks.redeemDiscount(...args),
    release: (...args: unknown[]) => mocks.releaseDiscount(...args),
  },
}))

const tx = { name: "tx" }

vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: (...args: unknown[]) => mocks.transaction(...args) },
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: (...args: unknown[]) => mocks.invalidate(...args),
  withCache: (_key: string, fn: () => unknown) => fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  ecommerceSettingsRepository: {
    nextOrderNumber: (...args: unknown[]) => mocks.nextOrderNumber(...args),
    find: (...args: unknown[]) => mocks.findSettings(...args),
  },
  orderRepository: {
    insert: (...args: unknown[]) => mocks.insertOrder(...args),
    insertItems: (...args: unknown[]) => mocks.insertItems(...args),
    insertHistory: (...args: unknown[]) => mocks.insertHistory(...args),
    findDetail: (...args: unknown[]) => mocks.findDetail(...args),
    find: (...args: unknown[]) => mocks.findOrder(...args),
    findForUpdate: (...args: unknown[]) => mocks.findOrder(...args),
    transitionStatus: (...args: unknown[]) => mocks.transitionStatus(...args),
    listItems: (...args: unknown[]) => mocks.listItems(...args),
    delete: (...args: unknown[]) => mocks.deleteOrder(...args),
  },
  productRepository: {
    findForOrder: (...args: unknown[]) => mocks.findForOrder(...args),
    lockForStock: (...args: unknown[]) => mocks.lockForStock(...args),
    adjustInventory: (...args: unknown[]) => mocks.adjustInventory(...args),
  },
}))

vi.mock("../../ecommerce-settings/service", () => ({
  ecommerceSettingsService: {
    getFresh: (...args: unknown[]) => mocks.getFresh(...args),
    get: (...args: unknown[]) => mocks.getSettings(...args),
  },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  NotificationJobAction: { notifyNewOrder: "notifyNewOrder" },
  getNewOrderNotificationJobId: (orderId: string) => `new-order-${orderId}`,
  notificationQueue: { add: (...args: unknown[]) => mocks.queueAdd(...args) },
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

vi.mock("../../logger", () => ({
  logger: { warn: (...args: unknown[]) => mocks.warn(...args) },
}))

const { orderService } = await import("../service")

const product = (overrides: Record<string, unknown> = {}) => ({
  id: "p1",
  name: "Shirt",
  price: 10,
  discount: 0,
  taxes: 0,
  sku: "SKU-1",
  images: [{ url: "https://img/1.jpg", type: "link" }],
  vendorId: "v1",
  vendor: {
    name: "Acme",
    isActive: true,
    discountPercent: 0,
    minimumOrderValue: 0,
  },
  categoryId: "c1",
  isActive: true,
  variants: [],
  ...overrides,
})

const settings = (overrides: {
  payments?: Partial<typeof ECOMMERCE_SETTINGS_DEFAULTS.payments>
  shipping?: Partial<typeof ECOMMERCE_SETTINGS_DEFAULTS.shipping>
  checkout?: Partial<typeof ECOMMERCE_SETTINGS_DEFAULTS.checkout>
  general?: Partial<typeof ECOMMERCE_SETTINGS_DEFAULTS.general>
}) => ({
  general: { ...ECOMMERCE_SETTINGS_DEFAULTS.general, ...overrides.general },
  payments: { ...ECOMMERCE_SETTINGS_DEFAULTS.payments, ...overrides.payments },
  shipping: { ...ECOMMERCE_SETTINGS_DEFAULTS.shipping, ...overrides.shipping },
  checkout: { ...ECOMMERCE_SETTINGS_DEFAULTS.checkout, ...overrides.checkout },
})

const placeInput = (overrides: Record<string, unknown> = {}) => ({
  workspaceId: "ws1",
  source: "api" as const,
  actor: { type: "apiToken" as const },
  items: [{ productId: "p1", quantity: 3 }],
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.transaction.mockImplementation(
    async (callback: (client: typeof tx) => unknown) => await callback(tx),
  )
  mocks.getFresh.mockResolvedValue(settings({}))
  mocks.findForOrder.mockResolvedValue([product()])
  mocks.lockForStock.mockResolvedValue([
    {
      id: "p1",
      inventoryPolicy: "dont_track",
      inventoryQuantity: 0,
      allowOutOfStockPurchase: false,
    },
  ])
  mocks.nextOrderNumber.mockResolvedValue(7)
  mocks.insertOrder.mockImplementation(async (values: object) => ({
    id: "o1",
    status: "pending",
    ...values,
  }))
  mocks.findDetail.mockResolvedValue({ id: "o1" })
  mocks.getSettings.mockResolvedValue(
    settings({ general: { notifyOnCartStatusChange: false } }),
  )
  mocks.queueAdd.mockResolvedValue(undefined)
  mocks.findContact.mockResolvedValue({ id: "c1", locale: null })
  mocks.findWorkspace.mockResolvedValue({ id: "ws1", timezone: "UTC" })
  mocks.resolveDiscount.mockResolvedValue(null)
})

describe("orderService.place", () => {
  test("prices lines from the products and adds delivery and service fee", async () => {
    mocks.getFresh.mockResolvedValue(
      settings({
        payments: { currency: "USD", serviceFeePercent: 10 },
        shipping: { shippingType: "delivery", deliveryCost: 5 },
      }),
    )
    mocks.findForOrder.mockResolvedValue([product({ discount: 10, taxes: 5 })])

    await orderService.place(placeInput())

    // gross 30, discount 3, tax 5% of 27 = 1.35, fee 10% of 27 = 2.7, ship 5
    expect(mocks.insertOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws1",
        number: 7,
        source: "api",
        currency: "USD",
        subtotal: 30,
        discountTotal: 3,
        taxTotal: 1.35,
        serviceFeeTotal: 2.7,
        shippingTotal: 5,
        total: 36.05,
      }),
      tx,
    )
    expect(mocks.insertItems).toHaveBeenCalledWith(
      {
        workspaceId: "ws1",
        orderId: "o1",
        items: [
          expect.objectContaining({
            productId: "p1",
            name: "Shirt",
            vendorName: "Acme",
            unitPrice: 10,
            quantity: 3,
            lineTotal: 28.35,
          }),
        ],
      },
      tx,
    )
    expect(mocks.insertHistory).toHaveBeenCalledWith(
      expect.objectContaining({ fromStatus: null, toStatus: "pending" }),
      tx,
    )
  })

  test("merges two lines of the same product into one", async () => {
    await orderService.place(
      placeInput({
        items: [
          { productId: "p1", quantity: 1 },
          { productId: "p1", quantity: 2 },
        ],
      }),
    )
    const [{ items }] = mocks.insertItems.mock.calls[0] as [
      { items: Array<{ quantity: number }> },
    ]
    expect(items).toHaveLength(1)
    expect(items[0]?.quantity).toBe(3)
  })

  test("prices a variant line at the variant's price", async () => {
    mocks.findForOrder.mockResolvedValue([
      product({
        variants: [
          {
            id: "var1",
            price: 12,
            isEnabled: true,
            combination: { Size: "L", Color: "Red" },
          },
        ],
      }),
    ])

    await orderService.place(
      placeInput({
        items: [{ productId: "p1", variantId: "var1", quantity: 1 }],
      }),
    )

    expect(mocks.insertItems).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            variantId: "var1",
            unitPrice: 12,
            variantLabel: "L / Red",
          }),
        ],
      }),
      tx,
    )
  })

  test("refuses a product with variants when no variant is chosen", async () => {
    mocks.findForOrder.mockResolvedValue([
      product({
        variants: [{ id: "var1", price: 12, isEnabled: true, combination: {} }],
      }),
    ])
    await expect(orderService.place(placeInput())).rejects.toMatchObject({
      code: "orderProductUnavailable",
    })
    expect(mocks.insertOrder).not.toHaveBeenCalled()
  })

  test("refuses a product that is inactive or from another workspace", async () => {
    mocks.findForOrder.mockResolvedValue([])
    await expect(orderService.place(placeInput())).rejects.toMatchObject({
      code: "orderProductUnavailable",
    })
  })

  test("refuses an order below the store minimum", async () => {
    mocks.getFresh.mockResolvedValue(
      settings({ checkout: { minimumOrderValue: 50 } }),
    )
    await expect(orderService.place(placeInput())).rejects.toMatchObject({
      code: "orderBelowMinimum",
    })
  })

  test("refuses a tracked product that is out of stock and takes nothing", async () => {
    mocks.lockForStock.mockResolvedValue([
      {
        id: "p1",
        inventoryPolicy: "track",
        inventoryQuantity: 2,
        allowOutOfStockPurchase: false,
      },
    ])
    await expect(orderService.place(placeInput())).rejects.toMatchObject({
      code: "orderOutOfStock",
    })
    expect(mocks.adjustInventory).not.toHaveBeenCalled()
    expect(mocks.insertOrder).not.toHaveBeenCalled()
  })

  test("takes stock from a tracked product", async () => {
    mocks.lockForStock.mockResolvedValue([
      {
        id: "p1",
        inventoryPolicy: "track",
        inventoryQuantity: 5,
        allowOutOfStockPurchase: false,
      },
    ])
    await orderService.place(placeInput())
    expect(mocks.adjustInventory).toHaveBeenCalledWith(
      { workspaceId: "ws1", productId: "p1", delta: -3 },
      tx,
    )
  })

  test("refuses a web shop order while ordering is turned off", async () => {
    mocks.getFresh.mockResolvedValue(
      settings({ general: { orderingAvailable: false } }),
    )
    await expect(
      orderService.place(placeInput({ source: "webshop" })),
    ).rejects.toMatchObject({ code: "orderingUnavailable" })
  })

  test("refuses an empty order", async () => {
    await expect(
      orderService.place(placeInput({ items: [] })),
    ).rejects.toMatchObject({ code: "orderEmpty" })
  })
})

describe("orderService.transition", () => {
  const current = (overrides: Record<string, unknown> = {}) => ({
    id: "o1",
    workspaceId: "ws1",
    status: "accepted",
    paymentMethod: "cod",
    ...overrides,
  })

  test("marks a cash-on-delivery order paid when it is completed", async () => {
    mocks.findOrder.mockResolvedValue(current())
    mocks.transitionStatus.mockResolvedValue(current({ status: "concluded" }))

    await orderService.conclude({
      workspaceId: "ws1",
      orderId: "o1",
      actor: { type: "user", userId: "u1" },
    })

    expect(mocks.transitionStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        from: ["accepted", "shipped"],
        to: "concluded",
        values: expect.objectContaining({
          paymentStatus: "paid",
          concludedAt: expect.any(Date),
        }),
      }),
      tx,
    )
    expect(mocks.insertHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        fromStatus: "accepted",
        toStatus: "concluded",
        actorType: "user",
        actorUserId: "u1",
      }),
      tx,
    )
  })

  test("refuses a move the current status does not allow", async () => {
    mocks.findOrder.mockResolvedValue(current({ status: "cancelled" }))
    mocks.transitionStatus.mockResolvedValue(undefined)

    await expect(
      orderService.accept({
        workspaceId: "ws1",
        orderId: "o1",
        actor: { type: "apiToken" },
      }),
    ).rejects.toMatchObject({ code: "orderInvalidStatusTransition" })
    expect(mocks.insertHistory).not.toHaveBeenCalled()
  })

  test("puts the stock back when an order is cancelled", async () => {
    mocks.findOrder.mockResolvedValue(current({ status: "pending" }))
    mocks.transitionStatus.mockResolvedValue(current({ status: "cancelled" }))
    mocks.listItems.mockResolvedValue([
      { productId: "p1", quantity: 2 },
      { productId: "p1", quantity: 1 },
      { productId: null, quantity: 5 },
    ])
    mocks.lockForStock.mockResolvedValue([{ id: "p1" }])

    await orderService.cancel({
      workspaceId: "ws1",
      orderId: "o1",
      actor: { type: "user", userId: "u1" },
      message: "Customer changed mind",
    })

    expect(mocks.transitionStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        values: expect.objectContaining({
          cancelReason: "Customer changed mind",
        }),
      }),
      tx,
    )
    expect(mocks.adjustInventory).toHaveBeenCalledWith(
      { workspaceId: "ws1", productId: "p1", delta: 3 },
      tx,
    )
  })

  test("is a 404 for an order of another workspace", async () => {
    mocks.findOrder.mockResolvedValue(undefined)
    await expect(
      orderService.ship({
        workspaceId: "ws1",
        orderId: "o1",
        actor: { type: "apiToken" },
      }),
    ).rejects.toMatchObject({ code: "notFound" })
  })
})

describe("orderService.place — vendor rules", () => {
  test("stacks the vendor discount on the product's own", async () => {
    mocks.findForOrder.mockResolvedValue([
      product({
        discount: 10,
        vendor: {
          name: "Acme",
          isActive: true,
          discountPercent: 20,
          minimumOrderValue: 0,
        },
      }),
    ])

    await orderService.place(
      placeInput({ items: [{ productId: "p1", quantity: 1 }] }),
    )

    // 10% then 20% is 28% off: 10 → 7.2
    expect(mocks.insertItems).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            discountPercent: 28,
            discountTotal: 2.8,
            lineTotal: 7.2,
          }),
        ],
      }),
      tx,
    )
  })

  test("refuses the items of a vendor below its minimum order", async () => {
    mocks.findForOrder.mockResolvedValue([
      product({
        vendor: {
          name: "Acme",
          isActive: true,
          discountPercent: 0,
          minimumOrderValue: 50,
        },
      }),
    ])
    await expect(orderService.place(placeInput())).rejects.toMatchObject({
      code: "orderBelowVendorMinimum",
      data: { vendorName: "Acme", minimum: 50 },
    })
  })

  test("refuses a product whose vendor is turned off", async () => {
    mocks.findForOrder.mockResolvedValue([
      product({
        vendor: {
          name: "Acme",
          isActive: false,
          discountPercent: 0,
          minimumOrderValue: 0,
        },
      }),
    ])
    await expect(orderService.place(placeInput())).rejects.toMatchObject({
      code: "orderProductUnavailable",
    })
  })
})

describe("orderService.place — shipping", () => {
  test("has no shipping when the store ships nothing", async () => {
    mocks.getFresh.mockResolvedValue(
      settings({ shipping: { shippingType: "none", deliveryCost: 5 } }),
    )
    await orderService.place(placeInput())
    expect(mocks.insertOrder).toHaveBeenCalledWith(
      expect.objectContaining({ shippingType: null, shippingTotal: 0 }),
      tx,
    )
  })

  test("lets the customer pick pickup when the store offers both", async () => {
    mocks.getFresh.mockResolvedValue(
      settings({
        shipping: {
          shippingType: "deliveryAndPickup",
          deliveryCost: 5,
          storeAddress: "1 Main St",
        },
      }),
    )
    await orderService.place(placeInput({ shippingType: "pickup" }))
    expect(mocks.insertOrder).toHaveBeenCalledWith(
      expect.objectContaining({ shippingType: "pickup", shippingTotal: 0 }),
      tx,
    )
  })

  test("refuses a shipping type the store does not offer", async () => {
    mocks.getFresh.mockResolvedValue(
      settings({ shipping: { shippingType: "delivery" } }),
    )
    await expect(
      orderService.place(placeInput({ shippingType: "pickup" })),
    ).rejects.toMatchObject({ code: "orderShippingTypeUnavailable" })
  })
})

describe("orderService — customer message and delete", () => {
  const order = {
    id: "o1",
    workspaceId: "ws1",
    status: "pending",
    paymentMethod: "cod",
    contactId: "c1",
    inboxId: "in1",
  }

  test("sends the status message to the customer's conversation", async () => {
    mocks.findOrder.mockResolvedValue(order)
    mocks.transitionStatus.mockResolvedValue({ ...order, status: "accepted" })
    mocks.resolveContactInboxForSend.mockResolvedValue({
      conversation: { id: "conv1" },
      contactInbox: { id: "ci1" },
    })

    await orderService.accept({
      workspaceId: "ws1",
      orderId: "o1",
      actor: { type: "user", userId: "u1" },
      message: "  We are preparing it  ",
    })

    expect(mocks.insertHistory).toHaveBeenCalledWith(
      expect.objectContaining({ note: "We are preparing it" }),
      tx,
    )
    expect(mocks.resolveContactInboxForSend).toHaveBeenCalledWith({
      workspaceId: "ws1",
      contactId: "c1",
      inboxId: "in1",
    })
    expect(mocks.createOutgoing).toHaveBeenCalledWith({
      conversation: { id: "conv1" },
      contactInbox: { id: "ci1" },
      input: {
        text: "The status of your order has been updated.\n\nStatus: Processing\n\nWe are preparing it",
      },
    })
  })

  test("still moves the order when the message cannot be sent", async () => {
    mocks.findOrder.mockResolvedValue(order)
    mocks.transitionStatus.mockResolvedValue({ ...order, status: "accepted" })
    mocks.resolveContactInboxForSend.mockRejectedValue(new Error("no convo"))

    await expect(
      orderService.accept({
        workspaceId: "ws1",
        orderId: "o1",
        actor: { type: "apiToken" },
        message: "Hi",
      }),
    ).resolves.toEqual({ id: "o1" })
    expect(mocks.warn).toHaveBeenCalled()
  })

  test("sends the status in the contact's language", async () => {
    mocks.findOrder.mockResolvedValue(order)
    mocks.transitionStatus.mockResolvedValue({ ...order, status: "concluded" })
    mocks.findContact.mockResolvedValue({ id: "c1", locale: "vi_VN" })
    mocks.resolveContactInboxForSend.mockResolvedValue({
      conversation: { id: "conv1" },
      contactInbox: { id: "ci1" },
    })
    await orderService.conclude({
      workspaceId: "ws1",
      orderId: "o1",
      actor: { type: "apiToken" },
    })
    expect(mocks.createOutgoing).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          text: "Trạng thái đơn hàng của bạn đã được cập nhật.\n\nTrạng thái: Hoàn thành",
        },
      }),
    )
  })

  test("sends every status when the store turns that on", async () => {
    mocks.getSettings.mockResolvedValue(
      settings({ general: { notifyOnCartStatusChange: true } }),
    )
    mocks.findOrder.mockResolvedValue(order)
    mocks.transitionStatus.mockResolvedValue({ ...order, status: "accepted" })
    mocks.resolveContactInboxForSend.mockResolvedValue({
      conversation: { id: "conv1" },
      contactInbox: { id: "ci1" },
    })
    await orderService.accept({
      workspaceId: "ws1",
      orderId: "o1",
      actor: { type: "apiToken" },
    })
    expect(mocks.createOutgoing).toHaveBeenCalledTimes(1)
  })

  test("sends nothing without a message", async () => {
    mocks.findOrder.mockResolvedValue(order)
    mocks.transitionStatus.mockResolvedValue({ ...order, status: "accepted" })
    await orderService.accept({
      workspaceId: "ws1",
      orderId: "o1",
      actor: { type: "apiToken" },
    })
    expect(mocks.createOutgoing).not.toHaveBeenCalled()
  })

  test("puts stock back when deleting an order that still holds it", async () => {
    mocks.findOrder.mockResolvedValue(order)
    mocks.listItems.mockResolvedValue([{ productId: "p1", quantity: 2 }])
    mocks.lockForStock.mockResolvedValue([{ id: "p1" }])

    await orderService.delete({ workspaceId: "ws1", orderId: "o1" })

    expect(mocks.adjustInventory).toHaveBeenCalledWith(
      { workspaceId: "ws1", productId: "p1", delta: 2 },
      tx,
    )
    expect(mocks.deleteOrder).toHaveBeenCalledWith(
      { workspaceId: "ws1", orderId: "o1" },
      tx,
    )
  })

  test("leaves stock alone when deleting a completed order", async () => {
    mocks.findOrder.mockResolvedValue({ ...order, status: "concluded" })
    await orderService.delete({ workspaceId: "ws1", orderId: "o1" })
    expect(mocks.listItems).not.toHaveBeenCalled()
    expect(mocks.deleteOrder).toHaveBeenCalled()
  })
})

describe("orderService.place — contact conversation", () => {
  test("ties an order for a contact to the contact's latest conversation", async () => {
    mocks.resolveContactInboxForSend.mockResolvedValue({
      conversation: { id: "conv1" },
      contactInbox: { id: "ci1", inboxId: "in1", channel: "webchat" },
    })
    await orderService.place(placeInput({ contact: { contactId: "c1" } }))
    expect(mocks.insertOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: "c1",
        contactInboxId: "ci1",
        inboxId: "in1",
        conversationId: "conv1",
        channel: "webchat",
      }),
      tx,
    )
  })

  test("keeps only the contact when it has no conversation", async () => {
    const { notFoundException } = await import("../../errors")
    mocks.resolveContactInboxForSend.mockRejectedValue(
      notFoundException("Conversation not found"),
    )
    await orderService.place(placeInput({ contact: { contactId: "c1" } }))
    expect(mocks.insertOrder).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: "c1", conversationId: null }),
      tx,
    )
  })
})

describe("orderService.place — after it is placed", () => {
  test("queues the members' new-order push once per order", async () => {
    await orderService.place(placeInput())
    expect(mocks.queueAdd).toHaveBeenCalledWith(
      "notifyNewOrder",
      {
        type: "notifyNewOrder",
        data: { workspaceId: "ws1", orderId: "o1" },
      },
      { jobId: "new-order-o1" },
    )
  })

  test("confirms the order to the customer", async () => {
    mocks.resolveContactInboxForSend.mockResolvedValue({
      conversation: { id: "conv1" },
      contactInbox: { id: "ci1", inboxId: "in1", channel: "webchat" },
    })
    mocks.findDetail.mockResolvedValue({
      id: "o1",
      number: 7,
      status: "pending",
      currency: "USD",
      subtotal: 30,
      discountTotal: 0,
      shippingTotal: 0,
      serviceFeeTotal: 0,
      taxTotal: 0,
      total: 30,
      customerName: "An",
      customerEmail: null,
      customerPhone: null,
      shippingType: null,
      shippingAddress: null,
      createdAt: new Date("2026-10-20T08:00:00Z"),
      items: [{ name: "Shirt", variantLabel: null, quantity: 3 }],
    })
    await orderService.place(placeInput({ contact: { contactId: "c1" } }))
    const [{ input }] = mocks.createOutgoing.mock.calls[0] as [
      { input: { text: string } },
    ]
    expect(input.text).toContain("An, thank you for placing your order")
    expect(input.text).toContain("--- #7 ---")
    expect(input.text).toContain("3 X Shirt")
  })

  test("a failed push does not fail the order", async () => {
    mocks.queueAdd.mockRejectedValue(new Error("redis down"))
    await expect(orderService.place(placeInput())).resolves.toEqual({
      id: "o1",
    })
    expect(mocks.warn).toHaveBeenCalled()
  })
})

describe("orderService — discount codes", () => {
  const code = (overrides: Record<string, unknown> = {}) => ({
    id: "dc1",
    code: "CODE20",
    discountType: "percentage",
    ...overrides,
  })

  test("takes the code off after the line discounts and counts the use", async () => {
    mocks.getFresh.mockResolvedValue(
      settings({
        payments: { currency: "USD", serviceFeePercent: 10 },
        shipping: { shippingType: "delivery", deliveryCost: 5 },
      }),
    )
    mocks.resolveDiscount.mockResolvedValue({ discountCode: code(), amount: 6 })

    await orderService.place(
      placeInput({
        discountCode: "code20",
        contact: { contactId: "c1", conversationId: "conv1" },
      }),
    )

    // gross 30, fee 10% of (30 − 6) = 2.4, ship 5 → 30 + 2.4 + 5 − 6
    expect(mocks.insertOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        subtotal: 30,
        couponDiscount: 6,
        serviceFeeTotal: 2.4,
        total: 31.4,
        discountCodeId: "dc1",
        discountCode: "CODE20",
      }),
      tx,
    )
    expect(mocks.resolveDiscount).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "code20",
        contactId: "c1",
        tx,
        lines: [
          expect.objectContaining({
            productId: "p1",
            categoryIds: ["c1"],
            amount: 30,
            quantity: 3,
          }),
        ],
      }),
    )
    expect(mocks.redeemDiscount).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: "o1", applied: expect.anything() }),
      tx,
    )
  })

  test("a free-shipping code does not lower the service fee", async () => {
    mocks.getFresh.mockResolvedValue(
      settings({
        payments: { currency: "USD", serviceFeePercent: 10 },
        shipping: { shippingType: "delivery", deliveryCost: 5 },
      }),
    )
    mocks.resolveDiscount.mockResolvedValue({
      discountCode: code({ discountType: "freeShipping" }),
      amount: 5,
    })
    await orderService.place(placeInput({ discountCode: "SHIP" }))
    expect(mocks.insertOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceFeeTotal: 3,
        shippingTotal: 5,
        couponDiscount: 5,
        total: 33,
      }),
      tx,
    )
  })

  test("the store minimum is read after the discount code", async () => {
    mocks.getFresh.mockResolvedValue(
      settings({ checkout: { minimumOrderValue: 25 } }),
    )
    mocks.resolveDiscount.mockResolvedValue({ discountCode: code(), amount: 6 })
    // 30 of goods − 6 off is 24, below the minimum of 25.
    await expect(
      orderService.place(placeInput({ discountCode: "CODE20" })),
    ).rejects.toMatchObject({ code: "orderBelowMinimum" })
  })

  test("a free-shipping code does not count against the store minimum", async () => {
    mocks.getFresh.mockResolvedValue(
      settings({
        checkout: { minimumOrderValue: 30 },
        shipping: { shippingType: "delivery", deliveryCost: 5 },
      }),
    )
    mocks.resolveDiscount.mockResolvedValue({
      discountCode: code({ discountType: "freeShipping" }),
      amount: 5,
    })
    await expect(
      orderService.place(placeInput({ discountCode: "SHIP" })),
    ).resolves.toEqual({ id: "o1" })
  })

  test("an unusable code refuses the order", async () => {
    const { ChatbotXException } = await import("../../errors")
    mocks.resolveDiscount.mockRejectedValue(
      new ChatbotXException("expired", "discountCodeExpired"),
    )
    await expect(
      orderService.place(placeInput({ discountCode: "OLD" })),
    ).rejects.toMatchObject({ code: "discountCodeExpired" })
    expect(mocks.insertOrder).not.toHaveBeenCalled()
  })

  test("the quote reports an unusable typed code and prices without it", async () => {
    const { ChatbotXException } = await import("../../errors")
    mocks.resolveDiscount
      .mockRejectedValueOnce(
        new ChatbotXException("used", "discountCodeUsageLimitReached"),
      )
      .mockResolvedValueOnce(null)
    const quote = await orderService.quote({
      workspaceId: "ws1",
      items: [{ productId: "p1", quantity: 1 }],
      discountCode: "GONE",
    })
    expect(quote.discountError).toEqual({
      code: "discountCodeUsageLimitReached",
      data: undefined,
    })
    expect(quote.discount).toBeNull()
  })

  test("cancelling gives the use back", async () => {
    mocks.findOrder.mockResolvedValue({
      id: "o1",
      workspaceId: "ws1",
      status: "pending",
      paymentMethod: "cod",
    })
    mocks.transitionStatus.mockResolvedValue({ id: "o1", status: "cancelled" })
    mocks.listItems.mockResolvedValue([])
    await orderService.cancel({
      workspaceId: "ws1",
      orderId: "o1",
      actor: { type: "apiToken" },
    })
    expect(mocks.releaseDiscount).toHaveBeenCalledWith(
      { workspaceId: "ws1", orderId: "o1" },
      tx,
    )
  })

  test("cancelling locks the code before the products, as placing does", async () => {
    mocks.findOrder.mockResolvedValue({
      id: "o1",
      workspaceId: "ws1",
      status: "pending",
      paymentMethod: "cod",
    })
    mocks.transitionStatus.mockResolvedValue({ id: "o1", status: "cancelled" })
    mocks.listItems.mockResolvedValue([{ productId: "p1", quantity: 1 }])
    mocks.lockForStock.mockResolvedValue([{ id: "p1" }])
    await orderService.cancel({
      workspaceId: "ws1",
      orderId: "o1",
      actor: { type: "apiToken" },
    })
    const [releasedAt] = mocks.releaseDiscount.mock.invocationCallOrder
    const [stockLockedAt] = mocks.lockForStock.mock.invocationCallOrder
    expect(releasedAt).toBeLessThan(stockLockedAt as number)
  })
})

describe("orderService — trigger events", () => {
  const detail = {
    id: "o1",
    number: 7,
    status: "pending",
    source: "webshop",
    total: 30,
    currency: "USD",
    discountCode: null,
    channel: "webchat",
    conversationId: "conv1",
    items: [
      {
        productId: "p1",
        variantId: null,
        name: "Shirt",
        categoryId: "cat1",
        quantity: 3,
        lineTotal: 30,
      },
    ],
  }

  test("a placed order emits newOrder and productOrdered for its contact", async () => {
    mocks.resolveContactInboxForSend.mockResolvedValue({
      conversation: { id: "conv1" },
      contactInbox: { id: "ci1", inboxId: "in1", channel: "webchat" },
    })
    mocks.findDetail.mockResolvedValue(detail)
    await orderService.place(placeInput({ contact: { contactId: "c1" } }))
    const metadata = expect.objectContaining({
      orderId: "o1",
      orderNumber: 7,
      products: [
        expect.objectContaining({ productId: "p1", categoryIds: ["cat1"] }),
      ],
    })
    expect(mocks.emitOrderStatus).toHaveBeenCalledWith(
      "newOrder",
      "ws1",
      "c1",
      metadata,
      "ci1",
    )
    expect(mocks.emitProductOrdered).toHaveBeenCalledWith(
      "ws1",
      "c1",
      metadata,
      "ci1",
    )
  })

  test("a move emits the event of the new status only", async () => {
    mocks.findOrder.mockResolvedValue({
      id: "o1",
      workspaceId: "ws1",
      status: "accepted",
      paymentMethod: "cod",
      contactId: "c1",
    })
    mocks.transitionStatus.mockResolvedValue({
      id: "o1",
      workspaceId: "ws1",
      status: "shipped",
      contactId: "c1",
      contactInboxId: null,
    })
    mocks.findDetail.mockResolvedValue({ ...detail, status: "shipped" })
    await orderService.ship({
      workspaceId: "ws1",
      orderId: "o1",
      actor: { type: "apiToken" },
    })
    expect(mocks.emitOrderStatus).toHaveBeenCalledWith(
      "orderShipped",
      "ws1",
      "c1",
      expect.objectContaining({ status: "shipped" }),
      undefined,
    )
    expect(mocks.emitProductOrdered).not.toHaveBeenCalled()
  })

  test("an order without a contact emits nothing", async () => {
    await orderService.place(placeInput())
    expect(mocks.emitOrderStatus).not.toHaveBeenCalled()
  })
})
