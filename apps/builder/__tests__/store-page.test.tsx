import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  resolveTenantByDomain: vi.fn(),
  getDomainFromHeader: vi.fn(),
  loadStoreCatalog: vi.fn(),
  StoreCatalog: vi.fn(() => null),
}))

vi.mock("@chatbotx.io/auth/tenant", () => ({
  resolveTenantByDomain: mocks.resolveTenantByDomain,
}))
vi.mock("@/lib/domain", () => ({
  getDomainFromHeader: mocks.getDomainFromHeader,
}))
vi.mock("@/features/tenant/utils", () => ({
  getTenantSettings: vi.fn(async () => ({ name: "Acme" })),
}))
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}))
vi.mock("@/features/template-store/queries/load-store-catalog", () => ({
  loadStoreCatalog: mocks.loadStoreCatalog,
}))
vi.mock("@/features/template-store/components/store-catalog", () => ({
  StoreCatalog: mocks.StoreCatalog,
}))

import StorePage from "@/app/store/page"

const catalog = {
  tenantName: "Acme Bots",
  categories: [{ id: "5", name: "Flows" }],
  templates: [],
}

describe("/store page", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getDomainFromHeader.mockResolvedValue("store.acme.test")
    mocks.resolveTenantByDomain.mockResolvedValue("tenant-9")
    mocks.loadStoreCatalog.mockResolvedValue(catalog)
  })

  test("shows the store of the tenant whose domain is being visited", async () => {
    await StorePage()

    expect(mocks.resolveTenantByDomain).toHaveBeenCalledWith("store.acme.test")
    expect(mocks.loadStoreCatalog).toHaveBeenCalledTimes(1)
    expect(mocks.loadStoreCatalog).toHaveBeenCalledWith("tenant-9")
  })

  test("renders the catalog on the page layout, as it always did", async () => {
    const element = (await StorePage()) as {
      type: unknown
      props: Record<string, unknown>
    }

    expect(element.type).toBe(mocks.StoreCatalog)
    expect(element.props).toEqual({
      categories: catalog.categories,
      templates: catalog.templates,
      tenantName: "Acme Bots",
    })
    // No `layout` prop: the default (page) layout, so /store looks the same.
    expect("layout" in element.props).toBe(false)
  })
})
