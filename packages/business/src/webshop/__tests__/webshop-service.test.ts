import { ECOMMERCE_SETTINGS_DEFAULTS } from "@chatbotx.io/database/partials"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  cancelOrder: vi.fn(),
  startCheckout: vi.fn(),
  syncOrder: vi.fn(),
  findCart: vi.fn(),
  findCartForUpdate: vi.fn(),
  freezeReason: vi.fn(),
  upsertCart: vi.fn(),
  findSchedules: vi.fn(),
  setRating: vi.fn(),
  listForShop: vi.fn(),
  findProductDetail: vi.fn(),
  findForOrder: vi.fn(),
  getSettings: vi.fn(),
  getFreshSettings: vi.fn(),
  quote: vi.fn(),
  place: vi.fn(),
  getDetail: vi.fn(),
  findWorkspace: vi.fn(),
  invalidate: vi.fn(),
  queueAdd: vi.fn(),
  setDiscountCode: vi.fn(),
  emitCartItemChanged: vi.fn(),
  emitCartAbandoned: vi.fn(),
  resolveContactInboxForSend: vi.fn(),
}))

vi.mock("../../conversation/service", () => ({
  conversationService: {
    resolveContactInboxForSend: (...args: unknown[]) =>
      mocks.resolveContactInboxForSend(...args),
  },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: (fn: (tx: object) => unknown) => fn({ name: "cart-tx" }),
  },
}))

vi.mock("../../workspace-lifecycle/with-blocked-owner-guard", () => ({
  resolveWorkspaceFreezeReasonById: (...args: unknown[]) =>
    mocks.freezeReason(...args),
}))

vi.mock("../../order-payment/service", () => ({
  orderPaymentService: {
    startCheckout: (...args: unknown[]) => mocks.startCheckout(...args),
    syncOrder: (...args: unknown[]) => mocks.syncOrder(...args),
  },
}))

vi.mock("@chatbotx.io/events", () => ({
  emitCartItemChanged: (...args: unknown[]) =>
    mocks.emitCartItemChanged(...args),
  emitCartAbandoned: (...args: unknown[]) => mocks.emitCartAbandoned(...args),
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: { sendFlow: "sendFlow" },
  integrationQueue: { add: (...args: unknown[]) => mocks.queueAdd(...args) },
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: (...args: unknown[]) => mocks.invalidate(...args),
  withCache: (_key: string, fn: () => unknown) => fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  cartRepository: {
    find: (...args: unknown[]) => mocks.findCart(...args),
    lockOrCreate: (...args: unknown[]) => mocks.findCart(...args),
    findForUpdate: (...args: unknown[]) => mocks.findCartForUpdate(...args),
    upsert: (...args: unknown[]) => mocks.upsertCart(...args),
    setDiscountCode: (...args: unknown[]) => mocks.setDiscountCode(...args),
  },
  ecommerceOpenHoursRepository: {
    findByIds: (...args: unknown[]) => mocks.findSchedules(...args),
  },
  orderRepository: {
    setRating: (...args: unknown[]) => mocks.setRating(...args),
  },
  productRepository: {
    listForShop: (...args: unknown[]) => mocks.listForShop(...args),
    findForOrder: (...args: unknown[]) => mocks.findForOrder(...args),
    findByIds: (...args: unknown[]) => mocks.findForOrder(...args),
  },
}))

vi.mock("../../ecommerce-settings/service", () => ({
  ecommerceSettingsService: {
    get: (...args: unknown[]) => mocks.getSettings(...args),
    getFresh: (...args: unknown[]) => mocks.getFreshSettings(...args),
  },
}))

type MockProduct = {
  id: string
  isActive?: boolean
  name?: string
  categoryId?: string | null
  subcategoryId?: string | null
}
vi.mock("../../order/service", () => ({
  orderService: {
    quote: (...args: unknown[]) => mocks.quote(...args),
    place: (...args: unknown[]) => mocks.place(...args),
    getDetail: (...args: unknown[]) => mocks.getDetail(...args),
    cancel: (...args: unknown[]) => mocks.cancelOrder(...args),
  },
  findProductsForOrder: async (...args: unknown[]) =>
    new Map(
      ((await mocks.findForOrder(...args)) as MockProduct[]).map((row) => [
        row.id,
        row,
      ]),
    ),
  // A product that is gone or turned off cannot be ordered.
  splitOrderableItems: (
    products: Map<string, MockProduct>,
    items: Array<{ productId: string }>,
  ) => ({
    orderable: items.filter(
      (item) => products.get(item.productId)?.isActive !== false,
    ),
    unavailable: items.filter(
      (item) => products.get(item.productId)?.isActive === false,
    ),
  }),
  productCategoryIds: (product?: MockProduct) =>
    [product?.categoryId, product?.subcategoryId].filter(Boolean),
}))

vi.mock("../../workspace/service", () => ({
  workspaceService: {
    findById: (...args: unknown[]) => mocks.findWorkspace(...args),
  },
}))

vi.mock("../../product/service", () => ({
  productService: {
    findById: (...args: unknown[]) => mocks.findProductDetail(...args),
  },
}))
vi.mock("../../product-category/service", () => ({
  productCategoryService: {},
}))
vi.mock("../../vendor/service", () => ({ vendorService: {} }))
vi.mock("../../platform/settings", () => ({
  resolveWorkspaceAppUrl: async () => "https://app.example",
}))
vi.mock("../../order/message-language", () => ({
  resolveCustomerMessageLanguage: async () => "en",
}))

const { webshopService } = await import("../service")

const settings = (overrides: {
  general?: Partial<typeof ECOMMERCE_SETTINGS_DEFAULTS.general>
  shipping?: Partial<typeof ECOMMERCE_SETTINGS_DEFAULTS.shipping>
  checkout?: Partial<typeof ECOMMERCE_SETTINGS_DEFAULTS.checkout>
}) => ({
  ...ECOMMERCE_SETTINGS_DEFAULTS,
  general: {
    ...ECOMMERCE_SETTINGS_DEFAULTS.general,
    orderingAvailable: true,
    openHoursId: null,
    ...overrides.general,
  },
  shipping: { ...ECOMMERCE_SETTINGS_DEFAULTS.shipping, ...overrides.shipping },
  checkout: {
    ...ECOMMERCE_SETTINGS_DEFAULTS.checkout,
    requireName: false,
    requireEmail: false,
    requirePhone: false,
    requireState: false,
    requireZip: false,
    ...overrides.checkout,
  },
})

const shopper = {
  workspaceId: "ws1",
  contactId: "c1",
  contactInboxId: "ci1",
  conversationId: null,
}

// Every day, all day — or never.
const alwaysOpen = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
  day,
  from: "00:00",
  to: "23:59",
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findCart.mockResolvedValue({
    items: [{ productId: "p1", variantId: null, quantity: 2 }],
  })
  mocks.findCartForUpdate.mockImplementation((...args: unknown[]) =>
    mocks.findCart(...args),
  )
  mocks.freezeReason.mockResolvedValue({ freezeReason: null })
  mocks.findForOrder.mockResolvedValue([{ id: "p1", vendor: null }])
  mocks.getFreshSettings.mockResolvedValue(
    settings({ shipping: { shippingType: "none" } }),
  )
  mocks.findWorkspace.mockResolvedValue({ id: "ws1", timezone: "UTC" })
  mocks.place.mockResolvedValue({
    id: "o1",
    conversationId: "conv1",
    contactInboxId: "ci1",
  })
  mocks.queueAdd.mockResolvedValue(undefined)
  mocks.quote.mockResolvedValue({ lines: [], totals: {} })
  mocks.listForShop.mockResolvedValue({ data: [{ id: "p1" }], pageCount: 1 })
  mocks.findProductDetail.mockImplementation(async (id: string) => ({
    id,
    name: "Shirt",
    variants: [],
  }))
})

describe("webshopService.checkout", () => {
  test("places the cart for the signed contact and empties it in the order's transaction", async () => {
    await webshopService.checkout({ shopper, form: { customerName: " An " } })

    const [input] = mocks.place.mock.calls[0] as [
      {
        source: string
        contact: object
        items: unknown[]
        customerName: string
        onPlaced: (order: object, tx: object) => Promise<void>
      },
    ]
    expect(input).toMatchObject({
      source: "webshop",
      contact: { contactId: "c1", contactInboxId: "ci1" },
      items: [{ productId: "p1", variantId: null, quantity: 2 }],
      customerName: "An",
    })

    const tx = { name: "tx" }
    await input.onPlaced({ id: "o1" }, tx)
    expect(mocks.upsertCart).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: "c1", items: [] }),
      tx,
    )
  })

  test("orders only what can be ordered; an item no longer sold stays in the cart", async () => {
    const off = { productId: "p2", variantId: null, quantity: 1 }
    mocks.findCart.mockResolvedValue({
      items: [{ productId: "p1", variantId: null, quantity: 2 }, off],
    })
    mocks.findForOrder.mockResolvedValue([
      { id: "p1", vendor: null },
      { id: "p2", vendor: null, isActive: false },
    ])
    await webshopService.checkout({ shopper, form: {} })
    const [input] = mocks.place.mock.calls[0] as [
      {
        items: unknown[]
        onPlaced: (order: object, tx: object) => Promise<void>
      },
    ]
    expect(input.items).toEqual([
      { productId: "p1", variantId: null, quantity: 2 },
    ])
    const tx = { name: "tx" }
    await input.onPlaced({ id: "o1" }, tx)
    expect(mocks.upsertCart).toHaveBeenCalledWith(
      expect.objectContaining({ items: [off] }),
      tx,
    )
  })

  test("refuses a cart whose items are all no longer sold", async () => {
    mocks.findForOrder.mockResolvedValue([
      { id: "p1", vendor: null, isActive: false },
    ])
    await expect(
      webshopService.checkout({ shopper, form: {} }),
    ).rejects.toMatchObject({ code: "orderProductUnavailable" })
    expect(mocks.place).not.toHaveBeenCalled()
  })

  test("an item added in another tab while the order was placed stays in the cart", async () => {
    await webshopService.checkout({ shopper, form: {} })
    const [input] = mocks.place.mock.calls[0] as [
      { onPlaced: (order: object, tx: object) => Promise<void> },
    ]
    const added = { productId: "p3", variantId: null, quantity: 1 }
    mocks.findCartForUpdate.mockResolvedValue({
      items: [{ productId: "p1", variantId: null, quantity: 2 }, added],
    })
    const tx = { name: "tx" }
    await input.onPlaced({ id: "o1" }, tx)
    expect(mocks.upsertCart).toHaveBeenCalledWith(
      expect.objectContaining({ items: [added] }),
      tx,
    )
  })

  test("a double-submitted checkout finds the cart emptied and rolls back", async () => {
    await webshopService.checkout({ shopper, form: {} })
    const [input] = mocks.place.mock.calls[0] as [
      { onPlaced: (order: object, tx: object) => Promise<void> },
    ]
    mocks.findCartForUpdate.mockResolvedValue({ items: [] })
    await expect(input.onPlaced({ id: "o2" }, {})).rejects.toMatchObject({
      code: "orderEmpty",
    })
    expect(mocks.upsertCart).not.toHaveBeenCalled()
  })

  test("refuses while the workspace is frozen (trial expired, deletion pending)", async () => {
    mocks.freezeReason.mockResolvedValue({ freezeReason: "ownerBlocked" })
    await expect(
      webshopService.checkout({ shopper, form: {} }),
    ).rejects.toMatchObject({
      code: "webshopClosed",
      data: { reason: "orderingUnavailable" },
    })
    expect(mocks.place).not.toHaveBeenCalled()
  })

  test("refuses when the store checks out on its own external page", async () => {
    mocks.getFreshSettings.mockResolvedValue(
      settings({
        checkout: {
          checkoutMode: "externalLink",
          checkoutLink: "https://pay.example",
        },
      }),
    )
    await expect(
      webshopService.checkout({ shopper, form: {} }),
    ).rejects.toMatchObject({ code: "webshopClosed" })
    expect(mocks.place).not.toHaveBeenCalled()
  })

  test("places a cash order as cash on delivery, with nothing to pay online", async () => {
    const result = await webshopService.checkout({ shopper, form: {} })
    expect(mocks.place).toHaveBeenCalledWith(
      expect.objectContaining({ paymentMethod: "cod" }),
    )
    expect(result.paymentUrl).toBeNull()
    expect(mocks.startCheckout).not.toHaveBeenCalled()
    // The checkout flow is the order's to start, once it is announced.
    expect(mocks.queueAdd).not.toHaveBeenCalled()
  })

  test("paid online, opens the provider's page for the order", async () => {
    mocks.place.mockResolvedValue({
      id: "o1",
      paymentMethod: "stripe",
      paymentStatus: "unpaid",
    })
    mocks.startCheckout.mockResolvedValue({
      url: "https://checkout.stripe.com/c/pay/cs_1",
      expiresAt: new Date(),
    })
    const result = await webshopService.checkout({
      shopper,
      form: { paymentMethod: "stripe" },
    })
    expect(mocks.place).toHaveBeenCalledWith(
      expect.objectContaining({ paymentMethod: "stripe" }),
    )
    expect(mocks.startCheckout).toHaveBeenCalledWith({
      workspaceId: shopper.workspaceId,
      orderId: "o1",
    })
    expect(result.paymentUrl).toBe("https://checkout.stripe.com/c/pay/cs_1")
  })

  test("a provider page that cannot open cancels the order and puts its items back", async () => {
    mocks.place.mockResolvedValue({
      id: "o1",
      paymentMethod: "stripe",
      paymentStatus: "unpaid",
    })
    const refused = Object.assign(new Error("amount too small"), {
      code: "paymentAmountUnsupported",
    })
    mocks.startCheckout.mockRejectedValue(refused)
    // Checkout reads the cart; once the order took its items, the cart the
    // undo locks is empty.
    mocks.findCart
      .mockResolvedValueOnce({
        items: [{ productId: "p1", variantId: null, quantity: 2 }],
        discountCode: null,
      })
      .mockResolvedValueOnce({ items: [], discountCode: null })

    await expect(
      webshopService.checkout({ shopper, form: { paymentMethod: "stripe" } }),
    ).rejects.toBe(refused)
    expect(mocks.cancelOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "o1",
        actor: { type: "system" },
      }),
    )
    expect(mocks.upsertCart).toHaveBeenLastCalledWith(
      expect.objectContaining({
        contactId: "c1",
        items: [{ productId: "p1", variantId: null, quantity: 2 }],
      }),
      expect.anything(),
    )
  })

  test("refuses while ordering is turned off", async () => {
    mocks.getFreshSettings.mockResolvedValue(
      settings({ general: { orderingAvailable: false } }),
    )
    await expect(
      webshopService.checkout({ shopper, form: {} }),
    ).rejects.toMatchObject({
      code: "webshopClosed",
      data: { reason: "orderingUnavailable" },
    })
    expect(mocks.place).not.toHaveBeenCalled()
  })

  test("refuses outside a vendor's open hours", async () => {
    mocks.findForOrder.mockResolvedValue([
      { id: "p1", vendor: { name: "Acme", openHoursId: "oh1" } },
    ])
    mocks.findSchedules.mockResolvedValue([{ id: "oh1", ranges: [] }])
    await expect(
      webshopService.checkout({ shopper, form: {} }),
    ).rejects.toMatchObject({
      code: "webshopClosed",
      data: { reason: "outsideOpenHours", vendorName: "Acme" },
    })
  })

  test("orders inside the store's open hours", async () => {
    mocks.getFreshSettings.mockResolvedValue(
      settings({
        general: { openHoursId: "oh1" },
        shipping: { shippingType: "none" },
      }),
    )
    mocks.findSchedules.mockResolvedValue([{ id: "oh1", ranges: alwaysOpen }])
    await webshopService.checkout({ shopper, form: {} })
    expect(mocks.place).toHaveBeenCalled()
  })

  test("refuses a missing field the store requires", async () => {
    mocks.getFreshSettings.mockResolvedValue(
      settings({
        shipping: { shippingType: "none" },
        checkout: { requirePhone: true },
      }),
    )
    await expect(
      webshopService.checkout({ shopper, form: { customerPhone: "  " } }),
    ).rejects.toMatchObject({ code: "validation" })
  })

  test("refuses a country the store does not ship to", async () => {
    mocks.getFreshSettings.mockResolvedValue(
      settings({
        shipping: { shippingType: "delivery", shippingCountries: ["VN"] },
      }),
    )
    await expect(
      webshopService.checkout({
        shopper,
        form: {
          shippingType: "delivery",
          shippingAddress: { line1: "1 Main St", country: "US" },
        },
      }),
    ).rejects.toMatchObject({ code: "validation" })
  })

  test("does not ask for an address on pickup", async () => {
    mocks.getFreshSettings.mockResolvedValue(
      settings({
        shipping: {
          shippingType: "deliveryAndPickup",
          shippingCountries: ["VN"],
        },
      }),
    )
    await webshopService.checkout({
      shopper,
      form: { shippingType: "pickup" },
    })
    expect(mocks.place).toHaveBeenCalled()
  })
})

describe("webshopService cart", () => {
  const change = {
    workspaceId: "ws1",
    contactId: "c1",
    productId: "p1",
    variantId: null,
  }

  test("adds to the quantity already in the cart", async () => {
    await expect(
      webshopService.addToCart({ ...change, quantity: 3 }),
    ).resolves.toEqual({
      items: [{ productId: "p1", variantId: null, quantity: 5 }],
    })
    expect(mocks.upsertCart).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [{ productId: "p1", variantId: null, quantity: 5 }],
      }),
      { name: "cart-tx" },
    )
    // A tap does not price the whole cart.
    expect(mocks.quote).not.toHaveBeenCalled()
  })

  test("announces the product added, with its categories", async () => {
    mocks.findForOrder.mockResolvedValue([
      { id: "p1", name: "Shirt", categoryId: "cat1", subcategoryId: "sub1" },
    ])
    await webshopService.addToCart({ ...change, quantity: 3 })
    expect(mocks.emitCartItemChanged).toHaveBeenCalledWith(
      "ws1",
      "c1",
      {
        channel: "webshop",
        product: {
          productId: "p1",
          variantId: null,
          name: "Shirt",
          categoryIds: ["cat1", "sub1"],
        },
        quantity: 5,
        change: 3,
      },
      undefined,
    )
  })

  test("announces a removal as a negative change", async () => {
    await webshopService.setCartQuantity({ ...change, quantity: 0 })
    expect(mocks.emitCartItemChanged).toHaveBeenCalledWith(
      "ws1",
      "c1",
      expect.objectContaining({ quantity: 0, change: -2 }),
      undefined,
    )
  })

  test("refuses a product the shop does not show", async () => {
    mocks.listForShop.mockResolvedValue({ data: [], pageCount: 0 })
    await expect(
      webshopService.addToCart({ ...change, quantity: 1 }),
    ).rejects.toMatchObject({ code: "notFound" })
    expect(mocks.upsertCart).not.toHaveBeenCalled()
  })

  test("a quantity of 0 removes the line", async () => {
    await webshopService.setCartQuantity({ ...change, quantity: 0 })
    expect(mocks.upsertCart).toHaveBeenCalledWith(
      expect.objectContaining({ items: [] }),
      { name: "cart-tx" },
    )
  })

  test("setting a quantity higher also checks the shop shows the product", async () => {
    mocks.listForShop.mockResolvedValue({ data: [], pageCount: 0 })
    await expect(
      webshopService.setCartQuantity({ ...change, quantity: 5 }),
    ).rejects.toMatchObject({ code: "notFound" })
    expect(mocks.upsertCart).not.toHaveBeenCalled()
  })

  test("lowering a hidden product's line is still allowed", async () => {
    mocks.listForShop.mockResolvedValue({ data: [], pageCount: 0 })
    await webshopService.setCartQuantity({ ...change, quantity: 1 })
    expect(mocks.upsertCart).toHaveBeenCalled()
  })

  describe("variant validation", () => {
    const withVariants = () =>
      mocks.findProductDetail.mockResolvedValue({
        id: "p1",
        name: "Shirt",
        variants: [
          { id: "v1", isEnabled: true },
          { id: "v2", isEnabled: false },
        ],
      })

    test("a product with variants needs one", async () => {
      withVariants()
      await expect(
        webshopService.addToCart({ ...change, quantity: 1 }),
      ).rejects.toMatchObject({ code: "orderProductUnavailable" })
      expect(mocks.upsertCart).not.toHaveBeenCalled()
    })

    test("refuses a disabled or unknown variant", async () => {
      withVariants()
      for (const variantId of ["v2", "other-product-variant"]) {
        await expect(
          webshopService.addToCart({ ...change, variantId, quantity: 1 }),
        ).rejects.toMatchObject({ code: "orderProductUnavailable" })
      }
      expect(mocks.upsertCart).not.toHaveBeenCalled()
    })

    test("accepts an enabled variant of the product", async () => {
      withVariants()
      await webshopService.addToCart({
        ...change,
        variantId: "v1",
        quantity: 1,
      })
      expect(mocks.upsertCart).toHaveBeenCalled()
    })

    test("a product without variants refuses a variant id", async () => {
      await expect(
        webshopService.addToCart({ ...change, variantId: "v1", quantity: 1 }),
      ).rejects.toMatchObject({ code: "orderProductUnavailable" })
      expect(mocks.upsertCart).not.toHaveBeenCalled()
    })
  })

  describe("line cap", () => {
    const fullCart = Array.from({ length: 100 }, (_, index) => ({
      productId: `full${index}`,
      variantId: null,
      quantity: 1,
    }))

    test("refuses a new line past the cap", async () => {
      mocks.findCart.mockResolvedValue({ items: fullCart })
      await expect(
        webshopService.addToCart({ ...change, quantity: 1 }),
      ).rejects.toMatchObject({ code: "webshopCartFull" })
      expect(mocks.upsertCart).not.toHaveBeenCalled()
    })

    test("still grows a line already in a full cart", async () => {
      mocks.findCart.mockResolvedValue({
        items: [
          ...fullCart.slice(1),
          { productId: "p1", variantId: null, quantity: 1 },
        ],
      })
      await webshopService.addToCart({ ...change, quantity: 1 })
      expect(mocks.upsertCart).toHaveBeenCalled()
    })
  })

  describe("preview cart", () => {
    const previewChange = {
      workspaceId: "ws1",
      productId: "p1",
      variantId: null,
      quantity: 2,
      mode: "add" as const,
      maxLines: 30,
    }

    test("returns the changed lines without saving or announcing them", async () => {
      const items = await webshopService.changePreviewCart({
        ...previewChange,
        items: [{ productId: "p2", variantId: null, quantity: 1 }],
      })
      expect(items).toEqual([
        { productId: "p2", variantId: null, quantity: 1 },
        { productId: "p1", variantId: null, quantity: 2 },
      ])
      expect(mocks.upsertCart).not.toHaveBeenCalled()
    })

    test("refuses what the shop does not show, like a customer's cart", async () => {
      mocks.listForShop.mockResolvedValue({ data: [], pageCount: 0 })
      await expect(
        webshopService.changePreviewCart({ ...previewChange, items: [] }),
      ).rejects.toMatchObject({ code: "notFound" })
    })

    test("refuses a new line past its own cap", async () => {
      const full = Array.from({ length: 30 }, (_, index) => ({
        productId: `full${index}`,
        variantId: null,
        quantity: 1,
      }))
      await expect(
        webshopService.changePreviewCart({ ...previewChange, items: full }),
      ).rejects.toMatchObject({ code: "webshopCartFull" })
    })

    test("is priced like a customer's cart, for no contact", async () => {
      const items = [{ productId: "p1", variantId: null, quantity: 1 }]
      const cart = await webshopService.getPreviewCart({
        workspaceId: "ws1",
        items,
        discountCode: "SAVE10",
        shippingType: "delivery",
      })
      expect(mocks.quote).toHaveBeenCalledWith(
        expect.objectContaining({
          items,
          contactId: null,
          discountCode: "SAVE10",
          listAvailableDiscounts: true,
        }),
      )
      expect(cart.enteredDiscountCode).toBe("SAVE10")
    })
  })

  test("a WhatsApp cart keeps only the items linked to a product", async () => {
    const result = await webshopService.replaceFromInboundCart({
      workspaceId: "ws1",
      contactId: "c1",
      contactInboxId: "ci1",
      cart: {
        items: [
          { quantity: 2, product: { productId: "p1" } },
          { quantity: 1, product: null },
        ],
      } as never,
    })
    expect(mocks.upsertCart).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [{ productId: "p1", variantId: null, quantity: 2 }],
      }),
    )
    expect(result.skipped).toBe(1)
  })
})

describe("webshopService orders", () => {
  test("hides another customer's order", async () => {
    mocks.getDetail.mockResolvedValue({ id: "o1", contactId: "someone" })
    await expect(
      webshopService.getCustomerOrder({
        workspaceId: "ws1",
        contactId: "c1",
        orderId: "o1",
      }),
    ).rejects.toMatchObject({ code: "notFound" })
  })

  test("rates a completed order when the store allows it", async () => {
    mocks.getDetail.mockResolvedValue({
      id: "o1",
      contactId: "c1",
      status: "concluded",
    })
    mocks.getSettings.mockResolvedValue(
      settings({ general: { allowRateOrders: true } }),
    )
    await webshopService.rateOrder({
      workspaceId: "ws1",
      contactId: "c1",
      orderId: "o1",
      rating: 5,
      comment: " Great ",
    })
    expect(mocks.setRating).toHaveBeenCalledWith({
      workspaceId: "ws1",
      orderId: "o1",
      rating: 5,
      ratingComment: "Great",
    })
  })

  test("refuses to rate an order that is not completed", async () => {
    mocks.getDetail.mockResolvedValue({
      id: "o1",
      contactId: "c1",
      status: "accepted",
    })
    mocks.getSettings.mockResolvedValue(
      settings({ general: { allowRateOrders: true } }),
    )
    await expect(
      webshopService.rateOrder({
        workspaceId: "ws1",
        contactId: "c1",
        orderId: "o1",
        rating: 5,
      }),
    ).rejects.toMatchObject({ code: "webshopRatingNotAllowed" })
    expect(mocks.setRating).not.toHaveBeenCalled()
  })
})

describe("webshopService.buildInboundCartReply", () => {
  const input = {
    workspaceId: "ws1",
    contactId: "c1",
    contactInboxId: "ci1",
    cart: {
      note: null,
      items: [{ quantity: 2, product: { productId: "p1" } }],
    } as never,
  }

  beforeEach(() => {
    mocks.getSettings.mockResolvedValue(settings({}))
    mocks.quote.mockResolvedValue({
      currency: "USD",
      lines: [{ productId: "p1", quantity: 2 }],
      unavailable: [],
      totals: {
        subtotal: 20,
        discountTotal: 0,
        shippingTotal: 5,
        serviceFeeTotal: 1,
        taxTotal: 0,
        total: 26,
      },
    })
  })

  test("sums the cart up above a CHECK OUT link to the shop cart", async () => {
    const reply = await webshopService.buildInboundCartReply(input)
    expect(reply?.text).toContain("Number of items: 2")
    expect(reply?.text).toContain("Total:")
    expect(reply?.buttonLabel).toBe("CHECK OUT")
    expect(reply?.buttonUrl).toBe(
      "https://app.example/shop/ws1/cart?token={{shop_token}}",
    )
  })

  test("opens the store's own checkout page when it uses one", async () => {
    mocks.getSettings.mockResolvedValue(
      settings({
        checkout: {
          checkoutMode: "externalLink",
          checkoutLink: "https://pay.example/checkout",
        },
      }),
    )
    const reply = await webshopService.buildInboundCartReply(input)
    expect(reply?.buttonUrl).toBe("https://pay.example/checkout")
  })

  test("answers nothing while the store takes no orders", async () => {
    mocks.getSettings.mockResolvedValue(
      settings({ general: { orderingAvailable: false } }),
    )
    expect(await webshopService.buildInboundCartReply(input)).toBeNull()
    expect(mocks.upsertCart).not.toHaveBeenCalled()
  })

  test("answers nothing when no item is sold here", async () => {
    mocks.quote.mockResolvedValue({
      currency: "USD",
      lines: [],
      unavailable: [],
      totals: {},
    })
    expect(await webshopService.buildInboundCartReply(input)).toBeNull()
  })
})

describe("webshopService.remindAbandonedCart", () => {
  const cart = {
    id: "cart1",
    workspaceId: "ws1",
    contactId: "c1",
    contactInboxId: "ci-wa",
    lastActivityAt: new Date("2026-10-21T08:00:00Z"),
  }

  beforeEach(() => {
    mocks.findCart.mockResolvedValue({
      items: [{ productId: "p1", variantId: null, quantity: 2 }],
      lastActivityAt: new Date(cart.lastActivityAt),
    })
    mocks.getSettings.mockResolvedValue(
      settings({
        general: { abandonedCartDelayMinutes: 30, abandonedCartFlowId: "f1" },
      }),
    )
    mocks.quote.mockResolvedValue({
      currency: "USD",
      lines: [
        {
          productId: "p1",
          variantId: null,
          name: "Shirt",
          categoryId: "cat1",
          quantity: 2,
        },
      ],
      totals: { total: 20 },
      unavailable: [],
    })
    mocks.resolveContactInboxForSend.mockResolvedValue({
      conversation: {
        id: "conv1",
        contactInboxes: [
          { id: "ci-web", channel: "webchat" },
          { id: "ci-wa", channel: "whatsapp" },
        ],
      },
      contactInbox: { id: "ci-web", channel: "webchat" },
    })
  })

  test("emits cartAbandoned and runs the store's flow on the cart's channel", async () => {
    mocks.findForOrder.mockResolvedValue([
      { id: "p1", categoryId: "cat1", subcategoryId: "sub1" },
    ])
    await expect(webshopService.remindAbandonedCart(cart)).resolves.toBe(
      "reminded",
    )
    // Priced for its totals only: the codes a cart page offers are skipped.
    expect(mocks.quote).toHaveBeenCalledWith(
      expect.objectContaining({ listAvailableDiscounts: false }),
    )
    expect(mocks.emitCartAbandoned).toHaveBeenCalledWith(
      "ws1",
      "c1",
      expect.objectContaining({
        channel: "whatsapp",
        conversationId: "conv1",
        itemCount: 2,
        total: 20,
        items: [
          expect.objectContaining({
            productId: "p1",
            categoryIds: ["cat1", "sub1"],
          }),
        ],
      }),
      "ci-wa",
    )
    expect(mocks.queueAdd).toHaveBeenCalledWith(
      "sendFlow",
      {
        type: "sendFlow",
        data: {
          conversationId: "conv1",
          contactInboxId: "ci-wa",
          flowId: "f1",
        },
      },
      { jobId: `abandoned-cart-flow-cart1-${cart.lastActivityAt.getTime()}` },
    )
  })

  test("without a flow only emits the event", async () => {
    mocks.getSettings.mockResolvedValue(
      settings({
        general: { abandonedCartDelayMinutes: 30, abandonedCartFlowId: null },
      }),
    )
    await webshopService.remindAbandonedCart(cart)
    expect(mocks.emitCartAbandoned).toHaveBeenCalled()
    expect(mocks.queueAdd).not.toHaveBeenCalled()
  })

  test("a contact without a conversation still gets the event, no flow", async () => {
    const { notFoundException } = await import("../../errors")
    mocks.resolveContactInboxForSend.mockRejectedValue(
      notFoundException("Conversation not found"),
    )
    await webshopService.remindAbandonedCart(cart)
    expect(mocks.emitCartAbandoned).toHaveBeenCalledWith(
      "ws1",
      "c1",
      expect.objectContaining({ channel: null, conversationId: null }),
      undefined,
    )
    expect(mocks.queueAdd).not.toHaveBeenCalled()
  })

  test("nothing when the customer changed the cart after it was claimed", async () => {
    mocks.findCart.mockResolvedValue({
      items: [{ productId: "p1", variantId: null, quantity: 3 }],
      lastActivityAt: new Date("2026-10-21T09:00:00Z"),
    })
    await expect(webshopService.remindAbandonedCart(cart)).resolves.toBe(
      "stale",
    )
    expect(mocks.emitCartAbandoned).not.toHaveBeenCalled()
    expect(mocks.queueAdd).not.toHaveBeenCalled()
  })

  test("nothing once the store turned the reminder off", async () => {
    mocks.getSettings.mockResolvedValue(
      settings({ general: { abandonedCartDelayMinutes: null } }),
    )
    await expect(webshopService.remindAbandonedCart(cart)).resolves.toBe(
      "disabled",
    )
    expect(mocks.emitCartAbandoned).not.toHaveBeenCalled()
  })

  test("nothing when no item can be ordered any more", async () => {
    mocks.quote.mockResolvedValue({
      currency: "USD",
      lines: [],
      totals: {},
      unavailable: [{ productId: "p1", quantity: 1 }],
    })
    await expect(webshopService.remindAbandonedCart(cart)).resolves.toBe(
      "empty",
    )
    expect(mocks.emitCartAbandoned).not.toHaveBeenCalled()
  })
})
