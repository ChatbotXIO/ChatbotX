import { ECOMMERCE_SETTINGS_DEFAULTS } from "@chatbotx.io/database/partials"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  findForUpdate: vi.fn(),
  insertIfMissing: vi.fn(),
  upsert: vi.fn(),
  flowExists: vi.fn(),
  openHoursExists: vi.fn(),
  invalidate: vi.fn(),
  audit: vi.fn(),
  listProviders: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: (run: (tx: unknown) => unknown) => run({ name: "tx" }),
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: (...args: unknown[]) => mocks.invalidate(...args),
  withCache: (_key: string, fn: () => unknown) => fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  ecommerceSettingsRepository: {
    find: (...args: unknown[]) => mocks.find(...args),
    findForUpdate: (...args: unknown[]) => mocks.findForUpdate(...args),
    insertIfMissing: (...args: unknown[]) => mocks.insertIfMissing(...args),
    upsert: (...args: unknown[]) => mocks.upsert(...args),
  },
  paymentProviderRepository: {
    listByWorkspace: (...args: unknown[]) => mocks.listProviders(...args),
  },
}))

vi.mock("../../ecommerce-open-hours/service", () => ({
  ecommerceOpenHoursService: {
    assertBelongsToWorkspace: (...args: unknown[]) =>
      mocks.openHoursExists(...args),
  },
}))

vi.mock("../../flow/service", () => ({
  flowService: { exists: (...args: unknown[]) => mocks.flowExists(...args) },
}))

vi.mock("../../audit/dispatcher", () => ({
  dispatchAuditRecord: (...args: unknown[]) => mocks.audit(...args),
}))

const { ecommerceSettingsService } = await import("../service")

beforeEach(() => {
  vi.clearAllMocks()
  mocks.find.mockResolvedValue(undefined)
  mocks.findForUpdate.mockResolvedValue(undefined)
  mocks.upsert.mockResolvedValue({})
  mocks.flowExists.mockResolvedValue(true)
  mocks.listProviders.mockResolvedValue([])
})

const flattenSettings = (
  settings: typeof ECOMMERCE_SETTINGS_DEFAULTS,
): Record<string, unknown> => ({
  ...settings.general,
  ...settings.payments,
  ...settings.shipping,
  ...settings.checkout,
})

describe("ecommerceSettingsService", () => {
  test("answers with the defaults until the workspace saves", async () => {
    await expect(ecommerceSettingsService.get("ws1")).resolves.toEqual(
      ECOMMERCE_SETTINGS_DEFAULTS,
    )
  })

  test("merges a partial group into the defaults and writes every column", async () => {
    const saved = await ecommerceSettingsService.update({
      workspaceId: "ws1",
      patch: { payments: { currency: "vnd", currencySymbol: "₫" } },
    })

    expect(saved.payments).toEqual({
      ...ECOMMERCE_SETTINGS_DEFAULTS.payments,
      currency: "VND",
      currencySymbol: "₫",
    })
    const [{ values }] = mocks.upsert.mock.calls[0] as [
      { values: Record<string, unknown> },
    ]
    expect(values).toMatchObject({
      currency: "VND",
      openHoursId: null,
      abandonedCartDelayMinutes: null,
      productButtons: ECOMMERCE_SETTINGS_DEFAULTS.general.productButtons,
      shippingCountries: [],
      requireName: true,
    })
    expect(mocks.invalidate).toHaveBeenCalledWith(["ecommerce-settings:ws1"])
  })

  test("needs a link for the external link checkout", async () => {
    await expect(
      ecommerceSettingsService.update({
        workspaceId: "ws1",
        patch: { checkout: { checkoutMode: "externalLink" } },
      }),
    ).rejects.toMatchObject({ code: "validation", field: "checkoutLink" })
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  test("needs a flow of this workspace for the flow checkout", async () => {
    mocks.flowExists.mockResolvedValue(false)
    await expect(
      ecommerceSettingsService.update({
        workspaceId: "ws1",
        patch: { checkout: { checkoutMode: "flow", checkoutFlowId: "99" } },
      }),
    ).rejects.toMatchObject({ field: "checkoutFlowId" })
    expect(mocks.flowExists).toHaveBeenCalledWith("ws1", "99")
  })

  test("needs a flow for the flow order confirmation", async () => {
    await expect(
      ecommerceSettingsService.update({
        workspaceId: "ws1",
        patch: { checkout: { orderConfirmationMode: "flow" } },
      }),
    ).rejects.toMatchObject({
      code: "validation",
      field: "orderConfirmationFlowId",
    })
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  test("needs a flow of this workspace for the order confirmation", async () => {
    mocks.flowExists.mockResolvedValue(false)
    await expect(
      ecommerceSettingsService.update({
        workspaceId: "ws1",
        patch: {
          checkout: {
            orderConfirmationMode: "flow",
            orderConfirmationFlowId: "99",
          },
        },
      }),
    ).rejects.toMatchObject({ field: "orderConfirmationFlowId" })
    expect(mocks.flowExists).toHaveBeenCalledWith("ws1", "99")
  })

  test("keeps the default shipping country inside the shipping countries", async () => {
    await expect(
      ecommerceSettingsService.update({
        workspaceId: "ws1",
        patch: {
          shipping: {
            shippingCountries: ["vn", "th"],
            defaultShippingCountry: "us",
          },
        },
      }),
    ).rejects.toMatchObject({ field: "defaultShippingCountry" })
  })

  test("needs an open-hours schedule of this workspace", async () => {
    mocks.openHoursExists.mockRejectedValue(
      Object.assign(new Error("missing"), { code: "notFound" }),
    )
    await expect(
      ecommerceSettingsService.update({
        workspaceId: "ws1",
        patch: { general: { openHoursId: "7" } },
      }),
    ).rejects.toMatchObject({ code: "notFound" })
    expect(mocks.openHoursExists).toHaveBeenCalledWith({
      workspaceId: "ws1",
      openHoursId: "7",
    })
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  test("keeps product buttons in one order whatever order they come in", async () => {
    const saved = await ecommerceSettingsService.update({
      workspaceId: "ws1",
      patch: { general: { productButtons: ["save", "addToCart"] } },
    })
    expect(saved.general.productButtons).toEqual(["addToCart", "save"])
  })

  test("refuses an abandoned-cart delay the settings page does not offer", async () => {
    await expect(
      ecommerceSettingsService.update({
        workspaceId: "ws1",
        patch: { general: { abandonedCartDelayMinutes: 7 } },
      }),
    ).rejects.toThrow()
  })

  test.each([
    "pickup",
    "deliveryAndPickup",
  ] as const)("needs a store address for %s", async (shippingType) => {
    await expect(
      ecommerceSettingsService.update({
        workspaceId: "ws1",
        patch: { shipping: { shippingType } },
      }),
    ).rejects.toMatchObject({ field: "storeAddress" })
  })

  test("needs a store address for pickup", async () => {
    await expect(
      ecommerceSettingsService.update({
        workspaceId: "ws1",
        patch: { shipping: { shippingType: "pickup" } },
      }),
    ).rejects.toMatchObject({ field: "storeAddress" })
  })

  test("saves another group when the stored checkout flow was deleted", async () => {
    mocks.findForUpdate.mockResolvedValue({
      ...flattenSettings(ECOMMERCE_SETTINGS_DEFAULTS),
      checkoutMode: "flow",
      checkoutFlowId: null,
      orderConfirmationMode: "flow",
      orderConfirmationFlowId: null,
    })
    const saved = await ecommerceSettingsService.update({
      workspaceId: "ws1",
      patch: { payments: { currency: "usd" } },
    })
    expect(saved.payments.currency).toBe("USD")
    expect(mocks.upsert).toHaveBeenCalled()
    expect(mocks.flowExists).not.toHaveBeenCalled()
  })

  test("still refuses a flow mode patch that leaves the flow empty", async () => {
    mocks.findForUpdate.mockResolvedValue({
      ...flattenSettings(ECOMMERCE_SETTINGS_DEFAULTS),
      checkoutMode: "flow",
      checkoutFlowId: null,
    })
    await expect(
      ecommerceSettingsService.update({
        workspaceId: "ws1",
        patch: { checkout: { checkoutMode: "flow" } },
      }),
    ).rejects.toMatchObject({ field: "checkoutFlowId" })
  })

  test("creates and locks the row before merging, in one transaction", async () => {
    await ecommerceSettingsService.update({
      workspaceId: "ws1",
      patch: { payments: { currency: "usd" } },
    })
    expect(mocks.insertIfMissing).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws1" }),
      { name: "tx" },
    )
    expect(mocks.findForUpdate).toHaveBeenCalledWith("ws1", { name: "tx" })
    expect(mocks.upsert).toHaveBeenCalledWith(expect.anything(), {
      name: "tx",
    })
  })
})

describe("ecommerceSettingsService — online payment methods", () => {
  test("Stripe or PayPal can only be offered once connected", async () => {
    await expect(
      ecommerceSettingsService.update({
        workspaceId: "ws1",
        patch: { payments: { paymentMethods: ["cod", "stripe"] } },
      }),
    ).rejects.toMatchObject({
      code: "paymentProviderNotConnected",
      data: { provider: "stripe" },
    })
    expect(mocks.upsert).not.toHaveBeenCalled()

    mocks.listProviders.mockResolvedValue([{ provider: "stripe" }])
    await ecommerceSettingsService.update({
      workspaceId: "ws1",
      patch: { payments: { paymentMethods: ["cod", "stripe"] } },
    })
    expect(mocks.upsert).toHaveBeenCalled()
  })

  test("PayPal is refused in a currency it does not take, whichever field changes", async () => {
    mocks.listProviders.mockResolvedValue([{ provider: "paypal" }])
    await expect(
      ecommerceSettingsService.update({
        workspaceId: "ws1",
        patch: { payments: { paymentMethods: ["paypal"], currency: "VND" } },
      }),
    ).rejects.toMatchObject({
      code: "paymentCurrencyUnsupported",
      data: { provider: "paypal", currency: "VND" },
    })

    mocks.findForUpdate.mockResolvedValue({
      ...flattenSettings(ECOMMERCE_SETTINGS_DEFAULTS),
      paymentMethods: ["paypal"],
    })
    await expect(
      ecommerceSettingsService.update({
        workspaceId: "ws1",
        patch: { payments: { currency: "VND" } },
      }),
    ).rejects.toMatchObject({ code: "paymentCurrencyUnsupported" })
  })

  test("dropping a disconnected provider brings cash on delivery back when nothing is left", async () => {
    mocks.findForUpdate.mockResolvedValue({
      ...flattenSettings(ECOMMERCE_SETTINGS_DEFAULTS),
      paymentMethods: ["stripe"],
    })
    await ecommerceSettingsService.dropPaymentMethod(
      { workspaceId: "ws1", method: "stripe" },
      { name: "tx" } as never,
    )
    expect(mocks.upsert).toHaveBeenCalledWith(
      {
        workspaceId: "ws1",
        values: expect.objectContaining({ paymentMethods: ["cod"] }),
      },
      { name: "tx" },
    )
  })
})
