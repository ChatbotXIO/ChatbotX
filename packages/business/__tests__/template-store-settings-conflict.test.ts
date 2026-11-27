// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  insertOrFind: vi.fn(),
  countProductsInOtherCurrency: vi.fn(async () => 0),
  prepareTemplateValues: vi.fn(async () => ({})),
  warn: vi.fn(),
  track: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({ db: {} }))
vi.mock("@chatbotx.io/database/repositories", () => ({
  ecommerceSettingsRepository: {
    find: mocks.find,
    insertOrFind: mocks.insertOrFind,
    countProductsInOtherCurrency: mocks.countProductsInOtherCurrency,
  },
}))
vi.mock("../src/ecommerce-settings/service", () => ({
  ecommerceSettingsService: {
    prepareTemplateValues: mocks.prepareTemplateValues,
  },
}))

const { storeSettingsAdapter } = await import(
  "../src/template/adapters/store-settings"
)

const entry = {
  sourceId: "s1",
  general: {
    openHoursId: null,
    abandonedCartFlowId: null,
  },
  payments: { currency: "usd", currencyPosition: "left", currencySymbol: "$" },
  shipping: {},
  checkout: {
    checkoutFlowId: null,
    orderConfirmationFlowId: null,
    checkoutMode: "default",
    orderConfirmationMode: "default",
  },
}

const ctx = () =>
  ({
    tx: {},
    workspaceId: "ws-target",
    idMaps: {},
    warn: mocks.warn,
    track: mocks.track,
  }) as never

beforeEach(() => {
  vi.clearAllMocks()
})

describe("store settings install", () => {
  test("a row created by another writer after the check is kept, not claimed", async () => {
    mocks.find.mockResolvedValue(undefined)
    mocks.insertOrFind.mockResolvedValue({
      row: { id: "theirs" },
      created: false,
    })

    await storeSettingsAdapter.insert(ctx(), [entry as never])

    expect(mocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ entityKind: "storeSettingsKept" }),
    )
    expect(mocks.track).toHaveBeenCalledWith(
      expect.objectContaining({ resourceId: "theirs", wasExisting: true }),
    )
  })

  test("a row this install inserted is claimed", async () => {
    mocks.find.mockResolvedValue(undefined)
    mocks.insertOrFind.mockResolvedValue({ row: { id: "mine" }, created: true })

    await storeSettingsAdapter.insert(ctx(), [entry as never])

    expect(mocks.warn).not.toHaveBeenCalled()
    expect(mocks.track).toHaveBeenCalledWith(
      expect.objectContaining({ resourceId: "mine", wasExisting: false }),
    )
  })
})
