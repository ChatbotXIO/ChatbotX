import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listPublished: vi.fn(),
  getTenantSettings: vi.fn(),
}))

vi.mock("server-only", () => ({}))
vi.mock("@chatbotx.io/business", () => ({
  templateStoreService: { listPublished: mocks.listPublished },
  buildTemplateSharePath: (input: { templateId: string; shareToken: string }) =>
    `/t/template?id=${input.templateId}&key=${input.shareToken}`,
}))
vi.mock("@/features/tenant/utils", () => ({
  getTenantSettings: mocks.getTenantSettings,
}))

import { loadStoreCatalog } from "@/features/template-store/queries/load-store-catalog"

const published = (overrides: Record<string, unknown> = {}) => ({
  templateId: "11",
  name: "Welcome flow",
  description: "A welcome flow",
  imageUrl: "templates/cover.png",
  publisherName: "Acme",
  categoryIds: ["5"],
  shareToken: "tok-11",
  shareUrl: "https://app.example.test/t/template?id=11&key=tok-11",
  ...overrides,
})

describe("loadStoreCatalog", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getTenantSettings.mockResolvedValue({
      name: "Acme Bots",
      storageUrl: "https://files.example.test",
      faviconUrl: "https://app.example.test/favicon.png",
    })
  })

  test("reads the store of the given tenant once and the branding once, however many templates", async () => {
    mocks.listPublished.mockResolvedValue({
      categories: [{ id: "5", name: "Flows" }],
      templates: [
        published(),
        published({ templateId: "12", shareToken: "tok-12" }),
        published({ templateId: "13", shareToken: "tok-13" }),
      ],
    })

    const catalog = await loadStoreCatalog("777")

    expect(mocks.listPublished).toHaveBeenCalledTimes(1)
    expect(mocks.listPublished).toHaveBeenCalledWith({ tenantId: "777" })
    expect(mocks.getTenantSettings).toHaveBeenCalledTimes(1)
    expect(catalog.templates).toHaveLength(3)
  })

  test("maps a row to a card with a relative link, the cover from storage and the tenant name", async () => {
    mocks.listPublished.mockResolvedValue({
      categories: [{ id: "5", name: "Flows" }],
      templates: [published()],
    })

    const catalog = await loadStoreCatalog("777")

    expect(catalog.tenantName).toBe("Acme Bots")
    expect(catalog.categories).toEqual([{ id: "5", name: "Flows" }])
    expect(catalog.templates).toEqual([
      {
        templateId: "11",
        name: "Welcome flow",
        publisherName: "Acme",
        description: "A welcome flow",
        imageUrl: "https://files.example.test/templates/cover.png",
        href: "/t/template?id=11&key=tok-11",
        categoryIds: ["5"],
      },
    ])
  })

  test("a template without a cover shows the tenant icon", async () => {
    mocks.listPublished.mockResolvedValue({
      categories: [],
      templates: [published({ imageUrl: null })],
    })

    const catalog = await loadStoreCatalog("777")

    expect(catalog.templates[0].imageUrl).toBe(
      "https://app.example.test/favicon.png",
    )
  })

  test("an empty store gives an empty catalog and still names the tenant", async () => {
    mocks.listPublished.mockResolvedValue({ categories: [], templates: [] })

    expect(await loadStoreCatalog("777")).toEqual({
      tenantName: "Acme Bots",
      categories: [],
      templates: [],
    })
  })

  test("a failing store read rejects, so the caller decides how to degrade", async () => {
    mocks.listPublished.mockRejectedValue(new Error("db down"))

    await expect(loadStoreCatalog("777")).rejects.toThrow("db down")
  })
})

describe("loadStoreCatalog card links", () => {
  test("a caller can make the cards open somewhere other than the share page", async () => {
    mocks.getTenantSettings.mockResolvedValue({
      name: "Acme Bots",
      storageUrl: "https://files.example.test",
      faviconUrl: "https://app.example.test/favicon.png",
    })
    mocks.listPublished.mockResolvedValue({
      categories: [],
      templates: [published()],
    })

    const catalog = await loadStoreCatalog(
      "777",
      (template) => `/?tab=templates&key=${template.shareToken}`,
    )

    expect(catalog.templates[0].href).toBe("/?tab=templates&key=tok-11")
  })
})
