// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  findWorkspaceByTokenHash,
  isWorkspaceScheduledForDeletion,
  getAccessState,
  isAtLimit,
  assertApiNotRateLimited,
} = vi.hoisted(() => ({
  findWorkspaceByTokenHash: vi.fn(),
  isWorkspaceScheduledForDeletion: vi.fn().mockReturnValue(false),
  getAccessState: vi.fn().mockResolvedValue({ blocked: false }),
  isAtLimit: vi.fn().mockResolvedValue(false),
  assertApiNotRateLimited: vi.fn().mockResolvedValue(undefined),
}))

const orderService = { list: vi.fn() }
const vendorService = { list: vi.fn() }
const ecommerceSettingsService = { get: vi.fn() }
const ecommerceOpenHoursService = { list: vi.fn() }

vi.mock("@chatbotx.io/business", () => ({
  workspaceApiTokenService: { findWorkspaceByTokenHash },
  isWorkspaceScheduledForDeletion,
  userQuotaService: { getAccessState },
  quotaEnforcementService: { isAtLimit },
  orderService,
  vendorService,
  ecommerceSettingsService,
  ecommerceOpenHoursService,
  contactService: {},
  webshopService: {},
  discountCodeService: {},
  ecommerceAnalyticsService: {},
  createWebshopLink: vi.fn(),
}))

vi.mock("@/features/ecommerce-settings/lib/get-ecommerce-settings", () => ({
  getEcommerceSettings: vi.fn(),
}))

vi.mock("@/lib/log", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}))

vi.mock("@/lib/rate-limit/api-rate-limit", () => ({
  assertApiNotRateLimited,
}))

vi.mock("@/lib/rate-limit/guest-rate-limit", () => ({
  getGuestClientIp: () => "203.0.113.9",
}))

vi.mock("@/env", () => ({ isCloud: () => true }))

vi.mock("@/middlewares/auth", () => ({
  authMiddleware: vi.fn(),
}))

const { call } = await import("@orpc/server")
const { ordersPublicRouter } = await import("../src/features/orders/api/public")
const { productVendorsPublicRouter } = await import(
  "../src/features/product-vendors/api/public"
)
const { ecommerceSettingsPublicRouter } = await import(
  "../src/features/ecommerce-settings/api/public"
)
const { openHoursPublicRouter } = await import(
  "../src/features/ecommerce-open-hours/api/public"
)

const { webshopPublicRouter, cartsPublicRouter } = await import(
  "../src/features/webshop/api/public"
)

const { ecommerceAnalyticsPublicRouter } = await import(
  "../src/features/ecommerce-analytics/api/public"
)
const { discountCodesPublicRouter } = await import(
  "../src/features/discount-codes/api/public"
)

const TOKEN = "cbx_ws_fixture"

const authResult = (scopes: string[] | null) => ({
  workspace: { id: "ws-1", ownerId: "owner-1" },
  apiToken: { id: "token-1", permission: "full" as const, scopes },
})

const context = () => ({
  context: { headers: new Headers({ Authorization: `Bearer ${TOKEN}` }) },
})

beforeEach(() => {
  vi.clearAllMocks()
  isWorkspaceScheduledForDeletion.mockReturnValue(false)
  getAccessState.mockResolvedValue({ blocked: false })
  isAtLimit.mockResolvedValue(false)
  assertApiNotRateLimited.mockResolvedValue(undefined)
})

describe("ecommerce public routers sit behind the ecommerce scope", () => {
  const routes = [
    ["orders.list", () => call(ordersPublicRouter.list, {}, context())],
    [
      "productVendors.list",
      () => call(productVendorsPublicRouter.list, {}, context()),
    ],
    [
      "ecommerceSettings.get",
      () => call(ecommerceSettingsPublicRouter.get, {}, context()),
    ],
    ["openHours.list", () => call(openHoursPublicRouter.list, {}, context())],
    ["webshop.getLink", () => call(webshopPublicRouter.getLink, {}, context())],
    [
      "ecommerceAnalytics.get",
      () => call(ecommerceAnalyticsPublicRouter.get, {}, context()),
    ],
    [
      "discountCodes.list",
      () => call(discountCodesPublicRouter.list, {}, context()),
    ],
    [
      "carts.get",
      () => call(cartsPublicRouter.get, { identifier: "id:1" }, context()),
    ],
  ] as const

  test.each(routes)("%s denies a contacts-scoped token", async (_, invoke) => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["contacts"]))
    await expect(invoke()).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Token is not authorized for the 'ecommerce' scope",
    })
  })

  test("an ecommerce-scoped token lists orders of its own workspace", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["ecommerce"]))
    orderService.list.mockResolvedValue({ data: [], pageCount: 1 })

    await expect(
      call(ordersPublicRouter.list, { status: ["pending"] }, context()),
    ).resolves.toEqual({ data: [], pageCount: 1 })
    expect(orderService.list).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1", status: ["pending"] }),
    )
  })
})
